/**
 * Deterministic 60 FPS Co-op Boss Raid Engine (`cyber-boss-raid`)
 * Pure ES module — runs identically in Browser, Single-File Standalone & Node.js Tests.
 */

export const SQUAD_CLASSES = [
  {
    lane: 1,
    id: "striker",
    name: "Vanguard Striker",
    icon: "⚔️",
    color: "#f43f5e",
    baseDps: 85,
    shieldMult: 1.0,
    critChance: 0.28,
  },
  {
    lane: 2,
    id: "guardian",
    name: "Aegis Guardian",
    icon: "🛡️",
    color: "#38bdf8",
    baseDps: 55,
    shieldMult: 2.6,
    critChance: 0.12,
  },
  {
    lane: 3,
    id: "sniper",
    name: "Plasma Sniper",
    icon: "⚡",
    color: "#facc15",
    baseDps: 105,
    shieldMult: 1.2,
    critChance: 0.35,
  },
  {
    lane: 4,
    id: "medic",
    name: "Nano Medic",
    icon: "💖",
    color: "#34d399",
    baseDps: 48,
    shieldMult: 1.0,
    critChance: 0.15,
    healPerSec: 22,
  },
];

export class RaidEngine {
  constructor(options = {}) {
    this.bossLevel = options.bossLevel || 1;
    this.autoLoop = options.autoLoop !== false;
    this.onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    this.resetRaid(this.bossLevel);
  }

  resetRaid(level = 1) {
    this.bossLevel = Math.max(1, level);
    this.phase = "COUNTDOWN"; // COUNTDOWN | RAIDING | VICTORY | DEFEAT
    this.countdownSec = 3.0;
    this.intermissionSec = 0;
    this.elapsedRaidSec = 0;
    this.raidTimeLimitSec = 95;
    this.eventsProcessed = 0;

    const maxHp = 12_000 + (this.bossLevel - 1) * 4_500;
    const maxShield = 2_800 + (this.bossLevel - 1) * 900;

    this.boss = {
      name: `OMEGA-KAIJU MK-${this.bossLevel}`,
      maxHp,
      hp: maxHp,
      maxShield,
      shield: maxShield,
      stage: 1, // 1 (Shielded) -> 2 (Laser Sweep) -> 3 (Berserk)
      stunSec: 0,
      vulnerableSec: 0,
      laserChargeSec: 0,
      attackCooldownSec: 5.5,
      flashTimer: 0,
    };

    this.squad = {
      maxHp: 1_500,
      hp: 1_500,
      barrier: 250,
      overclockSec: 0,
      units: SQUAD_CLASSES.map((cls) => ({
        ...cls,
        supporters: 1,
        damageDealt: 0,
        cooldown: 0.4,
      })),
    };

    // Viewer MVP leaderboard: nickname -> { nickname, lane, damage, gifts }
    this.mvpMap = new Map();
    this.floatingTexts = [];
    this.projectiles = [];
    this.shakeTimer = 0;
  }

  startImmediate() {
    this.phase = "RAIDING";
    this.countdownSec = 0;
    this.onEvent("raid_started", { bossName: this.boss.name, bossLevel: this.bossLevel });
  }

  _recordMvp(nickname, lane, damage = 0, giftCount = 0) {
    const clean = String(nickname || "Explorer").slice(0, 22);
    let rec = this.mvpMap.get(clean);
    if (!rec) {
      rec = { nickname: clean, lane: lane || 1, damage: 0, gifts: 0 };
      this.mvpMap.set(clean, rec);
    }
    if (lane >= 1 && lane <= 4) rec.lane = lane;
    rec.damage += Math.round(damage);
    rec.gifts += giftCount;
    return rec;
  }

  _spawnText(text, color = "#fde047", isCrit = false) {
    this.floatingTexts.push({
      text,
      color,
      isCrit,
      xOffset: ((this.eventsProcessed * 37) % 160) - 80,
      yOffset: ((this.eventsProcessed * 23) % 70) - 35,
      ttl: 1.1,
    });
    if (this.floatingTexts.length > 28) this.floatingTexts.shift();
  }

