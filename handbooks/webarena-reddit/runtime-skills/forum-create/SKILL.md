---
name: webarena-reddit-forum-create
description: webarena-reddit 的创建新论坛（Subreddit）工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 同一动作连续失败或重复最多两次；随后只允许一次重新读取当前状态，再失败就停止并报告阻塞。
- 若当前 URL 或标题是登录页，而任务不是登录/认证，视为权限阻塞；不要反复点击、刷新或重新提交。
- 登录失败时不得猜测账号或密码；只能使用任务提示或运行配置明确提供的凭据。凭据缺失或失败后，停止并报告权限阻塞。
- 不要跨工作流补救：一次只执行当前路由的动作；恢复尝试最多两次。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 创建新论坛（Subreddit）

站点：`http://localhost:9999`
机器契约：`../../references/execution-contract.json#workflows-forum-create`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `goal`：任务要求的最终页面状态或数据
- `hard_constraints`：不可放宽的显式条件
- `visited_page_ids`：已处理页面 URL 集合
- `accepted_evidence`：支持完成结论的页面证据
- `next_action`：当前唯一动作；完成或无法安全推进时为 `null`

## 写操作执行契约

- 按机器契约中的 phases 顺序执行；任何阶段失败都只能重新读取当前状态后恢复，不能跳阶段或改写任务值。
- 从当前 DOM 读取 form action、目标对象身份和字段；每个字段与任务原文完全一致后才允许提交，提交/投票/订阅动作最多一次。
- 若机器契约声明 requiredNetworkEvents，写操作完成必须有匹配的非登录 POST 事件；仅靠页面看起来正确不能声明 SUCCESS。
- 提交后立即读取当前页面或目标对象，核对 URL、标题/文本、状态标记或响应确认；缺少该证据时保持未完成。
- 复合任务必须逐阶段验证；创建后再评论/回复时，先确认新对象身份，再定位该对象的评论表单。

## 已验证表单动作

- 页面 `http://localhost:9999/create_forum`：POST `http://localhost:9999/create_forum`，表单 `form[action='/create_forum']`
  字段：forum[name](text)、forum[title](text)、forum[description](textarea)、forum[sidebar](textarea)
  提交：Create；证据=site-adapter-form-contract；提交后=GET /f/<forum_name> and read title, description, and sidebar text
  必须出现网络事件：POST `/create_forum$`
  可重复测试：无 reset 时必须使用任务外唯一名称做隔离试跑；正式评测任务先 GET /f/<name> 探测，已存在则标记状态污染，不把编辑页当作创建成功。

## 循环动作

1. 进入 reddit 首页，点击「Create a Forum」或右上角用户菜单中的创建入口。
2. 填写论坛名称（name/title）和描述（description）。
3. 按任务要求添加 sidebar 标签（tags/flairs）。
4. 提交创建，确认论坛主页已出现。

## 停止条件与必检项

- 论坛名称区分大小写，不要自动补全或更改。
- Sidebar 标签逐一核对列表，不要遗漏。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- contact the moderators of this subreddit：`locator("a[href=\"/message/compose/?to=/r/photoshopbattles\"]")`（confidence=0.75，evidence=unique,scoped）
- contact the moderators of this subreddit：`locator("a[href=\"/message/compose/?to=/r/EarthPorn\"]")`（confidence=0.75，evidence=unique,scoped）
- Jump to sidebar：`locator("a.site-accessibility-nav__link[href=\"#sidebar\"]")`（confidence=0.65，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 论坛名称与任务要求完全一致。
- Sidebar 包含任务要求的所有标签，顺序不限。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：创建后论坛名称通常不可更改；提交前再次核对名称拼写。

