# 回复帖子或评论

适用线索：reply, comment, respond, answer

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 导航到任务指定的帖子或评论（通过给定 URL 或描述定位）。
2. 找到任务要求的目标评论（如「第一条回复」「manager 发的评论」等）。
3. 点击 Reply，输入任务要求的回复文字，提交。
4. 确认回复已出现在帖子下方。

## 执行检查

- 区分「回复帖子」和「回复评论」：前者用主帖的 Reply 按钮，后者用具体评论的 Reply 按钮。
- 如果评论被折叠，需先展开再回复。

## 成功判据

- 回复挂在正确的帖子或评论下。
- 回复内容与任务要求的文字完全一致。

## 已验证入口

- [image] Experience never goes wasted：`/f/GetMotivated/55022/image-experience-never-goes-wasted`；[页面快照](../../snapshots/pages/19-f-getmotivated-55022-image-experience-never-goes-wasted.json)
- PsBattle: Halloween Costume：`/f/photoshopbattles/45340/psbattle-halloween-costume`；[页面快照](../../snapshots/pages/09-f-photoshopbattles-45340-psbattle-halloween-costume.json)
- Evening light in the Dolomites, Italy [2000x2000] [OC]：`/f/EarthPorn/119158/evening-light-in-the-dolomites-italy-2000x2000-oc`；[页面快照](../../snapshots/pages/16-f-earthporn-119158-evening-light-in-the-dolomites-italy-2000x2000-oc.json)

## 操作锚点

- writesCommentsHigh：`locator("a.fg-inherit[href=\"/user/writesCommentsHigh\"]")`；证据：`12-f-earthporn-119148-sunrise-at-phang-nga-bay-thailand-2000x2000-oc.json`
- Comments：`locator("a.tab[href=\"/comments\"]")`；证据：`01-home.json`
- No comments：`locator("a.text-sm[href=\"/f/MachineLearning/1/nvidia-rtx-4090\"]")`；证据：`03-all-hot.json`
- 54 comments：`locator("a.text-sm[href=\"/f/memes/41616/which-of-the-following-fruits-will-be-the-2nd-most-popular\"]")`；证据：`03-all-hot.json`

## 风险与恢复

- 这是写操作；回复后不可轻易撤回，务必核对目标和内容。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

