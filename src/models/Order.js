const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  image: String,
  unitPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true, index: true },
  checkoutKey: { type: String, unique: true, sparse: true, index: true },
  customer: {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true }
  },
  shipping: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    pin: { type: String, required: true }
  },
  items: { type: [orderItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  shippingFee: { type: Number, required: true, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  paymentMethod: { type: String, enum: ['razorpay', 'cod'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'authorized', 'captured', 'failed', 'refunded'], default: 'pending' },
  fulfillmentStatus: {
    type: String,
    enum: ['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending_payment'
  },
  refundInProgress: { type: Boolean, default: false },
  refundLockAt: Date,
  razorpayRefundId: { type: String, index: true, sparse: true },
  refundAmount: { type: Number, min: 0 },
  refundedAt: Date,
  razorpayOrderId: { type: String, index: true, sparse: true },
  razorpayPaymentId: { type: String, index: true, sparse: true },
  paymentSignature: String,
  notes: String,
  reservedUntil: Date,
  paidAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  trackingNumber: { type: String, trim: true, default: '' },
  trackingUrl: { type: String, trim: true, default: '' },
  codCollectedAt: Date,
  codCollectedAmount: { type: Number, min: 0 },
  codCollectionNote: { type: String, trim: true, maxlength: 300 },
  codCollectedBy: { type: String, trim: true, maxlength: 160 },
  codRemittedAt: Date,
  codRemittanceRef: { type: String, trim: true, maxlength: 120 },
  codFailedAt: Date,
  codFailureReason: { type: String, trim: true, maxlength: 300 },
  stockCommittedAt: Date,
  stockRestockedAt: Date
}, { timestamps: true });

orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'customer.email': 1, createdAt: -1 });
orderSchema.index({ paymentMethod: 1, fulfillmentStatus: 1, paymentStatus: 1 });
orderSchema.index({ fulfillmentStatus: 1, paymentStatus: 1, reservedUntil: 1 });
orderSchema.index({ paymentMethod: 1, paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
