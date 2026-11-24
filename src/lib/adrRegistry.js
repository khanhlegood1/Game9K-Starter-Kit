/**
 * adrRegistry.js
 *
 * ADR governance for Game9K, applying two upstream references:
 *
 * - `khanhlegood1/architecture-decisions` (Factory-X): MADR/Docusaurus ADR
 *   collection, separate Network vs Use-Case ADR types, ADR graph, and a
 *   required-sections contract (Problem, Solution, Context, Consequences,
 *   Alternatives, References).
 * - `khanhlegood1/hve-core`: MADR v4.0.0 frontmatter overlay, six-status
 *   taxonomy with legal transitions, `NNNN-kebab-case-title.md` naming,
 *   `supersedes`/`superseded-by` lineage, `asrTriggers`, and personas-not-people.
 *
 * Everything here is deterministic and dependency-free: the same repository
 * always produces the same registry, findings and graph.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractBullets, extractSections, parseFrontmatter } from "./frontmatter.js";

export const ADR_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "deprecated",
  "superseded",
  "withdrawn",
];

/** Legal transitions (hve-core ADR standards). Anything else is a finding. */
export const ADR_TRANSITIONS = {
  proposed: ["accepted", "rejected", "withdrawn"],
  accepted: ["deprecated", "superseded"],
  deprecated: ["superseded"],
  rejected: [],
  withdrawn: [],
  superseded: [],
};

export const ADR_TYPES = ["network", "use-case"];

export const ASR_KINDS = [
  "cost",
  "performance",
  "security",
  "compliance",
  "availability",
  "scalability",
  "maintainability",
  "evolvability",
];

export const ADR_NAME_PATTERN = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** Sections that must exist, by ADR type (Factory-X contract). */
export const REQUIRED_SECTIONS = {
  shared: ["Context", "Consequences", "Alternatives"],
  network: ["Problem", "Decision"],
  "use-case": ["Problem", "Decision"],
};

export const DEFAULT_ADR_CONFIG = {
  project_slug: "game9k-live-interaction",
  owner: "Studio Engineering",
  default_status: "proposed",
  decision_id_format: "NNNN",
  last_decision_id: "0000",
  graph_layout: "lane",
};

const LEGACY_STATUS_MAP = {
  accepted: "accepted",
  proposed: "proposed",
  rejected: "rejected",
  deprecated: "deprecated",
  superseded: "superseded",
  withdrawn: "withdrawn",
  draft: "proposed",
  pending: "proposed",
  open: "proposed",
};

const STATUS_LABEL = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  deprecated: "Deprecated",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};

const TERMINAL = new Set(["rejected", "withdrawn", "superseded"]);

/** `0001-adopt-madr` → `0001`; `ADR-001` → `0001`; `adr7` → `0007`. */
export function normalizeAdrId(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const digits = value.match(/(\d{1,4})/);
  if (!digits) return null;
  return digits[1].padStart(4, "0");
}

export function normalizeAdrStatus(raw, fallback = "proposed") {
  const key = String(raw ?? "").trim().toLowerCase();
  return LEGACY_STATUS_MAP[key] || fallback;
}

