import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTaskBoard,
  filterTasks,
  loadAdrs,
  normalizeGithubItems,
  normalizePriority,
  normalizeStatus,
  parseAdr,
} from "../src/lib/taskBoard.js";
import TaskBoardService from "../src/services/TaskBoardService.js";
import { createGame9KServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

const ADR_FIXTURE = `---
id: "0007"
title: "Test decision for the board"
type: network
status: accepted
date: 2026-01-02
deciders:
  - Studio Engineering
  - Live Ops
tags: [test]
---

# 0007 — Test decision for the board

## Problem

Body.

## Decision

Body.

## Consequences

Body.

## Alternatives

Body.

## Follow-ups

- \`fde-001\`: Existing action linked to an ADR.
- Manual follow-up without an id.
`;

test("status/priority normalizers map FDE + GitHub vocabulary onto the board", () => {
  assert.equal(normalizeStatus("pending"), "open");
  assert.equal(normalizeStatus("in_progress"), "in_progress");
  assert.equal(normalizeStatus("mitigated"), "done");
  assert.equal(normalizeStatus("shipped"), "open");
  assert.equal(normalizeStatus(undefined), "open");
  assert.equal(normalizePriority("p0"), "P0");
  assert.equal(normalizePriority("P3"), "P3");
  assert.equal(normalizePriority(undefined), "P2");
});

test("parseAdr extracts id, status, deciders and follow-ups from markdown", () => {
  const adr = parseAdr({ path: "project/fde/adr/0007-test-decision.md", content: ADR_FIXTURE });
  assert.equal(adr.id, "0007");
  assert.equal(adr.title, "Test decision for the board");
  assert.equal(adr.status, "Accepted");
  assert.equal(adr.statusKey, "done");
  assert.deepEqual(adr.deciders, ["Studio Engineering", "Live Ops"]);
  assert.equal(adr.followUps.length, 2);
  assert.deepEqual(adr.followUps[0], { id: "fde-001", title: "Existing action linked to an ADR." });
  assert.equal(adr.followUps[1].id, null);
});

test("parseAdr survives a malformed file instead of breaking the investor board", () => {
  const adr = parseAdr({ path: "project/fde/adr/broken.md", content: "no heading here" });
  assert.equal(adr.title, "project/fde/adr/broken.md");
  assert.deepEqual(adr.followUps, []);
  assert.equal(adr.statusKey, "open");
});

test("loadAdrs reads the real ADR directory in stable order", () => {
  const adrs = loadAdrs(ROOT_DIR);
  assert.ok(adrs.length >= 2);
  // Registry order is filename order, so it stays stable as ADRs are added.
  const ids = adrs.map((adr) => adr.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.ok(ids.includes("0001") && ids.includes("0002"));
  assert.equal(ids[0], "0001");
  assert.equal(adrs[0].statusKey, "done");
  assert.ok(adrs[1].followUps.some((followUp) => followUp.id === "fde-005"));
});

test("normalizeGithubItems separates issues from PRs and honours labels", () => {
  const tasks = normalizeGithubItems(
    [
      {
        number: 21,
        title: "Instrument latency",
        body: "p50/p95",
        state: "open",
        labels: [{ name: "p0" }, { name: "blocked" }],
        assignees: [{ login: "khanhlegood1" }],
        html_url: "https://github.com/o/r/issues/21",
        updated_at: "2026-11-20T10:00:00Z",
      },
      {
        number: 22,
        title: "FDE control plane",
        state: "open",
        labels: ["p2"],
        pull_request: { url: "x" },
        user: { login: "author" },
      },
      { number: 23, title: "Closed thing", state: "closed" },
    ],
    { repo: "o/r" }
  );

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].id, "GH-21");
  assert.equal(tasks[0].status, "blocked");
  assert.equal(tasks[0].priority, "P0");
  assert.equal(tasks[0].owner, "khanhlegood1");
  assert.equal(tasks[1].id, "PR-22");
  assert.equal(tasks[1].source, "github-pr");
  assert.equal(tasks[1].owner, "author");
  assert.equal(tasks[2].status, "done");
  assert.match(tasks[2].url, /\/issues\/23$/);
});

