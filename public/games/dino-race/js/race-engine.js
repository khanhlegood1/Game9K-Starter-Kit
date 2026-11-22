/**
 * race-engine.js
 * Pure deterministic Physics + 24/7 KOL Live Stream State Machine for Jurassic Sanctuary Sprint.
 *
 * ZERO DOM / Canvas dependencies — runs identically in Browser 60 FPS and Node.js unit tests!
 *
 * Supports 3 Play Modes:
 * - `SOLO`            : Player-controlled dinosaur (WASD/Arrows/Touch + SPACE Roar) vs 3 AI rivals
 * - `KOL_DERBY`       : 4-Team 24/7 Automated KOL Stream Loop (Chat 1-4 + TikTok Gifts + YouTube SuperChats)
 * - `VIEWER_STAMPEDE` : Marble-Race-style Viewer Avatar Stampede (up to 24 viewer-owned dinos + Elimination!)
 */

import { SPECIES, MAPS, buildCatmullRomTrack } from "./config.js";

export class DinoRaceEngine {
  constructor(options = {}) {
    this.playMode = options.playMode || "SOLO"; // 'SOLO' | 'KOL_DERBY' | 'VIEWER_STAMPEDE'
    this.eliminationMode = Boolean(options.eliminationMode);
    this.selectedSpeciesIdx = options.selectedSpeciesIdx ?? 0;
    this.mapIndex = options.mapIndex ?? 0;

    this.gameState = "MENU"; // 'MENU' | 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'FINISHED'
    this.lobbyDuration = options.lobbyDuration ?? 9.0;
    this.countdownDuration = options.countdownDuration ?? 3.0;
    this.finishCooldownDuration = options.finishCooldownDuration ?? 6.5;

    this.phaseTimer = 0;
    this.raceElapsed = 0;
    this.roundNumber = 1;
    this.screenShake = 0;

    this.racers = [];
    this.survivorPool = []; // Used across Elimination rounds in VIEWER_STAMPEDE
    this.goats = [];
    this.traps = []; // Slippery banana/tar traps on track
    this.particles = [];
    this.floatingCallouts = [];
    this.queuedGifts = []; // Gifts sent between races fire right after next start!

    /** @type {Map<string, {user: string, platform: string, avatar: string, coins: number, cheers: number, lane: number}>} */
    this.supporters = new Map();
    this.activeViewers = new Set();

    this.callbacks = {
      onSound: options.onSound || (() => {}),
      onFeedLog: options.onFeedLog || (() => {}),
      onRaceStart: options.onRaceStart || (() => {}),
      onRaceFinish: options.onRaceFinish || (() => {}),
    };

    this._loadMap(this.mapIndex);
  }

  _loadMap(idx) {
    const safeIdx = ((idx % MAPS.length) + MAPS.length) % MAPS.length;
    this.mapIndex = safeIdx;
    this.map = MAPS[safeIdx];
    this.trackPoints = buildCatmullRomTrack(this.map.waypoints, 28);
    this.totalLaps = this.map.laps || 3;
  }

  setMap(idx) {
    this._loadMap(idx);
    if (this.gameState !== "MENU") {
      this.startNewRound(true);
    }
  }

  setPlayMode(mode, { elimination = false } = {}) {
    this.playMode = mode;
    this.eliminationMode = Boolean(elimination);
    this.survivorPool = [];
    this.roundNumber = 1;
  }

  // ==========================================================================
  // ROUND INITIALIZATION & SPAWNING
  // ==========================================================================

