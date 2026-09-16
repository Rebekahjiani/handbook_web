# webarena-reddit 任务手册

站点：`http://localhost:9999`

覆盖语料：129 条（unknown 129）
本轮重点任务：129 条。重点任务只影响抓取优先级和路径提示，不删除覆盖语料中的工作流。

## 使用方法

1. 根据任务目标在下表选择一个工作流。
2. 本轮只读取该工作流文件，不要预载其他工作流或全量 selector。
3. 工作流失败时先读取其中链接的单页快照；最后才按关键词检索 `../snapshots/selectors.json`。

## 工作流路由

| 任务线索 | 工作流 | 覆盖 / 重点 | 页面证据 |
|---|---|---:|---|
| gitlab, repo, OneStopShop, gimmiethat.space, shopping, promote, link to | [跨站内容引用并发帖](workflows/cross-site-post.md) | 18 / 18 | 关键步骤有 |
| create forum, new subreddit, sidebar, description | [创建新论坛（Subreddit）](workflows/forum-create.md) | 5 / 5 | 关键步骤有 |
| post, create, submit, ask, share, discuss, notice, review, recommend | [在 Subreddit 中发布新帖](workflows/post-create.md) | 45 / 45 | 关键步骤有 |
| reply, comment, respond, answer | [回复帖子或评论](workflows/post-reply.md) | 5 / 5 | 关键步骤有 |
| upvote, downvote, like, dislike, thumbs up, thumbs down | [投票（点赞 / 踩）](workflows/vote.md) | 22 / 22 | 仅入口 |
| bio, profile, edit my post, my bio | [编辑个人资料或自己的帖子](workflows/user-edit.md) | 10 / 10 | 仅入口 |
| subscribe, follow, join, thread | [订阅论坛或帖子](workflows/subscribe.md) | 5 / 5 | 关键步骤有 |
| browse, find, count, list, read, tell me, show me, top, most | [浏览、搜索与读取帖子内容](workflows/read-post.md) | 19 / 19 | 关键步骤有 |
| 未命中已有工作流的任务 | [未归类任务](workflows/other.md) | 0 / 0 | 仅入口 |

## 覆盖缺口

- 投票（点赞 / 踩）：有 22 条任务，但当前抓取尚未覆盖关键步骤。
- 编辑个人资料或自己的帖子：有 10 条任务，但当前抓取尚未覆盖关键步骤。
