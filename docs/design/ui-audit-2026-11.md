# CASA & TE App — UI / 交互 / 功能审核与设计方案

日期：2026-11-13 · 审核对象：分支 `design/lime`（预览 https://design-lime.casate-shop.pages.dev ，手机 390×844，已登录会员账号）
保存的旧版：`design/salvata-tenda`（现在上线的遮阳棚版）、`design/salvata-lime`（新版 11/11 快照）。两个分支都不能改、不能删。

---

## 0. 给实现者（先读）

- 只在 `design/lime` 上改。**不合并、不推 main**，合并要等老板说"合并"。
- 每完成一个阶段（第 7 节）提交一次：`npm run typecheck`、`npm run test:ui`；动了 SQL 时再跑 `npm test`。然后 push，等 Pages 预览部署好，在手机尺寸 390×844 下截图检查。
- 在 Claude 的内置浏览器里截图时，Reanimated 的入场动画不会播放，页面看起来是空的。每次加载页面后先注入下面这段，再截图：
  ```js
  const st=document.createElement('style');st.textContent='*{animation:none!important;transition:none!important}[style*="animation-name"]{visibility:visible!important;opacity:1!important}';document.head.appendChild(st);
  ```
- 遵守 `AGENTS.md` 的工程规则：不编造产品、价格、地址、法律数据；金额不在客户端计算；新表要 RLS 和 GRANT。
- 第 6 节列出的东西老板已经否决过，不要再做。
- 这份文档只管手机 App（`apps/mobile`，`wide === false` 的分支）。电脑版网站不在范围内，改完要确认电脑版没被带坏。

---

## 1. 总体判断

新版方向是对的：深绿顶部、CT 字母纹理、柠檬绿会员卡和订单票据，品牌辨识度明显比遮阳棚版高，老板也认可。"还不够简洁大气"的原因主要不在配色，而在**系统不统一**和**几处信息冗余**：

1. **字号和圆角太散。** `apps/mobile/src` 的页面和组件里（不含电脑版专用的 `components/site`）有**约 40 种不同的 fontSize**（11 到 64）、**30 多种 borderRadius 数值**（其中一部分是圆形按钮的半径）、28 种字间距。每页单独看还行，连起来就显得"拼的"，不够整。这是影响"专业感"最大的一点。
2. **同一页里两套列表。** Profilo 上半部分是大字加细线，下半部分（ACCOUNT、ASSISTENZA）是带边框的分组卡片。
3. **按钮和搜索框各有好几种。** 主按钮有绿色、黑色（首页轮播的"Come funziona"）、柠檬绿；小胶囊按钮（Cambia、Modifica、Tutti）高度有 30、32、34 三种；搜索框有三种样式（首页白色圆角胶囊、分类页灰框小圆角、搜索页白色小圆角）。
4. **首页第一屏一件商品都看不到。** 绿色顶部加订单票据加轮播图，占了约 600px，"Reparti"要往下滑才出现。"Ritiro gratis"在顶部小字和轮播图里重复了两次。
5. **小标题（大写字母加宽字距的 kicker）用得太多。** 首页每个区块上面都有一个（NEL TUO NEGOZIO / QUESTA SETTIMANA / SCELTI PER TE），票据、卡片里也有。到处都是就不再起强调作用，只剩噪音。

另外还有几处**功能问题**（第 4 节），其中"停用的门店能被选中"会直接导致顾客看到全部商品缺货，要先修。

---

## 2. 设计原则（之后所有改动的判断标准）

1. **一个系统**：所有字号、圆角、间距、按钮只从第 3 节的规范里取，不写新的数值。
2. **少即是多**：能用留白和细线分开的，不加边框和卡片；一个区块只有一个视觉重点。
3. **柠檬绿 = 属于你的、正在进行的**：会员卡、进行中的订单、当前选中的 tab、购物车数量。其他地方不用大面积柠檬绿。
4. **深绿 = 品牌的地面**：顶部、整屏的品牌页（欢迎页、付款成功页）。白色 = 内容。
5. **说一次就够**：同一句话（"Ritiro gratis"、门店名、总价）在一屏里只出现一次（结账页底部总价除外，那是行动按钮的一部分）。

