# 投票（点赞 / 踩）

适用线索：upvote, downvote, like, dislike, thumbs up, thumbs down

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 导航到任务指定的 subreddit 或用户页面。
2. 找到目标帖子（通过排序「New」「Top」「Hot」定位）。
3. 对目标帖子点击对应的 upvote（向上箭头）或 downvote（向下箭头）。
4. 如果任务要求对多个帖子操作，逐一处理并在每次操作后确认图标状态变化。

## 执行检查

- 注意 Postmill 中点赞图标是箭头，不是 heart。
- 「Top N post ever」用 Top > All Time 排序，「newest」用 New 排序。
- 用户页面的帖子排序可能与 subreddit 页面不同，核对帖子标题后再投票。

## 成功判据

- 目标帖子的 upvote/downvote 按钮显示为激活状态。
- 操作帖子数量与任务要求一致。

## 已验证入口

- 当前抓取范围没有覆盖该流程；先用页面语义探索，不要臆造 selector。

## 操作锚点

- Wishilikedhugs：`locator("a.fg-inherit[href=\"/user/Wishilikedhugs\"]")`；证据：`10-f-gifs-19936-ok-time-for-you-to-go-to-bed.json`
- TheDownvoteMasterP：`locator("a.fg-inherit[href=\"/user/TheDownvoteMasterP\"]")`；证据：`10-f-gifs-19936-ok-time-for-you-to-go-to-bed.json`
- Doesanybodylikestuff：`locator("a.fg-inherit[href=\"/user/Doesanybodylikestuff\"]")`；证据：`14-f-art-10081-painting-pumpkins-me-gouache-2022.json`

## 风险与恢复

- 投票后再次点击同一按钮会取消投票；确认激活状态后不要重复点击。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

