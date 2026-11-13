# CASA & TE App — 第二轮审核与设计方案（v2）

日期：2026-11-13 · 审核对象：`design/lime`（提交 `758a3c4`，第 0–7 阶段已完成）· 预览 https://design-lime.casate-shop.pages.dev ，手机 390×844
审核时账号状态：已登录、**非会员**（测试账号在审核前退出了 Club，见 A2）。电脑版和安卓真机这次没有看。

前一份方案：`docs/design/ui-audit-2026-11.md`（下称 v1）。v1 第 0 节（工作规则）和第 6 节（老板否决过的方向）继续有效，先读。

---

## 1. 总体判断

第 0–7 阶段之后，"拼出来的感觉"基本没有了：字号、圆角、按钮、搜索框、列表、订单票据都是一套。现在剩下的问题不在样式统一，而在三件事：

1. **价格和会员的说法不够诚实、不够清楚。** 这是现在最重要的问题，直接影响顾客信任（A1、A3、B4）。
2. **首页中段内容弱。** 轮播只剩两张，两张都和上下相邻的区块重复（B1）。
3. **几处缺少"状态"设计。** 退出 Club 没有确认；图片加载时是空白；二级页面的标题大小不一致（A2、A4、C1）。

---

## 2. A 组：信任与功能（先做）

### A1. 非会员看到的价格 ≠ 实际付的价格 【需要老板决定，见 D1】

现状（手机商品卡 `components/ProductCard.tsx` 第 156 行附近，商品页 `app/product/[id].tsx` 的 `phonePriceRow`）：
商品有会员价时，**非会员**看到的也是红色大字会员价（如 €1,99），原价 €3,29 划线，旁边小字"Prezzo Soci"。但加入购物车后按 €3,29 收。
购物车里才第一次看到真实价格。顾客会觉得被骗。

建议改法：
- **非会员 / 未登录**：大字显示自己要付的价格（`price_cents`，黑色，不划线）。下面一个柠檬绿小标签：皇冠图标 + "Soci €1,99"。左上角标"Soci −39%"保留（电脑版已经是这样写的）。
- **会员**：保持现在的样子（红色会员价、原价划线、"Prezzo Soci"）。
- 商品页同理；非会员在价格下面多一行可点的"Soci €1,99 · Iscriviti gratis"，跳到 `/club`。
- "Aggiungi al carrello"按钮上的价格已经是实付价（`payCents`），不用改。

新增一个小组件 `SociChip`（放 `components/UI.tsx`）：高 22，圆角 `pill`，底 `colors.bandLogo`，字 `type.micro` 深绿。商品卡、商品页、购物车行（现在是红框"Soci €1,69 −26%"）三处共用。这符合"柠檬绿 = 会员"的规则，也让红色只留给真正的折扣。

### A2. "Esci dal Club"点一下就退出，没有确认

v1 把它改成了灰色文字链接，但 `club.tsx` 的 `leave()` 是直接执行的。测试账号就是这样被退出的。
改法：点击后弹底部确认层（沿用 `FulfilmentSheet` 的 Modal 样式）：
- 标题"Vuoi uscire dal Club?"
- 说明"Perdi i Prezzi Soci e i codici sconto. Puoi iscriverti di nuovo quando vuoi."
- 主按钮"Resta nel Club"（`PrimaryButton`），下面红色文字链接"Esci dal Club"。

"Esci dall'account"（Profilo）同样加一步确认："Vuoi uscire dall'account?" / "Resta" / "Esci"。

### A3. "Offerte"要说清楚是会员的

老板确认过：Offerte 就是会员优惠。现在 1,095 件 Offerte 里 1,092 件是会员价。
- 首页区块标题"Offerte" → "Offerte Soci"。
- 非会员和未登录时，横向列表下面加一行（`ListRow` 样式，皇冠图标）："Riservate ai Soci · Iscriviti gratis"，点了去 `/club`（未登录先去登录）。会员不显示这一行。
- 折扣列表页（`/prodotti?offerte=1`）标题同样改成"Offerte Soci"。

