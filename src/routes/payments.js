const crypto = require('crypto');
const express = require('express');
const Order = require('../models/Order');
const WebhookEvent = require('../models/WebhookEvent');
const { getClient, verifyCheckoutSignature, verifyWebhookSignature } = require('../utils/razorpay');
const { commitReservation, releaseReservation } = require('../utils/orders');
const { sendOrderStatusEmail } = require('../utils/email');

const router = express.Router();

function expectedAmount(order) {
  return Math.round(Number(order.total) * 100);
}

function paymentMatchesOrder(payment, order) {
  if (!payment) return false;
  if (payment.order_id && payment.order_id !== order.razorpayOrderId) return false;
  if (Number(payment.amount) !== expectedAmount(order)) return false;
  if (payment.currency !== order.currency) return false;
  return true;
}

function isCaptured(order) {
  return order.paymentStatus === 'captured' && !!order.stockCommittedAt;
}

async function sendConfirmation(order) {
  try {
    await sendOrderStatusEmail(order, 'processing');
  } catch (error) {
    console.error(\`[EMAIL] processing confirmation failed for \${order.orderNumber}:\`, error.message);
  }
}

async function processCapturedPayment({ order, payment, paymentId, signature = null }) {
  if (!paymentMatchesOrder(payment, order)) {
    throw Object.assign(new Error('Payment amount, currency, or order does not match'), { statusCode: 400 });
  }

  if (order.paymentStatus === 'refunded' || order.fulfillmentStatus === 'refunded') {
    return { refunded: true, emailNeeded: false };
  }

  if (!order.stockCommittedAt && (!order.reservedUntil || order.reservedUntil < new Date())) {
    const alreadyRefunded = Number(payment.amount_refunded || 0);
    const remaining = expectedAmount(order) - alreadyRefunded;
    let refund = null;
    if (remaining > 0) {
      refund = await getClient().payments.refund(paymentId, {
        amount: remaining,
        notes: {
          reason: 'Order reservation expired',
          local_order_id: String(order._id),
          order_number: order.orderNumber
        }
      });
    }

    order.razorpayPaymentId = paymentId || order.razorpayPaymentId;
    order.paymentSignature = signature || order.paymentSignature;
    order.paymentStatus = 'refunded';
    order.fulfillmentStatus = 'refunded';
    order.reservedUntil = null;
    order.refundAmount = expectedAmount(order) / 100;
    order.refundedAt = order.refundedAt || new Date();
    if (refund?.id) order.razorpayRefundId = refund.id;
    await order.save();
    return { refunded: true, emailNeeded: false };
  }

  order.razorpayPaymentId = paymentId || order.razorpayPaymentId;
  if (signature) order.paymentSignature = signature;
  order.paymentStatus = 'captured';
  if (!order.stockCommittedAt) await commitReservation(order);
  order.fulfillmentStatus = 'processing';
  order.paidAt = order.paidAt || new Date();
  order.reservedUntil = null;
  await order.save();
  return { refunded: false, emailNeeded: true };
}

router.post('/verify', async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Incomplete payment response' });
    }

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) return res.status(404).json({ error: 'Local order not found' });

    if (order.paymentStatus === 'captured' && order.stockCommittedAt) {
      return res.json({ success: true, paymentStatus: 'captured', orderNumber: order.orderNumber });
    }

    if (!verifyCheckoutSignature({
      orderId: order.razorpayOrderId,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    })) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    const payment = await getClient().payments.fetch(razorpay_payment_id);
    if (payment.status === 'failed') return res.status(400).json({ error: 'Razorpay reports this payment as failed' });
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({ error: \`Payment is not captured yet (\${payment.status || 'unknown'})\` });
    }
    if (!paymentMatchesOrder(payment, order)) {
      return res.status(400).json({ error: 'Payment amount, currency, or order does not match' });
    }

    order.razorpayPaymentId = razorpay_payment_id;
    order.paymentSignature = razorpay_signature;
    if (payment.status === 'authorized') {
      order.paymentStatus = 'authorized';
      await order.save();
      return res.json({ success: true, paymentStatus: 'authorized', orderNumber: order.orderNumber });
    }

    const result = await processCapturedPayment({
      order, payment, paymentId: razorpay_payment_id, signature: razorpay_signature
    });
    if (result.emailNeeded) await sendConfirmation(order);

    return res.json({
      success: true,
      paymentStatus: order.paymentStatus,
      orderNumber: order.orderNumber
    });
  } catch (e) {
    next(e);
  }
});

async function processWebhook(event) {
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || orderEntity?.order_id;
  const paymentId = paymentEntity?.id;
  if (!razorpayOrderId) return;

  const order = await Order.findOne({ razorpayOrderId });
  if (!order) return;

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    if (isCaptured(order) || order.paymentStatus === 'refunded') return;
    let payment = paymentEntity;
    if (paymentId) payment = await getClient().payments.fetch(paymentId);
    if (!payment) throw new Error(\`No payment entity available for \${order.orderNumber}\`);

    const result = await processCapturedPayment({
      order, payment, paymentId: paymentId || order.razorpayPaymentId
    });
    if (result.emailNeeded) await sendConfirmation(order);
    return;
  }

  if (event.event === 'payment.failed') {
    if (['captured', 'refunded'].includes(order.paymentStatus)) return;
    if (order.reservedUntil && !order.stockCommittedAt) await releaseReservation(order);
    order.paymentStatus = 'failed';
    order.fulfillmentStatus = 'cancelled';
    order.reservedUntil = null;
    await order.save();
  }
}

async function webhookHandler(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!Buffer.isBuffer(req.body) || !signature || !process.env.RAZORPAY_WEBHOOK_SECRET) {
      return res.status(400).send('Invalid webhook signature');
    }
    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(400).send('Invalid webhook signature');
    }

    const rawBody = req.body.toString('utf8');
    const payload = JSON.parse(rawBody);
    const eventId = String(req.headers['x-razorpay-event-id'] || '').trim() ||
      \`sha256:\${crypto.createHash('sha256').update(rawBody).digest('hex')}\`;

    let eventRecord = await WebhookEvent.findOne({ eventId });
    if (!eventRecord) {
      try {
        eventRecord = await WebhookEvent.create({ eventId, event: payload.event, processed: false });
      } catch (error) {
        if (error?.code === 11000) eventRecord = await WebhookEvent.findOne({ eventId });
        else throw error;
      }
    }

    if (!eventRecord) throw new Error('Unable to create webhook event record');
    if (eventRecord.processed) return res.sendStatus(200);

    await processWebhook(payload);
    eventRecord.processed = true;
    await eventRecord.save();
    return res.sendStatus(200);
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    return res.sendStatus(500);
  }
}

module.exports = router;
module.exports.webhookHandler = webhookHandler;
module.exports._test = { expectedAmount, paymentMatchesOrder, isCaptured, processCapturedPayment, processWebhook };
