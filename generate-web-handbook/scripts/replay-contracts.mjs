import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname, "..", "handbooks");
const sites = [
  ["webarena-shopping", "shopping"],
  ["webarena-reddit", "reddit"],
];

let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

for (const [directory, siteKey] of sites) {
  const siteRoot = path.join(root, directory);
  const contract = JSON.parse(
    fs.readFileSync(path.join(siteRoot, "references/execution-contract.json"), "utf8"),
  );
  const router = JSON.parse(fs.readFileSync(path.join(siteRoot, "router.json"), "utf8"));
  check(contract.schemaVersion === 1, `${directory}: schemaVersion`);
  check(contract.site.key === siteKey, `${directory}: cross-site site key`);

  for (const [workflowId, workflow] of Object.entries(contract.workflows || {})) {
    const ir = workflow.ir;
    check(ir?.schemaVersion === 2, `${directory}/${workflowId}: missing IR v2`);
    check(ir.route.workflow === workflowId, `${directory}/${workflowId}: route mismatch`);
    check(ir.route.siteKeys.includes(siteKey), `${directory}/${workflowId}: site mismatch`);
    check(ir.allowedActions.includes("verify_final_state_v1"), `${directory}/${workflowId}: final gate`);
    check(ir.postStateGate.lifecycleGate.requiredBefore === "SUCCESS", `${directory}/${workflowId}: lifecycle gate`);
    check(Boolean(ir.target?.entity), `${directory}/${workflowId}: target entity`);
    check(Boolean(ir.target?.desiredState), `${directory}/${workflowId}: target desired state`);
    check(Boolean(ir.observation?.currentState), `${directory}/${workflowId}: current state observation`);
    check(Boolean(ir.successContract?.targetGate), `${directory}/${workflowId}: success target gate`);
    const isMutation = Boolean(workflow.mutation);
    check(
      isMutation ? ir.page.structures.length === 0 : ir.page.forms.length === 0,
      `${directory}/${workflowId}: read/mutation page separation`,
    );
    if (isMutation) {
      check(ir.allowedActions.includes("browser.mutate"), `${directory}/${workflowId}: mutate action`);
      check(
        JSON.stringify(ir.requiredNetworkEvents) === JSON.stringify(workflow.mutation.requiredNetworkEvents),
        `${directory}/${workflowId}: required network event mismatch`,
      );
      if (workflow.mutation.contractCoverage === "missing_expected_mutation") {
        check(
          workflow.mutation.requiredNetworkEvents.length === 0 &&
            workflow.mutation.forms.length === 0,
          `${directory}/${workflowId}: invalid mutation coverage marker`,
        );
      }
      for (const form of ir.page.forms) {
        check(Boolean(form.action), `${directory}/${workflowId}: form action missing`);
        check(Array.isArray(form.fields), `${directory}/${workflowId}: form fields missing`);
        if (form.requiredNetworkEvent) {
          check(
            /^(POST|PUT|PATCH|DELETE)$/i.test(form.requiredNetworkEvent.method || ""),
            `${directory}/${workflowId}: mutation method is not write`,
          );
          check(
            Boolean(form.requiredNetworkEvent.urlPattern || form.requiredNetworkEvent.url),
            `${directory}/${workflowId}: mutation URL missing`,
          );
        }
      }
    }
  }

  const routeWorkflows = new Set();
  for (const route of router.routes || []) {
    const workflow = route.contract_workflow || route.route;
    check(!routeWorkflows.has(workflow), `${directory}: duplicate route workflow ${workflow}`);
    routeWorkflows.add(workflow);
    check(Boolean(contract.workflows[workflow]), `${directory}: route contract missing ${workflow}`);
    check(route.site_keys?.includes(siteKey), `${directory}: route crosses site boundary`);
  }
}

console.log(`contract replay passed: ${checks} checks`);
