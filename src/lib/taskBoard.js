/**
 * taskBoard.js
 *
 * Deterministic aggregator that turns the FDE operating artifacts (mission
 * brief, ADRs, delivery gates) and live GitHub issues/PRs into one task board
 * for the investor-facing Tasks portal.
 *
 * Same philosophy as fdeProject.js: no LLM, no hidden state. Everything the
 * board shows can be traced back to a file in the repository or to a GitHub
 * API response that the caller passed in.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildAdrRegistry, parseAdrDocument } from "./adrRegistry.js";

export const TASK_STATUSES = ["blocked", "in_progress", "open", "done"];
export const PRIORITY_ORDER = ["P0", "P1", "P2", "P3"];

const STATUS_ALIASES = {
  pending: "open",
  planned: "open",
  identified: "open",
  open: "open",
  in_progress: "in_progress",
  "in-progress": "in_progress",
  blocked: "blocked",
  complete: "done",
  completed: "done",
  passed: "done",
  accepted: "done",
  mitigated: "done",
  closed: "done",
  done: "done",
};

const SOURCE_LABELS = {
  "fde-action": "FDE Next Action",
  "fde-risk": "FDE Risk",
  adr: "ADR Follow-up",
  "github-issue": "GitHub Issue",
  "github-pr": "GitHub Pull Request",
};

export function normalizeStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  return STATUS_ALIASES[key] || "open";
}

export function normalizePriority(priority) {
  const raw = String(priority || "").trim().toUpperCase();
  if (PRIORITY_ORDER.includes(raw)) return raw;
  if (/^0$/.test(raw)) return "P0";
  return "P2";
}

function statusRank(status) {
  const index = TASK_STATUSES.indexOf(status);
  return index === -1 ? TASK_STATUSES.length : index;
}

function priorityRank(priority) {
  const index = PRIORITY_ORDER.indexOf(priority);
  return index === -1 ? PRIORITY_ORDER.length : index;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Parse a single ADR markdown file. Tolerant by design: a malformed ADR must
 * never break the investor board, it only loses the fields it could not parse.
 */
/**
 * Board projection of a single ADR document. Delegates to the governance
 * registry so the portal, the CLI and the validator can never disagree about
 * status, supersession or follow-ups.
 */
export function parseAdr({ path, content, id: idOverride }) {
  const adr = parseAdrDocument({ path, content, id: idOverride });
  return {
    id: adr.id,
    title: adr.title,
    status: adr.statusLabel,
    statusKey: adr.status === "accepted" ? "done" : adr.status === "proposed" ? "open" : adr.status,
    date: adr.date,
    deciders: adr.deciders,
    consulted: adr.consulted,
    path: adr.path,
    isOpen: adr.isOpen,
    followUps: adr.followUps,
    supersedes: adr.supersedes,
    supersededBy: adr.supersededBy,
    asrTriggers: adr.asrTriggers,
  };
}

/**
 * Read every ADR through the governance registry (MADR v4 + hve-core overlay),
 * then project it onto the task-board shape. Invalid ADRs are still returned —
 * the board must show them, and `buildAdrRegistry` reports the findings.
 */
export function loadAdrs(rootDir) {
  const registry = buildAdrRegistry({ rootDir, adrDir: join(rootDir, "project/fde/adr") });
  return registry.adrs.map((adr) => ({
    id: adr.id,
    title: adr.title,
    status: adr.statusLabel,
    statusKey: adr.status === "accepted" ? "done" : adr.status === "proposed" ? "open" : adr.status,
    rawStatus: adr.status,
    type: adr.type,
    date: adr.date,
    deciders: adr.deciders,
    consulted: adr.consulted,
    path: adr.path,
    followUps: adr.followUps,
    supersedes: adr.supersedes,
    supersededBy: adr.supersededBy,
    asrTriggers: adr.asrTriggers,
    findings: registry.findings.filter((finding) => finding.adrId === adr.id),
    isOpen: adr.isOpen,
  }));
}

/**
 * Convert GitHub issues and pull requests into board tasks. Pull requests are
 * filtered out of the issue list by GitHub's own `pull_request` marker.
 */
