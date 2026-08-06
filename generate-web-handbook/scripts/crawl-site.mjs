#!/usr/bin/env node

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildWorkflowHandbook,
  loadTaskCorpus,
  rankTaskLinks,
  taskLinkScore,
  taskSeedUrls,
} from "./task-workflows.mjs";
import { loadContextModel } from "./context-model.mjs";
import { auditRouter } from "./router-audit.mjs";

async function loadWorkflowDefs(configPath) {
  if (!configPath) return null;
  const resolved = path.resolve(configPath);
  const mod = await import(resolved);
  if (!Array.isArray(mod.default)) {
    throw new Error(`--workflow-config must export a default array: ${resolved}`);
  }
  return mod.default;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "fresh" || key === "save-html") {
      args[key] = true;
    } else {
      args[key] = argv[++i];
    }
  }
  return args;
}

function slug(value, fallback = "page") {
  const result = value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return result || fallback;
}

function pageSlug(url, index) {
  const parsed = new URL(url);
  const route = `${parsed.pathname}${parsed.search}`;
  return `${String(index + 1).padStart(2, "0")}-${slug(route, "home")}`;
}

function normalizeUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    url.hash = "";
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function crawlIdentity(raw) {
  const url = new URL(raw);
  return `${url.origin}${url.pathname}`;
}

function safeCrawlUrl(raw, startOrigin) {
  const url = new URL(raw);
  if (url.origin !== startOrigin) return false;
  if (/\.(?:zip|pdf|png|jpe?g|gif|svg|webp|mp4|mp3)$/i.test(url.pathname)) {
    return false;
  }
  const tokens = decodeURIComponent(`${url.pathname}${url.search}`)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const unsafe = new Set(["logout", "signout", "delete", "remove", "checkout"]);
  return (
    !tokens.some((token) => unsafe.has(token)) &&
    !tokens.some((token, index) => token === "place" && tokens[index + 1] === "order")
  );
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, file);
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function archiveExisting(directory) {
  if (!(await pathExists(directory))) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.rename(directory, `${directory}.previous-${stamp}`);
}

async function waitForDomSettled(page) {
  let previous = null;
  let stableSamples = 0;
  for (let index = 0; index < 8; index += 1) {
    const signature = await page.evaluate(
      () =>
        `${document.querySelectorAll("a[href]").length}:` +
        `${document.querySelectorAll("button,input,select,[role='button'],[role='tab']").length}:` +
        `${document.body?.innerText.length || 0}`,
    );
    if (signature === previous) {
      stableSamples += 1;
      if (stableSamples >= 2) return;
    } else {
      stableSamples = 0;
      previous = signature;
    }
    await page.waitForTimeout(200);
  }
}

async function collectRevealedNavigationLinks(page) {
  const triggerSelector = [
    "nav > ul > li > a",
    "nav.navigation > ul > li > a",
    "[role='navigation'] > ul > li > a",
    ".navigation > ul > li > a",
  ].join(", ");
  const triggers = page.locator(triggerSelector);
  const triggerCount = Math.min(await triggers.count(), 24);
  const links = new Set();
  const capture = async () => {
    const current = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "nav a[href], [role='navigation'] a[href], .navigation a[href]",
        ),
      ].map((anchor) => anchor.href),
    );
    current.forEach((link) => links.add(link));
  };
  await capture();
  for (let index = 0; index < triggerCount; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible().catch(() => false))) continue;
    await trigger.hover({ timeout: 1_500 }).catch(() => {});
    await page.waitForTimeout(80);
    await capture();
  }
  await page.mouse.move(0, 0).catch(() => {});
  return [...links];
}

async function writeAggregateRouter(outputRoot) {
  const routes = [];
  for (const entry of await fs.readdir(outputRoot, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      entry.name.includes(".previous-")
    ) {
      continue;
    }
    const siteRouterFile = path.join(outputRoot, entry.name, "router.json");
    if (!(await pathExists(siteRouterFile))) continue;
    const siteRouter = JSON.parse(await fs.readFile(siteRouterFile, "utf8"));
    for (const route of siteRouter.routes || []) {
      routes.push({
        ...route,
        skill_file: path.posix.join(entry.name, route.skill_file),
      });
    }
  }
  await writeJsonAtomic(path.join(outputRoot, "webarena-router.json"), {
    schema_version: 1,
    router: "webarena-handbook-router",
    routes,
  });
}

