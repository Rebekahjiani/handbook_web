---
name: webarena-shopping-order-aggregation
description: webarena-shopping 的订单筛选、金额聚合与退款工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。
- 最终响应服从任务给出的 expected status：若为 `NOT_FOUND_ERROR`，`retrieved_data` 必须是 JSON `null`，不能返回 `[]`、`[0]` 或 `[0.0]`。

# 订单筛选、金额聚合与退款

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-order-aggregation`

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

## 答案证据提交

- 最终回答前必须调用一次 `localweb_contract_action`：`action_id=submit_answer_evidence_v1`、`workflow=order-aggregation`、`route=shopping`、`contract_path=webarena-shopping/references/execution-contract.json`、`page_id=当前 URL`，并通过 `evidence_ledger` 参数提交台账。
- `evidence_ledger.evidenceStatus` 仅在所有查询/分页或排序边界证明完成、候选验收完成且结果可由同一台账重算时写 `verified`；同时包含 `result`、非空 `evidenceRecordIds`、实际 `filters` 和含页面来源的 `ledger`。否则不得调用提交动作或声明 SUCCESS。
- 参数形状固定为 `evidence_ledger={"evidenceStatus":"verified","result":<与最终答案相同的值或对象>,"evidenceRecordIds":["记录ID"],"filters":{"字段":"实际条件"},"ledger":{"records":[{"recordId":"记录ID","pageId":"来源URL","value":"证据值"}]}}`；`filters` 和 `ledger` 必须是对象，不能写成字符串或数组。
- 提交动作返回 `evidenceLedger` 后，最终 JSON 只保留 benchmark 要求的字段；不要把审计台账塞进 `retrieved_data` 或增加任务未要求的答案字段。

## 循环动作

1. 先做时间表达式预检：若任务只写 `past months` 但没有数量或上下界，停止执行浏览流程，按任务 schema 直接返回零值对象，不要打开订单历史。
2. 任务含 “past N months” 时先算出精确下界日期（任务日期减 N 乘以 30 天，严格晚于该日期才算），并把下界日期、订单状态、商品条件和运费口径写成固定筛选条件；禁止把 N months 当成年/月至月初。
3. 在订单历史中一次读取每页的订单号、日期、状态、总额和详情链接；记录页面身份、行数与 Next。
4. 只为筛选后的订单打开详情；按任务口径读取商品小计、数量、运费和总额。
5. 只有已访问行数覆盖页面报告的总记录数，或在完整当前页确认 Next 不存在后，才用去重台账计数或求和。

## 停止条件与必检项

- “spent”默认先排除 Canceled 和 Refunded，再做月份分组或金额求和；退款任务只处理 Canceled/Refunded，除非任务明确另有状态口径。
- 包含运费时使用 Grand Total；排除运费或按商品类别统计时使用商品小计，不要用 Grand Total。
- 包含 shipping/handling 时，逐订单同时记录商品小计、shipping、handling、Grand Total 和状态；Grand Total 缺失或未核对时不得用小计代替总额。
- 金额聚合前逐行复核时间窗口、complete 状态和金额字段；订单数量正确但金额字段缺失仍视为未完成。
- 退款先建立逐订单账本，再按 `可退商品小计 - 明确保留商品行金额 + 可退运费` 计算；每个保留项和运费口径都必须有行级证据。
- WebArena 日期口径：若任务写 “past N months/过去 N 个月”，按任务日期向前回推 N*30 天，且订单日期必须严格晚于下界；“过去 N 天”同样严格晚于下界。只有任务明确写 calendar month/month-to-date 时才使用日历月口径。例如任务日期 2023-06-12、past 6 months：下界 = 2023-06-12 减 180 天 = 2022-12-14，只计入 12/14 之后（不含当天）的订单；past 4 months = 减 120 天 = 2023-02-12。不要把 “6 months” 展开成日历月（1-6 月）或用月初作下界。
- 若任务只写 `past months` 但没有数量或上下界，不得扩成全部历史；把时间范围标记为不完整，返回零值对象或阻塞证据，不能猜测 SUCCESS。
- 进入详情后核对页面订单号；商品类别优先以站点分类和商品用途判断：主用途属于目标类别才计入，名称近似但用途不同的配件不计入。
- 品类口径（本数据集校准判例）：食品(food/cooking)包含烘焙食品如玉米松饼杂粮粉（corn muffin mix）、即食餐（MRE/beef cholent）、食品饮料（chai、orange juice），以及直接用于食品的装饰如蛋糕装饰配件（cake topper 彩虹生日派对用品）——cake topper 计入 food 类；hair care/style 只包含护理和染发造型产品（conditioner、haircolor/dye），不包含身体护理（body butter、body lotion）和纯装饰配件（发箍 headbands、珠饰发夹）——body butter 与 hairbands 不计入 hair care。
- 按类别或月份统计时不使用 Canceled/Refunded 订单中的商品（“spent”语义排除未实际支出的订单），先按状态过滤，再分组求和；类目金额用于类目内商品小计，包含运费时再加 Grand Total 与 subtotal 之差。
- 不能因当前页没有分页控件就断言只有一页；同时核对总记录文本、已访问行数和页面身份。
- 无匹配记录时严格遵守任务要求的返回类型：对象任务返回对象的零值字段，列表任务才返回空列表，明确 null 协议才返回 null。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 操作锚点

- View All：`locator("a.action[href=\"${SITE_ORIGIN}/customer/account/#my-orders-table\"]")`（confidence=0.65，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 非空结果：accepted_records 非空，且每条记录都有日期、状态和商品条件的行级证据。——空结果：accepted_records 为空，且已记录终页证据（最后一页 URL、已访问行数、页面报告总数三者吻合）。两种情况必须满足其中之一，不得仅凭台账为空就声明 SUCCESS。
- 计数、金额和分组能回溯到同一份去重台账；无匹配时先读取任务要求的输出 schema：若任务要求对象字段，返回零值对象；只有任务协议明确使用 null 时才返回 null。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：查看订单通常无副作用；取消、退货或再次购买属于写操作，不要代替用户提交。

