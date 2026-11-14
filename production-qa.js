/*
 * StrydeGoSox Phase 4 production QA
 *
 * Static checks always run. Set QA_BASE_URL to also run a live smoke test
 * against a deployed/local server, e.g. QA_BASE_URL=https://shop.example.com npm run qa.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const backend = path.join(root, 'backend');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const server = read('src/server.js');
const checkout = read('src/routes/checkout.js');
const payments = read('src/routes/payments.js');
const admin = read('src/routes/admin.js');
const adminJs = read('admin/js/admin.js');
const config = read('frontend/js/config.js');
const packageJson = JSON.parse(read('package.json'));

// --- Production routing ---
check('Admin page exists', exists('admin/admin.html'));
check('Server serves admin/admin.html', server.includes('adminDir') && server.includes("'admin.html'"));
check('Frontend SPA fallback exists', server.includes('app.get(') && server.includes("'*'"));
check('Razorpay webhook uses raw body before JSON parser',
  server.indexOf("express.raw({ type: 'application/json' })") < server.indexOf('express.json('));

// --- Checkout/payment invariants ---
check('Checkout supports Idempotency-Key', checkout.includes("Idempotency-Key"));
check('Checkout creates server-side Razorpay order', checkout.includes('.orders.create('));
check('Checkout does not expose Razorpay secret', !checkout.includes('RAZORPAY_KEY_SECRET'));
check('Payment verify checks checkout signature', payments.includes('verifyCheckoutSignature'));
check('Payment verifies amount and currency', payments.includes('paymentMatchesOrder'));
check('Webhook verifies signature', payments.includes('verifyWebhookSignature'));
check('Webhook duplicate fallback is deterministic', payments.includes('sha256:') && payments.includes('createHash(') && !payments.includes('`${payload.event}-${payload.created_at}'));
check('Webhook failures return 500 for retry', payments.includes('return res.sendStatus(500)'));
check('Webhook marks event processed only after processing', payments.indexOf('await processWebhook(payload)') < payments.indexOf('eventRecord.processed = true'));

// --- Admin / fulfilment ---
check('Admin requires authentication', admin.includes('router.use(requireAdmin)'));
check('Tracking URL requires HTTPS', admin.includes("parsed.protocol !== 'https:'"));
check('Refund endpoint exists', admin.includes("'/orders/:id/refund'"));
check('Refund reconciliation checks amount_refunded', admin.includes('amount_refunded'));
check('Admin no longer stores JWT in localStorage', !/localStorage\.setItem\(TOKEN_KEY/.test(adminJs));
check('Admin API uses credentials include', adminJs.includes("credentials:'include'"));
check('Admin has visible sign-out control', exists('admin/admin.html') && adminJs.includes('adminLogoutBtn') && adminJs.includes('/auth/logout'));
check('Inventory delta uses atomic MongoDB update', admin.includes('findOneAndUpdate') && admin.includes('$add') && admin.includes("$inc: { stock: delta }"));
check('Product stock edits use an atomic reserved-stock guard', admin.includes("$expr: { $gte: [patch.stock, '$reserved'] }") && admin.includes("$set: patch"));
check('Expired-payment auto-refunds record refund metadata', payments.includes('order.refundAmount') && payments.includes('order.refundedAt') && payments.includes('razorpayRefundId'));
check('Refund UI treats in-progress refunds as attention items', read('admin/js/refunds.js').includes("if (o.refundInProgress) return 'attention'"));
check('Unknown admin routes do not fall through to storefront', server.includes("app.use('/admin', (req, res)"));
check('CSP allows Razorpay Checkout', server.includes('https://checkout.razorpay.com') && server.includes('scriptSrc'));
check('CSP allows Google Fonts', server.includes('https://fonts.googleapis.com') && server.includes('https://fonts.gstatic.com'));
check('Razorpay popup compatibility is enabled', server.includes("same-origin-allow-popups"));
check('Admin/auth API responses are no-store', server.includes("app.use('/api/admin'") && server.includes("app.use('/api/auth'"));
check('Inventory uses integer schema constraints', read('src/models/Product.js').includes("stock must be an integer") && read('src/models/Product.js').includes("reserved must be an integer"));

// --- Catalogue / configuration ---
check('Main SKU is an authoritative seeded SKU', config.includes("mainSku: 'SGS-BLK-ML'"));
check('No invented PACK-1 main SKU', !config.includes('SGS-PACK-1'));
check('Production environment file is absent', !exists('backend/.env'));
check('Environment template exists', exists('backend/.env.example'));
check('Production check script covers active backend files', packageJson.scripts?.check?.includes('src/routes/payments.js') && packageJson.scripts?.check?.includes('src/utils/orders.js'));

// --- Stale-file audit ---
for (const rel of [
  'src/middleware/auth1.js',
  'src/routes/auth1.js',
  'src/user.js',
  'src/users',
  'admin/js/admin1.js',
  'admin/admin1.html',
  'frontend/js/store1.js',
  'frontend/index1.html'
]) {
  check(`Stale file absent: ${rel}`, !exists(rel));
}

// --- Source secret scan ---
const secretFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.claude'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|json|yaml|yml|html|md|env|example|txt)$/i.test(entry.name)) secretFiles.push(full);
  }
}
walk(root);
const suspicious = [];
for (const file of secretFiles) {
  if (file.endsWith('.env.example')) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (/RAZORPAY_KEY_SECRET\s*=\s*['"]?[A-Za-z0-9_\-]{12,}/i.test(text) ||
      /RESEND_API_KEY\s*=\s*['"]?re_[A-Za-z0-9]{16,}/i.test(text) ||
      /mongodb(?:\+srv)?:\/\/[^\s:@]+:[^\s@]+@/i.test(text)) {
    suspicious.push(path.relative(root, file));
  }
}
check('No live-looking secrets in source', suspicious.length === 0, suspicious.join(', '));

async function liveSmoke() {
  const base = String(process.env.QA_BASE_URL || '').replace(/\/$/, '');
  if (!base) return;

  async function request(pathname, options) {
    const response = await fetch(`${base}${pathname}`, options);
    let body = null;
    try { body = await response.json(); } catch {}
    return { response, body };
  }

  const health = await request('/api/health');
  check('LIVE /api/health returns 200', health.response.status === 200 && health.body?.ok === true, `HTTP ${health.response.status}`);

  const ready = await request('/api/ready');
  check('LIVE /api/ready returns 200', ready.response.status === 200 && ready.body?.ok === true && ready.body?.database === 'ready', `HTTP ${ready.response.status}`);

  const adminMe = await request('/api/admin/me');
  check('LIVE admin API rejects anonymous access', adminMe.response.status === 401, `HTTP ${adminMe.response.status}`);

  const invalidCheckout = await request('/api/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'qa-invalid-checkout-0001' },
    body: JSON.stringify({ items: [] })
  });
  check('LIVE checkout rejects an empty cart', invalidCheckout.response.status >= 400 && invalidCheckout.response.status < 500, `HTTP ${invalidCheckout.response.status}`);

  const products = await request('/api/products');
  check('LIVE public product endpoint responds', products.response.status === 200 && Array.isArray(products.body), `HTTP ${products.response.status}`);
}

(async () => {
  await liveSmoke();
  const failed = checks.filter(c => !c.pass);
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\nPhase 5 QA: ${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exitCode = 1;
})();
