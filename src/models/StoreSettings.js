const mongoose = require('mongoose');

const storeSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'store' },
  shippingFee: { type: Number, min: 0, default: 99 }
}, { timestamps: true });

module.exports = mongoose.model('StoreSettings', storeSettingsSchema);
