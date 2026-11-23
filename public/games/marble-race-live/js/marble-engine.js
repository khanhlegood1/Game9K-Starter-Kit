/**
 * Deterministic viewer-first Marble Race engine.
 *
 * The simulation is intentionally seed based instead of network-physics based:
 * every heat can show its seed, replay the same obstacle layout, and remain
 * inexpensive enough for a 120-marble OBS/TikTok/YouTube overlay.
 */

export const MARBLE_TEAMS = Object.freeze({
  A: { id: "A", label: "STREAMER A", color: "#22d3ee", accent: "#fde047" },
  B: { id: "B", label: "STREAMER B", color: "#f472b6", accent: "#c4b5fd" },
});

export const TRACK_PATH = Object.freeze([
  { x: 0.08, y: 0.84 },
  { x: 0.18, y: 0.70 },
  { x: 0.13, y: 0.50 },
  { x: 0.27, y: 0.30 },
  { x: 0.49, y: 0.20 },
  { x: 0.73, y: 0.28 },
  { x: 0.89, y: 0.48 },
  { x: 0.78, y: 0.67 },
  { x: 0.57, y: 0.78 },
  { x: 0.36, y: 0.71 },
  { x: 0.22, y: 0.90 },
]);

const OBSTACLE_TYPES = ["vortex", "falling_rock", "split_gate"];
const GIFT_TIERS = new Set(["rose", "meat", "banana", "meteor", "crown"]);

