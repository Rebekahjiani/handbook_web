---
name: webarena-shopping-search-discovery
description: webarena-shopping 的通用搜索、筛选与商品发现工作流。
---

# 运行规则

- 只执行当前路由；保持目标、硬约束和已验证证据台账，不改变任务口径。
- 每页/每个对象只读取一次；动作失败后重新读取当前状态，最多恢复两次，仍失败就停止。
- 非认证任务遇到登录页或登录失败时停止，不猜凭据、不重复提交。
- 成功必须有最终状态证据；中断、证据缺失和空结果不得包装成 SUCCESS。
- 最终响应服从任务给出的 expected status：若为 `NOT_FOUND_ERROR`，`retrieved_data` 必须是 JSON `null`，不能返回 `[]`、`[0]` 或 `[0.0]`。

# 通用搜索、筛选与商品发现

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-search-discovery`

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

1. 定义产品类型、品牌、属性和价格条件。
2. 用分类或一次站内搜索建立候选集，再应用筛选与排序。
3. 只读取完成任务所需的字段，并在成功判据满足后停止。

## 停止条件与必检项

- 搜索词最多改写两次；每次改写前说明缺少哪条条件。
- 连续两次没有缩小候选集合时停止当前策略，改用分类入口。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

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

- Search：`getByRole("button", { name: "Search", exact: true })`（confidence=0.85，evidence=unique,stable-attribute,scoped）
- Page Next：`locator("a.action[href=\"${SITE_ORIGIN}/?pbaocw=2\"]")`（confidence=0.75，evidence=unique,scoped）
- View as List：`locator("a.modes-mode[href=\"#\"]")`（confidence=0.75，evidence=unique,scoped）

## 最终状态闸门

- 报告 SUCCESS 前，最后一次浏览器工具调用必须是 `localweb_browser_snapshot` 或 `localweb_browser_evaluate`；navigate/click 后必须再读取当前状态。
- 按前置 Workflow IR 的 `postStateGate` 完成 URL、标题/目标对象和结果证据校验；闸门通过前不得报告 SUCCESS。

## 完成证明

- 最终页面和候选集合满足任务的全部显式条件。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：搜索结果是候选，不是答案；选择前必须验证名称、规格和页面状态。

