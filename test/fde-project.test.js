import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { validateFdeMissionBrief, summarizeFdeMission } from "../src/lib/fdeProject.js";
import ProjectDecisionsService from "../src/services/ProjectDecisionsService.js";
import { createGame9KServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const BRIEF_PATH = join(ROOT_DIR, "project/fde/mission-brief.json");

function loadBrief() {
  return JSON.parse(readFileSync(BRIEF_PATH, "utf8"));
}

function cloneBrief() {
  return structuredClone(loadBrief());
}

test("FDE mission brief in the repo validates against the field operating contract", () => {
  const brief = loadBrief();
  const result = validateFdeMissionBrief(brief, { rootDir: ROOT_DIR });
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(brief.project_id, "game9k-live-interaction");
  assert.equal(brief.primary_game, "marble-race-live");
  assert.ok(brief.three_whys.system_of_record.length > 0);

  const deltaIds = brief.delta.map((item) => item.id);
  assert.deepEqual(deltaIds, ["dual-room-pk", "viewer-avatar-crowd", "commerce-as-participation"]);
  for (const metric of brief.success_metrics) {
    assert.ok(metric.owner, `${metric.id} must name an owner`);
    assert.ok(metric.evidence, `${metric.id} must name an evidence source`);
  }
  assert.ok(brief.discovery_checklist.some((item) => item.status === "identified"));
});

test("FDE validator rejects broken ownership, statuses, duplicate ids and missing artifacts", () => {
  const brief = cloneBrief();

  brief.success_metrics[0].owner = "";
  brief.success_metrics.push({ ...brief.success_metrics[1] });
  brief.delivery_gates[0].status = "shipped";
  brief.artifacts.push({ id: "ghost-doc", kind: "evidence", path: "project/fde/does-not-exist.md" });
  brief.three_whys.day_2_owner = "";

  const result = validateFdeMissionBrief(brief, { rootDir: ROOT_DIR });
  const joined = result.errors.join("\n");
  assert.equal(result.ok, false);
  assert.match(joined, /success_metrics\[0\]\.owner is required/);
  assert.match(joined, /success_metrics contains duplicate id "viewer_join_rate"/);
  assert.match(joined, /delivery_gates\[0\]\.status "shipped" is not a supported FDE status/);
  assert.match(joined, /project\/fde\/does-not-exist\.md" does not exist/);
  assert.match(joined, /three_whys\.day_2_owner is required/);
});

test("FDE validator surfaces non-object briefs and warns on blocked risk concentration", () => {
  assert.equal(validateFdeMissionBrief(null).ok, false);
  assert.equal(validateFdeMissionBrief([]).ok, false);

  const brief = cloneBrief();
  brief.risks[1].status = "blocked";
  const result = validateFdeMissionBrief(brief, { rootDir: ROOT_DIR });
  assert.ok(result.warnings.some((warning) => /blocked/.test(warning)));
});

test("FDE summary never converts pending field work into an operating state", () => {
  const summary = summarizeFdeMission(loadBrief());
  assert.equal(summary.projectId, "game9k-live-interaction");
  assert.equal(summary.status, "ACTION_REQUIRED");
  assert.ok(summary.blockers.length >= 1);
  assert.ok(summary.blockers.every((risk) => risk.owner && risk.mitigation));
  assert.equal(summary.gateSummary.total, 5);
  assert.equal(summary.gateSummary.passed, 3);
  assert.ok(summary.readiness < 1);
  assert.ok(summary.nextActions.length > 0);

  const clean = cloneBrief();
  for (const gate of clean.delivery_gates) gate.status = "passed";
  for (const risk of clean.risks) risk.status = "mitigated";
  assert.equal(summarizeFdeMission(clean).status, "OPERATING");

  const pilot = cloneBrief();
  pilot.risks = pilot.risks.filter((risk) => risk.status !== "blocked");
  assert.equal(summarizeFdeMission(pilot).status, "PILOT_READY");
});

test("ProjectDecisionsService exposes FDE state and links the release audit", async () => {
  const svc = new ProjectDecisionsService();
  const state = svc.getFdeProjectState();
  assert.equal(state.sourcePath, "project/fde/mission-brief.json");
  assert.equal(state.validation.ok, true, state.validation.errors.join("; "));
  assert.equal(state.summary.status, "ACTION_REQUIRED");

  const audit = await svc.runFdeProjectAudit({});
  assert.equal(audit.validation.ok, true);
  assert.equal(audit.releaseControl.status, "GO_FOR_LAUNCH");
  assert.equal(audit.releaseControl.passedGates, audit.releaseControl.totalGates);
  assert.ok(audit.technicalAudit.gates.length > 0);
});

test("Server FDE control-plane endpoints and CLI `g9k fde --json` work end-to-end", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const stateRes = await fetch(`${baseUrl}/api/project/fde`);
    assert.equal(stateRes.status, 200);
    const stateJson = await stateRes.json();
    assert.equal(stateJson.ok, true);
    assert.equal(stateJson.validation.ok, true);
    assert.equal(stateJson.summary.primaryGame, "marble-race-live");
    assert.equal(stateJson.summary.status, "ACTION_REQUIRED");

    const auditRes = await fetch(`${baseUrl}/api/project/fde/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(auditRes.status, 200);
    const auditJson = await auditRes.json();
    assert.equal(auditJson.ok, true);
    assert.equal(auditJson.releaseControl.status, "GO_FOR_LAUNCH");
    assert.equal(auditJson.summary.status, "ACTION_REQUIRED");
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }

  const cliOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "fde", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(cliOut.schema_version, 1);
  assert.equal(cliOut.ok, true);
  assert.equal(cliOut.command, "fde");
  assert.equal(cliOut.data.validation.ok, true);
  assert.equal(cliOut.data.summary.status, "ACTION_REQUIRED");
  assert.equal(cliOut.data.releaseControl.overallStatus, "GO_FOR_LAUNCH");
  assert.ok(cliOut.data.artifactChecks.length >= 3);
  assert.ok(cliOut.data.artifactChecks.every((check) => check.ok));
  assert.equal(cliOut.error, null);
});

test("CLI `g9k decide --json` keeps technical gates and reports FDE state separately", () => {
  const cliOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "decide", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(cliOut.ok, true);
  assert.equal(cliOut.data.overallStatus, "GO_FOR_LAUNCH");
  assert.equal(cliOut.data.fdeProject.validation.ok, true);
  assert.equal(cliOut.data.fdeProject.summary.status, "ACTION_REQUIRED");
  assert.ok(cliOut.warnings.some((warning) => /FDE project status/.test(warning)));
});
