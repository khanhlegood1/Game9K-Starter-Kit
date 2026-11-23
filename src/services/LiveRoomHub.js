/**
 * LiveRoomHub.js
 * Multi-tenant Room Manager for Game9K KOL Livestreams & Portal Sandbox Services.
 *
 * Capabilities:
 * - Isolates KOL rooms (`roomId`) so multiple streamers run simultaneously without cross-talk
 * - Binds BOTH TikTok Live (`@username`) AND YouTube Live (`videoId` / URL) into a single unified room
 * - Supports both Socket.io rooms AND Server-Sent Events (`/api/sse/:roomId`)
 * - Emits canonical `stream_event` + `vamnguyen/tiktok-live-games` legacy `tiktok_*` events
 * - Optional server-side Demo Bot Stream for instant KOL overlay testing in OBS
 * - In-memory Cloud Save, Leaderboard, and Telemetry store for Game9K Portal Mode (`G2` / `G1`)
 */

import tiktokService from "./TikTokConnectorService.js";
import youtubeService, { parseYouTubeVideoId } from "./YouTubeLiveService.js";
import { normalizeCustomEvent } from "../lib/streamEventNormalizer.js";

const SAMPLE_KOL_VIEWERS = [
  { user: "MinhAnh_SG", platform: "tiktok" },
  { user: "TuanKhoi_Gaming", platform: "youtube" },
  { user: "BaoNgoc_2k4", platform: "tiktok" },
  { user: "HoangNam_Live", platform: "youtube" },
  { user: "LinhChi_Cute", platform: "tiktok" },
  { user: "DucPhat_VN", platform: "youtube" },
  { user: "ThaoVy_Official", platform: "tiktok" },
  { user: "Kenji_Stream", platform: "youtube" },
  { user: "QuangHuy_Pro", platform: "tiktok" },
  { user: "Mai Phuong YT", platform: "youtube" },
];

export class LiveRoomHub {
  constructor() {
    /** @type {import('socket.io').Server|null} */
    this.io = null;

    /**
     * @type {Map<string, {
     *   roomId: string,
     *   team: "A"|"B"|null,
     *   tiktokUsername: string|null,
     *   youtubeVideoId: string|null,
     *   botTimer: NodeJS.Timeout|null,
     *   sseClients: Set<import('express').Response>,
     *   socketCount: number,
     *   createdAt: number,
     *   lastActivityAt: number,
     *   eventCount: number,
     *   statuses: Record<string, Object>
     * }>}
     */
    this.rooms = new Map();

    /** @type {Map<string, Array<Object>>} gameId -> top scores */
    this.leaderboards = new Map();

    /** @type {Map<string, Object>} `${gameId}:${playerId}` -> cloud save data */
    this.cloudSaves = new Map();

    /** @type {Array<Object>} Recent verified telemetry events for Solana milestone auditing */
    this.telemetryLog = [];

    // Cleanup idle rooms every 60s (5-minute idle grace period)
    this.cleanupInterval = setInterval(() => this._cleanupIdleRooms(), 60_000);
    this.cleanupInterval.unref?.();
  }

  attachSocketServer(io) {
    this.io = io;
  }

