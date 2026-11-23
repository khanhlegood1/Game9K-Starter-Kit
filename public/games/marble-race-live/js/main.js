import { MarbleRaceEngine } from "./marble-engine.js";
import { MarbleRaceRenderer } from "./renderer.js";

const canvas = document.getElementById("marbleCanvas");
const renderer = new MarbleRaceRenderer(canvas);
const feed = document.getElementById("event-feed");
const connectionPill = document.getElementById("connection-pill");
const streamStatus = document.getElementById("stream-status");
const seedInput = document.getElementById("seed-input");
const seedReceipt = document.getElementById("seed-receipt");

let soundEnabled = true;
let demoTimer = null;
let lastTs = performance.now();
let loggedEvents = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logFeed(message, tone = "#cbd5e1") {
  if (!feed) return;
  const row = document.createElement("div");
  row.style.color = tone;
  row.textContent = message;
  feed.prepend(row);
  while (feed.children.length > 28) feed.removeChild(feed.lastChild);
}

function setConnection(label, connected = false) {
  if (connectionPill) {
    connectionPill.textContent = label;
    connectionPill.style.borderColor = connected ? "rgba(52,211,153,.65)" : "rgba(148,163,184,.3)";
    connectionPill.style.color = connected ? "#86efac" : "#cbd5e1";
  }
  if (streamStatus) streamStatus.textContent = label;
}

function teamForEvent(evt = {}) {
  if (evt.team === "A" || evt.team === "B") return evt.team;
  if (evt.streamerTeam === "A" || evt.streamerTeam === "B") return evt.streamerTeam;
  const platform = String(evt.platform || evt.user?.platform || "").toLowerCase();
  return platform === "youtube" ? "B" : "A";
}

const params = new URLSearchParams(window.location.search || "");
const initialSeed = params.get("seed") || "G9K-MARBLE-001";
if (seedInput) seedInput.value = initialSeed;
if (seedReceipt) seedReceipt.textContent = initialSeed;

const engine = new MarbleRaceEngine({
  seed: initialSeed,
  maxMarbles: 120,
  minBots: 24,
  autoStart: true,
  onEvent(kind, payload) {
    renderer.handleGameEvent(kind, payload);
    if (kind === "marble_joined" && !payload.marble?.isBot) {
      logFeed(`👤 ${payload.marble.nickname} vào đội ${payload.marble.team} · ${payload.marble.platform}`, payload.marble.team === "A" ? "#67e8f9" : "#f9a8d4");
    } else if (kind === "event_queued") {
      logFeed(`⏳ ${payload.type} được xếp hàng cho heat kế tiếp (${payload.queueLength})`, "#fbbf24");
    } else if (kind === "event_queue_flushed") {
      logFeed(`↻ Đã phát lại ${payload.count} event sau gate countdown`, "#86efac");
    } else if (kind === "heat_finished") {
      logFeed(`🏁 Heat ${payload.heat}: đội ${payload.teamWinner} dẫn điểm · seed ${payload.seed}`, "#fde68a");
      window.PokiSDK?.gameplayStop?.("heat_finished");
      window.Game9K?.submitScore?.({
        nickname: `PK Team ${payload.teamWinner}`,
        score: Math.max(payload.teamScores?.A || 0, payload.teamScores?.B || 0),
        mode: "DUAL_STREAMER_PK",
        seed: payload.seed,
      });
    }
  },
});

function applyNormalizedEvent(rawEvent) {
  const event = { ...rawEvent, team: teamForEvent(rawEvent) };
  return engine.applyStreamEvent(event);
}

function initializeSdk() {
  if (!window.Game9K) return;
  window.Game9K.init({
    gameId: "marble-race-live",
    version: "1.0.0",
    maxTelemetryHz: 10,
    onPauseChange(paused) {
      if (paused) logFeed("⏸️ Game9K pause: live/ads guard", "#fbbf24");
    },
  });
  window.PokiSDK?.gameLoadingFinished?.();

  const stream = window.Game9K.stream;
  if (!stream?.on) return;
  stream.on("event", (evt) => {
    applyNormalizedEvent(evt);
    loggedEvents += 1;
  });
  stream.on("status", (status) => {
    const name = status.platform === "youtube" ? "YouTube" : status.platform === "tiktok" ? "TikTok" : status.platform || "stream";
    const connected = status.status === "connected";
    setConnection(`${name}: ${String(status.status || "unknown").toUpperCase()}`, connected);
    logFeed(`📡 ${name} → ${status.status}${status.message ? ` · ${status.message}` : ""}`, connected ? "#86efac" : "#fbbf24");
  });
  stream.on("connected", (status) => setConnection(`LIVE · ${status?.room || "room"}`, true));
  stream.on("error", (error) => logFeed(`⚠️ stream: ${error?.message || "connection error"}`, "#fca5a5"));
}

function connectPkRooms() {
  const roomA = document.getElementById("room-a")?.value.trim() || "";
  const roomB = document.getElementById("room-b")?.value.trim() || "";
  const stream = window.Game9K?.stream;
  if (!stream) {
    logFeed("ℹ️ SDK stream chưa có; đang chạy local sandbox", "#fbbf24");
    return;
  }

  if (typeof stream.connectPair === "function" && roomA && roomB) {
    stream.connectPair({
      A: { roomId: roomA, tiktok: roomA.startsWith("@") ? roomA : undefined, team: "A" },
      B: { roomId: roomB, youtube: roomB, team: "B" },
    });
    setConnection("PK CONNECTING · A + B", false);
    logFeed(`🔗 PK rooms: A=${roomA} · B=${roomB}`, "#67e8f9");
    return;
  }

  // Current single-room gateway can bind both upstreams. Platform routing keeps
  // TikTok on A and YouTube on B when pair sockets are not available.
  stream.connect({
    roomId: roomA || roomB || "marble-pk",
    tiktok: roomA || undefined,
    youtube: roomB || undefined,
  });
  setConnection("PK CONNECTING · combined room", false);
  logFeed("🔗 Combined room: TikTok→A · YouTube→B", "#67e8f9");
}