  startNewRound(resetTournament = false) {
    if (resetTournament) {
      this.survivorPool = [];
      this.roundNumber = 1;
      this.supporters.clear();
    }

    this.traps = [];
    this.particles = [];
    this.floatingCallouts = [];
    this.raceElapsed = 0;
    this.spawnGoats(false);

    if (this.playMode === "VIEWER_STAMPEDE") {
      if (this.eliminationMode && this.survivorPool.length > 1) {
        // Carry surviving viewer dinos into next Elimination heat!
        this.racers = this.survivorPool.map((prev, idx) =>
          this._createRacer({
            slotIndex: idx,
            speciesIdx: prev.species.id,
            isPlayer: false,
            ownerName: prev.ownerName,
            ownerId: prev.ownerId,
            ownerAvatar: prev.ownerAvatar,
            ownerPlatform: prev.ownerPlatform,
          })
        );
        this.gameState = "COUNTDOWN";
        this.phaseTimer = this.countdownDuration;
      } else {
        // Open Lobby so TikTok & YouTube viewers can comment/like to drop their Dino in!
        this.racers = [];
        this.roundNumber = 1;
        this.gameState = "LOBBY";
        this.phaseTimer = this.lobbyDuration;
      }
      return;
    }

    // SOLO or KOL_DERBY (4 lanes)
    const lineup =
      this.playMode === "KOL_DERBY"
        ? [0, 1, 2, 3]
        : [
            this.selectedSpeciesIdx,
            ...[0, 1, 2, 3].filter((i) => i !== this.selectedSpeciesIdx),
          ];

    this.racers = lineup.map((spIdx, gridPos) =>
      this._createRacer({
        slotIndex: gridPos,
        speciesIdx: spIdx,
        isPlayer: this.playMode === "SOLO" && gridPos === 0,
      })
    );

    this.gameState = "COUNTDOWN";
    this.phaseTimer = this.countdownDuration;
  }

  _createRacer({
    slotIndex,
    speciesIdx,
    isPlayer = false,
    ownerName = "",
    ownerId = "",
    ownerAvatar = "",
    ownerPlatform = "tiktok",
  }) {
    const sp = SPECIES[speciesIdx % SPECIES.length];
    const p0 = this.trackPoints[0];
    const p1 = this.trackPoints[1];
    const startAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    const cols = this.playMode === "VIEWER_STAMPEDE" ? 4 : 2;
    const row = Math.floor(slotIndex / cols);
    const col = slotIndex % cols;
    const centeredCol = col - (cols - 1) / 2;

    const backDist = -32 - row * 44;
    const sideDist = centeredCol * 32;

    const rx = p0.x + Math.cos(startAngle) * backDist - Math.sin(startAngle) * sideDist;
    const ry = p0.y + Math.sin(startAngle) * backDist + Math.cos(startAngle) * sideDist;

    return {
      slotIndex,
      laneIndex: slotIndex,
      isPlayer,
      species: sp,
      ownerName,
      ownerId,
      ownerAvatar,
      ownerPlatform,
      lastSupporter: ownerName || "",
      lastPlatform: ownerPlatform,
      x: rx,
      y: ry,
      angle: startAngle,
      speed: 0,
      boost: sp.maxBoost * 0.78,
      isBoosting: false,
      surgeTimer: 0,
      stunTimer: 0,
      slipTimer: 0,
      mudImmuneTimer: 0,
      kingTimer: 0,
      lap: 1,
      waypointIdx: 1,
      totalProgress: 0,
      finished: false,
      finishTime: 0,
      eliminated: false,
      goatsEaten: 0,
      stridePhase: slotIndex * 1.3,
      aiSkill: 0.91 + (slotIndex % 5) * 0.016,
      aiTargetOffset: centeredCol * 20,
      dramaTimer: 2.0 + (slotIndex % 4) * 0.85,
    };
  }

  spawnGoats(goldenBonus = false) {
    if (!goldenBonus) this.goats = [];
    const count = goldenBonus ? 12 : 10;
    const step = Math.max(1, Math.floor(this.trackPoints.length / count));
    for (let i = 1; i < count; i++) {
      const pt = this.trackPoints[(i * step) % this.trackPoints.length];
      const offsetAngle = (i % 2 === 0 ? 1 : -1) * 1.35 + (goldenBonus ? 0.5 : 0);
      const offsetDist = goldenBonus ? 18 : 34;
      this.goats.push({
        x: pt.x + Math.cos(offsetAngle) * offsetDist,
        y: pt.y + Math.sin(offsetAngle) * offsetDist,
        golden: goldenBonus,
        active: true,
        respawnTimer: 0,
        hopPhase: i * 0.85,
      });
    }
  }

  _ensureStampedeMinimumField() {
    const botGuardians = [
      "Ranger_Rex",
      "Coast_Alpha",
      "Amber_Scout",
      "Delta_Claw",
      "Lagoon_Fang",
      "Jungle_Dash",
    ];
    let idx = 0;
    while (this.racers.length < 6) {
      const name = botGuardians[idx % botGuardians.length];
      this.racers.push(
        this._createRacer({
          slotIndex: this.racers.length,
          speciesIdx: this.racers.length % SPECIES.length,
          ownerName: name,
          ownerId: `bot_${idx}`,
          ownerPlatform: idx % 2 === 0 ? "tiktok" : "youtube",
        })
      );
      idx++;
    }
  }

