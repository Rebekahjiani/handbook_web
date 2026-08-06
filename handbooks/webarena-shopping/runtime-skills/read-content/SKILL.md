---
name: webarena-shopping-read-content
description: webarena-shopping 的读取列表、详情与结构化数据工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 读取列表、详情与结构化数据

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-read-content`

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

1. 确认目标记录、列表或时间范围。
2. 读取列名、字段标签和一条完整记录，建立字段对应关系。
3. 需要统计时遍历分页并去重；需要详情时保持记录上下文。
4. 按任务要求的数据结构、类型和格式返回。

## 已验证结构

- `history-row`：`table#my-orders-table.history > tbody > tr`（history-table）
- `history-detail-link`：`:scope > td[data-th="Actions"] > a.action.view`（history-row）
- `detail-grand-total`：`tr.grand_total > td.amount[data-th="Grand Total"] .price`（detail-totals）
- `history-page-title`：`h1.page-title [data-ui-id="page-title-wrapper"]`（document）
- `history-table`：`table#my-orders-table.history`（document）
- `detail-page-title`：`h1.page-title [data-ui-id="page-title-wrapper"]`（document）
- `detail-order-date`：`.order-date > span:not(.label)`（document）

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 结果来自正确记录或完整结果集。
- 字段名称、数据类型和输出格式符合任务要求。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：不要把首屏当作完整列表；缺失值与零值必须区分。

