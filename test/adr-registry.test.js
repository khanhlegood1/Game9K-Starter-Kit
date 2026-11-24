import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAdrRegistry, validateAdr, parseAdrDocument, adrFileName, normalizeAdrId } from "../src/lib/adrRegistry.js";
import { parseFrontmatter, parseYamlSubset, extractSections } from "../src/lib/frontmatter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function runCli(args) {
  return JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", ...args, "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: { ...process.env, G9K_GH_API_TOKEN: "", GITHUB_TOKEN: "", GH_TOKEN: "" },
    })
  );
}

/* ------------------------------------------------------------------ YAML */

test("frontmatter parser handles scalars, inline arrays, block lists and object lists", () => {
  const { data, body, hasFrontmatter } = parseFrontmatter(`---
id: "0007"
status: accepted
empty: null
tags: [a, b]
deciders:
  - Studio Engineering
  - Live Ops
asr_triggers:
  - kind: security
    evidence: "auth on every room"
---

# 0007 — Title
`);

  assert.equal(hasFrontmatter, true);
  assert.equal(data.id, "0007");
  assert.equal(data.status, "accepted");
  assert.equal(data.empty, null);
  assert.deepEqual(data.tags, ["a", "b"]);
  assert.deepEqual(data.deciders, ["Studio Engineering", "Live Ops"]);
  assert.equal(data.asr_triggers[0].kind, "security");
  assert.equal(data.asr_triggers[0].evidence, "auth on every room");
  assert.ok(body.includes("# 0007 — Title"));
});

test("frontmatter parser degrades on documents without a frontmatter block", () => {
  const { data, hasFrontmatter, body } = parseFrontmatter("# Plain markdown\n\n## Context\n\nBody.\n");
  assert.equal(hasFrontmatter, false);
  assert.deepEqual(data, {});
  assert.ok(body.includes("Plain markdown"));
});

test("yaml subset keeps unquoted scalars and quoted strings distinct", () => {
  const data = parseYamlSubset('title: "A: B"\nplain: A: B\n');
  assert.equal(data.title, "A: B");
  assert.equal(data.plain, "A: B");
});

test("section extraction only splits on H2 headings", () => {
  const sections = extractSections("# H1\n\n## Context\n\n### nested\n\ntext\n\n## Decision\n\nok\n");
  assert.deepEqual(Object.keys(sections), ["Context", "Decision"]);
  assert.ok(sections.Context.includes("### nested"));
});

/* ------------------------------------------------------------------- ADR */

const VALID_ADR = `---
id: "0007"
title: "Kill switch cho PK engine"
type: use-case
status: accepted
date: 2026-01-02
deciders:
  - Studio Engineering
related: ["0001"]
tags: [pk, safety]
asr_triggers:
  - kind: security
    evidence: "Operator console exposes room state to any logged-in user."
    note: "Keep the kill switch behind the operator role."
---

# 0007 — Kill switch cho PK engine

## Problem

Body.

## Context

Body.

## Decision

Body.

## Consequences

Body, including the accepted trade-off.

## Alternatives

Body.

## Confirmation

Body. > Source: project/fde/mission-brief.json

## Follow-ups

- \`fde-001\`: Wire the switch into the operator console.
`;

test("a fully compliant MADR v4 ADR validates with zero findings", () => {
  const adr = parseAdrDocument({ path: "project/fde/adr/0007-kill-switch.md", content: VALID_ADR });
  const findings = validateAdr(adr, { allIds: ["0001", "0007"] });
  assert.deepEqual(findings, []);
  assert.equal(adr.id, "0007");
  assert.equal(adr.type, "use-case");
  assert.equal(adr.status, "accepted");
  assert.deepEqual(adr.related, ["0001"]);
  assert.equal(adr.followUps[0].id, "fde-001");
});

test("validator reports naming, frontmatter, status and section violations with stable rule ids", () => {
  const adr = parseAdrDocument({
    path: "project/fde/adr/ADR-009_whatever.md",
    content: "# ADR-009 — Legacy decision\n\n## Context\n\nOnly context.\n",
  });
  const rules = validateAdr(adr, { allIds: [adr.id] }).map((finding) => finding.rule);
  assert.ok(rules.includes("ADR-NAME-FORMAT"));
  assert.ok(rules.includes("ADR-FRONTMATTER-MISSING"));
  assert.ok(rules.includes("ADR-STATUS-REQUIRED"));
  assert.ok(rules.includes("ADR-SECTION-MISSING"));
});