test("buildTaskBoard merges FDE actions, risks, ADRs and GitHub into ranked KPIs", () => {
  const brief = {
    project_id: "game9k-live-interaction",
    mission: "Bridge product to field reality.",
    current_stage: "pilot",
    next_actions: [
      { id: "fde-001", title: "Run UAT", owner: "Creator Success", priority: "P0", status: "pending", definition_of_done: "Evidence" },
      { id: "fde-002", title: "Instrument", owner: "Gateway Squad", priority: "P1", status: "in_progress" },
      { id: "fde-003", title: "Shipped thing", owner: "Live Ops", priority: "P2", status: "complete" },
    ],
    risks: [
      { id: "r1", title: "Creator UAT missing", severity: "high", status: "open", owner: "Creator Success", mitigation: "Run pilot" },
      { id: "r2", title: "Resolved risk", severity: "low", status: "mitigated", owner: "Compliance" },
    ],
    delivery_gates: [
      { id: "g1", stage: "discovery", status: "passed", exit_criteria: "Named owners" },
      { id: "g2", stage: "validate", status: "pending" },
    ],
    success_metrics: [{ id: "m1", definition: "Setup time", target: "<=10m", owner: "Creator Success", status: "pending" }],
  };
  const adrs = [parseAdr({ path: "project/fde/adr/0007-test-decision.md", content: ADR_FIXTURE })];
  const github = {
    repo: "o/r",
    fetchedAt: "2026-11-23T00:00:00Z",
    items: [{ number: 31, title: "GitHub blocker", state: "open", labels: ["p0", "blocked"], user: { login: "dev" } }],
  };

  const board = buildTaskBoard({ brief, adrs, github, generatedAt: "2026-11-23T12:00:00Z" });

  assert.equal(board.projectId, "game9k-live-interaction");
  assert.equal(board.kpis.total, 6); // 3 actions + 2 risks - 1 mitigated + 1 gh (ADR follow-ups all dedupe)
  assert.equal(board.kpis.done, 1);
  assert.equal(board.kpis.blocked, 1);
  assert.equal(board.kpis.inProgress, 1);
  assert.equal(board.kpis.open, 3);
  assert.equal(
    board.kpis.criticalOpen,
    board.tasks.filter((task) => task.status !== "done" && ["P0", "P1"].includes(task.priority)).length
  );
  assert.equal(board.kpis.gatePassed, 1);
  assert.equal(board.kpis.gateTotal, 2);

  // blocked first, then in_progress, then open, then done
  assert.deepEqual(
    board.tasks.map((task) => task.status),
    ["blocked", "in_progress", "open", "open", "open", "done"]
  );

  // an ADR follow-up pointing at an existing task links instead of duplicating
  const linked = board.tasks.find((task) => task.id === "fde-001");
  assert.ok(linked.tags.includes("adr"));
  assert.ok(linked.links.includes("project/fde/adr/0007-test-decision.md"));
  assert.equal(board.tasks.filter((task) => task.id === "fde-001").length, 1);

  // an id-less follow-up is matched by title, never duplicated
  assert.equal(board.tasks.filter((task) => /Manual follow-up/.test(task.title)).length, 1);

  // ...but an unknown id-less follow-up still becomes its own task
  const extra = buildTaskBoard({
    brief: { next_actions: [] },
    adrs: [parseAdr({ path: "project/fde/adr/0008-extra.md", content: ADR_FIXTURE.replace("0007", "0008").replace("ADR-007", "0008").replace("test-decision", "extra").replace("`fde-001`: Existing action linked to an ADR.\n", "") })],
    github: null,
  });
  const synthetic = extra.tasks.find((task) => task.id === "0008-FU1");
  assert.ok(synthetic);
  assert.equal(synthetic.source, "adr");

  assert.equal(board.owners[0].name.length > 0, true);
  assert.deepEqual(board.gates.map((g) => g.status), ["done", "open"]);
  assert.equal(board.metrics[0].status, "open");
});

