const express = require('express');
const Order = require('../models/Order');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(requireAdmin);

function bucket(o) {
  if (o.paymentMethod !== 'razorpay') return 'attention';
  if (o.paymentStatus === 'refunded' || o.fulfillmentStatus === 'refunded') return 'refunded';
  if (o.paymentStatus === 'captured' && o.razorpayPaymentId) return 'eligible';
  return 'attention';
}

router.get('/summary', async (req, res, next) => {
  try {
    const rows = await Order.find({ paymentMethod: 'razorpay' })
      .select('total paymentStatus fulfillmentStatus razorpayPaymentId refundInProgress')
      .lean();
    const out = {
      eligible: { count: 0, amount: 0 },
      refunded: { count: 0, amount: 0 },
      attention: { count: 0, amount: 0 },
      total: rows.length,
      successRate: null
    };
    for (const order of rows) {
      const key = bucket(order);
      out[key].count += 1;
      out[key].amount += Number(order.total) || 0;
    }
    const completed = out.refunded.count;
    const eligible = out.eligible.count + completed;
    out.successRate = eligible ? Math.round((completed / eligible) * 1000) / 10 : null;
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const tab = String(req.query.tab || 'all').trim();
    const q = String(req.query.q || '').trim().slice(0, 120);
    const query = { paymentMethod: 'razorpay' };

    if (tab === 'eligible') Object.assign(query, { paymentStatus: 'captured', razorpayPaymentId: { $exists: true, $nin: [''] } });
    else if (tab === 'refunded') query.$or = [{ paymentStatus: 'refunded' }, { fulfillmentStatus: 'refunded' }];
    else if (tab === 'attention') query.$or = [{ paymentStatus: { $nin: ['captured', 'refunded'] } }, { razorpayPaymentId: { $exists: false } }, { refundInProgress: true }];
    else if (tab !== 'all') return res.status(400).json({ error: 'Invalid refund filter' });

    if (q) {
      const search = new RegExp(q.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'i');
      query.$and = [...(query.$and || []), { $or: [
        { orderNumber: search }, { 'customer.name': search }, { 'customer.email': search },
        { 'customer.phone': search }, { razorpayPaymentId: search }, { razorpayRefundId: search }
      ] }];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json(orders);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