test("validator enforces supersession symmetry and legal lifecycle status", () => {
  const successor = parseAdrDocument({
    path: "project/fde/adr/0008-next.md",
    content: VALID_ADR.replace('id: "0007"', 'id: "0008"').replace("status: accepted", "status: accepted"),
  });
  const predecessor = parseAdrDocument({
    path: "project/fde/adr/0007-previous.md",
    content: VALID_ADR.replace("status: accepted", "status: superseded"),
  });
  // 0007 claims to be superseded but names no successor; 0008 is self-consistent.
  const findings = validateAdr(predecessor, { allIds: ["0007", "0008"] }).map((finding) => finding.rule);
  assert.ok(findings.includes("ADR-SUPERSEDED-BY-REQUIRED"));
  assert.equal(validateAdr(successor, { allIds: ["0007", "0008"] }).length, 0);
});

test("persona rule rejects named humans and personal handles in stakeholder fields", () => {
  const adr = parseAdrDocument({
    path: "project/fde/adr/0009-personas.md",
    content: VALID_ADR.replace('id: "0007"', 'id: "0009"').replace("  - Studio Engineering", "  - khanh@example.com"),
  });
  const rules = validateAdr(adr, { allIds: ["0009"] }).map((finding) => finding.rule);
  assert.ok(rules.includes("ADR-PERSONA-RULE"));
});

test("registry over the real repository is green, deterministic and reports the next id", () => {
  const first = buildAdrRegistry({ rootDir: ROOT_DIR });
  const second = buildAdrRegistry({ rootDir: ROOT_DIR });

  assert.equal(first.summary.ok, true, JSON.stringify(first.findings));
  assert.deepEqual(first.findings, []);
  assert.equal(first.adrDir, "project/fde/adr");
  assert.equal(first.configPath, "project/fde/adr/.adr-config.yml");
  assert.ok(first.summary.total >= 2);
  assert.equal(first.summary.nextId, "0004");
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.graph, second.graph);
  // `_template.md` is a scaffold, never a decision.
  assert.ok(!first.adrs.some((adr) => adr.path.endsWith("_template.md")));
});

test("registry graph links related ADRs and stays acyclic", () => {
  const { graph } = buildAdrRegistry({ rootDir: ROOT_DIR });
  assert.ok(graph.nodes.length >= 2);
  assert.ok(graph.edges.some((edge) => edge.kind === "related" && edge.from === "0001" && edge.to === "0002"));
  assert.equal(graph.stats.supersession, 0);
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to), `dangling edge ${edge.from} -> ${edge.to}`);
  }
});

test("adrFileName and normalizeAdrId produce hve-core GP-16 names", () => {
  assert.equal(adrFileName("7", "Chọn nhà cung cấp Gift Overlay"), "0007-chon-nha-cung-cap-gift-overlay.md");
  assert.equal(normalizeAdrId("ADR-012"), "0012");
  assert.equal(normalizeAdrId("adr7"), "0007");
});

/* ------------------------------------------------------------------- CLI */

test("CLI `g9k adr validate --json` mirrors the registry summary", () => {
  const out = runCli(["adr", "validate"]);
  assert.equal(out.schema_version, 1);
  assert.equal(out.ok, true);
  assert.equal(out.command, "adr");
  assert.equal(out.data.action, "validate");
  assert.equal(out.data.summary.errors, 0);
  assert.equal(out.data.summary.nextId, "0004");
});

test("CLI `g9k adr next --json` never allocates an id that already exists", () => {
  const out = runCli(["adr", "next", "--title", "Chọn nhà cung cấp gift overlay"]);
  assert.equal(out.ok, true);
  assert.equal(out.data.id, "0004");
  assert.equal(out.data.path, "project/fde/adr/0004-chon-nha-cung-cap-gift-overlay.md");
  assert.equal(out.data.template, "project/fde/adr/_template.md");
});

test("CLI `g9k adr graph --json` returns the lane graph", () => {
  const out = runCli(["adr", "graph"]);
  assert.equal(out.ok, true);
  assert.equal(out.data.layout, "lane");
  assert.ok(out.data.nodes.length >= 2);
});

test("CLI `g9k adr list --json` exposes the closed status taxonomy and transitions", () => {
  const out = runCli(["adr"]);
  assert.equal(out.ok, true);
  assert.equal(out.data.action, "list");
  assert.deepEqual(Object.keys(out.data.transitions).sort(), [
    "accepted",
    "deprecated",
    "proposed",
    "rejected",
    "superseded",
    "withdrawn",
  ]);
  assert.deepEqual(out.data.transitions.proposed, ["accepted", "rejected", "withdrawn"]);
  assert.ok(out.data.adrs.some((adr) => adr.id === "0001" && adr.type === "network"));
});