  // ==========================================================================
  // STREAM INTERACTION: CHAT, GIFTS, SUPERCHATS, LIKES & GIFT QUEUE
  // ==========================================================================

  addFloatingCallout(x, y, text, color = "#fbbf24") {
    this.floatingCallouts.push({ x, y, text, color, life: 1.45, maxLife: 1.45 });
    if (this.floatingCallouts.length > 40) this.floatingCallouts.shift();
  }

  _recordSupporter(userObj, coins, cheers, laneIdx) {
    const uid = userObj.uniqueId || userObj.nickname || "viewer";
    const nickname = userObj.nickname || uid;
    const platform = userObj.platform || "tiktok";
    const avatar = userObj.profilePictureUrl || "";

    const prev = this.supporters.get(uid) || {
      user: nickname,
      platform,
      avatar,
      coins: 0,
      cheers: 0,
      lane: laneIdx ?? 0,
    };
    prev.user = nickname;
    prev.platform = platform;
    if (avatar) prev.avatar = avatar;
    prev.coins += coins;
    prev.cheers += cheers;
    if (typeof laneIdx === "number" && laneIdx >= 0) prev.lane = laneIdx;

    this.supporters.set(uid, prev);
    this.activeViewers.add(uid);
  }

  /**
   * Spawn or locate a viewer's personal dinosaur in `VIEWER_STAMPEDE` mode.
   */
  _findOrSpawnViewerRacer(userObj, preferredSpeciesIdx = null) {
    const uid = userObj.uniqueId || userObj.nickname;
    const existing = this.racers.find((r) => r.ownerId === uid);
    if (existing) return existing;

    // Allow joining in LOBBY, COUNTDOWN, or early first lap (up to 24 racers max)
    const canJoinNow =
      this.racers.length < 24 &&
      (this.gameState === "LOBBY" ||
        this.gameState === "COUNTDOWN" ||
        (this.gameState === "RACING" && this.raceElapsed < 12));

    if (!canJoinNow) {
      // Fall back to last-place racer so late viewer's boost still helps an underdog!
      if (this.racers.length === 0) return null;
      const sorted = this.getSortedStandings();
      return sorted[sorted.length - 1];
    }

    const spIdx =
      typeof preferredSpeciesIdx === "number" && preferredSpeciesIdx >= 0
        ? preferredSpeciesIdx % SPECIES.length
        : this.racers.length % SPECIES.length;

    const racer = this._createRacer({
      slotIndex: this.racers.length,
      speciesIdx: spIdx,
      ownerName: userObj.nickname || uid,
      ownerId: uid,
      ownerAvatar: userObj.profilePictureUrl || "",
      ownerPlatform: userObj.platform || "tiktok",
    });

    this.racers.push(racer);
    const pBadge = racer.ownerPlatform === "youtube" ? "▶️" : "🎵";
    this.addFloatingCallout(
      racer.x,
      racer.y - 30,
      `${pBadge} ${racer.ownerName} THAM CHIẾN!`,
      racer.species.accent
    );

    // Start early if lobby reaches max capacity (24 dinos)
    if (this.gameState === "LOBBY" && this.racers.length >= 24) {
      this.gameState = "COUNTDOWN";
      this.phaseTimer = this.countdownDuration;
    }

    return racer;
  }

