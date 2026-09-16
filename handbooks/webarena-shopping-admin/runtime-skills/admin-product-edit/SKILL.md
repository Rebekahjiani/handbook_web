---
name: webarena-shopping-admin-admin-product-edit
description: webarena-shopping-admin 的商品属性编辑与状态管理工作流。
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

# 商品属性编辑与状态管理

站点：`http://localhost:7780`
机器契约：`../../references/execution-contract.json#workflows-admin-product-edit`

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

1. 在 Catalog > Products 中通过名称或 SKU 定位目标商品。
2. 进入编辑页，确认商品名称与任务一致。
3. 只修改任务要求的字段（价格/描述/状态/属性等）。
4. 点击 Save，确认成功提示。

## 停止条件与必检项

- 修改前记录原始值以备核对。
- Enable/Disable 操作后在列表页确认状态列已变更。
- 价格修改时注意任务是绝对值还是相对增减。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- CATALOG：`getByRole("link", { name: "CATALOG", exact: true })`（confidence=0.85，evidence=unique,scoped）
- Learn more：`getByRole("link", { name: "Learn more", exact: true })`（confidence=0.85，evidence=unique,scoped）
- Enable Charts：`locator("#admin_dashboard_enable_charts")`（confidence=0.75，evidence=unique,scoped,form-bound）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 保存后页面显示成功提示。
- 修改只作用于目标商品的指定字段。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：这是写操作；修改错误商品或字段不可自动恢复，必须严格核对商品名称。

