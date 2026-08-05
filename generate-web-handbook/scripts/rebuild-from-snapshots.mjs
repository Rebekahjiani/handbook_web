#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  buildWorkflowHandbook,
  loadTaskCorpus,
} from "./task-workflows.mjs";
import { loadContextModel } from "./context-model.mjs";
import { auditRouter } from "./router-audit.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[++index];
  }
  return args;
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, file);
}

function slug(value, fallback = "site") {
  const result = String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
  return result || fallback;
}

async function writeAggregateRouter(outputRoot) {
  const routes = [];
  for (const entry of await fs.readdir(outputRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.includes(".previous-")) continue;
    const routerFile = path.join(outputRoot, entry.name, "router.json");
    if (!(await pathExists(routerFile))) continue;
    const router = JSON.parse(await fs.readFile(routerFile, "utf8"));
    for (const route of router.routes || []) {
      routes.push({
        ...route,
        skill_file: path.posix.join(entry.name, route.skill_file),
        ...(route.contract_file
          ? { contract_file: path.posix.join(entry.name, route.contract_file) }
          : {}),
      });
    }
  }
  await writeJsonAtomic(path.join(outputRoot, "webarena-router.json"), {
    schema_version: 1,
    router: "webarena-handbook-router",
    routes,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.handbook) {
    throw new Error("Usage: rebuild-from-snapshots.mjs --handbook DIR");
  }

  const siteDir = path.resolve(args.handbook);
  const outputRoot = path.dirname(siteDir);
  const manifestFile = path.join(siteDir, "manifest.json");
  const selectorsFile = path.join(siteDir, "snapshots", "selectors.json");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  const selectors = JSON.parse(await fs.readFile(selectorsFile, "utf8"));
  const siteName = manifest.siteName || selectors.siteName || slug(siteDir);
  const origin = manifest.origin || selectors.origin;
  if (!origin) throw new Error("Missing origin in manifest or selectors snapshot");

  const siteKey = args["site-key"] || manifest.siteKey || null;
  const coverageCorpusFile = args["coverage-corpus"] || manifest.coverageCorpusFile;
  const focusTasksFile = args["focus-tasks"] || manifest.focusTasksFile || coverageCorpusFile;
  const contextModelPath = args["context-model"] || manifest.contextModelPath;
  const coverageTasks = await loadTaskCorpus(coverageCorpusFile, siteKey);
  const focusTasks = await loadTaskCorpus(focusTasksFile, siteKey);
  const contextModel = await loadContextModel(contextModelPath);
  const skillName = `use-${slug(siteName)}`.replace(/-$/, "");
  const pages = selectors.pages || [];

  const generated = buildWorkflowHandbook({
    siteName,
    skillName,
    origin,
    siteKey,
    pages,
    coverageTasks,
    focusTasks,
    contextModel,
  });
  const previousRouterFile = path.join(siteDir, "router.json");
  const previousRouter = (await pathExists(previousRouterFile))
    ? JSON.parse(await fs.readFile(previousRouterFile, "utf8"))
    : null;
  const routerAudit = auditRouter({
    router: generated.router,
    tasks: coverageTasks,
    siteKey: siteKey || generated.router.site.key,
    origin,
    previousRouter,
    allowFallbackAssignments: args["allow-fallback-assignments"] === "true",
  });
  if (!routerAudit.passed) {
    throw new Error(
      `Router gate failed: unmatched=${routerAudit.unmatched_count}, conflicts=${routerAudit.conflict_count}, fallback=${routerAudit.fallback_assignment_count}, removed=${routerAudit.removed_routes.join(",") || "none"}`,
    );
  }
  generated.coverage.routerAudit = {
    assigned: routerAudit.assigned_count,
    unmatched: routerAudit.unmatched_count,
    conflicts: routerAudit.conflict_count,
    removedRoutes: routerAudit.removed_routes,
  };
  generated.coverage.executionContract = {
    path: "references/execution-contract.json",
    workflowCount: Object.keys(generated.executionContract.workflows).length,
    actionCount: Object.values(generated.executionContract.workflows).reduce(
      (sum, contract) => sum + contract.actions.length,
      0,
    ),
  };

  const workflowDir = path.join(siteDir, "references", "workflows");
  await fs.mkdir(workflowDir, { recursive: true });
  for (const [filename, content] of Object.entries(generated.workflows)) {
    await fs.writeFile(path.join(workflowDir, filename), content);
  }
  const runtimeDir = path.join(siteDir, "runtime-skills");
  for (const [filename, content] of Object.entries(generated.runtimeSkills)) {
    const target = path.join(runtimeDir, filename);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  await fs.writeFile(path.join(siteDir, "SKILL.md"), generated.skill);
  await fs.writeFile(path.join(siteDir, "references", "handbook.md"), generated.handbook);
  await writeJsonAtomic(path.join(siteDir, "references", "execution-contract.json"), generated.executionContract);
  await writeJsonAtomic(path.join(siteDir, "router.json"), generated.router);
  await writeAggregateRouter(outputRoot);
  await writeJsonAtomic(path.join(siteDir, "snapshots", "coverage.json"), generated.coverage);
  await writeJsonAtomic(path.join(siteDir, "snapshots", "router-audit.json"), routerAudit);

  manifest.status = "rebuilt_from_snapshots";
  manifest.updatedAt = new Date().toISOString();
  manifest.summary = {
    ...(manifest.summary || {}),
    workflowsGenerated: generated.coverage.workflows.length,
    executionContractActions: generated.coverage.executionContract.actionCount,
  };
  await writeJsonAtomic(manifestFile, manifest);
  process.stdout.write(`${siteDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