/** `0001-some-title.md` from an id + title, per hve-core GP-16. */
export function adrFileName(id, title) {
  const numeric = normalizeAdrId(id) || "0001";
  const slug = String(title || "untitled")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${numeric}-${slug || "untitled"}.md`;
}

/** Persona rule: reject @handles, emails and URLs in stakeholder fields. */
export function looksLikePersonalIdentifier(value) {
  const text = String(value ?? "");
  return /@[a-zA-Z0-9_.-]+/.test(text) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
}

/** Does the text contain a bare personal name instead of a role? Heuristic: report only. */
function hasNumericClaim(text) {
  return /\b\d+(\.\d+)?\s?(%|ms|s|kb|mb|hz|fps|x)\b/i.test(String(text ?? ""));
}

function readConfig(rootDir, adrDir) {
  const configPath = join(adrDir, ".adr-config.yml");
  if (!existsSync(configPath)) return { config: { ...DEFAULT_ADR_CONFIG }, configPath: null };
  return {
    config: parseFrontmatter(`---\n${readFileSync(configPath, "utf8")}\n---\n`).data,
    configPath,
  };
}

/**
 * Parse one ADR document into the normalized registry shape.
 * Unknown or legacy formats are tolerated but reported as findings.
 */
/**
 * Legacy (`ADR-00X`) documents carry their metadata as a bullet list right
 * under the H1 instead of YAML frontmatter. We still read it so the board and
 * the graph degrade gracefully, but `ADR-FRONTMATTER-MISSING` keeps the
 * document red until it is migrated.
 */
export function readLegacyMetadata(body) {
  const meta = {};
  const head = String(body).split(/^##\s+/m)[0] || "";
  const pick = (label) => {
    const match = head.match(new RegExp("\\*\\*" + label + ":?\\*\\*\\s*(.+)", "i"));
    return match ? match[1].trim() : null;
  };
  const status = pick("Status");
  const date = pick("Date");
  const deciders = pick("Deciders");
  const consulted = pick("Consulted");
  if (status) meta.status = status.replace(/[*_]/g, "").trim();
  if (date) meta.date = date.replace(/[*_]/g, "").trim();
  if (deciders) meta.deciders = deciders.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (consulted) meta.consulted = consulted.split(",").map((entry) => entry.trim()).filter(Boolean);
  return meta;
}

/**
 * Parse one ADR document into the normalized registry shape.
 * Unknown or legacy formats are tolerated but reported as findings.
 */
export function parseAdrDocument({ path, content, type = null, id: idOverride = null }) {
  const parsedFrontmatter = parseFrontmatter(content);
  const body = parsedFrontmatter.body;
  const hasFrontmatter = parsedFrontmatter.hasFrontmatter;
  const legacy = hasFrontmatter ? {} : readLegacyMetadata(body);
  const data = { ...legacy, ...parsedFrontmatter.data };
  const sections = extractSections(body);
  const heading = String(body).match(/^#\s+(.+?)\s*$/m)?.[1] || "";
  const headingParts = heading.split(/\s+[—–-]\s+/);
  const headingId = normalizeAdrId(headingParts[0]);
  const frontmatterId = normalizeAdrId(data.id);
  const fileId = normalizeAdrId(String(path).split("/").pop());
  const id = idOverride || frontmatterId || headingId || fileId;

  const title =
    String(data.title || "").trim() ||
    (headingParts.length > 1 ? headingParts.slice(1).join(" — ") : heading) ||
    String(path);

  const status = normalizeAdrStatus(data.status, "proposed");
  const rawStatus = data.status ? String(data.status) : null;

  const deciders = []
    .concat(data.deciders || data["decision-makers"] || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
  const consulted = [].concat(data.consulted || []).filter(Boolean);
  const informed = [].concat(data.informed || []).filter(Boolean);

  const supersedes = [].concat(data.supersedes || []).map(normalizeAdrId).filter(Boolean);
  const supersededBy = normalizeAdrId(data["superseded-by"]);

  const asrTriggers = []
    .concat(data.asr_triggers || data.asrTriggers || [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      kind: String(entry.kind || "").toLowerCase(),
      evidence: entry.evidence || "",
      note: entry.note || "",
    }));

  const followUps = extractFollowUps(body);
  const related = [].concat(data.related || []).filter(Boolean);
  const tags = [].concat(data.tags || []).filter(Boolean).map(String);

  const detectedType =
    type ||
    (String(data.type || "").toLowerCase() === "use-case" ? "use-case" : data.type ? String(data.type).toLowerCase() : "network");

  return {
    id,
    type: ADR_TYPES.includes(detectedType) ? detectedType : "network",
    title: title.replace(/^ADR[-\s]?\d+\s*[—–-]\s*/i, "").trim(),
    description: data.description ? String(data.description) : null,
    status,
    statusLabel: STATUS_LABEL[status],
    rawStatus,
    date: data.date || data["ms.date"] || data.accepted_date || data.proposed_date || null,
    proposedDate: data.proposed_date || null,
    acceptedDate: data.accepted_date || null,
    deciders,
    consulted,
    informed,
    affectedComponents: [].concat(data.affected_components || data.affectedComponents || []).filter(Boolean),
    supersedes,
    supersededBy,
    asrTriggers,
    related,
    tags,
    followUps,
    path,
    hasFrontmatter,
    sections: Object.keys(sections),
    sectionBodies: sections,
    isOpen: !TERMINAL.has(status) && status !== "deprecated" ? true : status === "deprecated" ? true : false,
    body,
  };
}

/** Follow-ups are declared as `- \`fde-001\`: title` in the Follow-ups section. */
export function extractFollowUps(body) {
  const sections = extractSections(body);
  const section =
    sections["Follow-ups"] || sections["Follow ups"] || sections["Followups"] || "";
  return extractBullets(section)
    .map((entry) => {
      const withId = entry.match(/^`([^`]+)`\s*[:—–-]?\s*(.+)$/);
      return withId
        ? { id: withId[1].trim(), title: withId[2].trim() }
        : { id: null, title: entry.replace(/^`|`$/g, "").trim() };
    })
    .filter((entry) => entry.title);
}

/**
 * Validate one ADR against the merged architecture-decisions + hve-core contract.
 * Returns findings with stable IDs so CI output is diffable.
 */
export function validateAdr(adr, { config = DEFAULT_ADR_CONFIG, allIds = [] } = {}) {
  const findings = [];
  const add = (severity, rule, message) => findings.push({ severity, rule, adrId: adr.id, path: adr.path, message });
  const fileName = String(adr.path).split("/").pop();

  if (!adr.id) add("error", "ADR-ID-REQUIRED", "ADR must declare a 4-digit id (frontmatter `id:` or file name).");
  if (!ADR_NAME_PATTERN.test(fileName)) {
    add(
      "error",
      "ADR-NAME-FORMAT",
      `File name "${fileName}" must match NNNN-kebab-case-title.md (hve-core GP-16).`
    );
  } else if (adr.id && !fileName.startsWith(adr.id)) {
    add("error", "ADR-NAME-ID-MISMATCH", `File name prefix must equal id ${adr.id}.`);
  }
  if (!adr.hasFrontmatter) {
    add("error", "ADR-FRONTMATTER-MISSING", "ADR must start with a YAML frontmatter block (MADR v4 overlay).");
  }
  if (!adr.title) add("error", "ADR-TITLE-REQUIRED", "ADR needs a title in frontmatter or H1.");
  if (!adr.rawStatus) {
    add("error", "ADR-STATUS-REQUIRED", "Frontmatter `status:` is required (proposed|accepted|rejected|deprecated|superseded|withdrawn).");
  } else if (!ADR_STATUSES.includes(String(adr.rawStatus).toLowerCase())) {
    add(
      "error",
      "ADR-STATUS-ENUM",
      `Status "${adr.rawStatus}" is outside the closed taxonomy: ${ADR_STATUSES.join(", ")}.`
    );
  }
  if (!adr.date) add("warn", "ADR-DATE-MISSING", "No date recorded; set `date:` (YYYY-MM-DD).");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(adr.date))) {
    add("warn", "ADR-DATE-FORMAT", `Date "${adr.date}" should be YYYY-MM-DD.`);
  }
  if (adr.deciders.length === 0) {
    add("error", "ADR-DECIDERS-REQUIRED", "At least one decider (role/persona) is required.");
  }

  // Status lineage
  if (adr.status === "superseded" && !adr.supersededBy) {
    add("error", "ADR-SUPERSEDED-BY-REQUIRED", "Status `superseded` requires `superseded-by:`.");
  }
  if (adr.supersededBy && adr.status !== "superseded") {
    add("warn", "ADR-SUPERSEDED-BY-STATUS", "`superseded-by` is set but status is not `superseded`.");
  }
  if (adr.supersededBy && !allIds.includes(adr.supersededBy)) {
    add("error", "ADR-SUPERSEDED-BY-DANGLING", `superseded-by ${adr.supersededBy} does not resolve in this project.`);
  }
  for (const target of adr.supersedes) {
    if (!allIds.includes(target)) {
      add("error", "ADR-SUPERSEDES-DANGLING", `supersedes ${target} does not resolve in this project.`);
    }
    if (target === adr.id) add("error", "ADR-SELF-SUPERSEDES", "An ADR cannot supersede itself.");
  }
  if (adr.supersedes.includes(adr.id)) {
    add("error", "ADR-SUCCESSOR-CYCLE", "Supersession links form a self-reference cycle.");
  }

  // Required sections (Factory-X contract, merged)
  const required = [...REQUIRED_SECTIONS.shared, ...(REQUIRED_SECTIONS[adr.type] || [])];
  for (const section of required) {
    if (!adr.sections.includes(section)) {
      add("warn", "ADR-SECTION-MISSING", `Missing "## ${section}" section required for ${adr.type} ADRs.`);
    }
  }
  if (!adr.sections.includes("Alternatives") && !adr.sections.includes("Considered Options")) {
    add("warn", "ADR-ALTERNATIVES-MISSING", "Record rejected alternatives (`## Alternatives` or `## Considered Options`).");
  }
  if (adr.status === "accepted" && adr.sections.includes("Consequences")) {
    const consequences = adr.sectionBodies.Consequences || "";
    if (!/bad|trade-?off|downside|negative|đánh đổi|hạn chế/i.test(consequences)) {
      add("warn", "ADR-CONSEQUENCE-TRADEOFF", "Consequences should state at least one accepted downside.");
    }
  }

  // ASR triggers (hve-core GP-07): required for MADR v4 entries
  if (adr.asrTriggers.length === 0) {
    add("warn", "ADR-ASR-MISSING", "MADR v4 requires at least one `asr_triggers` entry or a recorded none.");
  }
  adr.asrTriggers.forEach((trigger, index) => {
    if (!ASR_KINDS.includes(trigger.kind)) {
      add("error", "ADR-ASR-KIND", `asr_triggers[${index}].kind "${trigger.kind}" is outside the closed enum.`);
    }
    if (!trigger.evidence) add("error", "ADR-ASR-EVIDENCE", `asr_triggers[${index}].evidence is required.`);
    if (!trigger.note) add("error", "ADR-ASR-NOTE", `asr_triggers[${index}].note is required.`);
    if (String(trigger.note).length > 280) {
      add("warn", "ADR-ASR-NOTE-LENGTH", `asr_triggers[${index}].note exceeds 280 characters.`);
    }
  });

  // Personas, not people
  const stakeholders = [...adr.deciders, ...adr.consulted, ...adr.informed];
  for (const entry of stakeholders) {
    if (looksLikePersonalIdentifier(entry)) {
      add("warn", "ADR-PERSONA-RULE", `"${entry}" looks like a personal identifier; record a role or persona instead.`);
    }
  }

  // Unresolved numeric claims inside accepted decisions are a reviewer trap.
  if (adr.status === "accepted" && hasNumericClaim(adr.body) && !/source:|nguồn:|evidence/i.test(adr.body)) {
    add("warn", "ADR-NUMERIC-CLAIM", "Accepted ADR cites numbers without a source; add evidence links.");
  }

  if (config?.owner && adr.deciders.length && !adr.deciders.includes(config.owner)) {
    // informational only: the registry owner should be a decider or consulted
    if (!adr.consulted.includes(config.owner)) {
      add("warn", "ADR-OWNER-NOT-INVOLVED", `Registry owner "${config.owner}" is neither decider nor consulted.`);
    }
  }

  return findings;
}

/** Build the cross-ADR graph: supersession edges, shared tasks, shared components. */
export function buildAdrGraph(adrs) {
  const nodes = adrs.map((adr) => ({
    id: adr.id,
    title: adr.title,
    status: adr.status,
    type: adr.type,
    path: adr.path,
    date: adr.date,
  }));
  const edges = [];
  const seen = new Set();
  const addEdge = (from, to, kind, reason) => {
    const key = `${from}->${to}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind, reason });
  };

  for (const adr of adrs) {
    for (const target of adr.supersedes) addEdge(adr.id, target, "supersedes", "replacement decision");
    if (adr.supersededBy) addEdge(adr.id, adr.supersededBy, "superseded-by", "replaced by");
    for (const related of adr.related) {
      const target = normalizeAdrId(related);
      if (target && target !== adr.id) addEdge(adr.id, target, "related", "explicit reference");
    }
  }

  // Shared follow-up tasks imply the decisions govern the same work.
  const byTask = new Map();
  for (const adr of adrs) {
    for (const followUp of adr.followUps) {
      if (!followUp.id) continue;
      if (!byTask.has(followUp.id)) byTask.set(followUp.id, []);
      byTask.get(followUp.id).push(adr.id);
    }
  }
  for (const [taskId, owners] of byTask) {
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        addEdge(owners[i], owners[j], "shared-task", taskId);
        addEdge(owners[j], owners[i], "shared-task", taskId);
      }
    }
  }

  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degrees.set(edge.from, (degrees.get(edge.from) || 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) || 0) + 1);
  }

  return {
    nodes: nodes.map((node) => ({ ...node, degree: degrees.get(node.id) || 0 })),
    edges,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      supersession: edges.filter((edge) => edge.kind === "supersedes" || edge.kind === "superseded-by").length,
      sharedTask: edges.filter((edge) => edge.kind === "shared-task").length,
      accepted: nodes.filter((node) => node.status === "accepted").length,
      open: nodes.filter((node) => !TERMINAL.has(node.status)).length,
    },
  };
}

/** Aggregate registry: config, adrs, findings, graph, lifecycle summary. */
export function buildAdrRegistry({ rootDir, adrDir = join(rootDir, "project/fde/adr") } = {}) {
  const { config, configPath } = readConfig(rootDir, adrDir);
  const files = existsSync(adrDir)
    ? readdirSync(adrDir)
        .filter((name) => name.toLowerCase().endsWith(".md"))
        // `_template.md` is a scaffold, not a decision.
        .filter((name) => !name.startsWith("_"))
        .sort()
    : [];

  const adrs = files.map((name) =>
    parseAdrDocument({
      path: `project/fde/adr/${name}`,
      content: readFileSync(join(adrDir, name), "utf8"),
    })
  );

  const ids = adrs.map((adr) => adr.id).filter(Boolean);
  const findings = [];
  const seen = new Set();
  for (const adr of adrs) {
    if (adr.id && seen.has(adr.id)) {
      findings.push({
        severity: "error",
        rule: "ADR-ID-DUPLICATE",
        adrId: adr.id,
        path: adr.path,
        message: `Duplicate ADR id ${adr.id}.`,
      });
    }
    if (adr.id) seen.add(adr.id);
    findings.push(...validateAdr(adr, { config, allIds: ids }));
  }

  const graph = buildAdrGraph(adrs);
  const lastConfigId = normalizeAdrId(config.last_decision_id) || "0000";
  const highestId = ids.length ? ids.slice().sort().at(-1) : "0000";
  if (lastConfigId !== "0000" && lastConfigId < highestId) {
    findings.push({
      severity: "warn",
      rule: "ADR-CONFIG-LAST-ID-STALE",
      adrId: highestId,
      path: configPath ? "project/fde/adr/.adr-config.yml" : null,
      message: `last_decision_id ${lastConfigId} is behind the highest allocated id ${highestId}.`,
    });
  }

  const byStatus = Object.fromEntries(ADR_STATUSES.map((status) => [status, 0]));
  for (const adr of adrs) byStatus[adr.status] += 1;

  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warn");

  return {
    schemaVersion: 1,
    config: { ...DEFAULT_ADR_CONFIG, ...config },
    configPath: configPath ? "project/fde/adr/.adr-config.yml" : null,
    adrDir: "project/fde/adr",
    adrs,
    findings,
    graph,
    summary: {
      total: adrs.length,
      byStatus,
      errors: errors.length,
      warnings: warnings.length,
      ok: errors.length === 0,
      open: adrs.filter((adr) => adr.isOpen).length,
      accepted: byStatus.accepted,
      nextId: nextAdrId(config, ids),
    },
  };
}

/** Next free id, honouring both `last_decision_id` and actually used ids. */
export function nextAdrId(config = DEFAULT_ADR_CONFIG, usedIds = []) {
  const numbers = usedIds
    .map((id) => Number(normalizeAdrId(id)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const configLast = Number(normalizeAdrId(config.last_decision_id)) || 0;
  const next = Math.max(configLast, ...numbers, 0) + 1;
  return String(next).padStart(4, "0");
}

/** Suggest the next decision id without writing anything (CLI `adr next`). */
export function suggestAdr({ rootDir, title, type = "network", status = "proposed", deciders = [] } = {}) {
  const registry = buildAdrRegistry({ rootDir });
  const id = registry.summary.nextId;
  return {
    id,
    fileName: adrFileName(id, title),
    path: `project/fde/adr/${adrFileName(id, title)}`,
    type: ADR_TYPES.includes(type) ? type : "network",
    status: ADR_STATUSES.includes(status) ? status : "proposed",
    deciders: deciders.length ? deciders : [registry.config.owner || DEFAULT_ADR_CONFIG.owner],
    template: "madr-v4",
  };
}

export { STATUS_LABEL as ADR_STATUS_LABELS, TERMINAL as ADR_TERMINAL_STATUSES };
