# StrydeGoSox — Architecture and workflow notes

This document expands the diagrams in the main repository README and describes how the browser experience, backend application, persisted commerce data and external providers fit together.

## 1. Runtime architecture

```mermaid
flowchart TB
  subgraph BROWSER["Browser experiences"]
    STOREFRONT["frontend/index.html<br/>main.js · js/store.js · style.css"]
    ADMIN["admin/admin.html<br/>admin/js/admin.js · cod.js · refunds.js"]
  end
  subgraph SERVER["Node.js / Express"]
    ENTRY["src/server.js"]
    SECURITY["Helmet · CSP · CORS<br/>rate limits · cookies · request IDs"]
    ROUTES["Public · Auth · Checkout · Payments<br/>Admin · COD · Refunds"]
    DOMAIN["Order · Inventory · Razorpay · Email helpers"]
  end
  subgraph DB["MongoDB"]
    USER[(User)]
    PRODUCT[(Product)]
    ORDER[(Order)]
    EVENTS[(WebhookEvent)]
    SETTINGS[(StoreSettings)]
  end
  subgraph PROVIDERS["External providers"]
    RAZORPAY["Razorpay"]
    RESEND["Resend"]
  end
  STOREFRONT --> ENTRY
  ADMIN --> ENTRY
  ENTRY --> SECURITY --> ROUTES --> DOMAIN
  DOMAIN <--> USER
  DOMAIN <--> PRODUCT
  DOMAIN <--> ORDER
  DOMAIN <--> EVENTS
  DOMAIN <--> SETTINGS
  DOMAIN <--> RAZORPAY
  DOMAIN --> RESEND
  RAZORPAY -->|"Signed callbacks"| ENTRY
```

## 2. Route responsibilities

| Route area | Responsibility |
|:--|:--|
| `public` | Public catalogue and store settings. |
| `auth` | Sign-in, session and account authentication. |
| `checkout` | Server-side cart repricing, checkout idempotency and stock reservation. |
| `payments` | Razorpay order creation, signature verification, webhooks and payment-state processing. |
| `admin` | Authenticated catalogue, inventory and order operations. |
| `cod` | Cash collection, failed-delivery and remittance workflow. |
| `refunds` | Eligible payment refunds, reconciliation and stock-restoration handling. |

## 3. Online checkout sequence

```mermaid
sequenceDiagram
  autonumber
  actor Buyer
  participant Web as Storefront
  participant API as Express API
  participant DB as MongoDB
  participant Gateway as Razorpay
  Buyer->>Web: Submit cart
  Web->>API: Checkout request + idempotency key
  API->>DB: Load catalogue records
  API->>API: Recalculate prices and validate quantities
  API->>DB: Reserve available inventory
  API->>Gateway: Create payment order
  Gateway-->>API: Gateway order reference
  API-->>Web: Checkout payload
  Web->>Gateway: Launch payment checkout
  Buyer->>Gateway: Pay
  Gateway-->>Web: Client callback
  Web->>API: Payment identifiers + signature
  API->>API: Verify signature and transaction values
  API->>DB: Advance order only when checks pass
  Gateway-->>API: Webhook callback
  API->>API: Verify webhook signature and deduplicate event
  API->>DB: Reconcile payment/order/inventory state
```

## 4. Inventory state model

```mermaid
stateDiagram-v2
  [*] --> Available
  Available --> Reserved: Checkout begins
  Reserved --> Committed: Order/payment accepted
  Reserved --> Available: Failure or reservation expiry
  Committed --> Available: Eligible refund or cancellation restoration
```

## 5. Cash-on-delivery lifecycle

```mermaid
flowchart LR
  A["COD order created"] --> B["Processing / dispatch"]
  B --> C["Shipped / in transit"]
  C --> D["Delivered / cash to collect"]
  D --> E["Cash collected and recorded"]
  E --> F["Courier remittance recorded"]
  C --> G["Delivery failed"]
  B --> G
  G --> H["Order cancelled / failure reason saved"]
  H --> I["Eligible stock restoration"]
```

COD collection and remittance are separate operational events. Online payment verification does not determine whether a COD recipient will accept a parcel.

## 6. Admin lifecycle

```mermaid
flowchart TD
  A["Admin sign-in"] --> B["Protected HTTP-only session cookie"]
  B --> C["Authentication and role middleware"]
  C --> D["Admin dashboard"]
  D --> E["Catalogue / stock maintenance"]
  D --> F["Order review / fulfilment"]
  D --> G["COD collection and remittance"]
  D --> H["Refund reconciliation"]
  E --> I["Validated API mutation"]
  F --> I
  G --> I
  H --> I
  I --> J["Persisted state and relevant notification"]
```

## 7. Data entities

```mermaid
erDiagram
  USER {
    ObjectId _id PK
    string email UK
    string passwordHash
    string role
  }
  PRODUCT {
    ObjectId _id PK
    string sku UK
    string name
    number price
    number stock
    number reserved
  }
  ORDER {
    ObjectId _id PK
    string orderNumber UK
    string checkoutKey UK
    string paymentMethod
    string paymentStatus
    string fulfillmentStatus
    number total
  }
  WEBHOOK_EVENT {
    ObjectId _id PK
    string eventId UK
    string event
    boolean processed
  }
  STORE_SETTINGS {
    string _id PK
    number shippingFee
  }
  PRODUCT ||--o{ ORDER : "referenced by order line items"
```

Order line items retain a product reference and a snapshot of SKU, product name, unit price and quantity. This lets order history retain the purchased details when the catalogue changes later.

## 8. Trust boundaries and safeguards

- The browser is an input surface, not the source of truth for final prices, payment status or inventory availability.
- Payment and webhook signatures are validated on the backend using server-side secrets.
- Repeated checkout submissions use an idempotency key; webhook events are tracked to reduce duplicate side effects.
- Admin routes apply authentication and role checks; protected session tokens are carried in HTTP-only cookies.
- Database and provider secrets belong in private environment configuration, never in frontend bundles or version control.

These are application-level controls. Effective production protection also depends on correct live configuration, secret rotation, database permissions, backups, monitoring and end-to-end operational tests.
