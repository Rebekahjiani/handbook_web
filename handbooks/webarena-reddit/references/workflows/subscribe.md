# 订阅论坛或帖子

适用线索：subscribe, follow, join, thread

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 进入任务指定的 subreddit 页面（直接导航到 /f/subreddit-name）。
2. 点击侧边栏中的「Subscribe」按钮订阅该论坛；或进入帖子详情页订阅帖子通知。
3. 如果任务要求「从最热帖子页面订阅」，先找到 Hot 排序的第一个帖子，进入详情，再从帖子页或侧边栏订阅。
4. 确认订阅状态变更（按钮文字变为 Subscribed 或显示已订阅）。

## 执行检查

- Postmill 中「trending」通常对应 Hot 排序。
- 订阅按钮可能在侧边栏（订阅论坛）或帖子详情页（订阅帖子通知）。

## 成功判据

- 目标帖子或论坛的订阅状态已激活。

## 已验证入口

- Which of the following fruits will be the 2nd most popular?：`/f/memes/41616/which-of-the-following-fruits-will-be-the-2nd-most-popular`；[页面快照](../../snapshots/pages/05-f-memes-41616-which-of-the-following-fruits-will-be-the-2nd-most-popular.json)
- Postmill：`/all/hot`；[页面快照](../../snapshots/pages/03-all-hot.json)

## 操作锚点

- Which of the following fruits will be the 2nd most popular?：`locator("a.submission__link[href=\"/f/memes/41616/which-of-the-following-fruits-will-be-the-2nd-most-popular\"]")`；证据：`03-all-hot.json`
- Subscribe via RSS：`locator("a.no-underline[href=\"/f/MachineLearning/new.atom\"]")`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`
- Subscribe via RSS：`locator("a.no-underline[href=\"/f/memes/new.atom\"]")`；证据：`05-f-memes-41616-which-of-the-following-fruits-will-be-the-2nd-most-popular.json`
- Subscribe via RSS：`locator("a.no-underline[href=\"/f/aww/new.atom\"]")`；证据：`06-f-aww-58888-lovely-eyes-full-of-love.json`

## 风险与恢复

- 订阅是轻量级操作，可随时取消；风险较低。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

