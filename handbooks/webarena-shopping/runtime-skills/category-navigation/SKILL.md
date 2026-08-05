---
name: webarena-shopping-category-navigation
description: webarena-shopping 的分类页导航与价格过滤工作流。
---

# 运行规则

- 本技能已由总 router 按站点和任务预选；只执行本工作流。
- 以实时浏览器状态为准。导航或分页后废弃旧引用，并重新核对 URL、标题和对象身份。
- 列表任务优先在当前页面做一次作用域明确的 DOM 读取；不要反复保存或加载整页快照。
- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 提交前重新读取当前 URL、标题和目标对象；不得用旧观察描述最终状态。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 分类页导航与价格过滤

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-category-navigation`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `goal`：任务要求的最终页面状态或数据
- `hard_constraints`：不可放宽的显式条件
- `visited_page_ids`：已处理页面 URL 集合
- `accepted_evidence`：支持完成结论的页面证据
- `next_action`：当前唯一动作；完成或无法安全推进时为 `null`

## 硬执行契约

- `read_current_list_page_v1` 是当前商品列表页唯一允许的列表读取动作。
- 对每个页面身份只调用一次 evaluate，并完整执行下方模板；不得先用 snapshot/find 逐卡观察，也不得把模板拆成多个 evaluate。
- 只有返回 `ok: true` 才能更新台账并沿 `nextHref` 前进；返回 `ok: false` 时记录 `errors`，重新定位页面结构，不得猜测字段或重复读取同一页面身份。
- `complete: true` 只证明当前页面没有可用 Next；集合完成还必须满足工作流的总数与去重台账条件。

## 循环动作

1. 从已观察到的分类路径提示中选择语义最精确的一条；没有提示时再沿菜单逐级进入。
2. 核对分类页 URL、标题和面包屑。
3. 需要价格上限时使用页面价格筛选，并核对 URL 中的价格条件。
4. 停在分类结果页，不要把站内搜索结果页当作分类页。

## 停止条件与必检项

- 命中精确分类路径后不要继续尝试近似分类。
- 最多尝试两个候选分类路径；仍不匹配再回到菜单。
- 任务要求 under X 时，价格范围使用从 0 到 X 的页面筛选值。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- clothing shoes jewelry > men > shoes：`/clothing-shoes-jewelry/men/shoes.html`
- clothing shoes jewelry > women > clothing：`/clothing-shoes-jewelry/women/clothing.html`
- office products > office furniture lighting > cabinets racks shelves：`/office-products/office-furniture-lighting/cabinets-racks-shelves.html`
- clothing shoes jewelry > women > shoes：`/clothing-shoes-jewelry/women/shoes.html`
- beauty personal care > makeup > makeup remover：`/beauty-personal-care/makeup/makeup-remover.html`
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

- Search：`getByRole("button", { name: "Search", exact: true })`
- Page Next：`locator("a.action[href=\"${SITE_ORIGIN}/?pbaocw=2\"]")`
- View as List：`locator("a.modes-mode[href=\"#\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `URL + title + H1/目标对象`；最终答案只能描述这次读取到的当前状态。
- NAVIGATE 任务中，当前 URL 必须精确等于选中的候选 URL，并逐项保留任务要求的小数边界与 query 参数；不允许用语义近似页面代替。
- RETRIEVE 任务中，先按要求校验返回值的类型、空值协议和字段集合；浏览器中断或证据不足时不得返回 SUCCESS。
- 如果口头选中的候选与当前 URL 不一致，必须导航到候选并重新执行本闸门；否则判定失败。

## 完成证明

- 最终 URL、标题或面包屑与目标分类一致。
- 价格筛选值与任务上限一致。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：同名分类可能位于不同父级；必须核对完整路径，不能只看末级名称。

