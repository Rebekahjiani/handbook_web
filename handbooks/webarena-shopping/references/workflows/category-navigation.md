# 分类页导航与价格过滤

适用线索：打开分类、浏览商品、分类页、价格上限

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 从已观察到的分类路径提示中选择语义最精确的一条；没有提示时再沿菜单逐级进入。
2. 核对分类页 URL、标题和面包屑。
3. 需要价格上限时使用页面价格筛选，并核对 URL 中的价格条件。
4. 停在分类结果页，不要把站内搜索结果页当作分类页。

## 执行检查

- 命中精确分类路径后不要继续尝试近似分类。
- 最多尝试两个候选分类路径；仍不匹配再回到菜单。
- 任务要求 under X 时，价格范围使用从 0 到 X 的页面筛选值。

## 站点模型约束

- 业务对象 `category`：字段 `name、hierarchy`。
- 业务能力 `extract-product-field`：输入 `selected_product_detail_context、requested_field`；输出 `field_value`；依赖上下文 `selected-category-scope、selected-product-detail-context`。
- 业务能力 `select-product-from-category`：输入 `requested_category、product_criteria`；输出 `selected_product`；依赖上下文 `selected-category-scope`。

## 成功判据

- 最终 URL、标题或面包屑与目标分类一致。
- 价格筛选值与任务上限一致。

## 已验证入口

- Men - Clothing, Shoes & Jewelry：`/clothing-shoes-jewelry/men.html`；[页面快照](../../snapshots/pages/12-clothing-shoes-jewelry-men-html.json)
- Clothing - Men - Clothing, Shoes & Jewelry：`/clothing-shoes-jewelry/men/clothing.html`；[页面快照](../../snapshots/pages/22-clothing-shoes-jewelry-men-clothing-html.json)
- AC Adapters - Power Accessories - Electronics：`/electronics/power-accessories/ac-adapters.html`；[页面快照](../../snapshots/pages/06-electronics-power-accessories-ac-adapters-html.json)

## 操作锚点

- Search：`getByRole("button", { name: "Search", exact: true })`；证据：`01-home.json`
- Page Next：`locator("a.action[href=\"${SITE_ORIGIN}/?pbaocw=2\"]")`；证据：`01-home.json`
- View as List：`locator("a.modes-mode[href=\"#\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Sort By：`locator("select[data-role=\"sorter\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 同名分类可能位于不同父级；必须核对完整路径，不能只看末级名称。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

