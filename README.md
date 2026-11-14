<div align="center">
  <img src="01-home-hero.jpg" alt="StrydeGoSox storefront hero — Anytime. Anywhere. Every Step." width="100%" />
  <h1>StrydeGoSox</h1>
  <p><strong>Full-stack e-commerce storefront · Secure checkout · Admin operations</strong></p>
  <p>
    <a href="https://strydegosox.com">Live website</a>
    &nbsp;·&nbsp;
    <a href="#architecture">Architecture</a>
    &nbsp;·&nbsp;
    <a href="#security-and-order-integrity">Security</a>
  </p>
  <img src="https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-111827?style=flat-square" alt="Frontend stack" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-1f6feb?style=flat-square" alt="Backend stack" />
  <img src="https://img.shields.io/badge/Database-MongoDB-15803d?style=flat-square" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Payments-Razorpay-334155?style=flat-square" alt="Razorpay" />
</div>

---

## Project overview

StrydeGoSox is a branded e-commerce experience for pocket compression socks. The application brings together a customer storefront, persistent cart, checkout, payment processing, order history and an owner-facing admin workspace for catalogue, inventory and fulfilment operations.

The engineering focus was not limited to the storefront UI. The backend owns important commerce decisions—pricing, payment-state verification, inventory reservations, order-state changes and privileged admin actions—so that the browser is not treated as a trusted source of truth.

## Product experience

### Storefront hero

The hero section introduces the product proposition: a full pair of compression socks folded into a pocket-sized tin, supported by a prominent product visual and clear purchase path.

### Product specifications

<img src="02-product-specifications.jpg" alt="StrydeGoSox product specifications section" width="100%" />

### Bundle and pack selection

<img src="03-bundle-options.jpg" alt="StrydeGoSox bundle options with 3, 5 and 10 pair packs" width="100%" />

## Core capabilities

| Area | Implemented capability |
|:--|:--|
| **Storefront** | Responsive product storytelling, product details, cart, quantity controls and checkout entry point. |
| **Cart & checkout** | Persistent cart and backend checkout validation using authoritative catalogue data. |
| **Payments** | Razorpay Standard Checkout, server-side signature verification and webhook processing. |
| **Cash on delivery** | COD order creation and owner-side collection/fulfilment lifecycle. |
| **Inventory** | Stock validation, pending-payment reservations, commit/release handling and refund-related restoration. |
| **Admin workspace** | Product catalogue, inventory adjustments, order search/filter, status updates and fulfilment tracking. |
| **Refunds** | Refund workflow for eligible captured Razorpay payments, with reconciliation and inventory restoration safeguards. |
| **Notifications** | Transactional order/status emails through Resend, with idempotency safeguards for supported operations. |
| **Operations** | CSV export, health/readiness endpoint, request IDs and server-side logging. |

## Architecture

<a id="architecture"></a>

```mermaid
flowchart LR
    C[Customer browser] --> UI[Storefront]
    A[Owner / admin] --> AD[Admin dashboard]
    UI --> API[Node.js / Express API]
    AD --> API
    API --> DB[(MongoDB via Mongoose)]
    API <--> RP[Razorpay]
    API --> EM[Resend email API]
    RP -->|Signed webhook events| API
```

The frontend and admin UI call the backend API. The backend coordinates persisted catalogue/order state, payment provider interactions and transactional email. Payment and inventory decisions remain server-side.

## Security and order integrity

<a id="security-and-order-integrity"></a>

Checkout and order processing include several layers of protection designed to reduce tampering, duplicate processing and inconsistent commerce state.

| Risk | Safeguard | Why it matters |
|:--|:--|:--|
| Browser-side price manipulation | Checkout recalculates prices from database product records. | Prevents a submitted browser total from becoming the trusted order amount. |
| Forged or mismatched online payment | Razorpay signature verification plus expected amount, currency and order-ownership checks. | Prevents a browser success response by itself from confirming an online order as paid. |
| Forged gateway notification | Webhook signature verification using the raw request body and configured webhook secret. | Helps authenticate incoming payment events before the application acts on them. |
| Duplicate webhook delivery | Event tracking using Razorpay event IDs, deterministic fallback identifiers and database uniqueness protection. | Reduces repeated side effects when the gateway retries or redelivers an event. |
| Repeated checkout submission | Checkout idempotency through an `Idempotency-Key`. | Reduces accidental duplicate order creation from repeated clicks or request retries. |
| Stock overselling / drift | Server-side availability checks and transaction-aware reserve, commit, release and restoration flows. | Keeps inventory aligned with pending, captured, failed, expired and refunded order states. |
| Conflicting refund requests | Refund concurrency protection and payment reconciliation. | Helps avoid competing refund operations and inconsistent stock restoration. |
| Unauthorised admin access | JWT authentication, role enforcement, bcrypt password hashing and HTTP-only session cookies. | Protects privileged product, inventory and order operations. |
| Common request abuse | Helmet/CSP, restricted CORS, rate limits, input validation and no-store handling for sensitive responses. | Adds defence-in-depth around public APIs and authenticated admin surfaces. |
| Duplicate notification side effects | Backend-triggered transactional email with idempotency on supported operations. | Reduces repeated confirmation/status notifications on retries. |

