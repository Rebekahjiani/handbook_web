# 通用搜索、筛选与商品发现

适用线索：搜索、筛选、排序、商品发现

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 定义产品类型、品牌、属性和价格条件。
2. 用分类或一次站内搜索建立候选集，再应用筛选与排序。
3. 只读取完成任务所需的字段，并在成功判据满足后停止。

## 执行检查

- 搜索词最多改写两次；每次改写前说明缺少哪条条件。
- 连续两次没有缩小候选集合时停止当前策略，改用分类入口。

## 站点模型约束

- 业务对象 `category`：字段 `name、hierarchy`。
- 业务能力 `extract-product-field`：输入 `selected_product_detail_context、requested_field`；输出 `field_value`；依赖上下文 `selected-category-scope、selected-product-detail-context`。
- 业务能力 `select-product-from-category`：输入 `requested_category、product_criteria`；输出 `selected_product`；依赖上下文 `selected-category-scope`。

## 成功判据

- 最终页面和候选集合满足任务的全部显式条件。

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

- 搜索结果是候选，不是答案；选择前必须验证名称、规格和页面状态。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

