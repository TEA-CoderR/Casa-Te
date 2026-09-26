# CASA & TE — Online sales platform

Customer app (iOS · Android · web shop), back office and store picking for the CASA & TE chain,
built on Supabase and Stripe.

> The original September 2026 demo is preserved on `main` at commit `031e8f4`; its handoff documents
> are in `docs/demo-handoff/`.

## 中文概览

| 模块 | 位置 | 说明 |
|---|---|---|
| 顾客 App + 网页商城 | `apps/mobile` | Expo，一套代码同时出 iOS、Android、Web；浏览/搜索、门店库存、购物车、三种配送方式、优惠码、发票信息、Stripe 支付、订单跟踪、邮箱验证码登录、地址簿、删除账号 |
| 运营后台 + 门店拣货端 | `apps/admin` | 仪表盘、订单处理、拣货流程、退款/取消、商品与图片、CSV 批量导入、库存与流水、分类、优惠码、运费规则、自提点、客户、门店、员工权限 |
| 后端 | `supabase/` | PostgreSQL 表结构 + 行级权限（RLS）；价格、运费、库存全部在服务端计算；Stripe 结账、Webhook、退款、邮件通知等 Edge Functions |
| 共享业务逻辑 | `packages/shared` | 金额（分）、重量（克）、运费规则、订单状态、校验、错误提示 |

上线前需要公司提供或确认的事项见 **`docs/LAUNCH_CHECKLIST.md`**，部署步骤见 **`docs/DEPLOYMENT.md`**，门店员工操作手册（意大利语）见 **`docs/OPERATIONS.md`**。

## Repository layout

```
apps/mobile        Expo app (customer app + web shop)
apps/admin         Vite + React back office
packages/shared    Domain types and business helpers shared by apps and tests
supabase/          migrations, seed (dev only), Edge Functions, config.toml
tests/db           PostgreSQL test suite (migrations, RLS, lifecycle, concurrency)
tests/functions    Edge Function unit tests (mocked fetch)
docs/              architecture, deployment, operations, launch checklist, decisions
```

## Quick start (local development)

Requirements: Node 20+, a Supabase project (or `supabase start` with Docker), Stripe test keys.

```bash
npm install                                    # installs all workspaces
cp apps/mobile/.env.example apps/mobile/.env   # Supabase URL + anon key
cp apps/admin/.env.example apps/admin/.env
npm run mobile                                 # Expo: scan the QR with Expo Go, or press w for web
npm run admin                                  # http://localhost:5173
```

Backend setup (migrations, Edge Functions, Stripe webhook, first admin): see `docs/DEPLOYMENT.md`.
Windows helper for phone testing on the LAN: `apps/mobile/start-demo.ps1`.

## Tests

```bash
npm test                 # shared + admin + edge functions + database
npm run test:db          # needs PostgreSQL 16 binaries locally, or DATABASE_URL=postgres://...
npm run typecheck
```

The database suite starts a throwaway PostgreSQL, emulates the Supabase roles/auth schema,
applies every migration and the seed, and verifies: shipping parity with the approved demo rules
(468 cases), RLS for every role, order creation and stock reservation, payment idempotency,
expiry release, late-payment refunds, the staff workflow, refunds, CSV import, dashboard KPIs,
coupon limits and a two-session race for the last unit in stock.

## Business rules

Shipping (agreed, unchanged): value + weight + method; store pickup always free; free delivery
from €66 up to 10 kg; the >10 kg rate is provisional. See `docs/PROJECT_CONTEXT.md` §6 and
`docs/DECISIONS.md` (Phase 2 decisions 19–28).
