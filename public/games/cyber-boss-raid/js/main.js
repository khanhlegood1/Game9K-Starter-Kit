import { RaidEngine } from "./raid-engine.js";

// ============================================================================
// 1. PROCEDURAL WEB AUDIO SYNTH SFX (Zero external audio files)
// ============================================================================
const RaidSFX = {
  ctx: null,
  muted: false,
  _ensure() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== "undefined") {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  playTone(freq = 440, dur = 0.09, type = "sawtooth", vol = 0.08) {
    const ctx = this._ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.45), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Ignore autoplay restrictions
    }
  },
  laserHit() {
    this.playTone(680, 0.06, "square", 0.05);
  },
  orbitalBoom() {
    this.playTone(150, 0.35, "sawtooth", 0.14);
  },
  victory() {
    this.playTone(523, 0.12, "triangle", 0.1);
    setTimeout(() => this.playTone(659, 0.12, "triangle", 0.1), 110);
    setTimeout(() => this.playTone(784, 0.24, "triangle", 0.12), 220);
  },
};

// ============================================================================
// 2. CANVAS RENDERER & HUD BOOTSTRAP
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("raidCanvas");
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    const shell = document.getElementById("raid-viewport");
    canvas.width = shell.clientWidth || 960;
    canvas.height = shell.clientHeight || 540;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  let aiMcEnabled = true;
  let lastAiMcAt = 0;
  let aiMcTimer = null;
  let activeScoreSession = null;

  async function startAntiCheatSession() {
    if (!window.PokiSDK?.arena?.startScoreSession) return;
    try {
      activeScoreSession = await window.PokiSDK.arena.startScoreSession("cyber-boss-raid");
    } catch {
      activeScoreSession = null;
    }
  }

  function showAiMcBanner(text) {
    const banner = document.getElementById("raid-ai-mc-banner");
    const line = document.getElementById("raid-ai-mc-text");
    if (!banner || !line) return;
    line.textContent = text;
    banner.classList.remove("hidden");
    if (aiMcTimer) clearTimeout(aiMcTimer);
    aiMcTimer = setTimeout(() => banner.classList.add("hidden"), 3400);
  }

  function triggerLiveShoutcast(nickname, giftTier) {
    if (!aiMcEnabled || !window.PokiSDK?.ai?.speakShoutcast) return;
    const now = Date.now();
    if (now - lastAiMcAt < 3200) return;
    lastAiMcAt = now;

    window.PokiSDK.ai
      .speakShoutcast({ nickname, giftTier, comment: "Mecha Kaiju Raid!" }, { autoPlay: !RaidSFX.muted })
      .then((res) => {
        if (res?.ok && res.spokenText) showAiMcBanner(res.spokenText);
      })
      .catch(() => {});
  }

  async function refreshBattlePassHud() {
    if (!window.PokiSDK?.arena?.getBattlePass) return;
    try {
      const bp = await window.PokiSDK.arena.getBattlePass();
      if (bp?.profile) {
        const el = document.getElementById("hud-bp-badge");
        if (el) el.textContent = `🎖️ Pass T${bp.profile.tier} · ${bp.profile.totalXp} XP`;
      }
    } catch {
      // Ignore offline
    }
  }

  const engine = new RaidEngine({
    bossLevel: 1,
    autoLoop: true,
    onEvent(type, payload) {
      if (type === "raid_started") {
        window.PokiSDK?.gameplayStart?.();
        startAntiCheatSession();
      } else if (type === "boss_shield_broken") {
        RaidSFX.orbitalBoom();
      } else if (type === "mythic_crown_strike") {
        RaidSFX.orbitalBoom();
        window.PokiSDK?.happyTime?.(1.0);
      } else if (type === "raid_finished") {
        window.PokiSDK?.gameplayStop?.();
        if (payload.outcome === "VICTORY") {
          RaidSFX.victory();
          window.PokiSDK?.happyTime?.(0.85);
        }
        if (activeScoreSession?.sessionToken && window.PokiSDK?.arena?.submitVerifiedScore) {
          window.PokiSDK.arena
            .submitVerifiedScore({
              session: activeScoreSession,
              nickname: "RaidCommander",
              score: payload.score,
              durationSec: Math.max(6, Math.round(payload.durationSec || 12)),
              eventsCount: engine.eventsProcessed,
            })
            .then(() => refreshBattlePassHud())
            .catch(() => {});
        } else if (window.PokiSDK?.arena?.awardBattlePassXp) {
          window.PokiSDK.arena
            .awardBattlePassXp("cyber-boss-raid", 65, "raid_completed")
            .then(() => refreshBattlePassHud())
            .catch(() => {});
        }
      }
    },
  });

  // Initialize Poki Portal SDK v9
  if (window.PokiSDK) {
    await window.PokiSDK.init({ gameId: "cyber-boss-raid", version: "9.0.0" });
    window.PokiSDK.gameLoadingFinished();
  }
  await refreshBattlePassHud();

  // Connect incoming KOL TikTok Live & YouTube Live stream events
  window.Game9K?.stream?.on("event", (evt) => {
    engine.applyStreamEvent(evt);
    if (evt?.giftTier === "meteor" || evt?.giftTier === "crown") {
      RaidSFX.orbitalBoom();
      const nick =
        typeof evt.user === "string"
          ? evt.user
          : evt.user?.nickname || evt.user?.uniqueId || "VIP_Raider";
      triggerLiveShoutcast(nick, evt.giftTier);
    } else {
      RaidSFX.laserHit();
    }
  });

  // Wire Squad Command Buttons (1-4) & Keyboard (1-4 / Space)
  document.querySelectorAll("[data-lane-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lane = Number(btn.getAttribute("data-lane-btn"));
      engine.applyStreamEvent({ user: "Player_Commander", comment: String(lane), lane });
      RaidSFX.laserHit();
    });
  });

  document.querySelectorAll("[data-gift-sim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const giftTier = btn.getAttribute("data-gift-sim");
      engine.applyStreamEvent({
        type: "gift",
        user: "KOL_Supporter",
        giftTier,
        lane: 1,
      });
      if (giftTier === "meteor" || giftTier === "crown") {
        RaidSFX.orbitalBoom();
        triggerLiveShoutcast("KOL_Supporter", giftTier);
      } else {
        RaidSFX.laserHit();
      }
    });
  });

  window.addEventListener("keydown", (e) => {
    if (["1", "2", "3", "4"].includes(e.key)) {
      engine.applyStreamEvent({ user: "Player_Commander", lane: Number(e.key) });
      RaidSFX.laserHit();
    } else if (e.code === "Space") {
      engine.applyStreamEvent({ user: "Player_Commander", lane: 1 });
      RaidSFX.laserHit();
    }
  });

  // Xsolla Quick-Buy Orbital Laser Pack + KOL Creator Attribution
  document.getElementById("btn-xsolla-orbital")?.addEventListener("click", async () => {
    window.PokiSDK?.gameplayStop?.();
    try {
      const res = await window.XsollaSDK?.buyAndFinalize("kol_meteor_pack_5", {
        couponCode: "GAMER9K",
      });
      if (res?.ok !== false) {
        engine.applyStreamEvent({
          type: "gift",
          user: "Xsolla_VIP",
          giftTier: "crown",
          lane: 3,
        });
        await window.PokiSDK?.arena?.attributeCreatorSale({
          creatorCode: "KOL_MINHANH",
          sku: "kol_meteor_pack_5",
          grossCents: 499,
          gameId: "cyber-boss-raid",
        });
        await refreshBattlePassHud();
      }
    } catch {
      // Ignore cancelled dialog
    } finally {
      window.PokiSDK?.gameplayStart?.();
    }
  });

  // Toggle 9:16 Portrait / 16:9 Landscape
  let isPortrait = false;
  document.getElementById("btn-raid-aspect")?.addEventListener("click", (e) => {
    isPortrait = !isPortrait;
    const shell = document.getElementById("raid-viewport");
    if (isPortrait) {
      shell.classList.add("max-w-[430px]", "mx-auto", "border-x", "border-cyan-500/40");
      e.currentTarget.textContent = "📱 9:16";
    } else {
      shell.classList.remove("max-w-[430px]", "mx-auto", "border-x", "border-cyan-500/40");
      e.currentTarget.textContent = "🖥️ 16:9";
    }
    resizeCanvas();
  });

  // Toggle AI MC
  document.getElementById("btn-raid-ai-mc")?.addEventListener("click", (e) => {
    aiMcEnabled = !aiMcEnabled;
    e.currentTarget.classList.toggle("opacity-50", !aiMcEnabled);
  });

  // Toggle Audio
  document.getElementById("btn-raid-audio")?.addEventListener("click", (e) => {
    RaidSFX.muted = !RaidSFX.muted;
    e.currentTarget.textContent = RaidSFX.muted ? "🔇" : "🔊";
  });

  // Toggle Auto-Bot 24/7 KOL Crowd Simulator
  const params = new URLSearchParams(window.location.search);
  let autoBot = params.get("autobot") !== "0";
  const botNames = ["MinhAnh_TT", "Hung Kaiju", "Linh9K_YT", "TuanSniper", "ThaoMedic", "BaoTankVN"];
  setInterval(() => {
    if (!autoBot || window.Game9K?.isPaused || window.Game9K?.legalLocked) return;
    const r = Math.random();
    const user = botNames[Math.floor(Math.random() * botNames.length)];
    const lane = Math.floor(Math.random() * 4) + 1;
    if (r < 0.14) {
      const tiers = ["nitro", "trap", "shield", "meteor"];
      const giftTier = tiers[Math.floor(Math.random() * tiers.length)];
      engine.applyStreamEvent({ type: "gift", user, giftTier, lane });
    } else {
      engine.applyStreamEvent({ user, comment: String(lane), lane });
    }
  }, 650);

  document.getElementById("btn-raid-autobot")?.addEventListener("click", (e) => {
    autoBot = !autoBot;
    e.currentTarget.textContent = autoBot ? "🤖 Auto: ON" : "🤖 Auto: OFF";
  });

  // Throttled <= 10Hz Telemetry & HUD Sync (120ms = 8.3 Hz <= 15Hz manifest budget)
  setInterval(() => {
    const bossPct = Math.max(0, Math.round((engine.boss.hp / engine.boss.maxHp) * 100));
    const shieldPct = Math.max(0, Math.round((engine.boss.shield / engine.boss.maxShield) * 100));
    document.getElementById("hud-boss-name").textContent = `${engine.boss.name} (P${engine.boss.stage})`;
    document.getElementById("hud-boss-hp-bar").style.width = `${bossPct}%`;
    document.getElementById("hud-boss-shield-bar").style.width = `${shieldPct}%`;
    document.getElementById("hud-boss-hp-txt").textContent = `${engine.boss.hp.toLocaleString()} / ${engine.boss.maxHp.toLocaleString()} HP`;
    document.getElementById("hud-team-score").textContent = engine.computeTeamScore().toLocaleString();

    const mvps = engine.getTopMvps(4);
    const mvpEl = document.getElementById("hud-mvp-list");
    if (mvpEl) {
      mvpEl.innerHTML =
        mvps.length === 0
          ? `<div class="text-slate-400">Chat 1-4 để xuất kích!</div>`
          : mvps
              .map(
                (m, idx) =>
                  `<div class="flex justify-between"><span>#${idx + 1} <b>${m.nickname}</b> (L${m.lane})</span><span class="text-amber-300 font-mono">${m.damage.toLocaleString()}</span></div>`
              )
              .join("");
    }

    window.Game9K?.sendTelemetry?.("raid_tick", {
      bossLevel: engine.bossLevel,
      bossHp: engine.boss.hp,
      phase: engine.phase,
    });
  }, 120);

  // ==========================================================================
  // 3. 60 FPS PROCEDURAL CYBER-KAIJU & SQUAD RENDER LOOP
  // ==========================================================================
  let lastTs = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastTs) / 1000);
    lastTs = now;

    const locked = Boolean(window.Game9K?.legalLocked);
    document.getElementById("u18-lock-overlay")?.classList.toggle("hidden", !locked);

    if (!window.Game9K?.isPaused && !locked) {
      engine.update(dt);
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.save();

    if (engine.shakeTimer > 0) {
      const mag = engine.shakeTimer * 12;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // Cyber Neo-Saigon Sky Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#050816");
    grad.addColorStop(0.55, "#0f172a");
    grad.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Perspective Cyber Grid Floor
    ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
    ctx.lineWidth = 1;
    const horizonY = h * 0.64;
    for (let y = horizonY; y < h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Boss Coordinates
    const bossX = w * 0.68;
    const bossY = h * 0.46 + Math.sin(now / 320) * 8;

    // Boss Energy Shield Halo
    if (engine.boss.shield > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.72)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(bossX, bossY, 96, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw Towering Procedural Mecha-Kaiju Boss
    ctx.save();
    ctx.translate(bossX, bossY);
    const bodyColor =
      engine.boss.flashTimer > 0
        ? "#ffffff"
        : engine.boss.stage === 3
        ? "#e11d48"
        : engine.boss.stage === 2
        ? "#d97706"
        : "#4f46e5";

    // Dorsal Cyber Spikes
    ctx.fillStyle = "#f43f5e";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(28, i * 22 - 10);
      ctx.lineTo(66, i * 24);
      ctx.lineTo(28, i * 22 + 10);
      ctx.closePath();
      ctx.fill();
    }

    // Armored Torso & Head
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-52, -68, 96, 132);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-36, -34, 64, 52);

    // Glowing Reactor Core
    ctx.fillStyle = engine.boss.laserChargeSec > 0 ? "#fde047" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(-4, -8, 18 + engine.boss.laserChargeSec * 7, 0, Math.PI * 2);
    ctx.fill();

    // Visor Eye
    ctx.fillStyle = "#fb7185";
    ctx.fillRect(-46, -56, 44, 10);

    // Laser Charge Warning Beam
    if (engine.boss.laserChargeSec > 0) {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.75)";
      ctx.lineWidth = 3 + engine.boss.laserChargeSec * 6;
      ctx.beginPath();
      ctx.moveTo(-48, -8);
      ctx.lineTo(-bossX + w * 0.18, 20);
      ctx.stroke();
    }
    ctx.restore();

    // Draw 4 Squad Heroes on Left
    const squadX = w * 0.2;
    engine.squad.units.forEach((u, idx) => {
      const uy = h * 0.28 + idx * (h * 0.14);
      ctx.fillStyle = u.color;
      ctx.beginPath();
      ctx.arc(squadX, uy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`L${u.lane} x${u.supporters}`, squadX - 24, uy + 30);
    });

    // Squad HP Bar
    const sqPct = Math.max(0, engine.squad.hp / engine.squad.maxHp);
    ctx.fillStyle = "rgba(15,23,42,0.85)";
    ctx.fillRect(squadX - 45, h * 0.16, 110, 10);
    ctx.fillStyle = "#34d399";
    ctx.fillRect(squadX - 45, h * 0.16, 110 * sqPct, 10);

    // Draw Plasma Projectiles
    for (const p of engine.projectiles) {
      const sy = h * 0.28 + (p.lane - 1) * (h * 0.14);
      const px = squadX + (bossX - squadX) * p.progress;
      const py = sy + (bossY - sy) * p.progress;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Floating Damage / Combo Labels
    ctx.textAlign = "center";
    for (const ft of engine.floatingTexts) {
      ctx.fillStyle = ft.color;
      ctx.font = ft.isCrit ? "900 15px system-ui" : "bold 12px system-ui";
      ctx.fillText(ft.text, bossX + ft.xOffset, bossY - 70 + ft.yOffset);
    }

    // Countdown / Victory Overlay Banner
    if (engine.phase !== "RAIDING") {
      ctx.fillStyle = "rgba(2, 6, 23, 0.68)";
      ctx.fillRect(0, h * 0.38, w, 92);
      ctx.fillStyle = "#fde047";
      ctx.font = "900 26px system-ui";
      const msg =
        engine.phase === "COUNTDOWN"
          ? `⚔️ SẴN SÀNG SĂN BOSS MK-${engine.bossLevel}: ${Math.ceil(engine.countdownSec)}s`
          : engine.phase === "VICTORY"
          ? `🏆 HẠ GỤC ${engine.boss.name}! (+BATTLE PASS XP)`
          : `💥 ĐỘI HÌNH TÁI TẬP HỢP...`;
      ctx.fillText(msg, w / 2, h * 0.38 + 54);
    }

    ctx.restore();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