  /**
   * Process a normalized stream event (`chat`, `gift`, `like`, `share`, `follow`, `join`).
   */
  applyStreamEvent(evt) {
    if (!evt || typeof evt !== "object") return;
    const platform = evt.platform || "tiktok";
    const pIcon = platform === "youtube" ? "▶️" : "🎵";
    const userObj =
      evt.user && typeof evt.user === "object"
        ? { ...evt.user, platform }
        : {
            uniqueId: String(evt.user || "viewer"),
            nickname: String(evt.user || "Khán Giả"),
            profilePictureUrl: evt.avatar || "",
            platform,
          };

    if (evt.type === "chat") {
      const lane = typeof evt.lane === "number" ? evt.lane : null;

      if (this.playMode === "VIEWER_STAMPEDE") {
        const racer = this._findOrSpawnViewerRacer(userObj, lane);
        if (racer) {
          racer.boost = Math.min(racer.species.maxBoost, racer.boost + 18);
          racer.surgeTimer = Math.max(racer.surgeTimer, 1.0);
          this._recordSupporter(userObj, 0, 1, racer.species.id);
          this.callbacks.onFeedLog(
            `<span>${pIcon}</span> <b class="text-white">${userObj.nickname}</b> cổ vũ <b>${racer.species.emoji}</b>`
          );
        }
        return;
      }

      if (lane !== null && this.racers[lane]) {
        const r = this.racers[lane];
        r.boost = Math.min(r.species.maxBoost, r.boost + 20);
        r.surgeTimer = Math.max(r.surgeTimer, 1.15);
        r.lastSupporter = userObj.nickname;
        r.lastPlatform = platform;
        if (userObj.profilePictureUrl) r.ownerAvatar = userObj.profilePictureUrl;

        this._recordSupporter(userObj, 0, 1, lane);
        this.addFloatingCallout(
          r.x,
          r.y - 32,
          `${pIcon} ${userObj.nickname}`,
          r.species.accent
        );
        this.callbacks.onFeedLog(
          `<span>${pIcon}</span> <b class="text-white">${userObj.nickname}</b> chọn <b>#${lane + 1} ${r.species.emoji}</b>`
        );
      }
      return;
    }

    if (evt.type === "like" || evt.type === "join" || evt.type === "follow" || evt.type === "share") {
      if (this.playMode === "VIEWER_STAMPEDE") {
        const racer = this._findOrSpawnViewerRacer(userObj, null);
        if (racer) {
          racer.boost = Math.min(racer.species.maxBoost, racer.boost + 10);
          this._recordSupporter(userObj, 0, 1, racer.species.id);
        }
      } else if (this.racers.length > 0) {
        const idx = Math.floor(Math.random() * this.racers.length);
        const r = this.racers[idx];
        r.boost = Math.min(r.species.maxBoost, r.boost + 10);
        this._recordSupporter(userObj, 0, 1, idx);
      }
      return;
    }

    if (evt.type === "gift") {
      const coins = Math.max(1, Number(evt.giftValue || evt.coins || 1));
      const tier = evt.giftTier || "rose";
      let targetLane =
        typeof evt.lane === "number" && evt.lane >= 0
          ? evt.lane % Math.max(1, this.racers.length)
          : 0;

      this._recordSupporter(userObj, coins, 1, targetLane);

      // Queue gift if race is not currently in RACING state so no supporter's gift is ever wasted!
      if (this.gameState !== "RACING") {
        this.queuedGifts.push({ evt, userObj, coins, tier, platform });
        this.callbacks.onFeedLog(
          `<span class="text-amber-300">[Hàng đợi 🎁]</span> <b>${userObj.nickname}</b> gửi <b>${evt.giftName || tier}</b> (kích hoạt ngay khi xuất phát!)`
        );
        return;
      }

      this._executeGiftPowerUp({ evt, userObj, coins, tier, platform });
    }
  }

