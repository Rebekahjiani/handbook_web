# 浏览、搜索与读取帖子内容

适用线索：browse, find, count, list, read, tell me, show me, top, most

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 定位目标 subreddit 或用户资料页。
2. 按任务要求的排序方式（New / Hot / Top / Controversial）浏览帖子。
3. 如果需要进入帖子详情，点击标题进入，读取评论区数据。
4. 如需统计，遍历分页并去重；如需详情，记录帖子 URL、标题、正文。

## 执行检查

- 「latest post」用 New 排序第一条；「top post ever」用 Top > All Time。
- 评论的 downvote > upvote 需进入用户资料页逐条检查，不能从首屏推断。
- URL 从帖子详情页地址栏复制，不要用首页列表的截断链接。

## 成功判据

- 结果来自正确的 subreddit、用户、排序和时间范围。
- 统计数字已考虑分页（不止首屏）。

## 已验证入口

- [image] Experience never goes wasted：`/f/GetMotivated/55022/image-experience-never-goes-wasted`；[页面快照](../../snapshots/pages/19-f-getmotivated-55022-image-experience-never-goes-wasted.json)
- Painting Pumpkins, Me, Gouache, 2022：`/f/Art/10081/painting-pumpkins-me-gouache-2022`；[页面快照](../../snapshots/pages/14-f-art-10081-painting-pumpkins-me-gouache-2022.json)
- PsBattle: Halloween Costume：`/f/photoshopbattles/45340/psbattle-halloween-costume`；[页面快照](../../snapshots/pages/09-f-photoshopbattles-45340-psbattle-halloween-costume.json)

## 操作锚点

- Redditusernamesare_：`locator("article.comment").filter({ hasText: "<目标项名称>" }).getByRole("link", { name: "Redditusernamesare_", exact: false })`；证据：`06-f-aww-58888-lovely-eyes-full-of-love.json`
- /u/savevideo：`getByRole("link", { name: "/u/savevideo", exact: true })`；证据：`10-f-gifs-19936-ok-time-for-you-to-go-to-bed.json`
- haha_memur87：`locator("article.comment").filter({ hasText: "<目标项名称>" }).getByRole("link", { name: "haha_memur87", exact: false })`；证据：`05-f-memes-41616-which-of-the-following-fruits-will-be-the-2nd-most-popular.json`
- [deleted]：`locator("article.comment").filter({ hasText: "<目标项名称>" }).getByRole("link", { name: "[deleted]", exact: false })`；证据：`05-f-memes-41616-which-of-the-following-fruits-will-be-the-2nd-most-popular.json`

## 风险与恢复

- 不要把首屏当作完整列表；如任务要求 Top N，必须使用正确排序而非默认排序。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

