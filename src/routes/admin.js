const express = require('express');

const Product = require('../models/Product');
const Order = require('../models/Order');
const StoreSettings = require('../models/StoreSettings');
const { requireAdmin } = require('../middleware/auth');
const { releaseReservation, restockCommittedStock } = require('../utils/orders');
const { getClient } = require('../utils/razorpay');
const { sendOrderStatusEmail } = require('../utils/email');

const router = express.Router();
router.use(requireAdmin);

const csvEscape = value => {
  const text = value === null || value === undefined ? '' : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
};

function safeSearch(value) {
  const q = String(value || '').trim().slice(0, 120);
  return q ? new RegExp(q.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'i') : null;
}

router.get('/me', (req, res) => res.json({ admin: req.admin }));

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await StoreSettings.findById('store').lean();
    res.json({ shippingFee: Number(settings?.shippingFee ?? process.env.SHIPPING_FEE ?? 99) });
  } catch (e) { next(e); }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const shippingFee = Number(req.body.shippingFee);
    if (!Number.isFinite(shippingFee) || shippingFee < 0 || shippingFee > 100000) {
      return res.status(400).json({ error: 'Delivery fee must be between 0 and 100000' });
    }
    const settings = await StoreSettings.findByIdAndUpdate(
      'store', { $set: { shippingFee } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ shippingFee: settings.shippingFee });
  } catch (e) { next(e); }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      sales, orders, units, lowStock, customers, paymentSummary, recent, daily
    ] = await Promise.all([
      Order.aggregate([
        { $match: { $or: [{ paymentStatus: 'captured' }, { paymentMethod: 'cod', fulfillmentStatus: { $in: ['processing', 'shipped', 'delivered'] } }], createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.countDocuments({ createdAt: { $gte: since } }),
      Product.aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]),
      Product.countDocuments({ status: 'active', $expr: { $lte: [{ $subtract: ['$stock', '$reserved'] }, '$reorderPoint'] } }),
      Order.distinct('customer.email'),
      Order.aggregate([{ $group: { _id: '$paymentStatus', total: { $sum: '$total' } } }]),
      Order.find().sort({ createdAt: -1 }).limit(8).lean(),
      Order.aggregate([
        { $match: { $or: [{ paymentStatus: 'captured' }, { paymentMethod: 'cod', fulfillmentStatus: { $in: ['processing', 'shipped', 'delivered'] } }], createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    res.json({
      sales: sales[0]?.total || 0,
      orders,
      units: units[0]?.total || 0,
      lowStock,
      customers: customers.length,
      payments: paymentSummary.reduce((summary, item) => { summary[item._id] = item.total; return summary; }, {}),
      recent,
      daily
    });
  } catch (e) { next(e); }
});

router.get('/products', async (req, res, next) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    res.json(products.map(p => ({ ...p, availableStock: Math.max(0, Number(p.stock || 0) - Number(p.reserved || 0)) })));
  } catch (e) { next(e); }
});

router.post('/products', async (req, res, next) => {
  try {
    const product = await Product.create({
      name: req.body.name,
      sku: req.body.sku,
      description: req.body.description,
      price: Number(req.body.price),
      compareAtPrice: Number(req.body.compareAtPrice || 0),
      stock: Number(req.body.stock || 0),
      reserved: 0,
      reorderPoint: Number(req.body.reorderPoint ?? 10),
      image: req.body.image || '',
      status: req.body.status || 'active'
    });
    res.status(201).json(product);
  } catch (e) { next(e); }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'sku', 'description', 'price', 'compareAtPrice', 'stock', 'reorderPoint', 'image', 'status'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      if (['price', 'compareAtPrice', 'stock', 'reorderPoint'].includes(key)) {
        const value = Number(req.body[key]);
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: key + ' must be a non-negative number' });
        if (['stock', 'reorderPoint'].includes(key) && !Number.isInteger(value)) return res.status(400).json({ error: key + ' must be an integer' });
        patch[key] = value;
      } else patch[key] = req.body[key];
    }

    if (patch.stock !== undefined) {
      const product = await Product.findOneAndUpdate(
        { _id: req.params.id, $expr: { $gte: [patch.stock, '$reserved'] } },
        { $set: patch },
        { new: true, runValidators: true }
      );
      if (!product) {
        const existing = await Product.findById(req.params.id).select('reserved');
        if (!existing) return res.status(404).json({ error: 'Product not found' });
        return res.status(400).json({ error: 'Stock cannot be below reserved quantity (' + existing.reserved + ')' });
      }
      return res.json(product);
    }

    const product = await Product.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) { next(e); }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: { status: 'archived' } }, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch (e) { next(e); }
});