test("filterTasks supports status, owner, priority, source and free-text search", () => {
  const tasks = [
    { id: "a", title: "Run UAT", owner: "Creator Success", priority: "P0", status: "open", source: "fde-action", tags: ["fde"] },
    { id: "b", title: "Instrument latency", owner: "Gateway Squad", priority: "P1", status: "in_progress", source: "fde-action", tags: [] },
    { id: "c", title: "GitHub bug", owner: "dev", priority: "P0", status: "blocked", source: "github-issue", tags: ["bug"] },
  ];

  assert.equal(filterTasks(tasks).length, 3);
  assert.equal(filterTasks(tasks, { status: "open" }).length, 1);
  assert.equal(filterTasks(tasks, { owner: "dev" }).length, 1);
  assert.equal(filterTasks(tasks, { priority: "P0" }).length, 2);
  assert.equal(filterTasks(tasks, { source: "fde-action" }).length, 2);
  assert.equal(filterTasks(tasks, { query: "LATENCY" }).length, 1);
  assert.equal(filterTasks(tasks, { query: "bug" }).length, 1);
  assert.equal(filterTasks(tasks, { status: "all", owner: "all", query: "" }).length, 3);
});

test("buildTaskBoard hides GitHub-owned tasks when GitHub is excluded", () => {
  const brief = { next_actions: [{ id: "fde-001", title: "Run UAT", owner: "Creator Success", priority: "P0", status: "pending" }] };
  const github = { items: [{ number: 61, title: "Issue from GitHub", state: "open" }] };

  const withGithub = buildTaskBoard({ brief, adrs: [], github });
  assert.ok(withGithub.tasks.some((task) => task.id === "GH-61"));

  const withoutGithub = buildTaskBoard({ brief, adrs: [], github: null });
  assert.equal(withoutGithub.tasks.some((task) => task.id === "GH-61"), false);
  assert.ok(withoutGithub.tasks.some((task) => task.id === "fde-001"));
});

test("TaskBoardService degrades gracefully when GitHub is unavailable", async () => {
  const failing = new TaskBoardService({
    rootDir: ROOT_DIR,
    token: "",
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  const board = await failing.getBoard();
  assert.equal(board.githubReady, false);
  assert.equal(board.sources.github.error, "github_unreachable");
  assert.ok(board.tasks.length > 0, "FDE + ADR tasks still render");
  assert.ok(board.kpis.adrTotal >= 2);

  const unauthorized = new TaskBoardService({
    rootDir: ROOT_DIR,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  const denied = await unauthorized.getBoard();
  assert.equal(denied.sources.github.error, "github_http_401");
  assert.ok(denied.tasks.length > 0);
});

test("TaskBoardService caches GitHub responses and can force a refresh", async () => {
  let calls = 0;
  const service = new TaskBoardService({
    rootDir: ROOT_DIR,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => [{ number: 40 + calls, title: `Issue ${calls}`, state: "open" }],
      };
    },
  });

  const first = await service.getBoard();
  assert.equal(first.githubReady, true);
  assert.equal(calls, 1);
  assert.equal(first.tasks.some((t) => t.id === "GH-41"), true);

  await service.getBoard();
  assert.equal(calls, 1, "cached within the TTL");

  const refreshed = await service.getBoard({ refresh: true });
  assert.equal(calls, 2);
  assert.equal(refreshed.tasks.some((t) => t.id === "GH-42"), true);
});

test("TaskBoardService.createTask returns a gh command when no token is configured", async () => {
  const service = new TaskBoardService({ rootDir: ROOT_DIR, token: "", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  const missing = await service.createTask({ title: "   " });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "title_required");

  const result = await service.createTask({
    title: "Instrument p95 latency",
    description: "Add telemetry sample",
    priority: "P0",
    owner: "Gateway Squad",
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "manual");
  assert.equal(result.reason, "no_github_token");
  assert.match(result.command, /^gh issue create --repo khanhlegood1\/Game9K-Starter-Kit/);
  assert.match(result.command, /--label task,p0/);
  assert.match(result.newIssueUrl, /issues\/new\?title=/);
});

test("TaskBoardService.createTask posts to GitHub when a token and API are available", async () => {
  const calls = [];
  const service = new TaskBoardService({
    rootDir: ROOT_DIR,
    token: "ghp_fake",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ number: 99, html_url: "https://github.com/o/r/issues/99" }) };
    },
  });
  const result = await service.createTask({ title: "New investor task", priority: "p1" });
  assert.equal(result.mode, "github");
  assert.equal(result.issue.number, 99);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer ghp_fake");
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.title, "New investor task");
  assert.ok(payload.labels.includes("p1"));
});

