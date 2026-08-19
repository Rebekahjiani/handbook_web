#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  replayNetworkEvent,
  replayIdentity,
  replayMutationContract,
  readNetworkJsonl,
} from "./offline-contract-replay.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWorkflowHandbook,
  rankTaskLinks,
  taskDrivenRouteHints,
} from "./task-workflows.mjs";
import { loadContextModel } from "./context-model.mjs";
import redditWorkflows from "./workflows/reddit.mjs";
import { auditRouter } from "./router-audit.mjs";
import { summarizeRepeatedRuns } from "./summarize-repeated-runs.mjs";

const page = {
  url: "https://shop.example/",
  title: "示例商店",
  slug: "01-home",
  headings: ["商品"],
  links: [
    "https://shop.example/electronics/computers/data-storage.html",
    "https://shop.example/clothing/women.html",
    "https://shop.example/clothing/women/clothing.html",
  ],
  unresolvedActionCount: 0,
  structures: [
    {
      id: "product-list",
      itemSelector: "li.product-item",
      itemCount: 12,
      fields: {
        name: "a.product-item-link",
        price: ".price-box .price",
        link: "a.product-item-link",
      },
    },
    {
      id: "pagination",
      nextSelector: ".pages .pages-item-next > a.action.next",
      limiterSelector: "select[data-role='limiter']",
      totalSelector: ".toolbar-amount",
    },
  ],
  actions: [
    {
      role: "textbox",
      name: "Search",
      href: "",
      context: "main",
      region: "main",
      primary: {
        kind: "role",
        role: "textbox",
        name: "Search",
        exact: true,
      },
    },
  ],
};

const contextModel = {
  source: "fixture",
  objects: [
    {
      id: "order",
      name: "Order",
      fields: ["order_number", "purchase_date", "status", "grand_total"],
    },
  ],
  contexts: [],
  capabilities: [],
  surfaces: [
    {
      id: "order-history",
      url_pattern: "^https://shop.example/orders$",
      required_locator_ids: ["history-row"],
      required_field_ids: ["order_number", "status"],
    },
  ],
  actions: [],
  locators: [
    {
      id: "history-row",
      selector: "table.orders > tbody > tr",
      scope: "document",
      verification_status: "verified",
    },
    {
      id: "history-empty",
      selector: ".empty",
      scope: "document",
      verification_status: "unverified",
    },
  ],
};

const generated = buildWorkflowHandbook({
  siteName: "示例商店",
  skillName: "use-example-shop",
  origin: "https://shop.example",
  siteKey: "example",
  pages: [page],
  tasks: [
    {
      task_id: 1,
      intent: "Get my complete orders over the past year",
      task_type: "retrieve",
    },
    {
      task_id: 2,
      intent: "Find the least expensive product",
      task_type: "retrieve",
    },
    {
      task_id: 3,
      intent: "Get all review titles with 2 stars or below",
      task_type: "retrieve",
    },
    {
      task_id: 4,
      intent: "Provide the full names and price range for available models",
      task_type: "retrieve",
    },
  ],
  contextModel,
});

const shoppingContextModel = {
  ...contextModel,
  capabilities: [{ id: "order-aggregation" }],
  bindings: [
    {
      surfaces: [{ id: "storefront-order-history" }],
      locators: [
        { id: "history-row", selector: "table#my-orders-table.history > tbody > tr" },
        { id: "order-number", selector: ':scope > td[data-th="Order #"]' },
        { id: "purchase-date", selector: ':scope > td[data-th="Date"]' },
        { id: "grand-total", selector: ':scope > td[data-th="Order Total"] .price' },
        { id: "order-status", selector: ':scope > td[data-th="Status"]' },
        { id: "detail-link", selector: ':scope > td[data-th="Actions"] > a.action.view' },
        { id: "history-next", selector: ".pages .pages-item-next > a.action.next" },
      ],
      history_table: {
        row_locator_id: "history-row",
        field_locator_ids: {
          order_number: "order-number",
          purchase_date: "purchase-date",
          grand_total: "grand-total",
          status: "order-status",
          detail_link: "detail-link",
        },
      },
      pagination: { next_locator_id: "history-next" },
    },
  ],
};

