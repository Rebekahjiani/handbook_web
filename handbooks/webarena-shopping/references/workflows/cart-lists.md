# 购物车、愿望单与比较

适用线索：加入、移除、购物车、愿望单、收藏、比较、数量

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 定位目标商品并进入商品卡片或详情页。
2. 核对名称、规格后执行加入、移除或修改数量。
3. 打开目标列表，确认操作只影响指定商品。

## 站点模型约束

- 业务对象 `shopping-cart`：字段 ``。
- 业务能力 `manage-cart`：输入 `A confirmed product and a task-authorized purchase intent.`；输出 `A shopping cart containing the intended product.`；依赖上下文 `authenticated-shopping、purchase-preparation`。
- 页面状态 `storefront-cart-checkout`：URL `undefined`；必须同时观察字段 `无`。
- 动作 `cart-add-product`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 目标列表中出现或消失了正确商品。
- 数量、规格和提示消息与任务一致。

## 已验证入口

- Makeup Remover - Makeup - Beauty & Personal Care：`/beauty-personal-care/makeup/makeup-remover.html`；[页面快照](../../snapshots/pages/05-beauty-personal-care-makeup-makeup-remover-html.json)

## 操作锚点

- Add to Cart：`getByRole("button", { name: "Add to Cart", exact: true })`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- Add to Wish List：`getByRole("link", { name: "Add to Wish List", exact: true })`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- Add to Cart：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`；证据：`01-home.json`
- Add to Wish List：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("link", { name: "Add to Wish List", exact: false })`；证据：`01-home.json`

## 风险与恢复

- 这是账户写操作。避免清空列表，也不要顺带修改其他商品。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

