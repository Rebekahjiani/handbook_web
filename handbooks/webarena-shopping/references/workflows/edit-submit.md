# 创建、修改与提交

适用线索：创建、编辑、更新、删除、上传、保存、发送、订阅

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 打开目标记录或创建表单，确认当前身份与对象。
2. 按标签定位字段并填写，只修改任务要求的内容。
3. 提交前复核目标、字段差异和副作用。
4. 提交后验证成功提示、回显值或新记录标识。

## 站点模型约束

- 动作 `account-create`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 修改只作用于目标对象和指定字段。
- 页面显示成功提示或可验证的新状态。

## 已验证入口

- Makeup Remover - Makeup - Beauty & Personal Care：`/beauty-personal-care/makeup/makeup-remover.html`；[页面快照](../../snapshots/pages/05-beauty-personal-care-makeup-makeup-remover-html.json)
- Makeup - Beauty & Personal Care：`/beauty-personal-care/makeup.html`；[页面快照](../../snapshots/pages/25-beauty-personal-care-makeup-html.json)
- Nintendo Switch - Video Games：`/video-games/nintendo-switch.html`；[页面快照](../../snapshots/pages/04-video-games-nintendo-switch-html.json)

## 操作锚点

- Add to Cart：`getByRole("button", { name: "Add to Cart", exact: true })`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- Add to Wish List：`getByRole("link", { name: "Add to Wish List", exact: true })`；证据：`14-amiibo-samus-e-m-m-i-2-in-1-pack-nintendo-switch-html.json`
- Add to Cart：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`；证据：`01-home.json`
- Add to Wish List：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("link", { name: "Add to Wish List", exact: false })`；证据：`01-home.json`

## 风险与恢复

- 这是写操作；删除、发布和发送等不可逆动作必须有明确任务授权。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