const shoppingGenerated = buildWorkflowHandbook({
  siteName: "webarena-shopping",
  skillName: "use-webarena-shopping",
  origin: "http://localhost:7770",
  siteKey: "shopping",
  pages: [page],
  coverageTasks: [],
  focusTasks: [],
  contextModel: shoppingContextModel,
  evidenceOnly: true,
});

const independentlyGenerated = buildWorkflowHandbook({
  siteName: "独立探索商店",
  skillName: "use-independent-shop",
  origin: "https://shop.example",
  siteKey: "example",
  pages: [page],
  contextModel,
  evidenceOnly: true,
});
assert.equal(independentlyGenerated.coverage.taskCount, 0);
assert.deepEqual(
  ["https://shop.example/b", "https://shop.example/a"].sort(),
  ["https://shop.example/a", "https://shop.example/b"],
);
assert.ok(
  independentlyGenerated.router.routes.every(
    (route) => route.runtime_contract_file && route.runtime_mode,
  ),
);
assert.ok(
  independentlyGenerated.router.routes
    .filter((route) => route.route !== "other")
    .every((route) => route.route !== "order-aggregation" || route.runtime_mode === "workflow_skill"),
);
assert.ok(!independentlyGenerated.router.routes.some((route) => route.route === "account-forms"));
assert.ok(!independentlyGenerated.router.routes.some((route) => route.route === "edit-submit"));
assert.ok(!independentlyGenerated.router.routes.some((route) => route.route === "read-content"));
assert.ok(!independentlyGenerated.router.routes.some((route) => route.route === "order-aggregation"));

const formalContextRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formal-context-model-"));
await fs.mkdir(path.join(formalContextRoot, "business-core", "capabilities"), { recursive: true });
await fs.mkdir(path.join(formalContextRoot, "platform-core", "surfaces", "catalog-listing"), { recursive: true });
await fs.mkdir(path.join(formalContextRoot, "context-model"), { recursive: true });
await fs.writeFile(path.join(formalContextRoot, "business-core", "object-model.json"), JSON.stringify({ objects: [{ id: "catalog", name: "Catalog", fields: ["products"] }] }));
await fs.writeFile(path.join(formalContextRoot, "business-core", "business-context.json"), JSON.stringify({ contexts: [{ id: "catalog-browsing", description: "Catalog browsing" }] }));
await fs.writeFile(path.join(formalContextRoot, "business-core", "capabilities", "read-catalog.json"), JSON.stringify({ id: "read-catalog", object_ids: ["catalog"], inputs: ["catalog scope"], outputs: ["products"], requires_context_ids: ["catalog-browsing"], business_conditions: ["catalog available"] }));
await fs.writeFile(path.join(formalContextRoot, "platform-core", "surfaces.json"), JSON.stringify({ surfaces: [{ id: "catalog-listing", display_name: "Catalog listing", kind: "web" }] }));
await fs.writeFile(path.join(formalContextRoot, "platform-core", "surfaces", "catalog-listing", "actions.json"), JSON.stringify({ actions: [{ id: "read-catalog-result-set", kind: "context", intent: "Read catalog" }] }));
await fs.writeFile(path.join(formalContextRoot, "context-model", "capability-bindings.json"), JSON.stringify({ bindings: [{ id: "read-catalog-on-listing", capability_id: "read-catalog", surface_id: "catalog-listing", platform_action_ids: ["read-catalog-result-set"], evidence_ids: ["catalog-evidence"], status: "supported" }] }));
const loadedFormalContext = await loadContextModel(formalContextRoot);
assert.ok(loadedFormalContext.surfaces.some((surface) => surface.id === "catalog-listing"));
assert.ok(loadedFormalContext.actions.some((action) => action.id === "read-catalog-result-set"));
assert.ok(loadedFormalContext.bindings.some((binding) => binding.id === "read-catalog-on-listing"));

