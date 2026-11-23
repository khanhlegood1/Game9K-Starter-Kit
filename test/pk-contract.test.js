import test from "node:test";
import assert from "node:assert/strict";
import { LiveRoomHub } from "../src/services/LiveRoomHub.js";

test("LiveRoomHub stamps a team on normalized events for isolated PK rooms", () => {
  const emitted = [];
  const hub = new LiveRoomHub();
  hub.attachSocketServer({
    to() {
      return {
        emit(name, payload) {
          emitted.push({ name, payload });
        },
      };
    },
  });
  const room = hub.getOrCreateRoom("streamer-b-room");
  room.team = "B";

  const normalized = hub.ingestCustomEvent("streamer-b-room", {
    type: "gift",
    platform: "youtube",
    user: "viewer-b",
    team: "A",
    giftTier: "meteor",
    coins: 20,
  });

  assert.equal(normalized.team, "A");
  assert.equal(emitted.find((entry) => entry.name === "stream_event").payload.team, "B");
  assert.equal(emitted.find((entry) => entry.name === "stream_event").payload.streamerTeam, "B");
  hub.shutdown();
});
