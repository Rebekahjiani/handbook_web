---
name: webarena-shopping-category-navigation
description: webarena-shopping 的分类页导航与价格过滤工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。

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

- Advanced Search：`locator("a.action[href=\"${SITE_ORIGIN}/catalogsearch/advanced/\"]")`（confidence=0.55，evidence=unique,scoped）
- Beauty & Personal Care：`locator("a.level-top[href=\"${SITE_ORIGIN}/beauty-personal-care.html\"]")`（confidence=0.55，evidence=unique,scoped）
- Sports & Outdoors：`locator("a.level-top[href=\"${SITE_ORIGIN}/sports-outdoors.html\"]")`（confidence=0.55，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 最终 URL、标题或面包屑与目标分类一致。
- 价格筛选值与任务上限一致。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：同名分类可能位于不同父级；必须核对完整路径，不能只看末级名称。