const generatedWorkflowNames = Object.keys(generated.workflows);
for (const required of [
  "order-aggregation.md",
  "reviews.md",
  "category-navigation.md",
  "catalog-aggregation.md",
  "product-selection.md",
  "search-discovery.md",
  "read-content.md",
  "edit-submit.md",
  "navigation.md",
  "other.md",
]) {
  assert.ok(generatedWorkflowNames.includes(required), `missing ${required}`);
}
assert.ok(!generated.workflows["order-aggregation.md"].includes("任务样例"));
assert.ok(generated.workflows["order-aggregation.md"].includes("order-history"));
assert.ok(generated.workflows["order-aggregation.md"].includes("history-row"));
assert.ok(!generated.workflows["order-aggregation.md"].includes("history-empty"));
assert.ok(generated.runtimeSkills["order-aggregation/SKILL.md"]);
assert.ok(generated.runtimeSkills["product-selection/SKILL.md"]);
assert.ok(generated.runtimeContracts["order-aggregation.json"]);
assert.equal(
  generated.runtimeContracts["order-aggregation.json"].workflow,
  "order-aggregation",
);
assert.equal(
  generated.router.routes[0].runtime_contract_file,
  "runtime-contracts/order-aggregation.json",
);
assert.equal(generated.router.routes[0].runtime_mode, "workflow_skill");
assert.equal(
  generated.router.routes.find((route) => route.route === "reviews").runtime_mode,
  "contract_only",
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "已验证批量读取结构",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "提交前重新读取当前 URL",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "`most expensive` 按价格降序",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "`accepted_candidates`",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "多平台配件可用明确兼容性",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "## 完成证明",
  ),
);
assert.ok(
  generated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    "N*30 天",
  ),
);
assert.ok(
  generated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    "严格晚于下界",
  ),
);
assert.ok(
  generated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    "past months",
  ),
);
assert.ok(
  generated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    "不要打开订单历史",
  ),
);
assert.ok(
  generated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    "明确保留商品行金额",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "li.product-item",
  ),
);
assert.ok(
  !generated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    "li.product-item",
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    "唯一允许的列表读取动作",
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    'actionId: "read_current_list_page_v1"',
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    'const nameNode = card.querySelector("a.product-item-link")',
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    'priceText.replace(/,/g, "").match(/\\d+(?:\\.\\d{1,2})?/)',
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    'next.closest(".disabled, [aria-disabled=\\"true\\"]")',
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    "itemCount: items.length",
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    "ignoredCardCount: rawCards.length - cards.length",
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    "limiterOptions",
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    "不得为了寻找侧栏品牌筛选器而切换到宽泛分类页",
  ),
);
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "一旦出现验收通过的候选，补充查询预算立即归零",
  ),
);
assert.ok(
  generated.runtimeSkills["catalog-aggregation/SKILL.md"].includes(
    "complete: nextHref === null",
  ),
);
const listTemplate = generated.runtimeSkills["catalog-aggregation/SKILL.md"].match(
  /```js\n([\s\S]*?)\n```/,
)?.[1];
assert.ok(listTemplate);
assert.doesNotThrow(() => new Function(`return (${listTemplate});`));
assert.ok(
  generated.runtimeSkills["product-selection/SKILL.md"].includes(
    "## 最终状态闸门",
  ),
);
assert.ok(generated.executionContract);
assert.equal(generated.executionContract.schemaVersion, 1);
assert.ok(generated.executionContract.workflows["catalog-aggregation"]);
assert.equal(
  generated.executionContract.workflows["catalog-aggregation"].actions[0].actionId,
  "read_current_list_page_v1",
);
assert.equal(
  generated.executionContract.workflows["catalog-aggregation"].actions[0].selectors
    .item,
  "li.product-item",
);
assert.equal(
  generated.executionContract.workflows["catalog-aggregation"].budgets
    .listReadMaxCallsPerPageId,
  1,
);
assert.equal(
  generated.executionContract.workflows["catalog-aggregation"].budgets
    .customListEvaluateMaxCalls,
  0,
);
assert.equal(
  generated.executionContract.workflows["order-aggregation"].actions.length,
  0,
);
const orderIR = generated.executionContract.workflows["order-aggregation"].ir;
assert.equal(orderIR.schemaVersion, 2);
assert.equal(orderIR.route.workflow, "order-aggregation");
assert.ok(Array.isArray(orderIR.allowedActions));
assert.ok(orderIR.postStateGate.lifecycleGate.requiredBefore === "SUCCESS");
assert.ok(orderIR.target.entity);
assert.ok(orderIR.observation.currentState);
assert.ok(orderIR.successContract.targetGate);
assert.deepEqual(orderIR.page.forms, []);
const shoppingOrderIR = shoppingGenerated.executionContract.workflows["order-aggregation"].ir;
assert.equal(shoppingOrderIR.selectionContract.entity, "order_set");
assert.ok(shoppingOrderIR.selectionContract.preserveTaskConstraints.includes("product_category"));
assert.equal(
  shoppingOrderIR.selectionContract.amountFieldByConstraint.excludeShippingAndHandling,
  "item_subtotal",
);
assert.ok(
  shoppingGenerated.runtimeSkills["order-aggregation/SKILL.md"].includes(
    '"excludeShippingAndHandling":"item_subtotal"',
  ),
);
const orderPreflightGuards =
  generated.executionContract.workflows["order-aggregation"].preflightGuards;
