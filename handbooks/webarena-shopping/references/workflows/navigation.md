# 页面导航

适用线索：打开、前往、进入、导航、页面

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 从当前 URL 和标题确认起点。
2. 使用语义链接逐级进入目标页面。
3. 每次导航后检查 URL、主标题或关键内容。

## 执行检查

- 必须通过页面中的真实链接或控件完成导航；搜索结果页不是目标页的替代品。
- 结束前重新读取页面，确认最终 URL、标题和关键内容同时匹配任务。

## 成功判据

- 最终页面的 URL、主标题和任务目标一致。

## 已验证入口

- Cabinets, Racks & Shelves - Office Furniture & Lighting - Office Products：`/office-products/office-furniture-lighting/cabinets-racks-shelves.html`；[页面快照](../../snapshots/pages/02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json)
- Racks, Shelves & Drawers - Storage & Organization - Home & Kitchen：`/home-kitchen/storage-organization/racks-shelves-drawers.html`；[页面快照](../../snapshots/pages/08-home-kitchen-storage-organization-racks-shelves-drawers-html.json)
- amiibo SAMUS/E.M.M.I. 2-in-1 Pack (Nintendo Switch)：`/amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch.html`；[页面快照](../../snapshots/pages/14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json)

## 操作锚点

- Office Products：`getByRole("link", { name: "Office Products", exact: true })`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Home & Kitchen：`getByRole("link", { name: "Home & Kitchen", exact: true })`；证据：`08-home-kitchen-storage-organization-racks-shelves-drawers-html.json`
- My Account：`getByRole("link", { name: "My Account", exact: true })`；证据：`01-home.json`
- Office Furniture & Lighting：`getByRole("link", { name: "Office Furniture & Lighting", exact: true })`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 遇到同名链接时先限定导航区或内容区，不要用坐标猜测。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