function stopDemo() {
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
}

function randomDemoEvent() {
  const team = Math.random() > 0.5 ? "A" : "B";
  const ordinal = Math.floor(Math.random() * 9000) + 1000;
  const nickname = `LiveViewer_${ordinal}`;
  const roll = Math.random();
  const base = {
    platform: team === "A" ? "tiktok" : "youtube",
    team,
    user: { uniqueId: `demo_${ordinal}`, nickname, platform: team === "A" ? "tiktok" : "youtube" },
  };
  if (roll < 0.58) return { ...base, type: "chat", comment: team };
  if (roll < 0.72) return { ...base, type: "like", likeCount: 3 };
  if (roll < 0.84) return { ...base, type: "gift", giftTier: "rose", giftValue: 1 };
  if (roll < 0.94) return { ...base, type: "gift", giftTier: "banana", giftValue: 10 };
  return { ...base, type: "gift", giftTier: "meteor", giftValue: 20 };
}

function startDemo() {
  if (demoTimer) {
    stopDemo();
    logFeed("🤖 Demo bot đã tắt", "#cbd5e1");
    return;
  }
  setConnection("DEMO BOT · TikTok A + YouTube B", true);
  demoTimer = setInterval(() => {
    const event = randomDemoEvent();
    if (window.Game9K?.stream?.ingest) window.Game9K.stream.ingest(event);
    else applyNormalizedEvent(event);
  }, 850);
  logFeed("🤖 Demo bot đã bật · event được normalize như live thật", "#86efac");
}

function startHeat(resetViewerPool = true) {
  const seed = seedInput?.value.trim() || "G9K-MARBLE-001";
  if (seedInput) seedInput.value = seed;
  if (seedReceipt) seedReceipt.textContent = seed;
  if (resetViewerPool && engine.phase === "FINISHED") {
    engine.nextHeat();
  } else {
    engine.startHeat({ seed, preserveViewers: true });
  }
  window.PokiSDK?.gameplayStart?.();
  logFeed(`🚦 Heat ${engine.heatNumber} countdown · seed ${seed}`, "#67e8f9");
}

function sendSimulatorEvent(button) {
  const eventType = button.dataset.event || "chat";
  const team = button.dataset.team || "A";
  const nickname = `${team === "A" ? "TikTok" : "YouTube"}_Supporter`;
  const event = {
    type: eventType,
    platform: team === "A" ? "tiktok" : "youtube",
    team,
    user: { uniqueId: `${team.toLowerCase()}_supporter`, nickname, platform: team === "A" ? "tiktok" : "youtube" },
    comment: team,
  };
  if (eventType === "gift") {
    event.giftTier = button.dataset.tier || "rose";
    event.giftValue = Number(button.dataset.coins || 1);
  }
  if (window.Game9K?.stream?.ingest) window.Game9K.stream.ingest(event);
  else applyNormalizedEvent(event);
}

function updateHud() {
  const snapshot = engine.getSnapshot();
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("score-a", snapshot.teamScores.A.toLocaleString());
  setText("score-b", snapshot.teamScores.B.toLocaleString());
  setText("coins-a", `gift coins ${snapshot.teamGiftCoins.A}`);
  setText("coins-b", `gift coins ${snapshot.teamGiftCoins.B}`);
  setText("queue-status", `queued between heats: ${snapshot.queuedEvents}`);
  setText("seed-receipt", snapshot.seed);
}

document.getElementById("btn-start")?.addEventListener("click", () => startHeat(true));
document.getElementById("btn-new-heat")?.addEventListener("click", () => startHeat(false));
document.getElementById("btn-connect")?.addEventListener("click", connectPkRooms);
document.getElementById("btn-demo")?.addEventListener("click", startDemo);
document.getElementById("btn-hide-labels")?.addEventListener("click", (event) => {
  renderer.showLabels = !renderer.showLabels;
  event.currentTarget.textContent = renderer.showLabels ? "LABELS" : "NO LABELS";
});
document.getElementById("btn-sound")?.addEventListener("click", (event) => {
  soundEnabled = !soundEnabled;
  event.currentTarget.textContent = soundEnabled ? "🔊" : "🔇";
});
document.querySelectorAll("[data-event]").forEach((button) => button.addEventListener("click", () => sendSimulatorEvent(button)));

initializeSdk();

// URL boot: `?roomA=@creatorA&roomB=VIDEO_ID&demo=1&seed=...` works as an
// OBS Browser Source URL without exposing localhost to browser-facing code.
const urlRoomA = params.get("roomA") || params.get("tiktok") || "";
const urlRoomB = params.get("roomB") || params.get("youtube") || "";
if (urlRoomA && document.getElementById("room-a")) document.getElementById("room-a").value = urlRoomA;
if (urlRoomB && document.getElementById("room-b")) document.getElementById("room-b").value = urlRoomB;
if (urlRoomA || urlRoomB) connectPkRooms();
if (params.get("demo") === "1" || params.get("autobot") === "1") startDemo();
startHeat(true);

function frameLoop(now) {
  const dt = Math.min(0.2, Math.max(0.001, (now - lastTs) / 1000));
  lastTs = now;
  if (!window.Game9K?.isPaused) engine.update(dt);
  renderer.render(engine, dt);
  updateHud();
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);
