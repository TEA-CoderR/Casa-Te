# Mock 交易接口：当前可测试范围

这组 `/v1/*` 接口用于在企业接口资料到达前验证流程和契约。商品与每店 5 件库存均为**虚构样本**；报价、库存扣减和订单只保存在服务进程内，重启即重置。`reserved_demo` 仅表示样本库存已预留，**不代表付款、真实库存或正式订单**。当前手机 App 与后台仍使用原 `/api/*` 演示订单流程，尚未切换至 `/v1/*`。

## 已实现

- `GET /v1/products`：读取样本商品，金额以欧分、重量以克返回。
- `GET /v1/availability?storeId=Arezzo`：读取指定样本门店的虚构可售数量。
- `POST /v1/quotes`：按商品、数量、门店和 `store`/`home` 履约方式生成 5 分钟报价。送货需 5 位 CAP；当前只验证格式，**不代表邮编在配送范围内**。使用现有运费规则，>10kg 因正式规则未批准而拒绝。
- `POST /v1/orders`：引用报价并提供幂等键；复核价格和库存，原子扣减 mock 库存。同一键重试返回同一订单；同一报价不能生成两笔订单。
- `GET /v1/orders/{id}`：读取进程内生成的预留订单。

请求示例：

```json
POST /v1/quotes
{"lines":[{"sku":"carta-cucina","quantity":2}],"storeId":"Arezzo","fulfilment":"home","postalCode":"52100"}
```

```json
POST /v1/orders
{"quoteId":"<quote.id>","idempotencyKey":"unique-checkout-attempt-123"}
```

错误以稳定 `code` 返回，例如 `OUT_OF_STOCK`、`PRICE_CHANGED`、`QUOTE_EXPIRED`、`QUOTE_ALREADY_USED`。HTTP 契约草案见 `COMMERCE_API_CONTRACT_DRAFT.md`。

## 替换点与明确未完成项

`src/commerce/types.ts` 的 `CommerceAdapter` 是商品/库存 seam；`src/data/mockCommerce.ts` 为其样本 Adapter，`server/commerce.ts` 在其后实现报价、预留和幂等行为。企业资料到达后，先实现 PIM/ERP/POS Adapter 和契约测试，再把报价与订单状态迁到事务数据库及 OMS。进程内 Map、单进程幂等、样本库存和宽松的 demo HTTP 服务不能直接用于生产。支付、退款、履约、身份、权限与实际配送覆盖仍未实现。
