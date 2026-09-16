# 跨站内容引用并发帖

适用线索：gitlab, repo, OneStopShop, gimmiethat.space, shopping, promote, link to

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 确认任务要求的外部来源（GitLab 仓库/购物网站评论/指定页面）。
2. 打开外部站点，提取任务要求的内容（URL、描述、评论标题等）。
3. 切换到 reddit，找到任务指定的或最合适的 subreddit。
4. 创建帖子，粘贴从外部收集的内容，提交。
5. 确认帖子已成功发布。

## 执行检查

- 提取外部数据时记录原始值，避免复制错误。
- GitLab 描述从仓库主页 About 区域读取，不要自行编写。
- 跨站任务顺序：先采集，再发帖；不要同时打开多个标签混淆状态。

## 成功判据

- 帖子内容准确引用了外部来源的数据。
- 帖子发布在任务指定或最匹配的 subreddit。

## 已验证入口

- [image] Experience never goes wasted：`/f/GetMotivated/55022/image-experience-never-goes-wasted`；[页面快照](../../snapshots/pages/19-f-getmotivated-55022-image-experience-never-goes-wasted.json)
- Fair system：`/f/memes/41774/fair-system`；[页面快照](../../snapshots/pages/18-f-memes-41774-fair-system.json)

## 操作锚点

- log in：`getByRole("link", { name: "log in", exact: true })`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`
- register：`getByRole("link", { name: "register", exact: true })`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`
- full video：`getByRole("link", { name: "full video", exact: true })`；证据：`10-f-gifs-19936-ok-time-for-you-to-go-to-bed.json`
- Here’s the whole thing.：`getByRole("link", { name: "Here’s the whole thing.", exact: true })`；证据：`10-f-gifs-19936-ok-time-for-you-to-go-to-bed.json`

## 风险与恢复

- 这是写操作，发帖后不可直接撤回；发帖前必须核对内容与来源一致。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

