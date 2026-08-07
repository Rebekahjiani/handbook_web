---
name: webarena-reddit-cross-site-post
description: webarena-reddit 的跨站内容引用并发帖工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 跨站内容引用并发帖

站点：`http://localhost:9999`
机器契约：`../../references/execution-contract.json#workflows-cross-site-post`

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

1. 确认任务要求的外部来源（GitLab 仓库/购物网站评论/指定页面）。
2. 打开外部站点，提取任务要求的内容（URL、描述、评论标题等）。
3. 切换到 reddit，找到任务指定的或最合适的 subreddit。
4. 创建帖子，粘贴从外部收集的内容，提交。
5. 确认帖子已成功发布。

## 停止条件与必检项

- 提取外部数据时记录原始值，避免复制错误。
- GitLab 描述从仓库主页 About 区域读取，不要自行编写。
- 跨站任务顺序：先采集，再发帖；不要同时打开多个标签混淆状态。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- log in：`getByRole("link", { name: "log in", exact: true })`
- register：`getByRole("link", { name: "register", exact: true })`
- full video：`getByRole("link", { name: "full video", exact: true })`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 帖子内容准确引用了外部来源的数据。
- 帖子发布在任务指定或最匹配的 subreddit。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：这是写操作，发帖后不可直接撤回；发帖前必须核对内容与来源一致。

