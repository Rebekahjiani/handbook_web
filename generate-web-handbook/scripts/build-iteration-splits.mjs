#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
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

function rowsFromJson(parsed) {
  return Array.isArray(parsed) ? parsed : parsed.tasks || [];
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const fields = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
  });
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of [
    "router",
    "coverage-corpus",
    "focus-tasks",
    "baseline-csv",
    "output",
  ]) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }

  const router = JSON.parse(await fs.readFile(path.resolve(args.router), "utf8"));
  const coverageTasks = rowsFromJson(
    JSON.parse(await fs.readFile(path.resolve(args["coverage-corpus"]), "utf8")),
  );
  const focusTasks = rowsFromJson(
    JSON.parse(await fs.readFile(path.resolve(args["focus-tasks"]), "utf8")),
  );
  const baselineRows = parseCsv(
    await fs.readFile(path.resolve(args["baseline-csv"]), "utf8"),
  );
  const scoreColumn = args["score-column"] || "aqi_score";
  if (!baselineRows.length || !(scoreColumn in baselineRows[0])) {
    throw new Error(`Baseline CSV does not contain ${scoreColumn}`);
  }

  const audit = auditRouter({
    router,
    tasks: coverageTasks,
    siteKey: args["site-key"] || router.site?.key,
    origin: args.origin || router.site?.origin,
  });
  if (!audit.passed) throw new Error("Coverage router audit failed");

  const baseline = new Map(
    baselineRows.map((row) => [Number(row.task_id), Number(row[scoreColumn])]),
  );
  const focusIds = new Set(
    focusTasks.map((task) => Number(task.task_id ?? task.id)),
  );
  const perRoute = Math.max(1, Number(args["replay-per-route"] || 1));
  const candidates = new Map();
  for (const assignment of audit.assignments) {
    const id = Number(assignment.task_id);
    if (focusIds.has(id) || baseline.get(id) !== 1) continue;
    if (!candidates.has(assignment.route)) candidates.set(assignment.route, []);
    candidates.get(assignment.route).push(id);
  }

  const replayByRoute = {};
  for (const [route, ids] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    replayByRoute[route] = [...new Set(ids)].sort((a, b) => a - b).slice(0, perRoute);
  }
  const routesWithoutReplay = [
    ...new Set(audit.assignments.map((item) => item.route)),
  ].filter((route) => !replayByRoute[route]?.length);
  const replayIds = [...new Set(Object.values(replayByRoute).flat())].sort(
    (a, b) => a - b,
  );
  const promotionIds = coverageTasks
    .map((task) => Number(task.task_id ?? task.id))
    .sort((a, b) => a - b);
  const output = path.resolve(args.output);
  await fs.mkdir(output, { recursive: true });
  await writeJson(path.join(output, "train-task-ids.json"), [...focusIds].sort((a, b) => a - b));
  await writeJson(path.join(output, "replay-task-ids.json"), replayIds);
  await writeJson(path.join(output, "promotion-task-ids.json"), promotionIds);
  await writeJson(path.join(output, "split-manifest.json"), {
    schema_version: 1,
    score_column: scoreColumn,
    train_count: focusIds.size,
    replay_count: replayIds.length,
    promotion_count: promotionIds.length,
    replay_per_route: perRoute,
    replay_by_route: replayByRoute,
    routes_without_replay: routesWithoutReplay,
  });
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