  dealBossDamage(rawAmount, { shieldMult = 1.0, trueDamage = false, sourceUser = null, lane = 1, label = "" } = {}) {
    if (this.phase !== "RAIDING") return 0;
    let dmg = Math.max(1, rawAmount);
    if (this.boss.vulnerableSec > 0) dmg *= 1.75;

    let applied = 0;
    if (!trueDamage && this.boss.shield > 0) {
      const shieldHit = Math.round(dmg * shieldMult);
      const absorbed = Math.min(this.boss.shield, shieldHit);
      this.boss.shield -= absorbed;
      applied += absorbed;
      if (this.boss.shield <= 0) {
        this.boss.shield = 0;
        this.boss.stunSec = Math.max(this.boss.stunSec, 4.0);
        this.boss.vulnerableSec = 6.0;
        this.shakeTimer = 0.45;
        this._spawnText("💥 SHIELD BROKEN! x1.75 DMG", "#38bdf8", true);
        this.onEvent("boss_shield_broken", { bossLevel: this.bossLevel });
      }
    } else {
      const hpHit = Math.round(dmg);
      this.boss.hp = Math.max(0, this.boss.hp - hpHit);
      applied += hpHit;
    }

    this.boss.flashTimer = 0.12;
    const unit = this.squad.units[(lane - 1) % 4];
    if (unit) unit.damageDealt += applied;
    if (sourceUser) this._recordMvp(sourceUser, lane, applied, 0);
    if (label) this._spawnText(label, "#fde047", true);

    // Update Boss Phase thresholds
    const hpRatio = this.boss.hp / this.boss.maxHp;
    if (hpRatio <= 0.3 && this.boss.stage < 3) {
      this.boss.stage = 3;
      this._spawnText("🔥 OMEGA BERSERK PHASE 3!", "#fb7185", true);
    } else if (hpRatio <= 0.65 && this.boss.stage < 2) {
      this.boss.stage = 2;
      this._spawnText("⚠️ PHASE 2: LASER CORE ARMED!", "#f59e0b", true);
    }

    if (this.boss.hp <= 0) {
      this.boss.hp = 0;
      this.phase = "VICTORY";
      this.intermissionSec = 5.0;
      this.shakeTimer = 0.7;
      this._spawnText("🏆 BOSS DEFEATED!", "#34d399", true);
      this.onEvent("raid_finished", {
        outcome: "VICTORY",
        bossLevel: this.bossLevel,
        durationSec: Number(this.elapsedRaidSec.toFixed(2)),
        score: this.computeTeamScore(),
        mvp: this.getTopMvps(3),
      });
    }

    return applied;
  }

