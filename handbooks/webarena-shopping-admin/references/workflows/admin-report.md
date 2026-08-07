# 销售报表与聚合统计

适用线索：best-selling, top product, revenue, sales, quarter, month, brand, SKU

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 确认报表类型（商品/品牌/类别/时间段）和筛选维度。
2. 进入 Reports 菜单，选择对应子报表（Products/Bestsellers/Orders）。
3. 设置时间范围筛选，刷新报表。
4. 按照任务要求读取 Top-N 行的名称、数量或金额字段。

## 执行检查

- 时间筛选必须精确到任务要求的年份/季度/月份边界。
- 注意区分 Bestsellers（按销量）和 Revenue（按金额）报表。
- Top-N 结果中并列时按报表显示顺序返回，不推断。

## 成功判据

- 结果来自正确的时间范围和报表类型。
- Top-N 顺序与报表排序一致。

## 已验证入口

- Dashboard / Magento Admin：`/admin/admin/dashboard/`；[页面快照](../../snapshots/pages/01-admin.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/analytics/`；[页面快照](../../snapshots/pages/12-admin-admin-system-config-edit-section-analytics.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/reports/`；[页面快照](../../snapshots/pages/09-admin-admin-system-config-edit-section-reports.json)

## 操作锚点

- SALES：`getByRole("link", { name: "SALES", exact: true })`；证据：`01-admin.json`
- REPORTS：`getByRole("link", { name: "REPORTS", exact: true })`；证据：`01-admin.json`
- Retry Synchronization：`getByRole("link", { name: "Retry Synchronization", exact: true })`；证据：`01-admin.json`
- CATALOG：`getByRole("link", { name: "CATALOG", exact: true })`；证据：`01-admin.json`

## 风险与恢复

- 报表是只读视图，无副作用；但筛选条件错误会导致错误数据，必须二次核对时间范围。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

