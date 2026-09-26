# CASA & TE — Implementation Plan for Codex

## Phase 0 — Make the project runnable
Goal:
- project installs
- Expo starts
- all routes resolve
- no blocking runtime errors

Tasks:
1. inspect package.json and Expo config
2. install only missing dependencies
3. verify Expo Router
4. fix path aliases if needed
5. verify asset paths
6. run TypeScript checks
7. start app in Expo

Definition of done:
- Home screen opens
- tabs work
- product route opens
- checkout route opens
- no crash

## Phase 1 — Core shopping flow
Goal:
- browse → product → cart

Tasks:
1. Home
2. Catalog search/filter
3. Product detail
4. Add to cart
5. quantity change
6. remove item
7. subtotal
8. total weight

Definition of done:
- cart values always correct
- cart survives app reload

## Phase 2 — Shipping + checkout
Goal:
- fulfilment choice and correct shipping

Tasks:
1. use `calculateShipping()` as single source of truth
2. home delivery
3. pickup point
4. store pickup
5. dynamic shipping display
6. €66 free shipping <=10kg
7. checkout summary
8. mock payment selector

Definition of done:
- all shipping acceptance cases pass

## Phase 3 — Orders
Goal:
- complete end-to-end demo flow

Tasks:
1. create mock order
2. clear cart after confirmation
3. persist order locally
4. order success screen
5. orders list
6. status timeline

Definition of done:
- complete order appears after app reload

## Phase 4 — UI polish
Goal:
- management-ready demo

Tasks:
1. refine typography
2. spacing consistency
3. brand colors
4. improve product cards
5. improve selected states
6. improve empty states
7. ensure Italian copy is clean

Definition of done:
- app looks credible on a real phone

## Phase 5 — Real content
Goal:
- replace placeholders with approved CASA & TE data

Only proceed when approved real data is provided.

Tasks:
- products
- prices
- images
- categories
- store labels

Do not invent missing business data.
