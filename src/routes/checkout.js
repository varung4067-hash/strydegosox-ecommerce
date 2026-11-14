const { sendOrderStatusEmail } = require('../utils/email');
const express = require('express');
const Order = require('../models/Order');
const { priceCart, makeOrderNumber, reserveStock, releaseReservation, commitReservation } = require('../utils/orders');
const { getClient } = require('../utils/razorpay');

const router = express.Router();

function cleanCustomer(body) {
  const customer = body.customer || {};
  const shipping = body.shipping || {};
  const name = String(customer.name || '').trim().replace(/\s+/g, ' ');
  const email = String(customer.email || '').trim().toLowerCase();
  const phone = String(customer.phone || '').trim();
  const address = String(shipping.address || '').trim();
  const city = String(shipping.city || '').trim();
  const pin = String(shipping.pin || '').trim();

  if (!name || name.length < 2 || name.length > 120) throw new Error('Enter a valid full name');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 160) throw new Error('Enter a valid email address');
  if (!/^(?:\+91[-\s]?)?[6-9]\d{9}$/.test(phone.replace(/[()]/g, ''))) throw new Error('Enter a valid Indian mobile number');
  if (!address || address.length > 500) throw new Error('Enter a valid shipping address');
  if (!city || city.length > 100) throw new Error('Enter a valid city');
  if (!/^\d{6}$/.test(pin)) throw new Error('Enter a valid 6-digit PIN code');
  return { customer: { name, email, phone }, shipping: { address, city, pin } };
}

function responseFor(order) {
  return {
    success: true,
    keyId: process.env.RAZORPAY_KEY_ID,
    order: {
      id: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      paymentMethod: order.paymentMethod
    },
    razorpay: order.razorpayOrderId ? {
      id: order.razorpayOrderId,
      amount: Math.round(order.total * 100),
      currency: order.currency
    } : undefined
  };
}

router.post('/create', async (req, res, next) => {
  let reservedOrder = null;
  let reservation = null;
  try {
    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
    if (idempotencyKey && (idempotencyKey.length < 16 || idempotencyKey.length > 120)) {
      return res.status(400).json({ error: 'Invalid checkout idempotency key' });
    }

    if (idempotencyKey) {
      const existing = await Order.findOne({ checkoutKey: idempotencyKey });
      if (existing) return res.status(200).json(responseFor(existing));
    }

    const { customer, shipping } = cleanCustomer(req.body);
    const paymentMethod = req.body.paymentMethod === 'cod' ? 'cod' : 'razorpay';
    const priced = await priceCart(req.body.items);
    reservation = await reserveStock(priced.lines);

    const reservedUntil = paymentMethod === 'razorpay' ? new Date(Date.now() + 15 * 60 * 1000) : null;
    try {
      reservedOrder = await Order.create({
        checkoutKey: idempotencyKey || undefined,
        orderNumber: makeOrderNumber(),
        customer,
        shipping,
        items: priced.lines.map(l => ({
          product: l.product._id,
          sku: l.product.sku,
          name: l.product.name,
          image: l.product.image,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          lineTotal: l.lineTotal
        })),
        subtotal: priced.subtotal,
        shippingFee: priced.shipping,
        tax: priced.tax,
        total: priced.total,
        currency: priced.currency,
        paymentMethod,
        paymentStatus: 'pending',
        fulfillmentStatus: paymentMethod === 'cod' ? 'processing' : 'pending_payment',
        reservedUntil
      });
    } catch (createErr) {
      for (const item of reservation || []) {
        await require('../models/Product').updateOne(
          { _id: item.productId, reserved: { $gte: item.quantity } },
          { $inc: { reserved: -item.quantity } }
        );
      }
      reservation = null;
      throw createErr;
    }

    if (paymentMethod === 'cod') {
      await commitReservation(reservedOrder);
      reservedOrder.reservedUntil = null;
      await reservedOrder.save();

      sendOrderStatusEmail(reservedOrder, 'processing').catch(err => {
        console.error(`Order confirmation email failed for ${reservedOrder.orderNumber}:`, err);
      });

      return res.status(201).json(responseFor(reservedOrder));
    }

    let rpOrder;
    try {
      rpOrder = await getClient().orders.create({
        amount: Math.round(reservedOrder.total * 100),
        currency: reservedOrder.currency,
        receipt: reservedOrder.orderNumber,
        notes: { local_order_id: String(reservedOrder._id), customer_email: customer.email }
      });
    } catch (err) {
      await releaseReservation(reservedOrder);
      await Order.deleteOne({ _id: reservedOrder._id });
      reservedOrder = null;
      throw err;
    }

    reservedOrder.razorpayOrderId = rpOrder.id;
    await reservedOrder.save();
    return res.status(201).json(responseFor(reservedOrder));
  } catch (e) {
    if (reservedOrder?._id) {
      try {
        const fresh = await Order.findById(reservedOrder._id);
        if (fresh && !fresh.stockCommittedAt) {
          await releaseReservation(fresh);
          await Order.deleteOne({ _id: fresh._id });
        }
      } catch (cleanupErr) {
        console.error('Checkout cleanup failed:', cleanupErr.message);
      }
    }
    if (e?.code === 11000 && req.get('Idempotency-Key')) {
      const existing = await Order.findOne({ checkoutKey: String(req.get('Idempotency-Key')).trim() });
      if (existing) return res.status(200).json(responseFor(existing));
    }
    next(e);
  }
});

module.exports = router;
