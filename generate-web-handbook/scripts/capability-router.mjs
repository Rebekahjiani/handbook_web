const DEFAULT_VOCABULARY = {
  order: /\b(?:order|orders|purchase|purchases|shipping|delivery|invoice)\b|订单|购买|配送|发票/i,
  product: /\b(?:product|products|item|items|model|models)\b|商品|产品|型号/i,
  review: /\b(?:review|reviews|reviewer|rating|stars?)\b|评论|评分/i,
  lookup: /\b(?:find|get|show|what is|which|retrieve|look up|查询|查找|读取)\b/i,
  aggregate: /\b(?:how many|total|amount|spent|sum|count|each month|每月|总额|金额|数量|合计)\b/i,
  mutate: /\b(?:create|add|edit|update|delete|remove|submit|send|post|publish|save|subscribe)\b|创建|编辑|删除|提交|发布|保存/i,
  latest: /\b(?:latest|most recent|recent|last|first)\b|最近|最新|上一笔/i,
  status: /\b(?:pending|processing|completed|complete|cancelled|canceled|refunded|status)\b|待处理|处理中|已完成|取消|退款|状态/i,
  exactDate: /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b|具体日期|某天/i,
  dateRange: /\b(?:past|last|between|from|before|after|since)\b.*\b(?:day|days|month|months|year|years|date)\b|时间范围|日期范围/i,
  explicitCategory: /\b(?:category|product type|item type|brand)\b|类别|分类|品类|品牌/i,
  grandTotal: /\b(?:grand total|including shipping|including handling|total paid|total amount)\b|含运费|含手续费|总支付/i,
  itemSubtotal: /\b(?:item subtotal|excluding shipping|excluding handling|before shipping)\b|不含运费|商品小计/i,
  detail: /\b(?:detail|details|line item|item row|product in the order)\b|详情|明细|商品行/i,
};

const RANGE_BOUND = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
const RANGE_BOUND_MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

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
  const entity = matches(text, vocabulary.order)
    ? "order"
    : matches(text, vocabulary.review)
      ? "review"
      : matches(text, vocabulary.product)
        ? "product"
        : null;
  const operation = matches(text, vocabulary.mutate)
    ? "mutate"
    : matches(text, vocabulary.aggregate)
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
  if (matches(selectionText, vocabulary.exactDate) && /\b(?:on|for|dated|date)\b/i.test(selectionText)) {
    const value = parseDateEvidence(selectionText);
    selection.push(value
      ? { field: "purchase_date", operator: "eq", value }
      : { field: "purchase_date", operator: "eq" });
    if (!value) unknownRequirements.push("purchase_date.value");
  }
  if (matches(selectionText, vocabulary.dateRange)) {
    const rangeEvidence = selectionText.match(/\b(?:past|last|between|from|before|after|since)\b[^,.!?]*(?:day|days|month|months|year|years|date)\b/i)?.[0] || "";
    const hasBound = RANGE_BOUND.test(rangeEvidence) || RANGE_BOUND_MONTH.test(rangeEvidence);
    selection.push({ field: "purchase_date", operator: "range", ...(hasBound ? {} : { value: null }) });
    if (!hasBound) unknownRequirements.push("purchase_date.range_bounds");
  }
  if (matches(text, vocabulary.explicitCategory)) selection.push({ field: "product_category", operator: "eq" });

  const outputs = inferOutputs(selectionText, metadata);
  const amountSemantics = matches(text, vocabulary.grandTotal)
    ? { field: "grand_total", includes: ["shipping", "handling"] }
    : matches(text, vocabulary.itemSubtotal)
      ? { field: "item_subtotal", excludes: ["shipping", "handling"] }
      : null;
  if (!entity) unknownRequirements.push("entity");
  if (selection.some((item) => item.operator === "eq" && item.value == null)) unknownRequirements.push("selection.value");
  const requiresDetail = matches(text, vocabulary.detail) || (entity === "order" && (operation === "aggregate" || selection.length > 0));
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
