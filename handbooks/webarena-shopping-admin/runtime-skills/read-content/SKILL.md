---
name: webarena-shopping-admin-read-content
description: webarena-shopping-admin 的读取列表、详情与结构化数据工作流。
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

# 读取列表、详情与结构化数据

站点：`http://localhost:7780`
机器契约：`../../references/execution-contract.json#workflows-read-content`

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

1. 确认目标记录、列表或时间范围。
2. 读取字段标签和一条完整记录，建立字段对应关系。
3. 需要统计时遍历分页并去重；需要详情时保持记录上下文。
4. 按任务要求的数据结构、类型和格式返回。

## 操作锚点

- All Store Views：`getByRole("button", { name: "All Store Views", exact: true })`（confidence=0.95，evidence=unique,scoped）
- Default View：`getByRole("button", { name: "Default View", exact: true })`（confidence=0.95，evidence=unique,scoped）
- Previous Page：`getByRole("button", { name: "Previous Page", exact: true })`（confidence=0.95，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 结果来自正确记录或完整结果集。
- 字段名称、数据类型和输出格式符合任务要求。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：不要把首屏当作完整列表；缺失值与零值必须区分。

