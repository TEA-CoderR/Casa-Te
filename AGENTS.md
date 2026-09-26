# CASA & TE App — Engineering Instructions

You are working on a real retail mobile app for CASA & TE, an Italian household-goods retail chain with 5 physical stores (1 Arezzo, 4 Lucca).

## Product goal
Deliver a commercial retail product for store pilots: native customer app, operations administration, and persistent transactional services. The user has ended the demo phase. See COMMERCIAL_LAUNCH_PLAN.md for scope and missing external inputs.

## Stack
- React Native
- Expo
- TypeScript
- Expo Router
- Zustand
- AsyncStorage

## Engineering rules
1. Do not change shipping business rules without explicit approval.
2. Keep business logic outside UI components.
3. Type all domain entities.
4. Keep screens small; extract reusable UI into `src/components`.
5. Build production services with persisted data, authorization, explicit state transitions, and transactional inventory. Keep demo fixtures separate from production.
6. Keep the app runnable in Expo Go whenever possible.
7. Avoid unnecessary dependencies.
8. UI language for the customer app is Italian.
9. Code and engineering comments may be English.
10. Mobile-first: test 360–430px width layouts.
11. Do not invent real product data, prices, inventory, or store addresses.
12. Mock data must be visibly isolated in `src/data`.

## Brand
- Primary green: #2F6634
- Dark green: #214B27
- Accent lime: #D9EE2F
- Background: #F6F7F4
- Clean, practical retail UI; avoid overly "AI-generated" card-heavy layouts.

## Shipping rules
See `src/config/shipping.ts`. Treat it as the source of truth.

## Historical demo acceptance criteria
A manager must be able to:
1. Open the app
2. Browse/search products
3. Open a product
4. Add products to cart
5. Change quantities
6. See order total weight
7. Choose home / pickup point / store pickup
8. See shipping recalculate
9. Reach €66 and see free shipping (<=10kg)
10. Confirm a mock order
11. View it in Orders

## Before changing code
- Read relevant types/config/store first.
- Preserve existing flows unless the task says otherwise.
- After changes, run TypeScript checks and app startup if available.
