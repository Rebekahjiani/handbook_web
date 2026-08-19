---
name: webarena-shopping-order-lookup
description: webarena-shopping 的订单查找与已购商品属性工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。

# 订单查找与已购商品属性

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-order-lookup`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `target_period`：时间范围或顺序要求
- `target_status`：任务要求的订单状态
- `visited_page_ids`：已处理订单页 URL 集合
- `seen_record_ids`：已读取订单号集合
- `accepted_records`：满足时间与状态条件的订单台账
- `next_href`：唯一待访问的下一页；无下一页时为 `null`

## 循环动作

1. 先判定任务是单对象查找还是集合查找；进入订单历史并把每页行数据一次性读取为短台账，记录页面身份、行数与 Next。
2. 按日期、状态或商品名称筛选；查找“最近”记录时按页面显示日期比较。
3. 从目标行的实时详情链接进入详情，并核对订单号。
4. 读取任务要求的字段或商品选项，保留页面显示的单位和格式。

## 停止条件与必检项

- 分页后废弃旧引用；不要根据订单号拼接详情 URL。
- 查找最近状态时，一旦已按时间倒序确认首个精确状态匹配即可停止。
- 任务含 `all`、完整年份或日期范围时属于集合查找：必须覆盖整个范围并保存全部候选，不能找到第一项就停止。
- 按已购商品查找时，先穷尽目标日期范围内的订单行，再逐个打开候选详情；不要在订单页和站内搜索间循环。
- 无匹配必须有终页证据：完整当前页没有 Next，且已访问行数与页面报告的总数一致。
- 商品尺寸、容量等属性必须保留单位，例如 `16 inch`，不能只返回裸数字。
- 无匹配时导航回不带分页参数的订单历史首页，并返回 NOT_FOUND 与 null。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已验证结构

- `history-row`：`table#my-orders-table.history > tbody > tr`（history-table）
- `history-purchase-date`：`:scope > td[data-th="Date"]`（history-row）
- `history-grand-total`：`:scope > td[data-th="Order Total"] .price`（history-row）
- `history-status`：`:scope > td[data-th="Status"]`（history-row）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 找到目标：列表行与详情页订单号一致，且目标条件有行级证据。——无匹配：已记录终页证据（末页 URL、已访问行数、页面报告总数一致），再回到订单历史首页结束。两种情况必须满足其中之一。
- 返回值保留页面显示的单位；不得靠猜测或拼接 URL 构造结果。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：查看订单通常无副作用；Reorder、取消或退货属于写操作，不要代替用户提交。

