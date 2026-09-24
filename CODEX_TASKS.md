# Codex Sprint Backlog — CASA & TE

## Sprint 1 — Native demo foundation
### Task 1 — Verify project
- Ensure Expo Router routes compile.
- Ensure all imports resolve.
- Run on Android and iOS via Expo Go.
- Fix only compile/runtime issues. Do not redesign yet.

### Task 2 — Brand polish
- Improve spacing and typography.
- Use CASA & TE green/lime brand.
- Keep interface practical and Italian-retail-like.
- Do not add decorative gradients/cards everywhere.

### Task 3 — Home
- Promotional hero
- Product categories
- Featured products
- Store selector (mock)
- Search entry point

### Task 4 — Catalogue
- Category filter
- Search
- Product grid/list
- Product availability
- Navigate to product detail

### Task 5 — Product detail
- Product name, category, price, weight
- Availability
- Quantity
- Add to cart

### Task 6 — Cart + shipping engine
- Cart quantity management
- Subtotal
- Total weight
- Shipping preview
- Preserve all rules in `src/config/shipping.ts`

### Task 7 — Checkout
- Fulfilment selector:
  - home
  - pickup point
  - store
- Address fields for delivery
- Mock payment method selector
- Price summary
- Mock confirmation

### Task 8 — Orders
- Persist mock order locally
- Order status timeline
- Reorder

## Do not implement yet
- authentication
- real payments
- Packlink API
- real ERP inventory
- production backend
- push notifications
- loyalty card integration