assert.equal(orderPreflightGuards.length, 1);
assert.equal(orderPreflightGuards[0].id, "missing-past-months-window");
assert.equal(orderPreflightGuards[0].action.type, "return_zero_value");
assert.equal(orderPreflightGuards[0].before, "browser.navigation");
assert.equal(
  generated.executionContract.workflows["product-selection"].budgets
    .zeroSupplementalQueryBudgetAfterAcceptedCandidate,
  true,
);
assert.equal(
  generated.executionContract.workflows["product-selection"].finalStateGate
    .actionId,
  "verify_final_state_v1",
);
const mutationContract = Object.values(generated.executionContract.workflows)
  .find((workflow) => workflow.mutation);
assert.ok(mutationContract);
assert.ok(Array.isArray(mutationContract.mutation.requiredNetworkEvents));
assert.ok(mutationContract.ir);
assert.ok(mutationContract.ir.page.forms.length >= 0);
assert.equal(mutationContract.ir.page.structures.length, 0);
assert.ok(Array.isArray(mutationContract.ir.requiredNetworkEvents));
assert.deepEqual(
  mutationContract.mutation.networkEventExcludePathPatterns,
  ["^/(?:login(?:_check)?|logout|registration)(?:/|$)"],
);
assert.ok(
  generated.router.routes.every(
    (route) =>
      route.contract_file === "references/execution-contract.json" &&
      route.contract_workflow === route.route,
  ),
);
const redditGenerated = buildWorkflowHandbook({
  siteName: "webarena-reddit",
  skillName: "use-webarena-reddit",
  origin: "http://localhost:9999",
  siteKey: "reddit",
  pages: [page],
  tasks: [
    {
      task_id: 580,
      sites: ["reddit"],
      start_urls: ["__REDDIT__/"],
      intent: 'Create a new forum with name and title "sci_fi"',
    },
    {
      task_id: 610,
      sites: ["reddit"],
      start_urls: ["__REDDIT__/"],
      intent: 'Post a question in the books forum',
    },
    {
      task_id: 611,
      sites: ["reddit"],
      start_urls: ["__REDDIT__/"],
      intent: 'Reply to a post in the books forum',
    },
    {
      task_id: 612,
      sites: ["reddit"],
      start_urls: ["__REDDIT__/"],
      intent: 'Upvote the newest post in the books forum',
    },
  ],
  workflowDefs: redditWorkflows,
});
assert.ok(
  redditGenerated.executionContract.workflows["forum-create"].mutation
    .requiredNetworkEvents.some((event) => event.urlPattern === "/create_forum$"),
);
for (const [workflow, pattern] of [
  ["post-create", "/submit(?:/[^/]+)?$"],
  ["post-reply", "/f/[^/]+/[^/]+/-/comment$"],
  ["vote", "/(?:sv|f/[^/]+/[^/]+/-/(?:upvote|downvote))"],
]) {
  const contract = redditGenerated.executionContract.workflows[workflow];
  assert.equal(contract.ir.schemaVersion, 2);
  assert.equal(contract.mutation.contractCoverage, "target_event_specified");
  assert.ok(contract.mutation.requiredNetworkEvents.some((event) => event.urlPattern === pattern));
  assert.ok(contract.ir.target.entity);
  assert.ok(contract.ir.target.desiredState);
  assert.ok(contract.ir.successContract.targetGate);
}
assert.ok(
  redditGenerated.runtimeSkills["forum-create/SKILL.md"].includes(
    "forum[name]",
  ),
);
assert.ok(
  redditGenerated.runtimeSkills["forum-create/SKILL.md"].includes(
    "可重复测试",
  ),
);
assert.ok(
  generated.runtimeSkills["reviews/SKILL.md"].includes(
    "标题 + 评分 + 作者 + 正文",
  ),
);
const shoppingMutationContracts = Object.values(generated.executionContract.workflows || {})
  .filter((workflow) => workflow.workflow === "account-forms" || workflow.workflow === "edit-submit")
  .map((workflow) => workflow.mutation);