async function collectPage(page) {
  return page.evaluate(() => {
    const clean = (value, limit = 160) =>
      String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
    const cssQuote = (value) => JSON.stringify(String(value));
    const unique = (selector) => {
      try {
        return document.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    };
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width >= 2 &&
        rect.height >= 2 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const stableId = (value) =>
      value && !/^id[a-z0-9]{6,}$/i.test(value) ? value : "";
    const roleOf = (el) => {
      if (el.getAttribute("role")) return el.getAttribute("role");
      const tag = el.tagName.toLowerCase();
      if (tag === "a" && el.hasAttribute("href")) return "link";
      if (tag === "button") return "button";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag === "summary") return "button";
      if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (["button", "submit", "reset"].includes(type)) return "button";
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        return "textbox";
      }
      return tag;
    };
    const nameOf = (el) => {
      const childAlt = el.querySelector("img[alt]")?.getAttribute("alt");
      const labelledBy = el
        .getAttribute("aria-labelledby")
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText)
        .filter(Boolean)
        .join(" ");
      const idLabel = el.id
        ? document.querySelector(`label[for=${cssQuote(el.id)}]`)?.innerText
        : "";
      return clean(
        el.getAttribute("aria-label") ||
          labelledBy ||
          idLabel ||
          el.closest("label")?.innerText ||
          el.getAttribute("alt") ||
          (!/^(?:image|photo|picture)$/i.test(childAlt || "") ? childAlt : "") ||
          el.getAttribute("placeholder") ||
          el.innerText ||
          el.getAttribute("title") ||
          el.getAttribute("value"),
      );
    };
    const cssPath = (el) => {
      const parts = [];
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
        const tag = current.tagName.toLowerCase();
        if (stableId(current.id)) {
          parts.unshift(`#${CSS.escape(current.id)}`);
          break;
        }
        const siblings = [...current.parentElement?.children || []].filter(
          (sibling) => sibling.tagName === current.tagName,
        );
        const suffix =
          siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
        parts.unshift(`${tag}${suffix}`);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const scopeOf = (el) => {
      const area =
        el.closest('li.product-item, [data-product-id], article, tr') ||
        el.closest('[data-testid], [data-test], [data-qa], form');
      if (!area) return null;
      const tag = area.tagName.toLowerCase();
      let selector = "";
      for (const attr of ["data-testid", "data-test", "data-qa"]) {
        if (area.getAttribute(attr)) {
          selector = `${tag}[${attr}=${cssQuote(area.getAttribute(attr))}]`;
          break;
        }
      }
      if (!selector) {
        const stableClass = [...area.classList].find(
          (name) => /^[a-z][a-z0-9_-]+$/i.test(name) && !/\d/.test(name),
        );
        selector = stableClass ? `${tag}.${CSS.escape(stableClass)}` : tag;
      }
      const heading = area.querySelector(
        '.product-item-link, [class*="name"], [class*="title"], h1, h2, h3, h4, legend',
      );
      const scopeText = clean(
        area.getAttribute("aria-label") || heading?.innerText || area.innerText,
        140,
      );
      return scopeText ? { selector, text: scopeText } : null;
    };
    const contextOf = (el) => {
      const area = el.closest("nav, main, section, header, footer, aside");
      if (!area) return "";
      const heading = area.querySelector("h1, h2, h3, legend");
      return clean(
        area.getAttribute("aria-label") ||
          area.getAttribute("data-role") ||
          heading?.innerText ||
          area.tagName.toLowerCase(),
        100,
      );
    };

    const candidates = [
      ...document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [contenteditable="true"]',
      ),
    ];
    const visibleCandidates = candidates.filter(isVisible);
    const actions = [];
    let unresolvedActionCount = 0;
    for (const el of visibleCandidates) {
      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const role = roleOf(el);
      const name = nameOf(el);
      const exactRole = Boolean(name);
      const scope = scopeOf(el);
      const locatorCandidates = [];
      for (const attr of [
        "data-testid",
        "data-test",
        "data-qa",
        "data-role",
        "aria-label",
        "title",
      ]) {
        const value = el.getAttribute(attr);
        if (value) {
          const selector = `${tag}[${attr}=${cssQuote(value)}]`;
          locatorCandidates.push({ kind: "css", selector, count: unique(selector) });
        }
      }
      if (stableId(el.id)) {
        const selector = `#${CSS.escape(el.id)}`;
        locatorCandidates.push({ kind: "css", selector, count: unique(selector) });
      }
      if (el.getAttribute("name")) {
        const selector = `${tag}[name=${cssQuote(el.getAttribute("name"))}]`;
        locatorCandidates.push({ kind: "css", selector, count: unique(selector) });
      }
      if (tag === "a" && el.getAttribute("href")) {
        const selector = `a[href=${cssQuote(el.getAttribute("href"))}]`;
        locatorCandidates.push({ kind: "css", selector, count: unique(selector) });
        const stableClass = [...el.classList].find(
          (value) => /^[a-z][a-z0-9_-]+$/i.test(value) && !/\d/.test(value),
        );
        if (stableClass) {
          const classSelector = `a.${CSS.escape(stableClass)}[href=${cssQuote(el.getAttribute("href"))}]`;
          locatorCandidates.unshift({
            kind: "css",
            selector: classSelector,
            count: unique(classSelector),
          });
        }
      }
      const fallback = cssPath(el);
      locatorCandidates.push({ kind: "css", selector: fallback, count: unique(fallback) });

      let roleCount = 0;
      if (name) {
        roleCount = visibleCandidates.filter(
          (candidate) => roleOf(candidate) === role && nameOf(candidate) === name,
        ).length;
      }
      let within = null;
      if (name && roleCount > 1 && scope) {
        const matchingTargets = [...document.querySelectorAll(scope.selector)]
          .filter((area) => clean(area.innerText, 10_000).includes(scope.text))
          .flatMap((area) => [area, ...area.querySelectorAll("*")])
          .filter(
            (candidate) =>
              isVisible(candidate) &&
              roleOf(candidate) === role &&
              nameOf(candidate) === name,
          );
        if (matchingTargets.length === 1) {
          within = {
            kind: "within",
            scope: scope.selector,
            scopeText: scope.text,
            role,
            name,
            exact: false,
            count: 1,
          };
        }
      }
      const stableCss = locatorCandidates
        .slice(0, -1)
        .find((candidate) => candidate.count === 1);
      const uniqueCss =
        stableCss ||
        locatorCandidates.find((candidate) => candidate.count === 1);
      const preferCss =
        stableCss &&
        (tag === "a" || ["input", "select", "textarea"].includes(tag));
      const primary =
        tag === "input" && el.type === "password"
          ? stableCss || locatorCandidates[locatorCandidates.length - 1]
          : preferCss
            ? stableCss
          : name && roleCount === 1
            ? { kind: "role", role, name, exact: exactRole, count: 1 }
            : within || uniqueCss || locatorCandidates[locatorCandidates.length - 1];
      if (!primary || primary.count !== 1) {
        unresolvedActionCount += 1;
        continue;
      }
      actions.push({
        id: `a${actions.length + 1}`,
        tag,
        role,
        name,
        type: el.getAttribute("type") || "",
        href: el.href || "",
        placeholder: clean(el.getAttribute("placeholder")),
        context: scope?.text || contextOf(el),
        region: contextOf(el),
        primary,
        candidates: locatorCandidates,
        box: {
          x: Math.round(rect.x + window.scrollX),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    const firstExisting = (selectors) =>
      selectors.find((selector) => document.querySelector(selector)) || null;
    const structures = [];
    const itemSelector = firstExisting([
      "li.product-item",
      "article.product-item",
      "[data-product-id]",
    ]);
    if (itemSelector) {
      const firstItem = document.querySelector(itemSelector);
      const childSelector = (selectors) =>
        selectors.find((selector) => firstItem?.querySelector(selector)) || null;
      structures.push({
        id: "product-list",
        itemSelector,
        itemCount: document.querySelectorAll(itemSelector).length,
        fields: {
          name: childSelector([
            "a.product-item-link",
            ".product-item-name a",
            "[class*='product'][class*='name'] a",
          ]),
          price: childSelector([
            ".price-box .price",
            "[data-price-amount]",
            ".price",
          ]),
          link: childSelector([
            "a.product-item-link",
            "a.product-item-photo",
          ]),
        },
      });
    }
    const nextSelector = firstExisting([
      ".pages .pages-item-next > a.action.next",
      "a.action.next",
      "a[rel='next']",
    ]);
    const limiterSelector = firstExisting([
      "select[data-role='limiter']",
      "select#limiter",
    ]);
    const totalSelector = firstExisting([
      ".toolbar-amount",
      "[data-role='toolbar-amount']",
    ]);
    if (nextSelector || limiterSelector || totalSelector) {
      structures.push({
        id: "pagination",
        nextSelector,
        limiterSelector,
        totalSelector,
      });
    }

    return {
      title: document.title,
      headings: [...document.querySelectorAll("h1, h2, h3")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => clean(el.innerText))
        .filter(Boolean)
        .slice(0, 20),
      actions,
      structures,
      unresolvedActionCount,
      links: [
        ...new Set(
          [...document.querySelectorAll("a[href]")]
            .map((el) => el.href)
            .filter(Boolean),
        ),
      ],
    };
  });
}

async function screenshotWithEvidence(page, pageData, screenshotDir, name) {
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true,
  });
  await page.evaluate((actions) => {
    document.querySelector("[data-handbook-overlay]")?.remove();
    const overlay = document.createElement("div");
    overlay.dataset.handbookOverlay = "true";
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    for (const action of actions) {
      const box = document.createElement("div");
      Object.assign(box.style, {
        position: "absolute",
        left: `${action.box.x}px`,
        top: `${action.box.y}px`,
        width: `${action.box.width}px`,
        height: `${action.box.height}px`,
        border: "2px solid #ff2d55",
        background: "rgba(255,45,85,.08)",
        boxSizing: "border-box",
      });
      const label = document.createElement("span");
      label.textContent = action.id;
      Object.assign(label.style, {
        position: "absolute",
        left: "0",
        top: "-18px",
        padding: "1px 4px",
        background: "#ff2d55",
        color: "white",
        font: "12px/16px sans-serif",
      });
      box.append(label);
      overlay.append(box);
    }
    document.body.append(overlay);
  }, pageData.actions);
  await page.screenshot({
    path: path.join(screenshotDir, `${name}-annotated.png`),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.querySelector("[data-handbook-overlay]")?.remove();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    throw new Error(
      "Usage: crawl-site.mjs --url URL [--site NAME] [--output DIR] [--cdp URL] [--max-pages N] [--max-depth N] [--coverage-corpus FILE] [--focus-tasks FILE] [--tasks FILE] [--site-key NAME] [--context-model PATH] [--max-task-seeds N] [--previous-router FILE] [--allow-route-removal a,b] [--workflow-config FILE] [--fresh]",
    );
  }

  const workflowDefs = await loadWorkflowDefs(args["workflow-config"] || null);
  const startUrl = normalizeUrl(args.url);
  if (!startUrl) throw new Error(`Invalid URL: ${args.url}`);
  const startOrigin = new URL(startUrl).origin;
  const siteName = args.site || slug(new URL(startUrl).host);
  const skillName = `use-${slug(siteName)}`.slice(0, 63).replace(/-$/, "");
  const outputRoot = path.resolve(args.output || "handbooks");
  const siteDir = path.join(outputRoot, slug(siteName));
  const manifestFile = path.join(siteDir, "manifest.json");
  const maxPages = Math.max(1, Number(args["max-pages"] || 5));
  const maxDepth = Math.max(0, Number(args["max-depth"] || 1));
  const cdp = args.cdp || "http://127.0.0.1:9222";
  if (args.tasks && (args["coverage-corpus"] || args["focus-tasks"])) {
    throw new Error("--tasks cannot be combined with --coverage-corpus or --focus-tasks");
  }
  const coverageCorpusFile = args["coverage-corpus"]
    ? path.resolve(args["coverage-corpus"])
    : args.tasks
      ? path.resolve(args.tasks)
      : null;
  const focusTasksFile = args["focus-tasks"]
    ? path.resolve(args["focus-tasks"])
    : coverageCorpusFile;
  const contextModelPath = args["context-model"]
    ? path.resolve(args["context-model"])
    : null;
  const siteKey = args["site-key"] || null;
  const coverageTasks = await loadTaskCorpus(coverageCorpusFile, siteKey);
  const focusTasks = await loadTaskCorpus(focusTasksFile, siteKey);
  const contextModel = await loadContextModel(contextModelPath);
  const taskSeeds = taskSeedUrls(focusTasks, startOrigin, siteKey).filter((url) =>
    safeCrawlUrl(url, startOrigin),
  );
  const maxTaskSeeds = Math.max(
    0,
    Number(args["max-task-seeds"] ?? Math.floor(maxPages / 3)),
  );
  const selectedTaskSeeds = taskSeeds
    .filter((url) => url !== startUrl)
    .slice(0, maxTaskSeeds);

  const existingRouterFile = path.join(siteDir, "router.json");
  const previousRouterFile = args["previous-router"]
    ? path.resolve(args["previous-router"])
    : existingRouterFile;
  const previousRouter = await pathExists(previousRouterFile)
    ? JSON.parse(await fs.readFile(previousRouterFile, "utf8"))
    : null;
  if (args.fresh) await archiveExisting(siteDir);
  await fs.mkdir(path.join(siteDir, "references"), { recursive: true });
  await fs.mkdir(path.join(siteDir, "references", "workflows"), {
    recursive: true,
  });
  await fs.mkdir(path.join(siteDir, "snapshots", "pages"), { recursive: true });
  await fs.mkdir(path.join(siteDir, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(siteDir, "agents"), { recursive: true });

  let manifest = {
    schemaVersion: 1,
    siteName,
    startUrl,
    origin: startOrigin,
    cdp,
    maxPages,
    maxDepth,
    coverageCorpusFile,
    focusTasksFile,
    contextModelPath,
    siteKey,
    coverageTaskCount: coverageTasks.length,
    focusTaskCount: focusTasks.length,
    taskSeedsAvailable: taskSeeds.length,
    taskSeedsQueued: selectedTaskSeeds.length,
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [],
    redirects: [],
    errors: [],
  };
  if (!args.fresh && (await pathExists(manifestFile))) {
    manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    Object.assign(manifest, {
      cdp,
      maxPages,
      maxDepth,
      coverageCorpusFile,
      focusTasksFile,
      contextModelPath,
      siteKey,
      coverageTaskCount: coverageTasks.length,
      focusTaskCount: focusTasks.length,
      taskSeedsAvailable: taskSeeds.length,
      taskSeedsQueued: selectedTaskSeeds.length,
    });
    manifest.status = "running";
    manifest.updatedAt = new Date().toISOString();
  }
  await writeJsonAtomic(manifestFile, manifest);

  const browser = await chromium.connectOverCDP(cdp);
  const context = browser.contexts()[0];
  if (!context) throw new Error(`No browser context available at ${cdp}`);
  const page = context.pages()[0] || (await context.newPage());
  const completed = new Set(
    manifest.pages.flatMap((item) => [item.url, item.requestedUrl].filter(Boolean)),
  );
  const completedIdentities = new Set([...completed].map(crawlIdentity));
  for (const redirect of manifest.redirects || []) {
    completed.add(redirect.requestedUrl);
    completedIdentities.add(crawlIdentity(redirect.requestedUrl));
  }
  const queue = [];
  const queued = new Set();
  const queuedIdentities = new Set();
  const enqueue = (url, depth, discoveryBoost = 0) => {
    const identity = crawlIdentity(url);
    if (!queued.has(url) && !queuedIdentities.has(identity)) {
      const relevance =
        url === startUrl
          ? { score: Number.MAX_SAFE_INTEGER, depth: 0 }
          : taskLinkScore(url, focusTasks, startOrigin);
      queue.push({
        url,
        depth,
        relevance: relevance.score + discoveryBoost,
        routeDepth: relevance.depth,
      });
      queue.sort(
        (a, b) =>
          b.relevance - a.relevance ||
          b.routeDepth - a.routeDepth ||
          a.depth - b.depth,
      );
      queued.add(url);
      queuedIdentities.add(identity);
    }
  };
  enqueue(startUrl, 0);
  for (const seed of selectedTaskSeeds) enqueue(seed, 0);
  for (const saved of manifest.pages) {
    if (saved.depth >= maxDepth) continue;
    for (const link of saved.links || []) {
      if (!completed.has(link)) enqueue(link, saved.depth + 1);
    }
  }
  try {
    while (queue.length && manifest.pages.length < maxPages) {
      const item = queue.shift();
      if (
        completed.has(item.url) ||
        completedIdentities.has(crawlIdentity(item.url)) ||
        item.depth > maxDepth
      ) {
        continue;
      }
      const currentSlug = pageSlug(item.url, manifest.pages.length);
      try {
        const response = await page.goto(item.url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        if (response && response.status() >= 400) {
          throw new Error(`HTTP ${response.status()} for ${item.url}`);
        }
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
        await waitForDomSettled(page);
        const revealedNavigationLinks =
          await collectRevealedNavigationLinks(page);
        const finalUrl = normalizeUrl(page.url());
        if (!finalUrl || new URL(finalUrl).origin !== startOrigin) {
          throw new Error(`Navigation left target origin: ${page.url()}`);
        }
        if (completed.has(finalUrl)) {
          manifest.redirects ||= [];
          manifest.redirects.push({
            requestedUrl: item.url,
            finalUrl,
            at: new Date().toISOString(),
          });
          completed.add(item.url);
          completedIdentities.add(crawlIdentity(item.url));
          manifest.updatedAt = new Date().toISOString();
          await writeJsonAtomic(manifestFile, manifest);
          continue;
        }
        const data = await collectPage(page);
        const links = [...data.links, ...revealedNavigationLinks]
          .map((link) => normalizeUrl(link, finalUrl))
          .filter((link) => link && safeCrawlUrl(link, startOrigin));
        const record = {
          url: finalUrl,
          requestedUrl: item.url,
          depth: item.depth,
          slug: currentSlug,
          capturedAt: new Date().toISOString(),
          title: data.title,
          headings: data.headings,
          actions: data.actions,
          structures: data.structures,
          unresolvedActionCount: data.unresolvedActionCount,
          links: [...new Set(links)],
        };
        await writeJsonAtomic(
          path.join(siteDir, "snapshots", "pages", `${currentSlug}.json`),
          record,
        );
        if (args["save-html"]) {
          await fs.writeFile(
            path.join(siteDir, "snapshots", "pages", `${currentSlug}.html`),
            await page.content(),
          );
        }
        await screenshotWithEvidence(
          page,
          record,
          path.join(siteDir, "screenshots"),
          currentSlug,
        );
        manifest.pages.push({
          url: finalUrl,
          requestedUrl: item.url,
          depth: item.depth,
          slug: currentSlug,
          title: data.title,
          actionCount: data.actions.length,
          structureCount: data.structures.length,
          unresolvedActionCount: data.unresolvedActionCount,
          links: record.links,
        });
        completed.add(item.url);
        completed.add(finalUrl);
        completedIdentities.add(crawlIdentity(item.url));
        completedIdentities.add(crawlIdentity(finalUrl));
        if (item.depth < maxDepth) {
          const rankedLinks = rankTaskLinks(
            record.links,
            focusTasks,
            startOrigin,
          );
          for (const [index, link] of rankedLinks.entries()) {
            if (!completed.has(link) && !queued.has(link)) {
              enqueue(
                link,
                item.depth + 1,
                index < 2 ? 100 - index : 0,
              );
            }
          }
        }
      } catch (error) {
        manifest.errors.push({
          url: item.url,
          depth: item.depth,
          at: new Date().toISOString(),
          message: error.message,
        });
      }
      manifest.updatedAt = new Date().toISOString();
      await writeJsonAtomic(manifestFile, manifest);
    }
  } finally {
    await browser.close();
  }

  const pageRecords = [];
  for (const item of manifest.pages) {
    pageRecords.push(
      JSON.parse(
        await fs.readFile(
          path.join(siteDir, "snapshots", "pages", `${item.slug}.json`),
          "utf8",
        ),
      ),
    );
  }
  await writeJsonAtomic(path.join(siteDir, "snapshots", "selectors.json"), {
    schemaVersion: 1,
    siteName,
    origin: startOrigin,
    pages: pageRecords,
  });
  const generated = buildWorkflowHandbook({
    siteName,
    skillName,
    origin: startOrigin,
    siteKey: args["site-key"] || null,
    pages: pageRecords,
    coverageTasks,
    focusTasks,
    contextModel,
    ...(workflowDefs ? { workflowDefs } : {}),
  });
  const routerAudit = auditRouter({
    router: generated.router,
    tasks: coverageTasks,
    siteKey: siteKey || generated.router.site.key,
    origin: startOrigin,
    previousRouter,
    allowedRouteRemovals: String(args["allow-route-removal"] || "")
      .split(",")
      .filter(Boolean),
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
  for (const filename of await fs.readdir(workflowDir)) {
    if (filename.endsWith(".md") && !(filename in generated.workflows)) {
      await fs.unlink(path.join(workflowDir, filename));
    }
  }
  for (const [filename, content] of Object.entries(generated.workflows)) {
    await fs.writeFile(path.join(workflowDir, filename), content);
  }
  const runtimeDir = path.join(siteDir, "runtime-skills");
  await fs.mkdir(runtimeDir, { recursive: true });
  for (const entry of await fs.readdir(runtimeDir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      !Object.keys(generated.runtimeSkills).some((filename) =>
        filename.startsWith(`${entry.name}/`),
      )
    ) {
      await fs.rm(path.join(runtimeDir, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }
  for (const [filename, content] of Object.entries(generated.runtimeSkills)) {
    const target = path.join(runtimeDir, filename);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  await writeJsonAtomic(path.join(siteDir, "router.json"), generated.router);
  await writeAggregateRouter(outputRoot);
  await fs.writeFile(
    path.join(siteDir, "references", "handbook.md"),
    generated.handbook,
  );
  await writeJsonAtomic(
    path.join(siteDir, "references", "execution-contract.json"),
    generated.executionContract,
  );
  const contextModelFile = path.join(
    siteDir,
    "references",
    "context-model.md",
  );
  if (generated.contextModel) {
    await fs.writeFile(contextModelFile, generated.contextModel);
  } else if (await pathExists(contextModelFile)) {
    await fs.unlink(contextModelFile);
  }
  await fs.writeFile(path.join(siteDir, "SKILL.md"), generated.skill);
  await writeJsonAtomic(
    path.join(siteDir, "snapshots", "coverage.json"),
    generated.coverage,
  );
  await writeJsonAtomic(
    path.join(siteDir, "snapshots", "router-audit.json"),
    routerAudit,
  );
  await fs.writeFile(
    path.join(siteDir, "agents", "openai.yaml"),
    `interface:
  display_name: ${JSON.stringify(siteName)}
  short_description: ${JSON.stringify(`${siteName} 的精确浏览器操作指南`)}
  default_prompt: ${JSON.stringify(`使用 $${skillName} 和已验证的 selector 操作 ${siteName}。`)}
`,
  );
  manifest.status = "completed";
  manifest.updatedAt = new Date().toISOString();
  manifest.summary = {
    pagesCaptured: pageRecords.length,
    actionsCaptured: pageRecords.reduce((sum, item) => sum + item.actions.length, 0),
    ambiguousActionsExcluded: pageRecords.reduce(
      (sum, item) => sum + (item.unresolvedActionCount || 0),
      0,
    ),
    coverageTasksLoaded: coverageTasks.length,
    focusTasksLoaded: focusTasks.length,
    routerUnmatched: routerAudit.unmatched_count,
    routerConflicts: routerAudit.conflict_count,
    contextModelLoaded: Boolean(contextModel),
    workflowsGenerated: generated.coverage.workflows.length,
    coveredWorkflows: generated.coverage.workflows.filter((item) => item.covered)
      .length,
    workflowGaps: generated.coverage.workflows.filter(
      (item) => item.taskCount && !item.covered,
    ).length,
    redirectsSkipped: manifest.redirects?.length || 0,
    errors: manifest.errors.length,
  };
  await writeJsonAtomic(manifestFile, manifest);
  process.stdout.write(`${siteDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
