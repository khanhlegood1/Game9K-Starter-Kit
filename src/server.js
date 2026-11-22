/**
 * server.js
 * Game9K Starter Kit — Multi-Tenant Live Stream Gateway & Portal Sandbox Server
 *
 * Features:
 * - Binds 0.0.0.0 for Docker, Cloudflare Tunnel, and E2B Live Preview compatibility
 * - Multi-tenant KOL room isolation (TikTok Live + YouTube Live + Webhook + Demo Bot)
 * - Dual transport: Socket.io + Server-Sent Events (`/api/sse/:roomId`)
 * - CORS-safe Avatar Proxy (`/api/avatar`) for Canvas 2D viewer badges
 * - Game9K Portal Sandbox APIs (Manifest discovery, Cloud Save, Leaderboards, Telemetry)
 */

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync, existsSync } from "node:fs";

import liveRoomHub from "./services/LiveRoomHub.js";
import avatarProxy from "./services/AvatarProxyService.js";
import { IpRateLimiter } from "./lib/rateLimiter.js";
import { validateGamePackage } from "./lib/manifestValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, "../public");
const GAMES_DIR = join(PUBLIC_DIR, "games");

export function createGame9KServer(options = {}) {
  const app = express();
  const httpServer = createServer(app);
  const limiter = new IpRateLimiter({
    maxSocketsPerIp: options.maxSocketsPerIp ?? 40,
    maxRequestsPerMinute: options.maxRequestsPerMinute ?? 240,
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  liveRoomHub.attachSocketServer(io);

  // Middleware: allow cross-origin & iframe preview embedding without host/frame blocks
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    res.removeHeader("X-Frame-Options");
    next();
  });

  // Serve static starter kit assets, SDK, and games
  app.use(express.static(PUBLIC_DIR));

  // ==========================================================================
  // REST API: HEALTH, STATS & GAME MANIFEST DISCOVERY
  // ==========================================================================

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "game9k-starter-kit",
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      stats: liveRoomHub.getStats(),
    });
  });

  app.get("/api/stats", (_req, res) => {
    res.json(liveRoomHub.getStats());
  });

  app.get("/api/games", (_req, res) => {
    if (!existsSync(GAMES_DIR)) {
      return res.json({ games: [] });
    }
    const entries = readdirSync(GAMES_DIR, { withFileTypes: true });
    const games = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(GAMES_DIR, entry.name);
      if (!existsSync(join(dir, "game9k.manifest.json"))) continue;
      const report = validateGamePackage(dir);
      games.push({
        slug: entry.name,
        ok: report.ok,
        manifest: report.manifest,
        metrics: report.metrics,
        releaseSha256: report.releaseSha256,
        errors: report.errors,
        warnings: report.warnings,
        entryUrl: `/games/${entry.name}/${report.manifest?.entry || "index.html"}`,
      });
    }
    res.json({ games });
  });

  // ==========================================================================
  // REST API: CORS-SAFE AVATAR PROXY (TikTok CDN & YouTube CDN + SVG Fallback)
  // ==========================================================================

  app.get("/api/avatar", async (req, res) => {
    const rawUrl = String(req.query.u || "");
    const fallbackName = String(req.query.name || "");
    const result = await avatarProxy.fetchAvatar(rawUrl, fallbackName);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }
    res.set("Content-Type", result.contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Access-Control-Allow-Origin", "*");
    return res.send(result.buffer);
  });

  // ==========================================================================
  // REST API: MULTI-PLATFORM ROOM CONFIGURATION, SSE & WEBHOOKS
  // ==========================================================================

  app.post("/api/rooms/:roomId/connect", async (req, res) => {
    const ip = limiter.extractIp(req);
    if (!limiter.consumeRequest(ip).allowed) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    try {
      const state = await liveRoomHub.configureRoomSources(req.params.roomId, {
        tiktok: req.body?.tiktok,
        youtube: req.body?.youtube,
        youtubeApiKey: req.body?.youtubeApiKey,
        demoBot: req.body?.demoBot,
      });
      return res.json({ ok: true, ...state });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err?.message || "Failed to configure room sources",
      });
    }
  });

  app.post("/api/rooms/:roomId/events", (req, res) => {
    const ip = limiter.extractIp(req);
    if (!limiter.consumeRequest(ip).allowed) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const event = liveRoomHub.ingestCustomEvent(req.params.roomId, req.body);
    if (!event) {
      return res.status(400).json({ ok: false, error: "Invalid event payload" });
    }
    return res.json({ ok: true, event });
  });

  // One-click Hype Burst (inspired by `/juego-test` in khanh-dragon-egg-tiktok-live)
  app.post("/api/rooms/:roomId/burst", (req, res) => {
    const roomId = req.params.roomId;
    const sequence = [
      { delay: 0, payload: { type: "chat", platform: "tiktok", user: "MinhAnh_SG", comment: "1" } },
      { delay: 250, payload: { type: "chat", platform: "youtube", user: "TuanKhoi_YT", comment: "2" } },
      { delay: 500, payload: { type: "chat", platform: "tiktok", user: "BaoNgoc_2k4", comment: "3" } },
      { delay: 750, payload: { type: "chat", platform: "youtube", user: "HoangNam_Live", comment: "4" } },
      { delay: 1100, payload: { type: "gift", platform: "tiktok", user: "LinhChi_Cute", lane: 0, giftTier: "rose", coins: 1 } },
      { delay: 1600, payload: { type: "gift", platform: "youtube", user: "DucPhat_VN", lane: 1, giftTier: "meat", amountUsd: 1, comment: "2 bứt tốc!" } },
      { delay: 2200, payload: { type: "gift", platform: "tiktok", user: "QuangHuy_Pro", lane: 2, giftTier: "banana", coins: 10 } },
      { delay: 2900, payload: { type: "gift", platform: "youtube", user: "Kenji_Stream", lane: 3, giftTier: "meteor", amountUsd: 5, comment: "4 thiên thạch!" } },
      { delay: 3700, payload: { type: "gift", platform: "tiktok", user: "VIP_DaiGia9K", lane: 0, giftTier: "crown", coins: 99 } },
    ];

    for (const step of sequence) {
      const t = setTimeout(() => {
        liveRoomHub.ingestCustomEvent(roomId, step.payload);
      }, step.delay);
      t.unref?.();
    }

    res.json({
      ok: true,
      roomId: liveRoomHub.normalizeRoomId(roomId),
      scheduledEvents: sequence.length,
    });
  });

  // Server-Sent Events stream for ultra-lightweight OBS overlays
  app.get("/api/sse/:roomId", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const room = liveRoomHub.addSseClient(req.params.roomId, res);
    res.write(
      `data: ${JSON.stringify({
        kind: "connected",
        roomId: room.roomId,
        statuses: room.statuses,
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);
    heartbeat.unref?.();

    req.on("close", () => {
      clearInterval(heartbeat);
      liveRoomHub.removeSseClient(room.roomId, res);
    });
  });

  // ==========================================================================
  // REST API: GAME9K PORTAL SERVICES (LEADERBOARD, CLOUD SAVE, TELEMETRY)
  // ==========================================================================

  app.get("/api/portal/leaderboard/:gameId", (req, res) => {
    res.json({
      gameId: req.params.gameId,
      entries: liveRoomHub.getLeaderboard(req.params.gameId),
    });
  });

  app.post("/api/portal/leaderboard/:gameId", (req, res) => {
    const entries = liveRoomHub.submitLeaderboardScore(req.params.gameId, req.body || {});
    res.json({ ok: true, entries });
  });

  app.get("/api/portal/cloud-save/:gameId/:playerId", (req, res) => {
    const record = liveRoomHub.loadCloudState(req.params.gameId, req.params.playerId);
    res.json({ ok: true, save: record });
  });

  app.post("/api/portal/cloud-save/:gameId/:playerId", (req, res) => {
    const record = liveRoomHub.saveCloudState(
      req.params.gameId,
      req.params.playerId,
      req.body?.data ?? req.body ?? {}
    );
    res.json({ ok: true, save: record });
  });

  app.get("/api/portal/telemetry", (_req, res) => {
    res.json({
      count: liveRoomHub.telemetryLog.length,
      events: liveRoomHub.telemetryLog.slice(0, 50),
    });
  });

  app.post("/api/portal/telemetry", (req, res) => {
    liveRoomHub.recordTelemetry(req.body || {});
    res.json({ ok: true });
  });

  // ==========================================================================
  // SOCKET.IO REAL-TIME MULTI-TENANT BRIDGE
  // ==========================================================================

  io.on("connection", (socket) => {
    if (limiter.isSocketBlocked(io, socket)) {
      socket.emit("connection-error", { message: "Too many connections from this IP" });
      socket.disconnect(true);
      return;
    }

    /**
     * Supports both:
     * 1. Legacy string: `socket.emit("join-room", "tiktok_username")`
     * 2. Multi-platform object: `socket.emit("join-room", { roomId, tiktok, youtube, youtubeApiKey, demoBot })`
     */
    socket.on("join-room", async (payload) => {
      try {
        let roomId = "";
        let tiktok = undefined;
        let youtube = undefined;
        let youtubeApiKey = undefined;
        let demoBot = undefined;

        if (typeof payload === "string") {
          roomId = liveRoomHub.normalizeRoomId(payload);
          tiktok = payload;
        } else if (payload && typeof payload === "object") {
          roomId = liveRoomHub.normalizeRoomId(
            payload.roomId || payload.tiktok || payload.youtube || "sanctuary-main"
          );
          tiktok = payload.tiktok;
          youtube = payload.youtube;
          youtubeApiKey = payload.youtubeApiKey;
          demoBot = payload.demoBot;
        } else {
          socket.emit("connection-error", { message: "Invalid join-room payload" });
          return;
        }

        if (socket.joinedRoomId && socket.joinedRoomId !== roomId) {
          socket.leave(socket.joinedRoomId);
          liveRoomHub.removeSocketClient(socket.joinedRoomId);
        }

        socket.joinedRoomId = roomId;
        socket.join(roomId);
        const room = liveRoomHub.addSocketClient(roomId);

        let configResult = null;
        if (
          typeof tiktok === "string" ||
          typeof youtube === "string" ||
          typeof demoBot === "boolean"
        ) {
          configResult = await liveRoomHub.configureRoomSources(roomId, {
            tiktok,
            youtube,
            youtubeApiKey,
            demoBot,
          });
        }

        socket.emit("room-joined", {
          room: room.roomId,
          statuses: room.statuses,
          config: configResult,
        });
      } catch (err) {
        socket.emit("connection-error", {
          message: err?.message || "Failed to join stream room",
        });
      }
    });

    socket.on("leave-room", (rawRoom) => {
      const target = liveRoomHub.normalizeRoomId(rawRoom || socket.joinedRoomId || "");
      if (target) {
        socket.leave(target);
        liveRoomHub.removeSocketClient(target);
        if (socket.joinedRoomId === target) socket.joinedRoomId = null;
      }
    });

    socket.on("simulate-event", (data) => {
      const targetRoom = liveRoomHub.normalizeRoomId(
        data?.roomId || socket.joinedRoomId || "sanctuary-main"
      );
      liveRoomHub.ingestCustomEvent(targetRoom, data);
    });

    socket.on("ping-check", () => {
      socket.emit("pong-check", { timestamp: Date.now() });
    });

    socket.on("disconnect", () => {
      if (socket.joinedRoomId) {
        liveRoomHub.removeSocketClient(socket.joinedRoomId);
        socket.joinedRoomId = null;
      }
    });
  });

  return { app, httpServer, io, liveRoomHub };
}

// Start server automatically when executed directly (`node src/server.js`)
const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = Number(process.env.PORT || 3000);
  const { httpServer } = createGame9KServer();

  httpServer.listen(PORT, HOST, () => {
    console.log(`
========================================================================
  🦖 Game9K Starter Kit — Live KOL Stream Gateway & Portal Host
  Listening on: http://${HOST}:${PORT}
  • KOL Launcher Hub:    /index.html
  • Dino Race Flagship:  /games/dino-race/index.html
  • Portal Sandbox Host: /portal.html
  • Stream Debugger:     /debug.html
  • Architecture Spec:   /spec.html
========================================================================`);
  });

  const gracefulExit = () => {
    liveRoomHub.shutdown();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", gracefulExit);
  process.on("SIGTERM", gracefulExit);
}
