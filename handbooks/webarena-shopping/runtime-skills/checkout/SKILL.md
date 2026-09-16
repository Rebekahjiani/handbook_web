---
name: webarena-shopping-checkout
description: webarena-shopping 的购买与结账工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。
- 最终响应服从任务给出的 expected status：若为 `NOT_FOUND_ERROR`，`retrieved_data` 必须是 JSON `null`，不能返回 `[]`、`[0]` 或 `[0.0]`。

# 购买与结账

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-checkout`

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

## 循环动作

1. 先完成商品选择并核对规格、数量和价格。
2. 进入购物车，确认只有任务要求的商品。
3. 依次填写地址、配送和付款字段，每一步都验证页面摘要。
4. 停在最终提交前；只有任务明确授权时才执行下单。

## 操作锚点

- Add to Cart：`getByRole("button", { name: "Add to Cart", exact: true })`（confidence=0.95，evidence=unique,scoped）
- Add to Cart：`locator("li.product-item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`（confidence=0.9，evidence=unique,scoped）
- Add to Cart：`locator("li.item").filter({ hasText: "<目标项名称>" }).getByRole("button", { name: "Add to Cart", exact: false })`（confidence=0.9，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 购物车摘要中的商品、规格、数量和总价正确。
- 若已获授权提交，出现订单确认页或订单号。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：下单会产生真实副作用。最终提交前必须再次核对任务授权和订单摘要。

