---
name: webarena-shopping-admin-admin-product-edit
description: webarena-shopping-admin 的商品属性编辑与状态管理工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 商品属性编辑与状态管理

站点：`http://localhost:7780`
机器契约：`../../references/execution-contract.json#workflows-admin-product-edit`

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

1. 在 Catalog > Products 中通过名称或 SKU 定位目标商品。
2. 进入编辑页，确认商品名称与任务一致。
3. 只修改任务要求的字段（价格/描述/状态/属性等）。
4. 点击 Save，确认成功提示。

## 停止条件与必检项

- 修改前记录原始值以备核对。
- Enable/Disable 操作后在列表页确认状态列已变更。
- 价格修改时注意任务是绝对值还是相对增减。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- CATALOG：`getByRole("link", { name: "CATALOG", exact: true })`
- Learn more：`getByRole("link", { name: "Learn more", exact: true })`
- Enable Charts：`locator("#admin_dashboard_enable_charts")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 保存后页面显示成功提示。
- 修改只作用于目标商品的指定字段。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：这是写操作；修改错误商品或字段不可自动恢复，必须严格核对商品名称。

