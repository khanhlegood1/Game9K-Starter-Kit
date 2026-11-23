import test from "node:test";
import assert from "node:assert/strict";
import ArenaTournamentService from "../src/services/ArenaTournamentService.js";

test("Arena v9 builds ELO brackets, verifies one-time score proofs, and splits creator revenue", () => {
  const arena = new ArenaTournamentService({ antiCheatSecret: "arena-test-secret" });

  const created = arena.createTournament({
    title: "Test Cup",
    gameId: "cyber-boss-raid",
    participants: ["alpha", "beta", "gamma", "delta"],
  });
  assert.equal(created.ok, true);
  assert.equal(created.tournament.matches.length, 3);
  assert.equal(created.tournament.matches.at(-1).matchId, "m_final_1");

  const first = arena.reportMatchResult(created.tournament.tournamentId, {
    matchId: "m_r1_1",
    scoreA: 10,
    scoreB: 8,
  });
  const second = arena.reportMatchResult(created.tournament.tournamentId, {
    matchId: "m_r1_2",
    scoreA: 7,
    scoreB: 9,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(created.tournament.matches.at(-1).playerA, "alpha");
  assert.equal(created.tournament.matches.at(-1).playerB, "delta");

  const final = arena.reportMatchResult(created.tournament.tournamentId, {
    matchId: "m_final_1",
    scoreA: 12,
    scoreB: 11,
  });
  assert.equal(final.ok, true);
  assert.equal(created.tournament.status, "COMPLETED");
  assert.equal(created.tournament.champion, "alpha");
  assert.equal(
    arena.reportMatchResult(created.tournament.tournamentId, {
      matchId: "m_final_1",
      scoreA: 1,
      scoreB: 0,
    }).status,
    409,
  );

  const session = arena.startScoreSession({ playerId: "player-1", gameId: "cyber-boss-raid" });
  const proof = arena.computeClientProof({
    sessionToken: session.sessionToken,
    gameId: session.gameId,
    playerId: session.playerId,
    score: 2400,
    durationSec: 12,
    eventsCount: 24,
  });
  const verified = arena.submitVerifiedScore({
    sessionId: session.sessionId,
    playerId: session.playerId,
    gameId: session.gameId,
    nickname: "Arena Hero",
    score: 2400,
    durationSec: 12,
    eventsCount: 24,
    clientProof: proof,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.verified, true);
  assert.equal(verified.battlePass.playerId, "player-1");
  assert.equal(
    arena.submitVerifiedScore({
      sessionId: session.sessionId,
      playerId: session.playerId,
      gameId: session.gameId,
      score: 2400,
      durationSec: 12,
      eventsCount: 24,
      clientProof: proof,
    }).code,
    "anti_cheat_replay_detected",
  );

  const badSession = arena.startScoreSession({ playerId: "speedrunner", gameId: "cyber-boss-raid" });
  const badProof = arena.computeClientProof({
    sessionToken: badSession.sessionToken,
    gameId: badSession.gameId,
    playerId: badSession.playerId,
    score: 100,
    durationSec: 5,
    eventsCount: 500,
  });
  assert.equal(
    arena.submitVerifiedScore({
      sessionId: badSession.sessionId,
      playerId: badSession.playerId,
      gameId: badSession.gameId,
      score: 100,
      durationSec: 5,
      eventsCount: 500,
      clientProof: badProof,
    }).code,
    "anti_cheat_event_rate_ceiling",
  );

  const before = arena.getBattlePass("buyer-1").profile.totalXp;
  arena.awardBattlePassXp({ playerId: "buyer-1", gameId: "dino-race", xp: -50 });
  assert.equal(arena.getBattlePass("buyer-1").profile.totalXp, before);

  const sale = arena.attributeCreatorSale({
    creatorCode: "KOL_MINHANH",
    sku: "kol_meteor_pack_5",
    grossCents: 499,
    buyerId: "buyer-1",
  });
  assert.deepEqual(sale.attribution.split, {
    studioNetCents: 349,
    creatorShareCents: 100,
    prizePoolShareCents: 50,
  });
  assert.equal(arena.getStatus().revenueSplitPolicy.kolCreatorPct, 20);
});
