# 购买与结账

适用线索：购买、结账、地址、配送、付款、下单

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 先完成商品选择并核对规格、数量和价格。
2. 进入购物车，确认只有任务要求的商品。
3. 依次填写地址、配送和付款字段，每一步都验证页面摘要。
4. 停在最终提交前；只有任务明确授权时才执行下单。

## 站点模型约束

- 业务对象 `shopping-cart`：字段 ``。
- 业务对象 `checkout`：字段 ``。
- 业务能力 `submit-purchase`：输入 `A nonempty cart, required purchase information, and explicit task authorization.`；输出 `A confirmed order or a clearly established non-success state.`；依赖上下文 `authenticated-shopping、purchase-preparation、purchase-authorization`。
- 页面状态 `storefront-cart-checkout`：URL `undefined`；必须同时观察字段 `无`。
- 动作 `checkout-prepare`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。
- 动作 `checkout-submit-order`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 购物车摘要中的商品、规格、数量和总价正确。
- 若已获授权提交，出现订单确认页或订单号。

## 已验证入口

- 当前抓取范围没有覆盖该流程；先用页面语义探索，不要臆造 selector。

## 操作锚点

- Add to Cart：`getByRole("button", { name: "Add to Cart", exact: true })`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- Add to Cart：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`；证据：`01-home.json`
- Add to Cart：`locator("li.item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Add to Cart：`locator("#reorder-item-490")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 下单会产生真实副作用。最终提交前必须再次核对任务授权和订单摘要。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