  _executeGiftPowerUp({ evt, userObj, coins, tier, platform }) {
    const pIcon = platform === "youtube" ? "▶️" : "🎵";
    let targetRacer = null;

    if (this.playMode === "VIEWER_STAMPEDE") {
      targetRacer = this._findOrSpawnViewerRacer(userObj, evt.lane);
    } else {
      const laneIdx =
        typeof evt.lane === "number" && evt.lane >= 0 && evt.lane < this.racers.length
          ? evt.lane
          : 0;
      targetRacer = this.racers[laneIdx];
    }

    if (!targetRacer) return;

    targetRacer.lastSupporter = userObj.nickname;
    targetRacer.lastPlatform = platform;
    if (userObj.profilePictureUrl) targetRacer.ownerAvatar = userObj.profilePictureUrl;

    const standings = this.getSortedStandings();
    const leader = standings[0];

    if (tier === "rose") {
      targetRacer.boost = Math.min(
        targetRacer.species.maxBoost,
        targetRacer.boost + 45
      );
      targetRacer.surgeTimer = Math.max(targetRacer.surgeTimer, 2.0);
      this.addFloatingCallout(
        targetRacer.x,
        targetRacer.y - 36,
        `🌹 ${userObj.nickname} +NỘ KHÍ`,
        "#f472b6"
      );
      this.callbacks.onFeedLog(
        `<span class="text-pink-400">[🌹 ${coins}xu ${pIcon}]</span> <b>${userObj.nickname}</b> tăng tốc <b>${targetRacer.species.emoji}</b>`
      );
      this.callbacks.onSound("bite");
      return;
    }

    if (tier === "meat") {
      targetRacer.boost = targetRacer.species.maxBoost;
      targetRacer.surgeTimer = Math.max(targetRacer.surgeTimer, 3.0);
      targetRacer.mudImmuneTimer = Math.max(targetRacer.mudImmuneTimer, 4.5);
      this.addFloatingCallout(
        targetRacer.x,
        targetRacer.y - 38,
        `🥩 ${userObj.nickname} GẦM NITRO!`,
        "#fbbf24"
      );
      this.callbacks.onFeedLog(
        `<span class="text-amber-400">[🥩 ${coins}xu ${pIcon}]</span> <b>${userObj.nickname}</b> bơm Đùi Thịt Nitro cho <b>${targetRacer.species.emoji}</b>!`
      );
      this.callbacks.onSound("roar");
      this.screenShake = Math.max(this.screenShake, 6);
      return;
    }

    if (tier === "banana") {
      // Smart Sabotage: if targetRacer is behind, drop trap right in front of #1 Leader!
      // If targetRacer IS #1 Leader, drop trap behind #1 Leader to trip #2!
      const victim = leader && leader !== targetRacer ? leader : standings[1] || leader;
      if (victim) {
        const aheadSign = victim === targetRacer ? -1 : 1;
        const dropDist = aheadSign * 64;
        const trapX = victim.x + Math.cos(victim.angle) * dropDist;
        const trapY = victim.y + Math.sin(victim.angle) * dropDist;
        this.traps.push({
          x: trapX,
          y: trapY,
          ownerRacer: targetRacer,
          ttl: 14.0,
        });
        this.addFloatingCallout(trapX, trapY - 24, `🍌 BẪY TRƯỢT!`, "#facc15");
      }
      targetRacer.surgeTimer = Math.max(targetRacer.surgeTimer, 1.8);
      this.callbacks.onFeedLog(
        `<span class="text-yellow-300">[🍌 ${coins}xu ${pIcon}]</span> <b>${userObj.nickname}</b> rải Bẫy Bùn Chuối chặn đầu đối thủ!`
      );
      this.callbacks.onSound("slip");
      return;
    }

    if (tier === "meteor") {
      // Meteor Shell locks onto #1 Leader (or all rivals ahead of targetRacer!)
      let hitCount = 0;
      for (const other of standings) {
        if (other !== targetRacer && hitCount < 2) {
          other.stunTimer = Math.max(other.stunTimer, 1.7);
          other.speed *= 0.35;
          this.addFloatingCallout(other.x, other.y - 32, `☄️ CHOÁNG!`, "#c084fc");
          hitCount++;
        }
      }
      targetRacer.surgeTimer = Math.max(targetRacer.surgeTimer, 2.5);
      this.addFloatingCallout(
        targetRacer.x,
        targetRacer.y - 42,
        `☄️ ${userObj.nickname} THIÊN THẠCH!`,
        "#e879f9"
      );
      this.callbacks.onFeedLog(
        `<span class="text-purple-400">[☄️ ${coins}xu ${pIcon}]</span> <b>${userObj.nickname}</b> giáng Thiên Thạch hạ gục Top đầu!`
      );
      this.callbacks.onSound("meteor");
      this.screenShake = Math.max(this.screenShake, 12);
      return;
    }

    // `crown` (99+ xu): Golden King Aura + Chaos + Golden Goat Rain!
    targetRacer.boost = targetRacer.species.maxBoost;
    targetRacer.surgeTimer = Math.max(targetRacer.surgeTimer, 4.5);
    targetRacer.kingTimer = Math.max(targetRacer.kingTimer, 5.0);
    targetRacer.mudImmuneTimer = Math.max(targetRacer.mudImmuneTimer, 6.0);
    this.spawnGoats(true);

    for (const other of this.racers) {
      if (other !== targetRacer) {
        other.stunTimer = Math.max(other.stunTimer, 0.9);
      }
    }

    this.addFloatingCallout(
      targetRacer.x,
      targetRacer.y - 48,
      `👑 ${userObj.nickname} CHÚA TỂ KHU BẢO TỒN!`,
      "#fde047"
    );
    this.callbacks.onFeedLog(
      `<span class="text-yellow-300 font-bold">[👑 ${coins}xu ${pIcon}]</span> <b>${userObj.nickname}</b> triệu hồi VƯƠNG MIỆN & MƯA DÊ VÀNG cho <b>${targetRacer.species.emoji}</b>!`
    );
    this.callbacks.onSound("fanfare_grand");
    this.screenShake = Math.max(this.screenShake, 16);
  }