assert.ok(shoppingMutationContracts.every((mutation) => mutation.contractCoverage === "adapter_evidence_required"));
assert.ok(shoppingMutationContracts.every((mutation) => mutation.requireNetworkMutationEvent === false));
assert.equal(generated.router.routes.length, generatedWorkflowNames.length);
assert.equal(
  generated.router.routes[0].skill_file,
  "runtime-skills/order-aggregation/SKILL.md",
);
assert.equal(generated.router.routes.at(-1).route, "other");
assert.equal(generated.router.routes.at(-1).fallback, true);
const subscribeHar = {
  log: { entries: [{
    request: {
      method: "POST",
      url: "http://localhost:9999/f/books/subscribe.json",
      headers: [{ name: "Referer", value: "http://localhost:9999/f/books/1/title" }],
    },
    response: { status: 200, content: { text: JSON.stringify({ subscribed: true }) } },
  }] },
};
const subscribeExpected = {
  http_method: "POST",
  url: "http://localhost:9999/f/books/subscribe.json",
  response_status: 200,
  response_content: { subscribed: true },
};
assert.equal(replayNetworkEvent(subscribeHar, subscribeExpected).verdict, "correct_target_event");
const incompleteHar = structuredClone(subscribeHar);
delete incompleteHar.log.entries[0].response.content.text;
assert.equal(replayNetworkEvent(incompleteHar, subscribeExpected).verdict, "body_missing");
const bodyTrace = await fs.mkdtemp(path.join(os.tmpdir(), "handbook-network-jsonl-"));
await fs.mkdir(path.join(bodyTrace, "rawbody"));
await fs.writeFile(path.join(bodyTrace, "network.jsonl"), [
  JSON.stringify({ type: "request", timestamp: 1, method: "POST", url: "http://localhost:9999/f/books/subscribe.json", headers: {}, postData: { id: "books" } }),
  JSON.stringify({ type: "response", timestamp: 2, url: "http://localhost:9999/f/books/subscribe.json", status: 200, bodyPath: "./rawbody/missing.json" }),
].join("\n"));
const jsonlEvidence = readNetworkJsonl(bodyTrace);
assert.equal(replayNetworkEvent(jsonlEvidence, subscribeExpected).verdict, "body_missing");
await fs.writeFile(path.join(bodyTrace, "rawbody/error.json"), "{}");
await fs.writeFile(path.join(bodyTrace, "network.jsonl"), [
  JSON.stringify({ type: "request", timestamp: 1, method: "POST", url: "http://localhost:9999/f/books/subscribe.json", headers: {} }),
  JSON.stringify({ type: "response", timestamp: 2, url: "http://localhost:9999/f/books/subscribe.json", status: 200, bodyPath: "./rawbody/error.json", bodyError: "capture failed" }),
].join("\n"));
assert.equal(replayNetworkEvent(readNetworkJsonl(bodyTrace), subscribeExpected).verdict, "body_capture_error");
await fs.writeFile(path.join(bodyTrace, "network.jsonl"), [
  JSON.stringify({ type: "request", timestamp: 1, method: "POST", url: "http://localhost:9999/f/books/subscribe.json", headers: {} }),
  JSON.stringify({ type: "request", timestamp: 1.1, method: "POST", url: "http://localhost:9999/f/books/subscribe.json", headers: {} }),
  JSON.stringify({ type: "response", timestamp: 2, url: "http://localhost:9999/f/books/subscribe.json", status: 200, bodyPath: "./rawbody/error.json", bodyError: "capture failed" }),
  JSON.stringify({ type: "response", timestamp: 2.1, url: "http://localhost:9999/f/books/subscribe.json", status: 200, bodyPath: "./rawbody/error.json", bodyError: "capture failed" }),
].join("\n"));
assert.equal(replayNetworkEvent(readNetworkJsonl(bodyTrace), subscribeExpected).verdict, "pairing_uncertain");
await fs.rm(bodyTrace, { recursive: true });
assert.equal(
  replayIdentity(
    "http://localhost:7770/wrong-product.html",
    "http://localhost:7770/right-product.html",
  ).verdict,
  "target_identity_mismatch",
);
const unsubscribeHar = {
  log: { entries: [{
    request: { method: "POST", url: "http://localhost:9999/f/books/unsubscribe.json", headers: [] },
    response: { status: 200, content: { text: JSON.stringify({ subscribed: false }) } },
  }] },
};
assert.equal(
  replayMutationContract(unsubscribeHar, {
    method: "POST",
    endpointPattern: "/f/[^/]+/(?:subscribe|unsubscribe)\\.json$",
    semanticTarget: "subscription",
    direction: "subscribe",
  }).verdict,
  "mutation_direction_mismatch",
);
const routeAudit = auditRouter({
  router: generated.router,
  tasks: [
    {
      task_id: 1,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "Get my complete orders over the past year",
    },
    {
      task_id: 2,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "A request with wording that no specialized route knows",
    },
  ],
  siteKey: "example",
  origin: "https://shop.example",
});
assert.equal(routeAudit.unmatched_count, 0);
assert.equal(routeAudit.assigned_count, 2);
assert.equal(routeAudit.assignments[1].route, "other");
assert.equal(routeAudit.fallback_assignment_count, 1);
assert.equal(routeAudit.passed, false);
const allowedFallbackAudit = auditRouter({
  router: generated.router,
  tasks: [
    {
      task_id: 2,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "A request with wording that no specialized route knows",
    },
  ],
  siteKey: "example",
  origin: "https://shop.example",
  allowFallbackAssignments: true,
});
assert.equal(allowedFallbackAudit.passed, true);
const priorityAudit = auditRouter({
  router: {
    routes: [
      {
        route: "later",
        priority: 20,
        site_keys: ["example"],
        origin_pattern: "^https://shop\\.example(?:/|$)",
        intent_pattern: "orders",
      },
      {
        route: "earlier",
        priority: 10,
        site_keys: ["example"],
        origin_pattern: "^https://shop\\.example(?:/|$)",
        intent_pattern: "complete orders",
      },
    ],
  },
  tasks: [
    {
      task_id: 9,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "Get my complete orders",
    },
  ],
  siteKey: "example",
  origin: "https://shop.example",
});
assert.equal(priorityAudit.assignments[0].route, "earlier");
assert.equal(priorityAudit.conflict_count, 1);
assert.equal(priorityAudit.passed, false);
const removalAudit = auditRouter({
  router: generated.router,
  tasks: [],
  siteKey: "example",
  origin: "https://shop.example",
  previousRouter: {
    routes: [...generated.router.routes, { route: "legacy-route" }],
  },
});
assert.equal(removalAudit.passed, false);
assert.deepEqual(removalAudit.removed_routes, ["legacy-route"]);
assert.ok(generated.contextModel.includes("站点模型索引"));
assert.equal(generated.coverage.schemaVersion, 2);
assert.equal(generated.router.routing_mode, "capability_signature_v2");
assert.ok(generated.router.capabilities.some((item) => item.route === "order-aggregation"));
assert.ok(generated.executionContract.workflows["order-aggregation"].answerEvidenceGate);

