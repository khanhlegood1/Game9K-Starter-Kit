import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createGame9KServer } from "../src/server.js";
import SpliceSpecService from "../src/services/SpliceSpecService.js";

test("CloudEdge v8: Cloudflare R2 AWS Signature V4 publisher & CLI g9k deploy enforce <= 125 KB gzip", async () => {
  const { httpServer } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.sdkCapabilities.version, "8.0.0");
    assert.equal(health.sdkCapabilities.cloudEdgeSuite.cloudflareR2SigV4, true);
    assert.equal(health.sdkCapabilities.cloudEdgeSuite.solanaEd25519Milestones, true);

    const splice = new SpliceSpecService();
    const spec = splice.getOpenAPISpec();
    assert.equal(spec.info.version, "8.0.0");
    assert.ok(spec.paths["/api/cloud/r2/publish"]);
    assert.ok(spec.paths["/api/cloud/solana/milestones"]);
    assert.ok(spec.paths["/api/cloud/nd147/heartbeat"]);

    const pub = await fetch(`${base}/api/cloud/r2/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: "dino-race" }),
    }).then((r) => r.json());

    assert.equal(pub.ok, true);
    assert.ok(pub.deployment.gzipKb > 0 && pub.deployment.gzipKb <= 125);
    assert.equal(pub.deployment.sigV4Signature.length, 64);
    assert.match(pub.deployment.cacheControl, /immutable/);

    // CLI g9k deploy --json end-to-end check
    const rawCli = execFileSync("node", ["cli/g9k.js", "deploy", "--json"], {
      encoding: "utf8",
    });
    const cliOut = JSON.parse(rawCli);
    assert.equal(cliOut.ok, true);
    assert.equal(cliOut.command, "deploy");
    assert.ok(cliOut.data.deployment.gzipKb <= 125);
  } finally {
    httpServer.close();
  }
});

test("CloudEdge v8: Supabase dual-write adapter & Solana Ed25519 milestone signing + tamper rejection", async () => {
  const { httpServer } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Supabase Cloud Save + Global Leaderboard dual-write
    const saveRes = await fetch(`${base}/api/cloud/supabase/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: "dino-race",
        playerId: "exp_supa_v8",
        data: { bestLapSec: 36.8, coins: 900 },
      }),
    }).then((r) => r.json());
    assert.equal(saveRes.ok, true);
    assert.equal(saveRes.provider, "local_dual_write");
    assert.equal(saveRes.save.data.bestLapSec, 36.8);

    const lbRes = await fetch(`${base}/api/cloud/supabase/leaderboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: "dino-race",
        playerId: "exp_supa_v8",
        nickname: "SupaRacerV8",
        score: 7777,
      }),
    }).then((r) => r.json());
    assert.equal(lbRes.ok, true);
    assert.equal(lbRes.topEntries[0].score, 7777);

    // 2. Solana Ed25519 Milestone Vault signing & verification
    const ms = await fetch(`${base}/api/cloud/solana/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: "dino-race", forceSimulateKpi: true }),
    }).then((r) => r.json());

    assert.equal(ms.ok, true);
    assert.equal(ms.totalUnlockedG9K, 100000);
    assert.equal(ms.tranches.length, 3);
    const att = ms.tranches[0].attestation;
    assert.equal(att.signatureHex.length, 128);

    const validCheck = await fetch(`${base}/api/cloud/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: att.message,
        signatureHex: att.signatureHex,
      }),
    }).then((r) => r.json());
    assert.equal(validCheck.valid, true);

    const tamperedCheck = await fetch(`${base}/api/cloud/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: att.message + "|tampered",
        signatureHex: att.signatureHex,
      }),
    }).then((r) => r.json());
    assert.equal(tamperedCheck.valid, false);
  } finally {
    httpServer.close();
  }
});

test("CloudEdge v8: Browser PokiSDK.cloud inside sandbox enforces NĐ 147/2024 Under-18 60m lock & unlock", async () => {
  const { httpServer } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const sdkSource = readFileSync(
      new URL("../public/sdk/game9k-sdk.js", import.meta.url),
      "utf8"
    );
    const messageHandlers = [];

    function dispatchFromParent(data) {
      for (const fn of messageHandlers) {
        fn({ source: parentWindow, origin: "null", data });
      }
    }

    const parentWindow = {
      postMessage(msg) {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "PORTAL_HANDSHAKE_SYN") {
          setTimeout(() => {
            dispatchFromParent({
              type: "PORTAL_HANDSHAKE_ACK",
              params: {},
              language: "vi",
              country: "VN",
            });
          }, 2);
        } else if (msg.type === "PORTAL_RPC_REQUEST") {
          const { reqId, action, payload } = msg;
          if (String(action).startsWith("cloud_")) {
            const method = String(payload?.method || "GET").toUpperCase();
            const bodyObj = { ...(payload || {}) };
            delete bodyObj.path;
            delete bodyObj.method;
            globalThis
              .fetch(`${base}${payload.path}`, {
                method,
                headers: { "Content-Type": "application/json" },
                ...(method !== "GET" ? { body: JSON.stringify(bodyObj) } : {}),
              })
              .then((r) => r.json())
              .then((data) => {
                dispatchFromParent({
                  type: "PORTAL_RPC_RESPONSE",
                  reqId,
                  ok: true,
                  data,
                });
              });
          }
        }
      },
    };

    const sandboxGlobal = {
      console,
      setTimeout,
      clearTimeout,
      Date,
      Math,
      JSON,
      URLSearchParams,
      encodeURIComponent,
      navigator: { language: "vi-VN", userAgent: "Mozilla/5.0" },
      location: { origin: "null", search: "", href: "about:srcdoc" },
      parent: parentWindow,
      addEventListener(type, fn) {
        if (type === "message") messageHandlers.push(fn);
      },
    };
    sandboxGlobal.window = sandboxGlobal;
    sandboxGlobal.globalThis = sandboxGlobal;

    vm.runInNewContext(sdkSource, sandboxGlobal);

    const { PokiSDK, Game9K, CloudEdgeSDK } = sandboxGlobal;
    assert.equal(Game9K.sdkVersion, "8.0.0");
    assert.equal(PokiSDK.cloud, CloudEdgeSDK);

    await PokiSDK.init({ gameId: "dino-race", version: "8.0.0" });
    await new Promise((r) => setTimeout(r, 10));

    // 1. 35 minutes Under-18 -> still unlocked
    const hb1 = await PokiSDK.cloud.heartbeatPlaytime({
      playerId: "u18_kid_test",
      gameId: "dino-race",
      ageGroup: "under18",
      elapsedSec: 2100,
    });
    assert.equal(hb1.shouldLockUnder18, false);
    assert.equal(Game9K.legalLocked, false);

    // 2. +30 minutes (total 65m >= 60m single-game limit) -> auto-locks game loop!
    const hb2 = await PokiSDK.cloud.heartbeatPlaytime({
      playerId: "u18_kid_test",
      gameId: "dino-race",
      ageGroup: "under18",
      elapsedSec: 1800,
    });
    assert.equal(hb2.shouldLockUnder18, true);
    assert.equal(hb2.lockReason, "nd147_60m_single_game_cap");
    assert.equal(Game9K.legalLocked, true);
    assert.equal(Game9K.isPaused, true);

    // 3. Guardian reset -> unlocks cleanly
    const resetRes = await PokiSDK.cloud.resetPlaytime("u18_kid_test");
    assert.equal(resetRes.ok, true);
    assert.equal(Game9K.legalLocked, false);
    assert.equal(Game9K.isPaused, false);
  } finally {
    httpServer.close();
  }
});
