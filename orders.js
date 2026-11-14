const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StoreSettings = require('../models/StoreSettings');

const currency = () => process.env.STORE_CURRENCY || 'INR';
async function shippingFee() {
  const settings = await StoreSettings.findById('store').lean();
  return Number(settings?.shippingFee ?? process.env.SHIPPING_FEE ?? 99);
}
const freeThreshold = () => Number(process.env.FREE_SHIPPING_THRESHOLD || 1999);
const taxRate = () => Number(process.env.PRODUCT_SALES_TAX_RATE || 0);

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Cart is empty');

  const merged = new Map();
  for (const raw of items) {
    const productId = String(raw?.productId || '').trim();
    const quantity = Number(raw?.quantity || 0);

    if (!productId || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Invalid cart item');
    }

    const next = (merged.get(productId) || 0) + quantity;
    if (next > 99) throw new Error('Maximum quantity per product is 99');
    merged.set(productId, next);
  }

  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

async function priceCart(items) {
  const normalized = normalizeItems(items);
  const ids = normalized.map(i => i.productId);
  const products = await Product.find({ _id: { $in: ids }, status: 'active' });
  const byId = new Map(products.map(p => [String(p._id), p]));
  const lines = [];

  for (const item of normalized) {
    const p = byId.get(item.productId);
    if (!p) throw new Error('One or more products are no longer available');

    const available = Math.max(0, p.stock - p.reserved);
    if (available < item.quantity) {
      throw new Error(`${p.name} has only ${available} available`);
    }

    lines.push({
      product: p,
      quantity: item.quantity,
      unitPrice: p.price,
      lineTotal: p.price * item.quantity
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const shipping = subtotal >= freeThreshold() ? 0 : await shippingFee();
  const tax = Math.round((subtotal * taxRate()) / 100);
  const total = subtotal + shipping + tax;

  return { lines, subtotal, shipping, tax, total, currency: currency() };
}

function makeOrderNumber() {
  return `SG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function runTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function reserveStock(lines) {
  return runTransaction(async session => {
    const changed = [];

    for (const line of lines) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: line.product._id,
          status: 'active',
          $expr: {
            $gte: [
              { $subtract: ['$stock', '$reserved'] },
              line.quantity
            ]
          }
        },
        { $inc: { reserved: line.quantity } },
        { new: true, session }
      );

      if (!updated) {
        throw new Error(`${line.product.name} went out of stock. Please try again.`);
      }

      changed.push({ productId: updated._id, quantity: line.quantity });
    }

    return changed;
  });
}

async function releaseReservation(order) {
  if (order.stockCommittedAt) return order;

  await runTransaction(async session => {
    const current = await require('../models/Order').findById(order._id).session(session);
    if (!current || current.stockCommittedAt || !current.reservedUntil) return;

    for (const item of current.items) {
      await Product.updateOne(
        { _id: item.product, reserved: { $gte: item.quantity } },
        { $inc: { reserved: -item.quantity } },
        { session }
      );
    }

    current.reservedUntil = null;
    await current.save({ session });
  });

  order.reservedUntil = null;
  return order;
}

async function commitReservation(order) {
  if (order.stockCommittedAt) return order;

  await runTransaction(async session => {
    const current = await require('../models/Order').findById(order._id).session(session);
    if (!current || current.stockCommittedAt) return;

    for (const item of current.items) {
      const result = await Product.updateOne(
        {
          _id: item.product,
          reserved: { $gte: item.quantity },
          stock: { $gte: item.quantity }
        },
        { $inc: { reserved: -item.quantity, stock: -item.quantity } },
        { session }
      );

      if (result.modifiedCount !== 1) {
        throw new Error(`Unable to commit stock for ${item.sku}`);
      }
    }

    current.stockCommittedAt = new Date();
    current.reservedUntil = null;
    await current.save({ session });
  });

  order.stockCommittedAt = order.stockCommittedAt || new Date();
  order.reservedUntil = null;
  return order;
}

async function restockCommittedStock(order) {
  if (order.stockRestockedAt) return order;

  await runTransaction(async session => {
    const current = await require('../models/Order').findById(order._id).session(session);
    if (!current || current.stockRestockedAt) return;

    // If stock was never committed, there is nothing to restore.
    if (!current.stockCommittedAt) {
      current.reservedUntil = null;
      await current.save({ session });
      return;
    }

    for (const item of current.items) {
      await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } },
        { session }
      );
    }

    current.stockRestockedAt = new Date();
    current.reservedUntil = null;
    await current.save({ session });
  });

  order.stockRestockedAt = order.stockRestockedAt || new Date();
  order.reservedUntil = null;
  return order;
}

async function expireReservation(order) {
  // Accept either a full order document or a raw ObjectId.
  const orderId = order && order._id ? order._id : order;

  let expired = false;
  await runTransaction(async session => {
    const current = await require('../models/Order').findOne({
      _id: orderId,
      fulfillmentStatus: 'pending_payment',
      paymentStatus: { $in: ['pending', 'authorized'] },
      reservedUntil: { $lt: new Date(), $ne: null },
      stockCommittedAt: { $exists: false }
    }).session(session);

    if (!current) return;

    for (const item of current.items) {
      await Product.updateOne(
        { _id: item.product, reserved: { $gte: item.quantity } },
        { $inc: { reserved: -item.quantity } },
        { session }
      );
    }

    current.reservedUntil = null;
    current.paymentStatus = 'failed';
    current.fulfillmentStatus = 'cancelled';
    current.cancelledAt = new Date();
    await current.save({ session });
    expired = true;
  });

  if (expired && order && typeof order === 'object') {
    order.reservedUntil = null;
    order.paymentStatus = 'failed';
    order.fulfillmentStatus = 'cancelled';
    order.cancelledAt = order.cancelledAt || new Date();
  }

  return expired;
}

module.exports = {
  priceCart,
  makeOrderNumber,
  reserveStock,
  releaseReservation,
  commitReservation,
  restockCommittedStock,
  expireReservation,
  currency
};
