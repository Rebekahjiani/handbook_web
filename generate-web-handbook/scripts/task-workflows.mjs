import fs from "node:fs/promises";
import {
  contextForWorkflow,
  contextModelMarkdown,
} from "./context-model.mjs";
import { shoppingAdapterFor } from "./workflows/shopping.mjs";
import { parseTaskRequirements } from "./capability-router.mjs";

export const WORKFLOWS = [
  {
    id: "order-aggregation",
    capabilitySignature: {
      entity: "order",
      operations: ["aggregate", "lookup"],
      selection: [
        { field: "purchase_date", operator: "latest" },
        { field: "status", operator: "exists" },
        { field: "status", operator: "eq", value: "pending" },
        { field: "status", operator: "eq", value: "processing" },
        { field: "status", operator: "eq", value: "completed" },
        { field: "status", operator: "eq", value: "cancelled" },
        { field: "status", operator: "eq", value: "canceled" },
        { field: "status", operator: "eq", value: "refunded" },
        { field: "status", operator: "neq", value: "cancelled" },
        { field: "status", operator: "neq", value: "canceled" },
        { field: "purchase_date", operator: "eq" },
        { field: "purchase_date", operator: "range" },
        { field: "product_category", operator: "eq" },
      ],
      outputs: ["order_number", "purchase_date", "status", "grand_total", "item_subtotal", "order_count", "amount"].map((field) => ({ field, type: ["grand_total", "item_subtotal", "order_count", "amount"].includes(field) ? "number" : "string" })),
      executionDependencies: ["detail_url"],
      requiresDetail: true,
    },
    runtimeMode: "workflow_skill",
    kind: "domain",
    title: "订单筛选、金额聚合与退款",
    keywords: "订单数量、消费金额、时间范围、商品类别、退款",
    modelTerms: ["order", "history"],
    task:
      /how many .*orders|complete orders|amount .*spent|spent on|total amount|refund|each month|excluding shipping|including shipping/i,
    preflightGuards: [
      {
        id: "missing-past-months-window",
        when: {
          all: [
            { field: "task.intent", contains: "past months" },
            { field: "task.intent", notMatches: "\\b\\d+\\b" },
            {
              field: "task.intent",
              notMatches: "\\b(?:from|between|after|before|since)\\b",
            },
          ],
        },
        action: {
          type: "return_zero_value",
          responseSchema: "task.expected_response",
        },
        before: "browser.navigation",
      },
    ],
    evidence: /order|purchase|refund|shipping|billing|订单|退款/i,
    coverage: /order|purchase|refund|shipping method|billing address|订单|退款/i,
    steps: [
      "先做时间表达式预检：若任务只写 `past months` 但没有数量或上下界，停止执行浏览流程，按任务 schema 直接返回零值对象，不要打开订单历史。",
      "先把日期上下界、订单状态、商品条件和运费口径写成固定筛选条件。",
      "在订单历史中一次读取每页的订单号、日期、状态、总额和详情链接；记录页面身份、行数与 Next。",
      "只为筛选后的订单打开详情；按任务口径读取商品小计、数量、运费和总额。",
      "只有已访问行数覆盖页面报告的总记录数，或在完整当前页确认 Next 不存在后，才用去重台账计数或求和。",
    ],
    success: [
      "非空结果：accepted_records 非空，且每条记录都有日期、状态和商品条件的行级证据。" +
        "——空结果：accepted_records 为空，且已记录终页证据（最后一页 URL、已访问行数、页面报告总数三者吻合）。两种情况必须满足其中之一，不得仅凭台账为空就声明 SUCCESS。",
      "计数、金额和分组能回溯到同一份去重台账；无匹配时先读取任务要求的输出 schema：若任务要求对象字段，返回零值对象；只有任务协议明确使用 null 时才返回 null。",
    ],
    checks: [
      "“spent”默认排除 Canceled；退款任务只处理 Canceled，除非任务明确另有状态口径。",
      "包含运费时使用 Grand Total；排除运费或按商品类别统计时使用商品小计，不要用 Grand Total。",
      "包含 shipping/handling 时，逐订单同时记录商品小计、shipping、handling、Grand Total 和状态；Grand Total 缺失或未核对时不得用小计代替总额。",
      "金额聚合前逐行复核时间窗口、complete 状态和金额字段；订单数量正确但金额字段缺失仍视为未完成。",
      "退款先建立逐订单账本，再按 `可退商品小计 - 明确保留商品行金额 + 可退运费` 计算；每个保留项和运费口径都必须有行级证据。",
      "WebArena 日期口径：若任务写 “past N months/过去 N 个月”，按任务日期向前回推 N*30 天，且订单日期必须严格晚于下界；“过去 N 天”同样严格晚于下界。只有任务明确写 calendar month/month-to-date 时才使用日历月口径。",
      "若任务只写 `past months` 但没有数量或上下界，不得扩成全部历史；把时间范围标记为不完整，返回零值对象或阻塞证据，不能猜测 SUCCESS。",
      "进入详情后核对页面订单号；商品类别优先以站点分类和商品用途判断：主用途属于目标类别才计入，名称近似但用途不同的配件不计入。",
      "食品相关可包含烘焙装饰等直接用于食品的商品；hair care/style 只包含护理或造型产品，不包含纯装饰配件。",
      "不能因当前页没有分页控件就断言只有一页；同时核对总记录文本、已访问行数和页面身份。",
      "无匹配记录时严格遵守任务要求的返回类型：对象任务返回对象的零值字段，列表任务才返回空列表，明确 null 协议才返回 null。",
    ],
    risk: "查看订单通常无副作用；取消、退货或再次购买属于写操作，不要代替用户提交。",
  },
  {
    id: "order-lookup",
    capabilitySignature: {
      entity: "order",
      operations: ["lookup", "read"],
      selection: [
        { field: "purchase_date", operator: "latest" },
        { field: "status", operator: "exists" },
        { field: "status", operator: "eq", value: "pending" },
        { field: "status", operator: "eq", value: "processing" },
        { field: "status", operator: "eq", value: "completed" },
        { field: "status", operator: "eq", value: "cancelled" },
        { field: "status", operator: "eq", value: "canceled" },
        { field: "status", operator: "eq", value: "refunded" },
        { field: "status", operator: "neq", value: "cancelled" },
        { field: "status", operator: "neq", value: "canceled" },
        { field: "purchase_date", operator: "eq" },
        { field: "purchase_date", operator: "range" },
        { field: "product_category", operator: "eq" },
      ],
      outputs: ["order_number", "purchase_date", "status"].map((field) => ({ field, type: "string" })),
      executionDependencies: ["detail_url"],
      requiresDetail: true,
    },
    runtimeMode: "workflow_skill",
    kind: "domain",
    backoff: true,
    title: "订单查找与已购商品属性",
    keywords: "最近订单、订单状态、已购商品、规格、配送与账单字段",
    modelTerms: ["order", "history"],
    task:
      /\borders?\b|purchase (?:history|date)|(?:first|last|recent) purchase|purchase.*\bdate\b|bought|shipping method|billing address|arrival|delivery|cancelled|pending|processing/i,
    evidence: /order|purchase|shipping|billing|订单/i,
    coverage: /order|purchase|shipping method|billing address|订单/i,
    steps: [
      "先判定任务是单对象查找还是集合查找；进入订单历史并把每页行数据一次性读取为短台账，记录页面身份、行数与 Next。",
      "按日期、状态或商品名称筛选；查找“最近”记录时按页面显示日期比较。",
      "从目标行的实时详情链接进入详情，并核对订单号。",
      "读取任务要求的字段或商品选项，保留页面显示的单位和格式。",
    ],
    success: [
      "找到目标：列表行与详情页订单号一致，且目标条件有行级证据。" +
        "——无匹配：已记录终页证据（末页 URL、已访问行数、页面报告总数一致），再回到订单历史首页结束。两种情况必须满足其中之一。",
      "返回值保留页面显示的单位；不得靠猜测或拼接 URL 构造结果。",
    ],
    checks: [
      "分页后废弃旧引用；不要根据订单号拼接详情 URL。",
      "查找最近状态时，一旦已按时间倒序确认首个精确状态匹配即可停止。",
      "任务含 `all`、完整年份或日期范围时属于集合查找：必须覆盖整个范围并保存全部候选，不能找到第一项就停止。",
      "按已购商品查找时，先穷尽目标日期范围内的订单行，再逐个打开候选详情；不要在订单页和站内搜索间循环。",
      "无匹配必须有终页证据：完整当前页没有 Next，且已访问行数与页面报告的总数一致。",
      "商品尺寸、容量等属性必须保留单位，例如 `16 inch`，不能只返回裸数字。",
      "无匹配时导航回不带分页参数的订单历史首页，并返回 NOT_FOUND 与 null。",
    ],
    risk: "查看订单通常无副作用；Reorder、取消或退货属于写操作，不要代替用户提交。",
  },
  {
    id: "checkout",
    kind: "domain",
    title: "购买与结账",
    keywords: "购买、结账、地址、配送、付款、下单",
    modelTerms: ["checkout", "cart", "shipping", "payment"],
    task: /buy|purchase .*product|checkout|place .*order|payment|shipping address/i,
    evidence: /buy|checkout|cart|address|shipping|payment|place order|购买|结账/i,
    coverage: /checkout|payment|shipping address|place order|结账|付款/i,
    steps: [
      "先完成商品选择并核对规格、数量和价格。",
      "进入购物车，确认只有任务要求的商品。",
      "依次填写地址、配送和付款字段，每一步都验证页面摘要。",
      "停在最终提交前；只有任务明确授权时才执行下单。",
    ],
    success: [
      "购物车摘要中的商品、规格、数量和总价正确。",
      "若已获授权提交，出现订单确认页或订单号。",
    ],
    risk: "下单会产生真实副作用。最终提交前必须再次核对任务授权和订单摘要。",
  },
  {
    id: "cart-lists",
    kind: "domain",
    title: "购物车、愿望单与比较",
    keywords: "加入、移除、购物车、愿望单、收藏、比较、数量",
    modelTerms: ["cart", "wishlist"],
    task: /cart|wishlist|wish list|compare|add .*item|remove .*item|quantity/i,
    evidence: /cart|wishlist|compare|add to|remove|quantity|购物车|愿望单|比较/i,
    coverage: /cart|wishlist|compare|购物车|愿望单|比较/i,
    steps: [
      "定位目标商品并进入商品卡片或详情页。",
      "核对名称、规格后执行加入、移除或修改数量。",
      "打开目标列表，确认操作只影响指定商品。",
    ],
    success: [
      "目标列表中出现或消失了正确商品。",
      "数量、规格和提示消息与任务一致。",
    ],
    risk: "这是账户写操作。避免清空列表，也不要顺带修改其他商品。",
  },
  {
    id: "reviews",
    runtimeMode: "contract_only",
    kind: "domain",
    title: "商品详情与评论",
    keywords: "商品详情、评论、评分、评论者、评论标题、摘要",
    modelTerms: ["review", "rating"],
    task:
      /review|reviewer|rating|stars?|product on the current page|summarize|customer names|complain|good looking/i,
    evidence: /\breviews?\b|\brating\b|\bstars?\b|评论|评分/i,
    coverage: /\breviews?\b|\brating\b|\bstars?\b|评论|评分/i,
    coverageScope: "full",
    steps: [
      "确认当前商品名称与任务一致。",
      "进入评论区域，按评分或文本条件读取；评论区有独立分页时逐页读取，按（作者＋标题＋评分）复合键去重，不得仅读首屏可见评论就声明完整。",
      "把评论者、标题、评分和正文保持在同一条评论容器中。",
      "去重后按任务指定的数据结构返回。",
    ],
    success: [
      "结果全部来自目标商品，满足评分或文本条件，且已覆盖全部评论分页（末页无 Next 或已达到任务要求的数量上限）。",
      "没有把相邻评论的作者、标题和正文混在一起。",
    ],
    checks: [
      "作者、标题、评分和正文必须来自同一条评论容器。",
      "分页可能重复最后几条评论；先按 `标题 + 评分 + 作者 + 正文` 的复合键去重，再投影为任务要求的标题或作者列表。",
      "评论者姓名按评论容器的可见文本原样返回；只去首尾空白，不合并或改写重复文本节点。",
      "最终返回页面观察值；除非任务明确要求文件，否则不要返回快照文件名或路径。",
    ],
    risk: "不要把商品总评分当作单条评论评分；分页时记录已处理页，防止重复。",
  },
  {
    id: "account-forms",
    kind: "core",
    title: "账户、地址与表单",
    keywords: "登录、注册、账户、个人信息、地址、联系表单",
    modelTerms: ["address", "login", "form"],
    task:
      /\b(?:log in|login|sign in|register|account|profile|address|contact|newsletter|form)\b/i,
    evidence: /log in|login|sign in|register|account|address|contact|submit|账户|地址/i,
    coverage: /log in|login|sign in|register|create account|address|contact|账户|地址/i,
    steps: [
      "确认当前登录状态和目标表单。",
      "逐字段填写；优先按标签定位，不依赖字段在页面中的顺序。",
      "提交前检查必填项、格式和可能的账户副作用。",
      "提交后验证成功提示或回显值。",
    ],
    success: [
      "字段值写入了正确输入框。",
      "页面出现明确的保存成功提示或正确回显。",
    ],
    risk: "注册、修改资料和地址会改变账户状态；没有明确授权时只填写到提交前。",
  },
  {
    id: "category-navigation",
    runtimeMode: "contract_only",
    kind: "core",
    title: "分类页导航与价格过滤",
    keywords: "打开分类、浏览商品、分类页、价格上限",
    modelTerms: ["search", "category", "listing"],
    task:
      /open .*category page|category page.*filtered|browse products|go to .*(?:category|products?|page).*sorted|page showing.*products?|navigate to .*category|category.*(?:sorted|filtered|ascending|descending)/i,
    evidence:
      /\bcategory\b|category page|breadcrumb|catalog|menu|navigation|分类|面包屑|菜单/i,
    coverage: /search|category|sort|filter|price|搜索|分类|筛选|排序/i,
    steps: [
      "从已观察到的分类路径提示中选择语义最精确的一条；没有提示时再沿菜单逐级进入。",
      "核对分类页 URL、标题和面包屑。",
      "需要价格上限时使用页面价格筛选，并核对 URL 中的价格条件。",
      "停在分类结果页，不要把站内搜索结果页当作分类页。",
    ],
    success: [
      "最终 URL、标题或面包屑与目标分类一致。",
      "价格筛选值与任务上限一致。",
    ],
    checks: [
      "命中精确分类路径后不要继续尝试近似分类。",
      "最多尝试两个候选分类路径；仍不匹配再回到菜单。",
      "任务要求 under X 时，价格范围使用从 0 到 X 的页面筛选值。",
    ],
    risk: "同名分类可能位于不同父级；必须核对完整路径，不能只看末级名称。",
  },
  {
    id: "catalog-aggregation",
    kind: "core",
    title: "商品集合、名称与价格聚合",
    keywords: "价格范围、品牌商品、完整名称、可用型号",
    modelTerms: ["search", "category", "listing", "product"],
    task:
      /price range|full names|available models|products from/i,
    evidence:
      /toolbar-amount|pages-item-next|limiter|per page|total.*result|page.*of|分页|每页|共.*件/i,
    coverage: /search|category|sort|filter|price|搜索|分类|筛选|排序/i,
    steps: [
      "用最短且有区分度的查询词建立候选集，并固定品牌、类别和产品类型条件。",
      "把页面显示数量调到最大，记录总结果数和当前页身份；每页只做一次 DOM 批量读取，得到名称、价格和链接。",
      "按 Next 逐页去重；只有完整当前页没有 Next，或已访问商品数覆盖总结果数时才停止，禁止根据前几页内容推断后续没有目标。",
      "用标题、分类/面包屑和详情主商品身份共同筛选；目标作为主商品时可包含附件套装，目标仅作为附赠品时排除。",
      "从同一候选台账返回完整名称、最小价和最大价。",
    ],
    success: [
      "候选集合覆盖全部结果页且没有近似商品。",
      "名称列表与 min/max 来自同一份去重候选台账。",
    ],
    checks: [
      "每个候选必须同时满足核心产品词和品牌；不能只因搜索命中就计入。",
      "品牌和产品类型可由标题或站点分类证明；不要要求自然语言同义词必须逐字出现在标题。",
      "优先把每页显示数量调到最大，再遍历分页。",
      "查询预算是一个主查询加至多一个召回补充查询；每个规范 URL 只读取一次，不检查与任务无关的筛选器。",
      "维护 `已访问页/总结果/已读取卡片/去重候选` 四个计数；任何一个无法解释时不得声称集合完整。",
      "召回补充查询只补主查询缺少的品牌或类型证据；合并后按商品 URL 去重，再统一做语义验收。",
      "完成分页后立刻计算并返回，不要为已确定的极值继续打开商品详情。",
    ],
    risk: "站内搜索可能返回广告、配件或相似词商品；必须按名称和类别逐条验收。",
  },
  {
    id: "product-selection",
    kind: "core",
    title: "满足约束的最优商品选择",
    keywords: "最便宜、最佳选项、最低容量、打开商品页",
    modelTerms: ["search", "category", "listing", "product"],
    task:
      /product page.*(?:best|least expensive|most expensive)|best .*option|least expensive|most recent .*released|released between/i,
    evidence:
      /sort.by|sorter|sort-by|price asc|price desc|relevance|ascending|descending|排序|价格升序|价格降序/i,
    coverage: /search|category|sort|filter|price|搜索|分类|筛选|排序/i,
    steps: [
      "先解析比较器：`least expensive` 按价格升序，`most expensive` 按价格降序，`most recent released` 按产品发布日期降序；`best` 保留站点相关性或任务明确给出的质量信号。",
      "把候选验收拆成两个独立谓词：`is_target_product_type` 判断它是任务所说的主商品/配件类型，`satisfies_task_constraint` 判断平台兼容、容量等约束；两者都为真才进入候选集。多平台配件可用明确兼容性满足平台约束，不要求独占该平台分类；主机本体不能冒充配件。",
      "优先使用站点已有的精确分类或一次主搜索建立候选集并排序。在价格降序已验证生效后，从顶部依次验收，不跨到无关分类分支重新比较。",
      "按比较器顺序核对硬约束；容量、数量、兼容性必须修饰目标商品本身，优先用规格/详情证据，不把包装、附件或营销数字当容量。",
      "找到第一个满足比较器和全部硬约束的候选后，从 accepted_candidates 台账中取出该商品的精确 URL，直接导航到该 URL（不通过再次点击搜索结果中的视觉元素）。",
      "打开商品页后立刻执行字符串比较：location.href 必须等于台账中的精确 URL；不一致时重新导航，不得用视觉近似判断跳过该检查。确认后立即结束。",
    ],
    success: [
      "最终位于满足所有硬约束的商品详情页，且 location.href 字符串等于 accepted_candidates 台账中该商品的精确 URL（非目测近似）。",
      "已证明在完整候选集内不存在按任务比较器更优且同样满足条件的商品。",
    ],
    checks: [
      "产品名称不充分时才打开详情核对；最多检查八个候选。",
      "查询预算是一个主查询加至多一个召回补充查询；同一结果 URL 不得重复读取。",
      "若价格升序生效，第一个验证通过的候选即可停止；未验证通过的更低价候选必须在台账中有明确排除理由。",
      "若价格降序生效，只有站点明确显示降序已生效，或已枚举完整候选集并自行求最大值，才能在首个验证通过的候选处停止。",
      "多平台商品不得仅因不独占目标平台而排除；必须分别记录产品类型证据和兼容性证据。反之，只有兼容性而产品类型不符时必须排除。",
      "`most recent released` 比较产品发布日期；不得用型号数字、评论日期或页面更新时间替代。",
      "`best` 没有显式价格词时不得按最低价排序；优先站点默认相关性，再使用评分、评论量或与约束的精确匹配作为可解释信号。",
      "候选分类证据优先于标题是否逐字包含任务同义词；只有主商品类型冲突时才排除。",
      "到达商品页后提交前重新读取当前 URL，确认它仍等于台账中的精确 URL。",
      "到达目标商品页后立刻结束，搜索结果页不能作为成功状态。",
    ],
    risk: "容量数字可能描述包装、附件或兼容数量；必须确认它修饰任务要求的属性。",
  },
  {
    id: "search-discovery",
    runtimeMode: "contract_only",
    kind: "core",
    backoff: true,
    title: "通用搜索、筛选与商品发现",
    keywords: "搜索、筛选、排序、商品发现",
    modelTerms: ["search", "category", "listing"],
    task:
      /\b(?:search|find|category|sorted|sort by|most expensive|listings|sale)\b|product page/i,
    evidence:
      /search|category|sort|filter|price|next|view as|搜索|分类|筛选|排序/i,
    coverage: /search|category|sort|filter|price|搜索|分类|筛选|排序/i,
    steps: [
      "定义产品类型、品牌、属性和价格条件。",
      "用分类或一次站内搜索建立候选集，再应用筛选与排序。",
      "只读取完成任务所需的字段，并在成功判据满足后停止。",
    ],
    success: ["最终页面和候选集合满足任务的全部显式条件。"],
    checks: [
      "搜索词最多改写两次；每次改写前说明缺少哪条条件。",
      "连续两次没有缩小候选集合时停止当前策略，改用分类入口。",
    ],
    risk: "搜索结果是候选，不是答案；选择前必须验证名称、规格和页面状态。",
  },
  {
    id: "read-content",
    kind: "core",
    backoff: true,
    title: "读取列表、详情与结构化数据",
    keywords: "读取、查询、列表、详情、统计、下载、导出",
    modelTerms: ["record", "detail", "list", "table"],
    task:
      /\b(?:get|return|list|show|summarize|what is|how many|find out|read|retrieve|download|export)\b/i,
    evidence:
      /details?|information|more|next|previous|download|export|table|list|view|read|详情|下载|导出/i,
    coverage: /details?|information|results?|list|report|dashboard|详情|结果|列表/i,
    steps: [
      "确认目标记录、列表或时间范围。",
      "读取列名、字段标签和一条完整记录，建立字段对应关系。",
      "需要统计时遍历分页并去重；需要详情时保持记录上下文。",
      "按任务要求的数据结构、类型和格式返回。",
    ],
    success: [
      "结果来自正确记录或完整结果集。",
      "字段名称、数据类型和输出格式符合任务要求。",
    ],
    risk: "不要把首屏当作完整列表；缺失值与零值必须区分。",
  },
  {
    id: "edit-submit",
    kind: "core",
    title: "创建、修改与提交",
    keywords: "创建、编辑、更新、删除、上传、保存、发送、订阅",
    modelTerms: ["create", "edit", "update", "delete", "form"],
    task:
      /\b(?:create|add|edit|update|change|delete|remove|submit|upload|send|subscribe|post|publish|save)\b/i,
    evidence:
      /create|add|edit|update|delete|remove|submit|upload|send|subscribe|publish|save|创建|编辑|删除|保存|提交/i,
    coverage: /create|edit|new|settings|compose|upload|form|创建|编辑|设置|表单/i,
    steps: [
      "打开目标记录或创建表单，确认当前身份与对象。",
      "按标签定位字段并填写，只修改任务要求的内容。",
      "提交前复核目标、字段差异和副作用。",
      "提交后验证成功提示、回显值或新记录标识。",
    ],
    success: [
      "修改只作用于目标对象和指定字段。",
      "页面显示成功提示或可验证的新状态。",
    ],
    risk: "这是写操作；删除、发布和发送等不可逆动作必须有明确任务授权。",
  },
  {
    id: "navigation",
    kind: "core",
    backoff: true,
    title: "页面导航",
    keywords: "打开、前往、进入、导航、页面",
    modelTerms: ["navigation"],
    task: /\b(?:open|go to|navigate|pull up)\b|\bview .*page\b|\bcurrent page\b/i,
    evidence: /home|menu|category|account|contact|product|page|首页|菜单|页面/i,
    coverage: /home|menu|category|product|page|首页|菜单|页面/i,
    steps: [
      "从当前 URL 和标题确认起点。",
      "使用语义链接逐级进入目标页面。",
      "每次导航后检查 URL、主标题或关键内容。",
    ],
    success: ["最终页面的 URL、主标题和任务目标一致。"],
    checks: [
      "必须通过页面中的真实链接或控件完成导航；搜索结果页不是目标页的替代品。",
      "结束前重新读取页面，确认最终 URL、标题和关键内容同时匹配任务。",
    ],
    risk: "遇到同名链接时先限定导航区或内容区，不要用坐标猜测。",
  },
  {
    id: "other",
    kind: "core",
    fallback: true,
    title: "未归类任务",
    keywords: "未命中已有工作流的任务",
    task: /.*/,
    evidence: /./,
    coverage: null,
    steps: [
      "先把任务拆成导航、读取和写入三个阶段。",
      "从当前页面语义和快照中寻找最接近的已验证入口。",
      "每一步都验证可见结果；发现重复模式后再刷新生成器。",
    ],
    success: ["完成任务要求，且没有执行未授权的写操作。"],
    risk: "此工作流证据较弱；不要把未验证的推断当成站点事实。",
  },
];

