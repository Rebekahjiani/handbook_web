# 商品集合、名称与价格聚合

适用线索：价格范围、品牌商品、完整名称、可用型号

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 先按输出选择证明策略：只有 min/max 的价格范围任务使用精确类别内的升序/降序边界证明；要求完整名称或型号集合时使用 Advanced Search 的 Name 高精度集合并闭合分页。
2. 边界证明分别构造价格升序与降序的规范类别 URL，直接带最大 `product_list_limit` 和排序参数；每页批量读取后按顺序选择第一个满足产品类型、品牌和其他硬约束的候选。
3. 完整集合证明把页面显示数量调到最大，记录总结果数和当前页身份；按 Next 逐页去重，只有没有 Next 或已覆盖总结果数时才停止。
4. 完整集合若无法从主查询证明语义召回闭合，可执行一次产品类型的直接同义词 Name 查询；两次查询分别闭合分页后按商品 URL 合并去重。
5. 先用列表标题筛选主商品身份；仅当标题语义确实歧义时才打开少量详情，不得为证明类别而绕行分类页或枚举导航菜单。目标作为主商品时可包含附件套装，目标仅作为附赠品时排除。
6. 从同一候选台账返回完整名称、最小价和最大价。

## 执行检查

- 每个候选必须同时满足核心产品词和品牌；不能只因搜索命中就计入。
- 品牌和产品类型可由标题或站点分类证明；不要要求自然语言同义词必须逐字出现在标题。
- 优先把每页显示数量调到最大；通过规范 URL 一次设置分页量和排序，不要重复操作同一个下拉框。
- 完整列表的查询预算是一个 Advanced Search Name 主查询加至多一个直接同义词补充查询；仅 min/max 的边界证明不执行这两个查询。每个规范 URL 只读取一次。
- 维护 `已访问页/总结果/已读取卡片/去重候选` 四个计数；任何一个无法解释时不得声称集合完整。
- 召回补充查询只替换产品类型同义词，必须保留品牌与其他硬约束；不得给查询加引号制造精确短语搜索。即使主查询已有候选，只要完整聚合仍无法证明同义词召回闭合，也允许使用。合并后按商品 URL 去重，再统一做语义验收。
- 完成分页后立刻计算并返回，不要为已确定的极值继续打开商品详情。

## 站点模型约束

- 业务对象 `product`：字段 ``。
- 业务对象 `product-collection`：字段 ``。
- 业务能力 `browse-catalog`：输入 `A category or catalog area to inspect.`；输出 `A product collection with its observed segmentation and ordering context.`；依赖上下文 `catalog-exploration`。
- 页面状态 `storefront-catalog`：URL `undefined`；必须同时观察字段 `无`。
- 动作 `catalog-browse-category`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。
- 动作 `catalog-advance-results`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 完整列表任务覆盖全部查询结果页；仅 min/max 任务分别证明升序和降序边界上的第一个合格候选。
- 名称列表与 min/max 来自同一份去重候选台账。

## 已验证入口

- Cabinets, Racks & Shelves - Office Furniture & Lighting - Office Products：`/office-products/office-furniture-lighting/cabinets-racks-shelves.html`；[页面快照](../../snapshots/pages/02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json)

## 操作锚点

- Page 2：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=2\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Page 3：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=3\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Page 4：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=4\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Page 5：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=5\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 站内搜索可能返回广告、配件或相似词商品；必须按名称和类别逐条验收。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