---

## 3. 设计规范（Design tokens）

全部写进 `apps/mobile/src/config/theme.ts`，再改各页面去引用。

### 3.1 字号（新增 `type`，每个都带 fontFamily）

| token | 字号 / 行高 | 字距 | 字体 | 用在哪 |
|---|---|---|---|---|
| `type.hero` | 48 / 52 | −1.6 | display | 只用于整屏绿色页：欢迎页、付款成功页 |
| `type.display` | 36 / 40 | −1.1 | display | 顶部的大名字：首页门店名、Profilo 名字 |
| `type.title` | 28 / 33 | −0.6 | display | 页面标题（BrandHeader） |
| `type.section` | 22 / 27 | −0.4 | display | 区块标题：Reparti、In evidenza、Stato dell'ordine |
| `type.cardTitle` | 17 / 22 | −0.2 | sansSemiBold | 列表行标题、卡片标题、选项标题、票据状态以外的大字 |
| `type.body` | 15 / 21 | 0 | sans | 正文 |
| `type.small` | 13 / 18 | 0 | sans | 说明行、地址、时间 |
| `type.kicker` | 11.5 / 14 | 1.6 | sansBold，大写 | 只用在票据、会员卡、步骤（见 3.5） |
| `type.micro` | 11 / 13 | 0.2 | sansBold | 角标、徽章 |

票据上的状态大字（Pagato / Pronto al ritiro）用 26/31（`type.ticket`，−0.7，display）。价格继续用现有的 `PriceTag`，不在此表内。

**迁移规则**（改到哪个文件就顺手迁）：旧字号 ≤11.5 → kicker 或 micro；12–13.5 → small；14–15.5 → body；16–18 → cardTitle；19–24 → section；25–30 → title；31–42 → display；≥46 → hero。

### 3.2 圆角

`radius = { sm: 12, md: 16, lg: 22, pill: 999 }`，保留 `xl` 作为 `lg` 的别名，免得旧代码报错。

- `sm` 12：输入框、商品小图、角标
- `md` 16：卡片、列表分组、商品卡、选项卡
- `lg` 22：会员卡、订单票据、底部弹层顶角、首页轮播
- `pill`：所有按钮、胶囊、搜索框

其他数值（3、4、6、8、10、14、18、20、26、27、28、30）都改成上面四个之一。小票锯齿、进度条这类图形细节除外。

### 3.3 间距

以 4 为单位：4、8、12、16、20、24、32、40。
页面左右边距 16；首页区块之间 32；卡片内边距 16；列表行最小高度 56；按钮之间 12。

### 3.4 按钮与输入（统一到 `components/UI.tsx`）

| 组件 | 规格 | 说明 |
|---|---|---|
| `PrimaryButton` | 高 54，pill，`colors.green` 底，白字 `sansBold` 16 | 白底页面上唯一的主操作 |
| `SecondaryButton` | 高 48，pill，白底，1px `colors.line` 边框，绿字 `sansBold` 15 | 次要操作 |
| **新增** `PillButton` | 高 32，左右 14，pill，1px 边框，`sansBold` 13.5，`hitSlop` 8 | Cambia、Modifica、Tutti 这类行内小按钮。`onDark` 变体：边框 `rgba(255,255,255,0.35)`，白字 |
| 绿色地面上的按钮 | 白底黑字（主），或柠檬绿底深绿字（只用于账号、会员相关） | 欢迎页、付款成功页 |
| **新增** `SearchField` | 高 52，pill，白底，无边框；在白色页面上用 `colors.well` 底 | 首页、分类页、搜索页三处共用 |

不再有黑色按钮（首页轮播的"Come funziona"改成绿色）。

