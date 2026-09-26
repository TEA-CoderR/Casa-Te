# CASA & TE — Work Mode Kickoff

## Mission
Build a real mobile app demo for CASA & TE by the end of September.

## Product
Italian household-goods retail app for 5 physical stores:
- 1 store in Arezzo
- 4 stores in Lucca

## Demo user flow
Home
→ Catalog
→ Product detail
→ Add to cart
→ Cart
→ Choose fulfilment
→ Checkout
→ Mock order confirmation
→ Orders

## Mobile stack
- React Native
- Expo
- TypeScript
- Expo Router
- Zustand
- AsyncStorage

## What Work should own
- Product requirements
- Sprint planning
- UX review
- QA checklist
- File/project organization
- Coordination of coding tasks
- Release readiness

## What Codex should own
- Implementing React Native code
- Refactoring
- Fixing TypeScript/runtime errors
- Writing tests
- Running lint/type checks
- Preparing commits / PR-ready changes

## What GitHub should own
- Single source of truth
- Version history
- Branches
- Pull requests
- Issues
- Demo release tags

## Hard business rules
Do not change shipping logic without explicit approval.
Source of truth: `src/config/shipping.ts`.

## Demo acceptance criteria
A manager can:
1. Open the app on a real phone
2. Browse and search products
3. Open a product
4. Add products to cart
5. Change quantity
6. See order weight
7. Choose:
   - Home delivery
   - Pickup point / locker
   - Store pickup
8. See shipping recalculate
9. Reach €66 and get free shipping when <=10kg
10. Confirm a mock order
11. See order in Orders

## Not in scope before demo approval
- Real payment
- Real logistics API
- ERP/POS integration
- Real authentication
- Loyalty card
- Production backend
- Push notifications