  applyStreamEvent(evt = {}) {
    this.eventsProcessed += 1;
    const nickname =
      typeof evt.user === "string"
        ? evt.user
        : evt.user?.nickname || evt.user?.uniqueId || "Viewer";

    // Parse lane 1-4 from comment or explicit lane
    let lane = Number(evt.lane) || 0;
    if (!lane && evt.comment) {
      const m = String(evt.comment).match(/[1-4]/);
      if (m) lane = Number(m[0]);
    }
    if (lane < 1 || lane > 4) lane = ((this.eventsProcessed - 1) % 4) + 1;

    if (this.phase === "COUNTDOWN") {
      const unit = this.squad.units[lane - 1];
      unit.supporters = Math.min(30, unit.supporters + 1);
      this._recordMvp(nickname, lane, 0, 0);
      return { queued: true, lane };
    }

    if (evt.type === "gift" || evt.kind === "gift" || evt.giftTier) {
      const tier = evt.giftTier || "nitro";
      const repeat = Math.max(1, Math.min(10, Number(evt.repeatCount || 1)));
      this._recordMvp(nickname, lane, 0, repeat);

      if (tier === "nitro") {
        this.squad.overclockSec = Math.min(12, this.squad.overclockSec + 4.0 * repeat);
        const hit = this.dealBossDamage(320 * repeat, {
          sourceUser: nickname,
          lane,
          label: `⚡ ${nickname}: OVERCLOCK!`,
        });
        return { tier, hit };
      }
      if (tier === "trap") {
        this.boss.stunSec = Math.max(this.boss.stunSec, 3.5);
        this.boss.laserChargeSec = 0;
        const hit = this.dealBossDamage(540 * repeat, {
          shieldMult: 2.5,
          sourceUser: nickname,
          lane,
          label: `🌩️ ${nickname}: EMP STUN!`,
        });
        return { tier, hit };
      }
      if (tier === "shield") {
        this.squad.barrier = Math.min(1200, this.squad.barrier + 350 * repeat);
        this.squad.hp = Math.min(this.squad.maxHp, this.squad.hp + 200 * repeat);
        this._spawnText(`🛡️ ${nickname}: +SQUAD BARRIER`, "#38bdf8", false);
        return { tier, healed: 350 * repeat };
      }
      if (tier === "meteor") {
        this.shakeTimer = 0.5;
        const hit = this.dealBossDamage(1_800 * repeat, {
          trueDamage: true,
          sourceUser: nickname,
          lane,
          label: `☄️ ${nickname}: ORBITAL LASER -${1800 * repeat}!`,
        });
        return { tier, hit };
      }
      if (tier === "crown") {
        this.shakeTimer = 0.85;
        this.squad.hp = this.squad.maxHp;
        this.squad.barrier = Math.min(1500, this.squad.barrier + 600);
        this.squad.overclockSec = 8.0;
        const hit = this.dealBossDamage(4_200 * repeat, {
          trueDamage: true,
          sourceUser: nickname,
          lane,
          label: `👑 ${nickname}: OMEGA MECHA STRIKE -${4200 * repeat}!`,
        });
        this.onEvent("mythic_crown_strike", { nickname, hit });
        return { tier, hit };
      }
    }

    // Standard chat command ("1", "2", "3", "4") -> boosts squad unit & fires instant volley!
    const unit = this.squad.units[lane - 1];
    unit.supporters = Math.min(35, unit.supporters + 1);
    if (unit.id === "medic") {
      this.squad.hp = Math.min(this.squad.maxHp, this.squad.hp + 45);
    }
    const burst = this.dealBossDamage(unit.baseDps * 1.4, {
      shieldMult: unit.shieldMult,
      sourceUser: nickname,
      lane,
    });
    this.projectiles.push({
      lane,
      color: unit.color,
      progress: 0,
    });
    if (this.projectiles.length > 36) this.projectiles.shift();

    return { lane, burst };
  }

