# 满足约束的最优商品选择

适用线索：最便宜、最佳选项、最低容量、打开商品页

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 先解析比较器：`least expensive` 按价格升序，`most expensive` 按价格降序，`most recent released` 按产品发布日期降序；`best` 保留站点相关性或任务明确给出的质量信号。
2. 把候选验收拆成两个独立谓词：`is_target_product_type` 判断它是任务所说的主商品/配件类型，`satisfies_task_constraint` 判断平台兼容、容量等约束；两者都为真才进入候选集。多平台配件可用明确兼容性满足平台约束，不要求独占该平台分类；主机本体不能冒充配件。
3. 优先使用站点已有的精确分类或一次主搜索建立候选集并排序。在价格降序已验证生效后，从顶部依次验收，不跨到无关分类分支重新比较。
4. 按比较器顺序核对硬约束；容量、数量、兼容性必须修饰目标商品本身，优先用规格/详情证据，不把包装、附件或营销数字当容量。
5. 找到第一个满足比较器和全部硬约束的候选后，从 accepted_candidates 台账中取出该商品的精确 URL，直接导航到该 URL（不通过再次点击搜索结果中的视觉元素）。
6. 打开商品页后立刻执行字符串比较：location.href 必须等于台账中的精确 URL；不一致时重新导航，不得用视觉近似判断跳过该检查。确认后立即结束。

## 执行检查

- 产品名称不充分时才打开详情核对；最多检查八个候选。
- 查询预算是一个主查询加至多一个召回补充查询；同一结果 URL 不得重复读取。
- 若价格升序生效，第一个验证通过的候选即可停止；未验证通过的更低价候选必须在台账中有明确排除理由。
- 若价格降序生效，只有站点明确显示降序已生效，或已枚举完整候选集并自行求最大值，才能在首个验证通过的候选处停止。
- 多平台商品不得仅因不独占目标平台而排除；必须分别记录产品类型证据和兼容性证据。反之，只有兼容性而产品类型不符时必须排除。
- `most recent released` 比较产品发布日期；不得用型号数字、评论日期或页面更新时间替代。
- `best` 没有显式价格词时不得按最低价排序；优先站点默认相关性，再使用评分、评论量或与约束的精确匹配作为可解释信号。
- 候选分类证据优先于标题是否逐字包含任务同义词；只有主商品类型冲突时才排除。
- 到达商品页后提交前重新读取当前 URL，确认它仍等于台账中的精确 URL。
- 到达目标商品页后立刻结束，搜索结果页不能作为成功状态。

## 站点模型约束

- 业务对象 `product`：字段 ``。
- 业务对象 `product-collection`：字段 ``。
- 业务能力 `inspect-product`：输入 `A product selected from a product collection.`；输出 `Observed product identity, price, descriptive attributes, and review-related state.`；依赖上下文 `catalog-exploration`。
- 页面状态 `storefront-catalog`：URL `undefined`；必须同时观察字段 `无`。
- 动作 `catalog-inspect-product`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 最终位于满足所有硬约束的商品详情页，且 location.href 字符串等于 accepted_candidates 台账中该商品的精确 URL（非目测近似）。
- 已证明在完整候选集内不存在按任务比较器更优且同样满足条件的商品。

## 已验证入口

- Cabinets, Racks & Shelves - Office Furniture & Lighting - Office Products：`/office-products/office-furniture-lighting/cabinets-racks-shelves.html`；[页面快照](../../snapshots/pages/02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json)
- Children's Dental Care - Oral Care - Beauty & Personal Care：`/beauty-personal-care/oral-care/children-s-dental-care.html`；[页面快照](../../snapshots/pages/03-beauty-personal-care-oral-care-children-s-dental-care-html.json)
- Nintendo Switch - Video Games：`/video-games/nintendo-switch.html`；[页面快照](../../snapshots/pages/04-video-games-nintendo-switch-html.json)

## 操作锚点

- Sort By：`locator("select[data-role=\"sorter\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Set Descending Direction：`locator("a[data-role=\"direction-switcher\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 容量数字可能描述包装、附件或兼容数量；必须确认它修饰任务要求的属性。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

