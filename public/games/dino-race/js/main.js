/**
 * main.js
 * Wires DinoRaceEngine, DinoRaceRenderer, SoundFX, Game9K SDK, and
 * Multi-Platform KOL Stream Controls (TikTok Live + YouTube Live).
 */

import { SPECIES, MAPS } from "./config.js";
import { createSoundFX } from "./audio.js";
import { DinoRaceEngine } from "./race-engine.js";
import { DinoRaceRenderer } from "./renderer.js";

const SoundFX = createSoundFX();
const canvas = document.getElementById("raceCanvas");
const renderer = new DinoRaceRenderer(canvas);

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec * 10) % 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

function appendFeedLog(html) {
  const feed = document.getElementById("live-event-feed");
  if (!feed) return;
  const row = document.createElement("div");
  row.className = "leading-snug border-b border-white/5 pb-1";
  row.innerHTML = html;
  feed.prepend(row);
  while (feed.children.length > 40) {
    feed.removeChild(feed.lastChild);
  }
}

const engine = new DinoRaceEngine({
  playMode: "SOLO",
  onSound(kind) {
    if (kind === "roar") SoundFX.playRoar();
    else if (kind === "bite") SoundFX.playBite();
    else if (kind === "slip") SoundFX.playSlip();
    else if (kind === "meteor") SoundFX.playMeteorImpact();
    else if (kind === "fanfare_grand") SoundFX.playGiftFanfare(true);
    else if (kind === "beep_low") SoundFX.playBeep(false);
    else if (kind === "beep_high") SoundFX.playBeep(true);
  },
  onFeedLog: appendFeedLog,
  onRaceStart(info) {
    document.getElementById("overlay-finish").classList.add("hidden");
    window.PokiSDK?.gameplayStart();
    if (window.XsollaSDK?.hasEntitlement("golden_croc_skin") && engine.racers[0]) {
      engine.racers[0].kingTimer = Math.max(engine.racers[0].kingTimer || 0, 6.0);
    }
    window.Game9K?.emitPortalEvent("race_started", info);
  },
  onRaceFinish(summary) {
    window.PokiSDK?.gameplayStop("race_finished");
    renderFinishOverlay(summary);
    window.Game9K?.emitPortalEvent("race_finished", {
      mode: summary.playMode,
      winner: summary.winner?.ownerName || summary.winner?.species?.name || "Unknown",
      timeSec: summary.elapsedSec,
      viewerCount: summary.viewerCount,
      topSupporters: summary.topSupporters,
    });

    if (summary.playMode === "SOLO" && engine.racers[0]) {
      const player = engine.racers[0];
      const rank = summary.standings.findIndex((r) => r.isPlayer) + 1;
      if (rank === 1) {
        window.PokiSDK?.happyTime(0.95);
      }
      const score = Math.max(
        100,
        Math.round(3000 - summary.elapsedSec * 22 + (4 - rank) * 450 + player.goatsEaten * 80)
      );
      window.Game9K?.submitScore({
        nickname: "Sanctuary Driver",
        score,
        timeSec: summary.elapsedSec,
        species: player.species.name,
        mode: "SOLO",
      });
      window.Game9K?.saveCloudState({
        lastMapId: engine.map.id,
        lastSpeciesIdx: engine.selectedSpeciesIdx,
        bestScore: score,
      });
    } else if (summary.winner) {
      window.PokiSDK?.happyTime(0.6);
    }
  },
});