### 3.5 kicker（大写小标题）使用规则

只在这几处保留：票据和会员卡里（ORDINE …、TESSERA SOCI）、欢迎页步骤（PASSO 1 DI 2）、首页顶部门店上方那一行（RITIRO GRATIS · LUCCA）、列表分组标题（Profilo 的 ACCOUNT 等）。
**去掉**首页三个区块上方的 kicker：NEL TUO NEGOZIO、QUESTA SETTIMANA、SCELTI PER TE。区块只留标题和"Vedi tutti"。

### 3.6 列表（统一一种）

全 App 只用一种列表行：无外框，行与行之间 1px `colors.line` 细线，行高 ≥ 56；标题 `type.cardTitle`，可选第二行 `type.small` 灰字，右侧可选灰字和箭头。分组标题用 `type.kicker` 灰字，上方留 28 的空。
建议新建 `components/ListRow.tsx`，提供 `ListRow` 和 `ListGroup`，Profilo、Club、订单详情都用它。

### 3.7 柠檬绿使用位置（固定清单）

可以用：会员卡（`ClubPass`）、进行中的订单票据、付款成功页的小票、tab 栏选中态、购物车数量角标、欢迎页第三步的账号按钮。
其他地方不新增大面积柠檬绿。

---

## 4. 功能问题（先修，第 0 阶段）

| # | 问题 | 现象 | 改法 | 文件 |
|---|---|---|---|---|
| F1 | **停用的门店能被选中** | 数据库里只有 S. Filippo（LU3）是启用的，另外 4 家 `active = false`、没有库存，但门店列表（`StoreSheet`）和欢迎页都会显示。顾客选了这些店，所有商品都会显示缺货 | `fetchStores` 不改（订单里显示旧门店名还要用到全部门店）。在 `useStores()` 里把返回的 `stores` 改成只含 `active` 的门店，另外返回 `allStores` 给按 id 查名字的地方用（订单列表、订单详情）。`useStores` 现有的回退逻辑（`selected` 找不到就选第一家）会自动把已存的停用门店换成 S. Filippo | `apps/mobile/src/lib/hooks.ts`；用 `stores.find(... o.store_id)` 查名字的地方改用 `allStores`（`orders.tsx` 等） |
| F2 | 只有一家门店时还让人"选" | 首页"Cambia"、购物车"Cambia"、商品页"Cambia"、欢迎页第 1 步都在 | `useStores()` 返回 `canChoose = stores.length > 1`。为 false 时隐藏所有"Cambia"，欢迎页跳过选店步骤（步骤变成 欢迎 → 账号，第二步不显示"PASSO x DI y"） | `index.tsx`、`cart.tsx`、`product/[id].tsx`、`StoreCard.tsx`、`profile.tsx`、`benvenuto.tsx`、`FulfilmentSheet.tsx` |
| F3 | 订单状态"Pagato"对顾客不自然 | 时间线写的是"Ordine ricevuto"，票据和列表却写"Pagato" | App 里新增顾客用文案函数 `customerOrderStatus(status, fulfilment)`：paid → "Ordine ricevuto"，picking → "In preparazione"，ready → 门店取货"Pronto per il ritiro"，其余沿用 `orderStatusLabel`。**不改** `packages/shared` 里的 `ORDER_STATUS_LABELS`，后台还在用 | 新文件 `apps/mobile/src/lib/orderText.ts`，替换 Home、订单列表、订单详情、Profilo 里的调用 |
| F4 | 订单没好时就说"Mostra questo codice in cassa" | 订单详情在"Pagato"状态就提示去收银台出示条码 | 条码照常显示（店员要扫）。未完成时说明改成"Codice ordine · ti scriviamo quando è pronto"；`ready` 时才写"Mostra questo codice in cassa" | `app/order/[id].tsx` |
| F5 | 商品页的取货说明难懂 | "Ritiro gratuito · resta 14 giorni in negozio" | 改成"Ritiro gratuito in negozio"。14 天保留期已经写在"Spedizioni e ritiro"页 | `app/product/[id].tsx` 第 262 行附近 |
| F6 | 版本号显示 1.2.4 | 上线的是 1.2.5；`design/lime` 落后 main 一个提交（Release 1.2.5） | 先把 `origin/main` 合并进 `design/lime`（不是推 main） | — |
| F7 | 首页"Offerte"只有 1 件时像坏了 | 现在库里只有 2 件折扣商品，横向列表只显示一张卡，右边大片空白 | 折扣商品少于 3 件时不显示"Offerte"区块；轮播里的"Le nostre migliori offerte"那张照常跳到折扣列表 | `app/(tabs)/index.tsx` |

