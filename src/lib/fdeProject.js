/**
 * fdeProject.js
 *
 * Deterministic project-control helpers inspired by the Awesome FDE Roadmap:
 * mission-first discovery, the Delta between product and field reality,
 * measurable evaluation, a weekly executive summary, and Day-2 ownership.
 *
 * This module deliberately does not call an LLM. It validates the operating
 * contract before the probabilistic Decisions gates are run.
 */

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const VALID_STATUSES = new Set([
  "planned",
  "in_progress",
  "complete",
  "passed",
  "pending",
  "open",
  "blocked",
  "mitigated",
  "accepted",
  "identified",
  "discovered",
]);

const REQUIRED_ARRAYS = [
  "stakeholders",
  "discovery_checklist",
  "delta",
  "workstreams",
  "success_metrics",
  "delivery_gates",
  "risks",
  "next_actions",
  "artifacts",
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateIdList(items, label, errors) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!isObject(item)) {
      errors.push(`${label}[${index}] must be an object`);
      continue;
    }
    if (!nonEmpty(item.id)) errors.push(`${label}[${index}].id is required`);
    if (item.id && seen.has(item.id)) errors.push(`${label} contains duplicate id "${item.id}"`);
    if (item.id) seen.add(item.id);
    if (item.status && !VALID_STATUSES.has(item.status)) {
      errors.push(`${label}[${index}].status "${item.status}" is not a supported FDE status`);
    }
  }
}

/**
 * Validate the project mission brief without making assumptions about a
 * particular cloud provider or LLM vendor.
 */
export function validateFdeMissionBrief(brief, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(brief)) return { ok: false, errors: ["mission brief must be a JSON object"], warnings };
  if (brief.schema_version !== 1) errors.push("schema_version must be 1");
  for (const key of ["project_id", "source_roadmap", "operating_model", "mission", "current_stage", "primary_game"]) {
    if (!nonEmpty(brief[key])) errors.push(`${key} is required`);
  }
  if (!/^https:\/\/github\.com\//.test(String(brief.source_roadmap || ""))) {
    errors.push("source_roadmap must be a GitHub URL");
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(brief[key]) || brief[key].length === 0) errors.push(`${key} must be a non-empty array`);
  }

  if (Array.isArray(brief.stakeholders)) {
    validateIdList(brief.stakeholders, "stakeholders", errors);
    for (const [index, stakeholder] of brief.stakeholders.entries()) {
      for (const key of ["role", "outcome", "evidence_of_value"]) {
        if (!nonEmpty(stakeholder?.[key])) errors.push(`stakeholders[${index}].${key} is required`);
      }
    }
  }
  if (Array.isArray(brief.discovery_checklist)) validateIdList(brief.discovery_checklist, "discovery_checklist", errors);
  if (Array.isArray(brief.delta)) {
    validateIdList(brief.delta, "delta", errors);
    for (const [index, item] of brief.delta.entries()) {
      for (const key of ["product_capability", "field_gap", "proposed_glue"]) {
        if (!nonEmpty(item?.[key])) errors.push(`delta[${index}].${key} is required`);
      }
    }
  }
  if (Array.isArray(brief.workstreams)) validateIdList(brief.workstreams, "workstreams", errors);
  if (Array.isArray(brief.success_metrics)) {
    validateIdList(brief.success_metrics, "success_metrics", errors);
    for (const [index, metric] of brief.success_metrics.entries()) {
      for (const key of ["definition", "target", "owner", "evidence"]) {
        if (!nonEmpty(metric?.[key])) errors.push(`success_metrics[${index}].${key} is required`);
      }
    }
  }
  if (Array.isArray(brief.delivery_gates)) validateIdList(brief.delivery_gates, "delivery_gates", errors);
  if (Array.isArray(brief.risks)) validateIdList(brief.risks, "risks", errors);
  if (Array.isArray(brief.next_actions)) {
    validateIdList(brief.next_actions, "next_actions", errors);
    for (const [index, action] of brief.next_actions.entries()) {
      for (const key of ["title", "owner", "priority"]) {
        if (!nonEmpty(action?.[key])) errors.push(`next_actions[${index}].${key} is required`);
      }
    }
  }
  if (Array.isArray(brief.artifacts)) {
    validateIdList(brief.artifacts, "artifacts", errors);
    for (const [index, artifact] of brief.artifacts.entries()) {
      if (!nonEmpty(artifact?.path)) {
        errors.push(`artifacts[${index}].path is required`);
        continue;
      }
      if (options.rootDir) {
        const artifactPath = isAbsolute(artifact.path)
          ? artifact.path
          : join(options.rootDir, artifact.path);
        if (!existsSync(artifactPath)) {
          errors.push(`artifacts[${index}].path "${artifact.path}" does not exist`);
        }
      }
    }
  }

  const blocked = (brief.risks || []).filter((risk) => risk.status === "blocked");
  const open = (brief.risks || []).filter((risk) => ["open", "blocked"].includes(risk.status));
  if (blocked.length > 0) warnings.push(`${blocked.length} FDE risk(s) are blocked and need explicit ownership`);
  if (open.length > 2) warnings.push(`${open.length} FDE risks are open; narrow the next field mission before adding scope`);
  if (brief.three_whys && !isObject(brief.three_whys)) errors.push("three_whys must be an object when present");
  for (const key of ["system_of_record", "cost_of_inaction", "day_2_owner"]) {
    if (brief.three_whys && !nonEmpty(brief.three_whys[key])) errors.push(`three_whys.${key} is required`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Produce a compact control-plane view suitable for CLI, REST and the
 * Decisions Studio. A pending UAT gate is intentionally not represented as a
 * fake launch approval: the current Game9K state is pilot-ready until a real
 * creator validates it.
 */
export function summarizeFdeMission(brief) {
  const gates = brief.delivery_gates || [];
  const risks = brief.risks || [];
  const workstreams = brief.workstreams || [];
  const passedGates = gates.filter((gate) => ["passed", "complete", "accepted"].includes(gate.status));
  const pendingGates = gates.filter((gate) => ["pending", "planned", "in_progress"].includes(gate.status));
  const blockers = risks.filter((risk) => risk.status === "blocked");
  const openRisks = risks.filter((risk) => ["open", "blocked"].includes(risk.status));
  const status = blockers.length > 0 ? "ACTION_REQUIRED" : pendingGates.length > 0 ? "PILOT_READY" : "OPERATING";
  const readiness = gates.length ? Number((passedGates.length / gates.length).toFixed(3)) : 0;

  return {
    projectId: brief.project_id,
    mission: brief.mission,
    operatingModel: brief.operating_model,
    sourceRoadmap: brief.source_roadmap,
    currentStage: brief.current_stage,
    primaryGame: brief.primary_game,
    status,
    readiness,
    gateSummary: {
      passed: passedGates.length,
      pending: pendingGates.length,
      total: gates.length,
    },
    workstreamSummary: workstreams.map(({ id, phase, owner, status: workstreamStatus }) => ({
      id,
      phase,
      owner,
      status: workstreamStatus,
    })),
    blockers: blockers.map(({ id, title, owner, mitigation }) => ({ id, title, owner, mitigation })),
    openRisks: openRisks.map(({ id, title, severity, owner, mitigation }) => ({ id, title, severity, owner, mitigation })),
    nextActions: (brief.next_actions || []).slice(0, 8),
    successMetrics: brief.success_metrics || [],
  };
}
