---
name: webarena-shopping-order-lookup
description: 参数化集合读取程序；自动分页、去重与完整性验证。
---

# 订单查找与已购商品属性

调用 localweb_contract_action：action_id=collect_order_history_v1，workflow=order-lookup，route=shopping，contract_path=webarena-shopping/references/execution-contract.json，page_id=当前 URL，arguments=业务参数对象。
参数：{"type":"object","additionalProperties":false,"properties":{"maxPages":{"type":"integer","minimum":1,"maximum":12,"default":12},"status":{"type":"string","description":"Exact observed status, case insensitive."},"dateFrom":{"type":"string","description":"Inclusive YYYY-MM-DD lower bound."},"dateTo":{"type":"string","description":"Inclusive YYYY-MM-DD upper bound."}}}

先使用已有认证会话进入 /sales/order/history/ 第一页。status 仅用于明确的精确状态；日期上下界均包含当天，只有任务明确指定时才传入。程序返回过滤后的 orders、每条来源 pageId 和整集合扫描证明。
程序通过 Playwright 页面导航和实时 DOM 读取执行，结束时浏览器位于最后读取页；不使用 HTTP、文件或数据库捷径。complete 只证明该查询/分类分页闭合，不证明自然语言查询召回完整，也不证明所有业务条件已满足。
一次调用预留 maxPages 页预算（默认 12）；需要两次查询时先显式分配页预算，不能靠多次调用绕过工作流总预算。不要在程序外重写分页、反复读取同一集合或重新抄写抽取代码。
选择规则：{"entity":"order_set","preserveTaskConstraints":["exact_date","product_category","status"],"detailEvidenceRequired":true,"categoryMatch":"品类判定（本数据集校准，必须逐行执行）：(a) 食品 food/cooking/food-related 包含烘焙食品（corn muffin mix 等杂粮粉/松饼）、即食餐（MRE/beef cholent）、食品饮料（chai、橙汁/果汁）以及直接用于食品的装饰（cake topper 彩虹生日派对用品/蛋糕装饰件）；(b) hair care/hair style 只包含护理与染发产品（conditioner 护发素、haircolor/hair dye 染发剂），不包含身体护理（body butter/body lotion 身体乳）与纯装饰配件（hairbands 发箍、pearl jewelry 发夹）；(c) 若商品名与目标类别同属一并含装饰配件字样，按用途判断：用于食品的装饰计入 food；(d) 未列入上述的明显不相关商品不计入","amountFieldByConstraint":{"excludeShippingAndHandling":"item_subtotal","includeShippingAndHandling":"grand_total"},"aggregation":"sum only accepted item lines after exact date/category/status checks; past N months 的下界 = 任务日期减 N×30 天（严格晚于该日期），过去 N 天同理严格晚于下界，禁止按日历月/月初计算"}
需要商品行金额/品类证据时打开匹配订单详情，调用 action_id=read_order_detail_items_v1；订单总金额不能代替商品行 subtotal。
ok=false 或 complete=false 时不得把部分记录当完整答案。根据 errors 修正前置页面或报告缺失证据；工具预算拒绝后停止浏览，不能用猜测补齐数据。
保留任务原有的状态与输出 schema；NOT_FOUND_ERROR 的 retrieved_data 为 null。NAVIGATE 必须实际打开选中的目标 URL，并读取最终状态。
RETRIEVE 回答前调用 action_id=submit_answer_evidence_v1，提交 evidence_ledger={evidenceStatus:'verified',result:最终答案,evidenceRecordIds:[记录ID],filters:{实际条件},ledger:{records:[带 pageId 的证据]}}；只有已验证集合及业务筛选能支持该答案时才提交。
最后用 snapshot/evaluate 读取当前页面状态；不要把证据台账添加到任务未要求的答案字段。