**要老板决定的数据问题**（不是代码，不要自己处理）：
- **D1：Club 会员价是 0 件。** 现在没有任何商品带 Club 会员价（`member_price_cents`），但欢迎页、Club 页、首页都在宣传会员价。要么从 ERP 同步会员价（PrezzoVedi3 / prodotti_vip），要么先把文案改成只说"Codici sconto riservati ai soci"。
- **D2：** 首页传单还是"Speciale Halloween"，有效期到 11 月 30 日（老板之前有意延长的），确认是否还要放在首页。
- **D3：** 其他 4 家门店没有地址和营业时间。等它们启用前，要在后台"Negozi"页补上。

---

## 5. 逐页方案

### 5.1 首页 `app/(tabs)/index.tsx`

目标：第一屏（844 高）能看到"Reparti"的第一排；整体更安静。

1. **顶部绿色区缩短：**
   - 门店名用 `type.display`（36，原来 42），`numberOfLines={1}`。
   - kicker 行（RITIRO GRATIS · LUCCA）和营业状态行保留，间距按 3.3。
   - "Cambia"用 `PillButton onDark`，`canChoose` 为 false 时不显示（F2）。
   - 搜索框改用 `SearchField`。
   - 有进行中订单时，band 底部留 50 给票据挂下来；没有时 band 底部留 20，下面直接接白底上的 Reparti。
2. **订单票据：** 改成第 5.4 节的 `OrderTicket`（`variant="compact"`），文案用 F3。
3. **轮播（移到 Reparti 下面）：**
   - 删掉"Ritiro sempre gratis"那张，和顶部重复。
   - 剩下的卡片（折扣、部门）圆角 `lg`，按钮改绿色 `PrimaryButton` 的小号（高 44）。
   - 只剩 1 张时不显示圆点、不自动轮播。
   - 一张都没有时整块不显示。
4. **区块顺序：** （票据）→ Reparti → 轮播 → Volantino（有传单时）→ Offerte（≥3 件时，F7）→ In evidenza → Club。Reparti 放在最前面，是为了第一屏就能看到商品图和入口；轮播放第二，因为现在它只是两张推广卡。
5. **区块标题：** 去掉 kicker（3.5），只留 `type.section` 标题和右侧"Vedi tutti"。三处链接统一写"Vedi tutti"，Reparti 保留"Tutti i 16 reparti"也可以，但要用同一个链接样式。
6. **Club 区块：**
   - 非会员：保留现在的柠檬绿大卡（`ClubPass`，"Scopri il Club"）。
   - 会员、已关联门店卡：改成一行紧凑的白色卡（高 72，圆角 `md`，细边框）。左边一张 44×28 的柠檬绿小卡缩略图（`Monogram` 放在柠檬绿圆角矩形里），中间"Tessera Soci"和"Mostrala in cassa"，右边箭头。点开直接弹出条码放大层。需要把 `ClubPass` 里的放大层抽成可复用的 `ClubCodeModal`。
   - 会员、未关联：同一行样式，文字"Collega la tessera del negozio"，点了去 `/club`。
