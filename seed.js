require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./src/models/Product');

const PRODUCTS = [
  {
    name: 'Pocket Compression Socks',
    sku: 'SGS-BLK-ML',
    price: 1198,
    compareAtPrice: 1698,
    stock: 48,
    reorderPoint: 10,
    status: 'active',
    image: 'assets/tin-closed.png',
    description: 'Pocket compression socks in a compact travel pack.'
  },
  {
    name: 'Pocket Compression Socks — White',
    sku: 'SGS-WHT-ML',
    price: 1198,
    compareAtPrice: 1698,
    stock: 26,
    reorderPoint: 10,
    status: 'active',
    image: 'assets/tin-closed.png',
    description: 'White compression socks in the signature pocket pack.'
  }
];

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  for (const product of PRODUCTS) {
    const existing = await Product.findOne({ sku: product.sku }).lean();

    if (existing) {
      // Seed updates catalogue metadata but never overwrites live commerce
      // values managed in Admin (price, compare-at price, or inventory).
      await Product.updateOne(
        { sku: product.sku },
        { $set: {
          name: product.name,
          reorderPoint: product.reorderPoint,
          status: product.status,
          image: product.image,
          description: product.description
        } }
      );
    } else {
      await Product.create(product);
    }
  }

  console.log(`✓ ${PRODUCTS.length} canonical products seeded/updated`);
  console.log('✓ Existing live stock/reservations were preserved');
  await mongoose.disconnect();
})().catch(async error => {
  console.error('Seed failed:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