  normalizeRoomId(raw) {
    const cleaned = String(raw || "sanctuary-main")
      .trim()
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9_.-]/g, "-")
      .slice(0, 64);
    return cleaned || "sanctuary-main";
  }

  getOrCreateRoom(rawRoomId) {
    const roomId = this.normalizeRoomId(rawRoomId);
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        team: null,
        tiktokUsername: null,
        youtubeVideoId: null,
        botTimer: null,
        sseClients: new Set(),
        socketCount: 0,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        eventCount: 0,
        statuses: {},
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  /**
   * Configure upstream TikTok Live, YouTube Live, or Demo Bot sources for a room.
   */
  async configureRoomSources(rawRoomId, { tiktok, youtube, youtubeApiKey, demoBot } = {}) {
    const room = this.getOrCreateRoom(rawRoomId);
    room.lastActivityAt = Date.now();
    const results = {};

    // 1. TikTok Live binding
    if (typeof tiktok === "string") {
      const cleanTikTok = tiktokService.sanitizeUsername(tiktok);
      if (room.tiktokUsername && room.tiktokUsername !== cleanTikTok) {
        tiktokService.unsubscribe(room.tiktokUsername, room.roomId);
        room.tiktokUsername = null;
      }
      if (cleanTikTok) {
        room.tiktokUsername = cleanTikTok;
        results.tiktok = await tiktokService.subscribe(
          cleanTikTok,
          room.roomId,
          (rId, evt) => this.dispatchEvent(rId, evt),
          (rId, st) => this.dispatchStatus(rId, st)
        );
      } else {
        delete room.statuses.tiktok;
      }
    }

    // 2. YouTube Live binding
    if (typeof youtube === "string") {
      const cleanVid = youtube.trim() ? parseYouTubeVideoId(youtube) : null;
      if (room.youtubeVideoId && room.youtubeVideoId !== cleanVid) {
        youtubeService.unsubscribe(room.youtubeVideoId, room.roomId);
        room.youtubeVideoId = null;
      }
      if (youtube.trim()) {
        if (!cleanVid) {
          results.youtube = {
            ok: false,
            status: "error",
            message: "Invalid YouTube URL or 11-character Video ID",
          };
        } else {
          room.youtubeVideoId = cleanVid;
          results.youtube = await youtubeService.subscribe(
            cleanVid,
            room.roomId,
            { apiKey: youtubeApiKey },
            (rId, evt) => this.dispatchEvent(rId, evt),
            (rId, st) => this.dispatchStatus(rId, st)
          );
        }
      } else {
        delete room.statuses.youtube;
      }
    }

    // 3. Server-side Demo Bot Stream toggle
    if (typeof demoBot === "boolean") {
      this.setRoomDemoBot(room.roomId, demoBot);
      results.demoBot = Boolean(room.botTimer);
    }

    return {
      roomId: room.roomId,
      team: room.team,
      tiktokUsername: room.tiktokUsername,
      youtubeVideoId: room.youtubeVideoId,
      demoBot: Boolean(room.botTimer),
      statuses: room.statuses,
      results,
    };
  }

  setRoomDemoBot(rawRoomId, enabled) {
    const room = this.getOrCreateRoom(rawRoomId);
    if (!enabled) {
      if (room.botTimer) {
        clearInterval(room.botTimer);
        room.botTimer = null;
      }
      delete room.statuses.simulator;
      this.dispatchStatus(room.roomId, { platform: "simulator", status: "stopped" });
      return;
    }

    if (room.botTimer) return;

    this.dispatchStatus(room.roomId, {
      platform: "simulator",
      status: "connected",
      target: "KOL Demo Stream (TikTok + YouTube)",
    });

    room.botTimer = setInterval(() => {
      const pick = SAMPLE_KOL_VIEWERS[Math.floor(Math.random() * SAMPLE_KOL_VIEWERS.length)];
      const lane = Math.floor(Math.random() * 4);
      const roll = Math.random();

      if (roll < 0.62) {
        this.ingestCustomEvent(room.roomId, {
          type: "chat",
          platform: pick.platform,
          user: pick.user,
          comment: Math.random() < 0.8 ? String(lane + 1) : `Cố lên đội ${lane + 1}!`,
          lane,
        });
      } else if (roll < 0.78) {
        this.ingestCustomEvent(room.roomId, {
          type: "gift",
          platform: pick.platform,
          user: pick.user,
          lane,
          giftTier: "rose",
          coins: 1,
        });
      } else if (roll < 0.88) {
        this.ingestCustomEvent(room.roomId, {
          type: "gift",
          platform: pick.platform,
          user: pick.user,
          lane,
          giftTier: "meat",
          coins: 5,
        });
      } else if (roll < 0.94) {
        this.ingestCustomEvent(room.roomId, {
          type: "gift",
          platform: pick.platform,
          user: pick.user,
          lane,
          giftTier: "banana",
          coins: 10,
        });
      } else if (roll < 0.985) {
        this.ingestCustomEvent(room.roomId, {
          type: "gift",
          platform: pick.platform,
          user: pick.user,
          lane,
          giftTier: "meteor",
          coins: 20,
        });
      } else {
        this.ingestCustomEvent(room.roomId, {
          type: "gift",
          platform: pick.platform,
          user: pick.user,
          lane,
          giftTier: "crown",
          coins: 99,
        });
      }
    }, 1250);
    room.botTimer.unref?.();
  }

  /**
   * Ingest a custom webhook or simulator event into a room.
   */
  ingestCustomEvent(rawRoomId, rawPayload) {
    const normalized = normalizeCustomEvent(rawPayload);
    if (!normalized) return null;
    this.dispatchEvent(rawRoomId, normalized);
    return normalized;
  }

  /**
   * Broadcast a normalized stream event to Socket.io + SSE clients in `roomId`.
   * Emits both unified `stream_event` AND `vamnguyen/tiktok-live-games` compatible `tiktok_*` events!
   */
  dispatchEvent(rawRoomId, event) {
    const room = this.getOrCreateRoom(rawRoomId);
    room.lastActivityAt = Date.now();
    room.eventCount += 1;
    const routedEvent =
      room.team === "A" || room.team === "B"
        ? { ...event, team: room.team, streamerTeam: room.team }
        : event;

    if (this.io) {
      const target = this.io.to(room.roomId);
      target.emit("stream_event", routedEvent);

      // Backward-compatible events for `tiktok-bridge.js` games
      if (routedEvent.type === "chat") target.emit("tiktok_chat", routedEvent);
      else if (routedEvent.type === "gift") target.emit("tiktok_gift", routedEvent);
      else if (routedEvent.type === "like") target.emit("tiktok_like", routedEvent);
      else if (routedEvent.type === "share") target.emit("tiktok_share", routedEvent);
    }

    if (room.sseClients.size > 0) {
      const frame = `data: ${JSON.stringify({ kind: "event", event: routedEvent })}\n\n`;
      for (const res of room.sseClients) {
        res.write(frame);
      }
    }
  }

  dispatchStatus(rawRoomId, statusInfo) {
    const room = this.getOrCreateRoom(rawRoomId);
    room.lastActivityAt = Date.now();
    const routedStatus =
      room.team === "A" || room.team === "B"
        ? { ...statusInfo, team: room.team }
        : statusInfo;
    room.statuses[routedStatus.platform || "default"] = {
      ...routedStatus,
      updatedAt: Date.now(),
    };

    if (this.io) {
      const target = this.io.to(room.roomId);
      target.emit("stream_status", routedStatus);

      if (statusInfo.status === "connected") {
        target.emit("tiktok_connected", {
          roomId: statusInfo.upstreamRoomId || room.roomId,
          platform: statusInfo.platform,
          timestamp: Date.now(),
        });
      } else if (statusInfo.status === "disconnected") {
        target.emit("tiktok_disconnected", { timestamp: Date.now() });
      } else if (statusInfo.status === "reconnecting") {
        target.emit("tiktok_reconnecting", {
          attempt: statusInfo.attempt || 1,
          delayMs: statusInfo.delayMs || 2000,
          timestamp: Date.now(),
        });
      } else if (statusInfo.status === "error") {
        target.emit("tiktok_error", {
          message: statusInfo.message || "Stream error",
          timestamp: Date.now(),
        });
      }
    }

    if (room.sseClients.size > 0) {
      const frame = `data: ${JSON.stringify({ kind: "status", status: routedStatus })}\n\n`;
      for (const res of room.sseClients) {
        res.write(frame);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Client Presence & Lifecycle
  // --------------------------------------------------------------------------
  addSocketClient(rawRoomId) {
    const room = this.getOrCreateRoom(rawRoomId);
    room.socketCount += 1;
    room.lastActivityAt = Date.now();
    return room;
  }

  removeSocketClient(rawRoomId) {
    const roomId = this.normalizeRoomId(rawRoomId);
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.socketCount = Math.max(0, room.socketCount - 1);
    room.lastActivityAt = Date.now();
  }

  addSseClient(rawRoomId, res) {
    const room = this.getOrCreateRoom(rawRoomId);
    room.sseClients.add(res);
    room.lastActivityAt = Date.now();
    return room;
  }

  removeSseClient(rawRoomId, res) {
    const roomId = this.normalizeRoomId(rawRoomId);
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.sseClients.delete(res);
    room.lastActivityAt = Date.now();
  }

  _cleanupIdleRooms() {
    const idleLimitMs = 5 * 60 * 1000;
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      const totalClients = room.socketCount + room.sseClients.size;
      if (totalClients === 0 && now - room.lastActivityAt > idleLimitMs) {
        this.destroyRoom(roomId);
      }
    }
  }

  destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.tiktokUsername) {
      tiktokService.unsubscribe(room.tiktokUsername, roomId);
    }
    if (room.youtubeVideoId) {
      youtubeService.unsubscribe(room.youtubeVideoId, roomId);
    }
    if (room.botTimer) {
      clearInterval(room.botTimer);
    }
    this.rooms.delete(roomId);
  }

  shutdown() {
    clearInterval(this.cleanupInterval);
    for (const roomId of [...this.rooms.keys()]) {
      this.destroyRoom(roomId);
    }
  }

  // --------------------------------------------------------------------------
  // Game9K Portal Services (Leaderboard, Cloud Save, Solana Milestone Telemetry)
  // --------------------------------------------------------------------------
  submitLeaderboardScore(gameId, entry) {
    const slug = String(gameId || "dino-race").slice(0, 64);
    const list = this.leaderboards.get(slug) || [];
    const record = {
      playerId: String(entry.playerId || "guest").slice(0, 64),
      nickname: String(entry.nickname || "Sanctuary Runner").slice(0, 40),
      score: Number(entry.score || 0),
      timeSec: Number(entry.timeSec || 0),
      species: String(entry.species || "Crocodilia").slice(0, 32),
      mode: String(entry.mode || "SOLO").slice(0, 24),
      submittedAt: new Date().toISOString(),
    };
    list.push(record);
    // Sort by highest score first, then fastest timeSec
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.timeSec || 9999) - (b.timeSec || 9999);
    });
    const trimmed = list.slice(0, 25);
    this.leaderboards.set(slug, trimmed);
    return trimmed;
  }

  getLeaderboard(gameId) {
    return this.leaderboards.get(String(gameId || "dino-race")) || [];
  }

  saveCloudState(gameId, playerId, stateData) {
    const key = `${String(gameId || "dino-race")}:${String(playerId || "guest")}`;
    const payload = {
      updatedAt: new Date().toISOString(),
      data: stateData,
    };
    this.cloudSaves.set(key, payload);
    return payload;
  }

  loadCloudState(gameId, playerId) {
    const key = `${String(gameId || "dino-race")}:${String(playerId || "guest")}`;
    return this.cloudSaves.get(key) || null;
  }

  recordTelemetry(event) {
    this.telemetryLog.unshift({
      ...event,
      receivedAt: new Date().toISOString(),
    });
    if (this.telemetryLog.length > 200) {
      this.telemetryLog.length = 200;
    }
  }

  getStats() {
    const roomList = [];
    for (const r of this.rooms.values()) {
      roomList.push({
        roomId: r.roomId,
        team: r.team,
        tiktok: r.tiktokUsername ? `@${r.tiktokUsername}` : null,
        youtube: r.youtubeVideoId,
        demoBot: Boolean(r.botTimer),
        clients: r.socketCount + r.sseClients.size,
        eventCount: r.eventCount,
        statuses: r.statuses,
      });
    }
    return {
      activeRooms: roomList.length,
      rooms: roomList,
      tiktokSessions: tiktokService.getStats(),
      youtubeSessions: youtubeService.getStats(),
      telemetryCount: this.telemetryLog.length,
    };
  }
}

export default new LiveRoomHub();