router.patch('/inventory/:id', async (req, res, next) => {
  try {
    const delta = Number(req.body.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
      return res.status(400).json({ error: 'Inventory adjustment must be a non-zero integer' });
    }
    const filter = { _id: req.params.id };
    if (delta < 0) filter.$expr = { $gte: [{ $add: ['$stock', delta] }, '$reserved'] };
    const product = await Product.findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true, runValidators: true });
    if (!product) {
      const existing = await Product.findById(req.params.id).select('reserved stock');
      if (!existing) return res.status(404).json({ error: 'Product not found' });
      return res.status(409).json({ error: 'Adjustment would reduce stock below reserved quantity' });
    }
    res.json(product);
  } catch (e) { next(e); }
});

router.get('/orders', async (req, res, next) => {
  try {
    const q = safeSearch(req.query.q);
    const status = String(req.query.status || '').trim();
    const query = {};
    if (status) query.fulfillmentStatus = status;
    if (q) query.$or = [
      { orderNumber: q }, { 'customer.name': q }, { 'customer.email': q },
      { 'customer.phone': q }, { razorpayPaymentId: q }, { trackingNumber: q }
    ];
    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json(orders);
  } catch (e) { next(e); }
});

router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const status = String(req.body.status || '').trim();
    const allowed = ['processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid order status' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'captured' && status !== 'cancelled') {
      return res.status(409).json({ error: 'Online payment must be verified before fulfilment' });
    }
    if (status === 'shipped') {
      const trackingNumber = String(req.body.trackingNumber || '').trim().slice(0, 120);
      const trackingUrl = String(req.body.trackingUrl || '').trim();
      if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) return res.status(400).json({ error: 'Tracking URL must use HTTPS' });
      order.trackingNumber = trackingNumber;
      order.trackingUrl = trackingUrl;
      order.shippedAt = new Date();
    }
    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') {
      order.cancelledAt = new Date();
      if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'captured') {
        return res.status(409).json({ error: 'Refund captured online payments through the refund action first' });
      }
      if (order.stockCommittedAt) await restockCommittedStock(order);
      else if (order.reservedUntil) await releaseReservation(order);
      order.paymentStatus = order.paymentStatus === 'pending' ? 'failed' : order.paymentStatus;
    }
    order.fulfillmentStatus = status;
    await order.save();
    sendOrderStatusEmail(order, status).catch(err => console.error('Order status email failed:', err.message));
    res.json({ success: true, order });
  } catch (e) { next(e); }
});

