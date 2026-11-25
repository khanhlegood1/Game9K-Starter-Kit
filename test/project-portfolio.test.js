/**
 * projectPortfolio — the Jira-clone parity layer must stay *derived*.
 *
 * These tests pin the contract: projects come from the verified release
 * manifest, tasks are mapped to projects by real identifiers, alerts come from
 * blockers/gates/ADRs/schedule, and nothing is invented when a source is
 * missing (static deploy, no dist/, empty brief).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import {
  ALERT_LEVELS,
  PRIORITY_WEIGHT,
  PROGRAM_PROJECT_ID,
  assignTaskToProject,
  buildAlerts,
  buildPortfolio,
  humanizeSlug,
  levelFor,
  projectsFromRelease,
  sprintSummary,
  statusBreakdown,
  weightOf,
} from "../src/lib/projectPortfolio.js";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const RELEASE = {
  bundle_sha256: "b".repeat(64),
  generated_at: "2026-11-25T07:38:58.616Z",
  standalone_bundles: [{ path: "public/games/dino-race/standalone.html", rawKb: 257.39, gzipKb: 63.14 }],
  artifacts: [{ path: "games/dino-race/index.html" }],
  games: [
    {
      slug: "dino-race",
      version: "2.0.0",
      legal_classification: "G2",
      release_sha256: "a".repeat(64),
      metrics: { gzipKb: 34.37, maxGzipKb: 125, fileCount: 8 },
      files: [{ path: "index.html" }],
    },
    {
      slug: "marble-race-live",
      version: "1.0.0",
      legal_classification: "G2",
      release_sha256: "c".repeat(64),
      metrics: { gzipKb: 120, maxGzipKb: 125, fileCount: 6 },
      files: [],
    },
  ],
};

const BRIEF = {
  schema_version: 1,
  mission: "Bridge the product to live reality",
  current_stage: "pilot",
  delivery_gates: [
    { id: "site-survey", status: "passed" },
    { id: "creator-uat", status: "pending", exit_criteria: "Two creators complete the checklist." },
    { id: "day-2-handoff", status: "in_progress" },
  ],
};

const TASKS = [
  { id: "fde-001", title: "Run a two-creator PK UAT", owner: "Creator Success", priority: "P0", status: "open", tags: ["fde"] },
  { id: "fde-002", title: "Instrument marble-race-live latency", owner: "Gateway Squad", priority: "P1", status: "in_progress", tags: ["fde", "marble-race-live"] },
  { id: "fde-003", title: "Confirm the second dinosaur game identity", owner: "Product", priority: "P2", status: "blocked", tags: ["risk"] },
  { id: "fde-004", title: "Cross-link board and gates", owner: "Product", priority: "P3", status: "done", tags: ["fde"] },
];

const ADRS = [
  { id: "0001", title: "Mission", rawStatus: "accepted", status: "Accepted", isOpen: true, date: "2026-11-23", findings: [] },
  { id: "0002", title: "Board source of truth", rawStatus: "proposed", status: "Proposed", isOpen: true, date: "2026-11-23", findings: [] },
];

const WEEK = {
  range: { start: "2026-11-23", end: "2026-11-29" },
  meetings: [
    { id: "mtg-1", title: "UAT PK", date: new Date().toISOString().slice(0, 10), start: "13:00", owner: "Creator Success", agenda: ["Kiểm tra reconnect"] },
    { id: "mtg-2", title: "Investor sync", date: "2099-01-01", start: "16:00", owner: "Product", agenda: [] },
  ],
};

describe("projectPortfolio", () => {
  test("humanizeSlug and weightOf are deterministic", () => {
    assert.equal(humanizeSlug("marble-race-live"), "Marble Race Live");
    assert.equal(humanizeSlug("starter-template"), "Starter Template");
    assert.equal(weightOf("p0"), 13);
    assert.equal(weightOf("P1"), 8);
    assert.equal(weightOf(undefined), PRIORITY_WEIGHT.P2);
  });

  test("projects come from the release manifest, never from a hand-written list", () => {
    const projects = projectsFromRelease(RELEASE);
    assert.deepEqual(projects.map((project) => project.id), ["dino-race", "marble-race-live"]);
    assert.equal(projects[0].name, "Dino Race");
    assert.equal(projects[0].legal, "G2");
    assert.equal(projects[0].budgetKb, 125);
    assert.equal(projectsFromRelease(null).length, 0);
    assert.equal(projectsFromRelease({}).length, 0);
  });

  test("assignTaskToProject matches real identifiers and prefers the longest slug", () => {
    const ids = ["marble-race", "marble-race-live"];
    assert.equal(assignTaskToProject({ title: "Fix marble-race-live renderer" }, ids), "marble-race-live");
    assert.equal(assignTaskToProject(TASKS[1], ["dino-race", "marble-race-live"]), "marble-race-live");
    assert.equal(assignTaskToProject(TASKS[0], ["dino-race"]), PROGRAM_PROJECT_ID);
  });

  test("alert levels map priorities to a closed vocabulary", () => {
    assert.equal(levelFor("P0"), "critical");
    assert.equal(levelFor("P1"), "high");
    assert.equal(levelFor("P2"), "medium");
    assert.equal(levelFor("P3"), "low");
    assert.equal(levelFor(undefined), "medium");
    for (const level of ["critical", "high", "medium", "low"]) {
      assert.ok(ALERT_LEVELS.includes(level));
    }
  });

  test("alerts are derived from blockers, gates, proposed ADRs, meetings and budget", () => {
    const portfolio = buildPortfolio({ brief: BRIEF, tasks: TASKS, adrs: ADRS, releaseManifest: RELEASE, week: WEEK });
    const ids = portfolio.alerts.map((alert) => alert.id);
    assert.ok(ids.includes("alert-blocked-fde-003"), "blocked task must raise an alert");
    assert.ok(ids.includes("alert-adr-0002"), "proposed ADR must raise an alert");
    assert.ok(ids.includes("alert-gate-creator-uat"), "pending gate must raise an alert");
    assert.ok(ids.includes("alert-budget-marble-race-live"), "package at 96% of budget must warn");
    assert.ok(!ids.includes("alert-adr-0001"), "accepted ADR is not an alert");

    // Today's meeting is surfaced, a 2099 meeting is not.
    assert.ok(ids.includes("alert-meeting-mtg-1"));
    assert.ok(!ids.includes("alert-meeting-mtg-2"));

    // Sorted critical-first.
    assert.equal(portfolio.alerts[0].level, "critical");
    const levels = portfolio.alerts.map((alert) => ALERT_LEVELS.indexOf(alert.level));
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  });

  test("project rollup counts issues, points and health", () => {
    const portfolio = buildPortfolio({ brief: BRIEF, tasks: TASKS, adrs: ADRS, releaseManifest: RELEASE, week: WEEK });
    const program = portfolio.projects.find((project) => project.id === PROGRAM_PROJECT_ID);
    const marble = portfolio.projects.find((project) => project.id === "marble-race-live");
    const dino = portfolio.projects.find((project) => project.id === "dino-race");

    assert.equal(program.issues.total, 3, "three tasks are not tied to a game slug");
    assert.equal(program.issues.blocked, 1);
    assert.equal(program.health, "at-risk");

    assert.equal(marble.issues.total, 1);
    assert.equal(marble.release.budgetPct, 96);

    // A validated package with nothing open counts as shipped, not "planning".
    assert.equal(dino.status, "shipped");
    assert.equal(dino.completionPct, 0);
    assert.equal(program.status, "active");

    assert.deepEqual(
      portfolio.projects.map((project) => project.color).slice(0, 3),
      ["#5b5bd6", "#0ea5e9", "#10b981"]
    );
  });

  test("statusBreakdown is exhaustive and percentage-safe", () => {
    const breakdown = statusBreakdown(TASKS);
    assert.equal(breakdown.total, 4);
    assert.deepEqual(breakdown.slices.map((slice) => slice.value), [1, 1, 1, 1]);
    assert.equal(breakdown.slices.reduce((sum, slice) => sum + slice.pct, 0), 100);
    assert.deepEqual(statusBreakdown([]).slices.map((slice) => slice.pct), [0, 0, 0, 0]);
  });

  test("sprintSummary reads the week and gate progress, not a mock sprint", () => {
    const sprint = sprintSummary(WEEK, BRIEF);
    assert.equal(sprint.weekStart, "2026-11-23");
    assert.equal(sprint.meetings, 2);
    assert.equal(sprint.gatesTotal, 3);
    assert.equal(sprint.gatesPassed, 1);
    assert.equal(sprint.gateProgress, 33);
    assert.equal(sprint.nextMeeting.title, "UAT PK");
    assert.equal(sprintSummary(null, null).gatesTotal, 0);
  });

  test("a static deploy (no manifest, no week) degrades instead of throwing", () => {
    const portfolio = buildPortfolio({});
    assert.equal(portfolio.totals.projects, 1, "the FDE program project always exists");
    assert.equal(portfolio.totals.games, 0);
    assert.deepEqual(portfolio.alerts, []);
    assert.equal(portfolio.release, null);
    assert.equal(portfolio.totals.issues, 0);
    assert.equal(buildAlerts({}).length, 0);
  });

  test("the real repository portfolio is derived from the verified manifest", () => {
    const release = JSON.parse(readFileSync(join(ROOT_DIR, "dist/release-manifest.json"), "utf8"));
    const brief = JSON.parse(readFileSync(join(ROOT_DIR, "project/fde/mission-brief.json"), "utf8"));
    const portfolio = buildPortfolio({ brief, tasks: TASKS, adrs: ADRS, releaseManifest: release });
    assert.equal(portfolio.totals.games, release.games.length);
    assert.ok(portfolio.release.bundleSha256.length === 64);
    assert.equal(portfolio.projects[0].release.ready, true);
    assert.ok(portfolio.totals.points >= TASKS.length);
  });
});
