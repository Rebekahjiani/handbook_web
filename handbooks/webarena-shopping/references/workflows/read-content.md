# 读取列表、详情与结构化数据

适用线索：读取、查询、列表、详情、统计、下载、导出

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 确认目标记录、列表或时间范围。
2. 读取列名、字段标签和一条完整记录，建立字段对应关系。
3. 需要统计时遍历分页并去重；需要详情时保持记录上下文。
4. 按任务要求的数据结构、类型和格式返回。

## 站点模型约束

- 动作 `orders-inspect-detail`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 结果来自正确记录或完整结果集。
- 字段名称、数据类型和输出格式符合任务要求。

## 已验证入口

- Clothing - Novelty & More - Clothing, Shoes & Jewelry：`/clothing-shoes-jewelry/novelty-more/clothing.html`；[页面快照](../../snapshots/pages/23-clothing-shoes-jewelry-novelty-more-clothing-html.json)
- Denture Care - Oral Care - Beauty & Personal Care：`/beauty-personal-care/oral-care/denture-care.html`；[页面快照](../../snapshots/pages/29-beauty-personal-care-oral-care-denture-care-html.json)
- One Stop Market：`/`；[页面快照](../../snapshots/pages/01-home.json)

## 操作锚点

- Add to Wish List：`getByRole("link", { name: "Add to Wish List", exact: true })`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- Novelty & More：`getByRole("link", { name: "Novelty & More", exact: true })`；证据：`23-clothing-shoes-jewelry-novelty-more-clothing-html.json`
- Add to Wish List：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("link", { name: "Add to Wish List", exact: false })`；证据：`01-home.json`
- Add to Wish List：`locator("li.item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Wish List", exact: false })`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 不要把首屏当作完整列表；缺失值与零值必须区分。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

