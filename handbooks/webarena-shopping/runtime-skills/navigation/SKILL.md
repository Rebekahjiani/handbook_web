---
name: webarena-shopping-navigation
description: webarena-shopping 的页面导航工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 页面导航

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-navigation`

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

1. 从当前 URL 和标题确认起点。
2. 使用语义链接逐级进入目标页面。
3. 每次导航后检查 URL、主标题或关键内容。

## 停止条件与必检项

- 必须通过页面中的真实链接或控件完成导航；搜索结果页不是目标页的替代品。
- 结束前重新读取页面，确认最终 URL、标题和关键内容同时匹配任务。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- beauty personal care > hair care > styling products：`/beauty-personal-care/hair-care/styling-products.html`

## 操作锚点

- Office Products：`getByRole("link", { name: "Office Products", exact: true })`
- Home & Kitchen：`getByRole("link", { name: "Home & Kitchen", exact: true })`
- My Account：`getByRole("link", { name: "My Account", exact: true })`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 最终页面的 URL、主标题和任务目标一致。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：遇到同名链接时先限定导航区或内容区，不要用坐标猜测。