### Online-payment lifecycle

```mermaid
flowchart TD
    A[Customer submits cart] --> B[Backend reloads trusted prices]
    B --> C[Validate stock and reserve inventory]
    C --> D[Create Razorpay payment order]
    D --> E[Customer completes checkout]
    E --> F[Backend verifies signature, amount, currency and order ownership]
    F -->|Valid| G[Advance order/payment state]
    F -->|Invalid| H[Do not mark order paid]
    I[Razorpay webhook arrives] --> J[Verify webhook signature]
    J --> K[Deduplicate event]
    K --> L[Apply eligible event once]
    G --> M[Commit inventory and trigger order notification]
    L --> M
    H --> N[Keep order unconfirmed / handle failure path]
```

### Inventory lifecycle

```mermaid
stateDiagram-v2
    [*] --> Available
    Available --> Reserved: Checkout begins
    Reserved --> Committed: Payment captured / order accepted
    Reserved --> Available: Payment fails or reservation expires
    Committed --> Available: Eligible cancellation / refund restores stock
```

**Security impact:** these controls reduce opportunities for price tampering, forged payment confirmation, duplicate checkout creation, replayed webhook side effects and inventory inconsistency. They strengthen order integrity, but they are not a guarantee against all fraud. A specific fraud-prevention percentage has not been measured from production event data. COD non-acceptance/no-show risk is separate from Razorpay payment verification.

## Business activity

The client reported **70 orders in the first week** and **500+ orders in the first month** after launch. These are client-reported order counts, not independently audited conversion, revenue or profit uplift figures.

## Technology stack

- **Frontend:** HTML5, CSS3, JavaScript
- **Backend:** Node.js, Express.js, REST APIs
- **Database:** MongoDB, Mongoose
- **Payments:** Razorpay
- **Email:** Resend
- **Security & middleware:** JWT, bcryptjs, Helmet, CSP, CORS, express-rate-limit, HTTP-only cookies
- **Operations:** request IDs, logging, health/readiness checks, CSV export

## Current repository snapshot

The current public `main` branch contains the root-level storefront and operational scripts, environment template, documentation, and three product screenshots.

**Important:** the current GitHub tree does not yet include the nested `frontend/`, `admin/` or `src/` directories referenced by the original package layout. The supplied `package.json` currently points its entry point and QA commands at `src/server.js` and other `src/` modules, so a fresh clone of this GitHub snapshot is **not yet a complete runnable copy**. The full nested source folders still need to be added before the local setup commands can work.

### Files currently visible at the repository root

```text
.env.example
.gitignore
01-home-hero.jpg
02-product-specifications.jpg
03-bundle-options.jpg
DEPLOYMENT-CHECKLIST.md
FRONTEND-DESIGN-README.md
README.md
SECURITY.md
admin.js
cod.js
config.js
email.js
index.html
llms.txt
main.js
orders.js
package.json
package-lock.json
production-qa.js
razorpay.js
refunds.js
seed.js
store.js
style.css
test-email.js
```


## Deployment and verification notes

The repository includes `DEPLOYMENT-CHECKLIST.md` for environment, payment, inventory, refund and security checks. Before live operation, configure the production domain, HTTPS, restricted database user, backups, live Razorpay keys/webhook, verified email sender and private environment secrets; then test successful/failed payments, duplicate checkout, webhook retries, COD, cancellations, refunds and inventory restoration end to end.

This repository is an implementation and portfolio case study, not a penetration-test report, security certification or independent production-readiness attestation. Production behavior depends on the live environment and operational configuration.

## Project media

The three supplied project reference screenshots are stored at the repository root: `01-home-hero.jpg` (storefront hero), `02-product-specifications.jpg` (product details) and `03-bundle-options.jpg` (bundle selection).
