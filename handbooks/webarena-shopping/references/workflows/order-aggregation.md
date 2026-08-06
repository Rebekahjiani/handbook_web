# 订单筛选、金额聚合与退款

适用线索：订单数量、消费金额、时间范围、商品类别、退款

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 先把日期上下界、订单状态、商品条件和运费口径写成固定筛选条件。
2. 在订单历史中一次读取每页的订单号、日期、状态、总额和详情链接；记录页面身份、行数与 Next。
3. 只为筛选后的订单打开详情；按任务口径读取商品小计、数量、运费和总额。
4. 只有已访问行数覆盖页面报告的总记录数，或在完整当前页确认 Next 不存在后，才用去重台账计数或求和。

## 执行检查

- “spent”默认排除 Canceled；退款任务只处理 Canceled，除非任务明确另有状态口径。
- 包含运费时使用 Grand Total；排除运费或按商品类别统计时使用商品小计，不要用 Grand Total。
- 退款先建立逐订单账本，再按 `可退商品小计 - 明确保留商品行金额 + 可退运费` 计算；每个保留项和运费口径都必须有行级证据。
- “过去 N 个月”按包含当前月的 N 个日历月解释；只有任务明确给出天数或滚动日期时才使用滚动窗口。
- 进入详情后核对页面订单号；商品类别优先以站点分类和商品用途判断：主用途属于目标类别才计入，名称近似但用途不同的配件不计入。
- 食品相关可包含烘焙装饰等直接用于食品的商品；hair care/style 只包含护理或造型产品，不包含纯装饰配件。
- 不能因当前页没有分页控件就断言只有一页；同时核对总记录文本、已访问行数和页面身份。
- 无匹配记录时返回任务协议要求的空值；不要用空数组代替 null。

## 站点模型约束

- 业务对象 `order`：字段 `order_number、purchase_date、status、grand_total`。
- 业务能力 `extract-order-field`：输入 `selected_order_detail_context、requested_field`；输出 `field_value`；依赖上下文 `current-account-order-scope、selected-order-detail-context`。
- 业务能力 `find-latest-order-matching-status`：输入 `requested_status`；输出 `selected_order、no_matching_order`；依赖上下文 `current-account-order-scope、latest-order-selection-rule`。
- 页面状态 `storefront-order-history`：URL `^https?://(?:localhost|127\.0\.0\.1):7770/sales/order/history/(?:\?.*)?$`；必须同时观察字段 `order_number、purchase_date、grand_total、status、detail_link`。
- 页面状态 `storefront-order-detail`：URL `^https?://(?:localhost|127\.0\.0\.1):7770/sales/order/view/order_id/[0-9]+/(?:\?.*)?$`；必须同时观察字段 `order_number、purchase_date、grand_total`。
- 动作 `advance-order-history-page`：从当前快照重新解析 `pagination-next`，操作后重新验证页面状态与对象身份。
- 动作 `open-selected-order-detail`：从当前快照重新解析 `history-detail-link`，操作后重新验证页面状态与对象身份。

## 成功判据

- 非空结果：accepted_records 非空，且每条记录都有日期、状态和商品条件的行级证据。——空结果：accepted_records 为空，且已记录终页证据（最后一页 URL、已访问行数、页面报告总数三者吻合）。两种情况必须满足其中之一，不得仅凭台账为空就声明 SUCCESS。
- 计数、金额和分组能回溯到同一份去重台账；无匹配时返回任务协议要求的 null 并附终页证据。

## 已验证入口

- 当前抓取范围没有覆盖该流程；先用页面语义探索，不要臆造 selector。

## 操作锚点

- View All：`locator("a.action[href=\"${SITE_ORIGIN}/customer/account/#my-orders-table\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 模型定位证据

- 下列 selector 用于缩小实时快照范围或核验结构；点击时仍使用当前快照返回的元素引用。
- `history-row`：`table#my-orders-table.history > tbody > tr`；作用域 `history-table`；verified
- `history-purchase-date`：`:scope > td[data-th="Date"]`；作用域 `history-row`；verified
- `history-grand-total`：`:scope > td[data-th="Order Total"] .price`；作用域 `history-row`；verified
- `history-status`：`:scope > td[data-th="Status"]`；作用域 `history-row`；verified
- `history-detail-link`：`:scope > td[data-th="Actions"] > a.action.view`；作用域 `history-row`；verified
- `pagination-next`：`.pages .pages-item-next > a.action.next`；作用域 `document`；verified
- `detail-grand-total`：`tr.grand_total > td.amount[data-th="Grand Total"] .price`；作用域 `detail-totals`；verified

## 风险与恢复

- 查看订单通常无副作用；取消、退货或再次购买属于写操作，不要代替用户提交。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

