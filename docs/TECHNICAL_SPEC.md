# CASA & TE Mobile App — Technical Specification

## Stack

- React Native
- Expo
- TypeScript
- Expo Router
- Zustand
- AsyncStorage

## Why

This stack is chosen to:
- deliver iOS + Android quickly
- allow real-phone testing via Expo Go
- keep one codebase
- avoid unnecessary backend complexity before demo approval

## Architecture

Suggested structure:

src/
  app/
    (tabs)/
      _layout.tsx
      index.tsx
      catalog.tsx
      cart.tsx
      orders.tsx
      profile.tsx
    product/
      [id].tsx
    checkout.tsx
    order-success.tsx
    _layout.tsx

  components/
  config/
    theme.ts
    shipping.ts
    stores.ts
  data/
    products.ts
  store/
    cart.ts
    orders.ts
  types/
    product.ts
    order.ts

## State

Zustand:
- cart
- orders
- later: store selection / user preferences

AsyncStorage:
- cart persistence
- mock order persistence

## Business logic

Business logic must NOT be embedded deeply inside screen UI.

Examples:
- shipping calculation -> `src/config/shipping.ts`
- cart derived totals -> store selector/helper
- product dataset -> `src/data/products.ts`

## Code quality

Requirements:
- strict TypeScript where practical
- no `any` unless unavoidable
- no duplicated shipping logic
- no duplicated pricing logic
- reusable UI components
- keep route screens readable
- minimal dependencies
- Expo Go compatible

## Testing priority

Before visual polish:
1. TypeScript compiles
2. navigation works
3. cart state works
4. shipping is correct
5. checkout works
6. orders persist

## Backend policy

No production backend before demo approval.

When Phase 2 starts, likely candidates:
- Supabase / Firebase / custom backend
- Stripe / Nexi / PayPal
- logistics API
- inventory / ERP integration

Do not prematurely add these.