// Initialize Game9K Unified SDK (Poki Portal Lifecycle + Xsolla SDK 3 Commerce + KOL Stream Bridge)
if (window.Game9K) {
  window.Game9K.init({
    gameId: "dino-race",
    version: "2.0.0",
    maxTelemetryHz: 15,
    xsolla: {
      projectId: 249001,
      sandbox: true,
      products: [
        "amber_gems_100",
        "revive_turbo_surge",
        "kol_meteor_pack_5",
        "golden_croc_skin",
        "sanctuary_vip_pass",
      ],
    },
    onPauseChange(paused, reason) {
      SoundFX.setAdMute(paused);
      const legalBanner = document.getElementById("nd147-lock-overlay");
      if (legalBanner) {
        if (window.Game9K.legalLocked) legalBanner.classList.remove("hidden");
        else legalBanner.classList.add("hidden");
      }
      if (reason === "nd147_under18_limit") {
        appendFeedLog(`<span class="text-red-400 font-bold">[NĐ 147/2024]</span> Đã chạm trần giờ chơi U18!`);
      }
    },
  });

  // Signal Poki conversion-to-play loading completion & position Portal Pill below top HUD
  window.PokiSDK?.gameLoadingFinished();
  window.PokiSDK?.movePill(0, 54);

  // Apply finalized Xsolla SDK 3 purchases directly into live Dinosaur Race gameplay!
  window.XsollaSDK?.onPurchase((res) => {
    const sku = res?.order?.sku || "";
    SoundFX.playGiftFanfare(true);
    if (sku === "amber_gems_100" || sku === "revive_turbo_surge") {
      engine.racers.forEach((r) => {
        if (r.isPlayer || engine.playMode !== "SOLO") {
          r.boost = r.species.maxBoost;
          r.surgeTimer = Math.max(r.surgeTimer || 0, 3.8);
          r.stunTimer = 0;
        }
      });
      appendFeedLog(
        `<span class="text-emerald-300 font-bold">[💳 Xsolla IAP]</span> Đã nạp <b>${sku}</b> → Full Nộ Khí & Bứt Tốc!`
      );
    } else if (sku === "kol_meteor_pack_5") {
      engine.applyStreamEvent({
        type: "gift",
        platform: "xsolla",
        user: { uniqueId: "xsolla_vip", nickname: "Xsolla Meteor Pack" },
        giftTier: "meteor",
        giftValue: 20,
        lane: 0,
      });
      appendFeedLog(
        `<span class="text-purple-300 font-bold">[💳 Xsolla IAP]</span> Kích hoạt Gói Thiên Thạch giáng thẳng Top 1!`
      );
    } else if (sku === "golden_croc_skin") {
      if (engine.racers[0]) {
        engine.racers[0].kingTimer = Math.max(engine.racers[0].kingTimer || 0, 8.0);
      }
      appendFeedLog(
        `<span class="text-amber-300 font-bold">[💳 Xsolla IAP]</span> Đã mở khóa vĩnh viễn <b>Skin Cá Sấu Hoàng Kim</b>!`
      );
    } else if (sku === "sanctuary_vip_pass") {
      appendFeedLog(
        `<span class="text-yellow-300 font-bold">[👑 Xsolla VIP]</span> Đã kích hoạt Vé VIP Miễn Quảng Cáo Poki trên toàn cổng!`
      );
    }
  });

  // Connect incoming TikTok Live & YouTube Live events from SDK StreamBridge -> Engine
  let aiMcEnabled = true;
  let lastAiMcAt = 0;
  let aiMcHideTimer = null;

  function triggerLiveAiShoutcast(evt) {
    if (!aiMcEnabled || !window.PokiSDK?.ai?.speakShoutcast) return;
    const now = Date.now();
    if (now - lastAiMcAt < 3500) return;
    lastAiMcAt = now;

    const nickname =
      typeof evt.user === "string"
        ? evt.user
        : evt.user?.nickname || evt.user?.uniqueId || "VIP_Viewer";
    const giftTier = evt.giftTier || "meteor";

    window.PokiSDK.ai
      .speakShoutcast(
        {
          nickname,
          giftTier,
          comment: evt.comment || "",
        },
        { autoPlay: !SoundFX.muted }
      )
      .then((out) => {
        if (!out?.ok) return;
        const banner = document.getElementById("ai-mc-banner");
        const textEl = document.getElementById("ai-mc-headline");
        if (banner && textEl) {
          textEl.textContent = out.spokenText;
          banner.classList.remove("hidden");
          if (aiMcHideTimer) clearTimeout(aiMcHideTimer);
          aiMcHideTimer = setTimeout(() => banner.classList.add("hidden"), 3200);
        }
      })
      .catch(() => {});

    window.PokiSDK.agentOps
      ?.emitReactiveEvent("kol.high_tier_gift", { nickname, giftTier })
      .catch(() => {});
  }

  window.Game9K.stream.on("event", (evt) => {
    engine.applyStreamEvent(evt);
    if (
      (evt?.type === "gift" || evt?.kind === "gift") &&
      (evt.giftTier === "meteor" || evt.giftTier === "crown")
    ) {
      triggerLiveAiShoutcast(evt);
    }
  });

  document.getElementById("btn-ai-mc")?.addEventListener("click", (e) => {
    aiMcEnabled = !aiMcEnabled;
    e.currentTarget.classList.toggle("opacity-50", !aiMcEnabled);
    appendFeedLog(
      `<span class="text-fuchsia-300 font-bold">[🎙️ AI MC]</span> Bình luận viên giọng nói OpenRouter: <b>${
        aiMcEnabled ? "BẬT" : "TẮT"
      }</b>`
    );
  });

  window.Game9K.stream.on("status", (st) => {
    const pLabel = st.platform === "youtube" ? "▶️ YouTube" : st.platform === "tiktok" ? "🎵 TikTok" : "🤖 Demo";
    const statusBadge = document.getElementById("stream-conn-status");
    if (statusBadge) {
      statusBadge.textContent = `${pLabel}: ${st.status.toUpperCase()}`;
    }
    appendFeedLog(
      `<span class="text-teal-300">[Kết nối]</span> <b>${pLabel}</b> → <code>${st.status}</code> ${st.message ? `(${st.message})` : ""}`
    );
  });
}

