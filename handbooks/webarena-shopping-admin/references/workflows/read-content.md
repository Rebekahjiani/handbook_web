# 读取列表、详情与结构化数据

适用线索：get, return, list, show, summarize, how many, find, retrieve

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 确认目标记录、列表或时间范围。
2. 读取字段标签和一条完整记录，建立字段对应关系。
3. 需要统计时遍历分页并去重；需要详情时保持记录上下文。
4. 按任务要求的数据结构、类型和格式返回。

## 成功判据

- 结果来自正确记录或完整结果集。
- 字段名称、数据类型和输出格式符合任务要求。

## 已验证入口

- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/catalog/`；[页面快照](../../snapshots/pages/13-admin-admin-system-config-edit-section-catalog.json)
- Login as Customer Log / Customers / Magento Admin：`/admin/loginascustomer_log/log/index/`；[页面快照](../../snapshots/pages/04-admin-loginascustomer-log-log-index.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/web/`；[页面快照](../../snapshots/pages/05-admin-admin-system-config-edit-section-web.json)

## 操作锚点

- All Store Views：`getByRole("button", { name: "All Store Views", exact: true })`；证据：`01-admin.json`
- Default View：`getByRole("button", { name: "Default View", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`
- Previous Page：`getByRole("button", { name: "Previous Page", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`
- Next Page：`getByRole("button", { name: "Next Page", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`

## 风险与恢复

- 不要把首屏当作完整列表；缺失值与零值必须区分。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

