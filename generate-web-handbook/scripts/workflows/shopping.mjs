const ORDER_HISTORY_ACTION_ID = "read_order_history_page_v1";
const ORDER_DETAIL_ITEMS_ACTION_ID = "read_order_detail_items_v1";

export function shoppingAdapterFor(workflowId, modelContext = null) {
  if (!["order-aggregation", "order-lookup"].includes(workflowId)) return null;
  const binding = (modelContext?.bindings || []).find((candidate) =>
    (candidate.surfaces || []).some((surface) => surface.id === "storefront-order-history"),
  );
  if (!binding) return null;
  const locatorById = new Map((binding.locators || []).map((locator) => [locator.id, locator.selector]));
  const table = binding.history_table || {};
  const fields = table.field_locator_ids || {};
  const row = locatorById.get(table.row_locator_id);
  if (!row || !fields.order_number || !fields.purchase_date || !fields.grand_total || !fields.status || !fields.detail_link) return null;
  const selectorFor = (id) => locatorById.get(id) || null;
  const pagination = binding.pagination || {};
  const detail = binding.detail_extraction?.item_fields || {};
  const detailRow = detail.row_locator_id ? locatorById.get(detail.row_locator_id) : null;
  const itemFieldLocators = (detail.item_field_locator_ids || {});
  const detailComplete =
    detailRow &&
    itemFieldLocators.name &&
    itemFieldLocators.sku &&
    itemFieldLocators.price &&
    itemFieldLocators.qty &&
    itemFieldLocators.subtotal;
  const listAction = {
    actionId: ORDER_HISTORY_ACTION_ID,
    kind: "browser.evaluate",
    deterministic: true,
    scope: "current-order-history-page",
    maxCallsPerPageId: 1,
    selectors: {
      row,
      fields: {
        orderNumber: locatorById.get(fields.order_number),
        purchaseDate: locatorById.get(fields.purchase_date),
        grandTotal: locatorById.get(fields.grand_total),
        status: locatorById.get(fields.status),
        detailLink: locatorById.get(fields.detail_link),
      },
      pagination: { next: selectorFor(pagination.next_locator_id), total: ".toolbar-amount" },
    },
    javascript: `() => {
  const errors = [];
  const rows = [...document.querySelectorAll(${JSON.stringify(row)})];
  const read = (row, selector) => row.querySelector(selector)?.textContent.trim() || "";
  const orders = rows.map(row => ({
    recordId: read(row, ${JSON.stringify(locatorById.get(fields.order_number))}),
    orderNumber: read(row, ${JSON.stringify(locatorById.get(fields.order_number))}),
    purchaseDate: read(row, ${JSON.stringify(locatorById.get(fields.purchase_date))}),
    grandTotalText: read(row, ${JSON.stringify(locatorById.get(fields.grand_total))}),
    status: read(row, ${JSON.stringify(locatorById.get(fields.status))}),
    detailUrl: row.querySelector(${JSON.stringify(locatorById.get(fields.detail_link))})?.href || ""
  }));
  const completeOrder = order => Boolean(order.orderNumber && order.purchaseDate && order.status && order.detailUrl);
  if (!rows.length) errors.push("order-history-empty-or-selector-mismatch");
  if (orders.some(order => !order.orderNumber || !order.purchaseDate || !order.status || !order.detailUrl)) {
    errors.push("required-order-field-missing");
  }
  const next = document.querySelector(${JSON.stringify(selectorFor(pagination.next_locator_id))});
  const nextDisabled = !next || next.matches("[disabled], .disabled, [aria-disabled=\\"true\\"]") || Boolean(next.closest(".disabled, [aria-disabled=\\"true\\"]"));
  return {
    actionId: "read_order_history_page_v1",
    ok: errors.length === 0,
    evidenceStatus: errors.length === 0 ? "verified" : "evidence_incomplete",
    pageId: location.href,
    totalText: document.querySelector(".toolbar-amount")?.textContent.trim() || "",
    itemCount: orders.length,
    orders: orders.map(order => ({ ...order, evidenceStatus: completeOrder(order) ? "verified" : "evidence_incomplete" })),
    nextHref: nextDisabled ? null : next.href || null,
    complete: nextDisabled,
    errors
  };
}`,
    requiredOutput: {
      actionId: ORDER_HISTORY_ACTION_ID,
      requiredKeys: ["ok", "evidenceStatus", "pageId", "totalText", "itemCount", "orders", "nextHref", "complete", "errors"],
      itemKeys: ["orderNumber", "purchaseDate", "grandTotalText", "status", "detailUrl", "evidenceStatus"],
      okWhen: ["errors is empty", "itemCount equals orders.length", "each order has identity, date, status and detail URL"],
    },
  };
  const detailAction = detailComplete
    ? {
        actionId: ORDER_DETAIL_ITEMS_ACTION_ID,
        kind: "browser.evaluate",
        deterministic: true,
        scope: "current-order-detail-page",
        maxCallsPerPageId: 2,
        selectors: {
          row: detailRow,
          fields: {
            name: locatorById.get(itemFieldLocators.name),
            sku: locatorById.get(itemFieldLocators.sku),
            price: locatorById.get(itemFieldLocators.price),
            qty: locatorById.get(itemFieldLocators.qty),
            subtotal: locatorById.get(itemFieldLocators.subtotal),
          },
          totalsLabel: ".block-order-details-view, .order-info",
        },
        javascript: `() => {
  const errors = [];
  const rows = [...document.querySelectorAll(${JSON.stringify(detailRow)})];
  const read = (row, selector) => row.querySelector(selector)?.textContent.trim().replace(/\\s+/g, " ") || "";
  const items = rows.map(row => ({
    name: read(row, ${JSON.stringify(locatorById.get(itemFieldLocators.name))}),
    sku: read(row, ${JSON.stringify(locatorById.get(itemFieldLocators.sku))}),
    price: read(row, ${JSON.stringify(locatorById.get(itemFieldLocators.price))}),
    qty: read(row, ${JSON.stringify(locatorById.get(itemFieldLocators.qty))}),
    subtotal: read(row, ${JSON.stringify(locatorById.get(itemFieldLocators.subtotal))})
  }));
  const totals = {};
  for (const tr of document.querySelectorAll("table#my-orders-table tfoot tr")) {
    const label = tr.querySelector("th, td[data-th]");
    const value = tr.querySelector("td.amount .price, .price");
    if (label && value) totals[(label.getAttribute("data-th") || label.textContent.trim()).trim()] = value.textContent.trim();
  }
  const orderDate = document.querySelector(".order-date > span:not(.label)")?.textContent.trim() || "";
  if (!rows.length) errors.push("order-detail-items-empty-or-selector-mismatch");
  const completeItem = item => Boolean(item.name && item.sku && item.subtotal);
  if (items.some(item => !completeItem(item))) errors.push("required-item-field-missing");
  return {
    actionId: "read_order_detail_items_v1",
    ok: errors.length === 0,
    evidenceStatus: errors.length === 0 ? "verified" : "evidence_incomplete",
    pageId: location.href,
    orderDate,
    totals,
    itemCount: items.length,
    items: items.map(item => ({ ...item, evidenceStatus: completeItem(item) ? "verified" : "evidence_incomplete" })),
    errors
  };
}`,
        requiredOutput: {
          actionId: ORDER_DETAIL_ITEMS_ACTION_ID,
          requiredKeys: ["ok", "evidenceStatus", "pageId", "orderDate", "totals", "itemCount", "items", "errors"],
          itemKeys: ["name", "sku", "price", "qty", "subtotal", "evidenceStatus"],
          okWhen: ["errors is empty", "itemCount equals items.length", "each item has name, sku and item subtotal"],
        },
      }
    : null;
  return {
    actions: [listAction, ...(detailAction ? [detailAction] : [])],
    selectionContract: {
      entity: "order_set",
      preserveTaskConstraints: ["exact_date", "product_category", "status"],
      detailEvidenceRequired: true,
      categoryMatch: "品类判定（本数据集校准，必须逐行执行）：(a) 食品 food/cooking/food-related 包含烘焙食品（corn muffin mix 等杂粮粉/松饼）、即食餐（MRE/beef cholent）、食品饮料（chai、橙汁/果汁）以及直接用于食品的装饰（cake topper 彩虹生日派对用品/蛋糕装饰件）；(b) hair care/hair style 只包含护理与染发产品（conditioner 护发素、haircolor/hair dye 染发剂），不包含身体护理（body butter/body lotion 身体乳）与纯装饰配件（hairbands 发箍、pearl jewelry 发夹）；(c) 若商品名与目标类别同属一并含装饰配件字样，按用途判断：用于食品的装饰计入 food；(d) 未列入上述的明显不相关商品不计入",
      amountFieldByConstraint: {
        excludeShippingAndHandling: "item_subtotal",
        includeShippingAndHandling: "grand_total",
      },
      aggregation: "sum only accepted item lines after exact date/category/status checks; past N months 的下界 = 任务日期减 N×30 天（严格晚于该日期），过去 N 天同理严格晚于下界，禁止按日历月/月初计算",
    },
  };
}

