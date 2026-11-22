import test from "node:test";
import assert from "node:assert/strict";
import { DinoRaceEngine } from "../public/games/dino-race/js/race-engine.js";

test("KOL_DERBY transitions from COUNTDOWN to RACING and queues between-race gifts", () => {
  const engine = new DinoRaceEngine({ playMode: "KOL_DERBY", countdownDuration: 1.0 });
  engine.startNewRound(true);

  assert.equal(engine.gameState, "COUNTDOWN");
  assert.equal(engine.racers.length, 4);

  // Gift sent during COUNTDOWN should be queued so it fires right after gate opens
  engine.applyStreamEvent({
    type: "gift",
    platform: "tiktok",
    user: { uniqueId: "u1", nickname: "MinhAnh" },
    lane: 0,
    giftTier: "meat",
    giftValue: 5,
  });
  assert.equal(engine.queuedGifts.length, 1);

  // Advance past countdown + 0.6s into RACING
  engine.step(1.05);
  assert.equal(engine.gameState, "RACING");
  engine.step(0.6);

  assert.equal(engine.queuedGifts.length, 0);
  assert.ok(engine.racers[0].surgeTimer > 1.5);
  assert.equal(engine.getTopSupporters(1)[0].user, "MinhAnh");
});

test("Smart Banana trap never self-sabotages #1 Leader when supporter gifts #1", () => {
  const engine = new DinoRaceEngine({ playMode: "KOL_DERBY", countdownDuration: 0.1 });
  engine.startNewRound(true);
  engine.step(0.2); // Enter RACING

  // Put racer 0 clearly in #1 place ahead of racer 1
  engine.racers[0].totalProgress = 200;
  engine.racers[1].totalProgress = 120;

  // Supporter gifts Banana to #1 Leader (lane 0) -> should target #2 (racer 1), NOT racer 0!
  engine.applyStreamEvent({
    type: "gift",
    platform: "youtube",
    user: { uniqueId: "yt1", nickname: "TuanYT" },
    lane: 0,
    giftTier: "banana",
    giftValue: 10,
  });

  assert.equal(engine.traps.length, 1);
  assert.equal(engine.traps[0].ownerRacer, engine.racers[0]);
});

test("VIEWER_STAMPEDE spawns personalized viewer dinosaurs and runs Elimination rounds", () => {
  let finishedSummary = null;
  const engine = new DinoRaceEngine({
    playMode: "VIEWER_STAMPEDE",
    eliminationMode: true,
    lobbyDuration: 2.0,
    countdownDuration: 0.1,
    onRaceFinish(summary) {
      finishedSummary = summary;
    },
  });

  engine.startNewRound(true);
  assert.equal(engine.gameState, "LOBBY");

  // 8 viewers join from TikTok & YouTube
  for (let i = 0; i < 8; i++) {
    engine.applyStreamEvent({
      type: "chat",
      platform: i % 2 === 0 ? "tiktok" : "youtube",
      user: { uniqueId: `v_${i}`, nickname: `Viewer_${i}` },
      comment: String((i % 4) + 1),
      lane: i % 4,
    });
  }
  assert.equal(engine.racers.length, 8);

  // Advance through LOBBY + COUNTDOWN -> RACING
  engine.step(2.1);
  engine.step(0.2);
  assert.equal(engine.gameState, "RACING");

  // Simulate Viewer_0 crossing finish line after 3 laps
  engine.racers[0].lap = 3;
  engine.racers[0].waypointIdx = engine.trackPoints.length - 2;
  engine.racers[0].x = engine.trackPoints[1].x;
  engine.racers[0].y = engine.trackPoints[1].y;
  engine.step(0.05);

  assert.equal(engine.gameState, "FINISHED");
  assert.ok(finishedSummary);
  assert.equal(finishedSummary.eliminatedThisRound.length, 2); // 25% of 8 eliminated
  assert.equal(engine.survivorPool.length, 6);
});
