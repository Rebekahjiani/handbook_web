#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWorkflowHandbook,
  rankTaskLinks,
  taskDrivenRouteHints,
} from "./task-workflows.mjs";
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
    "N 个日历月",
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
  generated.executionContract.workflows["product-selection"].budgets
    .zeroSupplementalQueryBudgetAfterAcceptedCandidate,
  true,
);
assert.equal(
  generated.executionContract.workflows["product-selection"].finalStateGate
    .actionId,
  "verify_final_state_v1",
);
assert.ok(
  generated.router.routes.every(
    (route) =>
      route.contract_file === "references/execution-contract.json" &&
      route.contract_workflow === route.route,
  ),
);
assert.ok(
  generated.runtimeSkills["reviews/SKILL.md"].includes(
    "标题 + 评分 + 作者 + 正文",
  ),
);
assert.equal(generated.router.routes.length, generatedWorkflowNames.length);
assert.equal(
  generated.router.routes[0].skill_file,
  "runtime-skills/order-aggregation/SKILL.md",
);
assert.equal(generated.router.routes.at(-1).route, "other");
assert.equal(generated.router.routes.at(-1).fallback, true);
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