export { ORDER_HISTORY_ACTION_ID, ORDER_DETAIL_ITEMS_ACTION_ID };

// 编译已有 selector 证据；不从任务答案生成代码或商品/订单常量。
export function shoppingCollectionAction(source, maxPages = 12) {
  const orders = source?.actionId === ORDER_HISTORY_ACTION_ID;
  if (!orders && source?.actionId !== "read_current_list_page_v1") return null;
  if (!source.selectors?.pagination?.next) return null;
  const actionId = orders ? "collect_order_history_v1" : "collect_product_pages_v1";
  const properties = {
    maxPages: { type: "integer", minimum: 1, maximum: maxPages, default: maxPages },
    ...(orders ? {
      status: { type: "string", description: "Exact observed status, case insensitive." },
      dateFrom: { type: "string", description: "Inclusive YYYY-MM-DD lower bound." },
      dateTo: { type: "string", description: "Inclusive YYYY-MM-DD upper bound." },
    } : {
      nameContains: { type: "array", items: { type: "string" }, description: "Optional literal title substrings, all required. Omit for semantic or synonym matching." },
    }),
  };
  const config = { actionId, orders, selectors: source.selectors, maxPages };
  return {
    actionId,
    kind: "browser.runCode",
    deterministic: true,
    scope: "current-collection-browser-ui",
    maxCallsPerPageId: 1,
    inputSchema: { type: "object", additionalProperties: false, properties },
    pageBudgetParameter: "maxPages",
    selectors: source.selectors,
    sourceActionId: source.actionId,
    javascript: `async (page, args = {}) => (${collectShoppingPages.toString()})(page, args, ${JSON.stringify(config)})`,
    requiredOutput: {
      requiredKeys: ["ok", "complete", "pageId", "pages", "scannedCount", orders ? "orders" : "items", "errors"],
      okWhen: ["all pages read without errors", "no Next remains", "observed total agrees with distinct record count when available"],
    },
  };
}

