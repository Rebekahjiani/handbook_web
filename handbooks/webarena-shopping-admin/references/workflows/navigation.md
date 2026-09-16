# 页面导航

适用线索：go to, open, navigate, view, settings page

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 从当前 URL 和标题确认起点。
2. 使用左侧导航菜单或顶部菜单逐级进入目标页面。
3. 每次导航后检查 URL、主标题或关键内容。

## 执行检查

- Admin 菜单可能需要 hover 展开子菜单。
- 结束前重新读取页面，确认最终 URL 和标题同时匹配任务。

## 成功判据

- 最终页面的 URL、主标题和任务目标一致。

## 已验证入口

- Dashboard / Magento Admin：`/admin/admin/dashboard/`；[页面快照](../../snapshots/pages/01-admin.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/web/`；[页面快照](../../snapshots/pages/05-admin-admin-system-config-edit-section-web.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/catalog/`；[页面快照](../../snapshots/pages/13-admin-admin-system-config-edit-section-catalog.json)

## 操作锚点

- per page：`getByRole("textbox", { name: "per page", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`
- per page Select：`getByRole("button", { name: "per page Select", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`
- Previous Page：`getByRole("button", { name: "Previous Page", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`
- Next Page：`getByRole("button", { name: "Next Page", exact: true })`；证据：`04-admin-loginascustomer-log-log-index.json`

## 风险与恢复

- 遇到同名菜单项时先核对完整路径，不用坐标猜测。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

