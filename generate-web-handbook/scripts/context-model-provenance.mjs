import crypto from "node:crypto";
import fs from "node:fs";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function sha256Value(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(stable(value)));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(file) {
  const updateFile = (hash, target) => {
    const descriptor = fs.openSync(target, "r");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
      let bytesRead;
      do {
        bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
      } while (bytesRead);
    } finally {
      fs.closeSync(descriptor);
    }
  };
  if (fs.statSync(file).isFile()) {
    const hash = crypto.createHash("sha256");
    updateFile(hash, file);
    return hash.digest("hex");
  }
  const files = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const full = `${directory}/${name}`;
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.push([full.slice(file.length + 1), full]);
    }
  };
  walk(file);
  const hash = crypto.createHash("sha256");
  for (const [relative, full] of files) {
    hash.update(`${Buffer.byteLength(relative)}:${relative}:`);
    updateFile(hash, full);
  }
  return hash.digest("hex");
}

function artifact(path, sha256) {
  return { path, sha256 };
}

function stageOutput(stage, value) {
  if (typeof value === "string" && fs.existsSync(value)) return artifact(value, sha256File(value));
  return artifact(`${stage}.json`, sha256Value(value));
}

export function buildContextModelProvenance({ stages = {}, convergence = null, humanJudgments = [], commands = {}, codeHashes = {}, exitCodes = {} } = {}) {
  const order = ["raw_evidence", "reviewed_evidence", "platform_core", "business_core", "capability_binding", "validation", "freeze"];
  const records = [];
  let previousStageOutputSha256 = null;
  for (const stage of order) {
    if (stages[stage] === undefined) continue;
    const value = stages[stage];
    const source = typeof value === "string" && fs.existsSync(value) ? artifact(value, sha256File(value)) : null;
    const output = stageOutput(stage, value);
    const command = commands[stage] || null;
    records.push({
      stage,
      inputArtifacts: source ? [source] : [],
      outputArtifacts: [output],
      command: Array.isArray(command) ? command : command ? [command] : [],
      codeSha256: codeHashes[stage] || (command ? sha256Value(command) : null),
      exitCode: exitCodes[stage] ?? 0,
      humanJudgments: humanJudgments.filter((item) => item.stage === stage || item.item === stage),
      previousStageOutputSha256,
    });
    previousStageOutputSha256 = output.sha256;
  }
  const deterministic = records.every((record) => record.exitCode === 0 && record.outputArtifacts.every((item) => item.sha256));
  return {
    schemaVersion: 2,
    pipeline: order,
    records,
    convergence,
    humanJudgments,
    commands,
    deterministic,
    status: !convergence?.converged || !deterministic ? "evidence_incomplete" : "ready_to_freeze",
  };
}

export function provenanceForContextRoot(root, options = {}) {
  const stagePath = (relative) => `${root}/${relative}`;
  const stages = {
    raw_evidence: options.rawEvidencePath || undefined,
    reviewed_evidence: options.reviewedEvidencePath || (fs.existsSync(stagePath("platform-core/reviewed")) ? stagePath("platform-core/reviewed") : undefined),
    platform_core: fs.existsSync(stagePath("platform-core")) ? stagePath("platform-core") : undefined,
    business_core: fs.existsSync(stagePath("business-core")) ? stagePath("business-core") : undefined,
    capability_binding: fs.existsSync(stagePath("context-model/capability-bindings.json")) ? stagePath("context-model/capability-bindings.json") : undefined,
    validation: fs.existsSync(stagePath("context-model/validation-report.json")) ? stagePath("context-model/validation-report.json") : undefined,
    freeze: fs.existsSync(stagePath("context-model/context-model.freeze.json")) ? stagePath("context-model/context-model.freeze.json") : undefined,
  };
  return buildContextModelProvenance({
    stages,
    convergence: options.convergence || null,
    humanJudgments: options.humanJudgments || [],
    commands: options.commands || {},
    codeHashes: options.codeHashes || {},
    exitCodes: options.exitCodes || {},
  });
}

export function evaluateExplorationConvergence(rounds = [], { stableRounds = 3, capabilityEvidenceClosed = false, unresolvedItems = [] } = {}) {
  const tail = rounds.slice(-stableRounds);
  const stable = tail.length === stableRounds && tail.every((round) => Number(round.newSurfaces || 0) === 0 && Number(round.newActions || 0) === 0 && Number(round.newSchemas || 0) === 0 && Number(round.newCapabilities || 0) === 0);
  return {
    stableRounds,
    observedRounds: rounds.length,
    converged: stable && capabilityEvidenceClosed,
    surfaceStable: stable,
    capabilityEvidenceClosed,
    unresolvedItems: [...unresolvedItems],
    stopReason: stable && capabilityEvidenceClosed ? "structure_stable_and_capability_evidence_closed" : "evidence_incomplete",
  };
}
