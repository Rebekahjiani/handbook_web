import fs from "node:fs/promises";
import path from "node:path";

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function emptyModel(source) {
  return {
    source,
    objects: [],
    contexts: [],
    capabilities: [],
    surfaces: [],
    actions: [],
    locators: [],
  };
}

function mergeDocument(model, document) {
  for (const key of [
    "objects",
    "contexts",
    "capabilities",
    "surfaces",
    "actions",
    "locators",
  ]) {
    if (Array.isArray(document[key])) model[key].push(...document[key]);
  }
  if (document.id && Array.isArray(document.business_conditions)) {
    model.capabilities.push(document);
  }
}

async function loadDirectory(directory) {
  const model = emptyModel(directory);
  const fixedFiles = [
    "business-core/object-model.json",
    "business-core/business-context.json",
  ];
  for (const relative of fixedFiles) {
    const file = path.join(directory, relative);
    if (await exists(file)) mergeDocument(model, await readJson(file));
  }

  for (const relative of [
    "business-core/capabilities",
    "platform-core/bindings",
  ]) {
    const folder = path.join(directory, relative);
    if (!(await exists(folder))) continue;
    for (const name of (await fs.readdir(folder)).sort()) {
      if (!name.endsWith(".json") || name.endsWith(".schema.json")) continue;
      mergeDocument(model, await readJson(path.join(folder, name)));
    }
  }
  return model;
}

function deduplicate(items, key) {
  const unique = new Map();
  for (const item of items) {
    const identity = item?.[key];
    if (identity && !unique.has(identity)) unique.set(identity, item);
  }
  return [...unique.values()];
}

export async function loadContextModel(source) {
  if (!source) return null;
  const resolved = path.resolve(source);
  const stat = await fs.stat(resolved);
  let model;
  if (stat.isDirectory()) {
    model = await loadDirectory(resolved);
  } else {
    model = emptyModel(resolved);
    mergeDocument(model, await readJson(resolved));
  }
  for (const key of [
    "objects",
    "contexts",
    "capabilities",
    "surfaces",
    "actions",
    "locators",
  ]) {
    model[key] = deduplicate(model[key], "id");
  }
  return model;
}

function includesTerm(value, terms) {
  const normalize = (text) =>
    ` ${String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()} `;
  const text = normalize(value);
  return terms.some((term) => text.includes(normalize(term)));
}

function semanticText(item, fields) {
  return fields.flatMap((field) => item?.[field] || []).join(" ");
}

export function contextForWorkflow(model, terms = []) {
  if (!model || !terms.length) {
    return {
      objects: [],
      contexts: [],
      capabilities: [],
      surfaces: [],
      actions: [],
      locators: [],
    };
  }
  const objectIds = new Set(
    model.objects
      .filter((item) =>
        includesTerm(semanticText(item, ["id", "name", "fields"]), terms),
      )
      .map((item) => item.id),
  );
  const capabilities = model.capabilities.filter(
    (item) =>
      includesTerm(
        semanticText(item, [
          "id",
          "object_ids",
          "inputs",
          "outputs",
          "requires_context_ids",
          "business_conditions",
        ]),
        terms,
      ) ||
      (item.object_ids || []).some((id) => objectIds.has(id)),
  );
  const contextIds = new Set(
    capabilities.flatMap((item) => item.requires_context_ids || []),
  );
  const contexts = model.contexts.filter(
    (item) =>
      contextIds.has(item.id) ||
      includesTerm(semanticText(item, ["id", "description"]), terms),
  );
  const surfaces = model.surfaces
    .filter((item) =>
      includesTerm(
        semanticText(item, [
          "id",
          "url_pattern",
          "required_locator_ids",
          "required_field_ids",
        ]),
        terms,
      ),
    )
    .map((item) => ({
      id: item.id,
      urlPattern: item.url_pattern,
      requiredLocators: item.required_locator_ids || [],
      requiredFields: item.required_field_ids || [],
    }));
  const actions = model.actions
    .filter((item) =>
      includesTerm(
        semanticText(item, [
          "id",
          "target_locator_id",
          "success_condition",
          "link_policy",
        ]),
        terms,
      ),
    )
    .map((item) => ({
      id: item.id,
      targetLocator: item.target_locator_id,
    }));
  const referencedLocatorIds = new Set([
    ...surfaces.flatMap((item) => item.requiredLocators),
    ...actions.map((item) => item.targetLocator).filter(Boolean),
  ]);
  const locators = model.locators
    .filter(
      (item) =>
        (referencedLocatorIds.has(item.id) ||
          includesTerm(
            semanticText(item, ["id", "selector", "scope"]),
            terms,
          )) &&
        item.verification_status !== "unverified",
    )
    .sort((a, b) => {
      const preferred = [
        "history-row",
        "history-purchase-date",
        "history-grand-total",
        "history-status",
        "history-detail-link",
        "pagination-next",
        "detail-grand-total",
      ];
      const rank = (item) => {
        const index = preferred.indexOf(item.id);
        return index < 0 ? preferred.length : index;
      };
      return rank(a) - rank(b);
    })
    .map((item) => ({
      id: item.id,
      selector: item.selector,
      scope: item.scope,
      status: item.verification_status,
    }));
  return {
    objects: model.objects
      .filter((item) => objectIds.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        fields: item.fields || [],
      }))
      .slice(0, 2),
    contexts: contexts.map((item) => item.id).slice(0, 4),
    capabilities: capabilities
      .map((item) => ({
        id: item.id,
        inputs: item.inputs || [],
        outputs: item.outputs || [],
        contexts: item.requires_context_ids || [],
      }))
      .slice(0, 3),
    surfaces: surfaces.slice(0, 2),
    actions: actions.slice(0, 3),
    locators: locators.slice(0, 7),
  };
}

export function contextModelMarkdown(model) {
  if (!model) return null;
  const lines = [
    "# 站点模型索引",
    "",
    "此文件只列出可按需加载的正式模型范围；执行任务时优先读取已路由工作流中的摘录。",
    "",
    `- 业务对象：${model.objects.map((item) => item.id).join("、") || "无"}`,
    `- 业务能力：${model.capabilities.map((item) => item.id).join("、") || "无"}`,
    `- 页面状态：${model.surfaces.map((item) => item.id).join("、") || "无"}`,
    `- 平台动作：${model.actions.map((item) => item.id).join("、") || "无"}`,
    `- 已验证定位：${model.locators.filter((item) => item.verification_status === "verified").length} 条`,
    "",
    "模型描述稳定语义，不代表当前页面状态。执行前仍须读取实时浏览器快照。",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