const focused = buildWorkflowHandbook({
  siteName: "示例商店",
  skillName: "use-example-shop",
  origin: "https://shop.example",
  siteKey: "example",
  pages: [page],
  coverageTasks: [
    {
      task_id: 1,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "Get my complete orders over the past year",
    },
    {
      task_id: 2,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "Find the least expensive product",
    },
  ],
  focusTasks: [
    {
      task_id: 1,
      sites: ["example"],
      start_urls: ["__EXAMPLE__/"],
      intent: "Get my complete orders over the past year",
    },
  ],
  contextModel,
});
assert.ok(focused.runtimeSkills["product-selection/SKILL.md"]);
assert.equal(focused.coverage.coverageTaskCount, 2);
assert.equal(focused.coverage.focusTaskCount, 1);

const categoryTask = {
  task_id: 3,
  intent: "Open the Woman clothing category page",
};
assert.equal(
  taskDrivenRouteHints(
    [categoryTask],
    [page],
    "https://shop.example",
  )[0].path,
  "/clothing/women/clothing.html",
);
assert.equal(
  rankTaskLinks(
    page.links,
    [categoryTask],
    "https://shop.example",
  )[0],
  "https://shop.example/clothing/women/clothing.html",
);

const withoutTasks = buildWorkflowHandbook({
  siteName: "示例商店",
  skillName: "use-example-shop",
  origin: "https://shop.example",
  pages: [page],
  tasks: [],
  contextModel,
});
assert.ok(withoutTasks.workflows["order-aggregation.md"]);
assert.ok(withoutTasks.workflows["search-discovery.md"]);

