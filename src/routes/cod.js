const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { requireAdmin } = require('../middleware/auth');
const { restockCommittedStock } = require('../utils/orders');
const { sendOrderStatusEmail } = require('../utils/email');

const router = express.Router();
router.use(requireAdmin);

const BUCKETS = {
  awaiting_dispatch: { fulfillmentStatus: 'processing', paymentStatus: 'pending' },
  in_transit: { fulfillmentStatus: 'shipped', paymentStatus: 'pending' },
  to_collect: { fulfillmentStatus: 'delivered', paymentStatus: 'pending' },
  collected: { paymentStatus: 'captured', codRemittedAt: null },
  remitted: { paymentStatus: 'captured', codRemittedAt: { $ne: null } },
  failed: { fulfillmentStatus: 'cancelled' }
};

function bucketOf(order) {
  if (order.fulfillmentStatus === 'cancelled') return 'failed';
  if (order.paymentStatus === 'captured') return order.codRemittedAt ? 'remitted' : 'collected';
  if (order.fulfillmentStatus === 'processing') return 'awaiting_dispatch';
  if (order.fulfillmentStatus === 'shipped') return 'in_transit';
  if (order.fulfillmentStatus === 'delivered') return 'to_collect';
  return 'other';
}

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isId = id => mongoose.Types.ObjectId.isValid(String(id || ''));
const adminName = req => String(req.admin?.email || req.admin?.sub || req.admin?.id || 'admin').slice(0, 160);

function fireEmail(order, status) {
  Promise.resolve()
    .then(() => sendOrderStatusEmail(order, status))
    .catch(err => console.error(`COD ${status} email failed for ${order.orderNumber}:`, err.message));
}

function withBucket(order) {
  const plain = typeof order.toObject === 'function' ? order.toObject() : order;
  return { ...plain, codBucket: bucketOf(plain) };
}

router.get('/summary', async (req, res, next) => {
  try {
    const rows = await Order.find({ paymentMethod: 'cod' })
      .select('total fulfillmentStatus paymentStatus codRemittedAt codCollectedAmount')
      .lean();
    const buckets = {};
    for (const key of Object.keys(BUCKETS)) buckets[key] = { count: 0, amount: 0, collected: 0 };

    let shortfall = 0;
    for (const row of rows) {
      const key = bucketOf(row);
      if (!buckets[key]) continue;
      buckets[key].count += 1;
      buckets[key].amount += Number(row.total) || 0;
      if (row.paymentStatus === 'captured') {
        const got = row.codCollectedAmount ?? row.total;
        buckets[key].collected += Number(got) || 0;
        shortfall += (Number(row.total) || 0) - (Number(got) || 0);
      }
    }
    for (const bucket of Object.values(buckets)) {
      bucket.amount = round2(bucket.amount);
      bucket.collected = round2(bucket.collected);
    }
    const settled = buckets.failed.count + buckets.collected.count + buckets.remitted.count + buckets.to_collect.count;
    res.json({
      buckets,
      totalOrders: rows.length,
      cashOutstanding: round2(buckets.in_transit.amount + buckets.to_collect.amount),
      awaitingRemittance: buckets.collected.collected,
      remitted: buckets.remitted.collected,
      shortfall: round2(shortfall),
      failureRate: settled ? Math.round((buckets.failed.count / settled) * 1000) / 10 : null,
      needsAttention: buckets.in_transit.count + buckets.to_collect.count
    });
  } catch (e) { next(e); }
});

router.get('/orders', async (req, res, next) => {
  try {
    const bucket = String(req.query.bucket || 'all').trim();
    const q = String(req.query.q || '').trim().slice(0, 120);
    const query = { paymentMethod: 'cod' };
    if (bucket !== 'all') {
      if (!BUCKETS[bucket]) return res.status(400).json({ error: 'Invalid COD filter' });
      Object.assign(query, BUCKETS[bucket]);
    }
    if (q) {
      const search = new RegExp(q.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { orderNumber: search }, { 'customer.name': search }, { 'customer.email': search },
        { 'customer.phone': search }, { 'shipping.city': search }, { 'shipping.pin': search },
        { trackingNumber: search }, { codRemittanceRef: search }
      ];
    }
    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json(orders.map(withBucket));
  } catch (e) { next(e); }
});

