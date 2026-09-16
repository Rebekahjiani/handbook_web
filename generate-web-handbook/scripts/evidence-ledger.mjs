function cents(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "").replace(/[^0-9,.-]/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

function sameValue(actual, expected) {
  return expected == null || String(actual ?? "").trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function recordId(order) {
  return order.recordId || order.orderNumber || order.detailUrl || null;
}

function invariantStatus(ledger) {
  const all = new Set(ledger.allRecordIds);
  const accepted = new Set(ledger.acceptedRecords.map((record) => record.recordId));
  const rejected = new Set(ledger.rejectedRecords.map((record) => record.recordId));
  return {
    partitionComplete: [...all].every((id) => accepted.has(id) || rejected.has(id)),
    partitionDisjoint: [...accepted].every((id) => !rejected.has(id)),
    knownRecordIds: [...accepted, ...rejected].every((id) => all.has(id)),
    visitedPagesPresent: ledger.visitedPages.length > 0,
  };
}

export function createOrderEvidenceLedger() {
  return {
    schemaVersion: 2,
    visitedPages: [],
    observations: [],
    allRecordIds: [],
    records: {},
    acceptedRecords: [],
    rejectedRecords: [],
    selectedDetailRows: [],
    amountField: null,
    aggregationFormula: null,
    resultCents: null,
    result: null,
    invariants: null,
    evidenceStatus: "evidence_incomplete",
  };
}

export function appendOrderObservation(ledger, observation = {}) {
  if (!ledger || ledger.schemaVersion !== 2) throw new Error("ledger_missing_or_unknown_schema");
  const page = {
    actionId: observation.actionId || "read_order_history_page_v1",
    runId: observation.runId || null,
    pageId: observation.pageId || null,
    itemCount: observation.orders?.length || 0,
    totalText: observation.totalText || "",
    nextHref: observation.nextHref || null,
  };
  ledger.visitedPages.push(page);
  ledger.observations.push({ ...observation, provenance: { actionId: page.actionId, runId: page.runId, pageId: page.pageId } });
  for (const order of observation.orders || []) {
    const id = recordId(order);
    if (!id) continue;
    if (!ledger.allRecordIds.includes(id)) ledger.allRecordIds.push(id);
    ledger.records[id] = {
      ...ledger.records[id],
      ...order,
      recordId: id,
      provenance: { actionId: page.actionId, runId: page.runId, pageId: page.pageId },
    };
  }
  ledger.invariants = invariantStatus(ledger);
  return ledger;
}

export function applyTypedFilters(ledger, filters = {}) {
  if (!ledger || ledger.schemaVersion !== 2) throw new Error("ledger_missing_or_unknown_schema");
  const acceptedRecords = [];
  const rejectedRecords = [];
  for (const id of ledger.allRecordIds) {
    const record = ledger.records[id];
    const reasons = [];
    if (filters.status?.operator === "eq" && !sameValue(record.status, filters.status.value)) reasons.push("status_mismatch");
    if (filters.status?.operator === "neq" && sameValue(record.status, filters.status.value)) reasons.push("status_mismatch");
    if (filters.purchase_date?.operator === "eq" && !sameValue(record.purchaseDate, filters.purchase_date.value)) reasons.push("purchase_date_mismatch");
    if (filters.product_category?.operator === "eq" && !sameValue(record.category || record.productCategory, filters.product_category.value)) reasons.push("product_category_mismatch");
    const entry = { recordId: id, reasons, provenance: record.provenance };
    (reasons.length ? rejectedRecords : acceptedRecords).push(entry);
  }
  ledger.acceptedRecords = acceptedRecords;
  ledger.rejectedRecords = rejectedRecords;
  ledger.invariants = invariantStatus(ledger);
  ledger.evidenceStatus = ledger.invariants.partitionComplete && ledger.invariants.partitionDisjoint ? "verified" : "evidence_incomplete";
  return ledger;
}

export function selectDetailRows(ledger, rows = [], amountField) {
  if (!ledger || ledger.schemaVersion !== 2) throw new Error("ledger_missing_or_unknown_schema");
  const accepted = new Set(ledger.acceptedRecords.map((record) => record.recordId));
  ledger.selectedDetailRows = rows
    .filter((row) => accepted.has(row.orderRecordId || row.recordId))
    .map((row) => ({
      ...row,
      recordId: row.recordId || `${row.orderRecordId}:${row.itemId || row.index || 0}`,
      amountCents: cents(row[amountField]),
      provenance: row.provenance || ledger.records[row.orderRecordId || row.recordId]?.provenance || null,
    }));
  ledger.amountField = amountField || null;
  ledger.invariants = invariantStatus(ledger);
  return ledger;
}

export function aggregateTyped(ledger, ast) {
  if (!ledger || ledger.schemaVersion !== 2) throw new Error("ledger_missing_or_unknown_schema");
  if (!ast || ast.op !== "sum" || ast.rows !== "selectedDetailRows" || ast.field !== ledger.amountField) {
    throw new Error("aggregation_ast_invalid");
  }
  const totalCents = ledger.selectedDetailRows.reduce((sum, row) => {
    const value = row.amountCents ?? cents(row[ast.field]);
    if (!Number.isInteger(value)) throw new Error(`aggregation_amount_missing:${row.recordId}`);
    return sum + value;
  }, 0);
  ledger.aggregationFormula = ast;
  ledger.resultCents = totalCents;
  ledger.result = totalCents / 100;
  return ledger;
}

export function verifyLedgerInvariants(ledger) {
  const status = invariantStatus(ledger);
  const reportedTotal = ledger.visitedPages.at(-1)?.totalText?.match(/\b(\d+)\b/)?.[1];
  const finalPage = ledger.visitedPages.at(-1);
  const paginationClosed = finalPage?.nextHref == null && (!reportedTotal || Number(reportedTotal) === ledger.allRecordIds.length);
  const selectedRowsHaveProvenance = ledger.selectedDetailRows.every((row) => row.provenance?.pageId && row.provenance?.actionId);
  const aggregationAstValid = Boolean(ledger.aggregationFormula?.op === "sum" && ledger.aggregationFormula?.rows === "selectedDetailRows");
  return {
    ...status,
    paginationClosed,
    selectedRowsHaveProvenance,
    aggregationAstValid,
    passed: Object.values(status).every(Boolean)
      && paginationClosed
      && selectedRowsHaveProvenance
      && aggregationAstValid,
  };
}

export function verifyAnswerEvidence({ answer, evidenceRecordIds = [], filters = {}, amountField, ledger } = {}) {
  const failures = [];
  if (!ledger || ledger.schemaVersion !== 2) failures.push("ledger_missing_or_unknown_schema");
  const invariant = ledger ? verifyLedgerInvariants(ledger) : null;
  if (invariant && !invariant.passed) failures.push("ledger_invariant_failed");
  if (!Array.isArray(evidenceRecordIds) || evidenceRecordIds.length === 0) failures.push("evidence_record_ids_missing");
  if (!amountField) failures.push("amount_field_missing");
  const rows = Array.isArray(ledger?.selectedDetailRows) ? ledger.selectedDetailRows : [];
  const selected = rows.filter((row) => evidenceRecordIds.includes(row.recordId));
  if (selected.length !== evidenceRecordIds.length) failures.push("evidence_record_id_not_in_selected_rows");
  for (const row of selected) {
    if (!sameValue(row.date || row.purchaseDate, filters.exact_date)) failures.push(`filter_exact_date_mismatch:${row.recordId}`);
    if (!sameValue(row.category || row.productCategory, filters.category)) failures.push(`filter_category_mismatch:${row.recordId}`);
    if (!Number.isInteger(row.amountCents ?? cents(row[amountField]))) failures.push(`amount_missing:${row.recordId}`);
  }
  const calculatedCents = selected.reduce((sum, row) => sum + ((row.amountCents ?? cents(row[amountField])) || 0), 0);
  const claimedCents = cents(answer);
  if (!Number.isInteger(claimedCents)) failures.push("answer_not_numeric");
  if (Number.isInteger(claimedCents) && calculatedCents !== claimedCents) failures.push("answer_not_reproducible");
  if (ledger && ledger.amountField && ledger.amountField !== amountField) failures.push("ledger_amount_field_mismatch");
  return {
    ok: failures.length === 0,
    verdict: failures.length ? "evidence_incomplete_or_mismatch" : "verified",
    failures,
    calculated: calculatedCents / 100,
    claimed: Number.isInteger(claimedCents) ? claimedCents / 100 : null,
    evidenceRecordIds,
    amountField: amountField || null,
    invariant,
  };
}
