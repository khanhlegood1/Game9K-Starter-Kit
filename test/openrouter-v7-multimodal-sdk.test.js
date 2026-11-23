import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createGame9KServer } from "../src/server.js";

test("OpenRouter v7 Audio Speech TTS (`/api/openrouter/audio/speech`) & NĐ 147 ZDR Moderation", async () => {
  const { httpServer, agentOpsService } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Safe KOL live shoutcast synthesizes valid RIFF/WAVE PCM buffer with X-Generation-Id
    const res = await fetch(`${base}/api/openrouter/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "VIP_KhanhLe9K",
        giftTier: "meteor",
        comment: "Mưa thiên thạch lật kèo!",
      }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("x-generation-id") || "", /^gen_tts_/);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.moderation.safeToBroadcast, true);
    assert.equal(json.mimeType, "audio/wav");

    const wavBytes = Buffer.from(json.audioBase64, "base64");
    assert.equal(wavBytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(wavBytes.subarray(8, 12).toString("ascii"), "WAVE");
    assert.ok(wavBytes.length > 44);

    // AgentOps trace recorded for TTS synthesis
    const replay = agentOpsService.getTraceReplay(json.traceId);
    assert.equal(replay.ok, true);
    assert.equal(replay.replayFrames[0].kind, "audio_speech");

    // 2. Unsafe gambling/cheat message is sanitized by NĐ 147/2024 guard before TTS synthesis
    const unsafeRes = await fetch(`${base}/api/openrouter/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "Spammer",
        comment: "web ca do danh bac hack gem",
      }),
    }).then((r) => r.json());
    assert.equal(unsafeRes.ok, true);
    assert.equal(unsafeRes.moderation.safeToBroadcast, false);
    assert.match(unsafeRes.spokenText, /Nghị định 147/);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("OpenRouter v7 Dedicated Image & Sprite API (`/api/openrouter/images/generate` — Transparent & 9:16)", async () => {
  const { httpServer } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. 1:1 Transparent animated multi-frame sprite (`frame_count: 4`)
    const sprite = await fetch(`${base}/api/openrouter/images/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Golden Cyber T-Rex VIP Racer",
        aspect_ratio: "1:1",
        background: "transparent",
        frame_count: 4,
      }),
    }).then((r) => r.json());
    assert.equal(sprite.ok, true);
    assert.equal(sprite.background, "transparent");
    assert.equal(sprite.r2BudgetSafe, true);
    assert.ok(sprite.kbSize <= 125);
    assert.match(sprite.svgMarkup, /animateTransform/);
    assert.equal(/<rect width="256" height="256"/.test(sprite.svgMarkup), false);

    // 2. 9:16 TikTok Live Vertical Poster (`360x640`)
    const poster = await fetch(`${base}/api/openrouter/images/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Meteor Shower Event Tonight",
        aspect_ratio: "9:16",
        background: "opaque",
      }),
    }).then((r) => r.json());
    assert.equal(poster.ok, true);
    assert.equal(poster.aspectRatio, "9:16");
    assert.match(poster.svgMarkup, /viewBox="0 0 360 640"/);
    assert.match(poster.svgMarkup, /GAME9K KOL LIVE 9:16/);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("OpenRouter v7 KOL Sub-Keys Isolation (`/api/openrouter/kol-keys`) & Sticky Prompt Caching (`cache_control`)", async () => {
  const { httpServer } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Provision isolated KOL sub-key with tight daily cap ($0.00002)
    const created = await fetch(`${base}/api/openrouter/kol-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "KOL Burst Room A",
        kolHandle: "@KolRoomA",
        roomId: "room-a",
        limit: 0.00002,
        limit_reset: "daily",
        include_byok_in_limit: true,
      }),
    }).then((r) => r.json());
    assert.equal(created.ok, true);
    assert.equal(created.data.include_byok_in_limit, true);
    const roomAHash = created.data.hash;

    // First call on Room A succeeds and exhausts the $0.00002 cap
    const call1 = await fetch(`${base}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Turn 1 on Room A",
        kolKeyHash: roomAHash,
        bypassCache: true,
      }),
    });
    assert.equal(call1.status, 200);

    // Second call on Room A hits HTTP 402 hard stop
    const call2 = await fetch(`${base}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Turn 2 on Room A",
        kolKeyHash: roomAHash,
        bypassCache: true,
      }),
    });
    assert.equal(call2.status, 402);

    // Meanwhile Room B (`orkol_default_dino_room`) continues running 24/7 unaffected!
    const roomBCall = await fetch(`${base}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Room B still healthy!",
        kolKeyHash: "orkol_default_dino_room",
        bypassCache: true,
      }),
    });
    assert.equal(roomBCall.status, 200);

    // Reset daily window on Room A restores service immediately
    const resetRes = await fetch(`${base}/api/openrouter/kol-keys/${roomAHash}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetUsage: true }),
    }).then((r) => r.json());
    assert.equal(resetRes.ok, true);
    assert.equal(resetRes.data.usage, 0);

    // 2. Sticky `x-session-id` + `cache_control: { type: "ephemeral" }` discounts shared System Prompt across distinct user turns!
    const sysMsg = {
      role: "system",
      content: "Long Game9K Ruleset & POS Catalog & NĐ 147 Safety Lexicon ".repeat(20),
    };
    const stickyTurn1 = await fetch(`${base}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sticky_kol_session_99",
        cacheTtl: "30m",
        bypassCache: true,
        messages: [sysMsg, { role: "user", content: "Viewer A votes lane 1" }],
      }),
    }).then((r) => r.json());
    assert.equal(stickyTurn1.ok, true);
    assert.equal(stickyTurn1.upstreamCacheHit, false);

    const stickyTurn2 = await fetch(`${base}/api/openrouter/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sticky_kol_session_99",
        cacheTtl: "30m",
        bypassCache: true,
        messages: [sysMsg, { role: "user", content: "Viewer B votes lane 4!" }],
      }),
    }).then((r) => r.json());
    assert.equal(stickyTurn2.ok, true);
    assert.equal(stickyTurn2.upstreamCacheHit, true);
    assert.ok(stickyTurn2.usage.cachedReadTokens > 0);
    assert.ok(stickyTurn2.usage.costUsd <= stickyTurn1.usage.costUsd);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Poki <iframe sandbox='allow-scripts'> bridges PokiSDK.ai v7 (speakShoutcast, generateSprite, createKolKey, stickyChat)", async () => {
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
      } else if (msg.type === "PORTAL_RPC_REQUEST") {
        setTimeout(() => {
          let data = { ok: true };
          if (msg.action === "openrouter_audio_speech") {
            data = {
              ok: true,
              generationId: "gen_tts_sbx_01",
              mimeType: "audio/wav",
              audioDataUri: "data:audio/wav;base64,UklGRg==",
            };
          } else if (msg.action === "openrouter_generate_sprite") {
            data = {
              ok: true,
              aspectRatio: msg.payload.aspect_ratio,
              r2BudgetSafe: true,
              kbSize: 1.4,
            };
          } else if (msg.action === "openrouter_kol_keys_create") {
            data = {
              ok: true,
              data: { hash: "orkol_sbx_99", limit_reset: "daily" },
            };
          } else if (msg.action === "openrouter_chat") {
            data = {
              ok: true,
              sessionId: msg.payload.sessionId,
              upstreamCacheHit: true,
              cacheControl: msg.payload.cache_control,
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

  const { Game9K, PokiSDK } = sandboxGlobal;
  assert.equal(Game9K.sdkVersion, "9.0.0");

  await PokiSDK.init({ gameId: "dino-race", version: "9.0.0" });
  await new Promise((r) => setTimeout(r, 10));

  const tts = await PokiSDK.ai.speakShoutcast("Thiên thạch 5x!", { autoPlay: false });
  assert.equal(tts.generationId, "gen_tts_sbx_01");

  const sprite = await PokiSDK.ai.generateSprite("Neon Dino", { aspect_ratio: "9:16" });
  assert.equal(sprite.aspectRatio, "9:16");
  assert.equal(sprite.r2BudgetSafe, true);

  const kol = await PokiSDK.ai.createKolKey({ name: "KOL Sandbox" });
  assert.equal(kol.data.hash, "orkol_sbx_99");

  const sticky = await PokiSDK.ai.stickyChat("sess_sbx_1", "Vote lane 2");
  assert.equal(sticky.sessionId, "sess_sbx_1");
  assert.equal(sticky.cacheControl.type, "ephemeral");
});
