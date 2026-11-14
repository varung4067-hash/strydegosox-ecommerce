const express = require('express');
const Product = require('../models/Product');
const StoreSettings = require('../models/StoreSettings');

const router = express.Router();

router.get('/store-settings', async (req, res, next) => {
  try {
    const settings = await StoreSettings.findById('store').lean();
    res.set('Cache-Control', 'no-store');
    res.json({
      shippingFee: Number(settings?.shippingFee ?? process.env.SHIPPING_FEE ?? 99)
    });
  } catch (e) { next(e); }
});

router.get('/products', async (req, res, next) => {
  try {
    const products = await Product.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
    res.set('Cache-Control', 'no-store');
    res.json(products.map(p => ({
      ...p,
      // Older catalogue documents may predate the reserved field.
      availableStock: Math.max(0, Number(p.stock || 0) - Number(p.reserved || 0))
    })));
  } catch (e) { next(e); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const p = await Product.findOne({ _id: req.params.id, status: 'active' }).lean();
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.set('Cache-Control', 'no-store');
    res.json({
      ...p,
      availableStock: Math.max(0, Number(p.stock || 0) - Number(p.reserved || 0))
    });
  } catch (e) { next(e); }
});

module.exports = router;
