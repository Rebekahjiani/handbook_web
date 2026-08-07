---
name: webarena-reddit-post-create
description: webarena-reddit 的在 Subreddit 中发布新帖工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 在 Subreddit 中发布新帖

站点：`http://localhost:9999`
机器契约：`../../references/execution-contract.json#workflows-post-create`

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

1. 识别任务要求的目标 subreddit（明确指定或需根据主题推断）。
2. 进入该 subreddit，点击「New Post」或「Create Post」。
3. 填写标题（title）和正文（body）。如果是链接帖子，填写 URL。
4. 提交，确认帖子出现在 subreddit 页面。

## 停止条件与必检项

- 如果任务要求「最合适的 subreddit」，根据主题选择最接近的已有论坛，不要自行创建。
- 标题和正文中引号内的文字不要修改，原文照抄。
- 图片帖子需选择 Link/Image 类型，不要发成文本帖子。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- ^Posting ^a ^cutout? ^Please ^read ^this.：`locator("a[href=\"/r/cutouts/wiki/index#wiki_flair.3A\"]")`
- Link to post：`locator("a[title=\"I like feedback\"]")`
- Inimposter：`locator("a.fg-inherit[href=\"/user/Inimposter\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 帖子标题和正文与任务要求的文本一致。
- 帖子发布在正确的 subreddit。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：这是写操作；发帖内容来自任务要求的引号文本，不要自行改写。

