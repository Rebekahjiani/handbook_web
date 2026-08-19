#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  auditCapabilityCoverage,
  parseTaskRequirements,
  routeByCapability,
} from "./capability-router.mjs";
import {
  appendOrderObservation,
  aggregateTyped,
  applyTypedFilters,
  createOrderEvidenceLedger,
  selectDetailRows,
  verifyLedgerInvariants,
  verifyAnswerEvidence,
} from "./evidence-ledger.mjs";
import {
  buildContextModelProvenance,
  evaluateExplorationConvergence,
} from "./context-model-provenance.mjs";
import { evaluateCandidatePromotion } from "./candidate-promotion-gate.mjs";

const router = {
  routing_mode: "capability_signature_v2",
  capabilities: [
    {
      route: "order-aggregation",
      priority: 100,
      signature: {
        entity: "order",
        operations: ["aggregate", "lookup"],
        selection: [
          { field: "purchase_date", operator: "latest" },
          { field: "status", operator: "eq", value: "pending" },
        ],
        outputs: ["order_number", "purchase_date", "status", "grand_total"].map((field) => ({ field, type: field === "grand_total" ? "number" : "string" })),
        executionDependencies: ["detail_url"],
        requiresDetail: true,
      },
    },
  ],
};

const requirements = parseTaskRequirements("Find the latest pending order and return the grand total");
assert.equal(requirements.entity, "order");
assert.equal(requirements.selection.some((item) => item.operator === "latest"), true);
assert.equal(requirements.selection.some((item) => item.value === "pending"), true);
assert.equal(requirements.required_fields.includes("grand_total"), true);
assert.equal(routeByCapability(requirements, router).route, "order-aggregation");
assert.equal(routeByCapability("Find the latest Reddit post", router).fallback, true);
const unboundedMonths = parseTaskRequirements("Today is June 12, 2023. Get complete orders over the past months");
assert.equal(unboundedMonths.unknown_requirements.includes("purchase_date.range_bounds"), true);
assert.equal(routeByCapability(unboundedMonths, router).reason, "unknown_requirements");
const boundedEnglishMonth = parseTaskRequirements("Find orders on March 3, 2023");
assert.equal(boundedEnglishMonth.selection.some((item) => item.operator === "eq" && item.field === "purchase_date"), true);
const amountRequirements = parseTaskRequirements("Count complete orders over the past four months and return the total amount including shipping");
assert.deepEqual(amountRequirements.amount_semantics, { field: "grand_total", includes: ["shipping", "handling"] });
const coverage = auditCapabilityCoverage([
  { task_id: 1, intent: "Find the latest pending order and return the grand total" },
  { task_id: 2, intent: "Find the latest Reddit post" },
], router);
assert.equal(coverage.routed_count, 1);
assert.equal(coverage.abstention_count, 1);

let ledger = createOrderEvidenceLedger();
ledger = appendOrderObservation(ledger, { actionId: "read_order_history_page_v1", runId: "run-1", pageId: "/sales/order/history/", totalText: "1 item", nextHref: "/sales/order/history/?p=2", orders: [{ orderNumber: "000000148", purchaseDate: "2023-01-29", status: "Complete", detailUrl: "/order/148", evidenceStatus: "verified" }] });
ledger = appendOrderObservation(ledger, { actionId: "read_order_history_page_v1", runId: "run-1", pageId: "/sales/order/history/?p=2", totalText: "1 item", nextHref: null, orders: [] });
ledger = applyTypedFilters(ledger, { status: { operator: "neq", value: "Canceled" } });
ledger = selectDetailRows(ledger, [{ orderRecordId: "000000148", itemId: "item-1", date: "2023-01-29", category: "home decoration", item_subtotal: "$260.69", provenance: { actionId: "read_order_detail_v1", runId: "run-1", pageId: "/order/148" } }], "item_subtotal");
ledger = aggregateTyped(ledger, { op: "sum", rows: "selectedDetailRows", field: "item_subtotal" });
assert.equal(verifyLedgerInvariants(ledger).passed, true);
const verified = verifyAnswerEvidence({
  answer: 260.69,
  evidenceRecordIds: ["000000148:item-1"],
  filters: { exact_date: "2023-01-29", category: "home decoration" },
  amountField: "item_subtotal",
  ledger,
});
assert.equal(verified.ok, true);
assert.equal(verifyAnswerEvidence({ answer: 10, evidenceRecordIds: ["000000148:item-1"], filters: {}, amountField: "item_subtotal", ledger }).ok, false);

