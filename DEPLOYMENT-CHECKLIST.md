# StrydeGoSox Go-Live Checklist

## Before launch

- [ ] Node.js 20+
- [ ] MongoDB Atlas database created
- [ ] Restricted MongoDB user created
- [ ] Database backups enabled
- [ ] Strong `JWT_SECRET`
- [ ] Strong `ADMIN_PASSWORD`
- [ ] Production domain configured
- [ ] HTTPS enabled
- [ ] `PUBLIC_APP_URL` points to HTTPS storefront
- [ ] `ADMIN_URL` points to HTTPS admin
- [ ] Razorpay Live Key ID configured
- [ ] Razorpay Live Key Secret configured only on server
- [ ] Webhook secret configured
- [ ] Razorpay webhook points to `/api/payments/webhook`
- [ ] `payment.captured` enabled
- [ ] `payment.failed` enabled
- [ ] `order.paid` enabled
- [ ] Razorpay auto-capture settings reviewed
- [ ] Seeded/verified production catalogue
- [ ] Stock quantities checked
- [ ] Shipping and tax settings checked

## Purchase QA

- [ ] Add to cart
- [ ] Quantity + / -
- [ ] Remove item
- [ ] Server price validation
- [ ] Out-of-stock protection
- [ ] COD order
- [ ] Razorpay test payment
- [ ] Failed payment
- [ ] Payment modal dismissal
- [ ] Duplicate checkout click
- [ ] Webhook event received
- [ ] Admin order appears
- [ ] Inventory decreases
- [ ] Admin status update
- [ ] Refund
- [ ] Refunded stock restored
- [ ] CSV export
- [ ] Admin live-sync notification

## Security QA

- [ ] `.env` is not committed to Git
- [ ] Razorpay secret never appears in frontend source
- [ ] Admin API rejects unauthenticated requests
- [ ] CORS only allows real storefront/admin origins
- [ ] HTTPS only in production
- [ ] Rate limits enabled
- [ ] Helmet enabled
- [ ] Admin password rotated before handoff
