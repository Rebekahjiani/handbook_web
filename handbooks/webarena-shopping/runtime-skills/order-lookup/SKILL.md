---
name: webarena-shopping-order-lookup
description: webarena-shopping 的订单查找与已购商品属性工作流。
---

# 运行规则

- 保持一个短台账：目标、固定约束、已验证记录、未访问页。不要在执行中改变口径。
- 每次分页只允许一次批量读取；记录页面身份，禁止重复访问同一页。
- 达到成功判据后立即结束。任务协议要求 NOT_FOUND 时使用 `retrieved_data: null`，不要用空数组。
- 不得把中断、缺少证据或空结果包装成 SUCCESS；不得回答或索取下一题。

# 订单查找与已购商品属性

站点：`http://localhost:7770`
机器契约：`../../references/execution-contract.json#workflows-order-lookup`

## 前置条件

- 从任务中明确目标、硬约束、比较器和成功页面；没有出现的条件不得自行补充。
- 先确认当前页面属于该站点，并验证将要使用的 selector 或链接仍然存在。

## 状态变量

- `target_period`：时间范围或顺序要求
- `target_status`：任务要求的订单状态
- `visited_page_ids`：已处理订单页 URL 集合
- `seen_record_ids`：已读取订单号集合
- `accepted_records`：满足时间与状态条件的订单台账
- `next_href`：唯一待访问的下一页；无下一页时为 `null`

## 硬执行契约

- `read_current_list_page_v1` 是当前商品列表页唯一允许的列表读取动作。
- 对每个页面身份只调用一次 evaluate，并完整执行下方模板；不得先用 snapshot/find 逐卡观察，也不得把模板拆成多个 evaluate。
- 只有返回 `ok: true` 才能更新台账并沿 `nextHref` 前进；返回 `ok: false` 时记录 `errors`，重新定位页面结构，不得猜测字段或重复读取同一页面身份。
- `complete: true` 只证明当前页面没有可用 Next；集合完成还必须满足工作流的总数与去重台账条件。

## 循环动作

1. 先判定任务是单对象查找还是集合查找；进入订单历史并把每页行数据一次性读取为短台账，记录页面身份、行数与 Next。
2. 按日期、状态或商品名称筛选；查找“最近”记录时按页面显示日期比较。
3. 从目标行的实时详情链接进入详情，并核对订单号。
4. 读取任务要求的字段或商品选项，保留页面显示的单位和格式。

## 停止条件与必检项

- 分页后废弃旧引用；不要根据订单号拼接详情 URL。
- 查找最近状态时，一旦已按时间倒序确认首个精确状态匹配即可停止。
- 任务含 `all`、完整年份或日期范围时属于集合查找：必须覆盖整个范围并保存全部候选，不能找到第一项就停止。
- 按已购商品查找时，先穷尽目标日期范围内的订单行，再逐个打开候选详情；不要在订单页和站内搜索间循环。
- 无匹配必须有终页证据：完整当前页没有 Next，且已访问行数与页面报告的总数一致。
- 商品尺寸、容量等属性必须保留单位，例如 `16 inch`，不能只返回裸数字。
- 无匹配时导航回不带分页参数的订单历史首页，并返回 NOT_FOUND 与 null。
- 成功判据未被页面证据证明时继续；`next_action` 为空或动作开始重复时停止并进入失败恢复。

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

## 已验证结构

- `history-row`：`table#my-orders-table.history > tbody > tr`（history-table）
- `history-purchase-date`：`:scope > td[data-th="Date"]`（history-row）
- `history-grand-total`：`:scope > td[data-th="Order Total"] .price`（history-row）
- `history-status`：`:scope > td[data-th="Status"]`（history-row）
- `history-detail-link`：`:scope > td[data-th="Actions"] > a.action.view`（history-row）
- `pagination-next`：`.pages .pages-item-next > a.action.next`（document）
- `detail-grand-total`：`tr.grand_total > td.amount[data-th="Grand Total"] .price`（detail-totals）

## 最终状态闸门

- 成功前的最后一次浏览器调用必须读取实时 `location.href + document.title`；最终答案只能描述这次读取到的状态。
- NAVIGATE：将 location.href 与台账中记录的目标 URL 做字符串比较（含路径、query 参数和小数边界）；不一致时直接导航到台账 URL，再重新读取，不得以视觉近似替代字符串比较。
- RETRIEVE：校验返回值的类型、字段集合和空值协议（NOT_FOUND → null，不是空数组）；证据不足时不得返回 SUCCESS。

## 完成证明

- 找到目标：列表行与详情页订单号一致，且目标条件有行级证据。——无匹配：已记录终页证据（末页 URL、已访问行数、页面报告总数一致），再回到订单历史首页结束。两种情况必须满足其中之一。
- 返回值保留页面显示的单位；不得靠猜测或拼接 URL 构造结果。

## 失败恢复

- selector 失效时重新读取当前页面结构；不要盲点旧坐标或重复同一动作。
- 候选、分页或页面状态无法证明完整时，保留已有台账并报告缺失证据，不得猜测成功。

风险：查看订单通常无副作用；Reorder、取消或退货属于写操作，不要代替用户提交。

