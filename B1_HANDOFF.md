# demo v0.2 / B1 交接

分支：`feat/demo-v0.2-retail`，从 `demo-v0.1` (`031e8f4`) 创建。B1 实现完成，等待 Astra 视觉和范围复核。

## 已实现

- 统一颜色、间距、字级、圆角及 48dp 操作区；Screen、共用按钮和底部导航同步使用基础规则。
- 首页顺序改为品牌与门店、搜索、分类、紧凑宣传区、运费条件、精选商品。移除自创品牌口号；商品卡去掉重复水印，保留集中演示数据提示。
- 首页搜索跳到目录并聚焦输入；分类传入正确筛选。商品卡的详情入口和加购按钮独立，数量有即时反馈。
- 门店选择共用原生 Modal，供首页、个人页和结算页使用；选择更新现有偏好，关闭不改变偏好，支持 Android 返回键。
- 将 README、UI_REDESIGN 和启动脚本中的现行 Expo SDK 提示同步到 package.json 的 SDK 57。

## 检查结果

- TypeScript `tsc --noEmit`：通过。
- `tests/business.test.ts`：11/11 通过，运费规则未改。
- `expo export --platform android --max-workers 2`：通过，Android bundle 生成。
- `node --check tests/smoke.cjs`：通过。原浏览器冒烟测试因机器未安装 Playwright，未执行完整交互。
- Expo Go 的 Android 模拟器曾显示本次首页改版；已有本地画面 `test-results/app-home-b1-original-411.png`。用户随后明确取消继续制作多宽度截图，因此 360/390/430dp 截图未作为本批验收证据。

## Astra 复核重点

1. 首页在目标手机上的品牌、密度与首次商品露出是否达到 DEMO_V0.2_DECISIONS.md 的标准。
2. 共用门店弹层在首页、结算和个人页是否与预期一致。原生点击流程尚未自动化回归。
3. 搜索聚焦与分类导航从首页进入目录后的状态；浏览器冒烟脚本的选择器已更新，但未实际运行。

下一批 B2 尚未开始。管理后台需求见 ADMIN_DEMO_BRIEF.md；用户随后授权 Sol 直接开发，首版共享订单服务和只读后台已在当前分支实现。B1 视觉复核、后台编辑权限和实体手机网络验收仍待完成。
