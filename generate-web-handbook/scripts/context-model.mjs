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
    bindings: [],
    unresolved: [],
    freeze: null,
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
  if (document.binding_set_id && Array.isArray(document.surfaces)) {
    model.bindings.push(document);
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

  const surfacesFile = path.join(directory, "platform-core", "surfaces.json");
  if (await exists(surfacesFile)) {
    const registry = await readJson(surfacesFile);
    if (Array.isArray(registry.surfaces)) model.surfaces.push(...registry.surfaces);
    for (const surface of registry.surfaces || []) {
      if (!surface?.id) continue;
      const surfaceDir = path.join(directory, "platform-core", "surfaces", surface.id);
      const actionsFile = path.join(surfaceDir, "actions.json");
      if (!(await exists(actionsFile))) continue;
      const document = await readJson(actionsFile);
      for (const action of document.actions || []) {
        model.actions.push({ ...action, surface_id: surface.id });
      }
    }
  }

  const formalBindingsFile = path.join(
    directory,
    "context-model",
    "capability-bindings.json",
  );
  if (await exists(formalBindingsFile)) {
    const document = await readJson(formalBindingsFile);
    if (Array.isArray(document.bindings)) model.bindings.push(...document.bindings);
  }
  const validationFile = path.join(directory, "context-model", "validation-report.json");
  if (await exists(validationFile)) {
    const document = await readJson(validationFile);
    model.unresolved.push(...(document.unresolved_items || []));
  }
  const freezeFile = path.join(directory, "context-model", "context-model.freeze.json");
  if (await exists(freezeFile)) model.freeze = await readJson(freezeFile);
  return model;
}

function deduplicate(items, key) {
  const unique = new Map();
  for (const item of items) {
    const identity = item?.[key] || (key === "id" ? item?.binding_set_id : null);
    if (identity && !unique.has(identity)) unique.set(identity, item);
  }
  return [...unique.values()];
}

export async function loadContextModel(source) {
  if (!source) return null;
  const resolved = path.resolve(source);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return null;
  }
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
    "bindings",
    "unresolved",
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

function semanticTokens(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
      .map((token) => token.endsWith("s") ? token.slice(0, -1) : token),
  );
}

function limitationMatchesCapabilities(item, capabilityIds) {
  const limitationTokens = semanticTokens(`${item?.id || ""} ${item?.impact || ""}`);
  return capabilityIds.some((id) =>
    [...semanticTokens(id)].some((token) => limitationTokens.has(token)),
  );
}

export function contextForWorkflow(model, terms = [], capabilityIds = []) {
  if (!model || !terms.length) {
    return {
      objects: [],
      contexts: [],
      capabilities: [],
      surfaces: [],
      actions: [],
      locators: [],
      bindings: [],
      limitations: [],
    };
  }
  const hasFormalBindings = (model.bindings || []).some(
    (binding) => binding.capability_id,
  );
  const capabilityIdSet = new Set(hasFormalBindings ? capabilityIds : []);
  const supportedBindings = (model.bindings || []).filter(
    (binding) =>
      binding.status === "supported" &&
      capabilityIdSet.has(binding.capability_id),
  );
  const boundSurfaceIds = new Set(
    supportedBindings.map((binding) => binding.surface_id).filter(Boolean),
  );
  const boundActionIds = new Set(
    supportedBindings.flatMap((binding) => binding.platform_action_ids || []),
  );
  const objectIds = new Set(
    model.objects
      .filter((item) =>
        includesTerm(semanticText(item, ["id", "name", "fields"]), terms),
      )
      .map((item) => item.id),
  );
  const capabilities = model.capabilities.filter(
    (item) =>
      capabilityIdSet.size
        ? capabilityIdSet.has(item.id)
        : includesTerm(
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
      boundSurfaceIds.size
        ? boundSurfaceIds.has(item.id)
        : includesTerm(
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
      boundActionIds.size
        ? boundActionIds.has(item.id)
        : includesTerm(
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
  const bindings = capabilityIdSet.size
    ? supportedBindings
    : (model.bindings || []).filter((binding) =>
        (binding.surfaces || []).some((surface) =>
          includesTerm(semanticText(surface, ["id", "url_pattern", "required_field_ids"]), terms),
        ) || includesTerm(
          semanticText(binding, ["id", "capability_id", "surface_id"]),
          terms,
        ),
      );
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
        businessConditions: item.business_conditions || [],
      }))
      .slice(0, 3),
    surfaces: surfaces.slice(0, 2),
    actions: actions.slice(0, 3),
    locators: locators.slice(0, 7),
    bindings,
    limitations: (model.unresolved || []).filter((item) =>
      capabilityIds.length
        ? limitationMatchesCapabilities(item, capabilityIds)
        : includesTerm(semanticText(item, ["id", "impact"]), terms),
    ),
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
