#!/usr/bin/env node

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

function csvTaskIds(text) {
  const lines = text.trim().split(/\r?\n/);
  const columns = lines[0].split(",");
  const taskIndex = columns.indexOf("task_id");
  if (taskIndex < 0) throw new Error("CSV does not contain task_id");
  return lines.slice(1).map((line) => Number(line.split(",")[taskIndex]));
}

function sanitize(task) {
  const result = {
    task_id: task.task_id ?? task.id,
    sites: task.sites || (task.site ? [task.site] : []),
    start_urls: task.start_urls || task.startUrls || [],
    intent: task.intent || task.task || task.description || task.name || "",
  };
  if (task.task_type) result.task_type = task.task_type;
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dataset || !args.output) {
    throw new Error(
      "Usage: extract-task-corpus.mjs --dataset FILE --output FILE [--task-ids-csv FILE] [--site-key KEY]",
    );
  }
  const parsed = JSON.parse(await fs.readFile(path.resolve(args.dataset), "utf8"));
  let tasks = Array.isArray(parsed) ? parsed : parsed.tasks || [];
  if (args["site-key"]) {
    tasks = tasks.filter((task) =>
      (Array.isArray(task.sites) ? task.sites : [task.site]).includes(args["site-key"]),
    );
  }
  if (args["task-ids-csv"]) {
    const ids = csvTaskIds(
      await fs.readFile(path.resolve(args["task-ids-csv"]), "utf8"),
    );
    const byId = new Map(tasks.map((task) => [Number(task.task_id ?? task.id), task]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`Missing task IDs: ${missing.join(", ")}`);
    tasks = ids.map((id) => byId.get(id));
  }
  const output = tasks.map(sanitize);
  const target = path.resolve(args.output);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
