---
name: webarena-shopping-edit-submit
description: webarena-shopping 的创建、修改与提交工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 创建、修改与提交

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-edit-submit`

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

1. 打开目标记录或创建表单，确认当前身份与对象。
2. 按标签定位字段并填写，只修改任务要求的内容。
3. 提交前复核目标、字段差异和副作用。
4. 提交后验证成功提示、回显值或新记录标识。

## 操作锚点

- Add to Cart：`getByRole("button", { name: "Add to Cart", exact: true })`
- Add to Wish List：`getByRole("link", { name: "Add to Wish List", exact: true })`
- Add to Cart：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 修改只作用于目标对象和指定字段。
- 页面显示成功提示或可验证的新状态。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：这是写操作；删除、发布和发送等不可逆动作必须有明确任务授权。