  // ==========================================================================
  // SIMULATION STEP (`step(dt, playerInput)`)
  // ==========================================================================

  _findNearestTrackIndex(x, y, hintIdx) {
    const len = this.trackPoints.length;
    let bestIdx = hintIdx;
    let bestDist = Infinity;
    for (let offset = -18; offset <= 24; offset++) {
      const idx = (hintIdx + offset + len) % len;
      const d = Math.hypot(x - this.trackPoints[idx].x, y - this.trackPoints[idx].y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }
    return { idx: bestIdx, dist: bestDist };
  }

  step(dt, input = {}) {
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - 30 * dt);
    }

    for (let i = this.floatingCallouts.length - 1; i >= 0; i--) {
      const fc = this.floatingCallouts[i];
      fc.y -= 26 * dt;
      fc.life -= dt;
      if (fc.life <= 0) this.floatingCallouts.splice(i, 1);
    }

    // 1. LOBBY phase (Viewer Stampede)
    if (this.gameState === "LOBBY") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this._ensureStampedeMinimumField();
        this.gameState = "COUNTDOWN";
        this.phaseTimer = this.countdownDuration;
      }
      return;
    }

    // 2. COUNTDOWN phase
    if (this.gameState === "COUNTDOWN") {
      const prevSec = Math.ceil(this.phaseTimer);
      this.phaseTimer -= dt;
      const curSec = Math.ceil(this.phaseTimer);
      if (curSec < prevSec && curSec > 0) {
        this.callbacks.onSound("beep_low");
      }
      if (this.phaseTimer <= 0) {
        this.callbacks.onSound("beep_high");
        this.gameState = "RACING";
        this.callbacks.onRaceStart({
          playMode: this.playMode,
          mapId: this.map.id,
          racerCount: this.racers.length,
          roundNumber: this.roundNumber,
        });
      }
      return;
    }

    // 3. FINISHED / Auto-Restart Cooldown phase
    if (this.gameState === "FINISHED") {
      if (this.playMode !== "SOLO" && this.phaseTimer > 0) {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.startNewRound(false);
        }
      }
      return;
    }

    if (this.gameState !== "RACING") return;

    const prevElapsed = this.raceElapsed;
    this.raceElapsed += dt;

    // Flush queued between-race gifts 0.5s after gate opens!
    if (prevElapsed < 0.5 && this.raceElapsed >= 0.5 && this.queuedGifts.length > 0) {
      const pending = this.queuedGifts.splice(0, this.queuedGifts.length);
      for (const item of pending) {
        this._executeGiftPowerUp(item);
      }
    }

    // Update Prey Goats
    for (const g of this.goats) {
      if (!g.active) {
        g.respawnTimer -= dt;
        if (g.respawnTimer <= 0 && !g.golden) g.active = true;
      } else {
        g.hopPhase += dt * 5.2;
      }
    }

    // Update Banana / Tar Traps
    for (let i = this.traps.length - 1; i >= 0; i--) {
      this.traps[i].ttl -= dt;
      if (this.traps[i].ttl <= 0) this.traps.splice(i, 1);
    }

    const maxProgress =
      this.racers.length > 0
        ? Math.max(...this.racers.map((r) => r.totalProgress))
        : 0;

    // Update each Dinosaur Racer
    for (const r of this.racers) {
      const sp = r.species;
      let throttle = 0;
      let steer = 0;
      let wantBoost = false;

      if (r.surgeTimer > 0) r.surgeTimer = Math.max(0, r.surgeTimer - dt);
      if (r.stunTimer > 0) r.stunTimer = Math.max(0, r.stunTimer - dt);
      if (r.slipTimer > 0) r.slipTimer = Math.max(0, r.slipTimer - dt);
      if (r.mudImmuneTimer > 0) r.mudImmuneTimer = Math.max(0, r.mudImmuneTimer - dt);
      if (r.kingTimer > 0) r.kingTimer = Math.max(0, r.kingTimer - dt);

      if (r.isPlayer && !r.finished) {
        if (input.up) throttle = 1;
        if (input.down) throttle = -0.5;
        if (input.left) steer -= 1;
        if (input.right) steer += 1;
        if (input.boost || r.surgeTimer > 0) wantBoost = true;
      } else {
        // AI & Rubber-banding comeback surges (inspired by qafaraz/Horse-Race)
        r.dramaTimer -= dt;
        if (r.dramaTimer <= 0) {
          r.dramaTimer = 2.1 + Math.random() * 3.2;
          const behindGap = maxProgress - r.totalProgress;
          const finalLapBonus = r.lap >= this.totalLaps ? sp.clutchBonus : 1.0;
          if (behindGap > 32 && Math.random() < 0.62 * finalLapBonus) {
            r.surgeTimer = Math.max(r.surgeTimer, 1.45);
          }
        }

        const lookAhead = 12;
        const targetIdx = (r.waypointIdx + lookAhead) % this.trackPoints.length;
        const targetPt = this.trackPoints[targetIdx];
        const tx = targetPt.x + Math.cos(r.angle + Math.PI / 2) * r.aiTargetOffset;
        const ty = targetPt.y + Math.sin(r.angle + Math.PI / 2) * r.aiTargetOffset;

        const desiredAngle = Math.atan2(ty - r.y, tx - r.x);
        let diff = desiredAngle - r.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        steer = Math.max(-1, Math.min(1, diff * 2.7));
        throttle = r.finished ? 0.42 : r.aiSkill;
        if (!r.finished && ((r.boost > 68 && Math.abs(diff) < 0.22) || r.surgeTimer > 0)) {
          wantBoost = true;
        }
      }

      // Swamp slowdown check
      let inSwamp = false;
      for (const sw of this.map.swamps) {
        if (Math.hypot(r.x - sw.x, r.y - sw.y) < sw.r) {
          inSwamp = true;
          break;
        }
      }

      const trackInfo = this._findNearestTrackIndex(r.x, r.y, r.waypointIdx);
      const offRoad = trackInfo.dist > this.map.trackWidth * 0.52;

      // Boost / Stun / Slip state
      if (r.stunTimer > 0 || r.slipTimer > 0) {
        r.isBoosting = false;
      } else if ((wantBoost && r.boost > 5 && throttle > 0) || r.surgeTimer > 0) {
        if (!r.isBoosting && r.isPlayer) this.callbacks.onSound("roar");
        r.isBoosting = true;
        if (r.surgeTimer <= 0) {
          r.boost = Math.max(0, r.boost - 32 * dt);
        }
      } else {
        r.isBoosting = false;
        r.boost = Math.min(sp.maxBoost, r.boost + 6.8 * dt);
      }

      let effectiveMax = sp.maxSpeed;
      if (r.lap >= this.totalLaps) effectiveMax *= sp.clutchBonus;
      if (inSwamp && r.mudImmuneTimer <= 0) effectiveMax *= sp.swampPenalty;
      if (offRoad && r.mudImmuneTimer <= 0) effectiveMax *= 0.68;
      if (r.isBoosting) {
        effectiveMax *= r.kingTimer > 0 ? 1.52 : r.surgeTimer > 0 ? 1.42 : 1.34;
      }
      if (r.stunTimer > 0) effectiveMax *= 0.38;
      if (r.slipTimer > 0) effectiveMax *= 0.52;

      if (throttle > 0) {
        r.speed += sp.accel * throttle * (r.isBoosting ? 1.45 : 1.0) * dt;
      } else if (throttle < 0) {
        r.speed += sp.accel * throttle * dt;
      } else {
        r.speed *= Math.pow(0.18, dt);
      }

      if (r.speed > effectiveMax) {
        r.speed += (effectiveMax - r.speed) * 6 * dt;
      }
      if (r.speed < -110) r.speed = -110;

      if (r.slipTimer > 0) {
        // Spin wobble when slipping on Banana/Tar trap!
        r.angle += 7.5 * dt;
      } else {
        const steerFactor = Math.min(1, Math.abs(r.speed) / 90);
        r.angle += steer * sp.turnSpeed * steerFactor * (r.speed >= 0 ? 1 : -1) * dt;
      }

      r.x += Math.cos(r.angle) * r.speed * dt;
      r.y += Math.sin(r.angle) * r.speed * dt;
      r.stridePhase += (Math.abs(r.speed) / 36) * dt;

      // Particles
      if (Math.abs(r.speed) > 80 && this.particles.length < 180 && Math.random() < 0.42) {
        const pColor =
          r.kingTimer > 0
            ? "rgba(253, 224, 71, 0.85)"
            : r.stunTimer > 0
            ? "rgba(192, 132, 252, 0.75)"
            : inSwamp
            ? "rgba(45, 212, 191, 0.58)"
            : r.isBoosting
            ? "rgba(251, 191, 36, 0.72)"
            : "rgba(180, 140, 100, 0.34)";
        this.particles.push({
          x: r.x - Math.cos(r.angle) * 18,
          y: r.y - Math.sin(r.angle) * 18,
          color: pColor,
          size: r.isBoosting ? 6.5 : 4,
          vx: (Math.random() - 0.5) * 32,
          vy: (Math.random() - 0.5) * 32,
          life: 0.34,
          maxLife: 0.34,
        });
      }

      // Prey Goat Pickup
      for (const g of this.goats) {
        if (g.active && Math.hypot(r.x - g.x, r.y - g.y) < 34) {
          g.active = false;
          g.respawnTimer = 7.5;
          const gain = g.golden ? 80 : 45;
          r.boost = Math.min(sp.maxBoost, r.boost + gain);
          if (g.golden) r.surgeTimer = Math.max(r.surgeTimer, 1.5);
          r.goatsEaten++;
          if (r.isPlayer) this.callbacks.onSound("bite");
        }
      }

      // Banana / Tar Trap collision
      for (let ti = this.traps.length - 1; ti >= 0; ti--) {
        const tr = this.traps[ti];
        if (
          tr.ownerRacer !== r &&
          r.kingTimer <= 0 &&
          Math.hypot(r.x - tr.x, r.y - tr.y) < 30
        ) {
          this.traps.splice(ti, 1);
          r.slipTimer = 1.25;
          r.speed *= 0.45;
          this.addFloatingCallout(r.x, r.y - 30, `🍌 TRƯỢT VỎ CHUỐI!`, "#facc15");
          this.callbacks.onSound("slip");
        }
      }

      // Lap & Finish Detection
      const prevIdx = r.waypointIdx;
      const newIdx = trackInfo.idx;
      const totalPts = this.trackPoints.length;

      if (prevIdx > totalPts * 0.8 && newIdx < totalPts * 0.2) {
        r.lap++;
        if (r.lap > this.totalLaps && !r.finished) {
          r.finished = true;
          r.finishTime = this.raceElapsed;
          if (this.playMode === "SOLO" && r.isPlayer) {
            this._completeRound();
            return;
          } else if (this.playMode !== "SOLO") {
            this._completeRound();
            return;
          }
        }
      } else if (prevIdx < totalPts * 0.2 && newIdx > totalPts * 0.8) {
        r.lap = Math.max(1, r.lap - 1);
      }

      r.waypointIdx = newIdx;
      r.totalProgress = (r.lap - 1) * totalPts + newIdx;
    }

    // Dinosaur body-check collisions
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minSep = this.playMode === "VIEWER_STAMPEDE" ? 26 : 34;
        if (dist > 0 && dist < minSep) {
          const overlap = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _completeRound() {
    if (this.gameState === "FINISHED") return;
    this.gameState = "FINISHED";
    this.phaseTimer = this.finishCooldownDuration;
    this.callbacks.onSound("fanfare_grand");

    const standings = this.getSortedStandings();
    let eliminatedThisRound = [];
    let tournamentChampion = null;

    if (this.playMode === "VIEWER_STAMPEDE" && this.eliminationMode) {
      if (standings.length > 2) {
        const dropCount = Math.max(1, Math.ceil(standings.length * 0.25));
        const keepCount = Math.max(1, standings.length - dropCount);
        this.survivorPool = standings.slice(0, keepCount);
        eliminatedThisRound = standings.slice(keepCount);
        eliminatedThisRound.forEach((r) => {
          r.eliminated = true;
        });
        this.roundNumber += 1;
      } else {
        tournamentChampion = standings[0] || null;
        this.survivorPool = [];
        this.roundNumber = 1;
      }
    }

    const topSupporters = this.getTopSupporters(3);

    this.callbacks.onRaceFinish({
      playMode: this.playMode,
      eliminationMode: this.eliminationMode,
      standings,
      winner: standings[0] || null,
      tournamentChampion,
      eliminatedThisRound,
      topSupporters,
      elapsedSec: Number(this.raceElapsed.toFixed(2)),
      viewerCount: this.activeViewers.size,
    });
  }

  getSortedStandings() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
  }

  getTopSupporters(limit = 3) {
    return [...this.supporters.values()]
      .sort((a, b) => b.coins * 12 + b.cheers - (a.coins * 12 + a.cheers))
      .slice(0, limit);
  }
}
