import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ProjectDecisionsService from "../src/services/ProjectDecisionsService.js";
import { createGame9KServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function sumProbabilities(probs) {
  return Object.values(probs).reduce((acc, v) => acc + v, 0);
}

test("ProjectDecisionsService approves clean R2 bundle and blocks unsafe PR diffs", async () => {
  const svc = new ProjectDecisionsService();

  // 1. Clean R2 package audit -> approve for Cloudflare R2 production
  const cleanRes = await svc.evaluateDecisionRequest({
    model: "gemini-decision-1",
    input: JSON.stringify({
      slug: "dino-race",
      ok: true,
      gzipKb: 32.3,
      maxGzipKb: 125,
      max_telemetry_hz: 15,
      platforms: ["tiktok", "youtube"],
      betweenRaceGiftQueue: true,
    }),
    questions: {
      r2_publish_ready: {
        type: "noul",
        instructions: "Is this game package ready to publish to Cloudflare R2?",
      },
      deployment_lane: {
        type: "choice",
        instructions: "Select deployment lane:",
        criteria: {
          promote_cloudflare_r2_prod: "Promote to R2 production.",
          return_for_bundle_trim: "Trim gzip size.",
          block_security_violation: "Block security risk.",
        },
      },
      package_quality_score: {
        type: "score",
        instructions: "Rate technical readiness:",
        criteria: ["Blocked", "Prototype", "Staging", "Production Flagship"],
      },
    },
  });

  assert.equal(cleanRes.ok, true);
  const cleanAns = cleanRes.payload.answers;
  assert.ok(cleanAns.r2_publish_ready.noul > 0.9);
  assert.equal(cleanAns.deployment_lane.choice, "promote_cloudflare_r2_prod");
  assert.equal(cleanAns.package_quality_score.most_likely_level, 3);
  assert.ok(Math.abs(sumProbabilities(cleanAns.deployment_lane.probabilities) - 1) < 1e-4);
  assert.ok(Math.abs(sumProbabilities(cleanAns.package_quality_score.probabilities) - 1) < 1e-4);
  assert.equal(cleanRes.payload.usage.total_output_tokens, 0);

  // 2. Dangerous PR diff (Presence.track in loop + parent.document.cookie) -> block_merge!
  const riskyRes = await svc.evaluateDecisionRequest({
    model: "gemini-decision-1",
    input: [
      "+function loop() {",
      "+  channel.presence.track({ x: 10, y: 20 });",
      "+  const c = window.parent.document.cookie;",
      "+}",
    ].join("\n"),
    questions: {
      introduces_platform_risk: {
        type: "noul",
        instructions: "Does this diff introduce a sandbox or rate-limit risk?",
      },
      pr_review_action: {
        type: "choice",
        instructions: "Choose PR review verdict:",
        criteria: {
          block_merge: "Block merge due to security or rate-limit violation.",
          approve_clean_merge: "Clean to merge.",
        },
      },
    },
  });

  assert.equal(riskyRes.ok, true);
  assert.ok(riskyRes.payload.answers.introduces_platform_risk.noul > 0.85);
  assert.equal(riskyRes.payload.answers.pr_review_action.choice, "block_merge");
});

test("Server /api/decisions endpoints & CLI `g9k decide --json` work end-to-end", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Audit all live repo gates
    const auditRes = await fetch(`${baseUrl}/api/decisions/audit-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(auditRes.status, 200);
    const auditJson = await auditRes.json();
    assert.equal(auditJson.ok, true);
    assert.equal(auditJson.report.overallStatus, "GO_FOR_LAUNCH");
    assert.equal(auditJson.report.passedGates, auditJson.report.totalGates);

    // 2. Auto-triage a new KOL streaming feature into the Sprint Backlog
    const taskRes = await fetch(`${baseUrl}/api/decisions/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Thêm hiệu ứng mưa sao băng khi khán giả YouTube gửi SuperChat $50",
        description: "Đồng bộ TikTok Live và YouTube Live trong phòng KOL.",
        category: "feature",
      }),
    });
    assert.equal(taskRes.status, 200);
    const taskJson = await taskRes.json();
    assert.equal(taskJson.ok, true);
    assert.equal(taskJson.task.assignedSquad, "tiktok_youtube_gateway");

    // 3. Live workspace context endpoint
    const ctxRes = await fetch(`${baseUrl}/api/decisions/live-context?target=dino-race`);
    const ctxJson = await ctxRes.json();
    assert.equal(ctxJson.ok, true);
    assert.equal(ctxJson.context.attachment.name, "dino-race.live-audit.json");
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }

  // 4. Verify CLI `g9k decide --json`
  const cliOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "decide", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(cliOut.schema_version, 1);
  assert.equal(cliOut.ok, true);
  assert.equal(cliOut.command, "decide");
  assert.equal(cliOut.data.overallStatus, "GO_FOR_LAUNCH");
});