7. **验收（390×844 视口，CSS 像素）：** 有进行中订单时，"Reparti"标题出现在 y ≤ 480；没有时 y ≤ 380。轮播里不再出现"Ritiro sempre gratis"。首页没有黑色按钮。

### 5.2 商品列表 `components/RollingAwning.tsx`、`app/(tabs)/catalog.tsx`（`deptTitle` 那段）

- **去掉顶部标题前的商品缩略图**（`image` 传 `null`）。它让标题被截断成"Bagnoschiuma e do…"，而下方 tab 里已经写了子类名。
- 标题用 `type.title`，最多一行，太长时 `adjustsFontSizeToFit`（`minimumFontScale` 0.8）。上方 eyebrow（部门名）保留。
- 列表顶部加一行"N prodotti"（`type.small` 灰字），用现有的 `count` / `total`。
- 商品卡圆角统一到 `md`。卡片样式本身不改，老板认可现在的卡片。

### 5.3 商品详情 `app/product/[id].tsx`

1. **图片区：** 改成正方形（高 = 屏幕宽），图片内边距 8%，下方显示圆点。现在图片只占一半高度，四周空白太多，显得小气。
2. **返回、收藏、分享按钮：** 都改成 40×40 的白色圆形，加很淡的阴影（`cardShadow`），浮在图片上，和其他页面的圆形返回按钮统一。
3. **标题和价格：** 标题 `type.title`（28），面包屑 `type.small` 绿色，价格保持 `PriceTag`。
4. **门店库存卡：**
   - 第一行："● Disponibile a S. Filippo"（`type.cardTitle`）。
   - 第二行：`type.small` 灰字，写"Ritiro gratuito in negozio · 5 disponibili"（F5）。
   - 右边"Cambia"用 `PillButton`，`canChoose` 为 false 时隐藏。
5. **Dettagli：** 去掉"Reparto"一行（和面包屑重复）；"Codice"改成"Codice articolo"。
6. **"Altro in …"：** 现在是另一套简化小卡（没有加购按钮、价格样式不同）。改成 `ProductCard rail`，横向滚动 4 件，和首页"In evidenza"一致。
7. **底部加购栏：** 不变。

### 5.4 订单（列表 `app/(tabs)/orders.tsx`、详情 `app/order/[id].tsx`、首页票据、付款成功页）

1. **新建 `components/OrderTicket.tsx`，四处共用：**
   - 参数：`order`、`variant: 'compact' | 'full'`、`onPress?`。
   - 颜色：进行中 `colors.bandLogo`（柠檬绿）；已完成 `#E4EADF`（灰绿，现有值）；已取消同样灰绿，文字 `colors.muted`、金额划线。
   - `compact`（首页、订单列表）：kicker（ORDINE 号码 + 日期）、状态大字 `type.ticket`、一行"取货方式 · 件数 · 金额"、商品小图（列表里显示，首页不显示）、4 段进度条。
   - `full`（订单详情顶部）：在 compact 的基础上加一块白色条码区（F4 的说明文字）和底部锯齿（复用 `checkout/return.tsx` 里 `tTear`、`tTooth` 的做法）。
   - 把 `orders.tsx`、`index.tsx`、`order/[id].tsx` 里各自写的票据样式删掉，改用这个组件。
2. **订单详情顶部：** 现在是一张白卡加大条码，和列表里的柠檬绿票据对不上。改成 `OrderTicket variant="full"`，点进去视觉是连续的。下面的"门店 / 营业时间 / 下单时间 / 已付"四格放到票据下面，用 3.6 的列表样式。
3. **时间线、"Indicazioni"、"Chiama il negozio"、"Ordina di nuovo"：** 功能不变。按钮改成 `SecondaryButton`（高 48），间距按 3.3。
4. **验收：** 首页票据、订单列表票据、订单详情顶部是同一个组件；进行中的单不再显示"Mostra questo codice in cassa"。

### 5.5 购物车 `app/(tabs)/cart.tsx`、`components/UI.tsx`