// ============================================================================
// KEYBOARD & MOBILE TOUCH INPUT
// ============================================================================
const rawKeys = {};
window.addEventListener("keydown", (e) => {
  rawKeys[e.code] = true;
  if (e.code === "Space" && engine.gameState === "RACING" && engine.playMode === "SOLO") {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  rawKeys[e.code] = false;
});

function bindTouchButton(id, keyCode) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rawKeys[keyCode] = true;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
    el.addEventListener(ev, () => {
      rawKeys[keyCode] = false;
    });
  });
}
bindTouchButton("touch-left", "TouchLeft");
bindTouchButton("touch-right", "TouchRight");
bindTouchButton("touch-gas", "TouchGas");
bindTouchButton("touch-boost", "TouchBoost");

function collectPlayerInput() {
  return {
    up: Boolean(rawKeys.ArrowUp || rawKeys.KeyW || rawKeys.TouchGas),
    down: Boolean(rawKeys.ArrowDown || rawKeys.KeyS),
    left: Boolean(rawKeys.ArrowLeft || rawKeys.KeyA || rawKeys.TouchLeft),
    right: Boolean(rawKeys.ArrowRight || rawKeys.KeyD || rawKeys.TouchRight),
    boost: Boolean(rawKeys.Space || rawKeys.TouchBoost),
  };
}

// ============================================================================
// HUD & PODIUM OVERLAY RENDERING
// ============================================================================
function syncModeBadges() {
  const pill = document.getElementById("mode-pill");
  const liveLanes = document.getElementById("live-hud-lanes");
  const hudBottom = document.getElementById("hud-bottom");

  if (engine.playMode === "SOLO") {
    pill.textContent = window.Game9K?.isEmbedded ? "PORTAL G2" : "SOLO G4";
    pill.className =
      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
    liveLanes.classList.add("hidden");
    if (engine.gameState !== "MENU") hudBottom.classList.remove("hidden");
  } else {
    pill.textContent =
      engine.playMode === "VIEWER_STAMPEDE" ? "👥 STAMPEDE LIVE" : "🔴 KOL DERBY 24/7";
    pill.className =
      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500/25 text-rose-300 border border-rose-500/50";
    liveLanes.classList.remove("hidden");
    hudBottom.classList.add("hidden");
  }
}

