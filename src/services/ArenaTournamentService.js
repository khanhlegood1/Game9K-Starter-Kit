/**
 * Game9K Multi-Game KOL Esports, Anti-Cheat Score Verifier, Cross-Game Battle Pass
 * & KOL Creator 70/20/10 Revenue-Share Engine (v9.0.0)
 *
 * Unifies `dino-race` + `cyber-boss-raid` + future Portal games under a shared
 * competitive progression & streamer attribution layer.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Physics & plausibility ceilings per game to block spoofed leaderboard payloads
const GAME_PLAUSIBILITY_CAPS = {
  "dino-race": {
    minDurationSec: 8,
    maxScore: 25_000,
    maxEventsPerSec: 25,
  },
  "cyber-boss-raid": {
    minDurationSec: 5,
    maxScore: 500_000,
    maxEventsPerSec: 35,
  },
  "starter-template": {
    minDurationSec: 1,
    maxScore: 100_000,
    maxEventsPerSec: 20,
  },
};
const SUPPORTED_GAME_IDS = new Set(Object.keys(GAME_PLAUSIBILITY_CAPS));
const SCORE_SESSION_TTL_MS = 30 * 60 * 1000;

const BATTLE_PASS_REWARDS = [
  { tier: 1, xpRequired: 100, rewardId: "title_rookie_raider", label: "Danh hiệu Tân Binh Săn Boss" },
  { tier: 2, xpRequired: 200, rewardId: "amber_gems_50", label: "+50 Amber Gems Liên Game" },
  { tier: 3, xpRequired: 300, rewardId: "dino_neon_trail", label: "Vệt Đuôi Neon (Dino Race)" },
  { tier: 4, xpRequired: 400, rewardId: "mecha_plasma_blade", label: "Kiếm Plasma Đỏ (Mecha Kaiju Raid)" },
  { tier: 5, xpRequired: 500, rewardId: "kol_vip_badge", label: "Huy hiệu Khán Giả VIP KOL" },
  { tier: 6, xpRequired: 600, rewardId: "orbital_laser_charge", label: "+1 Pháo Quỹ Đạo Miễn Phí" },
  { tier: 7, xpRequired: 700, rewardId: "golden_raptor_visor", label: "Kính Chiến Thuật Raptor" },
  { tier: 8, xpRequired: 800, rewardId: "kaiju_shield_breaker", label: "Lõi Phá Khiên Kaiju (+15% Crit)" },
  { tier: 9, xpRequired: 900, rewardId: "g9k_token_voucher_50", label: "Phiếu Thưởng 50 $G9K" },
  { tier: 10, xpRequired: 1000, rewardId: "mythic_omega_crown", label: "Vương Miện Huyền Thoại Omega 9K" },
];

export default class ArenaTournamentService {
  constructor(options = {}) {
    this.liveRoomHub = options.liveRoomHub || null;
    this.posService = options.posService || null;

    this.antiCheatSecret =
      options.antiCheatSecret ||
      process.env.G9K_ANTICHEAT_SECRET ||
      randomBytes(32).toString("hex");

    // Session nonces for deterministic anti-cheat proof verification
    this.activeSessions = new Map(); // sessionId -> { playerId, gameId, issuedAt, used }
    this.verifiedSubmissions = [];

    // ELO Ratings (default 1200)
    this.eloRatings = new Map([
      ["KOL_DinoStreamVN", 1340],
      ["KOL_MinhAnhLive", 1315],
      ["KOL_KaijuSlayer", 1290],
      ["KOL_SaigonArcade", 1260],
    ]);

    // Cross-Game Battle Pass ledger: playerId -> { playerId, totalXp, tier, byGame, unlockedRewards, history }
    this.battlePasses = new Map();

    // KOL Creator Revenue-Share (70% Studio / 20% KOL Creator / 10% Esports Prize Pool)
    this.creators = new Map([
      [
        "KOL_MINHANH",
        {
          code: "KOL_MINHANH",
          handle: "@MinhAnhLive",
          platform: "tiktok",
          salesCount: 0,
          grossCents: 0,
          creatorShareCents: 0,
          prizePoolShareCents: 0,
          studioNetCents: 0,
        },
      ],
      [
        "KOL_DINOVN",
        {
          code: "KOL_DINOVN",
          handle: "@DinoStreamVN",
          platform: "youtube",
          salesCount: 0,
          grossCents: 0,
          creatorShareCents: 0,
          prizePoolShareCents: 0,
          studioNetCents: 0,
        },
      ],
    ]);

    this.prizePoolCents = 25_000; // Seeded $250.00 community prize pool
    this.tournaments = new Map();

    // Seed an official Cross-Game Launch Tournament
    this.createTournament({
      title: "Giải Đấu Liên Game Game9K Season 1 (Dino Race × Mecha Kaiju Raid)",
      gameId: "cyber-boss-raid",
      prizePoolG9K: 15_000,
      participants: [
        "KOL_DinoStreamVN",
        "KOL_MinhAnhLive",
        "KOL_KaijuSlayer",
        "KOL_SaigonArcade",
      ],
    });
  }

  getStatus() {
    return {
      ok: true,
      version: "9.0.0",
      supportedGames: Object.keys(GAME_PLAUSIBILITY_CAPS),
      activeTournaments: this.tournaments.size,
      verifiedScoresCount: this.verifiedSubmissions.length,
      battlePassPlayers: this.battlePasses.size,
      prizePoolUsd: Number((this.prizePoolCents / 100).toFixed(2)),
      revenueSplitPolicy: {
        studioPct: 70,
        kolCreatorPct: 20,
        esportsPrizePoolPct: 10,
      },
      creators: Array.from(this.creators.values()),
    };
  }

  // ==========================================================================
  // 1. TOURNAMENT BRACKETS & ELO / MMR ENGINE
  // ==========================================================================

  getElo(playerId) {
    return this.eloRatings.get(playerId) ?? 1200;
  }

  _updateElo(winnerId, loserId, kFactor = 32) {
    const rW = this.getElo(winnerId);
    const rL = this.getElo(loserId);
    const expW = 1 / (1 + Math.pow(10, (rL - rW) / 400));
    const expL = 1 - expW;
    const nextW = Math.round(rW + kFactor * (1 - expW));
    const nextL = Math.round(rL + kFactor * (0 - expL));
    this.eloRatings.set(winnerId, nextW);
    this.eloRatings.set(loserId, nextL);
    return {
      winnerEloBefore: rW,
      winnerEloAfter: nextW,
      loserEloBefore: rL,
      loserEloAfter: nextL,
    };
  }

  listTournaments() {
    return {
      ok: true,
      tournaments: Array.from(this.tournaments.values()),
      eloStandings: Array.from(this.eloRatings.entries())
        .map(([playerId, elo]) => ({ playerId, elo }))
        .sort((a, b) => b.elo - a.elo),
    };
  }

  createTournament({
    title = "KOL Showdown Cup",
    gameId = "cyber-boss-raid",
    prizePoolG9K = 10_000,
    participants = [],
  } = {}) {
    const cleanGame = SUPPORTED_GAME_IDS.has(String(gameId)) ? String(gameId) : "cyber-boss-raid";
    const suppliedPlayers = Array.isArray(participants)
      ? participants.map((player) => String(player || "").trim()).filter(Boolean)
      : [];
    const uniquePlayers = [...new Set(suppliedPlayers)];
    const cleanPlayers =
      uniquePlayers.length >= 2
        ? uniquePlayers.slice(0, 8)
        : ["KOL_DinoStreamVN", "KOL_MinhAnhLive", "KOL_KaijuSlayer", "KOL_SaigonArcade"];

    // Pad to a supported power-of-two bracket (2, 4, or 8 players).
    const bracketSize = cleanPlayers.length <= 2 ? 2 : cleanPlayers.length <= 4 ? 4 : 8;
    while (cleanPlayers.length < bracketSize) {
      cleanPlayers.push(`Bot_Challenger_${cleanPlayers.length + 1}`);
    }

    const tourneyId = `trn_${randomBytes(4).toString("hex")}`;
    const matches = [];
    let previousRound = [];
    for (let i = 0; i < cleanPlayers.length; i += 2) {
      const match = {
        matchId: `m_r1_${i / 2 + 1}`,
        round: 1,
        playerA: cleanPlayers[i],
        playerB: cleanPlayers[i + 1],
        scoreA: null,
        scoreB: null,
        winner: null,
      };
      matches.push(match);
      previousRound.push(match);
    }

    let round = 2;
    while (previousRound.length > 1) {
      const nextRound = [];
      for (let i = 0; i < previousRound.length; i += 2) {
        const nextMatch = {
          matchId: previousRound.length === 2 ? "m_final_1" : `m_r${round}_${i / 2 + 1}`,
          round,
          playerA: null,
          playerB: null,
          scoreA: null,
          scoreB: null,
          winner: null,
        };
        const left = previousRound[i];
        const right = previousRound[i + 1];
        left.advancesTo = { matchId: nextMatch.matchId, slot: "playerA" };
        right.advancesTo = { matchId: nextMatch.matchId, slot: "playerB" };
        matches.push(nextMatch);
        nextRound.push(nextMatch);
      }
      previousRound = nextRound;
      round += 1;
    }

    const tournament = {
      tournamentId: tourneyId,
      title: String(title || "KOL Showdown Cup").slice(0, 160),
      gameId: cleanGame,
      prizePoolG9K: Math.max(0, Math.round(Number(prizePoolG9K) || 10_000)),
      status: "IN_PROGRESS",
      champion: null,
      participants: cleanPlayers,
      matches,
      createdAt: new Date().toISOString(),
    };

    this.tournaments.set(tourneyId, tournament);
    return { ok: true, tournament };
  }

  reportMatchResult(tournamentId, { matchId, scoreA = 0, scoreB = 0 } = {}) {
    const trn = this.tournaments.get(String(tournamentId));
    if (!trn) {
      return { ok: false, status: 404, error: `Tournament "${tournamentId}" not found` };
    }
    const match = trn.matches.find((candidate) => candidate.matchId === String(matchId));
    if (!match || !match.playerA || !match.playerB) {
      return { ok: false, status: 400, error: `Match "${matchId}" is not ready or does not exist` };
    }
    if (trn.status !== "IN_PROGRESS" || match.winner || match.scoreA !== null || match.scoreB !== null) {
      return { ok: false, status: 409, error: `Match "${matchId}" has already been reported` };
    }

    const numA = Number(scoreA);
    const numB = Number(scoreB);
    if (!Number.isFinite(numA) || !Number.isFinite(numB) || numA < 0 || numB < 0) {
      return { ok: false, status: 422, error: "Match scores must be finite non-negative numbers" };
    }
    match.scoreA = numA;
    match.scoreB = numB;
    match.winner = numA >= numB ? match.playerA : match.playerB;
    const loser = match.winner === match.playerA ? match.playerB : match.playerA;

    const eloDelta = this._updateElo(match.winner, loser);

    if (match.advancesTo) {
      const nextMatch = trn.matches.find((candidate) => candidate.matchId === match.advancesTo.matchId);
      if (nextMatch) nextMatch[match.advancesTo.slot] = match.winner;
    } else {
      trn.champion = match.winner;
      trn.status = "COMPLETED";
    }

    // Award Battle Pass XP to both participants
    this.awardBattlePassXp({ playerId: match.winner, gameId: trn.gameId, xp: 150, reason: "tournament_match_win" });
    this.awardBattlePassXp({ playerId: loser, gameId: trn.gameId, xp: 60, reason: "tournament_match_played" });

    return {
      ok: true,
      tournament: trn,
      match,
      eloDelta,
    };
  }

  // ==========================================================================
  // 2. DETERMINISTIC ANTI-CHEAT SCORE PROOF SIGNER & VERIFIER
  // ==========================================================================

  startScoreSession({ playerId = "guest", gameId = "cyber-boss-raid" } = {}) {
    const cleanPlayer = String(playerId || "guest").slice(0, 80);
    const cleanGame = SUPPORTED_GAME_IDS.has(String(gameId)) ? String(gameId) : "cyber-boss-raid";
    const sessionId = `acs_${randomBytes(6).toString("hex")}`;
    const nonce = randomBytes(8).toString("hex");
    const issuedAt = Date.now();

    const sessionToken = createHmac("sha256", this.antiCheatSecret)
      .update(`${sessionId}|${cleanPlayer}|${cleanGame}|${nonce}`)
      .digest("hex");

    this.activeSessions.set(sessionId, {
      sessionId,
      playerId: cleanPlayer,
      gameId: cleanGame,
      nonce,
      sessionToken,
      issuedAt,
      used: false,
    });

    return {
      ok: true,
      sessionId,
      gameId: cleanGame,
      playerId: cleanPlayer,
      nonce,
      sessionToken,
      caps: GAME_PLAUSIBILITY_CAPS[cleanGame],
    };
  }

  computeClientProof({ sessionToken, gameId, playerId, score, durationSec, eventsCount }) {
    const canonical = `${sessionToken}|${gameId}|${playerId}|${Number(score)}|${Number(durationSec)}|${Number(eventsCount)}`;
    return createHmac("sha256", sessionToken).update(canonical).digest("hex");
  }

  submitVerifiedScore({
    sessionId,
    playerId,
    nickname = "ArenaExplorer",
    gameId,
    score = 0,
    durationSec = 30,
    eventsCount = 25,
    clientProof = "",
  } = {}) {
    const session = this.activeSessions.get(String(sessionId || ""));
    if (!session) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_invalid_session",
        error: "Missing or expired anti-cheat score session.",
      };
    }
    if (session.used) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_replay_detected",
        error: "Score session nonce already consumed (replay blocked).",
      };
    }
    if (Date.now() - session.issuedAt > SCORE_SESSION_TTL_MS) {
      session.used = true;
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_expired_session",
        error: "Anti-cheat score session expired; start a new session.",
      };
    }

    const submittedPlayerId = String(playerId ?? session.playerId);
    const submittedGameId = String(gameId ?? session.gameId);
    if (submittedPlayerId !== session.playerId || submittedGameId !== session.gameId) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_identity_mismatch",
        error: "Score payload does not match the issued anti-cheat session.",
      };
    }

    const caps = GAME_PLAUSIBILITY_CAPS[session.gameId] || GAME_PLAUSIBILITY_CAPS["cyber-boss-raid"];
    const numScore = Number(score);
    const numDur = Number(durationSec);
    const numEvents = Number(eventsCount);

    if (!Number.isFinite(numScore) || numScore < 0 || numScore > caps.maxScore) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_score_ceiling",
        error: `Score ${numScore} exceeds ${session.gameId} ceiling (${caps.maxScore}).`,
      };
    }

    if (!Number.isFinite(numDur) || numDur < caps.minDurationSec) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_speedhack_detected",
        error: `Match duration ${numDur}s is below minimum ${caps.minDurationSec}s physics threshold.`,
      };
    }

    if (!Number.isFinite(numEvents) || numEvents < 0 || numEvents > caps.maxEventsPerSec * numDur) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_event_rate_ceiling",
        error: `Event count ${numEvents} exceeds ${caps.maxEventsPerSec} events/sec for a ${numDur}s match.`,
      };
    }

    const expectedProof = this.computeClientProof({
      sessionToken: session.sessionToken,
      gameId: session.gameId,
      playerId: session.playerId,
      score: numScore,
      durationSec: numDur,
      eventsCount: numEvents,
    });

    const providedProof = Buffer.from(String(clientProof || ""), "utf8");
    const expectedProofBytes = Buffer.from(expectedProof, "utf8");
    if (
      providedProof.length !== expectedProofBytes.length ||
      !timingSafeEqual(providedProof, expectedProofBytes)
    ) {
      return {
        ok: false,
        status: 422,
        code: "anti_cheat_proof_mismatch",
        error: "Deterministic HMAC score proof mismatch (payload tampered).",
      };
    }

    session.used = true;

    const record = {
      receiptId: `vsc_${randomBytes(5).toString("hex")}`,
      sessionId: session.sessionId,
      gameId: session.gameId,
      playerId: session.playerId,
      nickname: String(nickname || session.playerId),
      score: numScore,
      durationSec: numDur,
      eventsCount: numEvents,
      proofSha256: expectedProof,
      verifiedAt: new Date().toISOString(),
    };
    this.verifiedSubmissions.unshift(record);
    if (this.verifiedSubmissions.length > 50) this.verifiedSubmissions.pop();

    // Sync to LiveRoomHub leaderboard + award Battle Pass XP
    let topEntries = [];
    if (this.liveRoomHub) {
      topEntries = this.liveRoomHub
        .submitLeaderboardScore(session.gameId, {
          playerId: session.playerId,
          nickname: record.nickname,
          score: numScore,
          timeSec: numDur,
        })
        .slice(0, 10);
    }

    const xpEarned = Math.max(25, Math.min(250, Math.round(numScore / 40)));
    const battlePass = this.awardBattlePassXp({
      playerId: session.playerId,
      gameId: session.gameId,
      xp: xpEarned,
      reason: "verified_match_completion",
    });

    return {
      ok: true,
      verified: true,
      record,
      battlePass: battlePass.profile,
      topEntries,
    };
  }

  // ==========================================================================
  // 3. CROSS-GAME BATTLE PASS & SEASON PROGRESSION
  // ==========================================================================

  getBattlePass(playerId = "guest") {
    const cleanId = String(playerId || "guest");
    let profile = this.battlePasses.get(cleanId);
    if (!profile) {
      profile = {
        playerId: cleanId,
        season: "Season 1 — Jurassic × Kaiju Uprising",
        totalXp: 0,
        tier: 0,
        byGame: {},
        unlockedRewards: [],
        recentXpEvents: [],
      };
      this.battlePasses.set(cleanId, profile);
    }
    return {
      ok: true,
      profile,
      rewardTrack: BATTLE_PASS_REWARDS,
    };
  }

  awardBattlePassXp({
    playerId = "guest",
    gameId = "dino-race",
    xp = 50,
    reason = "gameplay_milestone",
  } = {}) {
    const { profile } = this.getBattlePass(playerId);
    const requestedXp = Number(xp);
    const delta = Number.isFinite(requestedXp)
      ? Math.min(1000, Math.max(0, Math.round(requestedXp)))
      : 0;
    profile.totalXp += delta;
    profile.byGame[gameId] = (profile.byGame[gameId] || 0) + delta;
    profile.tier = Math.min(10, Math.floor(profile.totalXp / 100));
    profile.unlockedRewards = BATTLE_PASS_REWARDS.filter((r) => profile.totalXp >= r.xpRequired);
    profile.recentXpEvents.unshift({
      gameId,
      xp: delta,
      reason,
      at: new Date().toISOString(),
    });
    if (profile.recentXpEvents.length > 15) profile.recentXpEvents.pop();

    return {
      ok: true,
      xpAdded: delta,
      profile,
    };
  }

  // ==========================================================================
  // 4. KOL CREATOR CODE & 70/20/10 REVENUE-SHARE LEDGER
  // ==========================================================================

  attributeCreatorSale({
    creatorCode = "KOL_MINHANH",
    sku = "orbital_laser_pack",
    grossCents = 499,
    buyerId = "guest",
    gameId = "cyber-boss-raid",
  } = {}) {
    const code = String(creatorCode || "KOL_MINHANH").trim().toUpperCase();
    let creator = this.creators.get(code);
    if (!creator) {
      creator = {
        code,
        handle: `@${code.replace(/^KOL_/, "").toLowerCase()}`,
        platform: "tiktok",
        salesCount: 0,
        grossCents: 0,
        creatorShareCents: 0,
        prizePoolShareCents: 0,
        studioNetCents: 0,
      };
      this.creators.set(code, creator);
    }

    const gross = Math.max(50, Math.round(Number(grossCents) || 0));
    const creatorShareCents = Math.round(gross * 0.2);
    const prizePoolShareCents = Math.round(gross * 0.1);
    const studioNetCents = gross - creatorShareCents - prizePoolShareCents;

    creator.salesCount += 1;
    creator.grossCents += gross;
    creator.creatorShareCents += creatorShareCents;
    creator.prizePoolShareCents += prizePoolShareCents;
    creator.studioNetCents += studioNetCents;
    this.prizePoolCents += prizePoolShareCents;

    // Bonus XP for supporting a KOL Creator
    this.awardBattlePassXp({
      playerId: buyerId,
      gameId,
      xp: 80,
      reason: `creator_support:${code}`,
    });

    return {
      ok: true,
      attribution: {
        txId: `rev_${randomBytes(5).toString("hex")}`,
        creatorCode: code,
        sku,
        gameId,
        buyerId,
        grossCents: gross,
        split: {
          studioNetCents,
          creatorShareCents,
          prizePoolShareCents,
        },
      },
      creator,
      prizePoolUsd: Number((this.prizePoolCents / 100).toFixed(2)),
    };
  }
}
