# 客户信息查询与管理

适用线索：customer, email, nickname, account, group, address

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 进入 Customers > All Customers。
2. 按名称、邮箱或客户组筛选目标客户。
3. 进入客户详情读取任务要求的字段。

## 执行检查

- 同名客户用邮箱区分。
- nickname 字段在账户信息标签页，不在列表页。

## 成功判据

- 结果来自正确客户记录。
- 字段值与页面显示一致。

## 已验证入口

- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/trans_email/`；[页面快照](../../snapshots/pages/07-admin-admin-system-config-edit-section-trans-email.json)
- Login as Customer Log / Customers / Magento Admin：`/admin/loginascustomer_log/log/index/`；[页面快照](../../snapshots/pages/04-admin-loginascustomer-log-log-index.json)

## 操作锚点

- CUSTOMERS：`getByRole("link", { name: "CUSTOMERS", exact: true })`；证据：`01-admin.json`
- New Customers：`locator("a.tab-item-link").filter({ hasText: "<目标项名称>" })`；证据：`01-admin.json`
- Admin User Emails：`locator("a.open[href=\"#admin_emails-link\"]")`；证据：`02-admin-admin-system-config-edit-section-admin.json`
- Forgot Password Email Template：`locator("#admin_emails_forgot_email_template")`；证据：`02-admin-admin-system-config-edit-section-admin.json`

## 风险与恢复

- 修改客户信息是写操作；只有任务明确授权时才提交。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

