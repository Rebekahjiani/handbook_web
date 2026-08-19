#!/usr/bin/env node
// 用途：在已启动的 CDP Chrome 里登录 Magento Admin，完成后退出。
// 用法：node login-admin.mjs --cdp http://127.0.0.1:9222 --url http://localhost:7780 --user admin --pass admin1234

import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cdp = args.cdp || "http://127.0.0.1:9222";
  const adminUrl = args.url || "http://localhost:7780";
  const user = args.user || "admin";
  const pass = args.pass || "admin1234";

  const browser = await chromium.connectOverCDP(cdp);
  const context = browser.contexts()[0];
  if (!context) throw new Error(`No browser context at ${cdp}`);
  const page = context.pages()[0] || (await context.newPage());

  process.stdout.write(`Navigating to ${adminUrl}...\n`);
  await page.goto(adminUrl, { waitUntil: "domcontentloaded" });

  // If already logged in (dashboard), skip login
  if (page.url().includes("/dashboard")) {
    process.stdout.write("Already logged in.\n");
    await browser.close();
    return;
  }

  process.stdout.write("Filling login form...\n");
  await page.fill("#username", user);
  await page.fill("#login", pass);
  await page.click(".action-login");
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  process.stdout.write(`Logged in. Current URL: ${page.url()}\n`);
  await browser.close();
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e.message}\n`);
  process.exitCode = 1;
});