router.post('/orders/:id/collect', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid order id' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentMethod !== 'cod') return res.status(400).json({ error: 'This is not a Cash on Delivery order' });
    if (order.paymentStatus === 'captured') return res.json({ success: true, alreadyCollected: true, order: withBucket(order) });
    if (!['shipped', 'delivered'].includes(order.fulfillmentStatus)) {
      return res.status(409).json({ error: 'Cash can only be recorded after the order has been shipped' });
    }

    const note = String(req.body.note || '').trim().slice(0, 300);
    const rawAmount = req.body.amount;
    const amount = rawAmount === undefined || rawAmount === null || rawAmount === '' ? round2(order.total) : round2(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter the amount of cash collected' });
    if (amount > round2(order.total)) return res.status(400).json({ error: 'Collected amount cannot be more than the order total' });
    if (amount !== round2(order.total) && !note) return res.status(400).json({ error: 'Add a note explaining why the amount differs from the order total' });

    const now = new Date();
    const wasShipped = order.fulfillmentStatus === 'shipped';
    const set = {
      paymentStatus: 'captured', paidAt: now, codCollectedAt: now,
      codCollectedAmount: amount, codCollectionNote: note, codCollectedBy: adminName(req)
    };
    if (wasShipped) {
      set.fulfillmentStatus = 'delivered';
      set.deliveredAt = now;
    }
    const updated = await Order.findOneAndUpdate({
      _id: order._id, paymentMethod: 'cod', paymentStatus: 'pending',
      fulfillmentStatus: { $in: ['shipped', 'delivered'] }
    }, { $set: set }, { new: true });

    if (!updated) {
      const fresh = await Order.findById(order._id);
      if (fresh && fresh.paymentStatus === 'captured') return res.json({ success: true, alreadyCollected: true, order: withBucket(fresh) });
      return res.status(409).json({ error: 'This order changed while you were working. Refresh and try again.' });
    }
    if (wasShipped) fireEmail(updated, 'delivered');
    res.json({ success: true, order: withBucket(updated) });
  } catch (e) { next(e); }
});

router.post('/orders/:id/failed', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid order id' });
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (reason.length < 3) return res.status(400).json({ error: 'Enter a reason for the failed delivery' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentMethod !== 'cod') return res.status(400).json({ error: 'This is not a Cash on Delivery order' });
    if (order.paymentStatus === 'captured') return res.status(409).json({ error: 'Cash was already collected for this order. Undo the collection first.' });

    const now = new Date();
    const updated = await Order.findOneAndUpdate({
      _id: order._id, paymentMethod: 'cod', paymentStatus: 'pending',
      fulfillmentStatus: { $in: ['processing', 'shipped'] }
    }, {
      $set: {
        fulfillmentStatus: 'cancelled', paymentStatus: 'failed', cancelledAt: now,
        codFailedAt: now, codFailureReason: reason
      }
    }, { new: true });

    if (!updated) {
      const fresh = await Order.findById(order._id);
      if (fresh && fresh.paymentMethod === 'cod' && fresh.codFailedAt && fresh.stockCommittedAt && !fresh.stockRestockedAt) {
        await restockCommittedStock(fresh);
        return res.json({ success: true, resumed: true, order: withBucket(await Order.findById(order._id)) });
      }
      if (fresh && fresh.codFailedAt) return res.json({ success: true, alreadyFailed: true, order: withBucket(fresh) });
      return res.status(409).json({ error: 'Only processing or shipped COD orders can be marked as failed' });
    }
    if (updated.stockCommittedAt) await restockCommittedStock(updated);
    fireEmail(updated, 'cancelled');
    const finalOrder = await Order.findById(updated._id);
    res.json({ success: true, order: withBucket(finalOrder || updated) });
  } catch (e) { next(e); }
});

router.post('/orders/:id/undo-collection', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid order id' });
    const updated = await Order.findOneAndUpdate({
      _id: req.params.id, paymentMethod: 'cod', paymentStatus: 'captured', codRemittedAt: null
    }, {
      $set: { paymentStatus: 'pending' },
      $unset: { paidAt: '', codCollectedAt: '', codCollectedAmount: '', codCollectionNote: '', codCollectedBy: '' }
    }, { new: true });

    if (!updated) {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.codRemittedAt) return res.status(409).json({ error: 'This cash has already been remitted and cannot be undone' });
      return res.status(409).json({ error: 'Cash has not been recorded for this order' });
    }
    res.json({ success: true, order: withBucket(updated) });
  } catch (e) { next(e); }
});

router.post('/remit', async (req, res, next) => {
  try {
    const reference = String(req.body.reference || '').trim().slice(0, 120);
    if (reference.length < 3) return res.status(400).json({ error: 'Enter the remittance reference (for example the bank UTR)' });
    const ids = [...new Set((Array.isArray(req.body.orderIds) ? req.body.orderIds : []).map(String))];
    if (!ids.length) return res.status(400).json({ error: 'Select at least one collected order' });
    if (ids.length > 200) return res.status(400).json({ error: 'Select at most 200 orders at a time' });
    if (!ids.every(isId)) return res.status(400).json({ error: 'One or more order ids are invalid' });

    const result = await Order.updateMany({
      _id: { $in: ids }, paymentMethod: 'cod', paymentStatus: 'captured', codRemittedAt: null
    }, { $set: { codRemittedAt: new Date(), codRemittanceRef: reference } });
    const remitted = result.modifiedCount ?? result.nModified ?? 0;
    res.json({ success: true, requested: ids.length, remitted, skipped: ids.length - remitted });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.bucketOf = bucketOf;
module.exports.BUCKETS = BUCKETS;
