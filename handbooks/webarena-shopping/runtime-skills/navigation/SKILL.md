---
name: webarena-shopping-navigation
description: webarena-shopping 的页面导航工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。

# 页面导航

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-navigation`

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

1. 从当前 URL 和标题确认起点。
2. 使用语义链接逐级进入目标页面。
3. 每次导航后检查 URL、主标题或关键内容。

## 停止条件与必检项

- 必须通过页面中的真实链接或控件完成导航；搜索结果页不是目标页的替代品。
- 结束前重新读取页面，确认最终 URL、标题和关键内容同时匹配任务。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- beauty personal care > hair care > styling products：`/beauty-personal-care/hair-care/styling-products.html`

## 操作锚点

- Office Products：`getByRole("link", { name: "Office Products", exact: true })`（confidence=0.95，evidence=unique）
- Home & Kitchen：`getByRole("link", { name: "Home & Kitchen", exact: true })`（confidence=0.95，evidence=unique）
- My Account：`getByRole("link", { name: "My Account", exact: true })`（confidence=0.85，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 最终页面的 URL、主标题和任务目标一致。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：遇到同名链接时先限定导航区或内容区，不要用坐标猜测。

