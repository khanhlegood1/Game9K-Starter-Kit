import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import vm from "node:vm";
import { createGame9KServer } from "../src/server.js";

test("Helicone SHA-256 prompt cache ($0.00 hit), AgentOps Trace/Span/Replay & POS Z-Report sync", async () => {
  const { httpServer, openRouterService, agentOpsService, posService } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check v6.0.0
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.sdkCapabilities.version, "6.0.0");
    assert.equal(health.sdkCapabilities.agentOpsSuite.heliconePromptCache, true);
    assert.equal(health.sdkCapabilities.agentOpsSuite.vercelSseStream, true);

    // 2. First call = cache miss; second identical call = Helicone $0.00 cache hit!
    const promptPayload = {
      prompt: "Bình luận siêu tốc Dino Race: Mưa thiên thạch 5x!",
      sort: "latency",
      zdr: true,
    };
    const first = await openRouterService.chat(promptPayload);
    assert.equal(first.ok, true);
    assert.equal(first.cached, false);
    assert.ok(first.traceId);

    const second = await openRouterService.chat(promptPayload);
    assert.equal(second.ok, true);
    assert.equal(second.cached, true);
    assert.equal(second.usage.costUsd, 0);
    assert.equal(second.content, first.content);

    // 3. AgentOps Dashboard & Session Replay + Eval Score
    const dash = await fetch(`${base}/api/agentops/dashboard`).then((r) => r.json());
    assert.equal(dash.ok, true);
    assert.equal(dash.helicone.cacheHits >= 1, true);
    assert.equal(dash.helicone.cacheLookups >= 2, true);
    assert.ok(dash.helicone.latency.samples >= 2);

    const replay = await fetch(
      `${base}/api/agentops/traces/${first.traceId}/replay`
    ).then((r) => r.json());
    assert.equal(replay.ok, true);
    assert.ok(replay.replayFrames.length >= 1);
    assert.ok(replay.graph.nodes.length >= 2);

    const scored = await fetch(
      `${base}/api/agentops/traces/${first.traceId}/score`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "nd147_safety",
          value: 0.99,
          comment: "Clean & fast",
        }),
      }
    ).then((r) => r.json());
    assert.equal(scored.ok, true);
    assert.equal(scored.score.value, 0.99);

    // 4. Multi-span Prompt-to-Poki-Fragment Trace (`openrouter_structured_fragment_spec` -> `e2b_sandbox_deploy_preview`)
    const frag = await fetch(`${base}/api/openrouter/fragments/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Mini-game khủng long neon Poki 60fps" }),
    }).then((r) => r.json());
    assert.equal(frag.ok, true);
    assert.ok(frag.traceId);
    const fragReplay = agentOpsService.getTraceReplay(frag.traceId);
    assert.equal(fragReplay.replayFrames.length, 2);

    // 5. POS Z-Report `aiUsage` includes cacheHits, cacheHitRatePct, p95LatencyMs
    const zRep = posService.computeZReport();
    assert.equal(zRep.aiUsage.cacheHits >= 1, true);
    assert.equal(typeof zRep.aiUsage.cacheHitRatePct, "number");
    assert.equal(typeof zRep.aiUsage.p95LatencyMs, "number");
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Vercel AI SSE Stream, Chidori Reactive Bus, SID Context Capsule & Steamship HMAC Webhooks", async () => {
  const { httpServer } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  // Spin up local webhook receiver to verify Steamship HMAC-SHA256 `X-Game9K-Signature`
  let receivedSig = "";
  let receivedRawBody = "";
  const hookServer = http.createServer((req, res) => {
    receivedSig = String(req.headers["x-game9k-signature"] || "");
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      receivedRawBody = buf;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => hookServer.listen(0, "127.0.0.1", resolve));
  const hookPort = hookServer.address().port;

  try {
    // 1. SSE `/api/openrouter/stream` emits `text-delta` chunks + `finish` summary
    const sseRes = await fetch(`${base}/api/openrouter/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Stream chào mừng khán giả KOL!" }),
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get("content-type") || "", /text\/event-stream/);
    const rawSse = await sseRes.text();
    const events = rawSse
      .split("\n\n")
      .map((b) => b.trim())
      .filter((b) => b.startsWith("data:"))
      .map((b) => JSON.parse(b.slice(5).trim()));
    const deltas = events.filter((e) => e.type === "text-delta");
    const finish = events.find((e) => e.type === "finish");
    assert.ok(deltas.length >= 2);
    assert.ok(finish?.traceId);

    // 2. Chidori Reactive Event Bus (`kol.high_tier_gift` + `pos.stock_alert`)
    const reactiveKol = await fetch(`${base}/api/agentops/reactive/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "kol.high_tier_gift",
        payload: { nickname: "VIP_KhanhLe", giftTier: "meteor" },
      }),
    }).then((r) => r.json());
    assert.equal(reactiveKol.ok, true);
    assert.equal(reactiveKol.reactionsCount, 1);

    const reactivePos = await fetch(`${base}/api/agentops/reactive/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "pos.stock_alert",
        payload: { sku: "kol_meteor_pack_5", status: "86'd", stockOnHand: 0 },
      }),
    }).then((r) => r.json());
    assert.equal(reactivePos.ok, true);
    assert.match(reactivePos.reactions[0].result.banner, /Chidori Reactive/);

    // 3. SID 1-Click Context Capsule
    const capsuleRes = await fetch(
      `${base}/api/agentops/context-capsule?gameId=dino-race`
    ).then((r) => r.json());
    assert.equal(capsuleRes.ok, true);
    assert.equal(capsuleRes.capsuleVersion, "sid-v1");
    assert.equal(capsuleRes.game.id, "dino-race");
    assert.ok(capsuleRes.economySnapshot);

    // 4. Steamship HMAC-SHA256 Signed Webhooks (`X-Game9K-Signature`) verified end-to-end!
    const secret = "whsec_unit_test_secret_9k";
    const reg = await fetch(`${base}/api/agentops/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `http://127.0.0.1:${hookPort}/callback`,
        secret,
        events: ["agentops.eval_passed"],
      }),
    }).then((r) => r.json());
    assert.equal(reg.ok, true);

    const disp = await fetch(`${base}/api/agentops/webhooks/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "agentops.eval_passed",
        payload: { gameId: "dino-race", passed: true },
      }),
    }).then((r) => r.json());
    assert.equal(disp.ok, true);
    assert.equal(disp.deliveriesCount, 1);
    assert.equal(disp.deliveries[0].status, "delivered");

    const expectedHmac =
      "sha256=" + createHmac("sha256", secret).update(receivedRawBody).digest("hex");
    assert.equal(receivedSig, expectedHmac);
  } finally {
    await new Promise((resolve) => hookServer.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Poki <iframe sandbox='allow-scripts'> bridges PokiSDK.ai.streamChat & PokiSDK.agentOps", async () => {
  const sdkSource = readFileSync(
    new URL("../public/sdk/game9k-sdk.js", import.meta.url),
    "utf8"
  );
  const messageHandlers = [];

  const parentWindow = {
    postMessage(msg) {
      if (msg.type === "PORTAL_HANDSHAKE_SYN") {
        setTimeout(() => {
          dispatchFromParent({
            type: "PORTAL_HANDSHAKE_ACK",
            params: {},
            language: "vi",
            country: "VN",
          });
        }, 2);
      } else if (msg.type === "PORTAL_STREAM_START") {
        const chunks = ["🔥 ", "Mưa ", "Thiên ", "Thạch ", "5x!"];
        chunks.forEach((delta, index) => {
          setTimeout(() => {
            dispatchFromParent({
              type: "PORTAL_STREAM_CHUNK",
              streamId: msg.streamId,
              delta,
              index,
            });
          }, 3 * (index + 1));
        });
        setTimeout(() => {
          dispatchFromParent({
            type: "PORTAL_STREAM_DONE",
            streamId: msg.streamId,
            ok: true,
            summary: { cached: true, traceId: "trc_sandbox_stream_01" },
          });
        }, 25);
      } else if (msg.type === "PORTAL_RPC_REQUEST") {
        setTimeout(() => {
          let data = { ok: true };
          if (msg.action === "agentops_dashboard") {
            data = {
              ok: true,
              helicone: { cacheHits: 4, cacheLookups: 5, cacheHitRatePct: 80 },
            };
          } else if (msg.action === "agentops_context_capsule") {
            data = {
              ok: true,
              capsuleVersion: "sid-v1",
              game: { id: "dino-race" },
            };
          }
          dispatchFromParent({
            type: "PORTAL_RPC_RESPONSE",
            reqId: msg.reqId,
            ok: true,
            data,
          });
        }, 2);
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

  function dispatchFromParent(data) {
    for (const fn of messageHandlers) {
      fn({ source: parentWindow, origin: "null", data });
    }
  }

  vm.runInNewContext(sdkSource, sandboxGlobal);

  const { Game9K, PokiSDK, AgentOpsSDK } = sandboxGlobal;
  assert.equal(Game9K.sdkVersion, "6.0.0");
  assert.equal(PokiSDK.agentOps, AgentOpsSDK);

  await PokiSDK.init({ gameId: "dino-race", version: "6.0.0" });
  await new Promise((r) => setTimeout(r, 10));

  const receivedDeltas = [];
  const streamRes = await PokiSDK.ai.streamChat("Test sandbox stream", {
    onDelta(d) {
      receivedDeltas.push(d);
    },
  });
  assert.equal(receivedDeltas.join(""), "🔥 Mưa Thiên Thạch 5x!");
  assert.equal(streamRes.cached, true);
  assert.equal(streamRes.traceId, "trc_sandbox_stream_01");

  const dash = await PokiSDK.agentOps.getDashboard();
  assert.equal(dash.helicone.cacheHitRatePct, 80);

  const cap = await PokiSDK.agentOps.getContextCapsule("dino-race");
  assert.equal(cap.capsuleVersion, "sid-v1");
});