function clip(value, limit = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function relativeUrl(raw, origin) {
  try {
    const url = new URL(raw);
    return url.origin === origin ? `${url.pathname}${url.search}` : url.href;
  } catch {
    return raw;
  }
}

function taskType(task) {
  return task.task_type || "unknown";
}

function taskIntent(task) {
  return task.intent || task.task || task.description || task.name || "";
}

function classifyTask(task, workflowDefs = WORKFLOWS) {
  const intent = taskIntent(task);
  const fallback = workflowDefs.at(-1);
  let best = null;
  let bestLen = -1;
  for (const workflow of workflowDefs) {
    if (workflow.fallback) continue;
    const m = intent.match(workflow.task);
    if (!m) continue;
    const len = m[0].length;
    if (len > bestLen) {
      bestLen = len;
      best = workflow;
    }
  }
  if (!best) return fallback;
  if (["read-content", "edit-submit", "other"].includes(best.id)) {
    const navigation = workflowDefs.find((w) => w.id === "navigation");
    if (navigation && navigation.task.test(intent)) {
      const nm = intent.match(navigation.task);
      if (nm && nm[0].length > bestLen) return navigation;
    }
  }
  return best;
}

function locatorText(action, origin) {
  const locator = action.primary;
  if (!locator) return null;
  if (locator.kind === "role") {
    if (!locator.name || locator.name.length > 80) return null;
    return `getByRole(${JSON.stringify(locator.role)}, { name: ${JSON.stringify(locator.name)}, exact: ${Boolean(locator.exact)} })`;
  }
  if (locator.kind === "within") {
    return `locator(${JSON.stringify(locator.scope)}).filter({ hasText: "<目标项名称>" }).getByRole(${JSON.stringify(locator.role)}, { name: ${JSON.stringify(locator.name)}, exact: ${Boolean(locator.exact)} })`;
  }
  if (locator.kind !== "css" || !locator.selector) return null;
  if (locator.selector.includes(":nth-of-type(")) return null;
  if (locator.selector.includes("#reviews")) {
    return 'locator("a[href$=\\"#reviews\\"]").filter({ hasText: /Reviews?/i })';
  }
  if (locator.selector.includes("#review-form")) {
    return 'locator("a[href$=\\"#review-form\\"]")';
  }
  const productLink = locator.selector.match(
    /^a\.([a-z0-9_-]*(?:product|item|title)[a-z0-9_-]*)\[href=/i,
  );
  if (productLink && action.name) {
    return `locator(${JSON.stringify(`a.${productLink[1]}`)}).filter({ hasText: "<目标项名称>" })`;
  }
  const selector = locator.selector.split(origin).join("${SITE_ORIGIN}");
  return selector.length <= 220 ? `locator(${JSON.stringify(selector)})` : null;
}

function actionHaystack(action) {
  return [
    action.name,
    action.role,
    action.href,
    action.context,
    action.region,
    action.placeholder,
  ]
    .filter(Boolean)
    .join(" ");
}

function directActionHaystack(action) {
  return [
    action.name,
    action.role,
    action.href,
    action.placeholder,
  ]
    .filter(Boolean)
    .join(" ");
}

function pageHaystack(page) {
  return [
    page.url,
    page.title,
    ...(page.headings || []),
    ...(page.actions || []).map(actionHaystack),
  ].join(" ");
}

function pageIdentity(page) {
  return [page.url, page.title, ...(page.headings || [])].join(" ");
}

const ROUTE_STOP_WORDS = new Set([
  "and",
  "browse",
  "category",
  "for",
  "from",
  "in",
  "html",
  "market",
  "of",
  "on",
  "one",
  "open",
  "page",
  "products",
  "stop",
  "the",
  "to",
  "with",
]);

function routeTerms(value) {
  const aliases = new Map([
    ["woman", "women"],
    ["womens", "women"],
    ["mens", "men"],
    ["child", "children"],
    ["childrens", "children"],
    ["shelf", "shelves"],
  ]);
  const normalize = (term) => {
    const aliased = aliases.get(term) || term;
    if (
      aliased.length > 4 &&
      aliased.endsWith("s") &&
      !["children", "men", "news", "women"].includes(aliased)
    ) {
      return aliased.slice(0, -1);
    }
    return aliased;
  };
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(normalize)
      .filter((term) => term.length > 1 && !ROUTE_STOP_WORDS.has(term)),
  );
}

export function categoryRoutes(pages, origin) {
  const routes = new Map();
  for (const page of pages) {
    for (const raw of page.links || []) {
      try {
        const url = new URL(raw, origin);
        const segments = url.pathname.split("/").filter(Boolean);
        const leafTerms = routeTerms(segments.at(-1));
        if (
          url.origin !== origin ||
          (segments.length < 2 && leafTerms.size > 4) ||
          !url.pathname.endsWith(".html")
        ) {
          continue;
        }
        const path = `${url.pathname}${url.search}`;
        routes.set(path, {
          path,
          label: segments
            .map((segment) =>
              decodeURIComponent(segment)
                .replace(/\.html$/, "")
                .replace(/-/g, " "),
            )
            .join(" > "),
          terms: routeTerms(segments.join(" ")),
          leafTerms,
        });
      } catch {
        // 忽略无法解析的页面链接。
      }
    }
  }
  return [...routes.values()];
}

export function taskDrivenRouteHints(tasks, pages, origin, limit = 12) {
  const routes = categoryRoutes(pages, origin);
  const selected = new Map();
  for (const task of tasks) {
    const terms = routeTerms(taskIntent(task));
    const ranked = routes
      .map((route) => {
        const shared = [...terms].filter((term) => route.terms.has(term)).length;
        const leafShared = [...terms].filter((term) =>
          route.leafTerms.has(term),
        ).length;
        const leafExtra = [...route.leafTerms].filter(
          (term) => !terms.has(term),
        ).length;
        return {
          route,
          shared,
          score: shared + leafShared * 3 - leafExtra,
        };
      })
      .filter((item) => item.shared >= 1)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.route.path.split("/").length - a.route.path.split("/").length,
      );
    if (ranked.length) selected.set(ranked[0].route.path, ranked[0].route);
    if (selected.size >= limit) break;
  }
  return [...selected.values()];
}

