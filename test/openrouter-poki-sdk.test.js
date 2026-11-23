import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame9KServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

test("OpenRouter OAuth PKCE S256, Multi-Provider Failover, ZDR Privacy & Spend Cap 402 Guardrail", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. OAuth PKCE S256 start -> wrong verifier rejected (400), right verifier succeeds (200)
    const pkceStart = await fetch(`${baseUrl}/api/openrouter/pkce/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spendLimitUsd: 0.00002 }),
    }).then((r) => r.json());
    assert.equal(pkceStart.ok, true);
    assert.equal(pkceStart.codeChallengeMethod, "S256");
    assert.ok(pkceStart.authUrl.includes("openrouter.ai/auth"));

    const badVerifierRes = await fetch(`${baseUrl}/api/openrouter/pkce/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: pkceStart.state,
        code: "demo_code",
        codeVerifier: "wrong_verifier_value",
        simulateSandbox: true,
      }),
    });
    assert.equal(badVerifierRes.status, 400);

    const okExchange = await fetch(`${baseUrl}/api/openrouter/pkce/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: pkceStart.state,
        code: "demo_code",
        codeVerifier: pkceStart.codeVerifier,
        simulateSandbox: true,
      }),
    }).then((r) => r.json());
    assert.equal(okExchange.ok, true);
    assert.match(okExchange.session.sessionId, /^orsess_/);

    // 2. First routed call with simulated primary 503 fails over cleanly & enforces ZDR
    const chat1 = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Test OpenRouter failover",
        models: ["google/gemini-2.5-flash", "deepseek/deepseek-chat"],
        simulatePrimaryFailure: true,
        zdr: true,
      }),
    }).then((r) => r.json());
    assert.equal(chat1.ok, true);
    assert.equal(chat1.selectedModel, "deepseek/deepseek-chat");
    assert.equal(chat1.providerPolicy.zdr, true);
    assert.equal(chat1.providerPolicy.data_collection, "deny");

    // 3. Tiny cap ($0.00004) is exhausted after first call -> next call hard-stops with HTTP 402!
    const chat2Res = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Should be blocked by 100% spend cap" }),
    });
    assert.equal(chat2Res.status, 402);
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("OpenRouter Prompt-to-Poki-Fragment, Morph v3 Fast-Apply, KOL NĐ 147 Shoutcaster, Agent Protocol v1 & POS Z-Report Cost Sync", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Prompt-to-Poki-Game + Morph v3 upgrade
    const gen = await fetch(`${baseUrl}/api/openrouter/fragments/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Tạo mini-game khủng long neon né thiên thạch 60fps" }),
    }).then((r) => r.json());
    assert.equal(gen.ok, true);
    assert.ok(gen.url.includes(`/api/e2b/preview/${gen.sbxId}`));

    const morphed = await fetch(`${baseUrl}/api/openrouter/fragments/morph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandboxId: gen.sbxId,
        instruction: "Đổi sang màu vàng gold",
      }),
    }).then((r) => r.json());
    assert.equal(morphed.ok, true);
    assert.equal(morphed.selectedModel, "morph/morph-v3-large");
    assert.ok(morphed.content.includes("#fbbf24"));

    // 2. KOL AI Shoutcaster + NĐ 147 ZDR Moderation
    const cleanCast = await fetch(`${baseUrl}/api/openrouter/shoutcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "VIP_KhanhLe",
        giftTier: "meteor",
        comment: "Chúc mừng Top 1!",
      }),
    }).then((r) => r.json());
    assert.equal(cleanCast.moderation.safeToBroadcast, true);
    assert.ok(cleanCast.shoutcast.headline.includes("VIP_KhanhLe"));

    const unsafeCast = await fetch(`${baseUrl}/api/openrouter/shoutcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "Spammer",
        comment: "Link lua dao hack xu",
      }),
    }).then((r) => r.json());
    assert.equal(unsafeCast.moderation.safeToBroadcast, false);

    // 3. Standardized Agent Protocol v1 + 4-Tier Progressive Benchmark + POS Z-Report AI Spend
    const apTask = await fetch(`${baseUrl}/api/agent-protocol/v1/agent/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "Build cyber sprint Poki fragment" }),
    }).then((r) => r.json());
    assert.match(apTask.task_id, /^ap_task_/);
    assert.equal(apTask.steps[0].status, "completed");
    assert.equal(apTask.artifacts.length, 1);

    const bench = await fetch(`${baseUrl}/api/openrouter/benchmark`, {
      method: "POST",
    }).then((r) => r.json());
    assert.equal(bench.ok, true);
    assert.equal(bench.passedTiers, 4);

    const zReport = await fetch(`${baseUrl}/api/pos/z-report`).then((r) => r.json());
    assert.ok(zReport.aiUsage.requests >= 6);
    assert.ok(zReport.aiUsage.spendUsd > 0);
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("PokiSDK.ai (`window.OpenRouterSDK`) runs safely inside `<iframe sandbox=\"allow-scripts\">` via Portal RPC", async () => {
  const sdkSource = readFileSync(join(ROOT_DIR, "public/sdk/game9k-sdk.js"), "utf8");
  const messageHandlers = [];

  const parentWindow = {
    postMessage(msg) {
      if (msg.type === "PORTAL_HANDSHAKE_SYN") {
        setTimeout(() => {
          dispatchFromParent({ type: "PORTAL_HANDSHAKE_ACK", language: "vi", country: "VN" });
        }, 2);
      } else if (msg.type === "PORTAL_RPC_REQUEST") {
        setTimeout(() => {
          if (msg.action === "openrouter_generate_fragment") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: {
                ok: true,
                sbxId: "sbx_or_game_01",
                selectedModel: "anthropic/claude-3.7-sonnet",
                url: "/api/e2b/preview/sbx_or_game_01",
              },
            });
          } else if (msg.action === "openrouter_shoutcast") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: {
                ok: true,
                moderation: { safeToBroadcast: true, zdrEnforced: true },
                shoutcast: { headline: "🔥 CÚ LẬT KÈO!" },
              },
            });
          }
        }, 2);
      }
    },
  };

  const sandboxGlobal = {
    parent: parentWindow,
    location: { origin: "null", href: "about:srcdoc", search: "" },
    navigator: { language: "vi-VN", userAgent: "Mozilla/5.0" },
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
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

  const { Game9K, PokiSDK, OpenRouterSDK } = sandboxGlobal;
  assert.equal(Game9K.sdkVersion, "8.0.0");
  assert.equal(PokiSDK.ai, OpenRouterSDK);

  await PokiSDK.init({ gameId: "dino-race", version: "8.0.0" });
  await new Promise((r) => setTimeout(r, 10));

  const frag = await PokiSDK.ai.generateFragment("Đua khủng long Poki");
  assert.equal(frag.sbxId, "sbx_or_game_01");
  assert.equal(PokiSDK.runtime.activeSandboxId, "sbx_or_game_01");

  const cast = await PokiSDK.ai.shoutcast({ nickname: "VIP", giftTier: "meteor" });
  assert.equal(cast.moderation.zdrEnforced, true);
});
