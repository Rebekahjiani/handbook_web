# 商品集合、名称与价格聚合

适用线索：价格范围、品牌商品、完整名称、可用型号

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 用最短且有区分度的查询词建立候选集，并固定品牌、类别和产品类型条件。
2. 把页面显示数量调到最大，记录总结果数和当前页身份；每页只做一次 DOM 批量读取，得到名称、价格和链接。
3. 按 Next 逐页去重；只有完整当前页没有 Next，或已访问商品数覆盖总结果数时才停止，禁止根据前几页内容推断后续没有目标。
4. 用标题、分类/面包屑和详情主商品身份共同筛选；目标作为主商品时可包含附件套装，目标仅作为附赠品时排除。
5. 从同一候选台账返回完整名称、最小价和最大价。

## 执行检查

- 每个候选必须同时满足核心产品词和品牌；不能只因搜索命中就计入。
- 品牌和产品类型可由标题或站点分类证明；不要要求自然语言同义词必须逐字出现在标题。
- 优先把每页显示数量调到最大，再遍历分页。
- 查询预算是一个主查询加至多一个召回补充查询；每个规范 URL 只读取一次，不检查与任务无关的筛选器。
- 维护 `已访问页/总结果/已读取卡片/去重候选` 四个计数；任何一个无法解释时不得声称集合完整。
- 召回补充查询只补主查询缺少的品牌或类型证据；合并后按商品 URL 去重，再统一做语义验收。
- 完成分页后立刻计算并返回，不要为已确定的极值继续打开商品详情。

## 站点模型约束

- 业务对象 `category`：字段 `name、hierarchy`。
- 业务对象 `product`：字段 `name、price、stock_state、product_identifier`。
- 业务能力 `extract-product-field`：输入 `selected_product_detail_context、requested_field`；输出 `field_value`；依赖上下文 `selected-category-scope、selected-product-detail-context`。
- 业务能力 `select-product-from-category`：输入 `requested_category、product_criteria`；输出 `selected_product`；依赖上下文 `selected-category-scope`。

## 成功判据

- 候选集合覆盖全部结果页且没有近似商品。
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