test("Server exposes the Tasks portal API end-to-end", async () => {
  const taskBoard = new TaskBoardService({
    rootDir: ROOT_DIR,
    token: "",
    fetchImpl: async (url, init) =>
      init?.method === "POST"
        ? { ok: false, status: 403, json: async () => ({}) }
        : {
            ok: true,
            json: async () => [
              { number: 51, title: "Investor visible issue", state: "open", labels: ["p1"], user: { login: "khanhlegood1" } },
            ],
          },
  });
  const { httpServer, liveRoomHub } = createGame9KServer({ taskBoard });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const boardRes = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(boardRes.status, 200);
    const board = await boardRes.json();
    assert.equal(board.ok, true);
    assert.equal(board.projectId, "game9k-live-interaction");
    assert.equal(board.githubReady, true);
    assert.ok(board.tasks.some((task) => task.id === "GH-51"));
    assert.ok(board.tasks.some((task) => task.id === "fde-001"));
    assert.ok(board.kpis.total > 0);

    const filtered = await (await fetch(`${baseUrl}/api/tasks?status=blocked`)).json();
    assert.equal(filtered.ok, true);
    assert.ok(filtered.tasks.length >= 1);
    assert.ok(filtered.tasks.every((task) => task.status === "blocked"));

    const noGithub = await (await fetch(`${baseUrl}/api/tasks?github=0`)).json();
    assert.equal(noGithub.sources.github, null);
    assert.ok(noGithub.tasks.some((task) => task.source === "fde-action"));

    const adrRes = await (await fetch(`${baseUrl}/api/tasks/adrs`)).json();
    assert.equal(adrRes.ok, true);
    assert.equal(adrRes.adrs[0].id, "0001");
    assert.ok(Array.isArray(adrRes.adrs[0].followUps));
    assert.ok(adrRes.adrs.some((adr) => adr.id === "0002"));

    const badPost = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(badPost.status, 400);

    const created = await (await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Portal-created task", priority: "P2" }),
    })).json();
    assert.equal(created.ok, true);
    assert.equal(created.mode, "manual");
    assert.match(created.command, /gh issue create/);
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Tasks portal page and assets are served by the gateway", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer({
    taskBoard: new TaskBoardService({ rootDir: ROOT_DIR, fetchImpl: async () => ({ ok: true, json: async () => [] }) }),
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const page = await fetch(`${baseUrl}/tasks.html`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Game9K Tasks/);
    assert.match(html, /\/tasks\/tasks.js/);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/);

    const css = await fetch(`${baseUrl}/tasks/tasks.css`);
    assert.equal(css.status, 200);
    assert.match(await css.text(), /--brand: #5b5bd6/);

    const js = await fetch(`${baseUrl}/tasks/tasks.js`);
    assert.equal(js.status, 200);
    const script = await js.text();
    assert.match(script, /\/api\/tasks/);
    assert.doesNotMatch(script, /localhost|127\.0\.0\.1/);
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});
