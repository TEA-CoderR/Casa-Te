# CASA & TE Mobile App — Project Context

## 1. Business context

CASA & TE is an Italian household-goods retail chain with 5 physical stores:
- 1 store in Arezzo
- 4 stores in Lucca

Current problem:
- The company currently has no online sales channel.
- The goal is to build an online sales capability starting with Arezzo and Lucca.
- Longer term, the model may expand beyond the initial cities and potentially across Europe.

The immediate goal is NOT a production launch.
The immediate goal is to deliver a convincing, real mobile app demo by the end of September 2026.

## 2. Product goal

The demo must feel like a real customer-facing shopping app, not a slide deck or static prototype.

A manager should be able to use a real phone and complete this flow:

Home
→ browse/search products
→ open product
→ add to cart
→ adjust quantity
→ see cart subtotal and total weight
→ choose fulfilment method
→ see shipping price update
→ checkout
→ confirm mock order
→ view order in Orders

## 3. Customer app language

Customer-facing UI language: Italian.

Engineering docs/code comments may be English.

## 4. Brand direction

Use CASA & TE branding:
- Primary green: #2F6634
- Dark green: #214B27
- Accent lime: #D9EE2F
- Background: #F6F7F4
- White surfaces
- Clean, practical, retail-oriented UI

Avoid:
- generic AI-looking cards everywhere
- excessive gradients
- overly technical UI
- fake "premium fintech" visual language

## 5. Stores

Demo store selector:
- Arezzo
- Lucca 1
- Lucca 2
- Lucca 3
- Lucca 4

Do NOT invent real store addresses unless explicitly provided later.

## 6. Shipping model

The CASA & TE shipping model is intentionally different from the competitor benchmark.

Customer fulfilment options:
1. Home delivery
2. Pickup point / locker
3. Store pickup

Store pickup:
- always €0

Shipping rules currently agreed for orders <=10kg:

### Order subtotal < €25
- 0–2 kg:
  - Home: €4.90
  - Pickup point: €3.90
  - Store pickup: €0
- >2–5 kg:
  - Home: €6.90
  - Pickup point: €4.90
  - Store pickup: €0
- >5–10 kg:
  - Home: €8.90
  - Pickup point: €6.90
  - Store pickup: €0

### Order subtotal €25–44.99
- 0–2 kg:
  - Home: €3.90
  - Pickup point: €2.90
  - Store pickup: €0
- >2–5 kg:
  - Home: €5.90
  - Pickup point: €3.90
  - Store pickup: €0
- >5–10 kg:
  - Home: €7.90
  - Pickup point: €5.90
  - Store pickup: €0

### Order subtotal €45–65.99
- 0–2 kg:
  - Home: €2.90
  - Pickup point: €1.90
  - Store pickup: €0
- >2–5 kg:
  - Home: €4.90
  - Pickup point: €2.90
  - Store pickup: €0
- >5–10 kg:
  - Home: €6.90
  - Pickup point: €4.90
  - Store pickup: €0

### Free shipping
- Order subtotal >= €66
- AND total order weight <=10 kg
- Home delivery: free
- Pickup point: free
- Store pickup: already always free

### >10kg
The exact final production rule is NOT finalized.
For demo purposes only, the starter currently uses:
- Home: €12.90
- Pickup point: €9.90

This >10kg fallback must be treated as provisional and easy to change.

Source of truth in code:
`src/config/shipping.ts`

Do not change shipping rules without explicit approval.

## 7. Competitor benchmark

Risparmio Casa is used only as a benchmark/reference for logic, not copied directly.

Competitor reference:
- 0–30kg: €5.90
- 30.1–50kg: €12.90
- 50.1–150kg: €14.90
- >150kg: €24.90
- free shipping over €70 when billable weight is below 50kg

We decided CASA & TE should instead use:
- order value + weight + fulfilment method
- cheaper pickup-point shipping
- always-free store pickup
- free shipping from €66 for <=10kg

## 8. Membership / loyalty

CASA & TE already has its own membership card.

Do NOT build a new loyalty-points system into this demo.

Loyalty integration is Phase 2 after the demo is approved.

## 9. Logistics / payments / backend

For the end-of-month demo, DO NOT connect:
- Packlink API
- Sendcloud API
- real courier API
- POS
- ERP
- real inventory
- production database
- real payment processing
- real authentication
- loyalty card system
- push notifications

The demo may use local mock data and local persistence.

## 10. Known logistics research

Packlink was tested manually in the real account and showed that:
- locker/shop-to-shop options are cheaper
- home delivery is more expensive
- this supports offering multiple fulfilment methods to customers

Do not hardcode marketing "from" rates as production truth.

## 11. Product data

Current product data in the starter are placeholders.

Rules:
- do not present placeholder data as real CASA & TE inventory
- do not invent actual stock
- do not invent real store addresses
- when real products are supplied later, replace the mock dataset cleanly in `src/data`

## 12. Demo scope

Must-have:
- Home
- Catalog
- Search
- Category filtering
- Product detail
- Cart
- Quantity changes
- Subtotal
- Order weight
- Dynamic shipping calculation
- Fulfilment selection
- Checkout
- Mock payment selection
- Mock order confirmation
- Orders history
- Order status timeline
- Local persistence
- Native phone experience via Expo

Nice-to-have only if time permits:
- better store selector
- better empty states
- order re-purchase
- simple promo banner
- improved product sorting
- polished loading/skeleton states

Not required for demo:
- account registration
- backend
- real payments
- real logistics
- real stock sync
- admin dashboard
- refund workflow
- loyalty card

## 13. Deadline priority

Deadline: end of September 2026.

Priority order:
1. App runs reliably on real phone
2. Core shopping flow works end-to-end
3. Shipping logic is correct
4. UI looks credible
5. Real CASA & TE product content is inserted
6. Only then add optional polish

Do not sacrifice stability for extra features.
