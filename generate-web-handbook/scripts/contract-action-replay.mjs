import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const contractPath = path.resolve("../handbooks/webarena-shopping/references/execution-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

function resolveAction(workflow, actionId) {
  const item = contract.workflows?.[workflow];
  if (!item) return { ok: false, code: "workflow_unknown" };
  const action = (item.actions || []).find((candidate) => candidate.actionId === actionId);
  if (!action) return { ok: false, code: "action_not_allowed" };
  if (action.kind !== "browser.evaluate" || typeof action.javascript !== "string") {
    return { ok: false, code: "action_not_executable" };
  }
  const validList = action.selectors?.item && action.selectors?.fields?.name && action.selectors?.fields?.link;
  const validOrders = actionId === "read_order_history_page_v1" &&
    action.selectors?.row && action.selectors?.fields?.orderNumber &&
    action.selectors?.fields?.purchaseDate && action.selectors?.fields?.grandTotal &&
    action.selectors?.fields?.status && action.selectors?.fields?.detailLink;
  if (!validList && !validOrders) {
    return { ok: false, code: "selector_evidence_missing" };
  }
  return { ok: true, action, maxCalls: action.maxCallsPerPageId ?? 1 };
}

function replay(call, state) {
  if (!['read_current_list_page_v1', 'read_order_history_page_v1'].includes(call.actionId)) return { ok: false, code: "action_unknown" };
  if (!call.contractPath.endsWith("execution-contract.json")) return { ok: false, code: "contract_path_invalid" };
  if (call.route !== "shopping") return { ok: false, code: "route_mismatch" };
  const resolved = resolveAction(call.workflow, call.actionId);
  if (!resolved.ok) return resolved;
  const count = state.calls.get(call.pageId) || 0;
  if (count >= resolved.maxCalls) return { ok: false, code: "page_budget_exceeded" };
  state.calls.set(call.pageId, count + 1);
  const orderAction = call.actionId === "read_order_history_page_v1";
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
  actionId: "read_current_list_page_v1",
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
  actionId: "read_order_history_page_v1",
  workflow: "order-aggregation",
  pageId: "http://localhost:7770/sales/order/history/",
};
const orderResolved = resolveAction(orderCall.workflow, orderCall.actionId);
assert.equal(orderResolved.ok, true);
assert.equal(replay(orderCall, { calls: new Map() }).ok, true);
assert.equal(replay(orderCall, { calls: new Map() }).evidence.fields.includes("evidenceStatus"), true);
assert.equal(replay({ ...orderCall, workflow: "product-selection" }, { calls: new Map() }).code, "action_not_allowed");
console.log("contract action replay passed: route, selector, budget, evidence");
