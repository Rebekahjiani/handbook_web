---
name: webarena-shopping-reviews
description: webarena-shopping 的商品详情与评论工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。

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

- 1 Review：`locator("a[href$=\"#reviews\"]").filter({ hasText: /Reviews?/i })`（confidence=0.75，evidence=unique,scoped）
- StarSmilez Tooth Brushing Magi Dragon Bundle Helps Kids Learn to Care f…：`locator("a.product-item-link").filter({ hasText: "<目标项名称>" })`（confidence=0.75，evidence=unique,scoped）
- Be the first to review this product：`locator("a[href$=\"#review-form\"]")`（confidence=0.75，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 结果全部来自目标商品，满足评分或文本条件，且已覆盖全部评论分页（末页无 Next 或已达到任务要求的数量上限）。
- 没有把相邻评论的作者、标题和正文混在一起。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：不要把商品总评分当作单条评论评分；分页时记录已处理页，防止重复。

