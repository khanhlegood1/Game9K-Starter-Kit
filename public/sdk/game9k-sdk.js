/**
 * game9k-sdk.js
 * Official Browser SDK for Game9K Starter Kit (v1.0.0)
 *
 * Implements the 5 Pillars of Game9K Instant-Play Architecture:
 * 1. Opaque-Origin `<iframe sandbox="allow-scripts">` Safe Storage & PostMessage Bridge
 *    - Validates `event.source === window.parent` (never trusts `event.origin === "null"` blindly)
 *    - Wraps `localStorage` in opaque-origin try/catch so sandboxed iframes never throw SecurityError
 * 2. Dual Mode Operation: Standalone (`G4`) vs Portal Connected (`G2` / `G1`)
 * 3. Throttled Realtime Broadcast Telemetry (`<= 15-20 Hz`, zero Presence spam)
 * 4. Google H5 Games Ad Placement API (`adConfig` / `adBreak` with 2,000ms preroll timeout)
 * 5. Unified Multi-Platform Stream Bridge (`TikTok Live` + `YouTube Live` + `PostMessage` + `SSE`)
 */
(function initGame9KGlobal(global) {
  "use strict";

  // Safe in-memory storage fallback when running inside `<iframe sandbox="allow-scripts">`
  // where `window.localStorage` throws DOMException SecurityError (opaque origin "null").
  const memoryStore = new Map();
  const SafeStorage = {
    get(key) {
      try {
        return global.localStorage.getItem(key);
      } catch {
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      }
    },
    set(key, value) {
      const str = String(value);
      memoryStore.set(key, str);
      try {
        global.localStorage.setItem(key, str);
      } catch {
        // Expected inside sandboxed iframe without allow-same-origin
      }
    },
  };

  // ==========================================================================
  // 1. MULTI-PLATFORM LIVE STREAM BRIDGE (TikTok Live + YouTube Live + OBS)
  // ==========================================================================
  class LiveStreamBridge {
    constructor() {
      this.socket = null;
      this.sse = null;
      this.roomId = null;
      this.config = {};
      this.handlers = {
        event: [],
        chat: [],
        gift: [],
        like: [],
        share: [],
        follow: [],
        join: [],
        status: [],
        connected: [],
        disconnected: [],
        reconnecting: [],
        error: [],
      };

      // Auto-connect from URL query params when page loads
      if (typeof global.addEventListener === "function") {
        global.addEventListener("DOMContentLoaded", () => this.autoConnectFromQuery());
      }
    }

    autoConnectFromQuery() {
      try {
        const params = new URLSearchParams(global.location.search || "");
        const tiktok = params.get("tiktok") || params.get("id") || params.get("username") || "";
        const youtube = params.get("youtube") || params.get("yt") || "";
        const room = params.get("room") || "";
        const autobot = params.get("autobot") === "1" || params.get("demo") === "1";

        if (tiktok || youtube || room) {
          this.connect({
            roomId: room || tiktok || youtube || "sanctuary-main",
            tiktok: tiktok || undefined,
            youtube: youtube || undefined,
            demoBot: autobot ? true : undefined,
          });
        }
      } catch {
        // Ignore URL parse errors in opaque contexts
      }
    }

    /**
     * Connect to Game9K Multi-Tenant Gateway.
     * Accepts either a legacy TikTok username string (`connect("username")`)
     * or a multi-platform config object (`connect({ roomId, tiktok, youtube, youtubeApiKey, demoBot })`).
     */
    connect(targetOrOptions, serverUrl) {
      let opts = {};
      if (typeof targetOrOptions === "string") {
        opts = { roomId: targetOrOptions, tiktok: targetOrOptions };
      } else if (targetOrOptions && typeof targetOrOptions === "object") {
        opts = { ...targetOrOptions };
      } else {
        return;
      }

      const roomId = String(
        opts.roomId || opts.tiktok || opts.youtube || "sanctuary-main"
      )
        .trim()
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/[^a-z0-9_.-]/g, "-");

      this.roomId = roomId;
      this.config = opts;

      // Prefer Socket.io when available on same origin or explicit serverUrl
      if (typeof global.io === "function") {
        if (!this.socket) {
          const base =
            serverUrl ||
            (global.location.origin && global.location.origin !== "null"
              ? global.location.origin
              : undefined);
          this.socket = base ? global.io(base) : global.io();
          this._bindSocketListeners();
        } else if (this.socket.connected) {
          this.socket.emit("join-room", { ...opts, roomId });
        }
        return;
      }

      // Fallback to Server-Sent Events (`/api/sse/:roomId`) if Socket.io client isn't loaded
      if (
        typeof global.EventSource === "function" &&
        global.location.origin &&
        global.location.origin !== "null"
      ) {
        this._connectSseFallback(roomId, opts);
      }
    }

    _bindSocketListeners() {
      this.socket.on("connect", () => {
        this.socket.emit("join-room", { ...this.config, roomId: this.roomId });
      });

      this.socket.on("room-joined", (data) => {
        this._emit("connected", data);
      });

      // Unified event channel (handles both TikTok Live & YouTube Live)
      this.socket.on("stream_event", (evt) => {
        this._routeNormalizedEvent(evt);
      });

      this.socket.on("stream_status", (st) => {
        this._emit("status", st);
        if (st.status === "connected") this._emit("connected", st);
        if (st.status === "disconnected") this._emit("disconnected", st);
        if (st.status === "reconnecting") this._emit("reconnecting", st);
      });

      this.socket.on("connection-error", (err) => {
        this._emit("error", err);
      });
    }

    async _connectSseFallback(roomId, opts) {
      try {
        if (opts.tiktok || opts.youtube || typeof opts.demoBot === "boolean") {
          await fetch(`/api/rooms/${encodeURIComponent(roomId)}/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(opts),
          });
        }
        if (this.sse) this.sse.close();
        this.sse = new global.EventSource(`/api/sse/${encodeURIComponent(roomId)}`);
        this.sse.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data);
            if (parsed.kind === "event" && parsed.event) {
              this._routeNormalizedEvent(parsed.event);
            } else if (parsed.kind === "status" && parsed.status) {
              this._emit("status", parsed.status);
            } else if (parsed.kind === "connected") {
              this._emit("connected", parsed);
            }
          } catch {
            // Ignore malformed frame
          }
        };
      } catch (err) {
        this._emit("error", { message: err?.message || "SSE connection failed" });
      }
    }

    /**
     * Manually ingest an event from local simulator, OBS Browser Source script, or `postMessage`.
     * Normalizes shorthand `{ type: 'gift', user: 'MinhAnh', lane: 0, giftTier: 'meteor', coins: 20 }`
     * into the canonical shape expected by all Game9K listeners.
     */
    ingest(raw) {
      if (!raw || typeof raw !== "object") return;
      const platform = raw.platform || "tiktok";
      const userObj =
        raw.user && typeof raw.user === "object"
          ? raw.user
          : {
              uniqueId: String(raw.user || "viewer")
                .toLowerCase()
                .replace(/\s+/g, "_"),
              nickname: String(raw.user || "Khán Giả"),
              profilePictureUrl: raw.avatar || "",
              platform,
            };

      const type = String(raw.type || "chat").toLowerCase();

      if (type === "gift" || type === "superchat") {
        const coins = Math.max(
          1,
          Number(raw.giftValue ?? raw.coins ?? raw.diamonds ?? 1)
        );
        const tier =
          raw.giftTier ||
          (coins >= 99
            ? "crown"
            : coins >= 20
            ? "meteor"
            : coins >= 10
            ? "banana"
            : coins >= 5
            ? "meat"
            : "rose");
        // Accept both 0-based (0..3) and 1-based (1..4) lane numbers smoothly when `laneOneBased` is set
        let lane = typeof raw.lane === "number" ? raw.lane : null;
        if (lane !== null && raw.laneOneBased) lane = Math.max(0, lane - 1);

        const normalized = {
          type: "gift",
          platform,
          user: userObj,
          giftId: Number(raw.giftId || 1),
          giftName:
            raw.giftName ||
            (platform === "youtube" ? `Super Chat (${coins} xu)` : tier.toUpperCase()),
          giftValue: coins,
          repeatCount: Number(raw.repeatCount || 1),
          giftType: coins >= 99 ? "large" : coins >= 10 ? "medium" : "small",
          giftTier: tier,
          comment: String(raw.comment || raw.text || ""),
          lane,
          timestamp: Date.now(),
        };
        this._routeNormalizedEvent(normalized);
        return normalized;
      }

      if (type === "like") {
        const normalized = {
          type: "like",
          platform,
          user: userObj,
          likeCount: Math.max(1, Number(raw.likeCount || raw.count || 3)),
          timestamp: Date.now(),
        };
        this._routeNormalizedEvent(normalized);
        return normalized;
      }

      if (type === "share" || type === "follow" || type === "join") {
        const normalized = {
          type,
          platform,
          user: userObj,
          timestamp: Date.now(),
        };
        this._routeNormalizedEvent(normalized);
        return normalized;
      }

      const comment = String(raw.comment ?? raw.text ?? "").trim();
      let lane = typeof raw.lane === "number" ? raw.lane : null;
      if (lane === null && comment) {
        const lc = comment.toLowerCase();
        if (/^(#?1\b|croc|cá sấu|vàng)/.test(lc)) lane = 0;
        else if (/^(#?2\b|carno|xanh lá)/.test(lc)) lane = 1;
        else if (/^(#?3\b|trike|tricera|ba sừng|lam)/.test(lc)) lane = 2;
        else if (/^(#?4\b|bary|đỏ|hồng)/.test(lc)) lane = 3;
      }

      const normalized = {
        type: "chat",
        platform,
        user: userObj,
        comment,
        lane,
        timestamp: Date.now(),
      };
      this._routeNormalizedEvent(normalized);
      return normalized;
    }

    _routeNormalizedEvent(evt) {
      this._emit("event", evt);
      if (evt.type && this.handlers[evt.type]) {
        this._emit(evt.type, evt);
      }
    }

    on(eventName, callback) {
      if (typeof callback !== "function") return () => {};
      if (!this.handlers[eventName]) this.handlers[eventName] = [];
      this.handlers[eventName].push(callback);
      return () => {
        this.handlers[eventName] = this.handlers[eventName].filter((fn) => fn !== callback);
      };
    }

    _emit(eventName, payload) {
      const list = this.handlers[eventName];
      if (!list) return;
      for (const fn of list) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[Game9K StreamBridge] Handler error (${eventName}):`, err);
        }
      }
    }
  }

  // ==========================================================================
  // 2. GOOGLE H5 GAMES AD PLACEMENT API WRAPPER (`adConfig` / `adBreak`)
  // ==========================================================================
  class Game9KAdsManager {
    constructor(sdk) {
      this.sdk = sdk;
      this.configured = false;
    }

    ensureConfig() {
      if (this.configured) return;
      this.configured = true;
      if (typeof global.adConfig === "function") {
        global.adConfig({
          preloadAdBreaks: "on",
          sound: "on",
          onReady: () => this.sdk.emitPortalEvent("ads_ready", {}),
        });
      }
    }

    /**
     * Trigger an H5 Ad Break (`preroll`, `start`, `pause`, `next`, `browse`, `reward`).
     * Enforces Google's 2,000ms preroll timeout safety rule and freezes game loop/audio.
     */
    triggerAdBreak({
      type = "next",
      name = "game9k-break",
      onPause = null,
      onResume = null,
      onReward = null,
      onDone = null,
    } = {}) {
      this.ensureConfig();

      // Notify parent portal sandbox if embedded (allows Portal Simulator to mock ad overlays!)
      if (this.sdk.isEmbedded) {
        this.sdk.emitPortalEvent("ad_break_requested", { adType: type, name });
      }

      if (typeof global.adBreak !== "function") {
        // Standalone graceful fallback when Google AdSense H5 tag is absent
        if (type === "reward" && typeof onReward === "function") {
          onReward();
        }
        if (typeof onDone === "function") {
          onDone({ breakStatus: "standalone_simulated", breakType: type });
        }
        return;
      }

      let settled = false;
      const finalize = (info = {}) => {
        if (settled) return;
        settled = true;
        this.sdk._setPaused(false, "ad");
        if (typeof onResume === "function") onResume();
        if (typeof onDone === "function") onDone(info);
      };

      // Hard 2.0s safety timeout per Google H5 Games Ad Placement spec
      const safetyTimer = setTimeout(() => {
        finalize({ breakStatus: "timeout", breakType: type });
      }, 2000);

      global.adBreak({
        type,
        name,
        beforeAd: () => {
          clearTimeout(safetyTimer);
          this.sdk._setPaused(true, "ad");
          if (typeof onPause === "function") onPause();
        },
        afterAd: () => {
          finalize({ breakStatus: "viewed", breakType: type });
        },
        beforeReward: (showAdFn) => {
          clearTimeout(safetyTimer);
          showAdFn();
        },
        adViewed: () => {
          if (typeof onReward === "function") onReward();
        },
        adDismissed: () => {
          // Dismissed early -> no reward granted
        },
        adBreakDone: (placementInfo) => {
          clearTimeout(safetyTimer);
          this.sdk.emitPortalEvent("ad_break_done", placementInfo || {});
          finalize(placementInfo || {});
        },
      });
    }
  }

  // ==========================================================================
  // 3. GAME9K CORE BRIDGE (Sandbox PostMessage, Telemetry <= 20Hz, Legal Lock)
  // ==========================================================================
  class Game9KSDK {
    constructor() {
      this.gameId = "dino-race";
      this.version = "1.0.0";
      this.playerId = this._resolveGuestId();
      this.isEmbedded = Boolean(global.parent && global.parent !== global);
      this.pausedReasons = new Set();
      this.legalLocked = false;
      this.minTelemetryIntervalMs = 66; // ~15 Hz default (strictly <= 20 Hz Supabase limit)
      this.lastTelemetryAt = 0;
      this.pauseListeners = [];

      this.stream = new LiveStreamBridge();
      this.ads = new Game9KAdsManager(this);
      this.storage = SafeStorage;

      if (typeof global.addEventListener === "function") {
        global.addEventListener("message", (evt) => this._handleWindowMessage(evt));
      }
    }

    _resolveGuestId() {
      const existing = SafeStorage.get("g9k_player_id");
      if (existing) return existing;
      const fresh = "g9k_" + Math.random().toString(36).slice(2, 10);
      SafeStorage.set("g9k_player_id", fresh);
      return fresh;
    }

    init({ gameId, version, maxTelemetryHz = 15, onPauseChange } = {}) {
      if (gameId) this.gameId = gameId;
      if (version) this.version = version;
      const clampedHz = Math.max(1, Math.min(20, Number(maxTelemetryHz) || 15));
      this.minTelemetryIntervalMs = Math.ceil(1000 / clampedHz);

      if (typeof onPauseChange === "function") {
        this.pauseListeners.push(onPauseChange);
      }

      this.emitPortalEvent("game_ready", {
        gameId: this.gameId,
        version: this.version,
        mode: this.isEmbedded ? "PORTAL_CONNECTED" : "STANDALONE_G4",
        maxTelemetryHz: clampedHz,
      });

      return this;
    }

    onPauseChange(fn) {
      if (typeof fn === "function") this.pauseListeners.push(fn);
    }

    get isPaused() {
      return this.pausedReasons.size > 0 || this.legalLocked;
    }

    _setPaused(paused, reason = "portal") {
      if (paused) this.pausedReasons.add(reason);
      else this.pausedReasons.delete(reason);
      const nowPaused = this.isPaused;
      for (const fn of this.pauseListeners) {
        try {
          fn(nowPaused, reason);
        } catch {
          // Ignore
        }
      }
    }

    /**
     * Strict MDN Sandbox PostMessage Listener:
     * Only accepts messages from `window.parent` (portal shell) or `window` (local bridge).
     */
    _handleWindowMessage(event) {
      if (event.source !== global.parent && event.source !== global) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "PAUSE_GAME") {
        this._setPaused(true, "portal");
      } else if (msg.type === "RESUME_GAME") {
        this._setPaused(false, "portal");
      } else if (msg.type === "UNDER18_LIMIT_LOCK") {
        // NĐ 147/2024/NĐ-CP compliance: hard-freeze iframe when <18 player exceeds 60m/180m
        this.legalLocked = true;
        this._setPaused(true, "nd147_under18_limit");
      } else if (msg.type === "UNDER18_LIMIT_UNLOCK") {
        this.legalLocked = false;
        this._setPaused(false, "nd147_under18_limit");
      } else if ((msg.type === "TIKTOK_EVENT" || msg.type === "STREAM_EVENT") && msg.payload) {
        this.stream.ingest(msg.payload);
      }
    }

    /**
     * Send structured event to Game9K Parent Portal (`window.parent.postMessage`).
     */
    emitPortalEvent(type, payload = {}) {
      const envelope = {
        source: `game9k:${this.gameId}`,
        gameId: this.gameId,
        version: this.version,
        playerId: this.playerId,
        type,
        timestamp: Date.now(),
        payload,
      };

      if (this.isEmbedded && global.parent) {
        global.parent.postMessage(envelope, "*");
      }
      return envelope;
    }

    /**
     * Throttled Realtime Broadcast tick (guaranteed <= 20 Hz for Supabase Realtime compliance).
     */
    broadcastTick(payload) {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - this.lastTelemetryAt < this.minTelemetryIntervalMs) {
        return false;
      }
      this.lastTelemetryAt = now;
      this.emitPortalEvent("realtime_broadcast_tick", payload);
      return true;
    }

    /**
     * Submit verified race/session score to Portal & local API leaderboard.
     */
    async submitScore(entry = {}) {
      const payload = {
        playerId: this.playerId,
        ...entry,
      };
      this.emitPortalEvent("leaderboard_submit", payload);

      if (global.location?.origin && global.location.origin !== "null") {
        try {
          const res = await fetch(
            `/api/portal/leaderboard/${encodeURIComponent(this.gameId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
          if (res.ok) return await res.json();
        } catch {
          // Offline / G4 standalone fallback
        }
      }
      return { ok: true, offline: true };
    }

    /**
     * Cloud Save (`G2` mode) with transparent SafeStorage (`G4` mode) fallback.
     */
    async saveCloudState(stateObj) {
      SafeStorage.set(`g9k_save_${this.gameId}`, JSON.stringify(stateObj));
      this.emitPortalEvent("cloud_save", { data: stateObj });

      if (global.location?.origin && global.location.origin !== "null") {
        try {
          await fetch(
            `/api/portal/cloud-save/${encodeURIComponent(this.gameId)}/${encodeURIComponent(
              this.playerId
            )}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: stateObj }),
            }
          );
        } catch {
          // Ignore in offline G4 mode
        }
      }
    }

    async loadCloudState() {
      if (global.location?.origin && global.location.origin !== "null") {
        try {
          const res = await fetch(
            `/api/portal/cloud-save/${encodeURIComponent(this.gameId)}/${encodeURIComponent(
              this.playerId
            )}`
          );
          if (res.ok) {
            const json = await res.json();
            if (json?.save?.data) return json.save.data;
          }
        } catch {
          // Fallback to SafeStorage
        }
      }
      const localRaw = SafeStorage.get(`g9k_save_${this.gameId}`);
      if (!localRaw) return null;
      try {
        return JSON.parse(localRaw);
      } catch {
        return null;
      }
    }
  }

  const sdkInstance = new Game9KSDK();
  global.Game9K = sdkInstance;
  global.LiveStreamBridge = sdkInstance.stream;
  // 100% compatibility alias for `vamnguyen/tiktok-live-games` & KOL scripts
  global.TikTokBridge = sdkInstance.stream;
})(typeof window !== "undefined" ? window : globalThis);