1. **`QuantityControl` 加参数 `onRemove`：** 当数量等于 `min` 且传了 `onRemove` 时，"−"位置显示垃圾桶图标，点击调用 `onRemove`。购物车每一行去掉右上角单独的垃圾桶。这是常见做法，行更干净。
2. **门店卡**（`StoreCard`）里的"Cambia"用 `PillButton`，`canChoose` 为 false 时隐藏。
3. **合计卡、"Potrebbe servirti anche"、底部栏：** 不变。

### 5.6 Profilo `app/(tabs)/profile.tsx`

1. 顶部（名字、柠檬绿会员卡）不变，老板喜欢。
2. **统一列表：** 上半部分的大字列表（Ordini、Preferiti、Indirizzi、Il tuo negozio）和下半部分的 ACCOUNT、ASSISTENZA 分组，全部改成 3.6 的 `ListRow` / `ListGroup`，行标题统一 `type.cardTitle`（17）。大字列表原来是 19，也改成 17，跟下面一致。
3. **会员卡下方的"进行中订单"那一行**（小绿点 + Pagato）：换成 `OrderTicket compact`，不显示商品小图；或者直接去掉，因为首页已经有了。**建议去掉**，"Ordini"行右边显示"1 in corso"。
4. **底部：** "Esci dall'account"改成居中的灰色文字链接（`type.body`，`colors.muted`）；"Elimina account"保持红色小字，放在它下面。不要用描边按钮。
5. **版本号：** F6 合并 main 后自然显示 1.2.5。

### 5.7 Club `app/club.tsx`

1. **会员未关联门店卡时：** 柠檬绿卡下方第一项就是关联入口，用白色卡片，标题"Hai la tessera del negozio?"，说明"Collegala per usarla anche nell'app"，按钮 `PrimaryButton`"Collega la tessera"。现在它藏在一个小列表行里。
2. **"Le tue offerte"：** 没有优惠码、也没有会员价商品时，**不要**显示"Al momento non ci sono offerte attive"这种空话。改成"Come funziona"三行（`ListRow`，配图标）：
   - Prezzi Soci applicati in automatico nel carrello（真的：`quote_cart` 对会员自动生效）
   - Codici sconto riservati, li trovi qui
   - La tessera digitale da mostrare in cassa

   D1 解决前，第一行先不放。
3. **"Esci dal Club"：** 从大号描边按钮改成页面底部的灰色文字链接。退出是少数人才做的操作，不该这么显眼。
4. **文案统一：** Profilo 的卡和 Club 的卡对同一个会员状态要说同一句话。已关联：显示条码。未关联：两处都说"Collega la tessera del negozio"。不要一边说"Sei uno di famiglia"，另一边说"Collega"。

### 5.8 欢迎页 `app/benvenuto.tsx`

- F2：只有一家启用门店时跳过选店步骤，自动选中这家店。第二步不显示"PASSO x DI y"，左上返回键回到欢迎页。
- 第三步的三条卖点，D1 决定前把第一条改成"Codici sconto riservati ai soci"。
- 欢迎页大字从 52 改成 `type.hero`（48）。

### 5.9 其他页面（小改）

- **分类页**（`components/CategoryNav.tsx`）：只把搜索框换成 `SearchField`。左侧栏、右侧标题不动（老板否决过改动，见第 6 节）。
- **搜索页**（`catalog.tsx` 搜索态）：搜索框换成 `SearchField`。
- **结账页：** 不改布局（老板说可以）。只把字号、圆角迁到规范里。"Manca un dato"已经修好。
- **传单页：** 不改。图片放大已经做好。
- **空状态**（收藏、地址等）：标题 `type.section`，按钮 `PrimaryButton`，不改结构。

---

## 6. 不要做（老板已经否决）

