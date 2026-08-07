---
name: webarena-reddit-forum-create
description: webarena-reddit 的创建新论坛（Subreddit）工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 创建新论坛（Subreddit）

站点：`http://localhost:9999`
机器契约：`../../references/execution-contract.json#workflows-forum-create`

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

1. 进入 reddit 首页，找到「Create a Forum」或「Create Community」入口。
2. 填写论坛名称（name）和描述（description）。
3. 按任务要求添加 sidebar 标签（tags/flairs）。
4. 提交创建，确认论坛主页已出现。

## 停止条件与必检项

- 论坛名称区分大小写，不要自动补全或更改。
- Sidebar 标签逐一核对列表，不要遗漏。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- contact the moderators of this subreddit：`locator("a[href=\"/message/compose/?to=/r/photoshopbattles\"]")`
- contact the moderators of this subreddit：`locator("a[href=\"/message/compose/?to=/r/EarthPorn\"]")`
- Jump to sidebar：`locator("a.site-accessibility-nav__link[href=\"#sidebar\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 论坛名称与任务要求完全一致。
- Sidebar 包含任务要求的所有标签，顺序不限。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：创建后论坛名称通常不可更改；提交前再次核对名称拼写。

