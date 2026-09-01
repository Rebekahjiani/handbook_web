#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 名称：webarena-shopping-trace-driver.mjs
 *
 * 用途：驱动「已开启 CDP 的 Chrome」走完 WebArena shopping 的核心流程
 *       （storefront http://localhost:7770 + admin http://localhost:7780），
 *       期间通过 ContextModelTracer HTTP API 录制
 *       Chrome Tracing（分段 jsonl）+ network（jsonl + rawbody）+ interactions + pre/post capture。
 *
 * 产物：默认输出到 /Users/rebekah/handbook_web/platform-core/dev/{runTs}-{preset}/
 *       每个 run 目录内含：
 *         - tracer 的 trace.segment.*.jsonl / network.jsonl / interactions.jsonl / metadata.json / profile-run.json
 *         - 本驱动的 per-step 证据：driver-screenshots/ 与 driver-steps.jsonl / driver-report.json
 *
 * 前置条件（务必按顺序）：
 *   1) SSH 隧道已建立（7770/7780 等映射到远程）。浏览器访问请用 localhost（127.0.0.1 会被站点跳转拒绝）。
 *   2) Chrome 已开启 CDP，例如：
 *        /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *          --remote-debugging-port=9222 --user-data-dir=/tmp/cmg-tracer-chrome
 *   3) ContextModelTracer 已启动（API 在 14567）：
 *        cd /Users/rebekah/context-model-generator-web/tracer-webapp && pnpm dev
 *
 * 用法示例：
 *   # 默认：storefront 与 admin 各录一次完整 run（推荐，两个 surface 都有 Chrome Tracing）
 *   node webarena-shopping-trace-driver.mjs
 *
 *   # 只录 storefront；不真正下单（只走到 Place Order 前）
 *   node webarena-shopping-trace-driver.mjs --storefront-only
 *
 *   # 单 run 同时包含 storefront + admin（快，但只有第一个页面有 Chrome Tracing）
 *   node webarena-shopping-trace-driver.mjs --mode single
 *
 *   # 真正下单（会新增订单，属于 benchmark 数据变更，默认关闭）
 *   node webarena-shopping-trace-driver.mjs --place-order
 *
 * 参数一览：
 *   --cdp <url>          默认 http://127.0.0.1:9222
 *   --tracer-url <url>   默认 http://127.0.0.1:14567
 *   --site <url>         默认 http://localhost:7770
 *   --admin-site <url>   默认 http://localhost:7780
 *   --output-root <dir>  默认 /Users/rebekah/handbook_web/platform-core/dev
 *   --preset <id>        base | js | js-profile，默认 js
 *   --mode <split|single> 默认 split
 *   --storefront-only | --admin-only | --no-record | --place-order | --wishlist
 *   --admin-user / --admin-pass   默认 admin / admin1234（可用环境变量 ADMIN_USER/ADMIN_PASS）
 *   --shopping-user / --shopping-pass  已有账号登录（环境变量 SHOPPING_USER/SHOPPING_PASSWORD）
 *
 * 注意：脚本结束时【不会】关闭浏览器（connectOverCDP 的 browser.close() 会关掉整个 Chrome）。
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// 默认值
// ---------------------------------------------------------------------------
const DEFAULTS = {
  cdp: "http://127.0.0.1:9222",
  tracerUrl: "http://127.0.0.1:14567",
  site: "http://localhost:7770",
  adminSite: "http://localhost:7780",
  outputRoot: "/Users/rebekah/handbook_web/platform-core/dev",
  preset: "js",
  mode: "split",
  adminUser: process.env.ADMIN_USER || "admin",
  adminPass: process.env.ADMIN_PASS || "admin1234",
  shoppingUser: process.env.SHOPPING_USER || "",
  shoppingPass: process.env.SHOPPING_PASSWORD || ""
};

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { ...DEFAULTS };
  const flags = new Set([
    "storefront-only", "admin-only", "no-record", "place-order",
    "wishlist", "fresh-account", "help", "no-screenshots"
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (flags.has(key)) {
      args[key] = true;
    } else if (i + 1 < argv.length) {
      args[key] = argv[++i];
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ts() {
  return new Date().toISOString();
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "step";
}

async function fetchJson(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON */ }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${url} :: ${json?.message || text.slice(0, 300)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function getTargetId(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const info = await session.send("Target.getTargetInfo");
    return info?.targetInfo?.targetId || "";
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function clickIfVisible(page, selector, { timeout = 5000 } = {}) {
  const locator = page.locator(selector).first();
  try {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

/** 按可见文本点击（button / a.action / .action 等），返回是否成功 */
async function clickByText(page, texts, { timeout = 8000 } = {}) {
  const patterns = Array.isArray(texts) ? texts : [texts];
  for (const text of patterns) {
    const byRole = page.getByRole("button", { name: text, exact: false }).first();
    try {
      await byRole.waitFor({ state: "visible", timeout });
      await byRole.click();
      return true;
    } catch { /* 继续尝试 */ }
  }
  for (const text of patterns) {
    const locator = page.locator("a, .action, button").filter({ hasText: text }).first();
    try {
      await locator.waitFor({ state: "visible", timeout });
      await locator.click();
      return true;
    } catch { /* 继续尝试 */ }
  }
  return false;
}

/** 收集所有「可见文本输入框」并按顺序填入默认值（Magento 表单字段防护性填充） */
async function fillVisibleInputs(page, defaults) {
  const inputs = await page.locator(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=search]):not([type=file])"
  ).evaluateAll((els) =>
    els
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.disabled;
      })
      .map((el) => ({
        id: el.id || "",
        name: el.name || "",
        autocomplete: el.autocomplete || "",
        type: el.type || "text"
      }))
  );
  const filled = [];
  let fallbackIndex = 0;
  for (const info of inputs) {
    const hint = `${info.id} ${info.name} ${info.autocomplete}`.toLowerCase();
    let value;
    if (hint.includes("email")) value = defaults.email;
    else if (hint.includes("pass") || hint.includes("pwd")) value = defaults.password;
    else if (hint.includes("phone") || hint.includes("telephone")) value = defaults.phone;
    else if (hint.includes("zip") || hint.includes("postcode")) value = defaults.postcode;
    else if (hint.includes("city")) value = defaults.city;
    else if (hint.includes("region") || hint.includes("state")) value = defaults.region;
    else if (hint.includes("street") || hint.includes("address")) value = defaults.street;
    else if (hint.includes("first") || hint.includes("name")) value = defaults.firstname;
    else if (hint.includes("last")) value = defaults.lastname;
    else value = defaults.fallbackFields[fallbackIndex++ % defaults.fallbackFields.length];

    try {
      const idSelector = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(info.id) ? `#${info.id}` : null;
      const selector = idSelector ? `input${idSelector}, input[name="${info.name}"]` : `input[name="${info.name}"]`;
      await page.locator(selector).first().fill(value, { timeout: 4000 });
      filled.push(`${info.id || info.name || info.type} => ${value}`);
    } catch { /* 跳过无法填充的 */ }
  }
  return filled;
}

/** 填充结算页必需的 select（country_id / region_id 等），返回处理记录 */
async function fillVisibleSelects(page) {
  const done = [];
  const country = page.locator("select[name='country_id']:visible").first();
  try {
    if (await country.count()) {
      await country.selectOption({ label: "United States" }).catch(async () => {
        const opts = await country.locator("option").allTextContents().catch(() => []);
        const first = opts.find((t) => !t.includes("Please select") && t.trim());
        if (first) await country.selectOption({ label: first }).catch(() => undefined);
      });
      done.push(`country_id`);
      // region 选项随 country 联动，稍等再填
      await sleep(800);
    }
  } catch { /* 无国家下拉 */ }
  const region = page.locator("select[name='region_id']:visible, select[name='region']:visible").first();
  try {
    if (await region.count()) {
      const opts = await region.locator("option").allTextContents().catch(() => []);
      const first = opts.find((t) => !t.includes("Please select") && t.trim());
      if (first) await region.selectOption({ label: first }).catch(() => undefined);
      done.push(`region_id`);
    }
  } catch { /* 无地区下拉 */ }
  return done;
}

/** 逐条滚动页面以触发懒加载，便于 trace 捕获渲染事件 */
async function progressiveScroll(page, times = 4, stepPx = 600) {
  for (let i = 0; i < times; i += 1) {
    await page.mouse.wheel(0, stepPx);
    await sleep(400);
  }
}

// ---------------------------------------------------------------------------
// TraceRun：manage run 级记录（driver-steps.jsonl / driver-screenshots / report）
// ---------------------------------------------------------------------------
class TraceRun {
  constructor({ label, runRoot, screenshots }) {
    this.label = label;
    this.runRoot = runRoot;
    this.screenshots = screenshots !== false;
    this.steps = [];
    this.stepsLogPath = runRoot ? path.join(runRoot, "driver-steps.jsonl") : null;
    this.shotsDir = runRoot ? path.join(runRoot, "driver-screenshots") : null;
  }

  async init() {
    if (this.shotsDir) await fs.mkdir(this.shotsDir, { recursive: true });
  }

  async record(name, fn, page) {
    const index = this.steps.length + 1;
    const shotName = `${String(index).padStart(3, "0")}-${slugify(name)}.png`;
    const step = {
      index,
      ts: ts(),
      name,
      ok: false,
      url: page ? page.url() : undefined
    };
    try {
      const result = await fn();
      step.ok = true;
      if (result && typeof result === "object") Object.assign(step, result);
      step.url = page ? page.url() : step.url;
    } catch (error) {
      step.ok = false;
      step.error = error instanceof Error ? error.message : String(error);
      step.url = page ? page.url() : step.url;
    } finally {
      if (this.screenshots && page) {
        try {
          const shotPath = path.join(this.shotsDir, shotName);
          await page.screenshot({ path: shotPath, fullPage: false });
          step.screenshot = `driver-screenshots/${shotName}`;
        } catch { /* 截图失败不阻断 */ }
      }
      this.steps.push(step);
      const line = JSON.stringify(step);
      if (this.stepsLogPath) {
        await fs.appendFile(this.stepsLogPath, line + "\n", "utf-8").catch(() => undefined);
      }
      console.log(`  [${step.ok ? "OK " : "FAIL"}] ${name}${step.error ? ` :: ${step.error}` : ""}`);
    }
    return step;
  }

  async writeReport(extra = {}) {
    if (!this.runRoot) return;
    const report = {
      label: this.label,
      runRoot: this.runRoot,
      writtenAt: ts(),
      steps: this.steps,
      okSteps: this.steps.filter((s) => s.ok).length,
      totalSteps: this.steps.length,
      ...extra
    };
    await fs.writeFile(path.join(this.runRoot, "driver-report.json"), JSON.stringify(report, null, 2), "utf-8");
    return report;
  }
}

// ---------------------------------------------------------------------------
// Storefront 流程（Magento 2 / WebArena shopping）
// ---------------------------------------------------------------------------
async function flowOpenHome(ctx, page, site) {
  await page.goto(site, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector("#search, .page-header, header", { timeout: 30_000 }).catch(() => undefined);
  await progressiveScroll(page, 3);
  await sleep(1500);
}

async function flowCategory(ctx, page) {
  // 导航分类：从真实导航里选一个分类链接（排除政策/账户/搜索等非分类链接）
  const DENY = /(privacy|cookie|policy|search|customer|checkout|contact|about|terms|sale|advanced|popular|account)/i;
  const navLinks = page.locator(
    "nav .navigation a[href$='.html'], .nav a[href$='.html'], header a[href$='.html'], .navigation a[href$='.html']"
  );
  const hrefs = await navLinks.evaluateAll((els, deny) =>
    els.map((el) => el.href).filter((h) => !deny.test(h)), DENY
  );
  // 优先「顶级分类」（pathname 只含一个 .html 段），否则取第一个可用分类
  const topLevel = hrefs.find((h) => /^\/[a-z0-9-]+\.html(\?|$)/i.test(new URL(h).pathname));
  const chosen = topLevel || hrefs[0];
  if (!chosen) throw new Error("未找到导航分类链接");
  await page.bringToFront();
  await page.goto(chosen, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector(".product-item, .products-grid .product, .product-items li", { timeout: 20_000 })
    .catch(() => undefined);
  // 懒加载滚动（catalog 聚合）
  await progressiveScroll(page, 4);
  // 分页翻页（catalog-aggregation）
  if (!(await clickIfVisible(page, ".action.next, a[title='Next']", { timeout: 3000 }))) {
    console.log("  (无下一页，跳过分页)");
  } else {
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
    await sleep(1200);
  }
  return { categoryUrl: page.url(), title: await page.title().catch(() => "") };
}

async function flowProductDetail(ctx, page) {
  // 已在商品详情页（有产品标题容器 / product-info-main）就不点链接，直接采集；否则从列表点第一个商品
  const alreadyOnDetail =
    (await page.locator('[data-ui-id="page-title-wrapper"], .product-info-main').count().catch(() => 0)) > 0;
  if (!alreadyOnDetail) {
    const productLink = page.locator(".product-item a.product-item-link, .product-item a[href$='.html'], .product-items li a[href$='.html']")
      .first();
    try {
      await productLink.waitFor({ state: "visible", timeout: 15_000 });
      await productLink.click();
      await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
    } catch {
      throw new Error("未找到商品详情入口");
    }
  }
  await page.waitForSelector('[data-ui-id="page-title-wrapper"], .page-title', { timeout: 20_000 }).catch(() => undefined);
  await sleep(800);
  // 商品信息 + 评论区（只读）
  const info = await page.evaluate(() => {
    const title = document.querySelector('[data-ui-id="page-title-wrapper"], .page-title h1, h1')?.textContent?.trim() || "";
    const price = document.querySelector(".product-info-price .price, .price-wrapper .price")?.textContent?.trim() || "";
    const reviews = document.querySelector("#reviews") ? "has-reviews" : "no-reviews";
    return { title, price, reviews };
  });
  if (ctx.capture) ctx.capture.product = info;
  // 滚动到评论区
  await page.locator("#reviews").scrollIntoViewIfNeeded().catch(() => undefined);
  await sleep(1000);
  return info;
}

async function flowSearch(ctx, page) {
  const terms = ["phone case", "samsung", "laptop", "charger", "cable", "smart"];
  const searchInput = page.locator("#search").first();
  await searchInput.waitFor({ state: "visible", timeout: 15_000 });
  for (const term of terms) {
    await searchInput.fill(term);
    await clickIfVisible(page, ".action.search, button[type=submit]", { timeout: 5000 });
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
    await sleep(1200);
    const count = await page.locator(".product-item, .products-grid .product, .product-items li").count().catch(() => 0);
    console.log(`  (search "${term}" -> ${count} 结果)`);
    if (count > 0) {
      // 打开第 2 个结果详情
      const second = page.locator(".product-item a[href*='.html'], .product-items li a[href*='.html']").nth(1).first();
      try {
        await second.waitFor({ state: "visible", timeout: 8000 });
        await second.click();
        await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
        await page.waitForSelector('[data-ui-id="page-title-wrapper"], .page-title', { timeout: 15_000 }).catch(() => undefined);
      } catch { /* 打不开第二个结果不阻断 */ }
      return { term, results: count, url: page.url() };
    }
  }
  throw new Error("所有搜索词均无结果");
}

async function selectProductOptions(page) {
  // 可配置商品选规格：dropdown（.super-attribute-select）与 swatch（.swatch-opt）两种都处理
  const out = { attributes: 0, swatches: 0 };
  const selects = page.locator("select.super-attribute-select:visible");
  const n = await selects.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const sel = selects.nth(i);
    const cnt = await sel.locator("option").count().catch(() => 0);
    let picked = "";
    for (let j = 0; j < cnt; j++) {
      const opt = sel.locator("option").nth(j);
      const v = await opt.getAttribute("value").catch(() => "");
      const dis = await opt.isDisabled().catch(() => false);
      if (v && !dis) { picked = v; break; }
    }
    if (picked) { await sel.selectOption(picked).catch(() => undefined); out.attributes += 1; await sleep(600); }
  }
  const groups = page.locator(".swatch-opt .swatch-attribute");
  const g = await groups.count().catch(() => 0);
  for (let i = 0; i < g; i++) {
    const first = groups.nth(i).locator(".swatch-option:not(.disabled):visible").first();
    if (await first.count().catch(() => 0) > 0) {
      await first.click().catch(() => undefined);
      out.swatches += 1;
      await sleep(600);
    }
  }
  return out;
}

async function flowConfigurableSelect(ctx, page) {
  // 专门演练「可配置商品选规格后再加购」（如 anime phone case），补 product-selection 缺口
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/catalogsearch/result/?q=phone+case`, { waitUntil: "load", timeout: 60_000 }).catch(() => undefined);
  await page.waitForSelector(".product-item a.product-item-link", { timeout: 15_000 }).catch(() => undefined);
  const total = await page.locator(".product-item a.product-item-link").count().catch(() => 0);
  for (let i = 0; i < Math.min(total, 8); i += 1) {
    const link = page.locator(".product-item a.product-item-link").nth(i).first();
    try {
      await link.waitFor({ state: "visible", timeout: 6000 });
      await link.click();
      await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
      await sleep(1200);
    } catch { continue; }
    const hasOptions = (await page.locator("select.super-attribute-select:visible, .swatch-opt .swatch-option:visible").count().catch(() => 0)) > 0;
    if (!hasOptions) continue;
    const selected = await selectProductOptions(page);
    if (selected.attributes + selected.swatches === 0) continue;
    const clicked = await clickIfVisible(page, "#product-addtocart-button:visible", { timeout: 8000 });
    await sleep(1800);
    const added = (await page.locator(".message-success").count().catch(() => 0)) > 0;
    return {
      configurable: true,
      product: await page.title().catch(() => ""),
      optionsSelected: selected,
      clicked,
      added,
      url: page.url()
    };
  }
  return { configurable: false };
}

async function flowAddToCart(ctx, page) {
  const origin = new URL(page.url()).origin;
  let lastError = "未找到可加购按钮";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // 每次尝试都落到「分类列表里的第 attempt 个商品」，避免连续点击同一个（如缺货/可配置）商品
    await page.goto(`${origin}/beauty-personal-care.html`, { waitUntil: "load", timeout: 60_000 }).catch(() => undefined);
    await page.waitForSelector(".product-item a.product-item-link", { timeout: 15_000 }).catch(() => undefined);
    const count = await page.locator(".product-item a.product-item-link").count().catch(() => 0);
    if (count === 0) { lastError = "分类页无商品"; continue; }
    const link = page.locator(".product-item a.product-item-link").nth(attempt % count).first();
    try {
      await link.waitFor({ state: "visible", timeout: 8000 });
      await link.click();
      await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
      await sleep(1000);
    } catch { lastError = "无法打开商品详情"; continue; }
    // 点加购并验证「成功提示」出现（Magento 加购成功会弹出 .message-success）
    const clicked = await clickIfVisible(
      page,
      "#product-addtocart-button:visible, .tocart:visible, button[title*='Add to Cart']:visible",
      { timeout: 8000 }
    );
    if (!clicked) { lastError = "未找到 Add to Cart 按钮"; continue; }
    await sleep(1800);
    if ((await page.locator(".message-success").count().catch(() => 0)) > 0) {
      return { added: true, attempts: attempt + 1, product: await page.title().catch(() => ""), url: page.url() };
    }
    const errText = await page.locator(".message-error, .messages .message-error").first().textContent().catch(() => "");
    lastError = `加购未成功（${(errText || "缺货或选项错误").trim().slice(0, 60)}）`;
  }
  throw new Error(`加购失败（${lastError}）`);
}

async function flowCart(ctx, page) {
  await page.goto(`${new URL(page.url()).origin}/checkout/cart`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector("#shopping-cart-table, .cart.item, .checkout-cart-index", { timeout: 20_000 }).catch(() => undefined);
  const isEmpty = (await page.locator(".cart-empty, .message.error").count().catch(() => 0)) > 0;
  await sleep(1000);
  return { emptyCart: isEmpty, url: page.url() };
}

async function flowEnsureLogin(ctx, page) {
  const origin = new URL(page.url()).origin;
  // 先确认当前登录态
  async function isLoggedIn() {
    await page.goto(`${origin}/customer/account`, { waitUntil: "load", timeout: 60_000 });
    await sleep(1200);
    const url = page.url();
    return url.includes("/customer/account") && !url.includes("login");
  }
  if (await isLoggedIn()) {
    if (ctx.freshAccount) {
      // 强制登出，让「注册/登录」流程本身也进入被录制范围
      await page.goto(`${origin}/customer/account/logout`, { waitUntil: "load", timeout: 60_000 }).catch(() => undefined);
      await sleep(1500);
    } else {
      await page.waitForSelector(".block-dashboard-info, .page-title", { timeout: 10_000 }).catch(() => undefined);
      // 记录实际会话账号，而不是脚本预生成的候选注册邮箱（台账准确）
      const accountEmail = await page.evaluate(() => {
        const box = document.querySelector(".box-information .box-content") || document.querySelector(".block-dashboard-info");
        const txt = (box ? box.textContent : "") + " " + document.title;
        const m = txt.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
        return m ? m[0] : "";
      }).catch(() => "");
      if (accountEmail) ctx.actualAccountEmail = accountEmail;
      return { loggedIn: true, method: "already", accountEmail: accountEmail || undefined };
    }
  }
  // 未登录 → 优先已配置账号登录，否则注册
  if (ctx.shoppingUser && ctx.shoppingPass) {
    await page.goto(`${origin}/customer/account/login`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForSelector("#email, #pass", { timeout: 15_000 }).catch(() => undefined);
    await page.locator("#email").first().fill(ctx.shoppingUser, { timeout: 5000 }).catch(() => undefined);
    await page.locator("#pass").first().fill(ctx.shoppingPass, { timeout: 5000 }).catch(() => undefined);
    await clickIfVisible(page, ".action.login, button[type=submit]", { timeout: 8000 });
    await sleep(2000);
    if (!(await isLoggedIn())) throw new Error("账号登录失败（凭据或表单不匹配）");
    return { loggedIn: true, method: "login", account: ctx.shoppingUser };
  }
  // 注册全新账号（Magento 注册后自动登录）
  const email = ctx.registerAccount.email;
  await page.goto(`${origin}/customer/account/create`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector("#firstname, #email_address", { timeout: 15_000 }).catch(() => undefined);
  await page.locator("#firstname").first().fill("Tracer", { timeout: 5000 }).catch(() => undefined);
  await page.locator("#lastname").first().fill("Driver", { timeout: 5000 }).catch(() => undefined);
  await page.locator("#email_address").first().fill(email, { timeout: 5000 }).catch(() => undefined);
  await page.locator("#password").first().fill(ctx.registerAccount.password, { timeout: 5000 }).catch(() => undefined);
  await page.locator("#password-confirmation, #confirmation").first().fill(ctx.registerAccount.password, { timeout: 5000 }).catch(() => undefined);
  await clickByText(page, ["Create an Account", "注册", "创建账户"], { timeout: 8000 });
  await sleep(2500);
  const loggedIn = await isLoggedIn();
  if (!loggedIn) throw new Error("注册后未自动登录");
  return { loggedIn: true, method: "register", account: email };
}

async function flowCheckout(ctx, page, { placeOrder }) {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/checkout/cart`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector(".action.primary.checkout, #top-cart-btn-checkout, .cart-empty", { timeout: 15_000 }).catch(() => undefined);
  if ((await page.locator(".cart-empty").count().catch(() => 0)) > 0) {
    throw new Error("购物车为空，跳过结算");
  }
  const proceed = await clickIfVisible(page, "#top-cart-btn-checkout:visible, .action.primary.checkout:visible", { timeout: 10_000 });
  if (!proceed) throw new Error("未找到 Proceed to Checkout");
  await page.waitForURL("**/checkout/**", { timeout: 30_000 }).catch(() => undefined);
  await sleep(2000);

  const defaults = {
    email: ctx.registerAccount.email,
    password: ctx.registerAccount.password,
    phone: "13800000000",
    postcode: "100000",
    city: "Beijing",
    region: "Beijing",
    street: "1 Zhongguancun Street",
    firstname: "Tracer",
    lastname: "Driver",
    fallbackFields: ["Tracer", "Driver", "Tracer Driver", "13800000001", "100001"]
  };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const url = page.url();
    // 成功判定（下了单或已到成功页；fork 下单成功会跳 `?pbaocw=`）
    if (url.includes("onepage/success") || url.includes("pbaocw")
        || (await page.title().catch(() => "")).toLowerCase().includes("thank you")
        || (await page.locator(".onepage-success, .checkout-success").count().catch(() => 0)) > 0) {
      return { placed: placeOrder, success: true, url };
    }
    // 关键守卫：未要求下单时，一旦进入 payment 步就停手（绝不点 Place Order），先于任何填充/点击
    if (url.includes("/payment") && !placeOrder) {
      await sleep(1000);
      return { placed: false, placeOrderReached: true, url };
    }
    // 收件邮箱（guest checkout 可能出现在未登录场景）
    if (await page.locator("#customer-email").count().catch(() => 0) > 0) {
      await page.locator("#customer-email").first().fill(ctx.registerAccount.email, { timeout: 5000 }).catch(() => undefined);
    }
    // 勾选运输方式 / 支付方式第一个 radio
    const radio = page.locator("input[type=radio]:visible").first();
    try {
      if (await radio.count()) await radio.check({ timeout: 3000 });
    } catch { /* 无 radio 或不需选择 */ }
    // 勾选协议 checkbox（Place Order 前）
    const agreement = page.locator("input[type=checkbox]:visible").first();
    try {
      if (await agreement.count() && (await agreement.isChecked().catch(() => false)) === false) {
        await agreement.check({ timeout: 3000 }).catch(() => undefined);
      }
    } catch { /* 无协议 */ }
    // 填充可见文本输入（地址、支付信息等）
    const filled = await fillVisibleInputs(page, defaults);
    const selectFilled = await fillVisibleSelects(page);
    await sleep(600);

    // 仅当用户明确要求下单时才允许点击 Place Order
    const continueTexts = ["Next", "Continue", "继续"];
    const clickTexts = placeOrder
      ? [...continueTexts, "Place Order", "提交订单", "确认订单"]
      : continueTexts;
    const continueClicked = await clickByText(page, clickTexts, { timeout: 4000 });
    const primarySelector = placeOrder
      ? ".button.action.continue.primary, .action.primary.checkout, .continue"
      : ".button.action.continue.primary, .continue";
    const primaryClicked = await clickIfVisible(page, primarySelector, { timeout: 3000 });
    const clicked = continueClicked || primaryClicked;

    if (!clicked) {
      return { placed: false, stuckAt: page.url(), lastFilled: filled.slice(0, 5) };
    }
    await sleep(1800 + attempt * 300);
  }
  return { placed: false, stuckAt: page.url() };
}

async function flowOrderHistory(ctx, page) {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/sales/order/history`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector("#my-orders-table, .order-history-table, .message.info", { timeout: 20_000 }).catch(() => undefined);
  await sleep(1000);
  const rows = await page.locator("#my-orders-table tbody tr, .order-history-table tbody tr").count().catch(() => 0);
  // 打开第一笔订单详情（只读）
  if (rows > 0) {
    await clickIfVisible(page, "#my-orders-table .action.view, .order-history-table .action.view", { timeout: 6000 });
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
    await sleep(1000);
  }
  return { orderRows: rows, url: page.url() };
}

async function flowAccount(ctx, page) {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/customer/account`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector(".block-dashboard-info, .page-title", { timeout: 15_000 }).catch(() => undefined);
  await sleep(800);
}

async function flowWishlist(ctx, page) {
  // 可选：从当前商品页加入 wishlist（改变账号状态，默认关闭）
  const added = await clickIfVisible(page, ".towishlist, a.action.towishlist, button[title*='wishlist']", { timeout: 5000 });
  if (!added) throw new Error("未找到 Add to Wish List");
  await page.waitForSelector(".message-success", { timeout: 10_000 }).catch(() => undefined);
  await sleep(800);
  return { wishlistAdded: true };
}

// ---------------------------------------------------------------------------
// Admin 流程（Magento Admin / port 7780，默认只读）
// ---------------------------------------------------------------------------
async function flowAdminLogin(ctx, page, { adminUrl, user, pass }) {
  // WebArena 部署：admin 入口在 {origin}/admin/（根路径是 Home Page）
  const origin = new URL(adminUrl).origin;
  await page.goto(`${origin}/admin/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (page.url().includes("/dashboard")) return { loggedIn: true, url: page.url() };
  await page.waitForSelector("#username", { timeout: 20_000 });
  await page.fill("#username", user);
  await page.fill("#login", pass);
  await page.click(".action-login");
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  return { loggedIn: true, url: page.url() };
}

function adminBase(page) {
  const origin = new URL(page.url()).origin;
  const m = page.url().match(/\/([a-z0-9_-]+)\/dashboard\//i);
  return `${origin}/${m ? m[1] : "admin"}`;
}

async function flowAdminGrid(ctx, page, name, urlPath, { openFirstRow = false } = {}) {
  await page.goto(`${adminBase(page)}/${urlPath}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector(".admin__data-grid-wrap, .data-grid, .page-wrapper", { timeout: 25_000 }).catch(() => undefined);
  await sleep(1500);
  const rows = await page.locator("tbody tr[data-role='row'], .data-grid tbody tr").count().catch(() => 0);
  let openedRow = false;
  if (openFirstRow && rows > 0) {
    openedRow = await clickIfVisible(page, "td[data-index='actions'] a, .data-grid-actions-cell a", { timeout: 6000 });
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
    await sleep(1200);
  }
  return { page: name, rows, openedRow, url: page.url() };
}

// ---------------------------------------------------------------------------
// run 编排
// ---------------------------------------------------------------------------
async function startTracerRun({ tracerUrl, cdpPort, targetIds, pageName, basename, outputRoot, preset }) {
  const payload = {
    cdpPort,
    targetIds,
    pageName,
    basename,
    outputRoot,
    tracePreset: preset,
    traceCategories: [],
    captureBefore: true
  };
  const result = await fetchJson(`${tracerUrl}/api/profile/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }, 60_000);
  if (!result?.ok || !Array.isArray(result.profiles) || result.profiles.length === 0) {
    throw new Error(`profile/start 失败: ${JSON.stringify(result)}`);
  }
  return result.profiles;
}

async function stopTracerRun({ tracerUrl, pageName, captureAfter = true }) {
  const result = await fetchJson(`${tracerUrl}/api/profile/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageName, captureAfter })
  }, 120_000);
  if (!result?.ok || !Array.isArray(result.profiles)) {
    throw new Error(`profile/stop 失败: ${JSON.stringify(result)}`);
  }
  return result.profiles;
}

async function waitRecording({ tracerUrl, timeoutMs = 20_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = await fetchJson(`${tracerUrl}/api/status`, {}, 5000);
      if (status?.runtime?.state === "recording") return true;
    } catch { /* tracer 暂时不可达 */ }
    await sleep(1500);
  }
  return false;
}

