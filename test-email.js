// Optional manual email smoke test. Set TEST_EMAIL_TO in your private .env first.
require('dotenv').config();

const { sendOrderStatusEmail } = require('./src/utils/email');
const recipient = String(process.env.TEST_EMAIL_TO || '').trim();
if (!recipient) {
  console.error('Set TEST_EMAIL_TO in your local .env before running this test.');
  process.exit(1);
}

const testOrder = {
  _id: 'TEST-ORDER-DEMO',
  orderNumber: 'SGS-TEST-DEMO',
  customer: { name: 'Demo Recipient', email: recipient, phone: '0000000000' },
  items: [{ name: 'Demo Product', sku: 'DEMO-SKU', quantity: 1, unitPrice: 1, lineTotal: 1 }],
  subtotal: 1, shippingFee: 0, tax: 0, total: 1, currency: 'INR',
  shipping: { address: 'Demo address', city: 'Demo city', pin: '000000' },
  trackingNumber: 'DEMO-TRACKING',
  trackingUrl: 'https://example.com/track/DEMO-TRACKING'
};

sendOrderStatusEmail(testOrder, 'processing')
  .then(() => { console.log('Test email request completed.'); process.exit(0); })
  .catch(error => { console.error('Test email failed:', error.message); process.exit(1); });
