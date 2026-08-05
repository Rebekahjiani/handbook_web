# 订单查找与已购商品属性

适用线索：最近订单、订单状态、已购商品、规格、配送与账单字段

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 先判定任务是单对象查找还是集合查找；进入订单历史并把每页行数据一次性读取为短台账，记录页面身份、行数与 Next。
2. 按日期、状态或商品名称筛选；查找“最近”记录时按页面显示日期比较。
3. 从目标行的实时详情链接进入详情，并核对订单号。
4. 读取任务要求的字段或商品选项，保留页面显示的单位和格式。

## 执行检查

- 分页后废弃旧引用；不要根据订单号拼接详情 URL。
- 查找最近状态时，一旦已按时间倒序确认首个精确状态匹配即可停止。
- 任务含 `all`、完整年份或日期范围时属于集合查找：必须覆盖整个范围并保存全部候选，不能找到第一项就停止。
- 按已购商品查找时，先穷尽目标日期范围内的订单行，再逐个打开候选详情；不要在订单页和站内搜索间循环。
- 无匹配必须有终页证据：完整当前页没有 Next，且已访问行数与页面报告的总数一致。
- 商品尺寸、容量等属性必须保留单位，例如 `16 inch`，不能只返回裸数字。
- 无匹配时导航回不带分页参数的订单历史首页，并返回 NOT_FOUND 与 null。

## 站点模型约束

- 业务对象 `order`：字段 `order_number、purchase_date、status、grand_total`。
- 业务能力 `extract-order-field`：输入 `selected_order_detail_context、requested_field`；输出 `field_value`；依赖上下文 `current-account-order-scope、selected-order-detail-context`。
- 业务能力 `find-latest-order-matching-status`：输入 `requested_status`；输出 `selected_order、no_matching_order`；依赖上下文 `current-account-order-scope、latest-order-selection-rule`。
- 页面状态 `storefront-order-history`：URL `^https?://(?:localhost|127\.0\.0\.1):7770/sales/order/history/(?:\?.*)?$`；必须同时观察字段 `order_number、purchase_date、grand_total、status、detail_link`。
- 页面状态 `storefront-order-detail`：URL `^https?://(?:localhost|127\.0\.0\.1):7770/sales/order/view/order_id/[0-9]+/(?:\?.*)?$`；必须同时观察字段 `order_number、purchase_date、grand_total`。
- 动作 `advance-order-history-page`：从当前快照重新解析 `pagination-next`，操作后重新验证页面状态与对象身份。
- 动作 `open-selected-order-detail`：从当前快照重新解析 `history-detail-link`，操作后重新验证页面状态与对象身份。

## 成功判据

- 列表行、详情页订单号和目标条件属于同一对象。
- 返回值保留页面显示的单位；无匹配时回到订单历史首页再结束。

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

- 查看订单通常无副作用；Reorder、取消或退货属于写操作，不要代替用户提交。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