async function collectShoppingPages(page, args, config) {
  const { selectors: s, orders } = config;
  const start = new URL(page.url());
  const pages = [], records = new Map(), errors = [];
  const allowed = orders ? ["maxPages", "status", "dateFrom", "dateTo"] : ["maxPages", "nameContains"];
  const maxPages = args?.maxPages ?? config.maxPages;
  const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!args || typeof args !== "object" || Array.isArray(args) ||
      Object.keys(args).some(key => !allowed.includes(key)) ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > config.maxPages ||
      ["dateFrom", "dateTo"].some(key => key in args && (typeof args[key] !== "string" || !isoDate(args[key]))) ||
      (args.dateFrom && args.dateTo && args.dateFrom > args.dateTo) ||
      ("status" in args && (typeof args.status !== "string" || !args.status.trim())) ||
      ("nameContains" in args && (!Array.isArray(args.nameContains) || args.nameContains.some(term => typeof term !== "string" || !term.trim())))) {
    return { actionId: config.actionId, ok: false, complete: false, pageId: start.href, pages, scannedCount: 0, [orders ? "orders" : "items"]: [], errors: ["invalid_arguments"] };
  }
  const canonical = raw => {
    const url = new URL(raw, start);
    url.hash = "";
    url.searchParams.sort();
    return url;
  };
  let url = canonical(start.href), total = null, nextHref = url.href;
  const visited = new Set();
  try {
    if (start.searchParams.has("p") && start.searchParams.get("p") !== "1") throw new Error("start_page_not_first");
    if (orders ? !/^\/sales\/order\/history\/?$/.test(start.pathname) : !(start.pathname === "/catalogsearch/result/" || start.pathname.endsWith(".html"))) throw new Error("collection_surface_mismatch");
    const limiter = s.pagination?.limiter ? await page.evaluate(selector => {
      const node = document.querySelector(selector);
      return node ? { current: Number(node.value), sizes: [...node.options].map(option => Number(option.value)) } : null;
    }, s.pagination.limiter) : null;
    const sizes = limiter?.sizes.filter(size => Number.isInteger(size) && size > 0) || [];
    if (sizes.length && limiter.current !== Math.max(...sizes)) {
      url.searchParams.set("product_list_limit", String(Math.max(...sizes)));
      url = canonical(url.href);
    }
    while (nextHref) {
      if (pages.length >= maxPages) throw new Error("page_budget_exceeded");
      if (visited.has(url.href)) throw new Error("pagination_cycle");
      if (url.origin !== start.origin || url.pathname !== start.pathname) throw new Error("pagination_scope_mismatch");
      const scope = value => { const u = new URL(value); u.searchParams.delete("p"); return u.search; };
      if (pages.length && scope(url) !== scope(pages[0].url)) throw new Error("pagination_query_changed");
      visited.add(url.href);
      if (url.href !== canonical(page.url()).href) {
        let response;
        try {
          response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 15000 });
        } catch {
          throw new Error("page_navigation_failed");
        }
        if (!response?.ok()) throw new Error("page_navigation_failed");
        if (canonical(page.url()).href !== url.href) throw new Error("navigation_redirected");
      }
      const observed = await page.evaluate(({ s, orders }) => {
        const read = (node, selector) => selector ? node.querySelector(selector)?.textContent.trim() || "" : "";
        const money = value => { const match = value.replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/); return match ? Number(match[0]) : null; };
        const rows = [...document.querySelectorAll(s.row || s.item)].filter(row => row.getClientRects().length);
        const values = rows.map(row => {
          const f = s.fields;
          const link = row.querySelector(orders ? f.detailLink : f.link)?.href || "";
          return orders ? {
            orderNumber: read(row, f.orderNumber), purchaseDate: read(row, f.purchaseDate),
            grandTotalText: read(row, f.grandTotal), status: read(row, f.status), detailUrl: link,
          } : { name: read(row, f.name), price: f.price ? money(read(row, f.price)) : null, url: link };
        });
        const next = document.querySelector(s.pagination.next);
        const disabled = !next || next.matches('[disabled], .disabled, [aria-disabled="true"]') || next.closest(".disabled, [aria-disabled='true']");
        return { values, totalText: read(document, s.pagination.total), nextHref: disabled ? null : next.getAttribute("href") ? next.href : "" };
      }, { s, orders });
      const numbers = observed.totalText.replace(/,/g, "").match(/\d+/g);
      const pageTotal = numbers ? Number(numbers.at(-1)) : null;
      if (total !== null && pageTotal !== null && total !== pageTotal) throw new Error("collection_total_changed");
      total ??= pageTotal;
      if (!observed.values.length && total !== 0) throw new Error("empty_or_selector_mismatch");
      for (const record of observed.values) {
        const link = orders ? record.detailUrl : record.url;
        if (!link) throw new Error("record_link_missing");
        if (new URL(link).origin !== start.origin) throw new Error("record_origin_mismatch");
        if (orders ? !record.orderNumber || !record.purchaseDate || !record.status || !record.grandTotalText : !record.name || (s.fields.price && record.price === null)) throw new Error("required_record_field_missing");
        const id = orders ? record.orderNumber : record.url;
        if (records.has(id) && JSON.stringify(records.get(id).value) !== JSON.stringify(record)) throw new Error("record_changed_between_pages");
        if (!records.has(id)) records.set(id, { value: record, pageId: url.href });
      }
      if (observed.nextHref === "") throw new Error("next_link_missing");
      nextHref = observed.nextHref;
      pages.push({ url: url.href, itemCount: observed.values.length, total: pageTotal, nextHref });
      if (nextHref) url = canonical(nextHref);
    }
    if (total !== null && records.size !== total) throw new Error("collection_count_mismatch");
  } catch (error) {
    errors.push(error.message);
  }
  const selected = [];
  for (const [recordId, { value, pageId }] of records) {
    if (orders) {
      if (args.status && value.status.toLowerCase() !== args.status.toLowerCase()) continue;
      if (args.dateFrom || args.dateTo) {
        const parts = value.purchaseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
        const century = (args.dateFrom || args.dateTo).slice(0, 2);
        if (parts?.[3].length === 2 && args.dateFrom && args.dateTo && args.dateFrom.slice(0, 2) !== args.dateTo.slice(0, 2)) {
          errors.push("ambiguous_short_year"); break;
        }
        const year = parts?.[3].length === 2 ? century + parts[3] : parts?.[3];
        const date = parts ? `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}` : value.purchaseDate;
        if (!isoDate(date)) { errors.push("unparseable_purchase_date"); break; }
        if ((args.dateFrom && date < args.dateFrom) || (args.dateTo && date > args.dateTo)) continue;
      }
    } else if (args.nameContains?.some(term => !value.name.toLowerCase().includes(term.toLowerCase()))) continue;
    selected.push({ ...value, recordId, pageId });
  }
  const complete = !errors.length && nextHref === null;
  return {
    actionId: config.actionId, ok: complete, complete,
    evidenceStatus: complete ? "verified" : "evidence_incomplete",
    pageId: start.href, finalPageId: page.url(), pages, scannedCount: records.size, total,
    filters: args, itemCount: selected.length, [orders ? "orders" : "items"]: selected,
    nextHref, errors,
  };
}
