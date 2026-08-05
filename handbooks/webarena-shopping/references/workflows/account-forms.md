# 账户、地址与表单

适用线索：登录、注册、账户、个人信息、地址、联系表单

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 确认当前登录状态和目标表单。
2. 逐字段填写；优先按标签定位，不依赖字段在页面中的顺序。
3. 提交前检查必填项、格式和可能的账户副作用。
4. 提交后验证成功提示或回显值。

## 成功判据

- 字段值写入了正确输入框。
- 页面出现明确的保存成功提示或正确回显。

## 已验证入口

- Cabinets, Racks & Shelves - Office Furniture & Lighting - Office Products：`/office-products/office-furniture-lighting/cabinets-racks-shelves.html`；[页面快照](../../snapshots/pages/02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json)
- Children's Dental Care - Oral Care - Beauty & Personal Care：`/beauty-personal-care/oral-care/children-s-dental-care.html`；[页面快照](../../snapshots/pages/03-beauty-personal-care-oral-care-children-s-dental-care-html.json)
- Nintendo Switch - Video Games：`/video-games/nintendo-switch.html`；[页面快照](../../snapshots/pages/04-video-games-nintendo-switch-html.json)

## 操作锚点

- My Account：`getByRole("link", { name: "My Account", exact: true })`；证据：`01-home.json`
- Sign Out：`getByRole("link", { name: "Sign Out", exact: true })`；证据：`01-home.json`
- Contact Us：`locator("a[href=\"${SITE_ORIGIN}/contact/\"]")`；证据：`01-home.json`
- View All：`locator("a.action[href=\"${SITE_ORIGIN}/customer/account/#my-orders-table\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 注册、修改资料和地址会改变账户状态；没有明确授权时只填写到提交前。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