const evidenceOnly = buildWorkflowHandbook({
  siteName: "示例商店",
  skillName: "use-example-shop",
  origin: "https://shop.example",
  siteKey: "example",
  pages: [page],
  tasks: [],
  contextModel,
  evidenceOnly: true,
});
assert.ok(!evidenceOnly.runtimeSkills["order-aggregation/SKILL.md"]);

const repeatRoot = await fs.mkdtemp(path.join(os.tmpdir(), "handbook-repeats-"));
const attempts = ["attempt-1", "attempt-2", "attempt-3"];
for (const [index, attempt] of attempts.entries()) {
  const taskDir = path.join(repeatRoot, attempt, "7");
  await fs.mkdir(taskDir, { recursive: true });
  await fs.writeFile(
    path.join(taskDir, "eval_result.json"),
    JSON.stringify({ task_id: 7, score: index === 1 ? 0 : 1 }),
  );
}
const repeated = await summarizeRepeatedRuns({
  roots: attempts.map((attempt) => path.join(repeatRoot, attempt)),
  ids: ["7"],
  minAttempts: 2,
});
assert.equal(repeated.tasks[0].pass_rate, 2 / 3);
assert.equal(repeated.tasks[0].stability, "unstable");
assert.equal(repeated.gate_passed, false);
await fs.rm(repeatRoot, { recursive: true });

process.stdout.write("generator tests passed\n");
