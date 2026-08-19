# 创建新论坛（Subreddit）

适用线索：create forum, new subreddit, sidebar, description

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 进入 reddit 首页，点击「Create a Forum」或右上角用户菜单中的创建入口。
2. 填写论坛名称（name/title）和描述（description）。
3. 按任务要求添加 sidebar 标签（tags/flairs）。
4. 提交创建，确认论坛主页已出现。

## 执行检查

- 论坛名称区分大小写，不要自动补全或更改。
- Sidebar 标签逐一核对列表，不要遗漏。

## 成功判据

- 论坛名称与任务要求完全一致。
- Sidebar 包含任务要求的所有标签，顺序不限。

## 已验证入口

- Postmill：`/`；[页面快照](../../snapshots/pages/01-home.json)
- Postmill：`/featured/hot`；[页面快照](../../snapshots/pages/02-featured-hot.json)

## 操作锚点

- contact the moderators of this subreddit：`locator("a[href=\"/message/compose/?to=/r/photoshopbattles\"]")`；证据：`09-f-photoshopbattles-45340-psbattle-halloween-costume.json`
- contact the moderators of this subreddit：`locator("a[href=\"/message/compose/?to=/r/EarthPorn\"]")`；证据：`11-f-earthporn-98297-2-years-later-this-is-still-one-of-the-most-incredible.json`
- Jump to sidebar：`locator("a.site-accessibility-nav__link[href=\"#sidebar\"]")`；证据：`01-home.json`
- Forums：`locator("a.site-nav__link[href=\"/forums\"]")`；证据：`01-home.json`

## 风险与恢复

- 创建后论坛名称通常不可更改；提交前再次核对名称拼写。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

