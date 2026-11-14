/* =========================================================
   StrydeGoSox — Production Storefront Commerce Layer
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     CONFIGURATION
     --------------------------------------------------------- */

  const API_BASE =
    (window.SGS_CONFIG && window.SGS_CONFIG.apiBase) || '/api';

  const CART_KEY = 'strydegosox_cart_v2';

  const MAIN_SKU =
    (window.SGS_CONFIG && window.SGS_CONFIG.mainSku) ||
    'SGS-BLK-ML';

  /*
   * Some existing catalogues predate the current SGS-BLK-ML SKU and
   * store the same single-pair product as SGS-PACK-1. Prefer the current
   * SKU whenever it exists; this fallback only keeps legacy records usable.
   */
  const LEGACY_MAIN_SKUS = [
    'SGS-PACK-1'
  ];

  let products = [];
  let cart = loadCart();
  let toastTimer = null;

  let authMode = 'login';
  let currentUser = null;


  /* ---------------------------------------------------------
     HELPERS
     --------------------------------------------------------- */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const money = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  };


  /* ---------------------------------------------------------
     CART STORAGE
     --------------------------------------------------------- */

  function loadCart() {
    try {
      const saved = localStorage.getItem(CART_KEY);

      if (!saved) {
        return [];
      }

      const parsed = JSON.parse(saved);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed;
    } catch (error) {
      console.warn('Unable to load cart:', error);
      return [];
    }
  }


  function saveCart() {
    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify(cart)
      );
    } catch (error) {
      console.warn('Unable to save cart:', error);
    }
  }


  function totalQty() {
    return cart.reduce(
      (total, item) =>
        total + Number(item.quantity || 0),
      0
    );
  }


  function getProduct(id) {
    return products.find(
      product =>
        String(product._id) === String(id)
    );
  }


  function availableStock(product) {
    const reported = product?.availableStock;

    if (reported !== null && reported !== undefined) {
      return Math.max(0, Number(reported) || 0);
    }

    return Math.max(
      0,
      Number(product?.stock || 0) - Number(product?.reserved || 0)
    );
  }


  /* ---------------------------------------------------------
     TOAST
     --------------------------------------------------------- */

  function showToast(message) {
    const text = $('#toastText');
    const toast = $('#toast');

    if (!text || !toast) {
      console.warn(message);
      return;
    }

    text.textContent = message;

    toast.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }


  /* ---------------------------------------------------------
     COMMERCE STYLES
     --------------------------------------------------------- */

  function injectStyles() {

    if ($('#sg-commerce-styles')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'sg-commerce-styles';

    style.textContent = `

      /* ================= CART BADGE ================= */

      .sg-cart-badge {
        position:absolute;
        top:-7px;
        right:-9px;
        min-width:20px;
        height:20px;
        padding:0 6px;
        border-radius:999px;
        background:#e21d2b;
        color:#fff;
        display:grid;
        place-items:center;
        font:700 9px JetBrains Mono,monospace;
        box-shadow:0 5px 15px rgba(226,29,43,.35);
      }


      /* ================= CART BUTTON ================= */

      .sg-cart-fab {
        position:fixed;
        right:24px;
        bottom:24px;
        z-index:850;

        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;

        padding:14px 17px;

        border-radius:999px;

        background:#e21d2b;
        color:#fff;

        border:1px solid rgba(255,255,255,.18);

        box-shadow:
          0 18px 45px rgba(0,0,0,.45);

        font:
          700 10px
          JetBrains Mono,
          monospace;

        letter-spacing:.08em;
        text-transform:uppercase;

        cursor:pointer;

        transition:
          transform .25s ease,
          background .25s ease;
      }

      .sg-cart-fab:hover {
        transform:translateY(-3px);
        background:#c91825;
      }

      .sg-cart-fab .fab-count {
        display:inline-flex;
      }


      /* ================= MOBILE CART ================= */

      @media(max-width:620px) {

        .sg-cart-fab {
          right:max(14px, env(safe-area-inset-right));
          bottom:max(14px, env(safe-area-inset-bottom));

          width:52px;
          height:52px;

          padding:0;
          gap:0;

          justify-content:center;
        }

        .sg-cart-fab .fab-label {
          display:none;
        }

        .sg-cart-fab .fab-count {
          position:absolute;

          top:-4px;
          right:-4px;

          min-width:19px;
          height:19px;

          padding:0 4px;

          border-radius:999px;

          background:#fff;
          color:#e21d2b;

          display:flex;
          align-items:center;
          justify-content:center;

          font-size:9px;

          border:2px solid #0b0c0e;
        }
      }


      /* ================= CART DRAWER ================= */

      .sg-drawer {
        position:fixed;
        inset:0;
        z-index:5000;
        display:none;
      }

      .sg-drawer.open {
        display:block;
      }

      .sg-drawer-backdrop {
        position:absolute;
        inset:0;

        background:rgba(0,0,0,.72);

        backdrop-filter:blur(7px);
      }

      .sg-drawer-panel {
        position:absolute;

        right:0;
        top:0;

        width:min(520px,94vw);
        height:100%;

        overflow:auto;

        background:#0b0c0e;

        border-left:
          1px solid rgba(255,255,255,.1);

        padding:28px;

        box-shadow:
          -35px 0 100px rgba(0,0,0,.5);

        transform: translateX(100%);
        transition: transform .35s cubic-bezier(.22,1,.36,1);
      }

      .sg-drawer.open .sg-drawer-panel {
        transform: translateX(0);
      }


      /* ================= HEADERS ================= */

      .sg-head {
        display:flex;
        justify-content:space-between;
        align-items:center;

        gap:15px;

        margin-bottom:20px;
      }

      .sg-kicker {
        color:#e21d2b;

        font:
          9px
          JetBrains Mono,
          monospace;

        letter-spacing:.18em;
        text-transform:uppercase;
      }

      .sg-head h3 {
        font:
          400 28px
          Anton,
          sans-serif;

        text-transform:uppercase;

        margin-top:4px;
      }

      .sg-close {
        width:36px;
        height:36px;

        border-radius:10px;

        background:#17181b;
        color:#fff;

        cursor:pointer;

        font-size:20px;

        border:1px solid
          rgba(255,255,255,.08);
      }


      /* ================= CART ITEMS ================= */

      .sg-item {
        display:grid;

        grid-template-columns:
          70px
          1fr
          auto;

        gap:13px;

        align-items:center;

        padding:16px 0;

        border-bottom:
          1px solid rgba(255,255,255,.09);
      }

      .sg-item:last-child {
        border-bottom:none;
      }

      .sg-thumb {
        width:70px;
        height:70px;

        border-radius:12px;

        background:#151619;

        display:grid;
        place-items:center;

        overflow:hidden;
      }

      .sg-thumb img {
        max-width:100%;
        max-height:100%;

        object-fit:contain;
      }

      .sg-name {
        font-size:12px;
        font-weight:800;
      }

      .sg-price {
        color:#8b8d92;

        font:
          10px
          JetBrains Mono,
          monospace;

        margin-top:4px;
      }


      /* ================= QUANTITY ================= */

      .sg-qty {
        display:flex;
        align-items:center;

        gap:8px;

        margin-top:10px;
      }

      .sg-qty button {
        width:27px;
        height:27px;

        border-radius:7px;

        background:#191a1e;
        color:#fff;

        cursor:pointer;

        border:1px solid
          rgba(255,255,255,.08);
      }

      .sg-qty span {
        min-width:18px;

        text-align:center;

        font:
          10px
          JetBrains Mono,
          monospace;
      }

      .sg-line {
        font:
          11px
          JetBrains Mono,
          monospace;

        color:#fff;
      }

      .sg-remove {
        background:none;

        color:#666;

        font:
          9px
          JetBrains Mono,
          monospace;

        text-transform:uppercase;

        cursor:pointer;

        margin-top:7px;

        border:0;
      }

      .sg-remove:hover {
        color:#ff6570;
      }


      /* ================= CART SUMMARY ================= */

      .sg-summary {
        margin-top:22px;

        border-top:
          1px solid rgba(255,255,255,.1);

        padding-top:18px;

        display:grid;
        gap:10px;
      }

      .sg-row {
        display:flex;
        justify-content:space-between;

        color:#888;

        font-size:11px;
      }

      .sg-row.total {
        color:#fff;

        font:
          700 14px
          JetBrains Mono,
          monospace;

        padding-top:8px;
      }

      .sg-checkout-btn {
        width:100%;

        margin-top:14px;

        min-height:52px;

        border-radius:999px;

        background:#e21d2b;
        color:#fff;

        font:
          700 11px
          JetBrains Mono,
          monospace;

        letter-spacing:.08em;
        text-transform:uppercase;

        cursor:pointer;

        border:0;
      }

      .sg-checkout-btn:hover {
        background:#c91825;
      }

      .sg-checkout-btn:disabled {
        opacity:.45;
        cursor:not-allowed;
      }

      .sg-empty {
        text-align:center;

        padding:80px 10px;

        color:#666;

        font:
          10px
          JetBrains Mono,
          monospace;

        letter-spacing:.08em;
        text-transform:uppercase;
      }


      /* ================= MODALS ================= */

      .sg-modal {
        position:fixed;
        inset:0;

        z-index:5100;

        display:none;

        align-items:center;
        justify-content:center;

        padding:18px;
      }

      .sg-modal.open {
        display:flex;
      }

      .sg-modal-backdrop {
        position:absolute;
        inset:0;

        background:rgba(0,0,0,.76);

        backdrop-filter:blur(8px);
      }

      .sg-modal-panel {
        position:relative;

        width:min(760px,96vw);

        max-height:92vh;

        overflow:auto;

        background:#0c0d0f;

        border:
          1px solid rgba(255,255,255,.1);

        border-radius:20px;

        padding:27px;

        box-shadow:
          0 35px 120px rgba(0,0,0,.65);

        transform: translateY(20px) scale(.96);
        opacity: 0;
        transition: transform .35s cubic-bezier(.22,1,.36,1), opacity .35s ease;
      }

      .sg-modal.open .sg-modal-panel {
        transform: translateY(0) scale(1);
        opacity: 1;
      }


      /* ================= CHECKOUT FORM ================= */

      .sg-form {
        display:grid;

        grid-template-columns:
          1fr 1fr;

        gap:13px;
      }

      .sg-field {
        display:grid;
        gap:7px;
      }

      .sg-field.full {
        grid-column:1/-1;
      }

      .sg-field label {
        color:#777;

        font:
          8px
          JetBrains Mono,
          monospace;

        letter-spacing:.12em;
        text-transform:uppercase;
      }



      .sg-field input,
.sg-field textarea,
.sg-field select {
    width:100%;
    box-sizing:border-box;

    background:#090a0c;

    border:1px solid rgba(255,255,255,.1);

    border-radius:10px;

    color:#fff;

    padding:13px 14px;

    outline:none;

    font-family:Arial, Helvetica, sans-serif;
    font-size:12px;
    line-height:18px;

    transition:
        border-color .2s ease,
        background .2s ease,
        box-shadow .2s ease;
}
      }

      .sg-field label {
    color:#777;

    font:
        700 8px
        JetBrains Mono,
        monospace;

    letter-spacing:.12em;
    text-transform:uppercase;
}

.sg-field input::placeholder,
.sg-field textarea::placeholder {
    color:#444;
}

.sg-field input:hover,
.sg-field textarea:hover,
.sg-field select:hover {
    border-color:rgba(255,255,255,.18);
}

.sg-field input:focus,
.sg-field textarea:focus,
.sg-field select:focus {
    border-color:#e21d2b;

    background:#0b0c0e;

    box-shadow:
        0 0 0 3px rgba(226,29,43,.08);
}

      .sg-field textarea {
        min-height:85px;
        resize:vertical;
      }

      .sg-field input:focus,
      .sg-field textarea:focus,
      .sg-field select:focus {
        border-color:
          rgba(226,29,43,.75);
      }

      .sg-pay-note {
        padding:12px;

        border:
          1px solid rgba(92,167,255,.16);

        background:
          rgba(92,167,255,.05);

        border-radius:10px;

        color:#8e939c;

        font-size:9px;

        line-height:1.6;
      }

      .sg-submit {
        grid-column:1/-1;

        display:flex;

        justify-content:flex-end;

        margin-top:4px;
      }

      .sg-submit button {
        min-height:50px;

        padding:0 22px;

        border-radius:999px;

        background:#e21d2b;
        color:#fff;

        border:0;

        font:
          700 10px
          JetBrains Mono,
          monospace;

        letter-spacing:.08em;

        text-transform:uppercase;

        cursor:pointer;
      }

      .sg-submit button:disabled {
        opacity:.55;
        cursor:wait;
      }


      /* ================= AUTH ================= */

      .sg-auth-modal {
        position:fixed;
        inset:0;

        z-index:5200;

        display:none;

        align-items:center;
        justify-content:center;

        padding:18px;
      }

      .sg-auth-modal.open {
        display:flex;
      }

      .sg-auth-backdrop {
        position:absolute;
        inset:0;

        background:rgba(0,0,0,.78);

        backdrop-filter:blur(10px);
      }

      .sg-auth-panel {
        position:relative;

        width:min(460px,96vw);

        background:#0c0d0f;

        border:
          1px solid rgba(255,255,255,.1);

        border-radius:22px;

        padding:28px;

        box-shadow:
          0 35px 120px rgba(0,0,0,.7);
      }

      .sg-auth-tabs {
        display:grid;

        grid-template-columns:
          1fr 1fr;

        background:#151619;

        border-radius:12px;

        padding:4px;

        margin:18px 0;
      }

      .sg-auth-tab {
        background:transparent;

        color:#777;

        padding:11px;

        border-radius:9px;

        cursor:pointer;

        font:
          700 9px
          JetBrains Mono,
          monospace;

        letter-spacing:.1em;

        text-transform:uppercase;

        border:0;
      }

      .sg-auth-tab.active {
        background:#e21d2b;
        color:#fff;
      }

      .sg-auth-form {
        display:grid;
        gap:13px;
      }

      .sg-auth-error {
        min-height:16px;

        color:#ff6570;

        font:
          9px
          JetBrains Mono,
          monospace;
      }

      .sg-auth-submit {
        min-height:50px;

        border-radius:999px;

        background:#e21d2b;
        color:#fff;

        border:0;

        font:
          700 10px
          JetBrains Mono,
          monospace;

        letter-spacing:.08em;

        text-transform:uppercase;

        cursor:pointer;
      }

      .sg-auth-submit:disabled {
        opacity:.55;
        cursor:wait;
      }


      /* ================= ACCOUNT MENU ================= */

      .sg-account-menu {
        position:fixed;

        top:78px;
        right:24px;

        z-index:5190;

        width:min(
          300px,
          calc(100vw - 32px)
        );

        padding:14px;

        background:#0c0d0f;

        border:
          1px solid rgba(255,255,255,.1);

        border-radius:16px;

        box-shadow:
          0 25px 70px rgba(0,0,0,.55);

        display:none;
      }

      .sg-account-menu.open {
        display:block;
      }

      .sg-account-menu strong {
        display:block;
        font-size:12px;
      }

      .sg-account-menu small {
        display:block;

        color:#777;

        margin-top:4px;

        font:
          9px
          JetBrains Mono,
          monospace;
      }

      .sg-account-menu button {
        width:100%;

        margin-top:13px;

        padding:11px;

        border:
          1px solid rgba(255,255,255,.1);

        border-radius:10px;

        background:#151619;

        color:#fff;

        cursor:pointer;

        font:
          700 9px
          JetBrains Mono,
          monospace;

        text-transform:uppercase;
      }


      /* ================= SUCCESS ================= */

      .sg-success {
        text-align:center;
        padding:30px 10px;
      }

      .sg-success-mark {
        width:62px;
        height:62px;

        border-radius:50%;

        display:grid;
        place-items:center;

        margin:0 auto 18px;

        background:
          rgba(57,217,138,.1);

        border:
          1px solid rgba(57,217,138,.3);

        color:#39d98a;

        font-size:26px;
      }

      .sg-success h3 {
        font:
          400 36px
          Anton,
          sans-serif;

        text-transform:uppercase;
      }

      .sg-success p {
        color:#92949a;

        font-size:12px;

        line-height:1.7;

        margin-top:10px;
      }

      .sg-order-number {
        color:#fff;

        font:
          700 12px
          JetBrains Mono,
          monospace;

        margin-top:15px;
      }


      /* ================= MOBILE ================= */

      @media(max-width:620px) {

        .sg-drawer-panel {
          padding:20px;
        }

        .sg-form {
          grid-template-columns:1fr;
        }

        .sg-field.full {
          grid-column:auto;
        }

        .sg-submit {
          grid-column:auto;
        }

        .sg-item {
          grid-template-columns:
            58px 1fr;
        }

        .sg-thumb {
          width:58px;
          height:58px;
        }

        .sg-line {
          grid-column:2;
        }

        .sg-head h3 {
          font-size:25px;
        }
      }


      /* ================= SHOP ALL ================= */

      .shop-grid {
        display:grid;
        grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));
        gap:16px;
        margin-top:24px;
      }

      .shop-card {
        background:#131417;
        border:1px solid rgba(255,255,255,.08);
        border-radius:16px;
        overflow:hidden;
        display:flex;
        flex-direction:column;
      }

      .shop-card--sold-out {
        opacity:.45;
        filter:grayscale(.5);
      }

      .shop-card-image {
        position:relative;
        width:100%;
        height:220px;
        background:#151619;
        display:grid;
        place-items:center;
      }

      .shop-card-image img {
        max-width:80%;
        max-height:80%;
        object-fit:contain;
      }

      .shop-card-overlay {
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.6);
        color:#e21d2b;
        font:700 11px JetBrains Mono,monospace;
        letter-spacing:.1em;
        text-transform:uppercase;
      }

      .shop-card-body {
        padding:16px;
        display:grid;
        gap:6px;
      }

      .shop-card-name {
        font-size:14px;
        font-weight:800;
        color:#fff;
      }

      .shop-card-sku {
        font-size:10px;
        color:#888;
        font-family:JetBrains Mono,monospace;
      }

      .shop-card-price {
        font-size:16px;
        font-weight:700;
        color:#e21d2b;
        font-family:JetBrains Mono,monospace;
      }

      .shop-add {
        margin-top:8px;
        width:100%;
      }

    `;

    document.head.appendChild(style);
  }


  /* ---------------------------------------------------------
     BUILD CART / CHECKOUT / LOGIN UI
     --------------------------------------------------------- */

  function buildUI() {

    injectStyles();


    /* ================= CART FAB ================= */

    const fab = document.createElement('button');

    fab.className = 'sg-cart-fab';
    fab.id = 'sgCartFab';

    fab.type = 'button';

    fab.setAttribute(
      'aria-label',
      'Open cart'
    );

    fab.innerHTML = `
      <svg
        class="fab-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="9" cy="21" r="1"/>
        <circle cx="19" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>

      <span class="fab-label">CART</span>

      <span
        id="sgCartCount"
        class="fab-count"
      >
        0
      </span>
    `;

    fab.addEventListener(
      'click',
      openCart
    );

    document.body.appendChild(fab);


    /* ================= CART DRAWER ================= */

    const drawer =
      document.createElement('div');

    drawer.className = 'sg-drawer';
    drawer.id = 'sgCartDrawer';

    drawer.innerHTML = `
      <div class="sg-drawer-backdrop"></div>

      <aside class="sg-drawer-panel">

        <div class="sg-head">

          <div>
            <div class="sg-kicker">
              StrydeGoSox / Bag
            </div>

            <h3>
              Your cart
            </h3>
          </div>

          <button
            class="sg-close"
            type="button"
            aria-label="Close cart"
          >
            ×
          </button>

        </div>

        <div id="sgCartItems"></div>

        <div id="sgCartSummary"></div>

      </aside>
    `;

    document.body.appendChild(drawer);

    $('.sg-drawer-backdrop', drawer)
      .addEventListener(
        'click',
        closeCart
      );

    $('.sg-close', drawer)
      .addEventListener(
        'click',
        closeCart
      );


    /* ================= CHECKOUT MODAL ================= */

    const modal =
      document.createElement('div');

    modal.className = 'sg-modal';
    modal.id = 'sgCheckoutModal';

    modal.innerHTML = `
      <div class="sg-modal-backdrop"></div>

      <div class="sg-modal-panel">

        <div class="sg-head">

          <div>
            <div class="sg-kicker">
              Secure checkout
            </div>

            <h3>
              Complete your order
            </h3>
          </div>

          <button
            class="sg-close"
            type="button"
            aria-label="Close checkout"
          >
            ×
          </button>

        </div>


        <form
          id="sgCheckoutForm"
          class="sg-form"
        >

         <div class="sg-field">
  <label>
    Full name
  </label>

  <input
    id="sgName"
    name="name"
    type="text"
    required
    autocomplete="name"
    placeholder="Your full name"
  >
</div>


<div class="sg-field">
  <label>
    Phone
  </label>

  <input
    id="sgPhone"
    name="phone"
    type="tel"
    required
    autocomplete="tel-national"
    inputmode="numeric"
    pattern="[6-9][0-9]{9}"
    maxlength="10"
    minlength="10"
    placeholder="10-digit mobile number"
  >
</div>


<div class="sg-field full">
  <label>
    Email
  </label>

  <input
    id="sgEmail"
    name="email"
    type="email"
    required
    autocomplete="email"
    placeholder="you@example.com"
  >
</div>



          <div class="sg-field full">
            <label>
              Shipping address
            </label>

            <textarea
              id="sgAddress"
              required
              autocomplete="street-address"
            ></textarea>
          </div>


          <div class="sg-field">
            <label>
              City
            </label>

            <input
              id="sgCity"
              required
              autocomplete="address-level2"
            >
          </div>


          <div class="sg-field">
            <label>
              PIN code
            </label>

            <input
              id="sgPin"
              required
              autocomplete="postal-code"
              inputmode="numeric"
            >
          </div>


          <div class="sg-field full">
            <label>
              Payment method
            </label>

            <select id="sgPayment">

              <option value="razorpay">
                Razorpay — UPI / Card / Netbanking
              </option>

              <option value="cod">
                Cash on Delivery
              </option>

            </select>
          </div>


          <div class="sg-field full">

            <div class="sg-pay-note">

              Your final total is calculated
              and validated by the server.

              For Razorpay, a server-side
              order is created first and
              the payment signature is
              verified before the order is
              treated as paid.

            </div>

          </div>


          <div class="sg-submit">

            <button
              id="sgPlaceOrder"
              type="submit"
            >
              Place order / Pay securely →
            </button>

          </div>

        </form>

      </div>
    `;

    document.body.appendChild(modal);

    $('.sg-modal-backdrop', modal)
      .addEventListener(
        'click',
        closeCheckout
      );

    $('.sg-close', modal)
      .addEventListener(
        'click',
        closeCheckout
      );

    $('#sgCheckoutForm')
      .addEventListener(
        'submit',
        submitCheckout
      );


    /* ================= AUTH MODAL ================= */

    const auth =
      document.createElement('div');

    auth.className = 'sg-auth-modal';
    auth.id = 'sgAuthModal';

    auth.innerHTML = `

      <div class="sg-auth-backdrop"></div>

      <div class="sg-auth-panel">

        <div class="sg-head">

          <div>

            <div class="sg-kicker">
              StrydeGoSox / Account
            </div>

            <h3 id="sgAuthTitle">
              Welcome back
            </h3>

          </div>

          <button
            class="sg-close"
            type="button"
            id="sgAuthClose"
            aria-label="Close login"
          >
            ×
          </button>

        </div>


        <div class="sg-auth-tabs">

          <button
            type="button"
            class="sg-auth-tab active"
            data-auth-tab="login"
          >
            Sign in
          </button>

          <button
            type="button"
            class="sg-auth-tab"
            data-auth-tab="register"
          >
            Create account
          </button>

        </div>


        <form
          id="sgAuthForm"
          class="sg-auth-form"
          autocomplete="off"
        >

          <div
            class="sg-field"
            id="sgAuthNameWrap"
            style="display:none"
          >

            <label>
              Full name
            </label>

            <input
              id="sgAuthName"
              autocomplete="name"
            >

          </div>


          <div class="sg-field">

            <label>
              Email
            </label>

            <input
              id="sgAuthEmail"
              type="email"
              required
              autocomplete="email"
            >

          </div>


          <div class="sg-field">

            <label>
              Password
            </label>

            <input
              id="sgAuthPassword"
              type="password"
              required
              autocomplete="current-password"
              minlength="8"
            >

          </div>


          <div
            class="sg-field"
            id="sgAuthConfirmWrap"
            style="display:none"
          >

            <label>
              Confirm password
            </label>

            <input
              id="sgAuthConfirm"
              type="password"
              autocomplete="new-password"
              minlength="8"
            >

          </div>


          <div
            class="sg-auth-error"
            id="sgAuthError"
          ></div>


          <button
            class="sg-auth-submit"
            id="sgAuthSubmit"
            type="submit"
          >
            Sign in securely →
          </button>

        </form>

      </div>
    `;

    document.body.appendChild(auth);


    $('#sgAuthClose').onclick =
      closeAuth;

    $('.sg-auth-backdrop', auth).onclick =
      closeAuth;


    $$('.sg-auth-tab', auth)
      .forEach(tab => {

        tab.onclick = () => {
          setAuthMode(
            tab.dataset.authTab
          );
        };

      });


    $('#sgAuthForm')
      .addEventListener(
        'submit',
        submitAuth
      );


    /* ================= ACCOUNT MENU ================= */

    const menu =
      document.createElement('div');

    menu.className =
      'sg-account-menu';

    menu.id =
      'sgAccountMenu';

    menu.innerHTML = `
      <strong id="sgAccountName">
        Account
      </strong>

      <small id="sgAccountEmail"></small>

      <button
        type="button"
        id="sgAccountLogout"
      >
        Sign out
      </button>
    `;

    document.body.appendChild(menu);


    $('#sgAccountLogout').onclick =
      logout;


    document.addEventListener(
      'click',
      event => {

        if (
          !event.target.closest(
            '#sgAccountMenu'
          ) &&
          !event.target.closest(
            '#sgAccountBtn'
          )
        ) {
          menu.classList.remove('open');
        }

      }
    );


    /*
     * Existing homepage login button.
     * We do not create another one.
     */
    $('#sgAccountBtn')?.addEventListener(
      'click',
      toggleAccount
    );
  }


  /* ---------------------------------------------------------
     AUTHENTICATION
     --------------------------------------------------------- */

  function setAuthMode(mode) {

    authMode = mode;

    const register =
      mode === 'register';

    $('#sgAuthTitle').textContent =
      register
        ? 'Create your account'
        : 'Welcome back';

    $('#sgAuthNameWrap').style.display =
      register ? 'grid' : 'none';

    $('#sgAuthConfirmWrap').style.display =
      register ? 'grid' : 'none';

    $('#sgAuthPassword').autocomplete =
      register
        ? 'new-password'
        : 'current-password';

    $('#sgAuthSubmit').textContent =
      register
        ? 'Create account securely →'
        : 'Sign in securely →';

    $('#sgAuthError').textContent = '';

    $$('.sg-auth-tab')
      .forEach(tab => {

        tab.classList.toggle(
          'active',
          tab.dataset.authTab === mode
        );

      });
  }


  function openAuth(mode = 'login') {

    setAuthMode(mode);

    /*
     * Customer account fields must never display credentials that a browser
     * may have saved from the separately managed admin dashboard.
     */
    [
      'sgAuthName',
      'sgAuthEmail',
      'sgAuthPassword',
      'sgAuthConfirm'
    ].forEach(id => {
      const field = document.getElementById(id);

      if (field) {
        field.value = '';
      }
    });

    $('#sgAuthModal')
      ?.classList.add('open');

    document.body.style.overflow =
      'hidden';

    setTimeout(() => {
      $('#sgAuthEmail')?.focus();
    }, 50);
  }


  function closeAuth() {

    $('#sgAuthModal')
      ?.classList.remove('open');

    if (
      !$('#sgCheckoutModal')
        ?.classList.contains('open') &&
      !$('#sgCartDrawer')
        ?.classList.contains('open')
    ) {
      document.body.style.overflow = '';
    }
  }


  function toggleAccount() {

    if (!currentUser) {
      openAuth('login');
      return;
    }

    $('#sgAccountMenu')
      ?.classList.toggle('open');
  }


  function updateAccountUI() {

    const button =
      $('#sgAccountBtn');

    const label =
      button?.querySelector(
        '.sg-account-label'
      );

    if (!button) {
      return;
    }


    if (currentUser) {

      if (label) {
        label.textContent =
          currentUser.name
            ? currentUser.name
                .split(' ')[0]
            : 'Account';
      }

      button.setAttribute(
        'aria-label',
        `Account for ${currentUser.email}`
      );

      const accountName =
        $('#sgAccountName');

      const accountEmail =
        $('#sgAccountEmail');

      if (accountName) {
        accountName.textContent =
          currentUser.name ||
          'Account';
      }

      if (accountEmail) {
        accountEmail.textContent =
          currentUser.email || '';
      }

    } else {

      if (label) {
        label.textContent =
          'Sign in';
      }

      button.setAttribute(
        'aria-label',
        'Sign in'
      );
    }
  }


  async function loadCurrentUser() {

    try {

      const data =
        await api('/auth/me');

      /*
       * The admin and storefront use the same HTTP-only session cookie.
       * An admin session authorizes the admin app, but it is not customer
       * identity data and must not prefill a customer checkout.
       */
      currentUser =
        data.user?.role === 'customer'
          ? data.user
          : null;

      updateAccountUI();

      if (currentUser) {

        const name =
          $('#sgName');

        const email =
          $('#sgEmail');

        if (name) {
          name.value =
            currentUser.name || '';
        }

        if (email) {
          email.value =
            currentUser.email || '';
        }
      }

    } catch (error) {

      currentUser = null;

      updateAccountUI();
    }
  }


  async function submitAuth(event) {

    event.preventDefault();

    const button =
      $('#sgAuthSubmit');

    const errorElement =
      $('#sgAuthError');

    const name =
      $('#sgAuthName')
        ?.value
        .trim() || '';

    const email =
      $('#sgAuthEmail')
        .value
        .trim()
        .toLowerCase();

    const password =
      $('#sgAuthPassword')
        .value;


    if (
      authMode === 'register' &&
      password !==
        $('#sgAuthConfirm').value
    ) {

      errorElement.textContent =
        'Passwords do not match.';

      return;
    }


    button.disabled = true;

    errorElement.textContent = '';


    try {

      const data =
        await api(
          authMode === 'register'
            ? '/auth/register'
            : '/auth/login',
          {
            method: 'POST',

            body: JSON.stringify(
              authMode === 'register'
                ? {
                    name,
                    email,
                    password
                  }
                : {
                    email,
                    password
                  }
            )
          }
        );


      currentUser =
        data.user;

      updateAccountUI();

      closeAuth();


      /*
       * IMPORTANT:
       * Admin users are sent to the existing
       * admin dashboard.
       */

      if (
        data.user?.role === 'admin'
      ) {

        const isLocal =
          window.location.hostname ===
            'localhost' ||
          window.location.hostname ===
            '127.0.0.1';

        window.location.href =
          isLocal
            ? '../admin/admin.html'
            : '/admin';

        return;
      }


      showToast(
        authMode === 'register'
          ? 'Account created successfully'
          : 'Signed in successfully'
      );


      if (
        $('#sgCheckoutModal')
          ?.classList.contains('open')
      ) {

        $('#sgName').value =
          currentUser.name || '';

        $('#sgEmail').value =
          currentUser.email || '';
      }

    } catch (error) {

      errorElement.textContent =
        error.message ||
        'Unable to sign in. Please try again.';

    } finally {

      button.disabled = false;
    }
  }


  async function logout() {

    try {

      await api(
        '/auth/logout',
        {
          method: 'POST'
        }
      );

    } catch (error) {
      /* Logout locally even if API is unavailable. */
    }

    currentUser = null;

    updateAccountUI();

    $('#sgAccountMenu')
      ?.classList.remove('open');

    showToast(
      'You have been signed out'
    );
  }


  /* ---------------------------------------------------------
     CART UI
     --------------------------------------------------------- */

  function openCart() {

    renderCart();

    $('#sgCartDrawer')
      ?.classList.add('open');

    document.body.style.overflow =
      'hidden';
  }


  function closeCart() {

    $('#sgCartDrawer')
      ?.classList.remove('open');

    if (
      !$('#sgCheckoutModal')
        ?.classList.contains('open')
    ) {
      document.body.style.overflow = '';
    }
  }


  function openCheckout() {

    if (!cart.length) {

      showToast(
        'Your cart is empty'
      );

      return;
    }

    closeCart();

    $('#sgCheckoutModal')
      ?.classList.add('open');

    document.body.style.overflow =
      'hidden';
  }


  function closeCheckout() {

    $('#sgCheckoutModal')
      ?.classList.remove('open');

    document.body.style.overflow = '';
  }


  /* ---------------------------------------------------------
     CART VALIDATION
     --------------------------------------------------------- */

  function sanitizeCart() {

    cart = cart.filter(item => {

      const product =
        getProduct(item.productId);

      return (
        product &&
        Number(item.quantity) > 0
      );
    });


    cart.forEach(item => {

      const product =
        getProduct(item.productId);

      if (!product) {
        return;
      }

      item.quantity =
        Math.min(
          Number(item.quantity) || 1,
          Math.max(
            0,
            Number(
              product.availableStock || 0
            )
          )
        );
    });


    cart =
      cart.filter(
        item =>
          Number(item.quantity) > 0
      );


    saveCart();
  }


  /* ---------------------------------------------------------
     ADD TO CART
     --------------------------------------------------------- */

  function addToCart(
    productId,
    quantity = 1,
    goCheckout = false
  ) {

    const product =
      getProduct(productId);


    if (!product) {

      showToast(
        'Product is temporarily unavailable'
      );

      return;
    }


    quantity =
      Math.max(
        1,
        Number(quantity) || 1
      );


    const current =
      cart.find(
        item =>
          String(item.productId) ===
          String(productId)
      );


    const nextQuantity =
      (current?.quantity || 0) +
      quantity;


    const stockAvailable = availableStock(product);


    if (
      nextQuantity >
      stockAvailable
    ) {

      showToast(
        `Only ${stockAvailable} available right now`
      );

      return;
    }


    if (current) {

      current.quantity =
        nextQuantity;

    } else {

      cart.push({
        productId:
          product._id,

        quantity:
          quantity
      });
    }


    saveCart();

    updateCartBadge();


    /*
     * Buy Now:
     * immediately opens checkout.
     *
     * Add To Cart:
     * opens the cart drawer.
     */

    if (goCheckout) {

      openCheckout();

    } else {

      showToast(
        `Added ${quantity} pair${
          quantity > 1 ? 's' : ''
        } to cart`
      );

      openCart();
    }
  }


  /* ---------------------------------------------------------
     CHANGE CART QUANTITY
     --------------------------------------------------------- */

  function changeQty(
    productId,
    delta
  ) {

    const item =
      cart.find(
        cartItem =>
          String(cartItem.productId) ===
          String(productId)
      );


    if (!item) {
      return;
    }


    const product =
      getProduct(productId);


    item.quantity +=
      Number(delta);


    if (product) {

      item.quantity =
        Math.min(
          item.quantity,
            availableStock(product)
        );
    }


    if (item.quantity <= 0) {

      cart =
        cart.filter(
          cartItem =>
            String(
              cartItem.productId
            ) !==
            String(productId)
        );
    }


    saveCart();

    renderCart();

    updateCartBadge();
  }


  /* ---------------------------------------------------------
     REMOVE CART ITEM
     --------------------------------------------------------- */

  function removeItem(productId) {

    cart =
      cart.filter(
        item =>
          String(item.productId) !==
          String(productId)
      );

    saveCart();

    renderCart();

    updateCartBadge();

    showToast(
      'Item removed from cart'
    );
  }


  /* ---------------------------------------------------------
     CART BADGE
     --------------------------------------------------------- */

  function updateCartBadge() {

    const count =
      totalQty();

    const badge =
      $('#sgCartCount');

    if (badge) {
      badge.textContent =
        count;
    }
  }


  /* ---------------------------------------------------------
     CART TOTALS
     --------------------------------------------------------- */

  function cartTotals() {

    const subtotal =
      cart.reduce(
        (sum, item) => {

          const product =
            getProduct(
              item.productId
            );

          if (!product) {
            return sum;
          }

          return (
            sum +
            (
              Number(product.price) *
              Number(item.quantity)
            )
          );
        },
        0
      );


    const freeThreshold =
      Number(
        window.SGS_CONFIG
          ?.freeShippingThreshold ??
        1999
      );


    const shippingFee =
      Number(
        window.SGS_CONFIG
          ?.shippingFee ??
        99
      );


    const shipping =
      subtotal >=
      freeThreshold
        ? 0
        : shippingFee;


    return {
      subtotal,
      shipping,
      total:
        subtotal + shipping
    };
  }


  /* ---------------------------------------------------------
     RENDER CART
     --------------------------------------------------------- */

  function renderCart() {

    sanitizeCart();


    const list =
      $('#sgCartItems');

    const summary =
      $('#sgCartSummary');


    if (!list || !summary) {
      return;
    }


    if (!cart.length) {

      list.innerHTML = `
        <div class="sg-empty">

          Your cart is empty.

          <br><br>

          Choose your pair
          and come back here.

        </div>
      `;

      summary.innerHTML = '';

      return;
    }


    list.innerHTML =
      cart
        .map(item => {

          const product =
            getProduct(
              item.productId
            );


          if (!product) {
            return '';
          }


          return `
            <article class="sg-item">

              <div class="sg-thumb">

                <img
                  src="${product.image || ''}"
                  alt="${escapeHtml(
                    product.name
                  )}"
                >

              </div>


              <div>

                <div class="sg-name">
                  ${escapeHtml(
                    product.name
                  )}
                </div>

                <div class="sg-price">
                  ${money(
                    product.price,
                    product.currency || 'INR'
                  )}
                  EACH
                </div>


                <div class="sg-qty">

                  <button
                    type="button"
                    data-cart-minus="${product._id}"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>


                  <span>
                    ${item.quantity}
                  </span>


                  <button
                    type="button"
                    data-cart-plus="${product._id}"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>

                </div>


                <button
                  class="sg-remove"
                  type="button"
                  data-cart-remove="${product._id}"
                >
                  Remove
                </button>

              </div>


              <div class="sg-line">

                ${money(
                  product.price *
                  item.quantity,
                  product.currency || 'INR'
                )}

              </div>

            </article>
          `;
        })
        .join('');


    const totals =
      cartTotals();


    summary.innerHTML = `
      <div class="sg-summary">

        <div class="sg-row">

          <span>
            Subtotal
          </span>

          <strong>
            ${money(
              totals.subtotal
            )}
          </strong>

        </div>


        <div class="sg-row">

          <span>
            Shipping
          </span>

          <strong>
            ${
              totals.shipping
                ? money(
                    totals.shipping
                  )
                : 'FREE'
            }
          </strong>

        </div>


        <div class="sg-row total">

          <span>
            Total
          </span>

          <strong>
            ${money(
              totals.total
            )}
          </strong>

        </div>


        <button
          class="sg-checkout-btn"
          type="button"
          id="sgCheckoutBtn"
        >
          Proceed to secure checkout →
        </button>

      </div>
    `;


    $$('[data-cart-minus]', list)
      .forEach(button => {

        button.onclick = () => {

          changeQty(
            button.dataset.cartMinus,
            -1
          );
        };
      });


    $$('[data-cart-plus]', list)
      .forEach(button => {

        button.onclick = () => {

          changeQty(
            button.dataset.cartPlus,
            1
          );
        };
      });


    $$('[data-cart-remove]', list)
      .forEach(button => {

        button.onclick = () => {

          removeItem(
            button.dataset.cartRemove
          );
        };
      });


    $('#sgCheckoutBtn')
      ?.addEventListener(
        'click',
        openCheckout
      );
  }


  /* ---------------------------------------------------------
     API
     --------------------------------------------------------- */

  async function api(
    path,
    options = {}
  ) {

    const headers = {
      'Content-Type':
        'application/json',

      ...(options.headers || {})
    };


    const response =
      await fetch(
        `${API_BASE}${path}`,
        {
          ...options,

          credentials:
            'include',

          headers
        }
      );


    let data = null;


    try {

      data =
        await response.json();

    } catch (error) {
      data = null;
    }


    if (!response.ok) {

      throw new Error(
        data?.error ||
        'Request failed'
      );
    }


    return data;
  }


  /* ---------------------------------------------------------
     LOAD PRODUCTS
     --------------------------------------------------------- */

  async function loadProducts() {

    try {

      const [
        data,
        storeSettings
      ] = await Promise.all([
        api('/products'),
        api('/store-settings')
      ]);

      if (
        Number.isFinite(
          Number(storeSettings?.shippingFee)
        ) &&
        window.SGS_CONFIG
      ) {
        window.SGS_CONFIG.shippingFee =
          Number(storeSettings.shippingFee);
      }


      /*
       * Supports both:
       *
       * [product, product]
       *
       * and
       *
       * { products: [...] }
       */

      products =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.products)
            ? data.products
            : [];


      sanitizeCart();

      updateMainProductUI();

      updatePackBundlesUI();

      renderProductUI();

      updateCartBadge();

    } catch (error) {

      console.warn(
        'StrydeGoSox API unavailable:',
        error.message
      );

      showToast(
        'Store connection unavailable — please try again'
      );


      /*
       * Do not crash the entire page.
       */

      document
        .querySelectorAll(
          '#addCart,#buyNow'
        )
        .forEach(button => {
          button.disabled = true;
        });
    }
  }


  /* ---------------------------------------------------------
     MAIN PRODUCT UI
     --------------------------------------------------------- */

  function updateMainProductUI() {

    const normalizedMainSku =
      String(MAIN_SKU).trim().toUpperCase();

    const product =
      products.find(
        item =>
          String(item.sku || '').trim().toUpperCase() ===
          normalizedMainSku
      ) ||
      products.find(
        item =>
          LEGACY_MAIN_SKUS.includes(
            String(item.sku || '').trim().toUpperCase()
          )
      );


    if (!product) {
      return;
    }


    const priceNow =
      document.querySelector(
        '.price-now'
      );

    const priceOld =
      document.querySelector(
        '.price-old'
      );


    if (priceNow) {

      priceNow.textContent =
        money(
          product.price,
          product.currency || 'INR'
        );
    }


    if (priceOld) {

      priceOld.textContent =
        product.compareAtPrice
          ? money(
              product.compareAtPrice,
              product.currency || 'INR'
            )
          : '';
    }


    /*
     * These CTAs (top nav, hero, pocket-problem section) all
     * quote the same headline price as marketing copy. Keep
     * them in sync with whatever the admin sets, instead of
     * leaving them hardcoded and able to drift out of date.
     */

    const headlinePrice =
      money(
        product.price,
        product.currency || 'INR'
      );

    [
      'navHeaderPrice',
      'heroCtaPrice',
      'pocketCtaPrice'
    ].forEach(id => {

      const element =
        document.getElementById(id);

      if (element) {
        element.textContent = headlinePrice;
      }
    });


    const quantityElement =
      $('#qtyValue');


    if (quantityElement) {

      quantityElement.textContent =
        '1';
    }


    const addButton =
      $('#addCart');

    const buyButton =
      $('#buyNow');


    /* ================= ADD TO CART ================= */

    if (addButton) {

      const fresh =
        addButton.cloneNode(true);

      addButton.replaceWith(
        fresh
      );


      fresh.addEventListener(
        'click',
        () => {

          const quantity =
            Math.max(
              1,
              Math.min(
                99,
                Number(
                  $('#qtyValue')
                    ?.textContent ||
                  1
                )
              )
            );


          addToCart(
            product._id,
            quantity,
            false
          );
        }
      );
    }


    /* ================= BUY NOW ================= */

    if (buyButton) {

      const fresh =
        buyButton.cloneNode(true);

      buyButton.replaceWith(
        fresh
      );


      fresh.addEventListener(
        'click',
        () => {

          const quantity =
            Math.max(
              1,
              Math.min(
                99,
                Number(
                  $('#qtyValue')
                    ?.textContent ||
                  1
                )
              )
            );


          /*
           * TRUE means:
           * immediately open checkout.
           */

          addToCart(
            product._id,
            quantity,
            true
          );
        }
      );
    }


    /* ================= PLUS ================= */

    const plus =
      $('#qtyPlus');


    if (plus) {

      const fresh =
        plus.cloneNode(true);

      plus.replaceWith(
        fresh
      );


      fresh.addEventListener(
        'click',
        () => {

          const current =
            Number(
              $('#qtyValue')
                ?.textContent ||
              1
            );


          const stock =
            Number(
              availableStock(product)
            );


          if (
            current <
            Math.min(99, stock)
          ) {

            $('#qtyValue')
              .textContent =
              String(
                current + 1
              );
          }
        }
      );
    }


    /* ================= MINUS ================= */

    const minus =
      $('#qtyMinus');


    if (minus) {

      const fresh =
        minus.cloneNode(true);

      minus.replaceWith(
        fresh
      );


      fresh.addEventListener(
        'click',
        () => {

          const current =
            Number(
              $('#qtyValue')
                ?.textContent ||
              1
            );


          $('#qtyValue')
            .textContent =
            String(
              Math.max(
                1,
                current - 1
              )
            );
        }
      );
    }
  }


  /* ---------------------------------------------------------
     PACK BUNDLES ("Choose Your Pack" section)
     --------------------------------------------------------- */

  function findProductBySku(sku) {
    return products.find(
      product => String(product.sku) === String(sku)
    );
  }

  function updatePackBundlesUI() {
    const cards = $$('.pack-card[data-sku]');

    cards.forEach(card => {
      const sku = card.getAttribute('data-sku');
      const product = findProductBySku(sku);

      const priceEl = card.querySelector('[data-field="price"]');
      const compareEl = card.querySelector('[data-field="compare"]');
      const unitEl = card.querySelector('[data-field="unit"]');
      const saveEl = card.querySelector('[data-field="save"]');
      const btnPriceEl = card.querySelector('[data-field="btn-price"]');
      const button = card.querySelector('.pack-add');

      if (!product) {
        /*
         * This pack hasn't been created as a product yet
         * (Admin → Products → Add product, using this exact
         * SKU). Show a friendly placeholder instead of a
         * broken-looking card.
         */
        if (priceEl) priceEl.textContent = 'Coming soon';
        if (compareEl) compareEl.textContent = '';
        if (unitEl) unitEl.textContent = '';
        if (saveEl) saveEl.style.display = 'none';
        if (btnPriceEl) btnPriceEl.textContent = 'unavailable';
        if (button) button.disabled = true;
        return;
      }

      const packSize =
        Number(card.querySelector('.pack-size strong')?.textContent) || 1;

      const perUnit = product.price / packSize;

      if (priceEl) priceEl.textContent = money(product.price);

      if (compareEl) {
        compareEl.textContent =
          product.compareAtPrice > product.price
            ? money(product.compareAtPrice)
            : '';
      }

      if (unitEl) {
        unitEl.textContent = `${money(perUnit)} / pair`;
      }

      if (saveEl) {
        if (product.compareAtPrice > product.price) {
          const pct = Math.round(
            (1 - product.price / product.compareAtPrice) * 100
          );
          saveEl.textContent = `Save ${pct}%`;
          saveEl.style.display = '';
        } else {
          saveEl.style.display = 'none';
        }
      }

      if (btnPriceEl) btnPriceEl.textContent = money(product.price);

      const inStock = Number(product.availableStock || 0) > 0;

      if (button) {
        button.disabled = !inStock;

        if (!inStock) {
          if (btnPriceEl) btnPriceEl.textContent = 'sold out';
        }

        /*
         * Rebind fresh to avoid stacking listeners if this
         * function is ever called more than once.
         */
        const fresh = button.cloneNode(true);
        button.replaceWith(fresh);

        if (inStock) {
          fresh.addEventListener('click', () => {
            addToCart(product._id, 1, false);
          });
        }
      }
    });
  }


  /* ---------------------------------------------------------
     RENDER ALL PRODUCTS (GENERIC SHOP ALL LISTING)
     --------------------------------------------------------- */

  // SKUs that are already rendered elsewhere: the hero/main "Buy" product
  // and the "Choose Your Pack" cards. We must not duplicate them.
  const RESERVED_SKUS = [
    String(MAIN_SKU).trim().toUpperCase(),
    'SGS-PACK-3',
    'SGS-PACK-5',
    'SGS-PACK-10'
  ];


  function isReserveD(p) {
    return RESERVED_SKUS.includes(String(p.sku).trim().toUpperCase());
  }

  function renderProductUI() {
    const grid =
      $('#shopAllGrid');

    if (!grid) {
      return;
    }


    const available =
      products.filter(
        product =>
          product.status === 'active' &&
          !isReserveD(product)
      );


    if (!available.length) {
      grid.innerHTML = `
        <p class="tiny-muted" style="text-align:center">
          No additional products available right now.
        </p>
      `;
      return;
    }


    grid.innerHTML =
      available
        .map(product => {
          const inStock =
            Number(
              product.availableStock || 0
            ) > 0;


          return `
            <article class="shop-card ${
              !inStock ? 'shop-card--sold-out' : ''
            }">
              <div class="shop-card-image">
                <img
                  src="${ escapeHtml(
                    product.image
                  ) }"
                  alt="${ escapeHtml(
                    product.name
                  ) }"
                >
                ${
                  !inStock
                    ? '<div class="shop-card-overlay">Out of stock</div>'
                    : ''
                }
              </div>


              <div class="shop-card-body">

                <div class="shop-card-name">
                  ${ escapeHtml(
                    product.name
                  ) }
                </div>


                <div class="shop-card-sku">
                  ${ escapeHtml(
                    product.sku
                  ) }
                </div>


                <div class="shop-card-price">
                  ${ money(
                    product.price,
                    product.currency || 'INR'
                  ) }
                </div>


                <button
                  type="button"
                  class="btn ${
                    inStock ? 'btn-primary' : 'btn-ghost'
                  } shop-add"
                  data-product-id="${ product._id }"
                  ${
                    !inStock
                      ? 'disabled'
                      : ''
                  }
                >
                  ${
                    inStock
                      ? 'Add to cart'
                      : 'Unavailable'
                  }
                </button>

              </div>

            </article>
          `;
        })
        .join('');


    // Bind add-to-cart on the fresh cards.
    $$('[data-product-id]', grid)
      .forEach(button => {

        button.onclick = () => {

          const productId =
            button.dataset.productId;


          /*
           * Re-lookup against the live catalogue so the
           * button only adds an in-stock product.
           */
          const product = getProduct(productId);

          if (!product) {
            return;
          }

          const inStock =
            Number(product.availableStock || 0) > 0;

          if (!inStock) {
            return;
          }

          addToCart(product._id, 1, false);
        };
      });
  }


  /* ---------------------------------------------------------
     CHECKOUT
     --------------------------------------------------------- */

  async function submitCheckout(event) {

    event.preventDefault();


    if (!cart.length) {

      showToast(
        'Your cart is empty'
      );

      return;
    }


    const button =
      $('#sgPlaceOrder');


    button.disabled = true;

    button.textContent =
      'Preparing secure checkout…';


    try {

      /*
       * Re-check the cart against
       * the current product data.
       */

      sanitizeCart();


      if (!cart.length) {

        throw new Error(
          'The selected product is no longer available.'
        );
      }


      const paymentMethod =
        $('#sgPayment').value;


      const payload = {

        items:
          cart.map(item => ({
            productId:
              item.productId,

            quantity:
              item.quantity
          })),

        paymentMethod,

        customer: {

          name:
            $('#sgName')
              .value
              .trim(),

          phone:
            $('#sgPhone')
              .value
              .trim(),

          email:
            $('#sgEmail')
              .value
              .trim()
        },

        shipping: {

          address:
            $('#sgAddress')
              .value
              .trim(),

          city:
            $('#sgCity')
              .value
              .trim(),

          pin:
            $('#sgPin')
              .value
              .trim()
        }
      };


      /*
       * Unique key prevents accidental
       * duplicate order creation.
       */

      const idempotencyKey =
        (
          window.crypto &&
          typeof window.crypto.randomUUID ===
            'function'
        )
          ? window.crypto.randomUUID()
          : `sg-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;


      const data =
        await api(
          '/checkout/create',
          {

            method:
              'POST',

            headers: {
              'Idempotency-Key':
                idempotencyKey
            },

            body:
              JSON.stringify(
                payload
              )
          }
        );


      /* ================= COD ================= */

      if (
        payload.paymentMethod ===
        'cod'
      ) {

        finishOrder(
          data.order,
          'confirmed'
        );

        return;
      }


      /* ================= RAZORPAY ================= */

      if (
        !window.Razorpay
      ) {

        throw new Error(
          'Razorpay Checkout could not load. Please refresh and try again.'
        );
      }


      const razorpayOptions = {

        key:
          data.keyId,

        amount:
          data.razorpay.amount,

        currency:
          data.razorpay.currency,

        order_id:
          data.razorpay.id,

        name:
          'StrydeGoSox',

        description:
          'Pocket Compression Socks',


        prefill: {

          name:
            payload.customer.name,

          email:
            payload.customer.email,

          contact:
            payload.customer.phone
        },


        notes: {

          local_order:
            data.order.orderNumber
        },


        theme: {
          color:
            '#e21d2b'
        },


        modal: {

          ondismiss: () => {

            button.disabled =
              false;

            button.textContent =
              'Place order / Pay securely →';

            showToast(
              'Payment window closed'
            );
          }
        },


        handler:
          async response => {

            try {

              /*
               * Verify payment on
               * the backend.
               */

              const verified =
                await api(
                  '/payments/verify',
                  {

                    method:
                      'POST',

                    body:
                      JSON.stringify(
                        response
                      )
                  }
                );


              if (
                verified.paymentStatus ===
                'captured'
              ) {

                finishOrder(
                  {
                    ...data.order,
                    orderNumber:
                      verified.orderNumber
                  },
                  'confirmed'
                );

              } else {

                finishOrder(
                  {
                    ...data.order,
                    orderNumber:
                      verified.orderNumber
                  },
                  'pending'
                );
              }

            } catch (error) {

              button.disabled =
                false;

              button.textContent =
                'Place order / Pay securely →';


              showToast(
                'Payment completed? Your order is being verified. Check the admin dashboard before retrying.'
              );
            }
          }
      };


      const razorpay =
        new window.Razorpay(
          razorpayOptions
        );


      razorpay.open();


    } catch (error) {

      button.disabled =
        false;

      button.textContent =
        'Place order / Pay securely →';


      showToast(
        error.message ||
        'Unable to create order'
      );
    }
  }


  /* ---------------------------------------------------------
     FINISH ORDER
     --------------------------------------------------------- */

  function finishOrder(
    order,
    state = 'confirmed'
  ) {

    /*
     * Clear local cart only after
     * server order creation/payment
     * succeeded.
     */

    cart = [];

    saveCart();

    updateCartBadge();

    closeCheckout();


    const drawer =
      $('#sgCartDrawer');


    if (drawer) {
      drawer.classList.remove(
        'open'
      );
    }


    document.body.style.overflow =
      '';


    const confirmed =
      state === 'confirmed';


    const modal =
      document.createElement('div');


    modal.className =
      'sg-modal open';

    modal.id =
      'sgSuccessModal';


    const orderNumber =
      order?.orderNumber ||
      'PROCESSING';


    modal.innerHTML = `

      <div class="sg-modal-backdrop"></div>

      <div class="sg-modal-panel">

        <div class="sg-success">

          <div class="sg-success-mark">
            ${confirmed ? '✓' : '…'}
          </div>


          <h3>
            ${
              confirmed
                ? 'Order locked in.'
                : 'Payment received.'
            }
          </h3>


          <p>

            ${
              confirmed

                ? 'Thanks for choosing StrydeGoSox. Your order has been confirmed and is now in the fulfilment system.'

                : 'Your payment is being confirmed by the payment gateway. The order has been recorded safely and will update automatically.'
            }

          </p>


          <div class="sg-order-number">

            ORDER #
            ${escapeHtml(
              orderNumber
            )}

          </div>


          <button
            class="sg-checkout-btn"
            style="max-width:330px"
            type="button"
            id="sgDone"
          >
            Continue shopping
          </button>

        </div>

      </div>
    `;


    document.body.appendChild(
      modal
    );


    $('#sgDone').onclick =
      () => {
        modal.remove();
      };


    $('.sg-modal-backdrop', modal)
      .onclick =
      () => {
        modal.remove();
      };
  }


  /* ---------------------------------------------------------
     HTML ESCAPE
     --------------------------------------------------------- */

  function escapeHtml(value) {

    return String(value)
      .replace(
        /[&<>'"]/g,
        character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[character])
      );
  }


  /* ---------------------------------------------------------
     PUBLIC API
     --------------------------------------------------------- */

  window.StrydeGoSoxStore = {

    openCart,

    openCheckout,

    addToCart,

    refresh:
      loadProducts
  };


  /* ---------------------------------------------------------
     START APPLICATION
     --------------------------------------------------------- */

  document.addEventListener(
    'DOMContentLoaded',
    () => {

      buildUI();

      updateCartBadge();

      loadProducts();

      loadCurrentUser();
    }
  );

})();