router.post('/orders/:id/refund', async (req, res, next) => {
  let order;
  try {
    order = await Order.findOneAndUpdate(
      { _id: req.params.id, paymentMethod: 'razorpay', paymentStatus: 'captured', razorpayPaymentId: { $exists: true }, refundInProgress: { $ne: true } },
      { $set: { refundInProgress: true, refundLockAt: new Date() } },
      { new: true }
    );
    if (!order) {
      const existing = await Order.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Order not found' });
      return res.status(409).json({ error: 'Order is not eligible for a new refund or another refund is in progress' });
    }

    const refund = await getClient().payments.refund(order.razorpayPaymentId, {
      notes: { local_order_id: String(order._id), order_number: order.orderNumber }
    });
    order.paymentStatus = 'refunded';
    order.fulfillmentStatus = 'refunded';
    order.refundInProgress = false;
    order.refundLockAt = null;
    order.razorpayRefundId = refund.id;
    order.refundAmount = Number(order.total);
    order.refundedAt = new Date();
    await order.save();
    if (order.stockCommittedAt) await restockCommittedStock(order);
    sendOrderStatusEmail(order, 'refunded').catch(err => console.error('Refund email failed:', err.message));
    res.json({ success: true, refundId: refund.id, order });
  } catch (e) {
    if (order?._id) {
      await Order.updateOne({ _id: order._id }, { $set: { refundInProgress: false, refundLockAt: null } }).catch(() => {});
    }
    next(e);
  }
});

router.get('/inventory/report', async (req, res, next) => {
  try {
    const products = await Product.find().sort({ stock: 1 }).lean();
    res.json(products.map(p => ({
      id: p._id, sku: p.sku, name: p.name, stock: p.stock, reserved: p.reserved,
      available: Math.max(0, p.stock - p.reserved), reorderPoint: p.reorderPoint,
      lowStock: p.stock - p.reserved <= p.reorderPoint, status: p.status
    })));
  } catch (e) { next(e); }
});

router.get('/customers/:email/orders', async (req, res, next) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    const orders = await Order.find({ 'customer.email': email }).sort({ createdAt: -1 }).limit(200).lean();
    res.json(orders);
  } catch (e) { next(e); }
});

router.get('/customers', async (req, res, next) => {
  try {
    const customers = await Order.aggregate([
      { $group: {
        _id: '$customer.email',
        name: { $first: '$customer.name' },
        phone: { $first: '$customer.phone' },
        orders: { $sum: 1 },
        spent: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'captured'] }, '$total', 0] } },
        lastOrder: { $max: '$createdAt' }
      } },
      { $sort: { lastOrder: -1 } },
      { $limit: 500 }
    ]);
    res.json(customers);
  } catch (e) { next(e); }
});

router.post('/orders/:id/email', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!['processing', 'shipped', 'delivered', 'cancelled', 'refunded'].includes(order.fulfillmentStatus)) {
      return res.status(400).json({ error: 'No customer email is available for this order status' });
    }
    await sendOrderStatusEmail(order, order.fulfillmentStatus);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get('/orders/export', async (req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(5000).lean();
    const header = [
      'Order Number', 'Date', 'Customer', 'Email', 'Phone', 'Payment Method',
      'Payment Status', 'Fulfillment Status', 'Subtotal', 'Shipping', 'Tax', 'Total',
      'Currency', 'Tracking Number', 'Tracking URL'
    ];
    const rows = orders.map(order => [
      order.orderNumber, order.createdAt, order.customer?.name, order.customer?.email,
      order.customer?.phone, order.paymentMethod, order.paymentStatus,
      order.fulfillmentStatus, order.subtotal, order.shippingFee, order.tax,
      order.total, order.currency, order.trackingNumber, order.trackingUrl
    ].map(csvEscape).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send([header.map(csvEscape).join(','), ...rows].join('\n'));
  } catch (e) { next(e); }
});

router.get('/inventory/export', async (req, res, next) => {
  try {
    const products = await Product.find().sort({ sku: 1 }).lean();
    const header = ['SKU', 'Product', 'Price', 'Compare At Price', 'Stock', 'Reserved', 'Available', 'Reorder Point', 'Status'];
    const rows = products.map(p => [
      p.sku, p.name, p.price, p.compareAtPrice, p.stock, p.reserved,
      Math.max(0, p.stock - p.reserved), p.reorderPoint, p.status
    ].map(csvEscape).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');
    res.send([header.map(csvEscape).join(','), ...rows].join('\n'));
  } catch (e) { next(e); }
});

router.get('/system', (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
    node: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
