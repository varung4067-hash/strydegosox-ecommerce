/* StrydeGoSox storefront configuration */

window.SGS_CONFIG = {
  /*
   * LOCAL DEVELOPMENT
   * When using VS Code Live Server:
   *   http://127.0.0.1:5500/frontend/index.html
   *
   * PRODUCTION
   * When frontend is served by the Node backend:
   *   /api
   */

  apiBase:
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
      ? `http://${window.location.hostname}:5000/api`
      : '/api',

  /*
   * Main product shown in the Buy section.
   * Keep this SKU identical to the product in MongoDB.
   */
  mainSku: 'SGS-BLK-ML',

  /*
   * Store pricing rules.
   */
  freeShippingThreshold: 1999,
  shippingFee: 99,

  /*
   * Admin destination.
   *
   * This is an ABSOLUTE path (starts with /) on purpose — it must
   * resolve the same way no matter which page the admin logged in
   * from. A relative path like '../admin/admin.html' only works if
   * the current page is exactly one folder deep, and silently sends
   * people to the wrong place (or a directory listing) otherwise.
   *
   * During local development (VS Code Live Server serving the
   * project root at 127.0.0.1:5500), the admin page lives at:
   *   /admin/admin.html
   *
   * In production, the backend serves the admin app at:
   *   /admin
   */
  adminUrl:
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
      ? '/admin/admin.html'
      : '/admin'
};
