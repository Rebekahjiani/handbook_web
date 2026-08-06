---
name: webarena-shopping-reviews
description: webarena-shopping 的商品详情与评论工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
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
2. 进入评论区域，按评分或文本条件读取；评论区有独立分页时逐页读取，按（作者＋标题＋评分）复合键去重，不得仅读首屏可见评论就声明完整。
3. 把评论者、标题、评分和正文保持在同一条评论容器中。
4. 去重后按任务指定的数据结构返回。

## 停止条件与必检项

- 作者、标题、评分和正文必须来自同一条评论容器。
- 分页可能重复最后几条评论；先按 `标题 + 评分 + 作者 + 正文` 的复合键去重，再投影为任务要求的标题或作者列表。
- 评论者姓名按评论容器的可见文本原样返回；只去首尾空白，不合并或改写重复文本节点。
- 最终返回页面观察值；除非任务明确要求文件，否则不要返回快照文件名或路径。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- 1 Review：`locator("a[href$=\"#reviews\"]").filter({ hasText: /Reviews?/i })`
- StarSmilez Tooth Brushing Magi Dragon Bundle Helps Kids Learn to Care f…：`locator("a.product-item-link").filter({ hasText: "<目标项名称>" })`
- Be the first to review this product：`locator("a[href$=\"#review-form\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 结果全部来自目标商品，满足评分或文本条件，且已覆盖全部评论分页（末页无 Next 或已达到任务要求的数量上限）。
- 没有把相邻评论的作者、标题和正文混在一起。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：不要把商品总评分当作单条评论评分；分页时记录已处理页，防止重复。