function updateLiveHUD() {
  const standings = engine.getSortedStandings();
  const leader = standings[0];
  const focus = engine.playMode === "SOLO" ? engine.racers[0] : leader;

  if (focus) {
    const rank = standings.findIndex((r) => r === focus) + 1;
    document.getElementById("hud-rank").textContent =
      engine.playMode === "SOLO"
        ? `${rank}/${engine.racers.length}`
        : `${focus.species.emoji} ${focus.ownerName || "#" + focus.species.code}`;
    document.getElementById("hud-lap").textContent = `${Math.min(
      focus.lap,
      engine.totalLaps
    )}/${engine.totalLaps}`;
  }
  document.getElementById("hud-time").textContent = formatTime(engine.raceElapsed);

  if (engine.playMode === "SOLO" && engine.racers[0]) {
    const p = engine.racers[0];
    document.getElementById("hud-speed").textContent = `${Math.round(
      Math.abs(p.speed) * 0.24
    )} km/h`;
    document.getElementById("hud-boost-bar").style.width = `${
      (p.boost / p.species.maxBoost) * 100
    }%`;
  } else {
    document.getElementById("live-phase-badge").textContent =
      engine.gameState === "LOBBY"
        ? `LOBBY ${Math.ceil(engine.phaseTimer)}s`
        : engine.eliminationMode
        ? `VÒNG LOẠI #${engine.roundNumber}`
        : engine.gameState;
    document.getElementById("live-viewer-count").textContent = `👥 ${engine.activeViewers.size}`;

    const totalGoal = engine.totalLaps * engine.trackPoints.length;
    const topShown =
      engine.playMode === "VIEWER_STAMPEDE" ? standings.slice(0, 5) : engine.racers;
    const barsEl = document.getElementById("live-lane-bars");
    if (barsEl) {
      barsEl.innerHTML = topShown
        .map((r, idx) => {
          const pct = Math.min(
            100,
            Math.max(4, Math.round((r.totalProgress / totalGoal) * 100))
          );
          const title = r.ownerName
            ? `${idx + 1}. ${r.species.emoji} ${r.ownerName.slice(0, 12)}`
            : `#${r.species.code} ${r.species.emoji} ${r.species.name}`;
          const statusIcons = `${r.kingTimer > 0 ? "👑" : ""}${
            r.isBoosting ? "🔥" : ""
          }${r.stunTimer > 0 ? "💫" : ""}`;
          return `
            <div>
              <div class="flex justify-between text-[10px] font-bold">
                <span style="color:${r.species.accent}">${title}</span>
                <span class="font-mono text-slate-300">${pct}% ${statusIcons}</span>
              </div>
              <div class="w-full h-1.5 bg-black/70 rounded-full overflow-hidden mt-0.5">
                <div class="h-full transition-all duration-100" style="width:${pct}%; background:${r.species.color}"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }
}

function renderFinishOverlay(summary) {
  const { standings, winner, tournamentChampion, eliminatedThisRound, topSupporters } = summary;

  if (summary.playMode === "SOLO") {
    const playerRank = standings.findIndex((r) => r.isPlayer) + 1;
    const player = engine.racers[0];
    document.getElementById("finish-trophy").textContent =
      playerRank === 1 ? "🏆" : playerRank === 2 ? "🥈" : "🦖";
    document.getElementById("finish-title").textContent =
      playerRank === 1
        ? "HẠNG 1 — CHÚA TỂ KHU BẢO TỒN!"
        : `HẠNG ${playerRank} — HOÀN THÀNH CHẶNG ĐUA!`;
    document.getElementById("finish-subtitle").textContent = `Thời gian: ${formatTime(
      player.finishTime
    )} · Đớp được ${player.goatsEaten} dê mồi`;
    document.getElementById("finish-auto-countdown").classList.add("hidden");
  } else {
    const champName =
      tournamentChampion?.ownerName ||
      winner?.ownerName ||
      `ĐỘI #${winner?.species?.code} ${winner?.species?.name}`;
    document.getElementById("finish-trophy").textContent = "👑";
    document.getElementById("finish-title").textContent = `${champName.toUpperCase()} VÔ ĐỊCH!`;
    const elimInfo =
      eliminatedThisRound.length > 0
        ? ` · Loại ${eliminatedThisRound.length} tay đua cuối bảng`
        : "";
    document.getElementById("finish-subtitle").textContent = `Chặng ${formatTime(
      summary.elapsedSec
    )} · Khán giả tham gia: ${summary.viewerCount}${elimInfo}`;
    document.getElementById("finish-auto-countdown").classList.remove("hidden");
  }

  document.getElementById("finish-standings").innerHTML = standings
    .slice(0, 5)
    .map((r, idx) => {
      const tStr = r.finished
        ? formatTime(r.finishTime)
        : `+${(((winner?.totalProgress || 0) - r.totalProgress) * 0.04).toFixed(1)}s`;
      const highlight =
        (summary.playMode === "SOLO" && r.isPlayer) ||
        (summary.playMode !== "SOLO" && idx === 0);
      const label = r.ownerName
        ? `${r.species.emoji} ${r.ownerName}`
        : `${r.species.emoji} ${r.species.name} ${r.isPlayer ? "(Bạn)" : ""}`;
      return `
        <div class="flex items-center justify-between py-1.5 px-2 rounded ${
          highlight
            ? "bg-amber-500/20 border border-amber-400/50 font-bold text-amber-200"
            : "text-slate-300"
        }">
          <span>#${idx + 1} ${label}</span>
          <span class="font-mono">${tStr}</span>
        </div>
      `;
    })
    .join("");

  const supBox = document.getElementById("finish-supporters-box");
  if (topSupporters.length > 0) {
    supBox.classList.remove("hidden");
    const medals = ["🥇", "🥈", "🥉"];
    document.getElementById("finish-supporters-list").innerHTML = topSupporters
      .map((s, i) => {
        const pBadge = s.platform === "youtube" ? "▶️ YT" : "🎵 TT";
        return `
          <div class="flex justify-between items-center text-rose-100">
            <span>${medals[i]} <b>${s.user}</b> <span class="text-[9px] text-slate-400">(${pBadge})</span></span>
            <span class="font-mono text-amber-300">${
              s.coins > 0 ? `${s.coins} xu` : `${s.cheers} cổ vũ`
            }</span>
          </div>
        `;
      })
      .join("");
  } else {
    supBox.classList.add("hidden");
  }

  document.getElementById("overlay-finish").classList.remove("hidden");
}

// ============================================================================
// UI CONTROLS & DEMO MULTI-PLATFORM BOT STREAM
// ============================================================================
let simPlatform = "tiktok";
let localBotTimer = null;

const DEMO_VIEWERS = [
  { name: "MinhAnh_SG", platform: "tiktok" },
  { name: "TuanKhoi_YT", platform: "youtube" },
  { name: "BaoNgoc_2k4", platform: "tiktok" },
  { name: "HoangNam_Live", platform: "youtube" },
  { name: "LinhChi_Cute", platform: "tiktok" },
  { name: "DucPhat_Official", platform: "youtube" },
  { name: "QuangHuy_Pro", platform: "tiktok" },
  { name: "Kenji_Stream", platform: "youtube" },
];

function toggleLocalDemoBot(forceState) {
  const btn = document.getElementById("btn-toggle-bot-stream");
  const shouldEnable =
    typeof forceState === "boolean" ? forceState : localBotTimer === null;

  if (!shouldEnable) {
    if (localBotTimer) {
      clearInterval(localBotTimer);
      localBotTimer = null;
    }
    if (btn) {
      btn.textContent = "🤖 Demo Live: TẮT";
      btn.classList.remove("bg-emerald-600", "text-white");
    }
    return;
  }

  if (localBotTimer) return;
  if (btn) {
    btn.textContent = "🤖 Demo Live: BẬT";
    btn.classList.add("bg-emerald-600", "text-white");
  }

  localBotTimer = setInterval(() => {
    if (
      engine.gameState !== "RACING" &&
      engine.gameState !== "LOBBY" &&
      engine.gameState !== "COUNTDOWN"
    ) {
      return;
    }
    const v = DEMO_VIEWERS[Math.floor(Math.random() * DEMO_VIEWERS.length)];
    const lane = Math.floor(Math.random() * 4);
    const roll = Math.random();

    if (roll < 0.64) {
      window.TikTokBridge.ingest({
        type: "chat",
        platform: v.platform,
        user: v.name,
        comment: String(lane + 1),
        lane,
      });
    } else if (roll < 0.8) {
      window.TikTokBridge.ingest({
        type: "gift",
        platform: v.platform,
        user: v.name,
        lane,
        giftTier: "rose",
        coins: 1,
      });
    } else if (roll < 0.9) {
      window.TikTokBridge.ingest({
        type: "gift",
        platform: v.platform,
        user: v.name,
        lane,
        giftTier: "meat",
        coins: 5,
      });
    } else if (roll < 0.955) {
      window.TikTokBridge.ingest({
        type: "gift",
        platform: v.platform,
        user: v.name,
        lane,
        giftTier: "banana",
        coins: 10,
      });
    } else if (roll < 0.988) {
      window.TikTokBridge.ingest({
        type: "gift",
        platform: v.platform,
        user: v.name,
        lane,
        giftTier: "meteor",
        coins: 20,
      });
    } else {
      window.TikTokBridge.ingest({
        type: "gift",
        platform: v.platform,
        user: v.name,
        lane,
        giftTier: "crown",
        coins: 99,
      });
    }
  }, 1150);
}

// Start Overlay Mode Tabs
function selectStartModeUI(mode) {
  engine.setPlayMode(mode, {
    elimination: document.getElementById("chk-elimination")?.checked || false,
  });

  ["SOLO", "KOL_DERBY", "VIEWER_STAMPEDE"].forEach((m) => {
    const btn = document.querySelector(`[data-mode-select="${m}"]`);
    if (!btn) return;
    if (m === mode) {
      btn.className =
        "py-2 px-2 rounded-lg font-black text-[11px] sm:text-xs bg-gradient-to-r from-amber-500 to-emerald-400 text-stone-950 shadow transition";
    } else {
      btn.className =
        "py-2 px-2 rounded-lg font-bold text-[11px] sm:text-xs text-emerald-200 hover:bg-white/5 transition";
    }
  });

  const elimRow = document.getElementById("stampede-options-row");
  if (elimRow) {
    elimRow.classList.toggle("hidden", mode !== "VIEWER_STAMPEDE");
  }
}

document.querySelectorAll("[data-mode-select]").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectStartModeUI(btn.getAttribute("data-mode-select"));
  });
});

