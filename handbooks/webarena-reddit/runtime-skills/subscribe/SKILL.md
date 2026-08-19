---
name: webarena-reddit-subscribe
description: webarena-reddit 的订阅论坛或帖子工作流。
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

# 订阅论坛或帖子

站点：`http://localhost:9999`
机器契约：`../../references/execution-contract.json#workflows-subscribe`

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

- 页面 `http://localhost:9999/f/<forum>/<post>`：POST `http://localhost:9999/f/<forum>/subscribe.json`，表单 `form[action$='/subscribe.json'], button:has-text('Subscribe')`
  字段：未识别
  提交：Subscribe；证据=site-adapter-form-contract；提交后=write POST, then GET target forum/post and verify subscribed state
  必须出现网络事件：POST `/f/[^/]+/subscribe\.json$`
  可重复测试：无 reset 时按任务族单独统计；先 GET 目标 forum/post 读取当前订阅状态，若已订阅则记录 pre-existing，不把该题混入可重复准确率。

## 循环动作

1. 进入任务指定的 subreddit 页面（直接导航到 /f/subreddit-name）。
2. 点击侧边栏中的「Subscribe」按钮订阅该论坛；或进入帖子详情页订阅帖子通知。
3. 如果任务要求「从最热帖子页面订阅」，先找到 Hot 排序的第一个帖子，进入详情，再从帖子页或侧边栏订阅。
4. 确认订阅状态变更（按钮文字变为 Subscribed 或显示已订阅）。

## 停止条件与必检项

- Postmill 中「trending」通常对应 Hot 排序。
- 订阅按钮可能在侧边栏（订阅论坛）或帖子详情页（订阅帖子通知）。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- Which of the following fruits will be the 2nd most popular?：`locator("a.submission__link[href=\"/f/memes/41616/which-of-the-following-fruits-will-be-the-2nd-most-popular\"]")`（confidence=0.75，evidence=unique,scoped）
- Subscribe via RSS：`locator("a.no-underline[href=\"/f/MachineLearning/new.atom\"]")`（confidence=0.75，evidence=unique,scoped）
- Subscribe via RSS：`locator("a.no-underline[href=\"/f/memes/new.atom\"]")`（confidence=0.75，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 目标帖子或论坛的订阅状态已激活。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：订阅是轻量级操作，可随时取消；风险较低。