/** 打开/复用 site 页面（同一 CDP Chrome 内），返回 { page, targetId } */
async function openOrReusePage(browserOrCtx, url) {
  let context;
  if (browserOrCtx.pages) {
    context = browserOrCtx;
  } else if (browserOrCtx.contexts && browserOrCtx.contexts().length > 0) {
    context = browserOrCtx.contexts()[0];
  } else {
    context = await browserOrCtx.newContext();
  }
  // 优先复用同站已开页面；否则只复用空白 tab（about:blank）；再不行开新 tab。
  let page = context.pages().find((p) => p.url().startsWith(url));
  if (!page) {
    page = context.pages().find((p) => !p.url() || p.url().startsWith("about:blank"));
  }
  if (!page) page = await context.newPage();
  await page.bringToFront();
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  return { page, targetId: await getTargetId(page) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log("用法见文件头部注释。快速示例：");
    console.log("  node webarena-shopping-trace-driver.mjs                      # split：storefront + admin 各一次 run");
    console.log("  node webarena-shopping-trace-driver.mjs --storefront-only   # 只录 storefront");
    console.log("  node webarena-shopping-trace-driver.mjs --mode single       # 一次 run 同时录两个页面");
    console.log("  node webarena-shopping-trace-driver.mjs --place-order       # 真正下单（会新增订单）");
    return;
  }

  console.log("== WebArena shopping trace driver ==");
  console.log(`   cdp=${args.cdp}  tracer=${args.tracerUrl}  site=${args.site}  admin=${args.adminSite}`);
  console.log(`   outputRoot=${args.outputRoot}  preset=${args.preset}  mode=${args.mode}`);

  // ---- 0. 环境自检 ----------------------------------------------------------
  console.log("[1/5] 连接 CDP Chrome ...");
  const browser = await chromium.connectOverCDP(args.cdp, { timeout: 10_000 });
  console.log(`  已连接 ${args.cdp}（注意：脚本结束不会关闭浏览器）`);

  if (!args["no-record"]) {
    console.log("[2/5] 检查 tracer API ...");
    const health = await fetchJson(`${args.tracerUrl}/api/healthz`, {}, 5000);
    console.log(`  tracer health: ${JSON.stringify(health)}`);
  } else {
    console.log("[2/5] --no-record：跳过 tracer 检查");
  }

  const runLabels = args["storefront-only"]
    ? ["storefront"]
    : args["admin-only"]
      ? ["admin"]
      : args.mode === "single"
        ? ["combined"]
        : ["storefront", "admin"];

  const runRoots = [];
  const registerAccount = {
    email: `wa.tracer.${Date.now()}@example.com`,
    password: `WaDriver!${Date.now()}`
  };

  for (const runLabel of runLabels) {
    console.log(`\n===== RUN: ${runLabel} =====`);
    const isStorefront = runLabel === "storefront" || runLabel === "combined";
    const isAdmin = runLabel === "admin" || runLabel === "combined";

    // ---- 3. 准备页面 --------------------------------------------------------
    const storePage = isStorefront
      ? await openOrReusePage(browser, args.site)
      : null;
    const adminPage = isAdmin
      ? await openOrReusePage(browser, args.adminSite)
      : null;

    const pagesToRecord = [];
    if (storePage) pagesToRecord.push(storePage);
    if (adminPage) pagesToRecord.push(adminPage);
    const targetIds = pagesToRecord.map((p) => p.targetId).filter(Boolean);
    if (targetIds.length === 0) throw new Error("没有可录制的页面 targetId");

    const pageName = runLabel === "admin" ? "webarena_shopping_admin" : "webarena_shopping";
    const basename = runLabel;

    // ---- 4. 开始录制 --------------------------------------------------------
    const cdpPort = Number(new URL(args.cdp).port) || 9222;
    let profiles;
    let runRoot = null;
    let recorder = null;
    if (!args["no-record"]) {
      console.log("[3/5] POST /api/profile/start ...");
      profiles = await startTracerRun({
        tracerUrl: args.tracerUrl,
        cdpPort,
        targetIds,
        pageName,
        basename,
        outputRoot: args.outputRoot,
        preset: args.preset
      });
      runRoot = profiles[0]?.traceDir ? path.dirname(profiles[0].traceDir) : null;
      recorder = new TraceRun({ label: runLabel, runRoot, screenshots: !args["no-screenshots"] });
      await recorder.init();
      await waitRecording({ tracerUrl: args.tracerUrl });
      console.log(`  录制已开始 runRoot=${runRoot}`);
    } else {
      const fallbackRoot = path.join(args.outputRoot, `manual-${Date.now()}`);
      await fs.mkdir(fallbackRoot, { recursive: true });
      runRoot = fallbackRoot;
      recorder = new TraceRun({ label: runLabel, runRoot, screenshots: !args["no-screenshots"] });
      await recorder.init();
    }

    const ctx = { capture: {}, registerAccount, shoppingUser: args.shoppingUser, shoppingPass: args.shoppingPass, freshAccount: Boolean(args["fresh-account"]) };

    // ---- 5. 执行流程 ------------------------------------------------------
    let orderPlaced = false;
    if (isStorefront && storePage) {
      const page = storePage.page;
      await recorder.record("open_home", () => flowOpenHome(ctx, page, args.site), page);

      let onProductPage = false;
      await recorder.record("category_browse", () => flowCategory(ctx, page), page);
      await recorder.record("product_detail", () => flowProductDetail(ctx, page), page);
      onProductPage = true;
      if (args.wishlist) {
        await recorder.record("wishlist", () => flowWishlist(ctx, page), page);
      }
      await page.goto(args.site, { waitUntil: "load", timeout: 60_000 }).catch(() => undefined);

      await recorder.record("search_discovery", () => flowSearch(ctx, page), page);

      // 从当前（搜索结果→详情或列表）加购
      if (!onProductPage || !page.url().match(/\.html/)) {
        await page.goto(args.site, { waitUntil: "load", timeout: 60_000 }).catch(() => undefined);
        await recorder.record("category_browse_2", () => flowCategory(ctx, page), page).catch(() => undefined);
      }
      await recorder.record("product_detail_2", () => flowProductDetail(ctx, page), page).catch(() => undefined);
      // 先登录再加购，避免 guest/customer quote 分叉导致购物车"凭空消失"
      await recorder.record("login_ensure", () => flowEnsureLogin(ctx, page), page);
      // 可配置商品：选规格后加购（演练 product-selection 缺口，失败不阻断）
      await recorder.record("configurable_select", () => flowConfigurableSelect(ctx, page), page).catch(() => undefined);
      await recorder.record("add_to_cart", () => flowAddToCart(ctx, page), page).catch(() => undefined);
      await recorder.record("cart_view", () => flowCart(ctx, page), page);

      await recorder.record("checkout", () => flowCheckout(ctx, page, { placeOrder: args["place-order"] }), page)
        .then((step) => { orderPlaced = Boolean(step?.placed); });

      await recorder.record("order_history", () => flowOrderHistory(ctx, page), page);
      await recorder.record("account_page", () => flowAccount(ctx, page), page);
    }

    if (isAdmin && adminPage) {
      const page = adminPage.page;
      await recorder.record("admin_login", () => flowAdminLogin(ctx, page, {
        adminUrl: args.adminSite,
        user: args.adminUser,
        pass: args.adminPass
      }), page);
      await recorder.record("admin_dashboard", () => flowAdminGrid(ctx, page, "dashboard", "dashboard/"), page);
      await recorder.record("admin_orders", () => flowAdminGrid(ctx, page, "orders", "sales/order/", { openFirstRow: true }), page);
      await recorder.record("admin_products", () => flowAdminGrid(ctx, page, "products", "catalog/product/", { openFirstRow: true }), page);
      await recorder.record("admin_customers", () => flowAdminGrid(ctx, page, "customers", "customer/index/"), page);
    }

    // ---- 6. 结束录制 --------------------------------------------------------
    let stoppedProfiles = [];
    if (!args["no-record"]) {
      console.log("[4/5] POST /api/profile/stop ...");
      stoppedProfiles = await stopTracerRun({ tracerUrl: args.tracerUrl, pageName, captureAfter: true });
      console.log(`  停止完成，profiles=${stoppedProfiles.length}`);
    }

    const extra = {
      pageName,
      site: args.site,
      adminSite: args.adminSite,
      preset: args.preset,
      orderPlaced,
      accountEmail: ctx.actualAccountEmail || ctx.registerAccount.email,
      profiles: stoppedProfiles.map((p) => ({
        profileId: p.profileId,
        pageName: p.pageName,
        status: p.status,
        title: p.title,
        url: p.url,
        durationMs: p.durationMs ?? null,
        networkEventCount: p.networkEventCount ?? 0,
        interactionCount: p.interactionCount ?? 0,
        warningCount: p.warningCount ?? 0,
        traceDir: p.traceDir,
        error: p.error ?? undefined
      }))
    };
    const report = await recorder.writeReport(extra);
    runRoots.push({ runLabel, runRoot, report });

    // 跨 run 流水（可追溯）
    const runsLog = path.join(args.outputRoot, "driver-runs.jsonl");
    await fs.appendFile(runsLog, JSON.stringify({ ts: ts(), runLabel, runRoot, ok: report.okSteps === report.totalSteps, ...extra }) + "\n", "utf-8")
      .catch(() => undefined);
  }

  // ---- 7. 汇总 -------------------------------------------------------------
  console.log("\n===== 汇总 =====");
  for (const { runLabel, runRoot, report } of runRoots) {
    console.log(`- ${runLabel}: ${report.okSteps}/${report.totalSteps} 步成功  产物=${runRoot}`);
  }
  console.log(`\n全部产物在：${args.outputRoot}`);
  console.log("（浏览器保持打开，未关闭）");
}

main().catch((error) => {
  console.error("\n[FATAL]", error instanceof Error ? error.message : error);
  console.error("请检查：1) SSH 隧道 2) Chrome CDP 9222 3) tracer API 14567");
  process.exitCode = 1;
});