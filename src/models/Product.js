const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 180 },
  sku: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 2000 },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, default: 0, min: 0 },
  stock: {
    type: Number, default: 0, min: 0,
    validate: { validator: Number.isInteger, message: 'stock must be an integer' }
  },
  reserved: {
    type: Number, default: 0, min: 0,
    validate: { validator: Number.isInteger, message: 'reserved must be an integer' }
  },
  reorderPoint: {
    type: Number, default: 10, min: 0,
    validate: { validator: Number.isInteger, message: 'reorderPoint must be an integer' }
  },
  image: { type: String, default: '' },
  status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

productSchema.virtual('availableStock').get(function () {
  return Math.max(0, this.stock - this.reserved);
});
productSchema.index({ status: 1, createdAt: -1 });
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
