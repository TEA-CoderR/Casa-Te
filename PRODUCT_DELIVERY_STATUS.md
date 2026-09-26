# Commercial product delivery

The user ended the demo phase on 2026-09-27. Historical demo documents describe the archived presentation, not the product acceptance criteria. Commercial scope: self-operated ordinary department-store goods; selected store pilots; home delivery and store collection; enterprise adapters pending interface documentation.

## Implemented and verified

- `backend/` is a separate PostgreSQL product service. No static product fixtures or JSON-file order fallback are loaded.
- Versioned migration, active products/stores, stock, persisted quotes, order snapshots, audit trail, and transactional outbox.
- Server-derived prices and shipping, quote ownership, expiry and price-change checks; unsupported weight rules fail explicitly.
- Atomic multi-line stock reservation, cross-process idempotency, scoped customer reads and store-operator permissions.
- Order lifecycle for delivery and collection; optimistic version checks; ordinary accounts cannot confirm payment.
- Unpaid reservations expire after 15 minutes and release stock. This technical default needs business validation before launch.
- Password hashing with salted scrypt, hashed opaque sessions, eight-hour expiry, logout/revocation, database-backed login throttle.
- Operator web console at `/operations`: login, assigned-store orders, status filter, line details, five-second refresh, preparation and handover actions.
- PostgreSQL integration tests cover concurrent last-item reservation, retries, rollback, scoped access, lifecycle, expiry workers, login/logout and HTTP submission. CI now provisions PostgreSQL for these tests.

## Not ready for commercial launch

The customer app and original administration remain the historical demo clients. They are not connected to `/v2`. This delivery is a functioning product backend increment, not a complete released product.

Remaining engineering includes native account flows and secure token storage, server-driven catalog/cart/checkout and addresses, payment provider/webhook verification and reconciliation, cancellation/refund/returns, shipment labels/tracking, notification delivery and outbox processing, catalog/inventory import and enterprise reconciliation, richer operations tools with pagination/search, and staff MFA/SSO. The present outbox records events but does not deliver them. Account provisioning is controlled; public registration and email verification are not yet implemented.

Production infrastructure, verified company/legal content, product/store data, payment/logistics accounts, ERP/POS/PIM contracts, backup/restore drills, monitoring, incident operations, load testing, security review, accessibility and release acceptance remain required. No commercial-readiness claim is made by passing local tests.

## Run locally

Requires Node 24+ and PostgreSQL 18. Set `DATABASE_URL` in the process environment; do not commit credentials.

```text
npm run db:migrate
npm run product:server
```

Default bind: `127.0.0.1:8887`; operations: `http://127.0.0.1:8887/operations`. `HOST` and `PORT` are configurable. Deploy behind HTTPS; the local listener does not terminate TLS. No default login or business data is created.

Controlled account provisioning uses `ACCOUNT_EMAIL`, `ACCOUNT_PASSWORD` (12–128 characters), `ACCOUNT_ROLE` (`customer` or `operator`) and, for operators, explicit comma-separated `ACCOUNT_STORE_IDS`:

```text
npm run account:provision
```

Fixtures belong only in test/development environments. The local container `casa-te-product-test-db` uses an isolated test database and a loopback-only port 55432. Its test password is not a production credential. Integration tests create and drop their own random schema without resetting product tables:

```text
npm run typecheck:backend
# Set TEST_DATABASE_URL to an isolated PostgreSQL test database.
npm run test:integration
```

## API

- `POST /v2/auth/login` `{email,password}` → bearer token; `POST /v2/auth/logout` revokes it.
- Authenticated `GET /v2/products`, `GET /v2/stores`.
- `POST /v2/quotes` → server-calculated quote; stock is reserved only during order creation.
- `POST /v2/orders` `{quoteId}` with `Idempotency-Key` → persisted awaiting-payment order.
- `GET /v2/orders`, `GET /v2/orders/:id` → caller-scoped orders (list currently limited to newest 100).
- `PATCH /v2/orders/:id/status` `{version,status}` → authorized lifecycle transition.
- `GET /health` checks database connectivity.

There is deliberately no public route for claiming payment success. A future verified payment adapter calls the domain boundary with a service principal. Pending integration events remain durable in the outbox until a delivery worker is implemented.
