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
      categoryMatch: "match the ordered item's primary category/use; do not include unrelated items from the same order",
      amountFieldByConstraint: {
        excludeShippingAndHandling: "item_subtotal",
        includeShippingAndHandling: "grand_total",
      },
      aggregation: "sum only accepted item lines after exact date/category/status checks",
    },
  };
}

export { ORDER_HISTORY_ACTION_ID, ORDER_DETAIL_ITEMS_ACTION_ID };
