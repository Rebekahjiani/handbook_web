# 创建、修改与提交

适用线索：create, add, edit, update, delete, upload, save, send, notify

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 打开目标记录或创建表单，确认当前身份与对象。
2. 按标签定位字段并填写，只修改任务要求的内容。
3. 提交前复核目标、字段差异和副作用。
4. 提交后验证成功提示、回显值或新记录标识。

## 成功判据

- 修改只作用于目标对象和指定字段。
- 页面显示成功提示或可验证的新状态。

## 已验证入口

- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/catalog/`；[页面快照](../../snapshots/pages/13-admin-admin-system-config-edit-section-catalog.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/web/`；[页面快照](../../snapshots/pages/05-admin-admin-system-config-edit-section-web.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/general/`；[页面快照](../../snapshots/pages/03-admin-admin-system-config-edit-section-general.json)

## 操作锚点

- Save Config：`getByRole("button", { name: "Save Config", exact: true })`；证据：`02-admin-admin-system-config-edit-section-admin.json`
- SALES：`getByRole("link", { name: "SALES", exact: true })`；证据：`02-admin-admin-system-config-edit-section-admin.json`
- CATALOG：`getByRole("link", { name: "CATALOG", exact: true })`；证据：`02-admin-admin-system-config-edit-section-admin.json`
- CUSTOMERS：`getByRole("link", { name: "CUSTOMERS", exact: true })`；证据：`02-admin-admin-system-config-edit-section-admin.json`

## 风险与恢复

- 这是写操作；删除、发布等不可逆动作必须有明确任务授权。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

