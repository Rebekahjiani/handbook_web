---
name: webarena-shopping-product-selection
description: webarena-shopping 的满足约束的最优商品选择工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 满足约束的最优商品选择

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-product-selection`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `comparator`：任务要求的比较字段、方向和并列规则
- `hard_constraints`：产品类型、属性、兼容性等不可放宽条件
- `visited_page_ids`：已处理列表页 URL 集合
- `seen_product_urls`：已读取商品 URL 集合
- `accepted_candidates`：同时通过产品类型与任务约束谓词的候选及比较证据
- `next_href`：唯一待访问的下一页；无下一页时为 `null`

## 硬执行契约

- `read_current_list_page_v1` 是当前商品列表页唯一允许的列表读取动作。
- 对每个页面身份只调用一次 evaluate，并完整执行下方模板；不得先用 snapshot/find 逐卡观察，也不得把模板拆成多个 evaluate。
- 只有返回 `ok: true` 才能更新台账并沿 `nextHref` 前进；返回 `ok: false` 时记录 `errors`，重新定位页面结构，不得猜测字段或重复读取同一页面身份。
- `complete: true` 只证明当前页面没有可用 Next；集合完成还必须满足工作流的总数与去重台账条件。
- 价格升序已验证时按顺序验收；一旦出现验收通过的候选，补充查询预算立即归零，必须打开该候选、执行最终状态闸门并结束。
- 只有主查询中零个候选满足产品类型时才允许一次补充查询；不得在已找到合格候选后继续搜索同义词。

## 循环动作

1. 先解析比较器：`least expensive` 按价格升序，`most expensive` 按价格降序，`most recent released` 按产品发布日期降序；`best` 保留站点相关性或任务明确给出的质量信号。
2. 把候选验收拆成两个独立谓词：`is_target_product_type` 判断它是任务所说的主商品/配件类型，`satisfies_task_constraint` 判断平台兼容、容量等约束；两者都为真才进入候选集。多平台配件可用明确兼容性满足平台约束，不要求独占该平台分类；主机本体不能冒充配件。
3. 优先使用站点已有的精确分类或一次主搜索建立候选集并排序。在价格降序已验证生效后，从顶部依次验收，不跨到无关分类分支重新比较。
4. 按比较器顺序核对硬约束；容量、数量、兼容性必须修饰目标商品本身，优先用规格/详情证据，不把包装、附件或营销数字当容量。
5. 找到第一个满足比较器和全部硬约束的候选后，从 accepted_candidates 台账中取出该商品的精确 URL，直接导航到该 URL（不通过再次点击搜索结果中的视觉元素）。
6. 打开商品页后立刻执行字符串比较：location.href 必须等于台账中的精确 URL；不一致时重新导航，不得用视觉近似判断跳过该检查。确认后立即结束。

## 停止条件与必检项

- 产品名称不充分时才打开详情核对；最多检查八个候选。
- 查询预算是一个主查询加至多一个召回补充查询；同一结果 URL 不得重复读取。
- 若价格升序生效，第一个验证通过的候选即可停止；未验证通过的更低价候选必须在台账中有明确排除理由。
- 若价格降序生效，只有站点明确显示降序已生效，或已枚举完整候选集并自行求最大值，才能在首个验证通过的候选处停止。
- 多平台商品不得仅因不独占目标平台而排除；必须分别记录产品类型证据和兼容性证据。反之，只有兼容性而产品类型不符时必须排除。
- `most recent released` 比较产品发布日期；不得用型号数字、评论日期或页面更新时间替代。
- `best` 没有显式价格词时不得按最低价排序；优先站点默认相关性，再使用评分、评论量或与约束的精确匹配作为可解释信号。
- 候选分类证据优先于标题是否逐字包含任务同义词；只有主商品类型冲突时才排除。
- 到达目标商品页后立刻结束，搜索结果页不能作为成功状态。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

## 已观察到的分类路径

这些路径来自站点链接和任务词匹配，只用于缩小导航范围；到达后仍要核对页面。

- video games > nintendo switch：`/video-games/nintendo-switch.html`
- clothing shoes jewelry > men > shoes：`/clothing-shoes-jewelry/men/shoes.html`
- beauty personal care > hair care > styling products：`/beauty-personal-care/hair-care/styling-products.html`

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

- Sort By：`locator("select[data-role=\"sorter\"]")`
- Set Descending Direction：`locator("a[data-role=\"direction-switcher\"]")`

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 最终位于满足所有硬约束的商品详情页，且 location.href 字符串等于 accepted_candidates 台账中该商品的精确 URL（非目测近似）。
- 已证明在完整候选集内不存在按任务比较器更优且同样满足条件的商品。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：容量数字可能描述包装、附件或兼容数量；必须确认它修饰任务要求的属性。