  update(dtSec = 1 / 60) {
    const dt = Math.max(0.001, Math.min(0.25, Number(dtSec) || 1 / 60));

    // Decay visual timers
    if (this.boss.flashTimer > 0) this.boss.flashTimer = Math.max(0, this.boss.flashTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].ttl -= dt;
      this.floatingTexts[i].yOffset -= 26 * dt;
      if (this.floatingTexts[i].ttl <= 0) this.floatingTexts.splice(i, 1);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].progress += dt * 3.4;
      if (this.projectiles[i].progress >= 1) this.projectiles.splice(i, 1);
    }

    if (this.phase === "COUNTDOWN") {
      this.countdownSec -= dt;
      if (this.countdownSec <= 0) {
        this.startImmediate();
      }
      return;
    }

    if (this.phase === "VICTORY" || this.phase === "DEFEAT") {
      if (this.autoLoop) {
        this.intermissionSec -= dt;
        if (this.intermissionSec <= 0) {
          const nextLvl = this.phase === "VICTORY" ? this.bossLevel + 1 : this.bossLevel;
          this.resetRaid(nextLvl);
        }
      }
      return;
    }

    // RAIDING active loop
    this.elapsedRaidSec += dt;
    if (this.squad.overclockSec > 0) this.squad.overclockSec = Math.max(0, this.squad.overclockSec - dt);
    if (this.boss.stunSec > 0) this.boss.stunSec = Math.max(0, this.boss.stunSec - dt);
    if (this.boss.vulnerableSec > 0) {
      this.boss.vulnerableSec = Math.max(0, this.boss.vulnerableSec - dt);
    }

    // Squad auto-volleys
    const speedMult = this.squad.overclockSec > 0 ? 2.0 : 1.0;
    for (const unit of this.squad.units) {
      unit.cooldown -= dt * speedMult;
      if (unit.cooldown <= 0) {
        unit.cooldown = 0.65;
        const scale = 1 + Math.min(2.5, (unit.supporters - 1) * 0.14);
        if (unit.id === "medic") {
          this.squad.hp = Math.min(this.squad.maxHp, this.squad.hp + unit.healPerSec * 0.65 * scale);
        }
        this.dealBossDamage(unit.baseDps * 0.65 * scale, {
          shieldMult: unit.shieldMult,
          lane: unit.lane,
        });
        this.projectiles.push({ lane: unit.lane, color: unit.color, progress: 0 });
        if (this.projectiles.length > 36) this.projectiles.shift();
        if (this.phase !== "RAIDING") return;
      }
    }

    // Boss counter-attacks when not stunned
    if (this.boss.stunSec <= 0) {
      this.boss.attackCooldownSec -= dt * (this.boss.stage === 3 ? 1.45 : 1.0);
      if (this.boss.attackCooldownSec <= 0) {
        this.boss.laserChargeSec += dt;
        if (this.boss.laserChargeSec >= 1.6) {
          this.boss.laserChargeSec = 0;
          this.boss.attackCooldownSec = 5.2;

          // Guardians mitigate incoming Boss laser sweep!
          const guardianSupporters = this.squad.units[1].supporters;
          const mitigation = Math.min(0.7, (guardianSupporters - 1) * 0.08);
          let incoming = Math.round((210 + this.bossLevel * 45) * (1 - mitigation));

          if (this.squad.barrier > 0) {
            const blocked = Math.min(this.squad.barrier, incoming);
            this.squad.barrier -= blocked;
            incoming -= blocked;
          }
          this.squad.hp = Math.max(0, this.squad.hp - incoming);
          this.shakeTimer = 0.35;
          this._spawnText(`☄️ KAIJU LASER -${incoming} HP`, "#fb7185", false);

          if (this.squad.hp <= 0) {
            this.phase = "DEFEAT";
            this.intermissionSec = 4.5;
            this.onEvent("raid_finished", {
              outcome: "DEFEAT",
              bossLevel: this.bossLevel,
              durationSec: Number(this.elapsedRaidSec.toFixed(2)),
              score: this.computeTeamScore(),
              mvp: this.getTopMvps(3),
            });
            return;
          }
        }
      }
    }

    // Time limit check
    if (this.elapsedRaidSec >= this.raidTimeLimitSec && this.boss.hp > 0) {
      this.phase = "DEFEAT";
      this.intermissionSec = 4.5;
      this.onEvent("raid_finished", {
        outcome: "TIMEOUT",
        bossLevel: this.bossLevel,
        durationSec: Number(this.elapsedRaidSec.toFixed(2)),
        score: this.computeTeamScore(),
        mvp: this.getTopMvps(3),
      });
    }
  }

  computeTeamScore() {
    const dealt = this.boss.maxHp - this.boss.hp;
    const speedBonus =
      this.phase === "VICTORY"
        ? Math.max(0, Math.round((this.raidTimeLimitSec - this.elapsedRaidSec) * 65))
        : 0;
    return Math.min(480_000, Math.round(dealt * 0.8 + speedBonus + this.bossLevel * 1200));
  }

  getTopMvps(limit = 5) {
    return Array.from(this.mvpMap.values())
      .sort((a, b) => b.damage - a.damage)
      .slice(0, limit);
  }
}