- 结账页改成绿色顶部加挂下来的小票、分步编号（11/13 退回）。
- 分类页灰色左栏、部门商品数、"Tutti"按钮（11/13 退回）。
- 首页 Club 卡改成深绿底柠檬绿字（11/13 退回）。会员的紧凑行（5.1 第 6 点）是另一回事，可以做。
- 已完成订单用白底加印章（11/10 否决），只换颜色。
- 去掉订单页的"In corso / Completati"切换（11/10 否决）。
- 米白、象牙色底；衬线字体、杂志风；柠檬绿顶部；白色顶部；AI 生成的横幅和图片；图标放在浅色圆圈里。
- 改动这 8 个 Maybelline 精选商品，或改动旧会员卡关联的功能。

---

## 7. 实施顺序（每阶段一个提交，做完截图给老板看）

| 阶段 | 内容 | 主要文件 | 截图检查 |
|---|---|---|---|
| **0** | 合并 `origin/main` 进 `design/lime`（F6）；F1、F2、F5、F7；更新 `AGENTS.md` 的设计规则（见第 8 节） | api.ts、hooks.ts、index.tsx、cart.tsx、product/[id].tsx、StoreCard、benvenuto、AGENTS.md | 首页、欢迎页（看是否跳过选店）、商品页 |
| **1** | 规范：`type`、`radius`、`PillButton`、`SearchField`、`ListRow` / `ListGroup`；按钮统一 | theme.ts、UI.tsx、新组件 | 首页、分类、搜索三处搜索框 |
| **2** | 首页 5.1 | index.tsx、ClubPass.tsx（抽出 `ClubCodeModal`） | 首页三屏（有 / 无进行中订单） |
| **3** | 订单 5.4 加 F3、F4 | OrderTicket.tsx、orders.tsx、order/[id].tsx、index.tsx、lib/orderText.ts | 订单列表两个 tab、订单详情、首页票据 |
| **4** | 商品列表 5.2、商品详情 5.3 | RollingAwning.tsx、catalog.tsx、product/[id].tsx | 一个子类列表、一个商品页 |
| **5** | 购物车 5.5 | UI.tsx、cart.tsx | 购物车（数量 1 和 2） |
| **6** | Profilo 5.6、Club 5.7、欢迎页 5.8 | profile.tsx、club.tsx、benvenuto.tsx | Profilo 整页、Club、欢迎页三步 |
| **7** | 字号、圆角迁移扫尾（其余文件按 3.1 的迁移规则） | 其余 app / components 文件 | 全部页面过一遍 |
| **8** | 安卓真机检查：出一个测试包（Build Android AAB），在手机上检查传单放大、会员卡条码放大、欢迎页自动出现、状态栏颜色、滚动流畅度 | — | 老板手机截图 |

---

## 8. 要同步更新的 `AGENTS.md`（第 0 阶段）

把"Design rules (customer app)"开头那段（现在写的是"white header band"、"LogoSign"）改成现在的样子，否则之后的实现者会照旧规则把东西改回去：

- 手机端：深绿顶部（`colors.band`），CT 字母纹理（`Monogram`、`BandWatermark`），白色页面；柠檬绿只用于第 3.7 节的清单。
- 字号、圆角、间距只用 `theme.ts` 里的 `type`、`radius`（第 3 节）。
- 列表用 `ListRow` / `ListGroup`；按钮用 `PrimaryButton`、`SecondaryButton`、`PillButton`；搜索用 `SearchField`；订单票据用 `OrderTicket`。
- 保留原来第 2–5、7、8 条（选择、状态、提示、图标、字体、ui-check）。

可选：在 `tools/ui-check` 加一条规则，`fontSize` 用了不在 3.1 表里的数值时报警告（先只警告，不让测试失败）。

---

## 9. 这次没审到的

- 登录、注册页（浏览器已登录，看不到；它们来自 PR #116，之前单独做过）。
- 安卓、iPhone 真机：所有截图都来自网页预览。动画、手势、状态栏要在第 8 阶段真机确认。
- 电脑版网站。