export function normalizeGithubItems(items, { repo } = {}) {
  const tasks = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const isPr = Boolean(item.pull_request) || item.__type === "pr";
    const labels = (item.labels || []).map((label) =>
      typeof label === "string" ? label : label?.name || ""
    );
    const priorityLabel = labels.find((label) => /^p[0-3]$/i.test(label));
    const blocked = labels.some((label) => /blocked|blocker|hold/i.test(label));
    const status = item.state === "closed" ? "done" : blocked ? "blocked" : "open";
    const assignees = (item.assignees || []).map((a) => (typeof a === "string" ? a : a?.login)).filter(Boolean);
    const user = item.user?.login;

    tasks.push({
      id: `${isPr ? "PR" : "GH"}-${item.number}`,
      title: String(item.title || "(untitled)").trim(),
      description: String(item.body || "").trim().slice(0, 400),
      source: isPr ? "github-pr" : "github-issue",
      sourceLabel: SOURCE_LABELS[isPr ? "github-pr" : "github-issue"],
      owner: assignees[0] || user || "Unassigned",
      owners: assignees.length ? assignees : user ? [user] : [],
      priority: normalizePriority(priorityLabel),
      status,
      due: null,
      definitionOfDone: null,
      evidence: null,
      tags: labels.filter(Boolean).slice(0, 6),
      url: item.html_url || (repo ? `https://github.com/${repo}/issues/${item.number}` : null),
      updatedAt: item.updated_at || null,
      isGithub: true,
    });
  }
  return tasks;
}

function briefTasks(brief) {
  const tasks = [];

  for (const action of brief?.next_actions || []) {
    tasks.push({
      id: action.id,
      title: action.title,
      description: action.definition_of_done || null,
      source: "fde-action",
      sourceLabel: SOURCE_LABELS["fde-action"],
      owner: action.owner || "Unassigned",
      owners: action.owner ? [action.owner] : [],
      priority: normalizePriority(action.priority),
      status: normalizeStatus(action.status),
      due: action.due || null,
      definitionOfDone: action.definition_of_done || null,
      evidence: action.evidence || null,
      tags: ["fde", "next-action"],
      url: "project/fde/mission-brief.json",
      updatedAt: null,
    });
  }

  for (const risk of brief?.risks || []) {
    const status = normalizeStatus(risk.status);
    if (status === "done") continue;
    tasks.push({
      id: `RISK-${risk.id}`,
      title: risk.title,
      description: risk.mitigation || null,
      source: "fde-risk",
      sourceLabel: SOURCE_LABELS["fde-risk"],
      owner: risk.owner || "Unassigned",
      owners: risk.owner ? [risk.owner] : [],
      priority: risk.severity === "high" ? "P0" : risk.severity === "medium" ? "P1" : "P2",
      status,
      due: null,
      definitionOfDone: risk.mitigation || null,
      evidence: null,
      tags: ["risk", risk.severity ? `severity:${risk.severity}` : null].filter(Boolean),
      url: "project/fde/mission-brief.json",
      updatedAt: null,
    });
  }

  return tasks;
}

function attachAdrFollowUps(tasks, adrs) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const adr of adrs) {
    // Follow-ups stay actionable even when the ADR itself is already Accepted:
    // the decision is settled, the work it unlocked is not.
    adr.followUps.forEach((followUp, index) => {
      const syntheticId = `${adr.id}-FU${index + 1}`;
      const id = followUp.id || syntheticId;
      const existing = byId.get(id) || byId.get(syntheticId);
      if (existing) {
        existing.tags = Array.from(new Set([...(existing.tags || []), "adr", adr.id]));
        existing.links = Array.from(new Set([...(existing.links || []), adr.path]));
        existing.adrId = adr.id;
        return;
      }
      const titleMatch = tasks.find(
        (task) =>
          String(task.title).trim().toLowerCase() === String(followUp.title).trim().toLowerCase()
      );
      if (titleMatch) {
        titleMatch.tags = Array.from(new Set([...(titleMatch.tags || []), "adr", adr.id]));
        titleMatch.links = Array.from(new Set([...(titleMatch.links || []), adr.path]));
        titleMatch.adrId = adr.id;
        return;
      }
      const task = {
        id,
        title: followUp.title,
        description: `Follow-up from ${adr.id}: ${adr.title}`,
        source: "adr",
        sourceLabel: SOURCE_LABELS.adr,
        owner: adr.deciders[0] || "Unassigned",
        owners: adr.deciders,
        priority: "P1",
        status: "open",
        due: null,
        definitionOfDone: null,
        evidence: null,
        tags: ["adr", adr.id],
        links: [adr.path],
        adrId: adr.id,
        url: adr.path,
        updatedAt: null,
      };
      tasks.push(task);
      byId.set(id, task);
    });
  }
  return tasks;
}

function uniqueById(tasks) {
  const seen = new Map();
  for (const task of tasks) {
    if (!seen.has(task.id)) seen.set(task.id, task);
  }
  return Array.from(seen.values());
}