export function hashSeed(value) {
  const input = String(value || "game9k-marble-heat");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanTeam(team, fallback = "A") {
  const normalized = String(team || "").trim().toUpperCase();
  return normalized === "B" || normalized === "STREAMER_B" ? "B" : normalized === "A" || normalized === "STREAMER_A" ? "A" : fallback;
}

function teamFromComment(comment, fallback = "A") {
  const text = String(comment || "").trim().toLowerCase();
  if (/^(b|2|team ?b|streamer ?b|đội ?b)\b/.test(text)) return "B";
  if (/^(a|1|team ?a|streamer ?a|đội ?a)\b/.test(text)) return "A";
  return fallback;
}

function normalizeUser(evt = {}) {
  if (evt.user && typeof evt.user === "object") {
    return {
      id: String(evt.user.uniqueId || evt.user.userId || evt.user.nickname || "viewer").slice(0, 80),
      nickname: String(evt.user.nickname || evt.user.uniqueId || "Viewer").slice(0, 24),
      avatar: String(evt.user.profilePictureUrl || evt.user.avatar || evt.avatar || "").slice(0, 500),
      platform: String(evt.user.platform || evt.platform || "tiktok").toLowerCase(),
    };
  }
  const name = String(evt.user || evt.nickname || "Viewer");
  return {
    id: name.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || "viewer",
    nickname: name.slice(0, 24),
    avatar: String(evt.avatar || "").slice(0, 500),
    platform: String(evt.platform || "tiktok").toLowerCase(),
  };
}

export function trackAt(progress, lateral = 0) {
  const p = clamp(progress, 0, 1) * (TRACK_PATH.length - 1);
  const idx = Math.min(TRACK_PATH.length - 2, Math.floor(p));
  const t = p - idx;
  const a = TRACK_PATH[idx];
  const b = TRACK_PATH[idx + 1];
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return { x: x + nx * lateral, y: y + ny * lateral, angle: Math.atan2(dy, dx) };
}

export class MarbleRaceEngine {
  constructor(options = {}) {
    this.maxMarbles = Math.max(1, Math.min(200, Number(options.maxMarbles) || 120));
    this.minBots = Math.max(0, Math.min(this.maxMarbles, Number(options.minBots ?? 18)));
    this.autoStart = options.autoStart !== false;
    this.lobbyDurationSec = Number(options.lobbyDurationSec ?? 8);
    this.countdownSec = Number(options.countdownSec ?? 3);
    this.joinWindowSec = Number(options.joinWindowSec ?? 8);
    this.finishGraceSec = Number(options.finishGraceSec ?? 3.5);
    this.heatDurationSec = Number(options.heatDurationSec ?? 38);
    this.onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    this.onFeedLog = typeof options.onFeedLog === "function" ? options.onFeedLog : () => {};
    this.heatNumber = 0;
    this.phase = "LOBBY"; // LOBBY | COUNTDOWN | RACING | FINISHING | FINISHED
    this.phaseTimer = this.lobbyDurationSec;
    this.heatElapsedSec = 0;
    this.seed = String(options.seed || "G9K-MARBLE-001");
    this.seedValue = hashSeed(this.seed);
    this.random = mulberry32(this.seedValue);
    this.marbleMap = new Map();
    this.marbles = [];
    this.obstacles = [];
    this.finishOrder = [];
    this.eventsProcessed = 0;
    this.eventQueue = [];
    this.teamScores = { A: 0, B: 0 };
    this.teamGiftCoins = { A: 0, B: 0 };
    this._viewerOrdinal = 0;
    this._obstacleOrdinal = 0;
    this._nextBotId = 0;
    this._buildObstacleLayout();
    if (this.autoStart) this._seedBots();
  }

  _seedBots() {
    while (this.marbles.length < this.minBots) {
      const ordinal = this._nextBotId++;
      this.joinViewer({
        id: `bot_${ordinal}`,
        nickname: `CrowdBot_${String(ordinal + 1).padStart(2, "0")}`,
        platform: ordinal % 2 ? "youtube" : "tiktok",
        team: ordinal % 2 ? "B" : "A",
        isBot: true,
      }, { silent: true });
    }
  }

  _buildObstacleLayout() {
    const rng = mulberry32(this.seedValue ^ 0x9e3779b9);
    this.obstacles = [];
    for (let i = 0; i < 12; i += 1) {
      const type = OBSTACLE_TYPES[Math.floor(rng() * OBSTACLE_TYPES.length)];
      this.obstacles.push({
        id: `obs_${this.heatNumber}_${i}`,
        progress: 0.08 + i * 0.071 + rng() * 0.025,
        type,
        targetTeam: rng() > 0.76 ? (rng() > 0.5 ? "A" : "B") : null,
        active: true,
        ttl: 999,
        hitBy: new Set(),
        sourceTeam: "SYSTEM",
      });
    }
  }

  _resetHeatState() {
    this.random = mulberry32(this.seedValue ^ this.heatNumber);
    this.heatElapsedSec = 0;
    this.finishOrder = [];
    this.phase = "COUNTDOWN";
    this.phaseTimer = this.countdownSec;
    this._buildObstacleLayout();
    for (const marble of this.marbles) {
      marble.progress = Math.max(0, this.random() * 0.012);
      marble.finished = false;
      marble.finishRank = 0;
      marble.boostTimer = 0;
      marble.slowTimer = 0;
      marble.stunTimer = 0;
      marble.hitCount = 0;
      marble.lateral = (this.random() - 0.5) * 0.32;
      marble.raceSeed = Math.floor(this.random() * 0xffffffff) >>> 0;
    }
    this.onEvent("heat_started", this.getSnapshot());
  }

  startHeat({ seed, preserveViewers = true } = {}) {
    if (seed) this.seed = String(seed);
    this.heatNumber += 1;
    this.seedValue = hashSeed(`${this.seed}:${this.heatNumber}`);
    this._viewerOrdinal = 0;
    if (!preserveViewers) {
      this.marbleMap.clear();
      this.marbles = [];
    }
    if (this.marbles.length === 0 || this.minBots > 0) this._seedBots();
    this._resetHeatState();
    this._flushQueuedEvents();
    return this.getSnapshot();
  }

  nextHeat() {
    return this.startHeat({ seed: `${this.seed.split(":")[0]}-${this.heatNumber + 1}`, preserveViewers: true });
  }

  _flushQueuedEvents() {
    const queued = this.eventQueue.splice(0, this.eventQueue.length);
    for (const evt of queued) this.applyStreamEvent(evt);
    if (queued.length > 0) this.onEvent("event_queue_flushed", { count: queued.length });
  }

  joinViewer(profile = {}, { silent = false } = {}) {
    const user = {
      id: String(profile.id || profile.uniqueId || profile.nickname || `viewer_${this._viewerOrdinal++}`).slice(0, 80),
      nickname: String(profile.nickname || profile.name || profile.id || "Viewer").slice(0, 24),
      avatar: String(profile.avatar || profile.profilePictureUrl || "").slice(0, 500),
      platform: String(profile.platform || "tiktok").toLowerCase(),
      team: cleanTeam(profile.team || profile.streamerTeam, this._viewerOrdinal % 2 ? "B" : "A"),
      isBot: Boolean(profile.isBot),
    };
    const existing = this.marbleMap.get(user.id);
    if (existing) {
      existing.nickname = user.nickname;
      existing.avatar = user.avatar || existing.avatar;
      existing.team = user.team;
      existing.platform = user.platform;
      return existing;
    }
    const canJoin =
      this.marbles.length < this.maxMarbles &&
      (this.phase === "LOBBY" || this.phase === "COUNTDOWN" || (this.phase === "RACING" && this.heatElapsedSec < this.joinWindowSec));
    if (!canJoin) return null;

    const marble = {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      platform: user.platform,
      team: user.team,
      isBot: user.isBot,
      progress: 0,
      lateral: (this.marbles.length % 9 - 4) * 0.035,
      baseSpeed: 0.074 + (hashSeed(user.id) % 19) / 1000,
      raceSeed: hashSeed(`${this.seed}:${user.id}`),
      boostTimer: 0,
      slowTimer: 0,
      stunTimer: 0,
      hitCount: 0,
      finished: false,
      finishRank: 0,
      obstacleHits: new Set(),
      trail: [],
    };
    this.marbles.push(marble);
    this.marbleMap.set(user.id, marble);
    if (!silent) {
      this.onEvent("marble_joined", { marble: this._publicMarble(marble), count: this.marbles.length });
      this.onFeedLog(`${user.platform === "youtube" ? "▶️" : "🎵"} ${user.nickname} vào đội ${MARBLE_TEAMS[user.team].label}`);
    }
    return marble;
  }

  _publicMarble(marble) {
    const { obstacleHits, trail, ...publicData } = marble;
    return publicData;
  }

  _teamForEvent(evt, fallback = "A") {
    if (evt.team || evt.streamerTeam) return cleanTeam(evt.team || evt.streamerTeam, fallback);
    return teamFromComment(evt.comment || evt.text, fallback);
  }

  applyStreamEvent(evt = {}) {
    if (!evt || typeof evt !== "object") return { ignored: true };
    if (this.phase === "FINISHED") {
      if (this.eventQueue.length < 240) this.eventQueue.push({ ...evt });
      this.onEvent("event_queued", { type: evt.type || evt.kind || "chat", queueLength: this.eventQueue.length });
      return { queued: true, queueLength: this.eventQueue.length };
    }
    this.eventsProcessed += 1;
    const user = normalizeUser(evt);
    const team = this._teamForEvent(evt, this._viewerOrdinal % 2 ? "B" : "A");
    const marble = this.joinViewer({ ...user, team });
    const type = String(evt.type || evt.kind || "chat").toLowerCase();

    if (type === "gift" || type === "superchat" || evt.giftTier) {
      const coins = Math.max(1, Number(evt.giftValue ?? evt.coins ?? evt.diamonds ?? 1));
      const tier = GIFT_TIERS.has(evt.giftTier) ? evt.giftTier : coins >= 99 ? "crown" : coins >= 20 ? "meteor" : coins >= 10 ? "banana" : coins >= 5 ? "meat" : "rose";
      this.teamGiftCoins[team] += coins;
      this.teamScores[team] += coins;
      this._applyGift(team, marble, tier, coins, user.nickname);
      this.onEvent("pk_gift_scored", { team, coins, tier, nickname: user.nickname, teamScores: { ...this.teamScores } });
      return { type: "gift", team, coins, tier, marble };
    }

    if (type === "like" || type === "join" || type === "follow" || type === "share") {
      if (marble) marble.boostTimer = Math.max(marble.boostTimer, 0.45);
      return { type, team, marble };
    }

    if (marble) marble.boostTimer = Math.max(marble.boostTimer, 0.7);
    return { type: "chat", team, marble };
  }

  _applyGift(team, marble, tier, coins, nickname) {
    const opponent = team === "A" ? "B" : "A";
    if (marble) {
      marble.boostTimer = Math.max(marble.boostTimer, tier === "crown" ? 5.5 : tier === "meteor" ? 2.8 : 1.1);
    }
    if (tier === "meat" || tier === "meteor" || tier === "crown") {
      for (const candidate of this.marbles) {
        if (candidate.team === team) candidate.boostTimer = Math.max(candidate.boostTimer, tier === "crown" ? 3.2 : 1.4);
      }
    }
    if (tier === "banana" || tier === "meteor" || tier === "crown") {
      this.spawnObstacle(tier === "banana" ? "split_gate" : tier === "meteor" ? "falling_rock" : "vortex", opponent, nickname, team, coins);
    }
    if (tier === "crown") {
      this.spawnObstacle("falling_rock", opponent, nickname, team, coins);
      this.spawnObstacle("split_gate", opponent, nickname, team, coins);
    }
  }

  spawnObstacle(type = "falling_rock", targetTeam = null, source = "SYSTEM", sourceTeam = "SYSTEM", coins = 0) {
    const safeType = OBSTACLE_TYPES.includes(type) ? type : "falling_rock";
    const candidates = this.marbles.filter((marble) => !targetTeam || marble.team === targetTeam);
    const leader = candidates.sort((a, b) => b.progress - a.progress)[0];
    const progress = clamp((leader?.progress || 0.25) + 0.035, 0.08, 0.92);
    const obstacle = {
      id: `pk_${this.heatNumber}_${this._obstacleOrdinal++}`,
      progress,
      type: safeType,
      targetTeam: targetTeam ? cleanTeam(targetTeam) : null,
      active: true,
      ttl: 18,
      hitBy: new Set(),
      source,
      sourceTeam,
      coins,
    };
    this.obstacles.push(obstacle);
    if (this.obstacles.length > 28) this.obstacles.splice(0, this.obstacles.length - 28);
    this.onEvent("physics_obstacle_spawned", {
      id: obstacle.id,
      type: obstacle.type,
      targetTeam: obstacle.targetTeam,
      sourceTeam,
      source,
      coins,
    });
    return obstacle;
  }

  _applyObstacle(marble, obstacle) {
    if (!obstacle.active || obstacle.hitBy.has(marble.id)) return;
    if (obstacle.targetTeam && obstacle.targetTeam !== marble.team) return;
    if (Math.abs(marble.progress - obstacle.progress) > 0.007) return;
    obstacle.hitBy.add(marble.id);
    marble.hitCount += 1;
    if (obstacle.type === "vortex") {
      marble.slowTimer = Math.max(marble.slowTimer, 2.4);
      marble.lateral += 0.11 * (hashSeed(marble.id) % 2 ? 1 : -1);
    } else if (obstacle.type === "split_gate") {
      marble.slowTimer = Math.max(marble.slowTimer, 1.5);
      marble.lateral *= -0.8;
    } else {
      marble.stunTimer = Math.max(marble.stunTimer, 0.72);
    }
  }

  update(dtSec = 1 / 60) {
    const dt = clamp(Number(dtSec) || 1 / 60, 0.001, 0.2);
    if (this.phase === "LOBBY") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.startHeat();
      return;
    }
    if (this.phase === "COUNTDOWN") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = "RACING";
        this.phaseTimer = this.heatDurationSec;
        this.onEvent("race_started", this.getSnapshot());
      }
      return;
    }
    if (this.phase === "FINISHED") return;
    if (this.phase === "FINISHING") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.finishHeat();
    }

    this.heatElapsedSec += dt;
    this.phaseTimer -= dt;
    for (const obstacle of this.obstacles) {
      obstacle.ttl -= dt;
      if (obstacle.ttl <= 0) obstacle.active = false;
    }

    for (const marble of this.marbles) {
      if (marble.finished) continue;
      marble.boostTimer = Math.max(0, marble.boostTimer - dt);
      marble.slowTimer = Math.max(0, marble.slowTimer - dt);
      marble.stunTimer = Math.max(0, marble.stunTimer - dt);
      for (const obstacle of this.obstacles) this._applyObstacle(marble, obstacle);
      const wave = Math.sin((this.heatElapsedSec * 2.7) + (marble.raceSeed % 31)) * 0.0022;
      const boost = marble.boostTimer > 0 ? 0.037 : 0;
      const slow = marble.slowTimer > 0 ? 0.48 : 1;
      const stunned = marble.stunTimer > 0 ? 0.12 : 1;
      const finalSprint = marble.progress > 0.84 ? 1.12 : 1;
      marble.progress += (marble.baseSpeed + wave + boost) * slow * stunned * finalSprint * dt;
      marble.lateral += Math.sin(this.heatElapsedSec * 1.4 + (marble.raceSeed % 17)) * 0.00008;
      marble.lateral = clamp(marble.lateral, -0.38, 0.38);
      marble.trail.push(marble.progress);
      if (marble.trail.length > 8) marble.trail.shift();
      if (marble.progress >= 1) {
        marble.progress = 1;
        marble.finished = true;
        marble.finishRank = this.finishOrder.length + 1;
        this.finishOrder.push(marble.id);
        const placementPoints = Math.max(10, 120 - (marble.finishRank - 1) * 8);
        this.teamScores[marble.team] += placementPoints;
        if (this.finishOrder.length === 1) {
          this.phase = "FINISHING";
          this.phaseTimer = this.finishGraceSec;
        }
      }
    }

    if (this.phaseTimer <= 0 || this.heatElapsedSec >= this.heatDurationSec) {
      this.finishHeat();
    }
  }

  finishHeat() {
    if (this.phase === "FINISHED") return;
    this.phase = "FINISHED";
    this.phaseTimer = 0;
    const winner = this.finishOrder[0] ? this.marbleMap.get(this.finishOrder[0]) : this.getTopMarbles(1)[0] || null;
    const teamWinner = this.teamScores.A === this.teamScores.B ? "DRAW" : this.teamScores.A > this.teamScores.B ? "A" : "B";
    const summary = {
      heat: this.heatNumber,
      seed: this.seed,
      winner: winner ? this._publicMarble(winner) : null,
      teamWinner,
      teamScores: { ...this.teamScores },
      finishOrder: this.finishOrder.slice(),
      obstacleCount: this.obstacles.filter((obstacle) => obstacle.sourceTeam !== "SYSTEM").length,
    };
    this.onEvent("heat_finished", summary);
    return summary;
  }

  getTopMarbles(limit = 8) {
    return [...this.marbles]
      .sort((a, b) => {
        if (a.finished && b.finished) return a.finishRank - b.finishRank;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      })
      .slice(0, limit);
  }

  getSnapshot() {
    return {
      phase: this.phase,
      heat: this.heatNumber,
      seed: this.seed,
      seedValue: this.seedValue,
      phaseTimer: Number(this.phaseTimer.toFixed(2)),
      heatElapsedSec: Number(this.heatElapsedSec.toFixed(2)),
      marbleCount: this.marbles.length,
      viewerCount: this.marbles.filter((marble) => !marble.isBot).length,
      eventsProcessed: this.eventsProcessed,
      queuedEvents: this.eventQueue.length,
      teamScores: { ...this.teamScores },
      teamGiftCoins: { ...this.teamGiftCoins },
      obstacles: this.obstacles.filter((obstacle) => obstacle.active).map(({ hitBy, ...obstacle }) => obstacle),
      top: this.getTopMarbles(8).map((marble) => this._publicMarble(marble)),
    };
  }
}
