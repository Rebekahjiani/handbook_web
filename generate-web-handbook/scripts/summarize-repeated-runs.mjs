import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[++index];
  }
  return args;
}

async function taskIds(file) {
  const parsed = JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
  const values = Array.isArray(parsed) ? parsed : parsed.task_ids || [];
  return values.map(String);
}

async function readScore(root, taskId) {
  const file = path.join(root, taskId, "eval_result.json");
  try {
    const result = JSON.parse(await fs.readFile(file, "utf8"));
    return { score: Number(result.score), file };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function summarizeRepeatedRuns({ roots, ids, minAttempts = 2 }) {
  const tasks = [];
  for (const taskId of ids) {
    const observed = (
      await Promise.all(roots.map((root) => readScore(root, taskId)))
    ).filter(Boolean);
    const scores = observed.map((item) => item.score);
    const passes = scores.filter((score) => score === 1).length;
    let stability = "insufficient";
    if (scores.length >= minAttempts) {
      if (passes === scores.length) stability = "stable_pass";
      else if (passes === 0) stability = "stable_fail";
      else stability = "unstable";
    }
    tasks.push({
      task_id: taskId,
      attempts: scores.length,
      scores,
      pass_rate: scores.length ? passes / scores.length : null,
      stability,
      evidence: observed.map((item) => item.file),
    });
  }
  return {
    schema_version: 1,
    min_attempts: minAttempts,
    attempt_roots: roots,
    task_count: tasks.length,
    stable_pass_count: tasks.filter((task) => task.stability === "stable_pass")
      .length,
    unstable_count: tasks.filter((task) => task.stability === "unstable").length,
    gate_passed: tasks.length > 0 && tasks.every((task) => task.stability === "stable_pass"),
    tasks,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tasks || !args["attempt-roots"]) {
    throw new Error(
      "Usage: summarize-repeated-runs.mjs --tasks FILE --attempt-roots ROOT1,ROOT2 [--min-attempts 2] [--output FILE]",
    );
  }
  const roots = args["attempt-roots"]
    .split(",")
    .filter(Boolean)
    .map((root) => path.resolve(root));
  const report = await summarizeRepeatedRuns({
    roots,
    ids: await taskIds(args.tasks),
    minAttempts: Math.max(1, Number(args["min-attempts"] || 2)),
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    const file = path.resolve(args.output);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, output);
  }
  process.stdout.write(output);
  if (!report.gate_passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
