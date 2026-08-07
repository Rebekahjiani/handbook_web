# 商品属性编辑与状态管理

适用线索：update, disable, enable, price, description, SKU, on-sale, status

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 在 Catalog > Products 中通过名称或 SKU 定位目标商品。
2. 进入编辑页，确认商品名称与任务一致。
3. 只修改任务要求的字段（价格/描述/状态/属性等）。
4. 点击 Save，确认成功提示。

## 执行检查

- 修改前记录原始值以备核对。
- Enable/Disable 操作后在列表页确认状态列已变更。
- 价格修改时注意任务是绝对值还是相对增减。

## 成功判据

- 保存后页面显示成功提示。
- 修改只作用于目标商品的指定字段。

## 已验证入口

- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/catalog/`；[页面快照](../../snapshots/pages/13-admin-admin-system-config-edit-section-catalog.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/cataloginventory/`；[页面快照](../../snapshots/pages/14-admin-admin-system-config-edit-section-cataloginventory.json)
- Configuration / Settings / Stores / Magento Admin：`/admin/admin/system_config/edit/section/web/`；[页面快照](../../snapshots/pages/05-admin-admin-system-config-edit-section-web.json)

## 操作锚点

- CATALOG：`getByRole("link", { name: "CATALOG", exact: true })`；证据：`01-admin.json`
- Learn more：`getByRole("link", { name: "Learn more", exact: true })`；证据：`13-admin-admin-system-config-edit-section-catalog.json`
- Enable Charts：`locator("#admin_dashboard_enable_charts")`；证据：`02-admin-admin-system-config-edit-section-admin.json`
- Enable CAPTCHA in Admin：`locator("#admin_captcha_enable")`；证据：`02-admin-admin-system-config-edit-section-admin.json`

## 风险与恢复

- 这是写操作；修改错误商品或字段不可自动恢复，必须严格核对商品名称。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

