---
name: webarena-shopping-product-selection
description: 参数化集合读取程序；自动分页、去重与完整性验证。
---

# 满足约束的最优商品选择

调用 localweb_contract_action：action_id=collect_product_pages_v1，workflow=product-selection，route=shopping，contract_path=webarena-shopping/references/execution-contract.json，page_id=当前 URL，arguments=业务参数对象。
参数：{"type":"object","additionalProperties":false,"properties":{"maxPages":{"type":"integer","minimum":1,"maximum":12,"default":12},"nameContains":{"type":"array","items":{"type":"string"},"description":"Optional literal title substrings, all required. Omit for semantic or synonym matching."}}}

先进入目标分类或站内搜索第一页；普通搜索先用一个核心产品类型词。程序按当前页面已观察到的最大分页量读取并沿 Next 自动翻页，返回 items 和来源。nameContains 仅用于确定的字面子串过滤；存在同义词、类别或属性歧义时省略，读取后判断，必要时查详情。
程序通过 Playwright 页面导航和实时 DOM 读取执行，结束时浏览器位于最后读取页；不使用 HTTP、文件或数据库捷径。complete 只证明该查询/分类分页闭合，不证明自然语言查询召回完整，也不证明所有业务条件已满足。
一次调用预留 maxPages 页预算（默认 12）；需要两次查询时先显式分配页预算，不能靠多次调用绕过工作流总预算。不要在程序外重写分页、反复读取同一集合或重新抄写抽取代码。
ok=false 或 complete=false 时不得把部分记录当完整答案。根据 errors 修正前置页面或报告缺失证据；工具预算拒绝后停止浏览，不能用猜测补齐数据。
保留任务原有的状态与输出 schema；NOT_FOUND_ERROR 的 retrieved_data 为 null。NAVIGATE 必须实际打开选中的目标 URL，并读取最终状态。
最后用 snapshot/evaluate 读取当前页面状态；不要把证据台账添加到任务未要求的答案字段。
