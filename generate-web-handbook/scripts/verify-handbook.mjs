#!/usr/bin/env node

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BOOL_FLAGS = new Set(["click-safe", "fresh", "save-html"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    if (BOOL_FLAGS.has(key)) {
      args[key] = true;
    } else {
      args[key] = argv[++i];
    }
  }
  return args;
}

function toLocator(page, primary) {
  if (primary.kind === "role") {
    return page.getByRole(primary.role, {
      name: primary.name,
      exact: primary.exact ?? false,
    });
  }
  if (primary.kind === "within") {
    return page
      .locator(primary.scope)
      .filter({ hasText: primary.scopeText })
      .getByRole(primary.role, {
        name: primary.name,
        exact: primary.exact ?? false,
      });
  }
  return page.locator(primary.selector);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.handbook) {
    throw new Error(
      "Usage: verify-handbook.mjs --handbook DIR [--cdp URL] [--max-actions N]",
    );
  }
  const handbook = path.resolve(args.handbook);
  const selectorFile = path.join(handbook, "snapshots", "selectors.json");
  const outputFile = path.join(handbook, "verification.json");
  const snapshot = JSON.parse(await fs.readFile(selectorFile, "utf8"));
  const maxActions = Number(args["max-actions"] || Number.POSITIVE_INFINITY);
  const browser = await chromium.connectOverCDP(
    args.cdp || "http://127.0.0.1:9222",
  );
  const context = browser.contexts()[0];
  if (!context) throw new Error("The CDP browser has no context");
  const page = context.pages()[0] || (await context.newPage());
  const UNSAFE_HREF = /\/(?:logout|signout|sign-out|checkout|delete|remove|place-order|cancel)\b/i;
  const clickSafe = Boolean(args["click-safe"]);
  const checks = [];

  try {
    for (const pageRecord of snapshot.pages) {
      await page.goto(pageRecord.url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      for (const action of pageRecord.actions) {
        if (checks.length >= maxActions) break;
        if (clickSafe && action.href && UNSAFE_HREF.test(action.href)) continue;
        try {
          const locator = toLocator(page, action.primary);
          const count = await locator.count();
          const visible = count === 1 ? await locator.isVisible() : false;
          checks.push({
            url: pageRecord.url,
            actionId: action.id,
            role: action.role,
            name: action.name,
            primary: action.primary,
            count,
            visible,
            passed: count === 1 && visible,
          });
        } catch (error) {
          checks.push({
            url: pageRecord.url,
            actionId: action.id,
            role: action.role,
            name: action.name,
            primary: action.primary,
            passed: false,
            error: error.message,
          });
        }
      }
      if (checks.length >= maxActions) break;
    }
  } finally {
    await browser.close();
  }

  const failures = checks.filter((check) => !check.passed);
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    siteName: snapshot.siteName,
    summary: {
      checked: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
      passRate: checks.length
        ? Number(((checks.length - failures.length) / checks.length).toFixed(4))
        : 0,
    },
    failures,
  };
  await fs.writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
  if (failures.length) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});