import test from "node:test";
import assert from "node:assert/strict";
import { MarbleRaceEngine, hashSeed } from "../public/games/marble-race-live/js/marble-engine.js";
import { normalizeCustomEvent } from "../src/lib/streamEventNormalizer.js";

function obstacleReceipt(engine) {
  return engine.obstacles.map(({ id, progress, type, targetTeam }) => ({ id, progress, type, targetTeam }));
}

test("Marble Race produces a deterministic obstacle layout from the visible seed", () => {
  const first = new MarbleRaceEngine({ autoStart: false, minBots: 0, seed: "audit-seed" });
  const second = new MarbleRaceEngine({ autoStart: false, minBots: 0, seed: "audit-seed" });
  first.startHeat({ seed: "audit-seed" });
  second.startHeat({ seed: "audit-seed" });

  assert.equal(hashSeed("audit-seed:1"), first.seedValue);
  assert.deepEqual(obstacleReceipt(first), obstacleReceipt(second));
  const different = new MarbleRaceEngine({ autoStart: false, minBots: 0, seed: "different-seed" });
  different.startHeat({ seed: "different-seed" });
  assert.notDeepEqual(obstacleReceipt(first), obstacleReceipt(different));
});

test("Viewer avatars join a capped crowd and PK gifts affect the opposing team", () => {
  const events = [];
  const engine = new MarbleRaceEngine({
    autoStart: false,
    minBots: 0,
    maxMarbles: 3,
    countdownSec: 0.1,
    onEvent: (kind, payload) => events.push({ kind, payload }),
  });
  engine.startHeat({ seed: "pk" });
  const joined = engine.joinViewer({ id: "v1", nickname: "Ava", avatar: "/api/avatar?u=https%3A%2F%2Fexample.com%2Fa.jpg", team: "A" });
  engine.joinViewer({ id: "v2", nickname: "Bo", team: "B" });
  assert.ok(joined);
  assert.equal(engine.joinViewer({ id: "v3", nickname: "Cy", team: "A" })?.team, "A");
  assert.equal(engine.joinViewer({ id: "v4", nickname: "Denied", team: "B" }), null);

  const beforeBoost = joined.boostTimer;
  engine.applyStreamEvent({ type: "gift", team: "A", user: { uniqueId: "v1", nickname: "Ava" }, giftTier: "meteor", giftValue: 20 });
  assert.ok(joined.boostTimer > beforeBoost);
  const pkObstacle = engine.obstacles.find((obstacle) => obstacle.sourceTeam === "A");
  assert.equal(pkObstacle.targetTeam, "B");
  assert.ok(events.some((event) => event.kind === "physics_obstacle_spawned"));
});

test("Finished heat queues live events and flushes them at the next countdown", () => {
  const engine = new MarbleRaceEngine({ autoStart: false, minBots: 0, countdownSec: 0.1, heatDurationSec: 0.2 });
  engine.startHeat({ seed: "queue" });
  engine.update(0.11);
  assert.equal(engine.phase, "RACING");
  engine.update(0.3);
  assert.equal(engine.phase, "FINISHED");

  const queued = engine.applyStreamEvent({
    type: "gift",
    team: "B",
    user: { uniqueId: "late", nickname: "Late Viewer" },
    giftTier: "crown",
    giftValue: 99,
  });
  assert.equal(queued.queued, true);
  assert.equal(engine.getSnapshot().queuedEvents, 1);

  engine.nextHeat();
  assert.equal(engine.phase, "COUNTDOWN");
  assert.equal(engine.getSnapshot().queuedEvents, 0);
  assert.equal(engine.teamGiftCoins.B, 99);
});

test("Normalized custom live events preserve PK team attribution", () => {
  const event = normalizeCustomEvent({
    type: "gift",
    platform: "youtube",
    team: "B",
    user: "creator_viewer",
    giftTier: "meteor",
    coins: 20,
  });
  assert.equal(event.team, "B");
  assert.equal(event.platform, "youtube");
  assert.equal(event.giftTier, "meteor");
  assert.equal(event.user.nickname, "creator_viewer");
});
