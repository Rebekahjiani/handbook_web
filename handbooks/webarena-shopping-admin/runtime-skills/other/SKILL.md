---
name: webarena-shopping-admin-other
description: webarena-shopping-admin 的未归类任务工作流。
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

# 未归类任务

站点：`http://localhost:7780`
机器契约：`../../references/execution-contract.json#workflows-other`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `goal`：任务要求的最终页面状态或数据
- `hard_constraints`：不可放宽的显式条件
- `visited_page_ids`：已处理页面 URL 集合
- `accepted_evidence`：支持完成结论的页面证据
- `next_action`：当前唯一动作；完成或无法安全推进时为 `null`

## 循环动作

1. 先把任务拆成导航、读取和写入三个阶段。
2. 从当前页面语义和快照中寻找最接近的已验证入口。
3. 每一步都验证可见结果。

## 操作锚点

- System Messages: 1：`getByRole("button", { name: "System Messages: 1", exact: true })`（confidence=0.95，evidence=unique）
- Retry Synchronization：`getByRole("link", { name: "Retry Synchronization", exact: true })`（confidence=0.95，evidence=unique）
- All Store Views：`getByRole("button", { name: "All Store Views", exact: true })`（confidence=0.95，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 完成任务要求，且没有执行未授权的写操作。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：此工作流证据较弱；不要把未验证的推断当成站点事实。

