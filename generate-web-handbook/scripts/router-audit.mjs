import fs from "node:fs/promises";
import path from "node:path";

function taskId(task) {
  return task.task_id ?? task.id ?? null;
}

function taskIntent(task) {
  return task.intent || task.task || task.description || task.name || "";
}

function taskSites(task) {
  const sites = task.sites || task.site || [];
  return new Set(Array.isArray(sites) ? sites : [sites]);
}

function expandStartUrl(raw, siteKey, origin) {
  const token = siteKey
    ? `__${siteKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}__`
    : null;
  if (token && raw.startsWith(token)) {
    return `${origin}${raw.slice(token.length) || "/"}`;
  }
  return raw;
}

function routeMatches(route, task, siteKey, origin) {
  const routeSites = new Set(route.site_keys || []);
  const sites = taskSites(task);
  if (routeSites.size && [...routeSites].every((key) => !sites.has(key))) {
    return false;
  }

  const starts = (task.start_urls || task.startUrls || []).map((raw) =>
    expandStartUrl(raw, siteKey, origin),
  );
  if (
    route.origin_pattern &&
    !starts.some((url) => new RegExp(route.origin_pattern, "i").test(url))
  ) {
    return false;
  }

  return !route.intent_pattern ||
    new RegExp(route.intent_pattern, "i").test(taskIntent(task));
}

export function removedRoutes(previousRouter, nextRouter, allowed = []) {
  if (!previousRouter) return [];
  const permitted = new Set(allowed);
  const next = new Set((nextRouter.routes || []).map((route) => route.route));
  return (previousRouter.routes || [])
    .map((route) => route.route)
    .filter((route) => route && !next.has(route) && !permitted.has(route));
}

export function auditRouter({
  router,
  tasks,
  siteKey = router.site?.key,
  origin = router.site?.origin,
  previousRouter = null,
  allowedRouteRemovals = [],
  allowFallbackAssignments = false,
}) {
  if (!siteKey || !origin) {
    throw new Error("Router audit requires siteKey and origin");
  }

  const unmatched = [];
  const conflicts = [];
  const shadowedBackoffs = [];
  const fallbackAssignments = [];
  const assignments = [];
  const routeCounts = {};
  for (const task of tasks) {
    const matches = (router.routes || [])
      .map((route, index) => ({ route, index }))
      .filter(({ route }) => routeMatches(route, task, siteKey, origin))
      .sort(
        (a, b) =>
          (Number.isFinite(Number(a.route.priority))
            ? Number(a.route.priority)
            : Number.MAX_SAFE_INTEGER) -
            (Number.isFinite(Number(b.route.priority))
              ? Number(b.route.priority)
              : Number.MAX_SAFE_INTEGER) ||
          a.index - b.index,
      )
      .map(({ route }) => route);
    const primary = matches[0] || null;
    if (!primary) {
      unmatched.push({ task_id: taskId(task), intent: taskIntent(task) });
      continue;
    }

    routeCounts[primary.route] = (routeCounts[primary.route] || 0) + 1;
    assignments.push({
      task_id: taskId(task),
      route: primary.route,
      intent: taskIntent(task),
    });
    if (primary.fallback) {
      fallbackAssignments.push({
        task_id: taskId(task),
        route: primary.route,
        intent: taskIntent(task),
      });
    }
    const alternatives = matches
      .slice(1)
      .filter((route) => !route.fallback && !route.backoff)
      .map((route) => route.route);
    if (alternatives.length) {
      conflicts.push({
        task_id: taskId(task),
        primary: primary.route,
        alternatives,
        intent: taskIntent(task),
      });
    }
    const backoffs = matches
      .slice(1)
      .filter((route) => route.backoff)
      .map((route) => route.route);
    if (backoffs.length) {
      shadowedBackoffs.push({
        task_id: taskId(task),
        primary: primary.route,
        backoffs,
      });
    }
  }

  const removals = removedRoutes(
    previousRouter,
    router,
    allowedRouteRemovals,
  );
  return {
    schema_version: 1,
    task_count: tasks.length,
    assigned_count: assignments.length,
    unmatched_count: unmatched.length,
    conflict_count: conflicts.length,
    shadowed_backoff_count: shadowedBackoffs.length,
    fallback_assignment_count: fallbackAssignments.length,
    removed_route_count: removals.length,
    passed:
      unmatched.length === 0 &&
      conflicts.length === 0 &&
      removals.length === 0 &&
      (allowFallbackAssignments || fallbackAssignments.length === 0),
    route_counts: routeCounts,
    unmatched,
    conflicts,
    shadowed_backoffs: shadowedBackoffs,
    fallback_assignments: fallbackAssignments,
    removed_routes: removals,
    assignments,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[++index];
  }
  return args;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.router || !args["coverage-corpus"]) {
    throw new Error(
      "Usage: router-audit.mjs --router FILE --coverage-corpus FILE [--site-key KEY] [--origin URL] [--previous-router FILE] [--allow-route-removal a,b] [--allow-fallback-assignments true] [--report FILE]",
    );
  }
  const router = JSON.parse(await fs.readFile(path.resolve(args.router), "utf8"));
  const parsedTasks = JSON.parse(
    await fs.readFile(path.resolve(args["coverage-corpus"]), "utf8"),
  );
  const tasks = Array.isArray(parsedTasks) ? parsedTasks : parsedTasks.tasks || [];
  const previousRouter = args["previous-router"]
    ? JSON.parse(await fs.readFile(path.resolve(args["previous-router"]), "utf8"))
    : null;
  const report = auditRouter({
    router,
    tasks,
    siteKey: args["site-key"] || router.site?.key,
    origin: args.origin || router.site?.origin,
    previousRouter,
    allowedRouteRemovals: String(args["allow-route-removal"] || "")
      .split(",")
      .filter(Boolean),
    allowFallbackAssignments: args["allow-fallback-assignments"] === "true",
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.report) {
    const reportFile = path.resolve(args.report);
    await fs.mkdir(path.dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, output);
  }
  process.stdout.write(output);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