document.getElementById("chk-elimination")?.addEventListener("change", (e) => {
  engine.eliminationMode = e.target.checked;
});

// Map Selector
const mapSelectEl = document.getElementById("select-map");
if (mapSelectEl) {
  mapSelectEl.innerHTML = MAPS.map(
    (m, idx) => `<option value="${idx}">${m.name}</option>`
  ).join("");
  mapSelectEl.addEventListener("change", (e) => {
    engine.setMap(Number(e.target.value));
  });
}

// Dinosaur Card Selector
document.querySelectorAll(".dino-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".dino-card").forEach((c) => {
      c.classList.remove("border-amber-400", "bg-amber-950/30");
      c.classList.add("border-emerald-800/60", "bg-black/40");
    });
    card.classList.remove("border-emerald-800/60", "bg-black/40");
    card.classList.add("border-amber-400", "bg-amber-950/30");
    engine.selectedSpeciesIdx = parseInt(card.getAttribute("data-dino"), 10);
  });
});

// Start Race Button (Poki commercialBreak before gameplayStart — auto-skipped for Xsolla VIP!)
document.getElementById("btn-start-race")?.addEventListener("click", async () => {
  SoundFX.init();
  if (window.PokiSDK) {
    await window.PokiSDK.commercialBreak(() => SoundFX.setAdMute(true));
    SoundFX.setAdMute(false);
  }
  document.getElementById("overlay-start").classList.add("hidden");
  if (engine.playMode === "SOLO") {
    document.getElementById("hud-bottom").classList.remove("hidden");
    document.getElementById("touch-controls").classList.remove("hidden");
  } else {
    document.getElementById("live-control-drawer").classList.remove("hidden");
    renderer.showMinimap = false;
  }
  engine.startNewRound(true);
  syncModeBadges();
});

