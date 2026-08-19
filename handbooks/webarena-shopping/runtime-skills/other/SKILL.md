---
name: webarena-shopping-other
description: webarena-shopping 的未归类任务工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。

# 未归类任务

站点：`http://localhost:7770`
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
3. 每一步都验证可见结果；发现重复模式后再刷新生成器。

## 操作锚点

- Office Products：`getByRole("link", { name: "Office Products", exact: true })`（confidence=0.95，evidence=unique）
- Office Furniture & Lighting：`getByRole("link", { name: "Office Furniture & Lighting", exact: true })`（confidence=0.95，evidence=unique）
- Beauty & Personal Care：`getByRole("link", { name: "Beauty & Personal Care", exact: true })`（confidence=0.95，evidence=unique）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 完成任务要求，且没有执行未授权的写操作。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：此工作流证据较弱；不要把未验证的推断当成站点事实。