### A4. 图片加载时是空白

搜索结果里，图片没加载完时商品卡上半部分是一块白（数据库里每件上架商品都有图，不是缺图）。
改法：`ProductImage` 加载完成前显示 `colors.well` 底色块，加载完 150ms 淡入。先看 `components/ProductImage.tsx` / `RemoteImage.tsx` 现有逻辑再改，不要重复造。

### A5. 结账页"Come lo ricevi"只有一个选项时还显示单选框

送货没开时只有"Ritiro in negozio"一项，却画成带单选圆点、绿色边框的选项卡。没得选就不该像个选择。
改法：只有一个可用方式时，改成普通信息行（`ListRow`，标题"Ritiro in negozio"，副标题门店和营业时间，右侧"Gratis"），不画单选框。有多个方式时保持现状。

---

## 3. B 组：首页

目标顺序：（订单票据）→ Reparti → Offerte Soci → Volantino → In evidenza → Club。

### B1. 去掉轮播

删掉"Ritiro gratis"之后只剩两张：
- "Le nostre migliori offerte" —— 正下方就是 Offerte 区块；
- "Profumeria · Vai a Profumeria" —— 正上方 Reparti 第一格就是 Profumeria。

两张都是重复，还占 260px 高。整块删除（`slides`、`pager`、圆点、自动轮播的 `useEffect`、相关样式）。Offerte 上移到 Reparti 后面，第二屏直接是商品。
以后有真正的活动（季节主题、新店开业）再做单张横幅，不做轮播。

### B2. Volantino 行

- 封面缩略图从 46 宽加到 64 宽，圆角 `sm`。
- 第二行改成"Speciale Halloween · ancora 18 giorni"（用传单页已有的剩余天数算法），比"fino al 30 novembre"更有紧迫感。
- 位置：Offerte Soci 后面（传单和会员优惠是一回事）。

### B3. 去掉首页底部四个法律链接

Privacy / Termini / Spedizioni / Contatti 四个下划线链接像网页页脚，不像 App。前三个 Profilo 的"Assistenza e informazioni"里已经有。
改法：首页删掉；Profilo 那一组加一行"Contattaci"（`mailto:shoponline@casa-te.com`，副标题显示邮箱）。

### B4. Club 卡片文案不准确

"Prezzi Soci su tutto il catalogo."（全部商品都有会员价）不是事实：11,494 件里约 1,092 件有会员价。
三处统一改成：标题"Offerte riservate\nai Soci."，按钮"Iscriviti gratis"。
位置：`(tabs)/index.tsx` 首页 Club 卡、`(tabs)/profile.tsx` 的 `pass`（非会员分支）、`club.tsx` 的 `ClubPass title`（非会员分支）。
欢迎页第三步的第一条卖点"Prezzi Soci e codici sconto"是准确的，不改。

### B5. Reparti 封面大小不一

Nivea 铁盒占满格子，摩卡壶只占一半。`CategoryPhoto` 统一成 `contain` + 四周 12% 内边距，让每张图的"分量"接近。只改显示，不改后台选的图。

---

## 4. C 组：其余页面

### C1. 二级页面标题大小不一致

"Preferiti""I miei ordini""Il tuo ordine"是 26–28，"Indirizzi""Dati personali""Password"（系统导航栏）是 22 左右。
规则：四个 tab 的首页（Categorie、Carrello、Profilo）用 `type.title`；所有带返回按钮的页面标题统一 `type.section`（22）。
改 `BrandHeader` 的默认 `titleSize`：有 `left` 时 22，调用处去掉各自写的 `titleSize={26|28|30}`；`_layout.tsx` 的 `headerTitleStyle` 对齐到同一个值。

### C2. 表单间距

