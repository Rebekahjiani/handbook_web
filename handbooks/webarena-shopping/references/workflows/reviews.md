# 商品详情与评论

适用线索：商品详情、评论、评分、评论者、评论标题、摘要

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 确认当前商品名称与任务一致。
2. 进入评论区域，按评分或文本条件读取；评论区有独立分页时逐页读取，按（作者＋标题＋评分）复合键去重，不得仅读首屏可见评论就声明完整。
3. 把评论者、标题、评分和正文保持在同一条评论容器中。
4. 去重后按任务指定的数据结构返回。

## 执行检查

- 作者、标题、评分和正文必须来自同一条评论容器。
- 分页可能重复最后几条评论；先按 `标题 + 评分 + 作者 + 正文` 的复合键去重，再投影为任务要求的标题或作者列表。
- 评论者姓名按评论容器的可见文本原样返回；只去首尾空白，不合并或改写重复文本节点。
- 最终返回页面观察值；除非任务明确要求文件，否则不要返回快照文件名或路径。

## 成功判据

- 结果全部来自目标商品，满足评分或文本条件，且已覆盖全部评论分页（末页无 Next 或已达到任务要求的数量上限）。
- 没有把相邻评论的作者、标题和正文混在一起。

## 已验证入口

- 当前抓取范围没有覆盖该流程；先用页面语义探索，不要臆造 selector。

## 操作锚点

- 1 Review：`locator("a[href$=\"#reviews\"]").filter({ hasText: /Reviews?/i })`；证据：`01-home.json`
- StarSmilez Tooth Brushing Magi Dragon Bundle Helps Kids Learn to Care f…：`locator("a.product-item-link").filter({ hasText: "<目标项名称>" })`；证据：`03-beauty-personal-care-oral-care-children-s-dental-care-html.json`
- Be the first to review this product：`locator("a[href$=\"#review-form\"]")`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- link 控件：`locator("a.product[href=\"${SITE_ORIGIN}/starsmilez-tooth-brushing-magi-dragon-bundle-helps-kids-learn-to-care-for-their-teeth-moon-and-stars-easy-grip-toothbrushes-magical-dragon-plush-with-download-of-matching-activities.html\"]")`；证据：`03-beauty-personal-care-oral-care-children-s-dental-care-html.json`

## 风险与恢复

- 不要把商品总评分当作单条评论评分；分页时记录已处理页，防止重复。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

