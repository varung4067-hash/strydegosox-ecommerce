const { Resend } = require('resend');

let resend = null;

function getResendClient() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }

  return resend;
}

const BRAND = {
  name: 'StrydeGoSox',
  tagline: 'BUILT FOR EVERY STEP',
  website: process.env.STORE_URL || 'http://localhost:5500',
  support: process.env.EMAIL_REPLY_TO || 'support@strydegosox.com',
  gstin: process.env.BUSINESS_GSTIN || ''
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function absoluteAssetUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(?:https?:)?\/\//i.test(raw) || /^data:/i.test(raw) || /^cid:/i.test(raw)) return raw;

  const base = String(process.env.PUBLIC_APP_URL || process.env.STORE_URL || '').trim().replace(/\/$/, '');
  if (!base) return raw;

  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${base}${path}`;
}

function money(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function date(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function paymentName(method) {
  return method === 'cod'
    ? 'Cash on Delivery'
    : 'Online Payment';
}


/* =========================================================
   STATUS CONFIG
========================================================= */

function getStatus(status) {

  const data = {

    processing: {
      label: 'ORDER CONFIRMED',
      title: 'THANK YOU FOR YOUR',
      highlight: 'ORDER!',
      description:
        'Your order has been confirmed and is now being prepared. We’ll keep you updated every step of the way.',
      button: 'VIEW ORDER →',
      accent: '#ff1f2d',
      icon: '▣',
      messageTitle: 'YOUR ORDER IS CONFIRMED',
      message:
        'We’ve received your order and our team is preparing it for processing.',
      dateLabel: 'ORDER DATE'
    },

    processing_update: {
      label: 'ORDER IN PROCESSING',
      title: 'YOUR ORDER IS',
      highlight: 'BEING PREPARED.',
      description:
        'Our team is now preparing your order for dispatch. We will let you know as soon as it is on the way.',
      button: 'VIEW ORDER',
      accent: '#ff1f2d',
      icon: '>',
      messageTitle: 'YOUR ORDER IS NOW IN PROCESSING',
      message:
        'Our team is preparing your order for dispatch. We will send another update when it ships.',
      dateLabel: 'PROCESSING STARTED'
    },

    shipped: {
      label: 'ORDER DISPATCHED',
      title: 'YOUR ORDER IS',
      highlight: 'ON THE WAY.',
      description:
        'Your order has been dispatched and is now on its way to you.',
      button: 'TRACK ORDER →',
      accent: '#ff1f2d',
      icon: '▣',
      messageTitle: 'YOUR ORDER IS IN TRANSIT',
      message:
        'Your package has left our facility. You can track its journey using the tracking details below.',
      dateLabel: 'SHIPPED ON'
    },

    delivered: {
      label: 'ORDER DELIVERED',
      title: 'DELIVERED',
      highlight: 'SUCCESSFULLY!',
      description:
        'Your order has successfully reached its destination. We hope you love your StrydeGoSox purchase.',
      button: 'VIEW ORDER →',
      accent: '#ff1f2d',
      icon: '✓',
      messageTitle: 'DELIVERED SUCCESSFULLY',
      message:
        'Your order has reached its destination. Thank you for shopping with StrydeGoSox.',
      dateLabel: 'DELIVERED ON'
    },

    cancelled: {
      label: 'ORDER CANCELLED',
      title: 'ORDER',
      highlight: 'CANCELLED',
      description:
        'Your order has been cancelled. If a payment was taken, any applicable refund will be handled separately.',
      button: 'VISIT STORE →',
      accent: '#ff1f2d',
      icon: '×',
      messageTitle: 'YOUR ORDER HAS BEEN CANCELLED',
      message:
        'Your order has been cancelled. Please contact support if you need any assistance.',
      dateLabel: 'CANCELLED ON'
    },

    refunded: {
      label: 'ORDER REFUNDED',
      title: 'YOUR PAYMENT',
      highlight: 'HAS BEEN REFUNDED',
      description:
        'Your payment has been fully refunded. The amount will be credited back to your original payment method within 5–7 business days.',
      button: 'VIEW ORDER →',
      accent: '#ff1f2d',
      icon: '✓',
      messageTitle: 'PAYMENT REFUNDED',
      message:
        'We have processed a full refund for your order. You should see the credit in your account shortly.',
      dateLabel: 'REFUNDED ON'
    }

  };

  return data[status] || data.processing;
}


/* =========================================================
   LOGO
========================================================= */

function logo() {

  return `
    <div style="
      font-family:Arial,Helvetica,sans-serif;
      font-size:25px;
      line-height:30px;
      font-weight:900;
      letter-spacing:-1.5px;
      color:#ffffff;
    ">
      Stryde<span style="color:#ff1f2d;">Go</span>Sox
    </div>

    <div style="
      margin-top:4px;
      color:#666666;
      font-family:Arial,Helvetica,sans-serif;
      font-size:7px;
      line-height:10px;
      letter-spacing:3px;
      font-weight:700;
    ">
      ${BRAND.tagline}
    </div>
  `;
}


/* =========================================================
   HERO
========================================================= */

function hero(order, config, status) {

  /*
   * IMPORTANT:
   *
   * For production you can set:
   *
   * EMAIL_HERO_IMAGE=https://yourdomain.com/assets/email-hero.jpg
   *
   * Once the client owns the domain.
   */

  const heroImage =
    process.env.EMAIL_HERO_IMAGE || '';

  const background = heroImage
    ? `
      background-image:
        linear-gradient(
          90deg,
          rgba(0,0,0,.96) 0%,
          rgba(0,0,0,.82) 48%,
          rgba(0,0,0,.30) 100%
        ),
        url('${escapeHtml(heroImage)}');
      background-size:cover;
      background-position:center;
    `
    : `
      background:
        radial-gradient(
          circle at 80% 45%,
          #351014 0%,
          #090909 42%,
          #050505 75%
        );
    `;

  return `
    <tr>
      <td
        style="
          padding:0;
          ${background}
          border-bottom:1px solid #242424;
        "
      >

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
        >

          <tr>

            <td
              style="
                padding:44px 30px 42px;
              "
            >

              <div style="
                color:${config.accent};
                font-family:Arial,Helvetica,sans-serif;
                font-size:10px;
                line-height:14px;
                font-weight:800;
                letter-spacing:2px;
                text-transform:uppercase;
                margin-bottom:14px;
              ">
                — ${config.label}
              </div>


              <div style="
                font-family:Arial,Helvetica,sans-serif;
                font-size:40px;
                line-height:38px;
                font-weight:900;
                letter-spacing:-2px;
                color:#f5f5f5;
                text-transform:uppercase;
              ">
                ${escapeHtml(config.title)}
                <br>
                <span style="color:#ff1f2d;">
                  ${escapeHtml(config.highlight)}
                </span>
              </div>


              <div style="
                width:52px;
                height:3px;
                background:#ff1f2d;
                margin:20px 0;
              "></div>


              <div style="
                max-width:390px;
                color:#a7a7a7;
                font-family:Arial,Helvetica,sans-serif;
                font-size:13px;
                line-height:21px;
              ">
                Hi ${escapeHtml(order.customer?.name || 'there')},<br><br>

                ${escapeHtml(config.description)}
              </div>


              <div style="
                padding-top:22px;
              ">

                <a
                  href="${escapeHtml(BRAND.website)}"
                  target="_blank"
                  style="
                    display:inline-block;
                    background:#ff1f2d;
                    color:#ffffff;
                    text-decoration:none;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:11px;
                    line-height:14px;
                    font-weight:900;
                    letter-spacing:.7px;
                    padding:14px 20px;
                    border-radius:3px;
                  "
                >
                  ${config.button}
                </a>

              </div>

            </td>

          </tr>

        </table>

      </td>
    </tr>
  `;
}


/* =========================================================
   ORDER META
========================================================= */

function orderMeta(order, config, status) {

  const eventDate =
    status === 'delivered'
      ? order.deliveredAt
      : status === 'shipped'
        ? order.shippedAt
        : order.createdAt;

  return `
    <tr>

      <td style="padding:18px 24px 0;">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            background:#0d0d0d;
            border:1px solid #292929;
          "
        >

          <tr>

            <td
              width="33%"
              style="
                padding:14px 12px;
                border-right:1px solid #292929;
              "
            >

              <div style="
                color:#666666;
                font-family:Arial,sans-serif;
                font-size:8px;
                letter-spacing:1px;
                font-weight:700;
                text-transform:uppercase;
              ">
                ORDER NUMBER
              </div>

              <div style="
                margin-top:5px;
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:11px;
                font-weight:800;
              ">
                ${escapeHtml(order.orderNumber)}
              </div>

            </td>


            <td
              width="33%"
              style="
                padding:14px 12px;
                border-right:1px solid #292929;
              "
            >

              <div style="
                color:#666666;
                font-family:Arial,sans-serif;
                font-size:8px;
                letter-spacing:1px;
                font-weight:700;
                text-transform:uppercase;
              ">
                ${config.dateLabel}
              </div>

              <div style="
                margin-top:5px;
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:11px;
                font-weight:800;
              ">
                ${date(eventDate)}
              </div>

            </td>


            <td
              width="34%"
              style="
                padding:14px 12px;
              "
            >

              <div style="
                color:#666666;
                font-family:Arial,sans-serif;
                font-size:8px;
                letter-spacing:1px;
                font-weight:700;
                text-transform:uppercase;
              ">
                PAYMENT METHOD
              </div>

              <div style="
                margin-top:5px;
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:10px;
                font-weight:800;
              ">
                ${escapeHtml(paymentName(order.paymentMethod))}
              </div>

            </td>

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   ITEMS
========================================================= */

function items(order) {

  const list = Array.isArray(order.items)
    ? order.items
    : [];

  return list.map(item => {

    const imageUrl = absoluteAssetUrl(item.image);

    const image = imageUrl
      ? `
        <img
          src="${escapeHtml(imageUrl)}"
          width="64"
          height="64"
          alt="${escapeHtml(item.name)}"
          style="
            display:block;
            width:64px;
            height:64px;
            object-fit:contain;
            background:#151515;
          "
        >
      `
      : `
        <div style="
          width:64px;
          height:64px;
          background:#151515;
          color:#555555;
          font-family:Arial,sans-serif;
          font-size:26px;
          font-weight:900;
          line-height:64px;
          text-align:center;
        ">
          S
        </div>
      `;

    return `
      <tr>

        <td style="
          padding:10px 0;
        ">

          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            role="presentation"
            style="
              background:#101010;
              border:1px solid #252525;
            "
          >

            <tr>

              <td
                width="76"
                style="
                  padding:8px;
                "
              >
                ${image}
              </td>


              <td
                style="
                  padding:8px 6px;
                  font-family:Arial,sans-serif;
                "
              >

                <div style="
                  color:#ffffff;
                  font-size:12px;
                  line-height:17px;
                  font-weight:800;
                ">
                  ${escapeHtml(item.name)}
                </div>

                <div style="
                  color:#707070;
                  font-size:9px;
                  line-height:14px;
                  margin-top:3px;
                  text-transform:uppercase;
                  letter-spacing:.6px;
                ">
                  ${escapeHtml(item.sku || 'STRYDEGOSOX')}
                </div>

                <div style="
                  color:#858585;
                  font-size:10px;
                  margin-top:3px;
                ">
                  Qty: ${Number(item.quantity || 1)}
                </div>

              </td>


              <td
                width="75"
                align="right"
                style="
                  padding:8px;
                  color:#ffffff;
                  font-family:Arial,sans-serif;
                  font-size:12px;
                  font-weight:900;
                "
              >
                ${money(item.lineTotal, order.currency)}
              </td>

            </tr>

          </table>

        </td>

      </tr>
    `;
  }).join('');
}


/* =========================================================
   TOTALS
========================================================= */

function totals(order) {

  const shipping =
    Number(order.shippingFee || 0) === 0
      ? 'FREE'
      : money(order.shippingFee, order.currency);

  return `
    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      role="presentation"
      style="
        margin-top:8px;
      "
    >

      <tr>

        <td style="
          padding:5px 0;
          color:#777777;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          Subtotal
        </td>

        <td align="right" style="
          color:#cccccc;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          ${money(order.subtotal, order.currency)}
        </td>

      </tr>


      <tr>

        <td style="
          padding:5px 0;
          color:#777777;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          Shipping
        </td>

        <td align="right" style="
          color:#cccccc;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          ${shipping}
        </td>

      </tr>


      <tr>

        <td style="
          padding:5px 0;
          color:#777777;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          Tax
        </td>

        <td align="right" style="
          color:#cccccc;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          ${money(order.tax, order.currency)}
        </td>

      </tr>


      <tr>

        <td style="
          border-top:1px solid #292929;
          padding:13px 0 5px;
          color:#ffffff;
          font-family:Arial,sans-serif;
          font-size:14px;
          font-weight:900;
        ">
          TOTAL
        </td>

        <td align="right" style="
          border-top:1px solid #292929;
          padding:13px 0 5px;
          color:#ff1f2d;
          font-family:Arial,sans-serif;
          font-size:17px;
          font-weight:900;
        ">
          ${money(order.total, order.currency)}
        </td>

      </tr>

    </table>
  `;
}


/* =========================================================
   PROGRESS
========================================================= */

function progress(status) {

  let active = 1;

  if (status === 'shipped') active = 3;
  if (status === 'delivered') active = 4;

  const steps = [
    'CONFIRMED',
    'PROCESSING',
    'DISPATCHED',
    'DELIVERED'
  ];

  return `
    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      role="presentation"
      style="margin-top:28px;"
    >

      <tr>

        ${steps.map((label, index) => {

          const step = index + 1;
          const isActive = step <= active;

          return `
            <td
              width="25%"
              align="center"
              style="
                position:relative;
              "
            >

              <div style="
                width:26px;
                height:26px;
                line-height:26px;
                border-radius:50%;
                margin:auto;
                background:${isActive ? '#ff1f2d' : '#111111'};
                border:1px solid ${isActive ? '#ff1f2d' : '#444444'};
                color:${isActive ? '#ffffff' : '#666666'};
                font-family:Arial,sans-serif;
                font-size:9px;
                font-weight:900;
              ">
                ${isActive ? '✓' : `0${step}`}
              </div>

              <div style="
                margin-top:7px;
                color:${isActive ? '#ffffff' : '#555555'};
                font-family:Arial,sans-serif;
                font-size:7px;
                font-weight:800;
                letter-spacing:.5px;
              ">
                ${label}
              </div>

            </td>
          `;

        }).join('')}

      </tr>

    </table>
  `;
}


/* =========================================================
   TRACKING
========================================================= */

function tracking(order) {

  if (!order.trackingNumber) {
    return '';
  }

  return `
    <tr>

      <td style="
        padding:18px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            border:1px solid #ff1f2d;
            background:#12090a;
          "
        >

          <tr>

            <td style="
              padding:16px;
            ">

              <div style="
                color:#ff1f2d;
                font-family:Arial,sans-serif;
                font-size:8px;
                font-weight:800;
                letter-spacing:1.5px;
              ">
                TRACKING NUMBER
              </div>

              <div style="
                margin-top:5px;
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:15px;
                font-weight:900;
                letter-spacing:.8px;
              ">
                ${escapeHtml(order.trackingNumber)}
              </div>

            </td>


            ${
              order.trackingUrl
                ? `
                  <td
                    width="110"
                    align="right"
                    style="padding:16px;"
                  >

                    <a
                      href="${escapeHtml(order.trackingUrl)}"
                      target="_blank"
                      style="
                        display:inline-block;
                        background:#ff1f2d;
                        color:#ffffff;
                        text-decoration:none;
                        padding:11px 13px;
                        border-radius:3px;
                        font-family:Arial,sans-serif;
                        font-size:9px;
                        font-weight:900;
                      "
                    >
                      TRACK NOW →
                    </a>

                  </td>
                `
                : ''
            }

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function statusMessage(config, status) {

  return `
    <tr>

      <td style="
        padding:20px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            border:1px solid #3a2022;
            background:#100b0c;
          "
        >

          <tr>

            <td
              width="55"
              valign="top"
              style="padding:18px;"
            >

              <div style="
                width:34px;
                height:34px;
                line-height:34px;
                border-radius:50%;
                border:1px solid #ff1f2d;
                color:#ff1f2d;
                text-align:center;
                font-family:Arial,sans-serif;
                font-size:14px;
                font-weight:900;
              ">
                ${status === 'delivered' ? '✓' : '▣'}
              </div>

            </td>


            <td
              valign="middle"
              style="
                padding:18px 18px 18px 0;
              "
            >

              <div style="
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:12px;
                font-weight:900;
                letter-spacing:.3px;
              ">
                ${config.messageTitle}
              </div>

              <div style="
                color:#858585;
                font-family:Arial,sans-serif;
                font-size:10px;
                line-height:16px;
                margin-top:5px;
              ">
                ${escapeHtml(config.message)}
              </div>

            </td>

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   REVIEW
========================================================= */

/*
function review() {

  return `
    <tr>

      <td style="
        padding:20px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            border:1px solid #292929;
            background:#0d0d0d;
          "
        >

          <tr>

            <td
              align="center"
              style="
                padding:24px 15px;
              "
            >
                  padding:8px;
                "
              >
                ${image}
              </td>


              <td
                style="
                  padding:8px 6px;
                  font-family:Arial,sans-serif;
                "
              >

                <div style="
                  color:#ffffff;
                  font-size:12px;
                  line-height:17px;
                  font-weight:800;
                ">
                  ${escapeHtml(item.name)}
                </div>

                <div style="
                  color:#707070;
                  font-size:9px;
                  line-height:14px;
                  margin-top:3px;
                  text-transform:uppercase;
                  letter-spacing:.6px;
                ">
                  ${escapeHtml(item.sku || 'STRYDEGOSOX')}
                </div>

                <div style="
                  color:#858585;
                  font-size:10px;
                  margin-top:3px;
                ">
                  Qty: ${Number(item.quantity || 1)}
                </div>

              </td>


              <td
                width="75"
                align="right"
                style="
                  padding:8px;
                  color:#ffffff;
                  font-family:Arial,sans-serif;
                  font-size:12px;
                  font-weight:900;
                "
              >
                ${money(item.lineTotal, order.currency)}
              </td>

            </tr>

          </table>

        </td>

      </tr>
    `;
  }).join('');
}
*/


/* =========================================================
   TOTALS
========================================================= */

function totals(order) {

  const shipping =
    Number(order.shippingFee || 0) === 0
      ? 'FREE'
      : money(order.shippingFee, order.currency);

  return `
    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      role="presentation"
      style="
        margin-top:8px;
      "
    >

      <tr>

        <td style="
          padding:5px 0;
          color:#777777;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          Subtotal
        </td>

        <td align="right" style="
          color:#cccccc;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          ${money(order.subtotal, order.currency)}
        </td>

      </tr>


      <tr>

        <td style="
          padding:5px 0;
          color:#777777;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          Shipping
        </td>

        <td align="right" style="
          color:#cccccc;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          ${shipping}
        </td>

      </tr>


      <tr>

        <td style="
          padding:5px 0;
          color:#777777;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          Tax
        </td>

        <td align="right" style="
          color:#cccccc;
          font-family:Arial,sans-serif;
          font-size:11px;
        ">
          ${money(order.tax, order.currency)}
        </td>

      </tr>


      <tr>

        <td style="
          border-top:1px solid #292929;
          padding:13px 0 5px;
          color:#ffffff;
          font-family:Arial,sans-serif;
          font-size:14px;
          font-weight:900;
        ">
          TOTAL
        </td>

        <td align="right" style="
          border-top:1px solid #292929;
          padding:13px 0 5px;
          color:#ff1f2d;
          font-family:Arial,sans-serif;
          font-size:17px;
          font-weight:900;
        ">
          ${money(order.total, order.currency)}
        </td>

      </tr>

    </table>
  `;
}


/* =========================================================
   PROGRESS
========================================================= */

function progress(status) {

  let active = 1;

  if (status === 'shipped') active = 3;
  if (status === 'delivered') active = 4;

  const steps = [
    'CONFIRMED',
    'PROCESSING',
    'DISPATCHED',
    'DELIVERED'
  ];

  return `
    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      role="presentation"
      style="margin-top:28px;"
    >

      <tr>

        ${steps.map((label, index) => {

          const step = index + 1;
          const isActive = step <= active;

          return `
            <td
              width="25%"
              align="center"
              style="
                position:relative;
              "
            >

              <div style="
                width:26px;
                height:26px;
                line-height:26px;
                border-radius:50%;
                margin:auto;
                background:${isActive ? '#ff1f2d' : '#111111'};
                border:1px solid ${isActive ? '#ff1f2d' : '#444444'};
                color:${isActive ? '#ffffff' : '#666666'};
                font-family:Arial,sans-serif;
                font-size:9px;
                font-weight:900;
              ">
                ${isActive ? '✓' : `0${step}`}
              </div>

              <div style="
                margin-top:7px;
                color:${isActive ? '#ffffff' : '#555555'};
                font-family:Arial,sans-serif;
                font-size:7px;
                font-weight:800;
                letter-spacing:.5px;
              ">
                ${label}
              </div>

            </td>
          `;

        }).join('')}

      </tr>

    </table>
  `;
}


/* =========================================================
   TRACKING
========================================================= */

function tracking(order) {

  if (!order.trackingNumber) {
    return '';
  }

  return `
    <tr>

      <td style="
        padding:18px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            border:1px solid #ff1f2d;
            background:#12090a;
          "
        >

          <tr>

            <td style="
              padding:16px;
            ">

              <div style="
                color:#ff1f2d;
                font-family:Arial,sans-serif;
                font-size:8px;
                font-weight:800;
                letter-spacing:1.5px;
              ">
                TRACKING NUMBER
              </div>

              <div style="
                margin-top:5px;
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:15px;
                font-weight:900;
                letter-spacing:.8px;
              ">
                ${escapeHtml(order.trackingNumber)}
              </div>

            </td>


            ${
              order.trackingUrl
                ? `
                  <td
                    width="110"
                    align="right"
                    style="padding:16px;"
                  >

                    <a
                      href="${escapeHtml(order.trackingUrl)}"
                      target="_blank"
                      style="
                        display:inline-block;
                        background:#ff1f2d;
                        color:#ffffff;
                        text-decoration:none;
                        padding:11px 13px;
                        border-radius:3px;
                        font-family:Arial,sans-serif;
                        font-size:9px;
                        font-weight:900;
                      "
                    >
                      TRACK NOW →
                    </a>

                  </td>
                `
                : ''
            }

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function statusMessage(config, status) {

  return `
    <tr>

      <td style="
        padding:20px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            border:1px solid #3a2022;
            background:#100b0c;
          "
        >

          <tr>

            <td
              width="55"
              valign="top"
              style="padding:18px;"
            >

              <div style="
                width:34px;
                height:34px;
                line-height:34px;
                border-radius:50%;
                border:1px solid #ff1f2d;
                color:#ff1f2d;
                text-align:center;
                font-family:Arial,sans-serif;
                font-size:14px;
                font-weight:900;
              ">
                ${status === 'delivered' ? '✓' : '▣'}
              </div>

            </td>


            <td
              valign="middle"
              style="
                padding:18px 18px 18px 0;
              "
            >

              <div style="
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:12px;
                font-weight:900;
                letter-spacing:.3px;
              ">
                ${config.messageTitle}
              </div>

              <div style="
                color:#858585;
                font-family:Arial,sans-serif;
                font-size:10px;
                line-height:16px;
                margin-top:5px;
              ">
                ${escapeHtml(config.message)}
              </div>

            </td>

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   REVIEW
========================================================= */

function review() {

  return `
    <tr>

      <td style="
        padding:20px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            border:1px solid #292929;
            background:#0d0d0d;
          "
        >

          <tr>

            <td
              align="center"
              style="
                padding:24px 15px;
              "
            >

              <div style="
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:12px;
                font-weight:900;
                letter-spacing:.5px;
              ">
                HOW WAS YOUR EXPERIENCE?
              </div>

              <div style="
                color:#666666;
                font-family:Arial,sans-serif;
                font-size:10px;
                line-height:16px;
                margin-top:6px;
              ">
                We’d love to hear what you think about your StrydeGoSox experience.
              </div>

              <div style="
                padding-top:15px;
              ">

                <a
                  href="${escapeHtml(BRAND.website)}"
                  target="_blank"
                  style="
                    color:#ff1f2d;
                    text-decoration:none;
                    font-family:Arial,sans-serif;
                    font-size:9px;
                    font-weight:900;
                    letter-spacing:.8px;
                  "
                >
                  VISIT STRYDEGOSOX →
                </a>

              </div>

            </td>

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   SHIPPING ADDRESS
========================================================= */

function shippingAddress(order) {

  const shipping =
    order.shipping || {};

  return `
    <tr>

      <td style="
        padding:20px 24px 0;
      ">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
        >

          <tr>

            <td
              width="50%"
              valign="top"
              style="
                padding-right:8px;
              "
            >

              <div style="
                color:#666666;
                font-family:Arial,sans-serif;
                font-size:8px;
                font-weight:800;
                letter-spacing:1.2px;
              ">
                SHIPPING ADDRESS
              </div>

              <div style="
                margin-top:8px;
                color:#bbbbbb;
                font-family:Arial,sans-serif;
                font-size:10px;
                line-height:17px;
              ">
                ${escapeHtml(order.customer?.name || '')}<br>
                ${escapeHtml(shipping.address || '')}<br>
                ${escapeHtml(shipping.city || '')} -
                ${escapeHtml(shipping.pin || '')}
              </div>

            </td>


            <td
              width="50%"
              valign="top"
              style="
                padding-left:8px;
              "
            >

              <div style="
                color:#666666;
                font-family:Arial,sans-serif;
                font-size:8px;
                font-weight:800;
                letter-spacing:1.2px;
              ">
                CONTACT
              </div>

              <div style="
                margin-top:8px;
                color:#bbbbbb;
                font-family:Arial,sans-serif;
                font-size:10px;
                line-height:17px;
              ">
                ${escapeHtml(order.customer?.email || '')}<br>
                ${escapeHtml(order.customer?.phone || '')}
              </div>

            </td>

          </tr>

        </table>

      </td>

    </tr>
  `;
}


/* =========================================================
   EMAIL FOOTER
========================================================= */

function footer() {

  return `
    <tr>

      <td
        align="center"
        style="
          padding:34px 24px;
          border-top:1px solid #202020;
          background:#080808;
        "
      >

        ${logo()}

        <div style="
          padding-top:16px;
          color:#555555;
          font-family:Arial,sans-serif;
          font-size:9px;
          line-height:15px;
        ">
          Need help with your order?
        </div>

        <div style="
          padding-top:5px;
        ">

          <a
            href="mailto:${escapeHtml(BRAND.support)}"
            style="
              color:#ff1f2d;
              text-decoration:none;
              font-family:Arial,sans-serif;
              font-size:9px;
              font-weight:800;
            "
          >
            ${escapeHtml(BRAND.support)}
          </a>

        </div>

        <div style="
          padding-top:18px;
          color:#3f3f3f;
          font-family:Arial,sans-serif;
          font-size:8px;
          line-height:13px;
        ">
          © ${new Date().getFullYear()} ${escapeHtml(BRAND.name)}.
          All rights reserved.
        </div>

      </td>

    </tr>
  `;
}


/* =========================================================
   MAIN HTML
========================================================= */

function buildEmail(order, status) {

  const config =
    getStatus(status);

  return `
<!DOCTYPE html>

<html
  lang="en"
  xmlns="http://www.w3.org/1999/xhtml"
>

<head>

  <meta
    http-equiv="Content-Type"
    content="text/html; charset=UTF-8"
  >

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="x-apple-disable-message-reformatting"
  >

  <title>
    ${escapeHtml(config.label)} —
    ${escapeHtml(order.orderNumber)}
  </title>

</head>


<body
  bgcolor="#000000"
  style="
    margin:0;
    padding:0;
    background:#030303;
    color:#ffffff;
  "
>

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    role="presentation"
    style="
      background:#030303;
      width:100%;
    "
  >

    <tr>

      <td
        align="center"
        style="
          padding:30px 10px;
        "
      >

        <table
          width="620"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            width:100%;
            max-width:620px;
            background:#080808;
            border:1px solid #202020;
          "
        >

          <tr>

            <td
              style="
                padding:20px 24px;
                border-bottom:1px solid #202020;
                background:#080808;
              "
            >

              ${logo()}

            </td>

          </tr>


          ${hero(
            order,
            config,
            status
          )}


          ${orderMeta(
            order,
            config,
            status
          )}


          ${statusMessage(
            config,
            status
          )}


          <tr>

            <td style="
              padding:26px 24px 0;
            ">

              <div style="
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:11px;
                font-weight:900;
                letter-spacing:1px;
              ">
                ORDER SUMMARY
              </div>

              <div style="
                width:35px;
                height:2px;
                margin-top:8px;
                background:#ff1f2d;
              "></div>


              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                role="presentation"
                style="
                  margin-top:8px;
                "
              >

                ${items(order)}

              </table>


              ${totals(order)}

            </td>

          </tr>


          ${shippingAddress(
            order
          )}


          ${tracking(
            order
          )}


          <tr>

            <td style="
              padding:0 24px;
            ">

              ${progress(status)}

            </td>

          </tr>


          ${
            status === 'delivered'
              ? review()
              : ''
          }


          <tr>

            <td
              align="center"
              style="
                padding:30px 24px;
              "
            >

              <a
                href="${escapeHtml(BRAND.website)}"
                target="_blank"
                style="
                  display:inline-block;
                  color:#ffffff;
                  background:#ff1f2d;
                  text-decoration:none;
                  padding:13px 18px;
                  border-radius:3px;
                  font-family:Arial,sans-serif;
                  font-size:10px;
                  font-weight:900;
                  letter-spacing:.8px;
                "
              >
                ${escapeHtml(config.button)}
              </a>

            </td>

          </tr>


          ${footer()}

        </table>

      </td>

    </tr>

  </table>

</body>

</html>
  `;
}

/*
                <div style="
                color:#ffffff;
                font-family:Arial,sans-serif;
                font-size:15px;
                font-weight:900;
                letter-spacing:.3px;
              ">
                HOW WAS YOUR EXPERIENCE?
              </div>

              <div style="
                margin-top:6px;
                color:#707070;
                font-family:Arial,sans-serif;
                font-size:10px;
              ">
                Your feedback helps us improve.
              </div>

              <div style="
                margin:14px 0;
                color:#ff1f2d;
                font-size:22px;
                letter-spacing:5px;
              ">
                ★ ★ ★ ★ ★
              </div>

              <a
                href="${escapeHtml(BRAND.website)}"
                target="_blank"
                style="
                  display:inline-block;
                  background:#ff1f2d;
                  color:#ffffff;
                  text-decoration:none;
                  font-family:Arial,sans-serif;
                  font-size:10px;
                  font-weight:900;
                  letter-spacing:.5px;
                  padding:12px 18px;
                  border-radius:3px;
                "
              >
                WRITE A REVIEW →
              </a>

            </td>

          </tr>

        </table>

      </td>

    </tr>
  `;
}


*/
/* =========================================================
   FOOTER
========================================================= */

function footer() {

  return `
    <tr>

      <td
        align="center"
        style="
          margin-top:25px;
          padding:30px 20px;
          background:#050505;
          border-top:1px solid #202020;
        "
      >

        ${logo()}


        <div style="
          margin-top:20px;
          font-family:Arial,sans-serif;
          font-size:9px;
          letter-spacing:.5px;
        ">

          <a
            href="${escapeHtml(BRAND.website)}"
            style="
              color:#888888;
              text-decoration:none;
            "
          >
            SHOP
          </a>

          &nbsp;&nbsp;·&nbsp;&nbsp;

          <a
            href="mailto:${escapeHtml(BRAND.support)}"
            style="
              color:#888888;
              text-decoration:none;
            "
          >
            SUPPORT
          </a>

          &nbsp;&nbsp;·&nbsp;&nbsp;

          <a
            href="${escapeHtml(BRAND.website)}"
            style="
              color:#888888;
              text-decoration:none;
            "
          >
            PRIVACY
          </a>

          &nbsp;&nbsp;·&nbsp;&nbsp;

          <a
            href="${escapeHtml(BRAND.website)}"
            style="
              color:#888888;
              text-decoration:none;
            "
          >
            TERMS
          </a>

        </div>


        <div style="
          margin-top:15px;
          color:#444444;
          font-family:Arial,sans-serif;
          font-size:8px;
        ">
          GSTIN: ${escapeHtml(BRAND.gstin)}<br>
          © ${new Date().getFullYear()} ${BRAND.name}. ALL RIGHTS RESERVED.
        </div>

      </td>

    </tr>
  `;
}


/* =========================================================
   COMPLETE EMAIL
========================================================= */

function buildEmail(order, status) {

  const config = getStatus(status);

  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0"
>

<meta
  name="x-apple-disable-message-reformatting"
>

<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">

<title>
  ${BRAND.name} — ${config.label}
</title>

<style>
  html, body {
    margin:0 !important;
    padding:0 !important;
    width:100% !important;
    background:#000000 !important;
    color:#ffffff !important;
    color-scheme:dark;
  }

  table, td {
    border-collapse:collapse;
  }

  img {
    border:0;
    outline:none;
    text-decoration:none;
    -ms-interpolation-mode:bicubic;
  }

  a {
    color:#ff1f2d;
  }

  @media only screen and (max-width:620px) {
    .email-container {
      width:100% !important;
      max-width:100% !important;
    }

    .mobile-padding {
      padding-left:16px !important;
      padding-right:16px !important;
    }

    .mobile-item-image {
      width:64px !important;
      height:64px !important;
    }
  }
</style>

</head>


<body
  style="
    margin:0;
    padding:0;
    background:#000000;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
  bgcolor="#000000"
  style="
    background:#000000;
  "
>

<tr>

<td align="center">


<table
  class="email-container"
  width="620"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
  bgcolor="#080808"
  style="
    width:620px;
    max-width:620px;
    background:#080808;
    color:#ffffff;
  "
>


<!-- HEADER -->

<tr>

<td
  align="center"
  style="
    padding:24px 20px 20px;
    background:#050505;
    border-bottom:1px solid #202020;
  "
>

  ${logo()}

</td>

</tr>


<!-- HERO -->

${hero(order, config, status)}


<!-- ORDER META -->

${orderMeta(order, config, status)}


<!-- TRACKING -->

${status === 'shipped' ? tracking(order) : ''}


<!-- ORDER -->

<tr>

<td
  class="mobile-padding"
  style="
    padding:28px 24px 0;
  "
>

<div style="
  color:#ffffff;
  font-family:Arial,sans-serif;
  font-size:15px;
  font-weight:900;
  letter-spacing:.5px;
">
  ORDER ITEMS
</div>

<div style="
  width:34px;
  height:2px;
  background:#ff1f2d;
  margin-top:8px;
"></div>


<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
  style="margin-top:8px;"
>

${items(order)}

</table>


${totals(order)}


<!-- PROGRESS -->

${progress(status)}

</td>

</tr>


<!-- STATUS -->

${statusMessage(config, status)}


<!-- REVIEW -->

${status === 'delivered' ? review() : ''}


<!-- FEATURES -->

<tr>

<td
  style="
    padding:28px 24px;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  role="presentation"
>

<tr>

<td
  width="33%"
  align="center"
  style="
    border-right:1px solid #292929;
  "
>

<div style="
  color:#ff1f2d;
  font-family:Arial,sans-serif;
  font-size:17px;
  font-weight:900;
">
  +
</div>

<div style="
  color:#ffffff;
  font-family:Arial,sans-serif;
  font-size:8px;
  font-weight:900;
  letter-spacing:.5px;
  margin-top:5px;
">
  FREE SHIPPING
</div>

<div style="
  color:#555555;
  font-family:Arial,sans-serif;
  font-size:7px;
  margin-top:3px;
">
  ON ORDERS ABOVE ₹1999
</div>

</td>


<td
  width="33%"
  align="center"
  style="
    border-right:1px solid #292929;
  "
>

<div style="
  color:#ff1f2d;
  font-family:Arial,sans-serif;
  font-size:17px;
  font-weight:900;
">
  ✓
</div>

<div style="
  color:#ffffff;
  font-family:Arial,sans-serif;
  font-size:8px;
  font-weight:900;
  letter-spacing:.5px;
  margin-top:5px;
">
  SECURE PAYMENTS
</div>

<div style="
  color:#555555;
  font-family:Arial,sans-serif;
  font-size:7px;
  margin-top:3px;
">
  SAFE & SECURE
</div>

</td>


<td
  width="34%"
  align="center"
>

<div style="
  color:#ff1f2d;
  font-family:Arial,sans-serif;
  font-size:17px;
  font-weight:900;
">
  ?
</div>

<div style="
  color:#ffffff;
  font-family:Arial,sans-serif;
  font-size:8px;
  font-weight:900;
  letter-spacing:.5px;
  margin-top:5px;
">
  NEED HELP?
</div>

<div style="
  color:#555555;
  font-family:Arial,sans-serif;
  font-size:7px;
  margin-top:3px;
">
  ${escapeHtml(BRAND.support)}
</div>

</td>

</tr>

</table>

</td>

</tr>


<!-- FOOTER -->

${footer()}


</table>

</td>

</tr>
</table>

</body>

</html>
  `;
}


/* =========================================================
   SEND
========================================================= */

async function sendOrderStatusEmail(order, status) {

  const allowed = [
    'processing',
    'processing_update',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
  ];

  if (!allowed.includes(status)) {
    return;
  }

  if (!order?.customer?.email) {
    console.warn(
      `No customer email for order ${order?.orderNumber || order?._id}`
    );

    return;
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is missing.');
    return;
  }

  const config = getStatus(status);

  const subjects = {

    processing:
      `StrydeGoSox — Order ${order.orderNumber} Confirmed`,

    processing_update:
      `StrydeGoSox: Your Order ${order.orderNumber} Is Being Prepared`,

    shipped:
      `StrydeGoSox — Your Order ${order.orderNumber} Is On The Way`,

    delivered:
      `StrydeGoSox — Order ${order.orderNumber} Delivered`,

    refunded:
      `StrydeGoSox — Order ${order.orderNumber} Refunded`

  };

  const subject =
    status === 'cancelled'
      ? `StrydeGoSox — Order ${order.orderNumber} Cancelled`
      : subjects[status];

  try {

    await getResendClient().emails.send(

      {
        from:
          process.env.EMAIL_FROM ||
          'StrydeGoSox <onboarding@resend.dev>',

        to: [
          order.customer.email
        ],

        replyTo:
          process.env.EMAIL_REPLY_TO ||
          undefined,

        subject:
          subject,

        html:
          buildEmail(order, status),

        headers: {
          'X-Entity-Ref-ID':
            `${order._id}-${status}`
        }
      },

      {
        idempotencyKey:
          `order-${order._id}-${status}`
      }

    );

    console.log(
      `✓ ${status} email sent for ${order.orderNumber}`
    );

  } catch (error) {

    console.error(
      `Resend error for ${order.orderNumber}:`,
      error
    );

    // Never allow an email failure to
    // break checkout/payment/order processing.
  }
}


module.exports = {
  sendOrderStatusEmail
};
