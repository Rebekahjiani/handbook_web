const DEFAULT_VOCABULARY = {
  checkout: /\b(?:buy|checkout|place (?:an? )?order)\b|购买|结账|下单/i,
  cart: /\b(?:shopping cart|cart|wishlist|wish list)\b|购物车|愿望单|收藏/i,
  order: /\b(?:order|orders|purchase|purchases|bought|shipping|delivery|invoice|refund)\b|订单|购买|配送|发票|退款/i,
  account: /\b(?:log in|login|sign in|register|account|profile|contact|newsletter|form|my address|my information)\b|登录|注册|账户|个人信息|联系表单|我的地址/i,
  product: /\b(?:product|products|item|items|model|models)\b|商品|产品|型号/i,
  catalog: /\b(?:category page|browse products|catalog)\b|分类页|浏览商品|目录/i,
  review: /\b(?:review|reviews|reviewer|rating|stars?)\b|评论|评分/i,
  lookup: /\b(?:find|get|show|what is|which|retrieve|look up|查询|查找|读取)\b/i,
  aggregate: /\b(?:how many|how much|total|amount|spent|sum|count|refund|each month|每月|总额|金额|数量|合计|退款)\b/i,
  mutate: /\b(?:buy|checkout|place (?:an? )?order|create|add|edit|update|delete|remove|submit|send|post|publish|save|subscribe|fill|log in|login|sign in|register)\b|购买|结账|下单|创建|添加|编辑|更新|删除|提交|发布|保存|填写|登录|注册/i,
  latest: /\b(?:latest|most recent|recent|last|first)\b|最近|最新|上一笔/i,
  status: /\b(?:pending|processing|completed|complete|cancelled|canceled|refunded|status)\b|待处理|处理中|已完成|取消|退款|状态/i,
  exactDate: /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b|具体日期|某天/i,
  dateRange: /\b(?:past|last|between|from|before|after|since)\b.*\b(?:day|days|month|months|year|years|date)\b|时间范围|日期范围/i,
  explicitCategory: /\b(?:category|product type|item type|brand)\b|类别|分类|品类|品牌/i,
  grandTotal: /\b(?:grand total|including shipping|including handling|total paid|total amount)\b|含运费|含手续费|总支付/i,
  itemSubtotal: /\b(?:item subtotal|excluding shipping|excluding handling|before shipping)\b|不含运费|商品小计/i,
  detail: /\b(?:detail|details|line item|item row|product in the order)\b|详情|明细|商品行/i,
  leastExpensive: /\b(?:least expensive|lowest (?:per unit )?price|cheapest)\b|最便宜|最低价/i,
  mostExpensive: /\b(?:most expensive|highest (?:per unit )?price)\b|最贵|最高价/i,
  priceRange: /\bprice range\b|价格范围/i,
};

