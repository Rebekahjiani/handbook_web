# 订单筛选、金额聚合与退款

适用线索：订单数量、消费金额、时间范围、商品类别、退款

证据状态：已找到关键步骤的页面与 locator 证据

## 推荐流程

1. 先做时间表达式预检：若任务只写 `past months` 但没有数量或上下界，停止执行浏览流程，按任务 schema 直接返回零值对象，不要打开订单历史。
2. 任务含 “past N months” 时先算出精确下界日期（任务日期减 N 乘以 30 天，严格晚于该日期才算），并把下界日期、订单状态、商品条件和运费口径写成固定筛选条件；禁止把 N months 当成年/月至月初。
3. 在订单历史中一次读取每页的订单号、日期、状态、总额和详情链接；记录页面身份、行数与 Next。
4. 只为筛选后的订单打开详情；按任务口径读取商品小计、数量、运费和总额。
5. 只有已访问行数覆盖页面报告的总记录数，或在完整当前页确认 Next 不存在后，才用去重台账计数或求和。

## 执行检查

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

## 站点模型约束

- 业务对象 `order`：字段 ``。
- 业务对象 `order-collection`：字段 ``。
- 业务能力 `aggregate-orders`：输入 `Order filtering criteria and requested aggregate fields.`；输出 `An aggregate derived from the fully inspected supported order collection.`；依赖上下文 `order-analysis`。
- 页面状态 `storefront-orders`：URL `undefined`；必须同时观察字段 `无`。
- 动作 `orders-inspect-history`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。
- 动作 `orders-inspect-detail`：从当前快照重新解析 `目标控件`，操作后重新验证页面状态与对象身份。

## 成功判据

- 非空结果：accepted_records 非空，且每条记录都有日期、状态和商品条件的行级证据。——空结果：accepted_records 为空，且已记录终页证据（最后一页 URL、已访问行数、页面报告总数三者吻合）。两种情况必须满足其中之一，不得仅凭台账为空就声明 SUCCESS。
- 计数、金额和分组能回溯到同一份去重台账；无匹配时先读取任务要求的输出 schema：若任务要求对象字段，返回零值对象；只有任务协议明确使用 null 时才返回 null。

## 已验证入口

- Order # 000000148：`/sales/order/view/order_id/148/`；[页面快照](../../snapshots/pages/31-order-view-148.json)

## 操作锚点

- View All：`locator("a.action[href=\"${SITE_ORIGIN}/customer/account/#my-orders-table\"]")`；证据：`02-office-products-office-furniture-lighting-cabinets-racks-shelves-html.json`

## 风险与恢复

- 查看订单通常无副作用；取消、退货或再次购买属于写操作，不要代替用户提交。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

