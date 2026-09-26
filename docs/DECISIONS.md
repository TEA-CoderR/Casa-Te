# CASA & TE — Frozen Decisions

These decisions are already agreed and should NOT be reopened unless explicitly requested.

1. This is a real mobile app, not a web app.
2. Stack: React Native + Expo + TypeScript.
3. Use one codebase for iOS and Android.
4. Expo Go is acceptable for development/demo testing.
5. Git/GitHub is recommended as the source of truth, but local development can begin before remote setup.
6. Codex is the main coding agent.
7. Work mode is not required.
8. Customer UI is Italian.
9. Loyalty points are NOT part of the demo.
10. Real payment is NOT part of the demo.
11. Real logistics API is NOT part of the demo.
12. Real backend is NOT required for demo.
13. Store pickup is always free.
14. Free shipping threshold is €66 for <=10kg.
15. Shipping depends on order subtotal + weight + fulfilment method.
16. Shipping logic lives in one source-of-truth file.
17. Do not invent real inventory, prices, or addresses.
18. Stability and complete shopping flow are more important than extra features.

## Phase 2 — commercial platform (September 2026)

Decisions 10–12 and 16 above applied to the demo only and are superseded by:

19. Backend: Supabase (Postgres + Auth + Storage + Edge Functions), EU region.
20. Payments: Stripe Checkout (hosted page; cards, Apple Pay, Google Pay and any method enabled in the Stripe dashboard).
21. Shipping rules live in `public.shipping_rates` (editable by managers). The agreed values are the migration defaults and are mirrored in `packages/shared/src/shipping.ts`; parity with the approved demo calculator is tested in CI.
22. Prices, discounts, shipping and stock are computed server-side only; clients send ids and quantities.
23. Stock is tracked per store; each order is prepared by the customer's selected store and reserves stock at creation (released after 35 minutes if unpaid).
24. Customer login is passwordless (6-digit email code). Staff use email + password via invitation.
25. Coupon discounts reduce the goods value used for shipping bands and the free-shipping threshold (to be confirmed by the business — see docs/LAUNCH_CHECKLIST.md).
26. The web shop is the Expo app built for web (one codebase for iOS, Android and web).
27. Catalogue data comes from the admin console and CSV import; ERP/POS integration is a later phase.
28. Deleting an account removes profile, addresses and login; orders are retained without the account link (fiscal retention).
