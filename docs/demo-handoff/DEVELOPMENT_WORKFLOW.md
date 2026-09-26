# Development Workflow

## Branch strategy
- `main`: stable demo
- `dev`: integration branch
- feature branches:
  - `feat/home`
  - `feat/catalog`
  - `feat/product`
  - `feat/cart`
  - `feat/checkout`
  - `feat/orders`

## Daily loop
1. Work defines task and acceptance criteria.
2. Codex implements on a feature branch.
3. Run:
   - TypeScript check
   - Expo start / runtime check
4. Review changed files.
5. Test on phone with Expo Go.
6. Merge into `dev`.
7. End of day: smoke test.
8. Only merge to `main` when demo flow is stable.

## Commit style
Examples:
- `feat: add catalog search and category filters`
- `feat: implement shipping selection in checkout`
- `fix: correct free shipping threshold`
- `ui: refine product cards`
- `chore: update mock product data`

## Release tags
- `demo-v0.1`
- `demo-v0.2`
- `demo-v0.3`
- `demo-rc1`
- `demo-final`

## Bug priority
P0 — app cannot run / checkout blocked
P1 — business rule incorrect
P2 — important UX issue
P3 — cosmetic issue