"Dati personali"：邮箱下面的提示"Per cambiare email…"紧贴下一个字段的标签；复选框到"Salva"按钮只有约 10px。
`TextField` 统一：字段之间 16，提示文字到下一个字段 16，表单最后一项到主按钮 24。地址表单、密码页、Club 注册表单一起检查。

### C3. 分类页右侧小类名被截断

"Balsamo e maschere …""Bagnoschiuma e doccia"两行还放不下。小类名允许两行、不加省略号（`numberOfLines={2}`，格子高度按两行留），字号 `type.small`。左侧栏不动（v1 第 6 节）。

### C4. 搜索结果加数量

"PRODOTTI"小标题右边加"N risultati"（`type.small` 灰字），和商品列表的"54 prodotti"一致。

### C5. Club 页（会员、未关联门店卡）说两遍"Collega la tessera"

柠檬绿卡片写一遍，下面白色卡片又写一遍。
改法：这种状态下柠檬绿卡片只显示身份——名字 + "Socio dal 4 novembre 2026"，不放标题和按钮；关联入口只留下面的白色卡片。Profilo 的卡片保持"Collega la tessera del negozio"加按钮（那里只有这一处）。

### C6. 结账页顶部是白色，其他页面都是绿色 【需要老板决定，见 D2】

"Conferma l'ordine"是全 App 唯一白色顶栏的页面。老板否决的是"绿色顶部加挂下来的小票、分步编号"那一版，不是顶栏颜色本身。
可选做法：只把顶栏换成和 Indirizzi 一样的绿色窄条（`BrandHeader`，标题 22，返回按钮），**下面的布局一个像素都不动**。老板不同意就保持白色。

---

## 5. 需要老板决定

- **D1（A1）**：非会员是否改成"大字显示实付价 + 柠檬绿 Soci 标签"。建议改。不改的话，至少把小字"Prezzo Soci"改成"con tessera Soci"，并在加购时提示。
- **D2（C6）**：结账页顶栏是否换成绿色窄条。
- **D3**：首页传单还是"Speciale Halloween"，有效期到 11 月 30 日。11 月中旬看起来过时，确认是否换新传单或下架。
- **D4**：测试账号 Ronaldo YA 现在不是会员（21:25 UTC 退出）。要继续测会员价，在 App 里重新加入即可。

---

## 6. 不要做

v1 第 6 节全部有效。另外：
- 不要恢复轮播，不要为了"填满首页"加新的推广卡。
- 不要给非会员隐藏会员价——要让他们看到差价，这是入会的理由；只是不能把会员价当成他们的价格。
- 不要改价格计算。A1 只改显示哪个数字，金额仍然来自 `quote_cart`。

---

## 7. 实施顺序（每阶段一个提交）

| 阶段 | 内容 | 主要文件 | 验收 |
|---|---|---|---|
| **A** | A2、A3、A4、A5、B4；A1 等老板对 D1 的答复 | club.tsx、profile.tsx、index.tsx、catalog.tsx、ProductImage.tsx、checkout/index.tsx、UI.tsx（`SociChip`）、ProductCard.tsx、product/[id].tsx | 非会员账号：商品卡大字 = 购物车单价；退出 Club 要点两次；Offerte 标题带"Soci" |
| **B** | B1、B2、B3、B5 | index.tsx、profile.tsx、CategoryNav.tsx（`CategoryPhoto`） | 首页没有轮播和页脚链接；390×844 第二屏能看到 Offerte 商品 |
| **C** | C1–C5；C6 等 D2 | BrandHeader.tsx、_layout.tsx、UI.tsx（`TextField`）、CategoryNav.tsx、catalog.tsx、club.tsx | 所有带返回的页面标题同一大小；Club 页只说一遍关联 |
| **D** | 安卓测试包真机检查（v1 第 8 阶段），加上电脑版 1280 宽过一遍共用页面 | — | 老板手机截图 |

每个阶段：`npm run typecheck`、`npm run test:ui`，push 后在预览上用**会员和非会员两种状态**各截一遍图。
