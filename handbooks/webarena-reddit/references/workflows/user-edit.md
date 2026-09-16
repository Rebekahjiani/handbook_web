# 编辑个人资料或自己的帖子

适用线索：bio, profile, edit my post, my bio

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 进入账户设置（Settings / Preferences / Edit Profile）。
2. 找到 Bio / About 字段，清除旧内容后填入任务要求的文字。
3. 保存，返回个人资料页确认显示更新后的内容。

## 执行检查

- Bio 更新保存后需刷新个人资料页确认持久化。
- 编辑帖子时要找到「Edit Post」选项，不是「Reply」。
- 「adding a line」指在现有正文末尾追加，不是替换整体内容。

## 成功判据

- 个人资料页的 Bio 字段显示任务要求的文字，与输入一致。

## 已验证入口

- 当前抓取范围没有覆盖该流程；先用页面语义探索，不要臆造 selector。

## 操作锚点

- edition.cnn.com：`locator("a.submission__host[href=\"/search?q=edition.cnn.com\"]")`；证据：`03-all-hot.json`
- memyselfand12：`locator("a.fg-inherit[href=\"/user/memyselfand12\"]")`；证据：`06-f-aww-58888-lovely-eyes-full-of-love.json`
- tru-self：`locator("a.fg-inherit[href=\"/user/tru-self\"]")`；证据：`06-f-aww-58888-lovely-eyes-full-of-love.json`
- SecretAccount69Nice：`locator("a.fg-inherit[href=\"/user/SecretAccount69Nice\"]")`；证据：`09-f-photoshopbattles-45340-psbattle-halloween-costume.json`

## 风险与恢复

- 这是写操作；bio 和帖子内容会对其他用户可见，修改后不能自动恢复。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

