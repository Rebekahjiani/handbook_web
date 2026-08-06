---
name: webarena-shopping-catalog-aggregation
description: webarena-shopping 的商品集合、名称与价格聚合工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 商品集合、名称与价格聚合

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-catalog-aggregation`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

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
- 首次成功批量读取后冻结该搜索结果集；品牌与产品类型直接在返回的 `items` 上验收，不得为了寻找侧栏品牌筛选器而切换到宽泛分类页。
- 只有冻结结果集中零个候选满足产品类型时才能使用一次补充查询；不能因为候选不够多而改写查询或并行探索分类页。

## 循环动作

1. 用最短且有区分度的查询词建立候选集，并固定品牌、类别和产品类型条件。
2. 把页面显示数量调到最大，记录总结果数和当前页身份；每页只做一次 DOM 批量读取，得到名称、价格和链接。
3. 按 Next 逐页去重；只有完整当前页没有 Next，或已访问商品数覆盖总结果数时才停止，禁止根据前几页内容推断后续没有目标。
4. 用标题、分类/面包屑和详情主商品身份共同筛选；目标作为主商品时可包含附件套装，目标仅作为附赠品时排除。
5. 从同一候选台账返回完整名称、最小价和最大价。

## 停止条件与必检项

- 每个候选必须同时满足核心产品词和品牌；不能只因搜索命中就计入。
- 品牌和产品类型可由标题或站点分类证明；不要要求自然语言同义词必须逐字出现在标题。
- 优先把每页显示数量调到最大，再遍历分页。
- 查询预算是一个主查询加至多一个召回补充查询；每个规范 URL 只读取一次，不检查与任务无关的筛选器。
- 维护 `已访问页/总结果/已读取卡片/去重候选` 四个计数；任何一个无法解释时不得声称集合完整。
- 召回补充查询只补主查询缺少的品牌或类型证据；合并后按商品 URL 去重，再统一做语义验收。
- 完成分页后立刻计算并返回，不要为已确定的极值继续打开商品详情。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

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

在当前列表页执行一次；把返回的 `pageId` 加入已访问集合，只沿 `nextHref` 前进。

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

- Page 2：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=2\"]")`
- Page 3：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=3\"]")`
- Page 4：`locator("a.page[href=\"${SITE_ORIGIN}/office-products/office-furniture-lighting/cabinets-racks-shelves.html?p=4\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 候选集合覆盖全部结果页且没有近似商品。
- 名称列表与 min/max 来自同一份去重候选台账。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：站内搜索可能返回广告、配件或相似词商品；必须按名称和类别逐条验收。

