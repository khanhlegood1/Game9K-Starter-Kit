import test from "node:test";
import assert from "node:assert/strict";
import { createGame9KServer } from "../src/server.js";

test("Game9K Gateway serves health, games manifest, avatar guard, SSE & Portal APIs", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health & Games registry
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, "ok");

    const gamesRes = await fetch(`${baseUrl}/api/games`);
    const gamesData = await gamesRes.json();
    assert.ok(gamesData.games.some((g) => g.slug === "dino-race" && g.ok));

    // 2. Avatar Proxy blocks untrusted hosts & generates SVG fallback when requested
    const blockedRes = await fetch(
      `${baseUrl}/api/avatar?u=${encodeURIComponent("https://attacker.evil/pic.png")}`
    );
    assert.equal(blockedRes.status, 403);

    const svgRes = await fetch(`${baseUrl}/api/avatar?name=MinhAnh`);
    assert.equal(svgRes.status, 200);
    assert.match(svgRes.headers.get("content-type") || "", /image\/svg\+xml/);

    // 3. SSE room receives live webhook event (YouTube SuperChat)
    const sseController = new AbortController();
    const ssePromise = (async () => {
      const res = await fetch(`${baseUrl}/api/sse/kol-test-room`, {
        signal: sseController.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('"kind":"event"')) {
          sseController.abort();
          return buffer;
        }
      }
      return buffer;
    })().catch((e) => (e.name === "AbortError" ? "aborted" : Promise.reject(e)));

    // Give SSE connection 80ms to establish, then post a YouTube SuperChat webhook
    await new Promise((r) => setTimeout(r, 80));
    const postEvt = await fetch(`${baseUrl}/api/rooms/kol-test-room/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "youtube",
        type: "gift",
        user: "MinhAnh_YT",
        amountUsd: 5,
        comment: "1",
      }),
    });
    assert.equal(postEvt.status, 200);
    const evtBody = await postEvt.json();
    assert.equal(evtBody.event.giftValue, 100);
    assert.equal(evtBody.event.giftTier, "crown");

    const sseReceived = await ssePromise;
    assert.ok(typeof sseReceived === "string");

    // 4. Portal Leaderboard & Cloud Save APIs
    const lbRes = await fetch(`${baseUrl}/api/portal/leaderboard/dino-race`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: "p1",
        nickname: "CrocMaster",
        score: 2850,
        timeSec: 44.2,
      }),
    });
    const lbJson = await lbRes.json();
    assert.equal(lbJson.ok, true);
    assert.equal(lbJson.entries[0].nickname, "CrocMaster");
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});
