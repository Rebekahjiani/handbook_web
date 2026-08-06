---
name: webarena-shopping-order-aggregation
description: webarena-shopping 的订单筛选、金额聚合与退款工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 订单筛选、金额聚合与退款

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-order-aggregation`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `target_period`：时间范围或顺序要求
- `target_status`：任务要求的订单状态
- `visited_page_ids`：已处理订单页 URL 集合
- `seen_record_ids`：已读取订单号集合
- `accepted_records`：满足时间与状态条件的订单台账
- `next_href`：唯一待访问的下一页；无下一页时为 `null`

## 循环动作

1. 先把日期上下界、订单状态、商品条件和运费口径写成固定筛选条件。
2. 在订单历史中一次读取每页的订单号、日期、状态、总额和详情链接；记录页面身份、行数与 Next。
3. 只为筛选后的订单打开详情；按任务口径读取商品小计、数量、运费和总额。
4. 只有已访问行数覆盖页面报告的总记录数，或在完整当前页确认 Next 不存在后，才用去重台账计数或求和。

## 停止条件与必检项

- “spent”默认排除 Canceled；退款任务只处理 Canceled，除非任务明确另有状态口径。
- 包含运费时使用 Grand Total；排除运费或按商品类别统计时使用商品小计，不要用 Grand Total。
- 退款先建立逐订单账本，再按 `可退商品小计 - 明确保留商品行金额 + 可退运费` 计算；每个保留项和运费口径都必须有行级证据。
- “过去 N 个月”按包含当前月的 N 个日历月解释；只有任务明确给出天数或滚动日期时才使用滚动窗口。
- 进入详情后核对页面订单号；商品类别优先以站点分类和商品用途判断：主用途属于目标类别才计入，名称近似但用途不同的配件不计入。
- 食品相关可包含烘焙装饰等直接用于食品的商品；hair care/style 只包含护理或造型产品，不包含纯装饰配件。
- 不能因当前页没有分页控件就断言只有一页；同时核对总记录文本、已访问行数和页面身份。
- 无匹配记录时返回任务协议要求的空值；不要用空数组代替 null。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- electronics > headphones > over ear headphones：`/electronics/headphones/over-ear-headphones.html`
- grocery gourmet food > snacks sweets > snack foods：`/grocery-gourmet-food/snacks-sweets/snack-foods.html`
- beauty personal care > hair care：`/beauty-personal-care/hair-care.html`
- electronics > power accessories > ac adapters：`/electronics/power-accessories/ac-adapters.html`

## 已验证结构

- `history-row`：`table#my-orders-table.history > tbody > tr`（history-table）
- `history-purchase-date`：`:scope > td[data-th="Date"]`（history-row）
- `history-grand-total`：`:scope > td[data-th="Order Total"] .price`（history-row）
- `history-status`：`:scope > td[data-th="Status"]`（history-row）
- `history-detail-link`：`:scope > td[data-th="Actions"] > a.action.view`（history-row）
- `pagination-next`：`.pages .pages-item-next > a.action.next`（document）
- `detail-grand-total`：`tr.grand_total > td.amount[data-th="Grand Total"] .price`（detail-totals）

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 非空结果：accepted_records 非空，且每条记录都有日期、状态和商品条件的行级证据。——空结果：accepted_records 为空，且已记录终页证据（最后一页 URL、已访问行数、页面报告总数三者吻合）。两种情况必须满足其中之一，不得仅凭台账为空就声明 SUCCESS。
- 计数、金额和分组能回溯到同一份去重台账；无匹配时返回任务协议要求的 null 并附终页证据。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：查看订单通常无副作用；取消、退货或再次购买属于写操作，不要代替用户提交。

