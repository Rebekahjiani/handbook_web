#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

export function evaluateCandidatePromotion(evidence) {
  const thresholds = evidence.thresholds || {};
  const checks = [
    {
      id: "snapshot_consistent",
      passed: evidence.environment?.snapshot_consistent === true,
      actual: evidence.environment?.snapshot_consistent ?? null,
    },
    {
      id: "oracle_lift_reproduced",
      passed: evidence.oracle?.lift_reproduced === true,
      actual: evidence.oracle?.lift_reproduced ?? null,
    },
    {
      id: "minimum_paired_tasks",
      passed: Number(evidence.candidate_vs_placebo?.paired_tasks || 0) >= Number(thresholds.min_paired_tasks || 1),
      actual: Number(evidence.candidate_vs_placebo?.paired_tasks || 0),
      expected: Number(thresholds.min_paired_tasks || 1),
    },
    {
      id: "positive_net_gain",
      passed: Number(evidence.candidate_vs_placebo?.net_gain || 0) > 0,
      actual: Number(evidence.candidate_vs_placebo?.net_gain || 0),
    },
    {
      id: "negative_flip_budget",
      passed: Number(evidence.candidate_vs_placebo?.negative_flips ?? Infinity) <= Number(thresholds.max_negative_flips ?? 0),
      actual: evidence.candidate_vs_placebo?.negative_flips ?? null,
      expected: Number(thresholds.max_negative_flips ?? 0),
    },
    {
      id: "runtime_action_coverage",
      passed: Number(evidence.runtime?.required_action_coverage || 0) >= Number(thresholds.min_required_action_coverage ?? 1),
      actual: Number(evidence.runtime?.required_action_coverage || 0),
      expected: Number(thresholds.min_required_action_coverage ?? 1),
    },
    {
      id: "input_token_budget",
      passed: Number(evidence.cost?.input_token_delta_pct ?? Infinity) <= Number(thresholds.max_input_token_delta_pct ?? 0),
      actual: evidence.cost?.input_token_delta_pct ?? null,
      expected: Number(thresholds.max_input_token_delta_pct ?? 0),
    },
  ];
  return {
    schema_version: 1,
    candidate: evidence.candidate || null,
    passed: checks.every((check) => check.passed),
    checks,
    failed_checks: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.evidence) {
    throw new Error("Usage: candidate-promotion-gate.mjs --evidence FILE [--report FILE]");
  }
  const evidence = JSON.parse(await fs.readFile(path.resolve(args.evidence), "utf8"));
  const report = evaluateCandidatePromotion(evidence);
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
