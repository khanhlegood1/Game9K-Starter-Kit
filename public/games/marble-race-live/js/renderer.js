import { MARBLE_TEAMS, TRACK_PATH, trackAt } from "./marble-engine.js";

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "#ffffff").replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const n = Number.parseInt(normalized, 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export class MarbleRaceRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d", { alpha: true });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.avatarCache = new Map();
    this.toasts = [];
    this.pulse = 0;
    this.transparentBg = false;
    this.showLabels = true;
    this.lastPhase = "";
    this.resizeObserver = null;

    if (typeof ResizeObserver !== "undefined" && canvas) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    if (typeof window !== "undefined") window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width || window.innerWidth || 1));
    this.height = Math.max(1, Math.floor(rect.height || window.innerHeight || 1));
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  pushToast(text, color = "#fde68a") {
    if (!text) return;
    this.toasts.unshift({ text: String(text).slice(0, 90), color, ttl: 3.2 });
    if (this.toasts.length > 5) this.toasts.length = 5;
  }

  handleGameEvent(kind, payload = {}) {
    if (kind === "pk_gift_scored") {
      const icon = payload.tier === "crown" ? "👑" : payload.tier === "meteor" ? "☄️" : payload.tier === "banana" ? "🍌" : "🎁";
      this.pushToast(`${icon} Đội ${payload.team} +${payload.coins} · tác động đường đua`, MARBLE_TEAMS[payload.team]?.color || "#fde68a");
    } else if (kind === "physics_obstacle_spawned") {
      const target = payload.targetTeam ? `đội ${payload.targetTeam}` : "đường đua";
      this.pushToast(`⚡ ${payload.type.replace("_", " ")} → ${target}`, "#fca5a5");
    } else if (kind === "heat_started") {
      this.pushToast(`🌱 Heat ${payload.heat || "mới"} · seed đã khóa`, "#67e8f9");
    } else if (kind === "heat_finished") {
      this.pushToast(`🏁 Kết thúc · đội ${payload.teamWinner || "DRAW"}`, "#fde68a");
    }
  }

  _point(point) {
    return { x: point.x * this.width, y: point.y * this.height };
  }

  _trackPoint(progress, lateral = 0) {
    const point = trackAt(progress, lateral);
    return { x: point.x * this.width, y: point.y * this.height, angle: point.angle };
  }

  _drawBackground() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (this.transparentBg) {
      ctx.clearRect(0, 0, w, h);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "#08121f");
      gradient.addColorStop(0.48, "#11162a");
      gradient.addColorStop(1, "#1c1024");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }

    const glow = ctx.createRadialGradient(w * 0.52, h * 0.36, 0, w * 0.52, h * 0.36, Math.max(w, h) * 0.62);
    glow.addColorStop(0, "rgba(34,211,238,0.11)");
    glow.addColorStop(0.48, "rgba(99,102,241,0.06)");
    glow.addColorStop(1, "rgba(2,6,23,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Lightweight star/dot field: deterministic positions keep screenshots stable.
    ctx.fillStyle = "rgba(226,232,240,0.28)";
    for (let i = 0; i < 46; i += 1) {
      const x = ((i * 83) % 101) / 100 * w;
      const y = ((i * 47 + 17) % 93) / 100 * h;
      const r = 0.4 + ((i * 7) % 3) * 0.35;
      ctx.globalAlpha = 0.35 + ((i * 13) % 6) / 12;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawTrack(engine) {
    const ctx = this.ctx;
    const points = TRACK_PATH.map((point) => this._point(point));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.strokeStyle = "rgba(2,6,23,0.82)";
    ctx.lineWidth = Math.max(34, Math.min(100, Math.min(this.width, this.height) * 0.115));
    ctx.stroke();

    ctx.beginPath();
    points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    const road = ctx.createLinearGradient(0, 0, this.width, this.height);
    road.addColorStop(0, "#26364d");
    road.addColorStop(0.55, "#3d3049");
    road.addColorStop(1, "#17253a");
    ctx.strokeStyle = road;
    ctx.lineWidth = Math.max(25, Math.min(74, Math.min(this.width, this.height) * 0.082));
    ctx.stroke();

    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.strokeStyle = "rgba(226,232,240,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Start and finish gates.
    const start = this._trackPoint(0.015);
    const finish = this._trackPoint(0.985);
    this._drawGate(start, "START", "#67e8f9");
    this._drawGate(finish, "FINISH", "#fde68a");
    ctx.restore();
  }

  _drawGate(point, label, color) {
    const ctx = this.ctx;
    const size = Math.max(15, Math.min(33, Math.min(this.width, this.height) * 0.035));
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(point.angle + Math.PI / 2);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.65);
    ctx.lineTo(-size, size * 0.65);
    ctx.moveTo(size, -size * 0.65);
    ctx.lineTo(size, size * 0.65);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.max(8, size * 0.38)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, 0, -size * 0.9);
    ctx.restore();
  }

  _drawObstacle(obstacle, index) {
    const ctx = this.ctx;
    const point = this._trackPoint(obstacle.progress, obstacle.type === "split_gate" ? 0 : 0.01 * Math.sin(index));
    const radius = Math.max(10, Math.min(28, Math.min(this.width, this.height) * 0.027));
    const color = obstacle.targetTeam ? MARBLE_TEAMS[obstacle.targetTeam]?.color || "#fca5a5" : "#a78bfa";
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.globalAlpha = obstacle.active ? 0.95 : 0.25;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    if (obstacle.type === "vortex") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 22; i += 1) {
        const t = i / 21;
        const a = t * Math.PI * 3.2;
        const r = radius * (1 - t) * 0.9;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = hexToRgba(color, 0.22);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.9, 0, TAU);
      ctx.fill();
    } else if (obstacle.type === "falling_rock") {
      ctx.fillStyle = "#b45309";
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius * 0.84, -radius * 0.15);
      ctx.lineTo(radius * 0.48, radius * 0.88);
      ctx.lineTo(-radius * 0.62, radius * 0.72);
      ctx.lineTo(-radius, -radius * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fed7aa";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      ctx.font = `${radius * 0.9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("!", 0, radius * 0.4);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-radius * 1.15, -radius * 0.8);
      ctx.lineTo(-radius * 1.15, radius * 0.8);
      ctx.moveTo(radius * 1.15, -radius * 0.8);
      ctx.lineTo(radius * 1.15, radius * 0.8);
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-radius * 1.1, 0);
      ctx.lineTo(radius * 1.1, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _avatarFor(marble) {
    const url = marble.avatar;
    if (!url || typeof Image === "undefined") return null;
    const existing = this.avatarCache.get(url);
    if (existing) return existing.image?.complete ? existing.image : null;
    const image = new Image();
    if (/^https?:/i.test(url)) image.crossOrigin = "anonymous";
    image.onload = () => this.avatarCache.set(url, { image, ready: true });
    image.onerror = () => this.avatarCache.set(url, { image: null, ready: false });
    image.src = url;
    this.avatarCache.set(url, { image, ready: false });
    return null;
  }

  _drawMarble(marble, rank, total) {
    const ctx = this.ctx;
    const point = this._trackPoint(marble.progress, marble.lateral * 0.065);
    const density = total > 80 ? 0.66 : total > 50 ? 0.8 : 1;
    const radius = clamp(Math.min(this.width, this.height) * 0.017 * density, 5, 15);
    const team = MARBLE_TEAMS[marble.team] || MARBLE_TEAMS.A;
    const isTop = rank < 5 || marble.finished;
    const avatar = this._avatarFor(marble);

    ctx.save();
    ctx.translate(point.x, point.y);
    if (marble.boostTimer > 0) {
      ctx.shadowColor = team.accent;
      ctx.shadowBlur = 10 + Math.sin(this.pulse * 8) * 3;
    } else {
      ctx.shadowColor = team.color;
      ctx.shadowBlur = isTop ? 8 : 3;
    }

    const fill = ctx.createRadialGradient(-radius * 0.35, -radius * 0.45, radius * 0.1, 0, 0, radius * 1.25);
    fill.addColorStop(0, "#ffffff");
    fill.addColorStop(0.16, team.accent);
    fill.addColorStop(0.5, team.color);
    fill.addColorStop(1, "#0f172a");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();

    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.75, 0, TAU);
      ctx.clip();
      ctx.drawImage(avatar, -radius * 0.75, -radius * 0.75, radius * 1.5, radius * 1.5);
      ctx.restore();
    }

    ctx.strokeStyle = team.accent;
    ctx.lineWidth = Math.max(1, radius * 0.15);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();

    if (isTop && this.showLabels) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(2,6,23,0.82)";
      const label = marble.finished ? `#${marble.finishRank}` : `#${rank + 1}`;
      const labelWidth = Math.max(18, radius * 1.55);
      ctx.fillRect(-labelWidth / 2, radius + 3, labelWidth, 11);
      ctx.fillStyle = "#f8fafc";
      ctx.font = `900 ${Math.max(7, radius * 0.72)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, 0, radius + 11);
    }
    ctx.restore();
  }

  _drawHud(engine) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const compact = w < 620;
    ctx.save();

    const panel = (x, y, width, height, stroke = "rgba(148,163,184,0.28)") => {
      ctx.fillStyle = "rgba(2,6,23,0.68)";
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
    };

    panel(14, 14, compact ? w - 28 : 300, compact ? 58 : 66, "rgba(103,232,249,0.32)");
    ctx.fillStyle = "#e0f2fe";
    ctx.font = `900 ${compact ? 13 : 16}px system-ui, sans-serif`;
    ctx.fillText("MARBLE RACE LIVE", 26, 36);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `${compact ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(`HEAT ${engine.heatNumber || 0} · SEED ${String(engine.seed).slice(0, 21)}`, 26, 53);
    if (!compact) ctx.fillText(`${engine.marbles.length}/120 AVATAR · ${engine.eventsProcessed} events`, 26, 68);

    const scoreWidth = compact ? w - 28 : 305;
    const scoreX = compact ? 14 : w - scoreWidth - 14;
    const scoreY = compact ? 80 : 14;
    panel(scoreX, scoreY, scoreWidth, compact ? 52 : 66, "rgba(244,114,182,0.32)");
    ctx.font = `900 ${compact ? 11 : 13}px system-ui, sans-serif`;
    ctx.fillStyle = MARBLE_TEAMS.A.color;
    ctx.fillText(`A  ${engine.teamScores.A.toLocaleString()}`, scoreX + 12, scoreY + 22);
    ctx.fillStyle = MARBLE_TEAMS.B.color;
    ctx.fillText(`B  ${engine.teamScores.B.toLocaleString()}`, scoreX + scoreWidth - (compact ? 88 : 116), scoreY + 22);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `${compact ? 9 : 10}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${engine.phase} · ${Math.max(0, engine.phaseTimer).toFixed(1)}s`, scoreX + scoreWidth / 2, scoreY + 42);
    ctx.textAlign = "left";

    // PK center arrow / fairness marker.
    if (!compact) {
      ctx.fillStyle = "rgba(15,23,42,0.78)";
      ctx.beginPath();
      ctx.roundRect(w / 2 - 93, 14, 186, 38, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(250,204,21,0.35)";
      ctx.stroke();
      ctx.fillStyle = "#fde68a";
      ctx.font = "900 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PK · GIFTS CHANGE THE OTHER LANE", w / 2, 30);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("seed-visible / replayable", w / 2, 43);
      ctx.textAlign = "left";
    }

    const activeObstacles = engine.obstacles.filter((obstacle) => obstacle.active).length;
    ctx.fillStyle = "rgba(2,6,23,0.64)";
    ctx.fillRect(14, h - 40, Math.min(360, w - 28), 25);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(`⚙ ${activeObstacles} obstacles  ·  👥 ${engine.marbles.filter((m) => !m.isBot).length} viewers`, 24, h - 24);

    // Toast stack.
    let toastY = compact ? h - 76 : h - 74;
    for (const toast of this.toasts) {
      ctx.globalAlpha = clamp(toast.ttl, 0, 1);
      const width = Math.min(w - 28, Math.max(220, ctx.measureText(toast.text).width + 30));
      ctx.fillStyle = "rgba(2,6,23,0.84)";
      ctx.fillRect(w - width - 14, toastY, width, 24);
      ctx.fillStyle = toast.color;
      ctx.fillRect(w - width - 14, toastY, 3, 24);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.fillText(toast.text, w - width + 2, toastY + 16);
      toastY -= 29;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  render(engine, dtSec = 1 / 60) {
    if (!this.ctx || !engine) return;
    this.pulse += dtSec;
    for (const toast of this.toasts) toast.ttl -= dtSec;
    this.toasts = this.toasts.filter((toast) => toast.ttl > 0);
    if (this.lastPhase !== engine.phase) {
      this.lastPhase = engine.phase;
      if (engine.phase === "RACING") this.pushToast("🚦 Xuất phát!", "#67e8f9");
    }

    this._drawBackground();
    this._drawTrack(engine);
    engine.obstacles.filter((obstacle) => obstacle.active).forEach((obstacle, index) => this._drawObstacle(obstacle, index));

    const ordered = engine.getTopMarbles(engine.marbles.length);
    const standings = ordered.slice().reverse();
    for (const marble of standings) {
      const rank = ordered.indexOf(marble);
      this._drawMarble(marble, rank, engine.marbles.length);
    }
    this._drawHud(engine);
  }
}
