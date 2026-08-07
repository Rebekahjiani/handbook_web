---
name: use-webarena-shopping-admin
description: 使用任务工作流和按需加载的页面证据操作 http://localhost:7780 上的 webarena-shopping-admin。适用于该站点的导航、检索和写入任务；先路由到一个工作流，失败后再按层级检索 selector。
---

# webarena-shopping-admin

1. 先从任务目标判断操作类型，再读取 [任务手册](references/handbook.md)。
2. 每轮只打开任务手册指向的一个工作流文件，并按其中步骤、成功判据和风险约束执行。
3. 优先使用工作流中的操作锚点；模型 selector 只用于缩小实时快照或核验结构，点击时使用当前快照引用。
4. locator 失败时，只读取工作流列出的单页快照。
5. 单页快照仍不足时，才按目标名称或角色检索 `snapshots/selectors.json`；不要整体载入。
6. 标注截图仅用于理解布局或恢复页面变化，存在 DOM locator 时不要点击坐标。
7. 下单、删除、提交资料等有副作用的操作，必须符合任务授权并在执行前核对目标。