const RANGE_BOUND = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|year|month|week|day)\b/i;
const RANGE_BOUND_MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const MONTH_ATOM = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:,?\s+\d{4})?`;
const EXPLICIT_DATE_RANGE = new RegExp(
  String.raw`\b(?:from\s+(?:the\s+)?${MONTH_ATOM}\s+(?:to|through|until)\s+(?:the\s+)?${MONTH_ATOM}|between\s+(?:the\s+)?${MONTH_ATOM}\s+and\s+(?:the\s+)?${MONTH_ATOM})\b`,
  "i",
);
const CALENDAR_MONTH = new RegExp(String.raw`\bin\s+(?:the\s+)?${MONTH_ATOM}\b`, "i");

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matches(value, pattern) {
  return pattern instanceof RegExp ? pattern.test(value) : new RegExp(pattern, "i").test(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function output(field, type = "string") {
  return { field, type };
}

function normalizeSelection(selection) {
  return (selection || []).map((item) => {
    if (typeof item === "object") return item;
    const [field, value] = String(item).split("=");
    if (field === "latest") return { field: "purchase_date", operator: "latest" };
    if (field === "status" && value) return { field: "status", operator: "eq", value };
    return { field, operator: "exists" };
  });
}

function selectionKey(item) {
  return JSON.stringify({ field: item.field, operator: item.operator, value: item.value ?? null });
}

function schemaOutputs(metadata = {}) {
  const evaluator = metadata.evaluator || metadata.eval?.find((item) => item.evaluator === "AgentResponseEvaluator") || metadata;
  const schema = evaluator.results_schema || evaluator.resultsSchema || evaluator.schema;
  if (!schema) return [];
  const root = schema.type === "array" ? schema.items : schema;
  const properties = root?.type === "object" ? root.properties || {} : {};
  return Object.entries(properties)
    .filter(([field]) => !["status", "task_type", "error_details"].includes(field))
    .map(([field, value]) => output(field, value?.type || "string"));
}

function inferOutputs(text, metadata) {
  const fromSchema = schemaOutputs(metadata);
  if (fromSchema.length) return fromSchema;
  const inferred = [];
  if (/\border\s*(?:number|id)|订单号|订单编号/i.test(text)) inferred.push(output("order_number"));
  if (matches(text, DEFAULT_VOCABULARY.status)) inferred.push(output("status"));
  if (matches(text, DEFAULT_VOCABULARY.grandTotal)) inferred.push(output("grand_total", "number"));
  if (matches(text, DEFAULT_VOCABULARY.itemSubtotal)) inferred.push(output("item_subtotal", "number"));
  if (/\b(?:purchase|order)\s+date|日期|购买日期/i.test(text)) inferred.push(output("purchase_date"));
  if (/\bhow many\b|数量|计数/i.test(text)) inferred.push(output("count", "number"));
  return inferred;
}

function parseDateEvidence(text) {
  const numeric = text.match(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  if (numeric) return numeric[0];
  const month = text.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/i);
  return month?.[0] || null;
}

export function parseTaskRequirements(intent, metadata = {}, options = {}) {
  const vocabulary = options.vocabulary || DEFAULT_VOCABULARY;
  const text = normalize(intent);
  const selectionText = text.replace(/\btoday is\b[^.?!]+[.?!]?/i, "");
  const entity = matches(text, vocabulary.checkout)
    ? "checkout"
    : matches(text, vocabulary.cart)
      ? "cart"
      : matches(text, vocabulary.order)
        ? "order"
    : matches(text, vocabulary.review)
      ? "review"
      : matches(text, vocabulary.account)
        ? "account"
      : matches(text, vocabulary.catalog)
        ? "catalog"
      : matches(text, vocabulary.product) || matches(text, vocabulary.priceRange)
        ? "product"
        : null;
  const operation = matches(text, vocabulary.mutate)
    ? "mutate"
    : matches(text, vocabulary.aggregate) || matches(text, vocabulary.priceRange)
      ? "aggregate"
      : matches(text, vocabulary.lookup)
        ? "lookup"
        : "read";
  const selection = [];
  const unknownRequirements = [];
  if (matches(text, vocabulary.latest)) selection.push({ field: "purchase_date", operator: "latest" });
  if (matches(text, vocabulary.status)) {
    const status = text.match(/\b(pending|processing|completed|complete|cancelled|canceled|refunded)\b/i)?.[1];
    const negated = status && new RegExp(`(?:not|excluding|without|except)\\s+(?:the\\s+)?${status}`, "i").test(text);
    selection.push(status
      ? { field: "status", operator: negated ? "neq" : "eq", value: status.toLowerCase() === "complete" ? "completed" : status.toLowerCase() }
      : { field: "status", operator: "exists" });
  }
  if (entity === "order" && operation === "aggregate" && /\bspent\b/i.test(text) && !selection.some((item) => item.field === "status")) {
    selection.push(
      { field: "status", operator: "neq", value: "canceled" },
      { field: "status", operator: "neq", value: "refunded" },
    );
  }
  const explicitDateRange = selectionText.match(EXPLICIT_DATE_RANGE)?.[0] || selectionText.match(CALENDAR_MONTH)?.[0] || null;
  if (!explicitDateRange && matches(selectionText, vocabulary.exactDate) && /\b(?:on|for|dated|date)\b/i.test(selectionText)) {
    const value = parseDateEvidence(selectionText);
    selection.push(value
      ? { field: "purchase_date", operator: "eq", value }
      : { field: "purchase_date", operator: "eq" });
    if (!value) unknownRequirements.push("purchase_date.value");
  }
  if (explicitDateRange || matches(selectionText, vocabulary.dateRange)) {
    const rangeEvidence = selectionText.match(/\b(?:past|last|between|from|before|after|since)\b[^,.!?]*(?:day|days|month|months|year|years|date)\b/i)?.[0] || "";
    const hasBound = Boolean(explicitDateRange) || RANGE_BOUND.test(rangeEvidence) || RANGE_BOUND_MONTH.test(rangeEvidence);
    selection.push({ field: "purchase_date", operator: "range", ...(hasBound ? {} : { value: null }) });
    if (!hasBound) unknownRequirements.push("purchase_date.range_bounds");
  }
  if (matches(text, vocabulary.explicitCategory)) selection.push({ field: "product_category", operator: "eq" });
  if (matches(text, vocabulary.leastExpensive)) selection.push({ field: "price", operator: "min" });
  if (matches(text, vocabulary.mostExpensive)) selection.push({ field: "price", operator: "max" });

  const outputs = inferOutputs(selectionText, metadata);
  if (matches(text, vocabulary.priceRange) && !outputs.length) {
    outputs.push(output("min", "number"), output("max", "number"));
  }
  const amountSemantics = matches(text, vocabulary.itemSubtotal)
    ? { field: "item_subtotal", excludes: ["shipping", "handling"] }
    : matches(text, vocabulary.grandTotal)
      ? { field: "grand_total", includes: ["shipping", "handling"] }
      : null;
  if (!entity) unknownRequirements.push("entity");
  if (selection.some((item) => item.operator === "eq" && item.value == null && item.field !== "product_category")) unknownRequirements.push("selection.value");
  const detailText = text.replace(/without (?:any )?additional details?/g, "");
  const requiresDetail = matches(detailText, vocabulary.detail) || (entity === "order" && (operation === "aggregate" || selection.length > 0));
  const executionDependencies = requiresDetail ? ["detail_url"] : [];
  return {
    entity,
    operation,
    selection,
    outputs,
    required_fields: outputs.map((item) => item.field),
    amount_semantics: amountSemantics,
    requires_detail: requiresDetail,
    execution_dependencies: executionDependencies,
    unknown_requirements: unique(unknownRequirements),
    confidence: [entity, operation, ...selection, ...outputs].filter(Boolean).length,
    parse_version: "capability-signature-v2",
  };
}

function normalizeOutputs(values) {
  return (values || []).map((item) => typeof item === "object" ? item : output(item));
}

function normalizeSignature(candidate) {
  const signature = candidate.signature || candidate;
  return {
    entity: signature.entity,
    operations: signature.operations || [],
    selection: normalizeSelection(signature.selection || signature.selectionOperators),
    outputs: normalizeOutputs(signature.outputs || signature.fields),
    executionDependencies: signature.executionDependencies || signature.execution_dependencies || [],
    requiresDetail: signature.requiresDetail === true,
  };
}

function covers(requirements, candidate) {
  const signature = normalizeSignature(candidate);
  if (signature.entity && signature.entity !== requirements.entity) return false;
  if (!signature.operations.includes(requirements.operation)) return false;
  const availableSelections = new Set(signature.selection.map(selectionKey));
  if (requirements.selection.some((item) => !availableSelections.has(selectionKey(item)) && !availableSelections.has(selectionKey({ ...item, value: undefined })))) return false;
  const availableOutputs = new Set(signature.outputs.map((item) => item.field));
  if (requirements.outputs.some((item) => !availableOutputs.has(item.field))) return false;
  if (requirements.requires_detail && !signature.requiresDetail) return false;
  if (requirements.execution_dependencies.some((item) => !signature.executionDependencies.includes(item))) return false;
  return true;
}

function extraCount(requirements, candidate) {
  const signature = normalizeSignature(candidate);
  const requiredSelections = new Set(requirements.selection.map(selectionKey));
  const requiredOutputs = new Set(requirements.outputs.map((item) => item.field));
  return signature.selection.filter((item) => !requiredSelections.has(selectionKey(item))).length +
    signature.outputs.filter((item) => !requiredOutputs.has(item.field)).length +
    signature.executionDependencies.filter((item) => !requirements.execution_dependencies.includes(item)).length;
}

export function routeByCapability(intentOrRequirements, router, options = {}) {
  const requirements = typeof intentOrRequirements === "string"
    ? parseTaskRequirements(intentOrRequirements, options.metadata || {}, options)
    : intentOrRequirements;
  if (!requirements || requirements.unknown_requirements?.length || !requirements.entity) {
    return { route: null, fallback: true, reason: requirements?.unknown_requirements?.length ? "unknown_requirements" : "entity_unresolved", requirements, candidates: [] };
  }
  const candidates = (router.capabilities || router.routes || [])
    .filter((candidate) => !candidate.fallback && covers(requirements, candidate));
  if (!candidates.length) return { route: null, fallback: true, reason: "unsupported_capability", requirements, candidates: [] };
  const ranked = candidates.map((candidate) => ({ candidate, extras: extraCount(requirements, candidate) }));
  const minimum = Math.min(...ranked.map((item) => item.extras));
  const minima = ranked.filter((item) => item.extras === minimum);
  if (minima.length !== 1) {
    return { route: null, fallback: true, reason: "capability_ambiguous", requirements, candidates: minima.map((item) => item.candidate.route) };
  }
  return { route: minima[0].candidate.route, fallback: false, reason: "minimal_sufficient_capability", requirements, candidates: [minima[0].candidate.route] };
}

export function auditCapabilityCoverage(tasks, router, options = {}) {
  const rows = tasks.map((task) => {
    const intent = task.intent || task.task || task.description || task.name || "";
    return {
      task_id: task.task_id ?? task.id ?? null,
      intent,
      ...routeByCapability(intent, router, { ...options, metadata: task }),
    };
  });
  const labeled = rows.filter((row, index) => tasks[index].expected_route);
  return {
    schema_version: 2,
    router_mode: router.routing_mode || "capability_signature_v2",
    task_count: rows.length,
    routed_count: rows.filter((row) => !row.fallback).length,
    abstention_count: rows.filter((row) => row.fallback).length,
    unsupported_field_rejection_count: rows.filter((row) => row.reason === "unsupported_capability" && row.requirements.outputs.length > 0).length,
    unknown_requirement_abstention_count: rows.filter((row) => row.reason === "unknown_requirements").length,
    route_precision: labeled.length ? labeled.filter((row, index) => row.route === tasks[index].expected_route).length / labeled.length : null,
    rows,
  };
}

export { DEFAULT_VOCABULARY };
