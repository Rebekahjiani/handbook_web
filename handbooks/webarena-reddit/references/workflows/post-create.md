# 在 Subreddit 中发布新帖

适用线索：post, create, submit, ask, share, discuss, notice, review, recommend

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 识别任务要求的目标 subreddit（明确指定或需根据主题推断）。
2. 进入该 subreddit，点击「New Post」或「Create Post」。
3. 填写标题（title）和正文（body）。如果是链接帖子，填写 URL。
4. 提交，确认帖子出现在 subreddit 页面。

## 执行检查

- 如果任务要求「最合适的 subreddit」，根据主题选择最接近的已有论坛，不要自行创建。
- 标题和正文中引号内的文字不要修改，原文照抄。
- 图片帖子需选择 Link/Image 类型，不要发成文本帖子。

## 成功判据

- 帖子标题和正文与任务要求的文本一致。
- 帖子发布在正确的 subreddit。

## 已验证入口

- Twins photographed in 1937 and 2012：`/f/OldSchoolCool/35802/twins-photographed-in-1937-and-2012`；[页面快照](../../snapshots/pages/13-f-oldschoolcool-35802-twins-photographed-in-1937-and-2012.json)
- Postmill：`/`；[页面快照](../../snapshots/pages/01-home.json)
- Postmill：`/featured/hot`；[页面快照](../../snapshots/pages/02-featured-hot.json)

## 操作锚点

- ^Posting ^a ^cutout? ^Please ^read ^this.：`locator("a[href=\"/r/cutouts/wiki/index#wiki_flair.3A\"]")`；证据：`09-f-photoshopbattles-45340-psbattle-halloween-costume.json`
- Link to post：`locator("a[title=\"I like feedback\"]")`；证据：`09-f-photoshopbattles-45340-psbattle-halloween-costume.json`
- Inimposter：`locator("a.fg-inherit[href=\"/user/Inimposter\"]")`；证据：`13-f-oldschoolcool-35802-twins-photographed-in-1937-and-2012.json`
- Doesanybodylikestuff：`locator("a.fg-inherit[href=\"/user/Doesanybodylikestuff\"]")`；证据：`14-f-art-10081-painting-pumpkins-me-gouache-2022.json`

## 风险与恢复

- 这是写操作；发帖内容来自任务要求的引号文本，不要自行改写。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

