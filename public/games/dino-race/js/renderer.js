/**
 * renderer.js
 * 60 FPS HTML5 Canvas 2D Renderer for Jurassic Sanctuary Sprint.
 *
 * Features:
 * - Smooth lerp esports broadcast camera tracking player (SOLO) or leader (KOL Live)
 * - Auto-zoom scaling for 9:16 Vertical (TikTok Live / Shorts) & 16:9 Landscape (YouTube Live)
 * - Optional Transparent Background (`transparentBg`) for OBS webcam overlay compositing
 * - Circular Viewer Avatar Rider Badges (`crossOrigin="anonymous"` via `/api/avatar` + initials fallback)
 * - Animated Dinosaurs, Swamp Lagoons, Banana Traps, Golden Goats, Screen Shake & Minimap
 */

import { LIGHTING_MODES } from "./config.js";

export class DinoRaceRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lightingIdx = 0;
    this.transparentBg = false;
    this.showMinimap = true;

    this.camX = 0;
    this.camY = -520;
    this.foliage = [];
    this.lastMapId = null;

    /** @type {Map<string, HTMLImageElement|null>} */
    this.avatarCache = new Map();

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  cycleLighting() {
    this.lightingIdx = (this.lightingIdx + 1) % LIGHTING_MODES.length;
    return LIGHTING_MODES[this.lightingIdx];
  }

  _ensureFoliage(engine) {
    if (this.lastMapId === engine.map.id) return;
    this.lastMapId = engine.map.id;
    this.foliage = [];
    const pts = engine.trackPoints;
    const minClearance = engine.map.trackWidth * 0.74;

    for (let i = 0; i < 150; i++) {
      const angle = i * 137.5 * (Math.PI / 180);
      const rad = 180 + (i % 15) * 68;
      const fx = Math.cos(angle) * rad * 1.15;
      const fy = Math.sin(angle) * rad * 0.78;
      let minDist = Infinity;
      for (let j = 0; j < pts.length; j += 4) {
        const d = Math.hypot(fx - pts[j].x, fy - pts[j].y);
        if (d < minDist) minDist = d;
      }
      if (minDist > minClearance) {
        this.foliage.push({
          x: fx,
          y: fy,
          size: 15 + (i % 4) * 7,
          variant: i % 3,
        });
      }
    }
  }

  _getAvatarImage(url) {
    if (!url) return null;
    if (this.avatarCache.has(url)) return this.avatarCache.get(url);
    if (this.avatarCache.size > 120) this.avatarCache.clear();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.loadedOk = false;
    img.onload = () => {
      img.loadedOk = true;
    };
    img.onerror = () => {
      this.avatarCache.set(url, null);
    };
    img.src = url;
    this.avatarCache.set(url, img);
    return img;
  }

  render(engine, dt = 0.016) {
    this._ensureFoliage(engine);

    const ctx = this.ctx;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const theme = LIGHTING_MODES[this.lightingIdx];

    if (this.transparentBg) {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);
    }

    // Determine camera target (smooth esports broadcast lerp!)
    let focus = engine.racers[0] || engine.trackPoints[0] || { x: 0, y: -520 };
    if (engine.playMode !== "SOLO" && engine.racers.length > 0) {
      const standings = engine.getSortedStandings();
      focus = standings[0] || focus;
    }

    const lerpSpeed = Math.min(1, dt * 6.5);
    this.camX += (focus.x - this.camX) * lerpSpeed;
    this.camY += (focus.y - this.camY) * lerpSpeed;

    // Responsive zoom for narrow 9:16 portrait screens vs 16:9 widescreens
    const zoom = w < 560 ? Math.max(0.66, w / 680) : 1.0;

    const shakeX =
      engine.screenShake > 0 ? (Math.random() - 0.5) * engine.screenShake : 0;
    const shakeY =
      engine.screenShake > 0 ? (Math.random() - 0.5) * engine.screenShake : 0;

    ctx.save();
    ctx.translate(w * 0.5 + shakeX, h * 0.5 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camX, -this.camY);

    // 1. Swamp Lagoons with animated water ripples
    for (const sw of engine.map.swamps) {
      const grad = ctx.createRadialGradient(sw.x, sw.y, 15, sw.x, sw.y, sw.r);
      grad.addColorStop(0, theme.swampInner);
      grad.addColorStop(0.75, theme.swampOuter);
      grad.addColorStop(1, "rgba(15, 118, 110, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.fill();

      const rippleR = 32 + ((engine.raceElapsed * 24) % (sw.r * 0.65));
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, rippleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Dirt Sanctuary Road
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    engine.trackPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = engine.map.trackWidth + 14;
    ctx.stroke();

    ctx.strokeStyle = theme.road;
    ctx.lineWidth = engine.map.trackWidth;
    ctx.stroke();

    ctx.setLineDash([18, 22]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Checkered Start / Finish Sanctuary Gate
    const p0 = engine.trackPoints[0];
    const p1 = engine.trackPoints[1];
    const gateAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    ctx.save();
    ctx.translate(p0.x, p0.y);
    ctx.rotate(gateAngle);
    const squares = 8;
    const sqSize = engine.map.trackWidth / squares;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < squares; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#f8fafc" : "#0f172a";
        ctx.fillRect(
          -sqSize + r * sqSize,
          -engine.map.trackWidth / 2 + c * sqSize,
          sqSize,
          sqSize
        );
      }
    }
    ctx.restore();

    // 4. Sanctuary Props (Egg Nests & Ranger Watchtowers)
    if (!this.transparentBg) {
      for (const pr of engine.map.props) {
        if (pr.type === "nest") {
          ctx.fillStyle = "#78350f";
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fef3c7";
          [
            [-6, -4],
            [7, -3],
            [0, 6],
          ].forEach(([ox, oy]) => {
            ctx.beginPath();
            ctx.ellipse(pr.x + ox, pr.y + oy, 5, 7, 0.3, 0, Math.PI * 2);
            ctx.fill();
          });
        } else if (pr.type === "watchtower") {
          ctx.fillStyle = "#1e293b";
          ctx.strokeStyle = "#34d399";
          ctx.lineWidth = 2;
          ctx.fillRect(pr.x - 18, pr.y - 18, 36, 36);
          ctx.strokeRect(pr.x - 18, pr.y - 18, 36, 36);
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Tropical Foliage
      for (const f of this.foliage) {
        ctx.fillStyle =
          f.variant === 0 ? "#064e3b" : f.variant === 1 ? "#065f46" : "#14532d";
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. Slippery Banana / Tar Traps
    for (const tr of engine.traps) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.28)";
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🍌", tr.x, tr.y);
    }

    // 7. Prey Goats & Golden Goats
    for (const g of engine.goats) {
      if (!g.active) continue;
      const hopY = Math.abs(Math.sin(g.hopPhase)) * 5.5;
      if (g.golden) {
        ctx.fillStyle = "rgba(253, 224, 71, 0.35)";
        ctx.beginPath();
        ctx.arc(g.x, g.y - hopY, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 6, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = g.golden ? "21px sans-serif" : "18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🐐", g.x, g.y - hopY);
    }

    // 8. Particles
    for (const p of engine.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 9. Dinosaurs + Viewer Avatar Riders
    for (const r of engine.racers) {
      this._drawDinosaur(r, engine);
    }

    // 10. Floating Callout Banners
    for (const fc of engine.floatingCallouts) {
      ctx.globalAlpha = Math.min(1, fc.life / (fc.maxLife * 0.4));
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#050908";
      ctx.fillText(fc.text, fc.x + 1.5, fc.y + 1.5);
      ctx.fillStyle = fc.color;
      ctx.fillText(fc.text, fc.x, fc.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Atmospheric tint (only when not in OBS Transparent Chroma mode)
    if (!this.transparentBg) {
      ctx.fillStyle = theme.tint;
      ctx.fillRect(0, 0, w, h);
    }

    // 11. Minimap Radar
    if (
      this.showMinimap &&
      (engine.gameState === "RACING" || engine.gameState === "COUNTDOWN")
    ) {
      this._drawMinimap(engine, w);
    }

    // 12. Lobby & Countdown Overlays
    if (engine.gameState === "LOBBY") {
      ctx.fillStyle = "rgba(4, 12, 10, 0.62)";
      ctx.fillRect(0, h * 0.36, w, h * 0.28);
      ctx.fillStyle = "#fde047";
      ctx.font = `900 ${w < 500 ? 22 : 30}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        `ĐẠI CHIẾN AVATAR — BÌNH LUẬN ĐỂ VÀO ĐUA! (${engine.racers.length}/24)`,
        w / 2,
        h * 0.46
      );
      ctx.fillStyle = "#6ee7b7";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(
        `Xuất phát sau ${Math.ceil(engine.phaseTimer)}s · Chat trên TikTok Live hoặc YouTube Live`,
        w / 2,
        h * 0.54
      );
    } else if (engine.gameState === "COUNTDOWN") {
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(0, 0, w, h);
      const num = Math.ceil(engine.phaseTimer);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 78px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(num > 0 ? String(num) : "GẦM!", w / 2, h / 2);
    }
  }

  _drawDinosaur(r, engine) {
    const ctx = this.ctx;
    const scale = engine.playMode === "VIEWER_STAMPEDE" ? 0.86 : 1.0;

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(scale, scale);
    ctx.rotate(r.angle);

    // Golden King Aura (99-coin Crown!)
    if (r.kingTimer > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 36 + Math.sin(engine.raceElapsed * 30) * 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(253, 224, 71, 0.9)";
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (r.isBoosting) {
      ctx.beginPath();
      ctx.arc(0, 0, 30 + Math.sin(engine.raceElapsed * 24) * 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
      ctx.lineWidth = 2.8;
      ctx.stroke();
    }

    // Stun ring (Meteor impact)
    if (r.stunTimer > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(192, 132, 252, 0.9)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.beginPath();
    ctx.ellipse(-2, 5, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wagging Tail
    const tailWag = Math.sin(r.stridePhase) * 0.36;
    ctx.save();
    ctx.translate(-14, 0);
    ctx.rotate(tailWag);
    ctx.fillStyle = r.species.color;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-24, 0);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Striding Legs
    const legOffset = Math.sin(r.stridePhase) * 6;
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(-4 + legOffset, -13, 8, 4);
    ctx.fillRect(-4 - legOffset, 9, 8, 4);

    // Torso & Dorsal Spines
    ctx.fillStyle = r.species.color;
    ctx.beginPath();
    ctx.ellipse(2, 0, 17, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = r.species.accent;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head & Glowing Eyes
    ctx.fillStyle = r.species.color;
    ctx.beginPath();
    ctx.ellipse(20, 0, 10, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.arc(22, -3.5, 1.8, 0, Math.PI * 2);
    ctx.arc(22, 3.5, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Overhead Tag + Circular Viewer Avatar Rider Bubble!
    const displayName = r.ownerName || r.lastSupporter;
    if (engine.playMode === "SOLO" && r.isPlayer) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("▼ BẠN", r.x, r.y - 24);
    } else if (engine.playMode !== "SOLO") {
      const badgeY = r.y - 26;
      if (displayName) {
        this._drawViewerBadge(r, displayName, badgeY);
      } else {
        ctx.fillStyle = r.species.accent;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`#${r.species.code} ${r.species.name}`, r.x, badgeY);
      }
    }

    if (r.kingTimer > 0) {
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("👑", r.x, r.y - 42);
    }
  }

  _drawViewerBadge(r, displayName, badgeY) {
    const ctx = this.ctx;
    const pMark = r.lastPlatform === "youtube" ? "▶" : "♪";
    const prefix =
      r.ownerName ? "" : `#${r.species.code} `;
    const text = `${prefix}${displayName.slice(0, 14)}`;

    ctx.font = "bold 10.5px sans-serif";
    const textW = ctx.measureText(text).width;
    const pillW = textW + 28;
    const pillH = 18;
    const px = r.x - pillW / 2;
    const py = badgeY - pillH / 2;

    ctx.fillStyle = "rgba(8, 16, 14, 0.84)";
    ctx.strokeStyle = r.species.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(px, py, pillW, pillH, 9);
    ctx.fill();
    ctx.stroke();

    // Circular Avatar inside left side of pill
    const cx = px + 9;
    const cy = badgeY;
    const img = this._getAvatarImage(r.ownerAvatar);
    if (img && img.loadedOk) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - 7, cy - 7, 14, 14);
      ctx.restore();
    } else {
      ctx.fillStyle = r.lastPlatform === "youtube" ? "#ef4444" : r.species.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pMark, cx, cy + 0.5);
    }

    ctx.fillStyle = r.species.accent;
    ctx.font = "bold 10.5px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + 20, badgeY + 0.5);
  }

  _drawMinimap(engine, viewportW) {
    const ctx = this.ctx;
    const mapW = 128;
    const mapH = 88;
    const mx = viewportW - mapW - 12;
    const my = 12;

    ctx.fillStyle = "rgba(6, 18, 14, 0.84)";
    ctx.strokeStyle = "rgba(52, 211, 153, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mx, my, mapW, mapH, 10);
    ctx.fill();
    ctx.stroke();

    const scale = 0.056;
    const cx = mx + mapW / 2;
    const cy = my + mapH / 2;

    ctx.beginPath();
    engine.trackPoints.forEach((pt, idx) => {
      const px = cx + pt.x * scale;
      const py = cy + pt.y * scale;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 3.8;
    ctx.stroke();

    for (const r of engine.racers) {
      ctx.fillStyle = r.isPlayer ? "#fbbf24" : r.species.color;
      ctx.beginPath();
      ctx.arc(cx + r.x * scale, cy + r.y * scale, r.isPlayer ? 4 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