document.getElementById("btn-restart")?.addEventListener("click", async () => {
  document.getElementById("overlay-finish").classList.add("hidden");
  if (engine.playMode !== "SOLO") {
    engine.startNewRound(false);
  } else {
    if (window.PokiSDK) {
      await window.PokiSDK.commercialBreak(() => SoundFX.setAdMute(true));
      SoundFX.setAdMute(false);
    }
    document.getElementById("overlay-start").classList.remove("hidden");
    engine.gameState = "MENU";
  }
});

// In-Game Xsolla SDK 3 Storefront Launchers
function openDinoXsollaStore() {
  SoundFX.init();
  window.XsollaSDK?.openStoreModal({ gameId: "dino-race" });
}
document.getElementById("btn-xsolla-store")?.addEventListener("click", openDinoXsollaStore);
document.getElementById("btn-start-store")?.addEventListener("click", openDinoXsollaStore);

// Top Header Quick Controls
document.getElementById("btn-weather")?.addEventListener("click", (e) => {
  const mode = renderer.cycleLighting();
  e.currentTarget.textContent = mode.name.split(" ")[0];
});

document.getElementById("btn-audio")?.addEventListener("click", (e) => {
  const on = SoundFX.toggle();
  e.currentTarget.textContent = on ? "🔊" : "🔇";
});

document.getElementById("btn-layout-aspect")?.addEventListener("click", (e) => {
  const wrap = document.getElementById("viewport-shell");
  const isPortrait = wrap.classList.toggle("portrait-frame");
  e.currentTarget.textContent = isPortrait ? "📱 9:16" : "🖥️ 16:9";
  setTimeout(() => renderer.resize(), 40);
});

document.getElementById("btn-toggle-live-drawer")?.addEventListener("click", () => {
  const drawer = document.getElementById("live-control-drawer");
  const hidden = drawer.classList.toggle("hidden");
  renderer.showMinimap = hidden;
});

