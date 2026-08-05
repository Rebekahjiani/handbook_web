---
name: webarena-shopping-reviews
description: webarena-shopping 的商品详情与评论工作流。
---

# 运行规则

- 本技能已由总 router 按站点和任务预选；只执行本工作流。
- 以实时浏览器状态为准。导航或分页后废弃旧引用，并重新核对 URL、标题和对象身份。
- 列表任务优先在当前页面做一次作用域明确的 DOM 读取；不要反复保存或加载整页快照。
- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 提交前重新读取当前 URL、标题和目标对象；不得用旧观察描述最终状态。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 商品详情与评论

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-reviews`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `goal`：任务要求的最终页面状态或数据
- `hard_constraints`：不可放宽的显式条件
- `visited_page_ids`：已处理页面 URL 集合
- `accepted_evidence`：支持完成结论的页面证据
- `next_action`：当前唯一动作；完成或无法安全推进时为 `null`

## 循环动作

1. 确认当前商品名称与任务一致。
2. 进入评论区域，按评分、文本条件或分页范围读取。
3. 把评论者、标题、评分和正文保持在同一条评论上下文中。
4. 去重后按任务指定的数据结构返回。

## 停止条件与必检项

- 作者、标题、评分和正文必须来自同一条评论容器。
- 分页可能重复最后几条评论；先按 `标题 + 评分 + 作者 + 正文` 的复合键去重，再投影为任务要求的标题或作者列表。
- 评论者姓名按评论容器的可见文本原样返回；只去首尾空白，不合并或改写重复文本节点。
- 最终返回页面观察值；除非任务明确要求文件，否则不要返回快照文件名或路径。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- beauty personal care > hair care > styling products：`/beauty-personal-care/hair-care/styling-products.html`

## 操作锚点

- 1 Review：`locator("a[href$=\"#reviews\"]").filter({ hasText: /Reviews?/i })`
- StarSmilez Tooth Brushing Magi Dragon Bundle Helps Kids Learn to Care f…：`locator("a.product-item-link").filter({ hasText: "<目标项名称>" })`
- Be the first to review this product：`locator("a[href$=\"#review-form\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `URL + title + H1/目标对象`；最终答案只能描述这次读取到的当前状态。
- NAVIGATE 任务中，当前 URL 必须精确等于选中的候选 URL，并逐项保留任务要求的小数边界与 query 参数；不允许用语义近似页面代替。
- RETRIEVE 任务中，先按要求校验返回值的类型、空值协议和字段集合；浏览器中断或证据不足时不得返回 SUCCESS。
- 如果口头选中的候选与当前 URL 不一致，必须导航到候选并重新执行本闸门；否则判定失败。

## 完成证明

- 结果全部来自目标商品，且满足评分或文本条件。
- 没有把相邻评论的作者、标题和正文混在一起。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：不要把商品总评分当作单条评论评分；分页时记录已处理页，防止重复。