/**
 * Build the full board snapshot. `github` is an optional pre-fetched payload
 * `{ items, error, repo, fetchedAt }` — the lib never performs I/O itself, so
 * tests and CI stay deterministic.
 */
export function buildTaskBoard({ brief, adrs = [], github = null, generatedAt = null } = {}) {
  const tasks = uniqueById([
    ...briefTasks(brief),
    ...(github?.items ? normalizeGithubItems(github.items, { repo: github.repo }) : []),
  ]);

  const linked = attachAdrFollowUps(tasks, adrs);

  // `github: null` means the caller deliberately excluded GitHub, so GitHub-owned
  // items disappear; FDE/ADR tasks that merely reference an issue stay.
  const board = linked.filter((task) => !(github === null && task.isGithub));
  return buildSnapshot({ brief, adrs, github, generatedAt, tasks: board });
}

function buildSnapshot({ brief, adrs, github, generatedAt, tasks }) {
  const sorted = [...tasks].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      priorityRank(a.priority) - priorityRank(b.priority) ||
      String(a.id).localeCompare(String(b.id))
  );

  const counts = { open: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of sorted) counts[task.status] = (counts[task.status] || 0) + 1;

  const total = sorted.length;
  const active = total - counts.done;
  const completionPct = total === 0 ? 0 : Math.round((counts.done / total) * 100);

  const owners = new Map();
  for (const task of sorted) {
    const name = task.owner || "Unassigned";
    if (!owners.has(name)) {
      owners.set(name, { name, total: 0, open: 0, in_progress: 0, blocked: 0, done: 0 });
    }
    const entry = owners.get(name);
    entry.total += 1;
    entry[task.status] += 1;
  }

  const gates = (brief?.delivery_gates || []).map((gate) => ({
    id: gate.id,
    stage: gate.stage,
    status: normalizeStatus(gate.status),
    exitCriteria: gate.exit_criteria || null,
  }));

  const metrics = (brief?.success_metrics || []).map((metric) => ({
    id: metric.id,
    definition: metric.definition,
    target: metric.target,
    owner: metric.owner,
    status: normalizeStatus(metric.status),
  }));

  return {
    schemaVersion: 1,
    projectId: brief?.project_id || null,
    mission: brief?.mission || null,
    currentStage: brief?.current_stage || null,
    generatedAt,
    sources: {
      missionBrief: "project/fde/mission-brief.json",
      adrDirectory: "project/fde/adr",
      github: github
        ? { repo: github.repo || null, fetchedAt: github.fetchedAt || null, error: github.error || null, count: github.items?.length || 0 }
        : null,
    },
    kpis: {
      total,
      active,
      open: counts.open,
      inProgress: counts.in_progress,
      blocked: counts.blocked,
      done: counts.done,
      completionPct,
      // `adrOpen` = ADRs still in force (proposed/accepted/deprecated).
      adrOpen: adrs.filter((adr) => adr.isOpen).length,
      adrTotal: adrs.length,
      adrAccepted: adrs.filter((adr) => (adr.rawStatus || adr.statusKey) === "accepted" || adr.statusKey === "done").length,
      adrProposed: adrs.filter((adr) => (adr.rawStatus || "") === "proposed").length,
      gatePassed: gates.filter((gate) => gate.status === "done").length,
      gateTotal: gates.length,
      criticalOpen: sorted.filter(
        (task) => task.status !== "done" && ["P0", "P1"].includes(task.priority)
      ).length,
    },
    owners: Array.from(owners.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    tasks: sorted,
    adrs: adrs.map((adr) => ({
      id: adr.id,
      title: adr.title,
      status: adr.status,
      statusKey: adr.statusKey,
      rawStatus: adr.rawStatus || null,
      type: adr.type || null,
      date: adr.date,
      deciders: adr.deciders,
      consulted: adr.consulted || [],
      path: adr.path,
      followUps: adr.followUps,
      supersedes: adr.supersedes || [],
      supersededBy: adr.supersededBy || null,
      asrTriggers: adr.asrTriggers || [],
      findings: adr.findings || [],
    })),
    gates,
    metrics,
  };
}

/** Filter helper shared by the API and the UI. */
export function filterTasks(tasks, { status, owner, priority, source, query } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  return (tasks || []).filter((task) => {
    if (status && status !== "all" && task.status !== status) return false;
    if (owner && owner !== "all" && task.owner !== owner) return false;
    if (priority && priority !== "all" && task.priority !== priority) return false;
    if (source && source !== "all" && task.source !== source) return false;
    if (!needle) return true;
    return `${task.id} ${task.title} ${task.description || ""} ${task.owner} ${(task.tags || []).join(" ")}`
      .toLowerCase()
      .includes(needle);
  });
}
