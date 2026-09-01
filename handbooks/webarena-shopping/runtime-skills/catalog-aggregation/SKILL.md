---
name: webarena-shopping-catalog-aggregation
description: webarena-shopping 的商品集合、名称与价格聚合工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。
- 最终响应服从任务给出的 expected status：若为 `NOT_FOUND_ERROR`，`retrieved_data` 必须是 JSON `null`，不能返回 `[]`、`[0]` 或 `[0.0]`。

# 商品集合、名称与价格聚合

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-catalog-aggregation`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `query_ledger`：记录本任务选择的证明策略；边界证明保存升序/降序类别 URL 与边界候选，完整集合保存主查询、同义词查询、分页闭合状态和命中数量
- `visited_page_ids`：已处理列表页 URL 集合
- `reported_total`：页面声明的结果总数
- `seen_product_urls`：已读取商品 URL 集合
- `accepted_candidates`：通过产品类型和品牌验收的去重候选
- `next_href`：唯一待访问的下一页；无下一页时为 `null`

## 硬执行契约

- `read_current_list_page_v1` 是当前商品列表页唯一允许的列表读取动作。
- 对每个页面身份只调用一次 evaluate，并完整执行下方模板；不得先用 snapshot/find 逐卡观察，也不得把模板拆成多个 evaluate。
- 只有返回 `ok: true` 才能更新台账并沿 `nextHref` 前进；返回 `ok: false` 时记录 `errors`，重新定位页面结构，不得猜测字段或重复读取同一页面身份。
- `complete: true` 只证明当前页面没有可用 Next；集合完成还必须满足工作流的总数与去重台账条件。
- 强制先按输出分流：只有 `min/max` 时执行 `CATEGORY_ASC_BOUNDARY → CATEGORY_DESC_BOUNDARY → SUBMIT_EVIDENCE_LEDGER`；要求完整名称/型号时执行 `BRAND_SEARCH → EXACT_PRODUCT_CATEGORY_FACET → MAX_PAGE_SIZE → READ_FILTERED_COLLECTION → VERIFY_AMBIGUOUS_CANDIDATES → SUBMIT_EVIDENCE_LEDGER`。
- `min/max` 分支从已观察到的分类路径中选择语义最精确的一条，直接构造带 `product_list_limit=<最大值>&product_list_order=price&product_list_dir=asc|desc` 的两个 URL。按排序从第一页开始，每个方向的第一个合格候选就是该边界；不得先跑宽泛站内搜索。
- 完整列表分支只用任务中的品牌做普通搜索，随后立即应用与任务产品类型完全匹配的分类 facet；不得读取或分页未加分类的品牌结果，也不得把品牌、属性、产品类型拼成普通多词查询（该站点会按 OR 扩张结果）。
- 品牌搜索中若向下选择三次分类 facet 后仍没有产品类型的精确 facet，立即停止 facet/菜单探索；只允许一次 `品牌 + 核心产品词` 的直接查询。该结果无法装入页面观察到的最大分页量时停止，不得分页宽集合或继续改写查询。
- 分类 facet 生效后，在第一次机器读取前把分页量设为页面已观察到的最大值；若 toolbar 总数仍大于该值，停止并返回 NOT_FOUND_ERROR，不得跨页猜测集合边界。
- 到达每个规范列表 URL 后的第一个读取动作必须是 `localweb_contract_action`；不得插入菜单枚举、自定义列表 evaluate，或重复操作排序/分页量下拉框。
- 品牌与产品类型直接在返回的 `items` 上验收；每个入选标题必须同时满足任务中的品牌和产品类型词，不能只满足其中一个。标题缺少任务中的精确属性词时才打开详情，并且必须找到该属性词的明确证据才能入选。`wireless` 不能替代 `Bluetooth`，找不到 Bluetooth 证据就拒绝候选。
- `names` 必须逐字符使用列表页返回的 `item.name`，不得手工改写、补全或修正标点；最终数组只能来自 `accepted_candidates`，不能混入未通过全部硬约束的搜索结果。
- 同一规范 URL 只允许一次列表读取；禁止枚举导航菜单，禁止自定义 browser evaluate 抽取分类或商品卡片。最多读取 12 个分页；超过上限仍无法证明候选集合完整时，停止并返回 NOT_FOUND_ERROR，不得继续循环消耗步骤。

## 答案证据提交

- 最终回答前必须调用一次 `localweb_contract_action`：`action_id=submit_answer_evidence_v1`、`workflow=catalog-aggregation`、`route=shopping`、`contract_path=webarena-shopping/references/execution-contract.json`、`page_id=当前 URL`，并通过 `evidence_ledger` 参数提交台账。
- `evidence_ledger.evidenceStatus` 仅在所有查询/分页或排序边界证明完成、候选验收完成且结果可由同一台账重算时写 `verified`；同时包含 `result`、非空 `evidenceRecordIds`、实际 `filters` 和含页面来源的 `ledger`。否则不得调用提交动作或声明 SUCCESS。
- 参数形状固定为 `evidence_ledger={"evidenceStatus":"verified","result":<与最终答案相同的值或对象>,"evidenceRecordIds":["记录ID"],"filters":{"字段":"实际条件"},"ledger":{"records":[{"recordId":"记录ID","pageId":"来源URL","value":"证据值"}]}}`；`filters` 和 `ledger` 必须是对象，不能写成字符串或数组。
- 提交动作返回 `evidenceLedger` 后，最终 JSON 只保留 benchmark 要求的字段；不要把审计台账塞进 `retrieved_data` 或增加任务未要求的答案字段。

## 循环动作

1. 先按输出选择证明策略：只有 min/max 的价格范围任务使用精确类别内的升序/降序边界证明；要求完整名称或型号集合时使用 Advanced Search 的 Name 高精度集合并闭合分页。
2. 边界证明分别构造价格升序与降序的规范类别 URL，直接带最大 `product_list_limit` 和排序参数；每页批量读取后按顺序选择第一个满足产品类型、品牌和其他硬约束的候选。
3. 完整集合证明把页面显示数量调到最大，记录总结果数和当前页身份；按 Next 逐页去重，只有没有 Next 或已覆盖总结果数时才停止。
4. 完整集合若无法从主查询证明语义召回闭合，可执行一次产品类型的直接同义词 Name 查询；两次查询分别闭合分页后按商品 URL 合并去重。
5. 先用列表标题筛选主商品身份；仅当标题语义确实歧义时才打开少量详情，不得为证明类别而绕行分类页或枚举导航菜单。目标作为主商品时可包含附件套装，目标仅作为附赠品时排除。
6. 从同一候选台账返回完整名称、最小价和最大价。

## 停止条件与必检项

- 每个候选必须同时满足核心产品词和品牌；不能只因搜索命中就计入。
- 品牌和产品类型可由标题或站点分类证明；不要要求自然语言同义词必须逐字出现在标题。
- 优先把每页显示数量调到最大；通过规范 URL 一次设置分页量和排序，不要重复操作同一个下拉框。
- 完整列表的查询预算是一个 Advanced Search Name 主查询加至多一个直接同义词补充查询；仅 min/max 的边界证明不执行这两个查询。每个规范 URL 只读取一次。
- 维护 `已访问页/总结果/已读取卡片/去重候选` 四个计数；任何一个无法解释时不得声称集合完整。
- 召回补充查询只替换产品类型同义词，必须保留品牌与其他硬约束；不得给查询加引号制造精确短语搜索。即使主查询已有候选，只要完整聚合仍无法证明同义词召回闭合，也允许使用。合并后按商品 URL 去重，再统一做语义验收。
- 完成分页后立刻计算并返回，不要为已确定的极值继续打开商品详情。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- electronics > headphones > earbud headphones：`/electronics/headphones/earbud-headphones.html`
- beauty personal care > oral care > teeth whitening：`/beauty-personal-care/oral-care/teeth-whitening.html`
- office products > office electronics > printers accessories：`/office-products/office-electronics/printers-accessories.html`
- beauty personal care > hair care > styling products：`/beauty-personal-care/hair-care/styling-products.html`
- electronics > headphones：`/electronics/headphones.html`
- beauty personal care > oral care > children s dental care：`/beauty-personal-care/oral-care/children-s-dental-care.html`

## 已验证批量读取结构

这些 selector 来自已抓取页面；先在实时页面确认存在，再在一次 evaluate 中按卡片作用域提取字段。

- 商品卡片：`li.product-item`；名称 `a.product-item-link`；价格 `.price-box .price`；链接 `a.product-item-link`
- 分页：每页数量 `select[data-role='limiter']`；总数 `.toolbar-amount`；Next `.pages .pages-item-next > a.action.next`

## 单次读取模板

在当前列表页执行一次；把返回的 `pageId` 加入已访问集合，只沿 `nextHref` 前进。**必须原样执行此模板，不得修改字段名或省略 `pageId`/`actionId` 等任何字段。**

```js
() => {
  const errors = [];
  const rawCards = [...document.querySelectorAll("li.product-item")];
  const cards = rawCards.filter(card =>
    Boolean(card.offsetWidth || card.offsetHeight || card.getClientRects().length)
  );
  const items = cards.map(card => {
    const nameNode = card.querySelector("a.product-item-link");
    const link = card.querySelector("a.product-item-link");
    const priceText = card.querySelector(".price-box .price")?.textContent || "";
    const priceMatch = priceText.replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/);
    return {
      name: nameNode?.textContent.trim() || "",
      price: priceMatch ? Number(priceMatch[0]) : null,
      url: link?.href || ""
    };
  });
  if (items.length === 0) errors.push("product-list-empty-or-selector-mismatch");
  if (items.some(item => !item.name || !item.url || item.price === null)) {
    errors.push("required-product-field-missing");
  }
  const next = document.querySelector(".pages .pages-item-next > a.action.next");
  const nextDisabled = !next ||
    next.matches("[disabled], .disabled, [aria-disabled=\"true\"]") ||
    Boolean(next.closest(".disabled, [aria-disabled=\"true\"]"));
  const nextHref = nextDisabled ? null : next.href || null;
  const limiter = document.querySelector("select[data-role='limiter']");
  const limiterOptions = limiter
    ? [...limiter.options].map(option => option.value).filter(Boolean)
    : [];
  return {
    actionId: "read_current_list_page_v1",
    ok: errors.length === 0,
    pageId: JSON.stringify({
      url: location.href,
      itemCount: items.length,
      firstUrl: items[0]?.url || "",
      lastUrl: items.at(-1)?.url || ""
    }),
    totalText: document.querySelector(".toolbar-amount")?.textContent.trim() || "",
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
}
```

## 操作锚点

- Page 2：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=2\"]")`（confidence=0.65，evidence=unique,scoped）
- Page 3：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=3\"]")`（confidence=0.65，evidence=unique,scoped）
- Page 4：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=4\"]")`（confidence=0.65，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 完整列表任务覆盖全部查询结果页；仅 min/max 任务分别证明升序和降序边界上的第一个合格候选。
- 名称列表与 min/max 来自同一份去重候选台账。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：站内搜索可能返回广告、配件或相似词商品；必须按名称和类别逐条验收。

