import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { shoppingCollectionAction } from "./workflows/shopping.mjs";

const contractPath = path.resolve("../handbooks/webarena-shopping/references/execution-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

function resolveAction(workflow, actionId) {
  const item = contract.workflows?.[workflow];
  if (!item) return { ok: false, code: "workflow_unknown" };
  const action = (item.actions || []).find((candidate) => candidate.actionId === actionId);
  if (!action) return { ok: false, code: "action_not_allowed" };
  if (!["browser.evaluate", "browser.runCode"].includes(action.kind) || typeof action.javascript !== "string") {
    return { ok: false, code: "action_not_executable" };
  }
  const validList = action.selectors?.item && action.selectors?.fields?.name && action.selectors?.fields?.link;
  const validOrders = ["read_order_history_page_v1", "collect_order_history_v1"].includes(actionId) &&
    action.selectors?.row && action.selectors?.fields?.orderNumber &&
    action.selectors?.fields?.purchaseDate && action.selectors?.fields?.grandTotal &&
    action.selectors?.fields?.status && action.selectors?.fields?.detailLink;
  if (!validList && !validOrders) {
    return { ok: false, code: "selector_evidence_missing" };
  }
  return { ok: true, action, maxCalls: action.maxCallsPerPageId ?? 1 };
}

function replay(call, state) {
  if (!['read_current_list_page_v1', 'read_order_history_page_v1', 'collect_product_pages_v1', 'collect_order_history_v1'].includes(call.actionId)) return { ok: false, code: "action_unknown" };
  if (!call.contractPath.endsWith("execution-contract.json")) return { ok: false, code: "contract_path_invalid" };
  if (call.route !== "shopping") return { ok: false, code: "route_mismatch" };
  const resolved = resolveAction(call.workflow, call.actionId);
  if (!resolved.ok) return resolved;
  const count = state.calls.get(call.pageId) || 0;
  if (count >= resolved.maxCalls) return { ok: false, code: "page_budget_exceeded" };
  state.calls.set(call.pageId, count + 1);
  const orderAction = ["read_order_history_page_v1", "collect_order_history_v1"].includes(call.actionId);
  return {
    ok: true,
    evidence: {
      actionId: call.actionId,
      workflow: call.workflow,
      pageId: call.pageId,
      fields: orderAction
        ? ["orders", "orderNumber", "purchaseDate", "grandTotalText", "status", "detailUrl", "evidenceStatus", "nextHref", "complete"]
        : ["items", "nextHref", "complete"],
      provenance: { contractPath: call.contractPath },
    },
  };
}

const valid = {
  actionId: contract.workflows["product-selection"].actions.find(action => ["browser.evaluate", "browser.runCode"].includes(action.kind)).actionId,
  workflow: "product-selection",
  route: "shopping",
  pageId: "https://shop.example/search?p=1",
  contractPath: "handbooks/webarena-shopping/references/execution-contract.json",
};
const state = { calls: new Map() };
const first = replay(valid, state);
assert.equal(first.ok, true);
assert.deepEqual(first.evidence.fields, ["items", "nextHref", "complete"]);
assert.equal(replay(valid, state).code, "page_budget_exceeded");
assert.equal(replay({ ...valid, route: "reddit" }, { calls: new Map() }).code, "route_mismatch");
assert.equal(replay({ ...valid, actionId: "browser.evaluate" }, { calls: new Map() }).code, "action_unknown");
assert.equal(replay({ ...valid, workflow: "reviews" }, { calls: new Map() }).code, "action_not_allowed");
assert.equal(resolveAction("reviews", valid.actionId).code, "action_not_allowed");

const orderCall = {
  ...valid,
  actionId: contract.workflows["order-aggregation"].actions.find(action => ["browser.evaluate", "browser.runCode"].includes(action.kind)).actionId,
  workflow: "order-aggregation",
  pageId: "http://localhost:7770/sales/order/history/",
};
const orderResolved = resolveAction(orderCall.workflow, orderCall.actionId);
assert.equal(orderResolved.ok, true);
assert.equal(replay(orderCall, { calls: new Map() }).ok, true);
assert.equal(replay(orderCall, { calls: new Map() }).evidence.fields.includes("evidenceStatus"), true);
assert.equal(replay({ ...orderCall, workflow: "product-selection" }, { calls: new Map() }).code, "action_not_allowed");
console.log("contract action replay passed: route, selector, budget, evidence");

// 在真实 Chromium DOM 上执行生成代码；HTTP fixture 不接触 benchmark 站点或答案。
const productSource = { actionId: "read_current_list_page_v1", selectors: {
  item: "li.product-item", fields: { name: "a.product-item-link", link: "a.product-item-link", price: ".price" },
  pagination: { next: "a.next", total: ".toolbar-amount", limiter: "select" },
} };
const orderSource = { actionId: "read_order_history_page_v1", selectors: {
  row: "tr.order", fields: { orderNumber: ".id", purchaseDate: ".date", grandTotal: ".total", status: ".status", detailLink: "a" },
  pagination: { next: "a.next", total: ".toolbar-amount" },
} };
const requests = [];
const server = http.createServer((request, response) => {
  requests.push(request.url);
  const u = new URL(request.url, "http://fixture");
  const scenario = u.searchParams.get("q") || "normal", second = u.searchParams.get("p") === "2";
  if (scenario === "http-error" && second) { response.writeHead(500); response.end(); return; }
  if (scenario === "redirect" && second) { response.writeHead(302, { location: "/customer/account/login/" }); response.end(); return; }
  let body = "";
  if (u.pathname.includes("/sales/order/history")) {
    body = '<div class="toolbar-amount">3 Items</div><table>' + [
      ["alpha", "3/1/23", "Complete", "$12.50"],
      ["beta", "03/31/2023", "Canceled", "$20.00"],
      ["gamma", "4/1/23", "Complete", "$7.50"],
    ].map(([id,date,status,total]) => `<tr class="order"><td class="id">${id}</td><td class="date">${date}</td><td class="status">${status}</td><td class="total">${total}</td><td><a href="/sales/order/view/${id}">View</a></td></tr>`).join("") + "</table>";
  } else if (scenario === "missing") {
    body = "<main>Login or changed markup</main>";
  } else if (scenario === "empty") {
    body = '<div class="toolbar-amount">0 Items</div>';
  } else {
    const total = scenario === "total-mismatch" ? 4 : 3;
    const ids = second ? ["B", "C"] : ["A", "B"];
    body = `<div class="toolbar-amount">Items 1-2 of ${total}</div><ul>` + ids.map(id =>
      `<li class="product-item"><a class="product-item-link" href="/${id}.html">${id === "B" && second && scenario === "changed" ? "Changed" : id}</a><div class="price-box"><span class="price">$12.50</span></div></li>`).join("") + "</ul>";
    if (!second || scenario === "cycle") {
      const next = new URL(u); next.searchParams.set("p", "2");
      if (scenario === "query-change") next.searchParams.set("q", "different");
      const href = scenario === "cross-origin" ? "https://example.invalid/?p=2" : next.pathname + next.search;
      body += `<div class="pages"><span class="pages-item-next"><a class="action next" href="${href.replaceAll('&', '&amp;')}">Next</a></span></div>`;
    }
    if (scenario === "limiter" && !u.searchParams.has("product_list_limit")) body += '<select><option selected>12</option><option>36</option></select>';
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(body);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
let checks = 0;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  const product = shoppingCollectionAction(productSource, 4);
  const order = shoppingCollectionAction(orderSource, 4);
  const run = async (scenario, args = {}, action = product, route = "/catalogsearch/result/") => {
    await page.goto(`${base}${route}?q=${scenario}`);
    const result = await new Function(`return (${action.javascript})`)()(page, args);
    checks += 1;
    return result;
  };
  let result = await run("normal");
  assert.equal(result.complete, true);
  assert.equal(result.scannedCount, 3);
  assert.deepEqual(result.items.map(item => item.name), ["A", "B", "C"]);
  assert.equal(result.pages.length, 2);
  assert.ok(result.items.every(item => item.pageId.startsWith(base)));
  assert.equal(new URL(page.url()).searchParams.get("p"), "2", "program must navigate the browser UI to the final page");
  result = await run("normal", { nameContains: ["C"] });
  assert.equal(result.scannedCount, 3);
  assert.equal(result.itemCount, 1);
  assert.equal(result.items[0].name, "C");
  assert.equal((await run("normal", { maxPages: 1 })).errors[0], "page_budget_exceeded");
  for (const [scenario, error] of [["cycle","pagination_cycle"], ["query-change","pagination_query_changed"], ["cross-origin","pagination_scope_mismatch"], ["total-mismatch","collection_count_mismatch"], ["changed","record_changed_between_pages"], ["missing","empty_or_selector_mismatch"], ["http-error","page_navigation_failed"]]) {
    result = await run(scenario);
    assert.equal(result.ok, false, scenario);
    assert.equal(result.complete, false, scenario);
    assert.equal(result.errors[0], error, scenario);
  }
  assert.equal((await run("redirect")).errors[0], "navigation_redirected");
  result = await run("empty");
  assert.equal(result.complete, true);
  assert.deepEqual(result.items, []);
  result = await run("limiter");
  assert.equal(result.complete, true);
  assert.ok(result.pages.every(p => p.url.includes("product_list_limit=36")));
  for (const args of [{ maxPages: 0 }, { maxPages: 5 }, { maxPages: "2" }, { javascript: "bad" }, { nameContains: [1] }]) {
    assert.equal((await run("normal", args)).errors[0], "invalid_arguments");
  }
  result = await run("orders", { status: "Complete", dateFrom: "2023-03-01", dateTo: "2023-03-31" }, order, "/sales/order/history/");
  assert.equal(result.complete, true);
  assert.deepEqual(result.orders.map(o => o.orderNumber), ["alpha"]);
  assert.equal(result.scannedCount, 3);
  assert.equal((await run("orders", { dateFrom: "2023-02-30" }, order, "/sales/order/history/")).errors[0], "invalid_arguments");
  // 正式发布的程序也必须可执行，防止只测到独立模板而未测生成器接线。
  const published = contract.workflows["catalog-aggregation"].actions.find(a => a.inputSchema);
  assert.ok(published, "published catalog must expose a parameterized program");
  assert.equal((await run("normal", { maxPages: 2 }, published)).complete, true);
  assert.ok(!product.javascript.includes("fetch("), "program must not use direct HTTP shortcuts");
  console.log(`generated collection browser replay passed: ${checks} scenarios`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