const convergence = evaluateExplorationConvergence([
  { newSurfaces: 1, newActions: 1, newSchemas: 1, newCapabilities: 1 },
  { newSurfaces: 0, newActions: 0, newSchemas: 0, newCapabilities: 0 },
  { newSurfaces: 0, newActions: 0, newSchemas: 0, newCapabilities: 0 },
  { newSurfaces: 0, newActions: 0, newSchemas: 0, newCapabilities: 0 },
], { stableRounds: 3, capabilityEvidenceClosed: true, unresolvedItems: [] });
assert.equal(convergence.converged, true);
const provenance = buildContextModelProvenance({
  stages: { raw_evidence: { trace: "trace-1" }, reviewed_evidence: { reviewed: true }, platform_core: { surfaces: 1 }, business_core: { objects: 1 }, capability_binding: { bindings: 1 }, validation: { status: "passed" }, freeze: { status: "frozen" } },
  convergence,
  commands: { raw_evidence: "explore-site --budget 30", validation: "validate-context-model" },
  humanJudgments: [{ item: "order amount semantics", decision: "item_subtotal", reviewer: "exploration-policy" }],
});
assert.equal(provenance.status, "ready_to_freeze");
assert.equal(provenance.records.length, 7);
assert.deepEqual(provenance.records[0].command, ["explore-site --budget 30"]);
const provenanceAgain = buildContextModelProvenance({
  stages: { raw_evidence: { trace: "trace-1" }, reviewed_evidence: { reviewed: true }, platform_core: { surfaces: 1 }, business_core: { objects: 1 }, capability_binding: { bindings: 1 }, validation: { status: "passed" }, freeze: { status: "frozen" } },
  convergence,
  commands: { raw_evidence: "explore-site --budget 30", validation: "validate-context-model" },
});
assert.deepEqual(provenance.records.map((record) => record.outputArtifacts), provenanceAgain.records.map((record) => record.outputArtifacts));

const blockedPromotion = evaluateCandidatePromotion({
  candidate: "candidate-1",
  environment: { snapshot_consistent: false },
  oracle: { lift_reproduced: false },
  candidate_vs_placebo: { paired_tasks: 5, net_gain: 0, negative_flips: 1 },
  runtime: { required_action_coverage: 0.5 },
  cost: { input_token_delta_pct: 47.77 },
  thresholds: { min_paired_tasks: 10, max_negative_flips: 0, min_required_action_coverage: 1, max_input_token_delta_pct: 0 },
});
assert.equal(blockedPromotion.passed, false);
assert.deepEqual(blockedPromotion.failed_checks, [
  "snapshot_consistent",
  "oracle_lift_reproduced",
  "minimum_paired_tasks",
  "positive_net_gain",
  "negative_flip_budget",
  "runtime_action_coverage",
  "input_token_budget",
]);
const acceptedPromotion = evaluateCandidatePromotion({
  candidate: "candidate-2",
  environment: { snapshot_consistent: true },
  oracle: { lift_reproduced: true },
  candidate_vs_placebo: { paired_tasks: 20, net_gain: 2, negative_flips: 0 },
  runtime: { required_action_coverage: 1 },
  cost: { input_token_delta_pct: -5 },
  thresholds: { min_paired_tasks: 10, max_negative_flips: 0, min_required_action_coverage: 1, max_input_token_delta_pct: 0 },
});
assert.equal(acceptedPromotion.passed, true);

console.log("contract evidence tests passed: capability router, ledger, answer gate, provenance, promotion gate");