document.getElementById("btn-close-drawer")?.addEventListener("click", () => {
  document.getElementById("live-control-drawer").classList.add("hidden");
  renderer.showMinimap = true;
});

// Drawer Live Connect Form (TikTok + YouTube)
document.getElementById("btn-connect-streams")?.addEventListener("click", () => {
  const tiktok = document.getElementById("inp-tiktok-user")?.value.trim() || "";
  const youtube = document.getElementById("inp-youtube-vid")?.value.trim() || "";
  if (!tiktok && !youtube) {
    appendFeedLog(`<span class="text-amber-300">[Gợi ý]</span> Nhập @TikTok hoặc YouTube Video ID, hoặc bật 🤖 Demo Live!`);
    return;
  }
  if (engine.playMode === "SOLO") {
    selectStartModeUI("KOL_DERBY");
    document.getElementById("overlay-start").classList.add("hidden");
    engine.startNewRound(true);
    syncModeBadges();
  }
  window.Game9K?.stream.connect({
    roomId: tiktok || youtube || "sanctuary-main",
    tiktok: tiktok || undefined,
    youtube: youtube || undefined,
  });
});

document.getElementById("btn-switch-derby")?.addEventListener("click", () => {
  selectStartModeUI("KOL_DERBY");
  document.getElementById("overlay-start").classList.add("hidden");
  document.getElementById("overlay-finish").classList.add("hidden");
  engine.startNewRound(true);
  syncModeBadges();
});

document.getElementById("btn-switch-stampede")?.addEventListener("click", () => {
  selectStartModeUI("VIEWER_STAMPEDE");
  document.getElementById("overlay-start").classList.add("hidden");
  document.getElementById("overlay-finish").classList.add("hidden");
  engine.startNewRound(true);
  syncModeBadges();
});

document.getElementById("btn-toggle-bot-stream")?.addEventListener("click", () => {
  if (engine.playMode === "SOLO") {
    selectStartModeUI("KOL_DERBY");
    document.getElementById("overlay-start").classList.add("hidden");
    engine.startNewRound(true);
    syncModeBadges();
  }
  toggleLocalDemoBot();
});

document.getElementById("btn-obs-clean")?.addEventListener("click", (e) => {
  const header = document.getElementById("top-hud");
  const hidden = header.classList.toggle("hidden");
  e.currentTarget.textContent = hidden ? "Hiện HUD" : "Ẩn HUD";
  setTimeout(() => renderer.resize(), 40);
});

document.getElementById("btn-obs-chroma")?.addEventListener("click", (e) => {
  renderer.transparentBg = !renderer.transparentBg;
  document.body.style.backgroundColor = renderer.transparentBg ? "transparent" : "#070d0b";
  e.currentTarget.textContent = renderer.transparentBg ? "Nền: Trong" : "Nền: Rừng";
});

// Simulator Platform Switch (`tiktok` vs `youtube`)
document.querySelectorAll("[data-sim-platform]").forEach((btn) => {
  btn.addEventListener("click", () => {
    simPlatform = btn.getAttribute("data-sim-platform");
    document.querySelectorAll("[data-sim-platform]").forEach((b) => {
      b.classList.toggle("bg-white/15", b === btn);
      b.classList.toggle("text-white", b === btn);
    });
  });
});

document.querySelectorAll(".sim-chat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const code = btn.getAttribute("data-sim-chat");
    const v = DEMO_VIEWERS[Math.floor(Math.random() * DEMO_VIEWERS.length)];
    window.TikTokBridge.ingest({
      type: "chat",
      platform: simPlatform,
      user: v.name,
      comment: code,
    });
  });
});

document.querySelectorAll(".sim-gift-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tier = btn.getAttribute("data-gift");
    const coins = Number(btn.getAttribute("data-coins") || 1);
    const lane = parseInt(document.getElementById("sim-gift-target").value, 10);
    const v = DEMO_VIEWERS[Math.floor(Math.random() * DEMO_VIEWERS.length)];
    window.TikTokBridge.ingest({
      type: "gift",
      platform: simPlatform,
      user: v.name,
      lane,
      giftTier: tier,
      coins,
    });
  });
});

