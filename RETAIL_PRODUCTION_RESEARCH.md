# 大型百货移动零售系统：一手资料核查

核查日期：2026-09-26。以下是同行**官方说明**与欧盟/意大利**官方规则**。同行功能是产品参照，不代表本项目已实现；法规适用范围须按经营主体、商品类别及销售地区由法务核定。

## 成熟同行的可验证做法

| 一手资料 | 已公开的能力 | 对 CASA & TE 的产品含义 |
| --- | --- | --- |
| [IKEA Italia App](https://www.ikea.com/it/it/ikea-app/)、[订单管理](https://www.ikea.com/it/it/customer-service/track-manage-order/) | App 展示线上/门店可用性、优惠与心愿单；顾客可查看订单、配送和提货状态，管理日期、取消和发起退货。 | 建立按门店/SKU 的可售库存查询；订单详情、通知、自助取消和售后必须接同一订单状态源。 |
| [IKEA Italia 店内购物](https://www.ikea.com/it/it/customer-service/knowledge/articles/17f52271-40e9-4d6e-bf97-2416f2efe306.html) | 顾客选店、扫条码、生成二维码在专用收银台结账，并使用店内地图。 | 对大型百货可规划扫码识货、门店导览和到店购物模式；它们依赖真实商品主数据与门店货位，宜列后续阶段。 |
| [Carrefour Italia App](https://www.carrefour.it/app-carrefour.html) | 手机购物、送货到家、Clicca&Ritira、自选门店信息与促销、PAYBACK 卡。 | 门店选择应贯穿首页、价格/活动、库存、提货时段、订单与会员，而非只影响首页文案。 |
| [Decathlon Italia 配送与自提](https://www.decathlon.it/lp/i/tempi-e-costi-di-spedizione) | 公开不同自提方式的费用、可用时间和保留期限；提货凭订单号或二维码，订单页提供配送追踪。 | 结账前展示由履约服务计算的费用与承诺时段；后台应支持拣货、备妥、交付及逾期处理。 |
| [Zara Italia 店铺模式](https://www.zara.com/it/it/help-center/StoreMode)、[退货流程](https://www.zara.com/it/it/help-center/HowToReturn) | 选店购买该店商品并店内提货；店内找货；线上订单可在 App 发起退货或到店退货。 | 全渠道订单、库存与退货需要共用订单号和交易记录，不能把线上/线下历史做成互不相通的演示数据。 |

## 上线前必须纳入设计的官方要求

| 来源 | 核查结论 | 工程/运营要求 |
| --- | --- | --- |
| [EU Your Europe：购买前信息](https://europa.eu/youreurope/citizens/consumers/shopping/contract-information/index_en.htm)、[配送](https://europa.eu/youreurope/citizens/consumers/shopping/shipping-delivery/index_en.htm) | 购买前应清晰提供商品主要特征、含税总价与附加费、配送/付款条件、商家身份；在线购买后应有书面交易确认。一般配送期限为约定时间，否则不迟于 30 天。 | 商品详情、购物车、结账确认页必须一致显示最终价格、税费、运费、时效和商家信息；生成可留存的订单确认。 |
| [EU Your Europe：撤回与退款](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm) | 远程购物通常有收货后 14 天撤回权，存在商品/服务例外；经营者收到撤回通知后通常须在 14 天内退款，可按规则等候退货或寄回凭证。 | 售后流程须有商品类别例外、期限计算、退货状态与退款流水；具体意大利规则与公司政策经法务确认。 |
| [欧盟委员会：GDPR 原则](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en) | 强调数据最小化、保存期限、完整性与保密性，以及设计和默认状态下的保护。 | 用户与地址数据分级；后台最小权限、访问审计、保留/删除策略与用户数据请求流程是生产门槛。 |
| [EU Your Europe：无障碍](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/accessibility/indexamp_en.htm)、[意大利 AgID 私营主体指引](https://www.agid.gov.it/it/design-servizi/accessibilita/linee-guida-accessibilita-privati) | 欧盟无障碍要求包括在线商店，2025-06-28 起适用；意大利另对特定大型私营服务主体的网站和 App 规定声明等义务。 | 从组件级实现屏幕阅读器标签、字号缩放、对比度、键盘/辅助输入与流程测试；法务核定适用义务并准备声明。 |
| [EBA：PSD2 强客户认证](https://www.eba.europa.eu/publications-and-media/press-releases/eba-clarifies-application-strong-customer-authentication) | 电子支付及数字钱包中的相关操作受强客户认证要求约束，具体执行由支付服务提供方负责。 | 接持牌支付服务商的托管/令牌化流程，支持认证、支付结果回调、退款与对账；不得以“订单创建”冒充已收款。 |
| [EU：VAT OSS](https://europa.eu/youreurope/business/finance-and-tax/vat/one-stop-shop/index_en.htm) | 跨境 EU B2C 销售可涉及目的地 VAT 与 OSS 申报。 | 若跨国销售，价格/税率/发票模型按销售地和税务规则设计；先确认是否仅在意大利经营。 |
| [欧盟一般产品安全条例 GPSR](https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng) | 欧盟消费者在线商品报价涉及产品识别、安全信息、制造商/责任人等要求；第三方市场平台有额外义务。 | 商品主数据增加制造商、可追溯标识、安全警告和停售/召回能力；若引入第三方卖家，单独评估平台义务。 |

## 对项目的决策建议

1. **先明确销售模式**：自营百货还是第三方入驻平台；意大利国内还是跨境；是否销售食品、化妆品、药品或其他特殊品类。不同答案直接改变商品合规、税务、履约和售后模型。
2. **首个可收费闭环**：真实商品与价格 → 门店/仓库存与预留 → 配送/自提报价和时段 → 支付授权/确认 → 订单管理系统 → 门店/仓履约 → 通知、退款、对账和客服。任何环节仍用硬编码或本机假数据，均不能称为商业上线。
3. **大型企业集成优先**：先确定 ERP/PIM、POS、WMS、会员、支付和物流系统的主数据归属与接口负责人，再扩展营销、推荐、店内导览等体验；否则会形成第二套不可信库存和订单。
4. **上线验收应由实交易驱动**：在预生产环境用测试支付覆盖成功、失败、超时重试、重复回调、缺货、取消、部分退款、门店交付、物流异常、库存与财务对账，并开展安全、隐私、无障碍和压力验收。

本文是产品和工程研究笔记，不代替针对实际经营范围的法律或税务意见。
