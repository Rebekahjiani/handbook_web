---
name: webarena-shopping-admin-admin-report
description: webarena-shopping-admin 的销售报表与聚合统计工作流。
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

# 销售报表与聚合统计

站点：`http://localhost:7780`
机器契约：`../../references/execution-contract.json#workflows-admin-report`

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

1. 确认报表类型（商品/品牌/类别/时间段）和筛选维度。
2. 进入 Reports 菜单，选择对应子报表（Products/Bestsellers/Orders）。
3. 设置时间范围筛选，刷新报表。
4. 按照任务要求读取 Top-N 行的名称、数量或金额字段。

## 停止条件与必检项

- 时间筛选必须精确到任务要求的年份/季度/月份边界。
- 注意区分 Bestsellers（按销量）和 Revenue（按金额）报表。
- Top-N 结果中并列时按报表显示顺序返回，不推断。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- SALES：`getByRole("link", { name: "SALES", exact: true })`（confidence=0.85，evidence=unique,scoped）
- REPORTS：`getByRole("link", { name: "REPORTS", exact: true })`（confidence=0.85，evidence=unique,scoped）
- Retry Synchronization：`getByRole("link", { name: "Retry Synchronization", exact: true })`（confidence=0.85，evidence=unique）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 结果来自正确的时间范围和报表类型。
- Top-N 顺序与报表排序一致。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：报表是只读视图，无副作用；但筛选条件错误会导致错误数据，必须二次核对时间范围。

