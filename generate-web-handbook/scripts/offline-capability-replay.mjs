#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { auditCapabilityCoverage } from "./capability-router.mjs";
import { buildWorkflowHandbook } from "./task-workflows.mjs";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(scriptDir, "../..");
const taskFile = "/tmp/handbook-web-shopping-tasks.json";
const pairedFile = path.join(root, "experiments/independent-exploration/round-48/round-48-paired-recompute.json");
const outputFile = path.join(root, "experiments/independent-exploration/round-48/offline-capability-replay.json");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const rawTasks = JSON.parse(fs.readFileSync(taskFile, "utf8"));
const paired = JSON.parse(fs.readFileSync(pairedFile, "utf8"));
const tasks = rawTasks.map((task) => ({
  ...task,
  task_id: task.task_id ?? task.id,
  intent: task.intent || task.task || task.description || task.name || "",
}));
const generated = buildWorkflowHandbook({
  siteName: "webarena-shopping",
  skillName: "use-webarena-shopping",
  origin: "http://localhost:7770",
  siteKey: "shopping",
  pages: [],
  // Offline replay must expose the same capability catalog that the frozen
  // generator would build for the task corpus; this does not alter benchmark
  // inputs, it only prevents an empty page context from filtering capabilities.
  coverageTasks: tasks,
  focusTasks: tasks,
});
const replay = auditCapabilityCoverage(tasks, generated.router);
const perTask = new Map(paired.perTask.map((row) => [Number(row.taskId), row]));
const oldRouted = paired.CRouteSplit?.routed || { taskCount: 0 };
const rowsById = new Map(replay.rows.map((row) => [Number(row.task_id), row]));
const oldRoutedIds = paired.perTask.filter((row) => row.C.route && !row.C.fallbackUsed).map((row) => Number(row.taskId));
const negativeFlips = paired.perTask.filter((row) => !row.A.infra && !row.C.infra && row.A.success && !row.C.success).map((row) => Number(row.taskId));
const positiveFlips = paired.perTask.filter((row) => !row.A.infra && !row.C.infra && !row.A.success && row.C.success).map((row) => Number(row.taskId));
const routedBothSuccess = paired.perTask.filter((row) => row.C.route && !row.C.fallbackUsed && row.A.success && row.C.success).map((row) => Number(row.taskId));
const fallbackBaselineSuccess = paired.perTask.filter((row) => (!row.C.route || row.C.fallbackUsed) && row.A.success).map((row) => Number(row.taskId));
const syntheticCounterexamples = [
  { task_id: "unsupported-date", intent: "Find orders from past months" },
  { task_id: "ambiguous-output", intent: "Find an order" },
];
const counterexampleReplay = auditCapabilityCoverage(syntheticCounterexamples, generated.router);

const output = {
  schemaVersion: 2,
  mode: "offline_capability_replay",
  taskFile,
  taskFileSha256: sha256(taskFile),
  pairedArtifact: pairedFile,
  pairedArtifactSha256: sha256(pairedFile),
  generatedRouter: generated.router.routing_mode,
  taskCount: tasks.length,
  replay: {
    routed: replay.routed_count,
    abstained: replay.abstention_count,
    unsupportedFieldRejection: replay.unsupported_field_rejection_count,
    unknownRequirementAbstention: replay.unknown_requirement_abstention_count,
    routePrecision: replay.route_precision,
  },
  legacyRouted68: {
    artifactCount: oldRouted.taskCount,
    artifactIds: oldRoutedIds,
    newRouterRoutedCount: oldRoutedIds.filter((id) => !rowsById.get(id)?.fallback).length,
    newRouterRoutedIds: oldRoutedIds.filter((id) => !rowsById.get(id)?.fallback),
  },
  guardSet: {
    negativeFlips,
    positiveFlips,
    routedBothSuccess,
    fallbackBaselineSuccess,
    unsupportedOrAmbiguousCounterexamples: counterexampleReplay.rows.map((row) => ({ task_id: row.task_id, reason: row.reason, requirements: row.requirements })),
  },
  rows: replay.rows,
};
fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ replay: output.replay, legacyRouted68: output.legacyRouted68, guardSetSizes: Object.fromEntries(Object.entries(output.guardSet).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])) }, null, 2));