export function taskLinkScore(raw, tasks, origin) {
  const taskTermSets = tasks.map((task) => routeTerms(taskIntent(task)));
  let terms = new Set();
  let leafTerms = new Set();
  let depth = 0;
  try {
    const url = new URL(raw, origin);
    terms = routeTerms(url.pathname);
    const segments = url.pathname.split("/").filter(Boolean);
    leafTerms = routeTerms(segments.at(-1));
    depth = segments.length;
  } catch {
    // 无法解析的链接保持零分。
  }
  const score = taskTermSets.reduce(
    (best, taskTerms) =>
      Math.max(
        best,
        [...taskTerms].filter((term) => terms.has(term)).length +
          [...taskTerms].filter((term) => leafTerms.has(term)).length * 3 -
          [...leafTerms].filter((term) => !taskTerms.has(term)).length,
      ),
    0,
  );
  return { score, depth };
}

export function rankTaskLinks(links, tasks, origin) {
  return links
    .map((raw, index) => ({
      raw,
      index,
      ...taskLinkScore(raw, tasks, origin),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.depth - a.depth ||
        a.index - b.index,
    )
    .map((item) => item.raw);
}

function rankLocators(workflow, pages, origin) {
  const ranked = [];
  for (const page of pages) {
    for (const action of page.actions || []) {
      if (!workflow.evidence.test(directActionHaystack(action))) continue;
      const locator = locatorText(action, origin);
      if (!locator) continue;
      let score = 0;
      if (action.name) score += 2;
      if (action.primary?.kind === "role") score += 4;
      if (action.primary?.kind === "within") score += 3;
      if (!["header", "nav", "footer"].includes(action.region)) score += 2;
      if (workflow.evidence.test(action.name || "")) score += 2;
      const evidence = [];
      if (action.primary?.count === 1) evidence.push("unique");
      if (["data-testid", "data-test", "data-qa", "aria-label"].some((key) =>
        (action.candidates || []).some((candidate) => candidate.selector?.includes(key)))) {
        evidence.push("stable-attribute");
      }
      if (action.primary?.kind === "within" || action.context) evidence.push("scoped");
      if (action.tag === "input" || action.tag === "textarea" || action.tag === "select") {
        evidence.push("form-bound");
      }
      ranked.push({
        score,
        confidence: Math.min(0.99, Number((0.45 + score / 20).toFixed(2))),
        evidence,
        label: clip(action.name || `${action.role} 控件`, 72),
        locator,
        page: page.slug,
        scope: action.context || action.region || null,
      });
    }
  }
  const unique = new Map();
  for (const item of ranked.sort((a, b) => b.score - a.score)) {
    if (!unique.has(item.locator)) unique.set(item.locator, item);
  }
  return [...unique.values()].slice(0, 4);
}

const RUNTIME_BASE = `# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。
`;

function observedStructures(workflow, pages) {
  // Product-list selectors are site/page evidence, not a generic order-table
  // contract. Order workflows must not inherit them merely because their id
  // contains "order".
  const wanted = /catalog|product|search|category/.test(workflow.id)
    ? new Set(["product-list", "pagination"])
    : new Set();
  const unique = new Map();
  for (const page of pages) {
    for (const structure of page.structures || []) {
      if (!wanted.has(structure.id)) continue;
      if (!unique.has(structure.id)) {
        unique.set(structure.id, structuredClone(structure));
        continue;
      }
      const current = unique.get(structure.id);
      if (structure.id === "pagination") {
        current.nextSelector ||= structure.nextSelector;
        current.limiterSelector ||= structure.limiterSelector;
        current.totalSelector ||= structure.totalSelector;
      }
    }
  }
  return [...unique.values()];
}

function observedForms(definition, pages) {
  if (!isMutatingWorkflow(definition)) return [];
  const forms = (definition.formContracts || []).map((form) => ({
    pageUrl: form.pageUrl || null,
    evidence: "site-adapter-form-contract",
    action: form.action || null,
    method: form.method || "post",
    selector: form.selector || null,
    fields: form.fields || [],
    submitButtons: form.submitButtons || [],
    confirmations: form.confirmations || [],
    postcondition: form.postcondition || "read-current-page-state-after-submit",
    requiredNetworkEvent: form.requiredNetworkEvent || null,
    repeatability: form.repeatability || null,
  }));
  const terms = new RegExp(
    `${definition.id}|${definition.evidence?.source || "form|submit|save"}`,
    "i",
  );
  for (const page of pages) {
    for (const form of page.forms || []) {
      const haystack = [
        form.action,
        form.method,
        ...(form.fields || []).flatMap((field) => [field.name, field.type, field.label]),
        ...(form.submitButtons || []).map((button) => button.name),
      ].filter(Boolean).join(" ");
      if (!terms.test(haystack) && forms.length >= 3) continue;
      forms.push({
        pageUrl: page.url,
        evidence: "static-dom-form",
        action: form.action || null,
        method: form.method || "get",
        selector: form.selector || null,
        fields: (form.fields || []).slice(0, 12),
        submitButtons: (form.submitButtons || []).slice(0, 4),
        confirmations: (form.confirmations || []).slice(0, 4),
        postcondition: form.confirmations?.length
          ? "verify-confirmation-selector-and-text"
          : "read-current-page-state-after-submit",
        requiredNetworkEvent: null,
        repeatability: null,
      });
      if (forms.length >= 3) return forms;
    }
  }
  return forms;
}

function observedVisualAnchors(definition, pages) {
  const anchors = [];
  for (const page of pages) {
    for (const anchor of page.visualAnchors || []) {
      anchors.push({
        pageUrl: page.url,
        screenshot: `screenshots/${page.slug}-annotated.png`,
        ...anchor,
      });
      if (anchors.length >= 8) return anchors;
    }
  }
  return anchors;
}

function structureMarkdown(structure) {
  if (structure.id === "product-list") {
    const fields = structure.fields || {};
    return [
      `- 商品卡片：\`${structure.itemSelector}\``,
      fields.name ? `名称 \`${fields.name}\`` : null,
      fields.price ? `价格 \`${fields.price}\`` : null,
      fields.link ? `链接 \`${fields.link}\`` : null,
    ]
      .filter(Boolean)
      .join("；");
  }
  const fields = [
    structure.limiterSelector
      ? `每页数量 \`${structure.limiterSelector}\``
      : null,
    structure.totalSelector ? `总数 \`${structure.totalSelector}\`` : null,
    structure.nextSelector ? `Next \`${structure.nextSelector}\`` : null,
  ].filter(Boolean);
  return `- 分页：${fields.join("；")}`;
}

const LIST_READ_ACTION_ID = "read_current_list_page_v1";
const FINAL_STATE_GATE_ID = "verify_final_state_v1";

function listReadSpec(structures) {
  const product = structures.find((item) => item.id === "product-list");
  if (!product) return null;
  const pagination = structures.find((item) => item.id === "pagination") || {};
  const name = product.fields?.name;
  const price = product.fields?.price;
  const link = product.fields?.link;
  if (!name || !link) return null;
  return {
    actionId: LIST_READ_ACTION_ID,
    selectors: {
      item: product.itemSelector,
      fields: { name, price, link },
      pagination: {
        next: pagination.nextSelector || null,
        limiter: pagination.limiterSelector || null,
        total: pagination.totalSelector || null,
      },
    },
  };
}

function listReadTemplateFromSpec(spec) {
  const selector = (value) => JSON.stringify(value || "");
  const totalText = spec.selectors.pagination.total
    ? `document.querySelector(${selector(spec.selectors.pagination.total)})?.textContent.trim() || ""`
    : `""`;
  const nextSelector = selector(spec.selectors.pagination.next);
  const limiterSelector = selector(spec.selectors.pagination.limiter);
  return `() => {
  const errors = [];
  const rawCards = [...document.querySelectorAll(${selector(spec.selectors.item)})];
  const cards = rawCards.filter(card =>
    Boolean(card.offsetWidth || card.offsetHeight || card.getClientRects().length)
  );
  const items = cards.map(card => {
    const nameNode = card.querySelector(${selector(spec.selectors.fields.name)});
    const link = card.querySelector(${selector(spec.selectors.fields.link)});
    ${spec.selectors.fields.price ? `const priceText = card.querySelector(${selector(spec.selectors.fields.price)})?.textContent || "";
    const priceMatch = priceText.replace(/,/g, "").match(/\\d+(?:\\.\\d{1,2})?/);` : `const priceMatch = null;`}
    return {
      name: nameNode?.textContent.trim() || "",
      ${spec.selectors.fields.price ? `price: priceMatch ? Number(priceMatch[0]) : null,` : ""}
      url: link?.href || ""
    };
  });
  if (items.length === 0) errors.push("product-list-empty-or-selector-mismatch");
  if (items.some(item => !item.name || !item.url${spec.selectors.fields.price ? " || item.price === null" : ""})) {
    errors.push("required-product-field-missing");
  }
  const next = ${spec.selectors.pagination.next ? `document.querySelector(${nextSelector})` : "null"};
  const nextDisabled = !next ||
    next.matches("[disabled], .disabled, [aria-disabled=\\"true\\"]") ||
    Boolean(next.closest(".disabled, [aria-disabled=\\"true\\"]"));
  const nextHref = nextDisabled ? null : next.href || null;
  const limiter = ${spec.selectors.pagination.limiter ? `document.querySelector(${limiterSelector})` : "null"};
  const limiterOptions = limiter
    ? [...limiter.options].map(option => option.value).filter(Boolean)
    : [];
  return {
    actionId: "${LIST_READ_ACTION_ID}",
    ok: errors.length === 0,
    pageId: JSON.stringify({
      url: location.href,
      itemCount: items.length,
      firstUrl: items[0]?.url || "",
      lastUrl: items.at(-1)?.url || ""
    }),
    totalText: ${totalText},
    rawCardCount: rawCards.length,
    ignoredCardCount: rawCards.length - cards.length,
    itemCount: items.length,
    items,
    nextHref,
    complete: nextHref === null,
    currentLimiterValue: limiter?.value || null,
    limiterOptions,
    errors
  };
}`;
}

function batchReadTemplate(structures) {
  const spec = listReadSpec(structures);
  return spec ? listReadTemplateFromSpec(spec) : null;
}

function listReadContract(structures) {
  const spec = listReadSpec(structures);
  if (!spec) return null;
  return {
    actionId: spec.actionId,
    kind: "browser.evaluate",
    deterministic: true,
    scope: "current-list-page",
    maxCallsPerPageId: 1,
    selectors: spec.selectors,
    javascript: listReadTemplateFromSpec(spec),
    requiredOutput: {
      actionId: spec.actionId,
      requiredKeys: [
        "ok",
        "pageId",
        "totalText",
        "rawCardCount",
        "ignoredCardCount",
        "itemCount",
        "items",
        "nextHref",
        "complete",
        "currentLimiterValue",
        "limiterOptions",
        "errors",
      ],
      itemKeys: spec.selectors.fields.price ? ["name", "price", "url"] : ["name", "url"],
      okWhen: [
        "errors is empty",
        "itemCount equals items.length",
        spec.selectors.fields.price
          ? "each item has name, url, and numeric price"
          : "each item has name and url",
      ],
    },
  };
}

// 页面 selector、表单和结构属于站点适配层；通用运行层只消费这份证据。
function pageAdapterFor(item) {
  const adapterActions = item.siteKeys?.includes("shopping")
    ? shoppingAdapterFor(item.definition.id, item.modelContext)
    : null;
  const base = item.pageAdapter || {
    structures: item.structures || [],
    forms: item.forms || [],
    visualAnchors: item.visualAnchors || [],
  };
  if (!adapterActions) return base;
  const actions = adapterActions.actions || [adapterActions];
  return {
    ...base,
    actions: [...(base.actions || []), ...actions],
    ...(adapterActions.selectionContract
      ? { selectionContract: adapterActions.selectionContract }
      : {}),
  };
}

function workflowBudgets(definition, hasListAction) {
  const isCatalog = definition.id === "catalog-aggregation";
  const isSelection = definition.id === "product-selection";
  return {
    finalStateGateRequiredBeforeSuccess: true,
    maxConsecutiveSameAction: 2,
    recoveryAttemptsMax: 2,
    maxListPages: isCatalog ? 12 : null,
    loginBlockPolicy:
      "If the task is not authentication, /login or sign-in is a blocking state; stop instead of retrying navigation or form actions.",
    listReadMaxCallsPerPageId: hasListAction ? 1 : null,
    customListEvaluateMaxCalls: hasListAction ? 0 : null,
    supplementalQueriesMax: isCatalog || isSelection ? 1 : 0,
    supplementalQueryAllowedOnlyWhen:
      isCatalog || isSelection
        ? "zero accepted candidates satisfy target product type in the frozen primary result set"
        : null,
    zeroSupplementalQueryBudgetAfterAcceptedCandidate: isSelection,
    broadCategoryDetoursForBrandFilterMax: isCatalog ? 0 : null,
  };
}

function isMutatingWorkflow(definition) {
  return definition.mutation === true || [
    "account-forms",
    "cart-lists",
    "checkout",
    "edit-submit",
  ].includes(definition.id);
}

function mutationPolicy(definition, forms = []) {
  if (!isMutatingWorkflow(definition)) return null;
  const phases = {
    "post-create": ["open-create-form", "fill-and-verify", "submit-once", "verify-created-object"],
    "post-reply": ["identify-target", "open-reply-form", "fill-and-verify", "submit-once", "verify-reply"],
    vote: ["identify-target", "single-vote-action", "verify-vote-state"],
    "user-edit": ["open-edit-form", "fill-and-verify", "submit-once", "verify-profile"],
    subscribe: ["identify-target", "single-subscribe-action", "verify-subscribe-state"],
    "forum-create": ["open-create-form", "fill-and-verify", "submit-once", "verify-created-forum"],
  };
  const expectedMutation = definition.expectedMutation || null;
  const formEvents = forms
    .map((form) => form.requiredNetworkEvent)
    .filter(Boolean);
  const derivedEvent = expectedMutation
    ? {
        method: expectedMutation.method,
        urlPattern: expectedMutation.endpointPattern,
        ...(expectedMutation.responseContent
          ? { responseContent: expectedMutation.responseContent }
          : {}),
      }
    : null;
  return {
    kind: "browser.mutate",
    phases: phases[definition.id] || ["identify-target", "fill-and-verify", "submit-once", "verify-result"],
    submitMaxCalls: 1,
    requireExactTaskValues: true,
    requireCurrentFormAction: true,
    requirePostSubmitRead: true,
    requireNetworkMutationEvent: Boolean(expectedMutation || formEvents.length),
    networkEventExcludePathPatterns: [
      "^/(?:login(?:_check)?|logout|registration)(?:/|$)",
    ],
    compoundTaskRequiresAllPhases: true,
    requiredNetworkEvents: formEvents.length ? formEvents : derivedEvent ? [derivedEvent] : [],
    expectedMutation,
    contractCoverage: expectedMutation || forms.some((form) => form.requiredNetworkEvent)
      ? "target_event_specified"
      : "adapter_evidence_required",
    forms,
  };
}

function workflowTarget(definition) {
  if (definition.target) return definition.target;
  const targets = {
    "product-selection": { entity: "product", identity: "task-selected-product", desiredState: "product_detail_open" },
    navigation: { entity: "page", identity: "task-target-page", desiredState: "page_open" },
    "category-navigation": { entity: "category_page", identity: "task-category", desiredState: "category_open" },
    "order-aggregation": { entity: "order_set", identity: "task-order-filter", desiredState: "evidence_complete" },
  };
  return targets[definition.id] || { entity: definition.id, identity: "task-target", desiredState: "task-success" };
}

function workflowObservation(definition) {
  return definition.observation || {
    currentState: {
      source: "browser.page",
      required: true,
      fields: ["url", "title", "targetObjectText"],
    },
  };
}

function workflowSuccessContract(definition, mutation) {
  return {
    requiredStatus: "SUCCESS",
    lifecycleGate: FINAL_STATE_GATE_ID,
    targetGate: "target_identity_verified",
    mutationGate: mutation ? "correct_target_mutation" : "not_applicable",
    postStateGate: "post_state_verified",
    answerEvidenceGate: mutation ? "not_applicable" : "observe_answer_evidence_reproducibility",
  };
}

function workflowIR(item, pageAdapter, listAction, mutation, finalStateGate) {
  const definition = item.definition;
  const isMutation = Boolean(mutation);
  const target = workflowTarget(definition);
  const observation = workflowObservation(definition);
  return {
    schemaVersion: 2,
    route: {
      workflow: definition.id,
      intentPattern: definition.task.source,
      siteKeys: item.siteKeys,
      origin: item.origin,
    },
    target,
    preconditions: ["site_origin_matches", "task_values_preserved"],
    observation,
    page: {
      routeHints: item.routeHints || [],
      structures: isMutation ? [] : pageAdapter.structures || [],
      forms: isMutation ? pageAdapter.forms || [] : [],
      visualAnchors: [],
    },
    ...(pageAdapter.selectionContract
      ? { selectionContract: pageAdapter.selectionContract }
      : {}),
    allowedActions: [
      ...(listAction ? [listAction.actionId] : []),
      ...(isMutation ? ["browser.mutate"] : []),
      FINAL_STATE_GATE_ID,
    ],
    requiredNetworkEvents: mutation?.requiredNetworkEvents || [],
    expectedMutation: mutation?.expectedMutation || null,
    postStateGate: {
      lifecycleGate: finalStateGate,
      targetGate: target,
    },
    successContract: workflowSuccessContract(definition, mutation),
  };
}

function supportsRouteHints(workflowId) {
  return new Set([
    "navigation",
    "category-navigation",
    "catalog-aggregation",
    "product-selection",
    "search-discovery",
  ]).has(workflowId);
}

function hasWorkflowCapabilityEvidence(definition, modelContext) {
  const genericTokens = new Set(["read", "content", "aggregation", "lookup", "selection", "discovery", "navigation", "submit"]);
  const terms = definition.id
    .split("-")
    .filter((token) => token.length >= 5 && !genericTokens.has(token));
  return terms.length > 0 && modelContext.capabilities.some((capability) =>
    terms.some((term) => String(capability.id || "").toLowerCase().includes(term)),
  );
}

function workflowExecutionContract(item, origin, siteKey) {
  const pageAdapter = pageAdapterFor(item);
  const listAction = listReadContract(pageAdapter.structures) || pageAdapter.actions?.[0] || null;
  const adapterActions = Array.isArray(pageAdapter.actions) ? pageAdapter.actions : [];
  const mutation = mutationPolicy(item.definition, pageAdapter.forms);
  const finalStateGate = {
    actionId: FINAL_STATE_GATE_ID,
    kind: "cdp.readCurrentPageState",
    requiredBefore: "SUCCESS",
    requiredFields: ["url", "title", "h1OrTargetObjectText"],
    assertions: [
      "A login or sign-in page is never a successful final state unless the task explicitly requests authentication.",
      "The current URL must match the selected candidate URL for NAVIGATE tasks.",
      "The current page title or target object text must prove the requested object identity.",
      "RETRIEVE answers must be supported by the current page state or an accepted evidence ledger.",
      "If the answer is numeric or aggregated, an evidence ledger must identify every selected detail row and reproduce the answer with the declared amount field and filters.",
      "If the spoken candidate and current URL disagree, navigate to the candidate and rerun this gate.",
    ],
  };
  const contractItem = { ...item, siteKeys: [siteKey], origin };
  return {
    workflow: item.definition.id,
    title: item.definition.title,
    siteKeys: [siteKey],
    origin,
    skillFile: `runtime-skills/${item.definition.id}/SKILL.md`,
    intentPattern: item.definition.task.source,
    enforcement: {
      mode: "runtime",
      policy:
        "Runtime must enforce this JSON contract; Markdown handbook text is explanatory only.",
    },
    allowedActions: [
      ...(listAction ? [listAction.actionId] : []),
      ...adapterActions.filter((a) => a.actionId !== listAction?.actionId).map((a) => a.actionId),
      FINAL_STATE_GATE_ID,
    ],
    forbiddenActions: listAction
      ? [
          {
            kind: "browser.evaluate",
            when: "extracting product-list cards",
            reason: "Use read_current_list_page_v1 exactly once per pageId.",
          },
          {
            kind: "incremental-card-observation",
            when: "product-list selectors are available",
            reason: "List pages must be read atomically to prevent drift and repeated observation.",
          },
        ]
      : [],
    budgets: workflowBudgets(item.definition, Boolean(listAction)),
    ...(item.definition.preflightGuards?.length
      ? { preflightGuards: item.definition.preflightGuards }
      : {}),
    ...(mutation ? { mutation } : {}),
    actions: adapterActions.length ? adapterActions : listAction ? [listAction] : [],
    finalStateGate,
    answerEvidenceGate: mutation
      ? { requiredBefore: "SUCCESS", mode: "not_applicable" }
      : {
          requiredBefore: "SUCCESS",
          mode: "verifyAnswerEvidence",
          enforcement: "observe",
          requiredFields: ["answer", "evidenceRecordIds", "filters", "amountField", "ledger"],
          failureAction: "reject_success_or_fallback",
        },
    ir: workflowIR(contractItem, pageAdapter, listAction, mutation, finalStateGate),
  };
}

function runtimeContract(executionContract) {
  const ir = executionContract.ir || {};
  const action = (executionContract.actions || []).find(
    (item) => item.kind === "browser.evaluate",
  );
  return {
    workflow: executionContract.workflow,
    routeHints: ir.page?.routeHints || [],
    target: ir.target || {},
    ...(ir.selectionContract ? { selectionContract: ir.selectionContract } : {}),
    allowedActions: executionContract.allowedActions || [],
    stopConditions: [
      "target identity and desired state verified",
      "required evidence unavailable: stop without SUCCESS",
    ],
    answerEvidenceGate: executionContract.answerEvidenceGate || {
      requiredBefore: "SUCCESS",
      mode: "verifyAnswerEvidence",
      failureAction: "reject_success_or_fallback",
    },
    ...(action
      ? {
          contractAction: {
            tool: "localweb_contract_action",
            actionId: action.actionId,
            route: executionContract.siteKeys?.[0],
            contractPath: `webarena-${executionContract.siteKeys?.[0]}/references/execution-contract.json`,
            requiredFirstStep: true,
            call: "到达目标列表页后的第一个读取动作必须调用该 tool；page_id 使用当前 URL；不要调用 browser_evaluate 代替。返回 evidence 后才能继续下一页或选择目标。",
          },
        }
      : {}),
  };
}

function executionContractMarkdownLink(workflowId) {
  return `../../references/execution-contract.json#workflows-${workflowId}`;
}

function stateVariables(definition) {
  if (Array.isArray(definition.stateVars) && definition.stateVars.length) {
    return definition.stateVars;
  }
  if (definition.id === "product-selection") {
    return [
      "`comparator`：任务要求的比较字段、方向和并列规则",
      "`hard_constraints`：产品类型、属性、兼容性等不可放宽条件",
      "`visited_page_ids`：已处理列表页 URL 集合",
      "`seen_product_urls`：已读取商品 URL 集合",
      "`accepted_candidates`：同时通过产品类型与任务约束谓词的候选及比较证据",
      "`next_href`：唯一待访问的下一页；无下一页时为 `null`",
    ];
  }
  if (definition.id === "catalog-aggregation") {
    return [
      "`visited_page_ids`：已处理列表页 URL 集合",
      "`reported_total`：页面声明的结果总数",
      "`seen_product_urls`：已读取商品 URL 集合",
      "`accepted_candidates`：通过产品类型和品牌验收的去重候选",
      "`next_href`：唯一待访问的下一页；无下一页时为 `null`",
    ];
  }
  if (definition.id === "order-aggregation" || definition.id === "order-lookup") {
    return [
      "`target_period`：时间范围或顺序要求",
      "`target_status`：任务要求的订单状态",
      "`visited_page_ids`：已处理订单页 URL 集合",
      "`seen_record_ids`：已读取订单号集合",
      "`accepted_records`：满足时间与状态条件的订单台账",
      "`next_href`：唯一待访问的下一页；无下一页时为 `null`",
    ];
  }
  return [
    "`goal`：任务要求的最终页面状态或数据",
    "`hard_constraints`：不可放宽的显式条件",
    "`visited_page_ids`：已处理页面 URL 集合",
    "`accepted_evidence`：支持完成结论的页面证据",
    "`next_action`：当前唯一动作；完成或无法安全推进时为 `null`",
  ];
}

function runtimeSkillMarkdown(item, siteName, origin, routeHints, minimalRuntime = false) {
  const { definition, modelContext, locators } = item;
  const pageAdapter = pageAdapterFor(item);
  if (minimalRuntime) {
    const executionContract = workflowExecutionContract(
      { ...item, siteKeys: item.siteKeys || [] },
      origin,
      item.siteKeys?.[0] || slugForSkill(siteName),
    );
    const action = executionContract.actions.find((entry) => entry.kind === "browser.evaluate");
    const targetRoute = definition.id.startsWith("order-") ? "/sales/order/history/" : null;
    const lines = [
      "---",
      `name: ${slugForSkill(siteName)}-${definition.id}`,
      "description: Evidence-backed minimal runtime contract.",
      "---",
      "",
      `workflow: ${definition.id}`,
      `site: ${origin}`,
      `target: ${executionContract.ir.target.entity}/${executionContract.ir.target.desiredState}`,
      "",
      "- Preserve only constraints explicitly present in the task.",
      targetRoute ? `- If authentication is required, sign in with configured credentials, then navigate to \`${targetRoute}\`.` : "- Navigate only through the verified route for this workflow.",
    ];
    if (action) {
      lines.push(
        `- On each target page, call \`localweb_contract_action\` once: action_id=\`${action.actionId}\`, route=\`${executionContract.siteKeys[0]}\`, contract_path=\`webarena-${executionContract.siteKeys[0]}/references/execution-contract.json\`, page_id=current URL.`,
        "- Use only its verified evidence; do not re-extract the list with snapshot or evaluate. Follow nextHref only while task constraints still need evidence.",
      );
    }
    if (executionContract.ir.selectionContract) {
      lines.push(
        `- Selection contract: ${JSON.stringify(executionContract.ir.selectionContract)}`,
        "- Open matching order details and apply the exact date, primary product category, status, and amount-field rules before aggregating; do not sum the whole order subtotal when unrelated items are present.",
      );
    }
    lines.push(
      "- Before SUCCESS, read final URL/title and ensure the answer is supported by verified evidence. If evidence is incomplete, fall back to ordinary browser reasoning rather than guessing.",
      "",
    );
    return lines.join("\n");
  }
  const compactReadWorkflow =
    !isMutatingWorkflow(definition) &&
    !["catalog-aggregation", "order-aggregation", "order-lookup", "product-selection"].includes(
      definition.id,
    );
  const listReadTemplate = batchReadTemplate(pageAdapter.structures);
  const lines = [
    "---",
    `name: ${slugForSkill(siteName)}-${definition.id}`,
    `description: ${siteName} 的${definition.title}工作流。`,
    "---",
    "",
    RUNTIME_BASE.trim(),
    "",
    `# ${definition.title}`,
    "",
    `站点：\`${origin}\``,
    `机器契约：\`${executionContractMarkdownLink(definition.id)}\``,
    "",
    "## 前置条件",
    "",
    "- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。",
    "- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。",
    "",
    "## 状态变量",
    "",
  ];
  stateVariables(definition).forEach((variable) => lines.push(`- ${variable}`));
  if (listReadTemplate) {
    lines.push(
      "",
      "## 硬执行契约",
      "",
      "- `read_current_list_page_v1` 是当前商品列表页唯一允许的列表读取动作。",
      "- 对每个页面身份只调用一次 evaluate，并完整执行下方模板；不得先用 snapshot/find 逐卡观察，也不得把模板拆成多个 evaluate。",
      "- 只有返回 `ok: true` 才能更新台账并沿 `nextHref` 前进；返回 `ok: false` 时记录 `errors`，重新定位页面结构，不得猜测字段或重复读取同一页面身份。",
      "- `complete: true` 只证明当前页面没有可用 Next；集合完成还必须满足工作流的总数与去重台账条件。",
    );
    if (definition.id === "catalog-aggregation") {
      lines.push(
        "- 首次成功批量读取后冻结该搜索结果集；品牌与产品类型直接在返回的 `items` 上验收，不得为了寻找侧栏品牌筛选器而切换到宽泛分类页。",
        "- 只有冻结结果集中零个候选满足产品类型时才能使用一次补充查询；不能因为候选不够多而改写查询或并行探索分类页。",
        "- 最多读取 12 个分页；超过上限仍无法证明候选集合完整时，停止并返回 NOT_FOUND_ERROR，不得继续循环消耗步骤。",
      );
    }
    if (definition.id === "product-selection") {
      lines.push(
        "- 价格升序已验证时按顺序验收；一旦出现验收通过的候选，补充查询预算立即归零，必须打开该候选、执行最终状态闸门并结束。",
        "- 只有主查询中零个候选满足产品类型时才允许一次补充查询；不得在已找到合格候选后继续搜索同义词。",
      );
    }
  }
  if (isMutatingWorkflow(definition)) {
    lines.push(
      "",
      "## 写操作执行契约",
      "",
      "- 按机器契约中的 phases 顺序执行；任何阶段失败都只能重新读取当前状态后恢复，不能跳阶段或改写任务值。",
      "- 从当前 DOM 读取 form action、目标对象身份和字段；每个字段与任务原文完全一致后才允许提交，提交/投票/订阅动作最多一次。",
      "- 若机器契约声明 requiredNetworkEvents，写操作完成必须有匹配的非登录 POST 事件；仅靠页面看起来正确不能声明 SUCCESS。",
      "- 提交后立即读取当前页面或目标对象，核对 URL、标题/文本、状态标记或响应确认；缺少该证据时保持未完成。",
      "- 复合任务必须逐阶段验证；创建后再评论/回复时，先确认新对象身份，再定位该对象的评论表单。",
    );
    if (pageAdapter.forms?.length) {
      lines.push("", "## 已验证表单动作", "");
      pageAdapter.forms.forEach((form) => {
        lines.push(
          `- 页面 \`${form.pageUrl}\`：${form.method.toUpperCase()} \`${form.action || "(current URL)"}\`，表单 \`${form.selector || "(unresolved)"}\``,
          `  字段：${form.fields.map((field) => `${field.name || field.label || "?"}(${field.type || "text"})`).join("、") || "未识别"}`,
          `  提交：${form.submitButtons.map((button) => button.name || button.selector || "?").join("、") || "未识别"}；证据=${form.evidence}；提交后=${form.postcondition}`,
        );
        if (form.requiredNetworkEvent) {
          lines.push(
            `  必须出现网络事件：${form.requiredNetworkEvent.method || "POST"} \`${form.requiredNetworkEvent.urlPattern || form.requiredNetworkEvent.url || "未指定"}\``,
          );
        }
        if (form.repeatability) {
          lines.push(`  可重复测试：${form.repeatability}`);
        }
      });
    }
  }
  if (!compactReadWorkflow && pageAdapter.visualAnchors?.length) {
    lines.push(
      "",
      "## 视觉备用锚点",
      "",
      "- DOM/role selector 是主路径；仅当目标控件无稳定 selector 或多个控件歧义时，才查看对应 annotated screenshot 的区域。视觉确认后必须重新读取 DOM，再执行动作。",
    );
    pageAdapter.visualAnchors.slice(0, 6).forEach((anchor) =>
      lines.push(
        `- \`${anchor.pageUrl}\`：${anchor.role}「${anchor.name || "无文字控件"}」${anchor.context ? `（${anchor.context}）` : ""}；截图 \`${anchor.screenshot}\`，区域 ${JSON.stringify(anchor.box)}`,
      ),
    );
  }
  lines.push("", "## 循环动作", "");
  definition.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  if (definition.checks?.length) {
    lines.push("", "## 停止条件与必检项", "");
    definition.checks.forEach((item) => lines.push(`- ${item}`));
    lines.push(
      "- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。",
    );
  }
  if (routeHints.length) {
    lines.push(
      "",
      "## 已观察到的分类路径",
      "",
      "这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。",
      "",
    );
    routeHints.forEach((item) =>
      lines.push(`- ${item.label}：\`${item.path}\``),
    );
  }
  if (pageAdapter.structures.length) {
    lines.push(
      "",
      "## 已验证批量读取结构",
      "",
      "这些 selector 来自已抓取页面；先在实时页面确认存在，再在一次 evaluate 中按卡片作用域提取字段。",
      "",
    );
    pageAdapter.structures.forEach((structure) =>
      lines.push(structureMarkdown(structure)),
    );
    if (listReadTemplate) {
      lines.push(
        "",
        "## 单次读取模板",
        "",
        "在当前列表页执行一次；把返回的 `pageId` 加入已访问集合，只沿 `nextHref` 前进。**必须原样执行此模板，不得修改字段名或省略 `pageId`/`actionId` 等任何字段。**",
        "",
        "```js",
        listReadTemplate,
        "```",
      );
    }
  }
  const modelLocators = modelContext.locators.slice(0, compactReadWorkflow ? 2 : 4);
  if (modelLocators.length) {
    lines.push("", "## 已验证结构", "");
    modelLocators.forEach((item) =>
      lines.push(`- \`${item.id}\`：\`${item.selector}\`（${item.scope}）`),
    );
  } else if (locators.length) {
    lines.push("", "## 操作锚点", "");
    locators.slice(0, 3).forEach((item) =>
      lines.push(`- ${item.label}：\`${item.locator}\`（confidence=${item.confidence}，evidence=${item.evidence.join(",") || "none"}）`),
    );
  }
  lines.push(
    "",
    "## 最终状态闸门",
    "",
    "- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。",
    "- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。",
    "",
    "## 完成证明",
    "",
  );
  definition.success.forEach((item) => lines.push(`- ${item}`));
  lines.push(
    "",
    "## 失败恢复",
    "",
    "- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。",
    "- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。",
    "",
    `风险：${definition.risk}`,
    "",
  );
  return `${lines.join("\n")}\n`;
}

function slugForSkill(value) {
  return String(value || "site")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function relevantPagesFor(workflow, pages) {
  return pages
    .map((page) => {
      const directMatches = (page.actions || []).filter((action) =>
        workflow.evidence.test(directActionHaystack(action)),
      ).length;
      const identityMatch = workflow.evidence.test(pageIdentity(page));
      const coverageMatch = workflow.coverage?.test(pageIdentity(page));
      return {
        page,
        score: directMatches + (identityMatch ? 20 : 0),
        qualified: Boolean(
          identityMatch ||
            coverageMatch ||
            (workflow.kind === "core" && directMatches >= 2),
        ),
      };
    })
    .filter((item) => item.qualified)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.page);
}

function workflowMarkdown(
  workflow,
  pages,
  locators,
  covered,
  origin,
  modelContext,
) {
  const relevantPages = relevantPagesFor(workflow, pages);
  const lines = [
    `# ${workflow.title}`,
    "",
    `适用线索：${workflow.keywords}`,
    "",
    `证据状态：${
      covered
        ? "已找到关键步骤的页面与 locator 证据"
        : locators.length
          ? "只有入口或邻近控件证据，关键步骤仍有缺口"
          : "当前快照缺少可复用 locator"
    }`,
    "",
  ];
  lines.push("## 推荐流程", "");
  workflow.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  if (workflow.checks?.length) {
    lines.push("", "## 执行检查", "");
    workflow.checks.forEach((item) => lines.push(`- ${item}`));
  }
  if (
    modelContext.objects.length ||
    modelContext.capabilities.length ||
    modelContext.surfaces.length ||
    modelContext.actions.length
  ) {
    lines.push("", "## 站点模型约束", "");
    modelContext.objects.forEach((item) =>
      lines.push(
        `- 业务对象 \`${item.id}\`：字段 \`${item.fields.join("、")}\`。`,
      ),
    );
    modelContext.capabilities.forEach((item) =>
      lines.push(
        `- 业务能力 \`${item.id}\`：输入 \`${item.inputs.join("、") || "无"}\`；输出 \`${item.outputs.join("、") || "无"}\`${
          item.contexts.length
            ? `；依赖上下文 \`${item.contexts.join("、")}\``
            : ""
        }。`,
      ),
    );
    modelContext.surfaces.forEach((item) =>
      lines.push(
        `- 页面状态 \`${item.id}\`：URL \`${item.urlPattern}\`；必须同时观察字段 \`${item.requiredFields.join("、") || "无"}\`。`,
      ),
    );
    modelContext.actions.forEach((item) => {
      lines.push(
        `- 动作 \`${item.id}\`：从当前快照重新解析 \`${item.targetLocator || "目标控件"}\`，操作后重新验证页面状态与对象身份。`,
      );
    });
  }
  lines.push("", "## 成功判据", "");
  workflow.success.forEach((item) => lines.push(`- ${item}`));
  lines.push("", "## 已验证入口", "");
  if (relevantPages.length) {
    for (const page of relevantPages) {
      lines.push(
        `- ${clip(page.title || page.url, 80)}：\`${relativeUrl(page.url, origin)}\`；[页面快照](../../snapshots/pages/${page.slug}.json)`,
      );
    }
  } else {
    lines.push("- 当前抓取范围没有覆盖该流程；先用页面语义探索，不要臆造 selector。");
  }
  lines.push("", "## 操作锚点", "");
  if (locators.length) {
    for (const item of locators) {
      lines.push(
        `- ${item.label}：\`${item.locator}\`；证据：\`${item.page}.json\``,
      );
    }
  } else {
    lines.push(
      "- 本流程没有足够证据。需要时只读取相关页面快照；仍失败再检索 `../../snapshots/selectors.json`。",
    );
  }
  if (modelContext.locators.length) {
    lines.push("", "## 模型定位证据", "");
    lines.push(
      "- 下列 selector 用于缩小实时快照范围或核验结构；点击时仍使用当前快照返回的元素引用。",
    );
    for (const item of modelContext.locators) {
      lines.push(
        `- \`${item.id}\`：\`${item.selector}\`；作用域 \`${item.scope}\`；${item.status}`,
      );
    }
  }
  lines.push(
    "",
    "## 风险与恢复",
    "",
    `- ${workflow.risk}`,
    "- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。",
    "- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function handbookMarkdown(
  siteName,
  origin,
  workflows,
  coverageTaskCount,
  focusTaskCount,
  typeCounts,
) {
  const lines = [
    `# ${siteName} 任务手册`,
    "",
    `站点：\`${origin}\``,
    "",
    `覆盖语料：${coverageTaskCount} 条${
      coverageTaskCount
        ? `（${Object.entries(typeCounts)
            .map(([type, count]) => `${type} ${count}`)
            .join("、")}）`
        : "（未提供任务集，以下路由仅来自页面证据）"
    }`,
    `本轮重点任务：${focusTaskCount} 条。重点任务只影响抓取优先级和路径提示，不删除覆盖语料中的工作流。`,
    "",
    "## 使用方法",
    "",
    "1. 根据任务目标在下表选择一个工作流。",
    "2. 本轮只读取该工作流文件，不要预载其他工作流或全量 selector。",
    "3. 工作流失败时先读取其中链接的单页快照；最后才按关键词检索 `../snapshots/selectors.json`。",
    "",
    "## 工作流路由",
    "",
    "| 任务线索 | 工作流 | 覆盖 / 重点 | 页面证据 |",
    "|---|---|---:|---|",
  ];
  for (const item of workflows) {
    lines.push(
      `| ${item.definition.keywords} | [${item.definition.title}](workflows/${item.definition.id}.md) | ${item.tasks.length} / ${item.focusTasks.length} | ${item.covered ? "关键步骤有" : item.locators.length ? "仅入口" : "缺少"} |`,
    );
  }
  const gaps = workflows.filter((item) => item.tasks.length && !item.covered);
  lines.push("", "## 覆盖缺口", "");
  if (gaps.length) {
    for (const item of gaps) {
      lines.push(
        `- ${item.definition.title}：有 ${item.tasks.length} 条任务，但当前抓取尚未覆盖关键步骤。`,
      );
    }
  } else {
    lines.push("- 当前任务工作流均有至少一条页面 locator 证据。");
  }
  return `${lines.join("\n")}\n`;
}

function siteSkillMarkdown(skillName, siteName, origin) {
  return `---
name: ${skillName}
description: 使用任务工作流和按需加载的页面证据操作 ${origin} 上的 ${siteName}。适用于该站点的导航、检索和写入任务；先路由到一个工作流，失败后再按层级检索 selector。
---

# ${siteName}

1. 先从任务目标判断操作类型，再读取 [任务手册](references/handbook.md)。
2. 每轮只打开任务手册指向的一个工作流文件，并按其中步骤、成功判据和风险约束执行。
3. 优先使用工作流中的操作锚点；模型 selector 只用于缩小实时快照或核验结构，点击时使用当前快照引用。
4. locator 失败时，只读取工作流列出的单页快照。
5. 单页快照仍不足时，才按目标名称或角色检索 \`snapshots/selectors.json\`；不要整体载入。
6. 标注截图仅用于理解布局或恢复页面变化，存在 DOM locator 时不要点击坐标。
7. 下单、删除、提交资料等有副作用的操作，必须符合任务授权并在执行前核对目标。
`;
}

export async function loadTaskCorpus(file, siteKey) {
  if (!file) return [];
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.tasks || [];
  const selected = siteKey ? rows.filter((task) => {
    const sites = task.sites || task.site || [];
    return Array.isArray(sites) ? sites.includes(siteKey) : sites === siteKey;
  }) : rows;
  return selected.map((task) => ({
    task_id: task.task_id ?? task.id,
    sites: task.sites || (task.site ? [task.site] : []),
    start_urls: task.start_urls || task.startUrls || [],
    intent: task.intent || task.task || task.description || task.name || "",
    ...(task.task_type ? { task_type: task.task_type } : {}),
  }));
}

export function taskSeedUrls(tasks, origin, siteKey) {
  const token = siteKey
    ? `__${siteKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}__`
    : null;
  const counts = new Map();
  for (const task of tasks) {
    for (const raw of task.start_urls || task.startUrls || []) {
      let value = raw;
      if (token && value.startsWith(token)) {
        value = `${origin}${value.slice(token.length) || "/"}`;
      }
      if (/^__[A-Z0-9_]+__/.test(value)) continue;
      try {
        const url = new URL(value, origin);
        url.hash = "";
        if (url.origin === origin) {
          counts.set(url.href, (counts.get(url.href) || 0) + 1);
        }
      } catch {
        // 忽略无法解析的任务入口。
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);
}

export function buildWorkflowHandbook({
  siteName,
  skillName,
  origin,
  siteKey = null,
  pages,
  tasks = null,
  coverageTasks = tasks || [],
  focusTasks = tasks || coverageTasks,
  contextModel = null,
  workflowDefs = WORKFLOWS,
  evidenceOnly = false,
}) {
  const coverageGrouped = new Map(
    workflowDefs.map((workflow) => [workflow.id, []]),
  );
  const focusGrouped = new Map(workflowDefs.map((workflow) => [workflow.id, []]));
  for (const task of coverageTasks) {
    coverageGrouped.get(classifyTask(task, workflowDefs).id).push(task);
  }
  for (const task of focusTasks) focusGrouped.get(classifyTask(task, workflowDefs).id).push(task);
  const typeCounts = {};
  for (const task of coverageTasks) {
    const type = taskType(task);
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  const workflows = workflowDefs.map((definition) => {
    const workflowTasks = coverageGrouped.get(definition.id);
    const workflowFocusTasks = focusGrouped.get(definition.id);
    const locators = rankLocators(definition, pages, origin);
    const covered =
      (definition.id === "navigation" && pages.length > 0) ||
      (definition.coverage &&
        pages.some((page) =>
          definition.coverage.test(
            definition.coverageScope === "full"
              ? pageHaystack(page)
              : pageIdentity(page),
          ),
        ));
    const modelContext = contextForWorkflow(
      contextModel,
      definition.modelTerms || [],
    );
    const pageAdapter = {
      structures: observedStructures(definition, pages),
      forms: observedForms(definition, pages),
      visualAnchors: observedVisualAnchors(definition, pages),
    };
    const routeHints = supportsRouteHints(definition.id)
      ? taskDrivenRouteHints(workflowFocusTasks, pages, origin)
      : [];
    return {
      definition,
      siteKeys: siteKey ? [siteKey] : [],
      tasks: workflowTasks,
      focusTasks: workflowFocusTasks,
      locators,
      modelContext,
      pageAdapter,
      // Compatibility aliases for callers that inspect the in-memory result.
      structures: pageAdapter.structures,
      forms: pageAdapter.forms,
      visualAnchors: pageAdapter.visualAnchors,
      routeHints,
      covered: Boolean(
        covered ||
          modelContext.surfaces.length ||
          modelContext.actions.length ||
          modelContext.locators.length,
      ),
    };
  }).filter(
    (item) => {
      if (evidenceOnly) {
        return hasWorkflowCapabilityEvidence(item.definition, item.modelContext);
      }
      if (item.definition.fallback || item.definition.kind === "core") {
        return true;
      }
      if (coverageTasks.length) return item.tasks.length > 0;
      return (
        (item.locators.length > 0 || item.modelContext.locators.length > 0) &&
        item.covered
      );
    },
  );
  const files = Object.fromEntries(
    workflows.map((item) => [
      `${item.definition.id}.md`,
      workflowMarkdown(
        item.definition,
        pages,
        item.locators,
        item.covered,
        origin,
        item.modelContext,
      ),
    ]),
  );
  const runtimeSkills = Object.fromEntries(
    workflows.map((item) => [
      `${item.definition.id}/SKILL.md`,
      runtimeSkillMarkdown(
        item,
        siteName,
        origin,
        item.routeHints,
        evidenceOnly,
      ),
    ]),
  );
  const sequenceDefs = workflowDefs.flatMap((definition) =>
    (definition.sequences || []).map((sequence) => ({
      ...sequence,
      siteKey: siteKey || slugForSkill(siteName),
      origin,
    })),
  );
  const router = {
    schema_version: 2,
    routing_mode: "capability_signature_v2",
    requirements_schema: {
      entity: "string|null",
      operation: ["lookup", "read", "aggregate", "mutate"],
      selection: "{field,operator,value?}[]",
      outputs: "{field,type}[]",
      amount_semantics: "object|null",
      requires_detail: "boolean",
      unknown_requirements: "string[]",
    },
    fallback_route: workflows.find((item) => item.definition.fallback)?.definition.id || "other",
    router: `${skillName}-router`,
    site: {
      key: siteKey || slugForSkill(siteName),
      name: siteName,
      origin,
    },
    routes: workflows.map((item, index) => ({
      site_keys: [siteKey || slugForSkill(siteName)],
      origin_pattern: `^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`,
      route: item.definition.id,
      priority: index,
      backoff: Boolean(item.definition.backoff),
      fallback: Boolean(item.definition.fallback),
      intent_pattern: item.definition.task.source,
      skill_file: `runtime-skills/${item.definition.id}/SKILL.md`,
      runtime_contract_file: `runtime-contracts/${item.definition.id}.json`,
      runtime_mode: item.definition.runtimeMode || "workflow_skill",
      contract_file: "references/execution-contract.json",
      contract_workflow: item.definition.id,
      reason: item.definition.title,
      capability_signature: item.definition.capabilitySignature || null,
    })),
    capabilities: workflows
      .filter((item) => item.definition.capabilitySignature)
      .map((item, index) => ({
        route: item.definition.id,
        priority: 100 - index,
        fallback: false,
        signature: item.definition.capabilitySignature,
      })),
    sequences: sequenceDefs.map((sequence, index) => ({
      site_keys: [sequence.siteKey],
      origin_pattern: `^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`,
      route: sequence.id,
      priority: index,
      intent_pattern: sequence.task.source,
      workflows: sequence.workflows,
      skill_files: sequence.workflows.map((workflow) =>
        `runtime-skills/${workflow}/SKILL.md`,
      ),
      contract_file: "references/execution-contract.json",
      contract_workflows: sequence.workflows,
      reason: sequence.title,
    })),
  };
  const contractSiteKey = siteKey || slugForSkill(siteName);
  const executionContract = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    site: {
      key: contractSiteKey,
      name: siteName,
      origin,
    },
    router: router.router,
    workflows: Object.fromEntries(
      workflows.map((item) => [
        item.definition.id,
        workflowExecutionContract(item, origin, contractSiteKey),
      ]),
    ),
    sequences: Object.fromEntries(
      sequenceDefs.map((sequence) => [
        sequence.id,
        {
          workflow: sequence.id,
          title: sequence.title,
          siteKeys: [sequence.siteKey],
          origin: sequence.origin,
          stages: sequence.workflows.map((workflow) =>
            (() => {
              const stage = workflows.find((item) => item.definition.id === workflow);
              return stage
                ? workflowExecutionContract(stage, origin, contractSiteKey)
                : { workflow, unavailable: true };
            })(),
          ),
        },
      ]),
    ),
  };
  const runtimeContracts = Object.fromEntries(
    Object.entries(executionContract.workflows).map(([workflow, contract]) => [
      `${workflow}.json`,
      runtimeContract(contract),
    ]),
  );
  const coverage = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    siteName,
    origin,
    taskCount: coverageTasks.length,
    coverageTaskCount: coverageTasks.length,
    focusTaskCount: focusTasks.length,
    taskTypes: typeCounts,
    contextModel: contextModel
      ? {
          source: contextModel.source,
          objects: contextModel.objects.length,
          contexts: contextModel.contexts.length,
          capabilities: contextModel.capabilities.length,
          surfaces: contextModel.surfaces.length,
          actions: contextModel.actions.length,
          locators: contextModel.locators.length,
        }
      : null,
    selectorSelection: {
      actionsCaptured: pages.reduce(
        (sum, page) => sum + (page.actions || []).length,
        0,
      ),
      ambiguousActionsExcluded: pages.reduce(
        (sum, page) => sum + (page.unresolvedActionCount || 0),
        0,
      ),
      workflowTemplates: workflows.reduce(
        (sum, item) => sum + item.locators.length,
        0,
      ),
      primaryKinds: pages
        .flatMap((page) => page.actions || [])
        .reduce((counts, action) => {
          const kind = action.primary?.kind || "unknown";
          counts[kind] = (counts[kind] || 0) + 1;
          return counts;
        }, {}),
      brittleCssExcluded: pages
        .flatMap((page) => page.actions || [])
        .filter(
          (action) =>
            action.primary?.kind === "css" &&
            action.primary.selector?.includes(":nth-of-type("),
        ).length,
    },
    routerSemantics: {
      mode: "capability_signature_v2",
      parsedRequirementExamples: focusTasks.slice(0, 20).map((task) => ({
        taskId: task.task_id ?? task.id ?? null,
        requirements: parseTaskRequirements(task.intent || task.task || ""),
      })),
    },
    workflows: workflows.map((item) => ({
      id: item.definition.id,
      title: item.definition.title,
      taskCount: item.tasks.length,
      focusTaskCount: item.focusTasks.length,
      taskIds: item.tasks.map((task) => task.task_id ?? task.id).filter(Boolean),
      locatorTemplates: item.locators.length,
      evidencePages: [
        ...new Set(item.locators.map((locator) => locator.page)),
      ],
      covered: item.covered,
      contextRules:
        item.modelContext.objects.length +
        item.modelContext.capabilities.length +
        item.modelContext.surfaces.length +
        item.modelContext.actions.length,
      contextLocators: item.modelContext.locators.length,
      observedStructures: pageAdapterFor(item).structures.length,
      contractActions:
        executionContract.workflows[item.definition.id]?.actions.length || 0,
      routeHints: item.routeHints.length,
    })),
  };
  return {
    skill: siteSkillMarkdown(skillName, siteName, origin),
    handbook: handbookMarkdown(
      siteName,
      origin,
      workflows,
      coverageTasks.length,
      focusTasks.length,
      typeCounts,
    ),
    workflows: files,
    runtimeSkills,
    runtimeContracts,
    router,
    executionContract,
    contextModel: contextModelMarkdown(contextModel),
    coverage,
  };
}