// Poki Rewarded Break Button (`PokiSDK.rewardedBreak` -> `shouldReward`)
document.getElementById("btn-ad-reward")?.addEventListener("click", async () => {
  const rewarded = await window.PokiSDK?.rewardedBreak({
    size: "medium",
    interactive: true,
    onStart: () => SoundFX.setAdMute(true),
  });
  SoundFX.setAdMute(false);
  if (rewarded) {
    engine.racers.forEach((r) => {
      r.boost = r.species.maxBoost;
      r.surgeTimer = Math.max(r.surgeTimer, 2.5);
    });
    SoundFX.playRoar();
    appendFeedLog(
      `<span class="text-amber-300 font-bold">[🎬 Poki Rewarded]</span> Đầy Nộ Khí toàn đường đua!`
    );
  } else {
    appendFeedLog(
      `<span class="text-slate-400">[🎬 Poki Rewarded]</span> Đã bỏ qua quảng cáo — chưa nhận thưởng.`
    );
  }
});

// ============================================================================
// URL QUERY PARAMETER BOOTSTRAP (OBS / TikTok LIVE Studio / YouTube Live Ready)
// ============================================================================
(function applyUrlParams() {
  const params = new URLSearchParams(window.location.search || "");
  const qMode = (params.get("mode") || "").toLowerCase();
  const qMap = params.get("map");
  const qLayout = params.get("layout");
  const qObs = params.get("obs") === "1";
  const qTransparent = params.get("bg") === "transparent";
  const qAutobot = params.get("autobot") === "1" || params.get("demo") === "1";
  const qElim = params.get("elim") === "1";
  const hasStreamParam = Boolean(
    params.get("tiktok") || params.get("id") || params.get("youtube") || params.get("room")
  );

  if (qMap !== null && !Number.isNaN(Number(qMap))) {
    engine.setMap(Number(qMap));
    if (mapSelectEl) mapSelectEl.value = String(engine.mapIndex);
  }

  if (qLayout === "9x16") {
    document.getElementById("viewport-shell")?.classList.add("portrait-frame");
    const aspectBtn = document.getElementById("btn-layout-aspect");
    if (aspectBtn) aspectBtn.textContent = "📱 9:16";
    setTimeout(() => renderer.resize(), 30);
  }

  if (qTransparent) {
    renderer.transparentBg = true;
    document.body.style.backgroundColor = "transparent";
  }

  if (qObs) {
    document.getElementById("top-hud")?.classList.add("hidden");
    setTimeout(() => renderer.resize(), 30);
  }

  if (qMode === "kol" || qMode === "live" || (hasStreamParam && !qMode)) {
    selectStartModeUI("KOL_DERBY");
    document.getElementById("overlay-start")?.classList.add("hidden");
    engine.startNewRound(true);
    syncModeBadges();
  } else if (qMode === "stampede") {
    engine.eliminationMode = qElim;
    selectStartModeUI("VIEWER_STAMPEDE");
    document.getElementById("overlay-start")?.classList.add("hidden");
    engine.startNewRound(true);
    syncModeBadges();
  } else {
    // Background attract preview while start modal is shown
    engine.startNewRound(true);
    engine.gameState = "MENU";
  }

  if (qAutobot) {
    toggleLocalDemoBot(true);
  }
})();

// ============================================================================
// MAIN 60 FPS ANIMATION LOOP
// ============================================================================
let lastTs = performance.now();
function frameLoop(now) {
  const dt = Math.min((now - lastTs) / 1000, 0.05);
  lastTs = now;

  if (!window.Game9K?.isPaused) {
    engine.step(dt, collectPlayerInput());
    updateLiveHUD();

    if (engine.gameState === "FINISHED" && engine.playMode !== "SOLO") {
      const cdEl = document.getElementById("finish-auto-countdown");
      if (cdEl) {
        cdEl.textContent = `Tự động mở chặng đua mới sau ${Math.max(
          1,
          Math.ceil(engine.phaseTimer)
        )}s...`;
      }
    }

    if (engine.gameState === "RACING") {
      window.Game9K?.broadcastTick({
        mode: engine.playMode,
        elapsed: Number(engine.raceElapsed.toFixed(2)),
        leader: engine.getSortedStandings()[0]?.species?.name || "Crocodilia",
        racers: engine.racers.slice(0, 8).map((r) => ({
          id: r.species.id,
          owner: r.ownerName || r.species.code,
          lap: r.lap,
          progress: r.totalProgress,
        })),
      });
    }
  }

  renderer.render(engine, dt);
  requestAnimationFrame(frameLoop);
}

requestAnimationFrame(frameLoop);
