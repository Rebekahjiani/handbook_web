import fs from "node:fs";
import path from "node:path";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walkFiles(root, predicate, out = []) {
  if (!fs.existsSync(root)) return out;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (predicate(root)) out.push(root);
    return out;
  }
  for (const name of fs.readdirSync(root)) {
    walkFiles(path.join(root, name), predicate, out);
  }
  return out;
}

function nearest(file, name) {
  let current = path.dirname(file);
  while (current && current !== path.dirname(current)) {
    const candidate = path.join(current, name);
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return null;
}

function manifestFinalUrl(harFile) {
  const manifestFile = nearest(harFile, "run_manifest.json");
  if (!manifestFile) return null;
  try {
    return readJson(manifestFile).browser?.final_url || null;
  } catch {
    return null;
  }
}

function expectedNetworkEvent(renderedTask) {
  return (renderedTask.eval || []).find(
    (item) => item.evaluator === "NetworkEventEvaluator",
  )?.expected || null;
}

function finalUrlFromArtifact(har) {
  const entries = har?.log?.entries || [];
  const documents = entries.filter((entry) => {
    const type = entry.response?.content?.mimeType || "";
    return String(entry.request?.method).toUpperCase() === "GET" &&
      (type.includes("text/html") || !type);
  });
  return documents.at(-1)?.request?.url || null;
}

function normalizeUrl(raw) {
  return String(raw || "")
    .replace(/__REDDIT__/g, "http://localhost:9999")
    .replace(/__SHOPPING__/g, "http://localhost:7770")
    .replace(/__SHOPPING_ADMIN__/g, "http://localhost:7780");
}

function urlCandidates(expected) {
  const values = expected?.url ?? [];
  return (Array.isArray(values) ? values : [values]).map(normalizeUrl);
}

function urlPatternMatches(url, pattern) {
  if (!pattern) return false;
  try {
    return new RegExp(pattern).test(new URL(url).pathname);
  } catch {
    return new RegExp(pattern).test(String(url || ""));
  }
}

function headerValue(headers, name) {
  const wanted = name.toLowerCase();
  const item = (headers || []).find(
    (header) => String(header.name || "").toLowerCase() === wanted,
  );
  return item?.value ?? null;
}

function responseJson(entry) {
  const text = entry?.response?.content?.text;
  if (!text) return { present: false, value: null };
  try {
    return { present: true, value: JSON.parse(text) };
  } catch {
    return { present: true, value: text };
  }
}

function requestBody(entry) {
  const body = entry?.request?.postData;
  if (!body) return { present: false, value: null };
  const text = body.text || body.params || body;
  if (typeof text === "object") return { present: true, value: text };
  try {
    return { present: true, value: JSON.parse(text) };
  } catch {
    return { present: true, value: String(text) };
  }
}

function readRawBody(traceDir, response) {
  if (!response?.bodyPath) return { present: false, error: null };
  const bodyFile = path.resolve(traceDir, response.bodyPath);
  if (!fs.existsSync(bodyFile)) return { present: false, error: "body_missing" };
  if (response.bodyError) return { present: false, error: "body_capture_error" };
  try {
    return { present: true, text: fs.readFileSync(bodyFile, "utf8"), error: null };
  } catch {
    return { present: false, error: "body_capture_error" };
  }
}

export function readNetworkJsonl(traceDir) {
  const file = path.join(traceDir, "network.jsonl");
  if (!fs.existsSync(file)) return { log: { entries: [] } };
  const events = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const requests = events.filter((event) => event.type === "request");
  const responses = events.filter((event) => event.type === "response");
  const usedResponses = new Set();
  const entries = requests.map((request) => {
    const candidates = responses
      .map((response, index) => ({ response, index }))
      .filter(({ response, index }) => !usedResponses.has(index) && response.url === request.url && response.timestamp >= request.timestamp)
      .sort((a, b) => a.response.timestamp - b.response.timestamp);
    const selected = candidates[0];
    if (selected) usedResponses.add(selected.index);
    const body = selected ? readRawBody(traceDir, selected.response) : { present: false, error: null };
    const entry = {
      request: {
        method: request.method || "GET",
        url: request.url,
        headers: Object.entries(request.headers || {}).map(([name, value]) => ({ name, value })),
      },
      response: selected ? { status: selected.response.status, content: body.present ? { text: body.text } : {} } : undefined,
      _evidence: {
        source: "network.jsonl",
        pairingUncertain: candidates.length > 1,
        responseBodyError: body.error,
      },
    };
    if (request.postData != null) entry.request.postData = request.postData;
    if (request.postDataRaw != null) entry.request.postData = { text: request.postDataRaw };
    return entry;
  });
  return { log: { entries } };
}

function evidenceVerdict(matches) {
  if (matches.some((item) => item.evidence?.pairingUncertain)) return "pairing_uncertain";
  if (matches.some((item) => item.reasons.includes("response_body_capture_error"))) return "body_capture_error";
  if (matches.some((item) => item.reasons.includes("response_body_missing") || item.reasons.includes("request_body_missing"))) return "body_missing";
  return null;
}

function deepSubset(actual, expected) {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (actual === null || typeof actual !== "object") return false;
  return Object.entries(expected).every(([key, value]) => deepSubset(actual[key], value));
}

function matchEntry(entry, expected) {
  const request = entry.request || {};
  const reasons = [];
  if (expected.http_method && String(request.method).toUpperCase() !== String(expected.http_method).toUpperCase()) {
    reasons.push("method_mismatch");
  }
  const expectedUrls = urlCandidates(expected);
  const pattern = expected.urlPattern || expected.endpointPattern;
  if (pattern) {
    if (!urlPatternMatches(normalizeUrl(request.url), pattern)) reasons.push("url_pattern_mismatch");
  } else if (expectedUrls.length && !expectedUrls.includes(normalizeUrl(request.url))) {
    reasons.push("url_mismatch");
  }
  for (const [name, value] of Object.entries(expected.headers || {})) {
    if (headerValue(request.headers, name) !== normalizeUrl(value)) reasons.push(`header_mismatch:${name}`);
  }
  if (expected.response_status != null && entry.response?.status !== expected.response_status) {
    reasons.push("status_mismatch");
  }
  const expectedBody = expected.response_content;
  if (expectedBody !== undefined) {
    const observed = responseJson(entry);
    if (!observed.present) reasons.push(entry._evidence?.responseBodyError === "body_capture_error" ? "response_body_capture_error" : "response_body_missing");
    else if (!deepSubset(observed.value, expectedBody)) reasons.push("response_content_mismatch");
  }
  const expectedRequestBody = expected.request_body || expected.post_data;
  if (expectedRequestBody !== undefined) {
    const observed = requestBody(entry);
    if (!observed.present) reasons.push("request_body_missing");
    else if (!deepSubset(observed.value, expectedRequestBody)) reasons.push("request_body_mismatch");
  }
  return { matched: reasons.length === 0, reasons };
}

export function replayNetworkEvent(har, expected) {
  if (!expected) return { verdict: "no_expected_event", candidates: 0, matches: [] };
  const entries = har?.log?.entries || [];
  const candidates = entries.filter((entry) =>
    WRITE_METHODS.has(String(entry.request?.method || "").toUpperCase()) ||
    String(entry.request?.method || "").toUpperCase() === String(expected.http_method || "GET").toUpperCase(),
  );
  const matches = candidates.map((entry) => ({
    method: entry.request?.method,
    url: entry.request?.url,
    status: entry.response?.status,
    ...matchEntry(entry, expected),
    evidence: entry._evidence || { source: "har" },
  }));
  if (matches.some((item) => item.matched)) {
    return { verdict: evidenceVerdict(matches) || "correct_target_event", candidates: candidates.length, matches };
  }
  const sameTarget = matches.some((item) =>
    (urlCandidates(expected).includes(normalizeUrl(item.url)) ||
      (expected.urlPattern || expected.endpointPattern) && urlPatternMatches(item.url, expected.urlPattern || expected.endpointPattern)) &&
    String(item.method).toUpperCase() === String(expected.http_method || "GET").toUpperCase(),
  );
  if (sameTarget && matches.some((item) =>
    item.reasons.some((reason) => reason.endsWith("_missing") || reason.endsWith("_capture_error")))) {
    return { verdict: evidenceVerdict(matches) || "target_event_evidence_incomplete", candidates: candidates.length, matches };
  }
  if (String(expected.http_method || "").toUpperCase() === "GET") {
    return { verdict: "target_identity_mismatch", candidates: candidates.length, matches };
  }
  return { verdict: "missing_or_mismatched_target_event", candidates: candidates.length, matches };
}

export function replayMutationContract(har, mutation) {
  if (!mutation) return { verdict: "no_expected_mutation" };
  const expected = {
    http_method: mutation.method,
    urlPattern: mutation.endpointPattern,
    response_content: mutation.responseContent,
    request_body: mutation.requestBody,
  };
  const result = replayNetworkEvent(har, expected);
  const matches = result.matches || [];
  if (mutation.direction === "subscribe" && matches.some((item) => /\/unsubscribe(?:\.json)?$/.test(item.url || "") && item.matched)) {
    return { ...result, verdict: "mutation_direction_mismatch" };
  }
  if (mutation.direction === "unsubscribe" && matches.some((item) => /\/subscribe(?:\.json)?$/.test(item.url || "") && item.matched)) {
    return { ...result, verdict: "mutation_direction_mismatch" };
  }
  return { ...result, semanticTarget: mutation.semanticTarget, direction: mutation.direction };
}

export function replayIdentity(finalUrl, expectedUrls) {
  const urls = (Array.isArray(expectedUrls) ? expectedUrls : [expectedUrls])
    .filter(Boolean)
    .map(normalizeUrl);
  if (!urls.length) return { verdict: "identity_not_specified", finalUrl };
  return urls.includes(normalizeUrl(finalUrl))
    ? { verdict: "target_identity_match", finalUrl }
    : { verdict: "target_identity_mismatch", finalUrl, expectedUrls: urls };
}

function replayDirectory(root) {
  const evidenceFiles = walkFiles(root, (file) => ["network.har", "network.jsonl"].includes(path.basename(file)));
  return evidenceFiles.map((evidenceFile) => {
    const taskFile = nearest(evidenceFile, "task.rendered.json");
    const evalFile = nearest(evidenceFile, "eval_result.json");
    const rendered = taskFile ? readJson(taskFile) : {};
    const isJsonl = path.basename(evidenceFile) === "network.jsonl";
    const har = isJsonl ? readNetworkJsonl(path.dirname(evidenceFile)) : readJson(evidenceFile);
    const expected = expectedNetworkEvent(rendered);
    const replay = replayNetworkEvent(har, expected);
    const observedFinalUrl = manifestFinalUrl(evidenceFile) || finalUrlFromArtifact(har);
    const identity = (expected && (!expected.http_method || expected.http_method.toUpperCase() === "GET"))
      ? replayIdentity(observedFinalUrl, expected.url)
      : null;
    const verdict = identity?.verdict === "target_identity_mismatch"
      ? "target_identity_mismatch"
      : replay.verdict;
    return {
      task_id: rendered.task_id || path.basename(path.dirname(evidenceFile)),
      evidence: evidenceFile,
      evidence_format: isJsonl ? "network.jsonl+rawbody" : "har",
      eval_status: evalFile ? readJson(evalFile).status : "missing",
      expected: expected ? { method: expected.http_method, url: expected.url } : null,
      observed_final_url: observedFinalUrl,
      ...replay,
      verdict,
      identity_verdict: identity?.verdict || null,
      semantic_contract: null,
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const roots = process.argv.slice(2);
  if (!roots.length) throw new Error("usage: node scripts/offline-contract-replay.mjs <artifact-root> [...]");
  const rows = roots.flatMap(replayDirectory);
  console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
}
