# 未归类任务

适用线索：未命中已有工作流的任务

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 先把任务拆成导航、读取和写入三个阶段。
2. 从当前页面语义和快照中寻找最接近的已验证入口。
3. 每一步都验证可见结果；发现重复模式后再刷新生成器。

## 成功判据

- 完成任务要求，且没有执行未授权的写操作。

## 已验证入口

- Hair Care - Beauty & Personal Care：`/beauty-personal-care/hair-care.html`；[页面快照](../../snapshots/pages/07-beauty-personal-care-hair-care-html.json)
- Men - Clothing, Shoes & Jewelry：`/clothing-shoes-jewelry/men.html`；[页面快照](../../snapshots/pages/12-clothing-shoes-jewelry-men-html.json)
- Makeup - Beauty & Personal Care：`/beauty-personal-care/makeup.html`；[页面快照](../../snapshots/pages/25-beauty-personal-care-makeup-html.json)

## 操作锚点

- Office Products：`getByRole("link", { name: "Office Products", exact: true })`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Office Furniture & Lighting：`getByRole("link", { name: "Office Furniture & Lighting", exact: true })`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`
- Beauty & Personal Care：`getByRole("link", { name: "Beauty & Personal Care", exact: true })`；证据：`03-beauty-personal-care-oral-care-children-s-dental-care-html.json`
- Oral Care：`getByRole("link", { name: "Oral Care", exact: true })`；证据：`03-beauty-personal-care-oral-care-children-s-dental-care-html.json`

## 风险与恢复

- 此工作流证据较弱；不要把未验证的推断当成站点事实。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

