/**
 * game9k-sdk.js
 * Official Unified Browser SDK for Game9K Starter Kit (v9.0.0)
 *
 * Unifies thirteen production modules under the Poki Portal SDK Sandbox Bridge (`<iframe sandbox="allow-scripts">`):
 *   1. Poki Portal SDK (`window.PokiSDK` + `window.Game9K.poki`)
 *   2. Xsolla SDK 3 — 4-Step Game Monetization (`window.XsollaSDK` + `window.Game9K.xsolla`)
 *   3. Splice Spec-to-SDK & Mock Gateway (`window.SpliceSDK` + `PokiSDK.splice`)
 *   4. Counter POS & KDS Live-Ops Economy (`window.Game9KPOS` + `PokiSDK.economy`)
 *   5. E2B Runtime Sandbox & Snapshot Orchestrator (`window.E2BRuntimeSDK` + `PokiSDK.runtime`)
 *   6. E2B Stateful Code Interpreter & Chart Kernel (`window.CodeInterpreterSDK` + `PokiSDK.interpreter`)
 *   7. E2B Fragments & Morph Lazy Patch Engine (`window.FragmentsSDK` + `PokiSDK.fragments`)
 *   8. Open Computer Use Vision/Grounding/Action Agent (`window.ComputerUseSDK` + `PokiSDK.computerUse`)
 *   9. OpenRouter Multimodal v7 (Audio Speech TTS, Transparent Sprite/9:16 Poster Images, KOL Sub-Keys, Sticky Prompt Cache, OAuth PKCE & Vercel Stream) (`window.OpenRouterSDK` + `PokiSDK.ai`)
 *  10. AgentOps Observability, Helicone Cache, Chidori Reactive Bus, SID Capsule & Steamship Webhooks (`window.AgentOpsSDK` + `PokiSDK.agentOps`)
 *  11. Cloud & Edge Launchpad (Cloudflare R2 SigV4, Supabase Dual-Write, Solana Ed25519 Milestones & NĐ 147 U18 Guard) (`window.CloudEdgeSDK` + `PokiSDK.cloud`)
 *  12. Multi-Game KOL Esports Arena (ELO Brackets, HMAC Anti-Cheat Proofs, Cross-Game Battle Pass & 70/20/10 Creator RevShare) (`window.ArenaSDK` + `PokiSDK.arena`)
 *  13. Game9K Core Quota-Safe `SafeStorage` & Multi-Platform KOL Stream Bridge (`window.TikTokBridge`)
 */
(function initGame9KGlobal(global) {
  "use strict";

  // ==========================================================================
  // 0. QUOTA-SAFE VERSIONED STORAGE (`<iframe sandbox="allow-scripts">` SAFE)
  // ==========================================================================
  const memoryStore = new Map();
  const quotaHandlers = [];

  function isQuotaError(err) {
    if (!err) return false;
    return (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014
    );
  }

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
        return true;
      } catch (err) {
        if (isQuotaError(err)) {
          for (const fn of quotaHandlers) {
            try {
              fn(key, err);
            } catch {
              // Ignore listener errors
            }
          }
        }
        return false;
      }
    },
    remove(key) {
      memoryStore.delete(key);
      try {
        global.localStorage.removeItem(key);
      } catch {
        // Ignore in opaque origin
      }
    },
    getJson(key, fallback = null) {
      const raw = this.get(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    setJson(key, obj) {
      return this.set(key, JSON.stringify(obj));
    },
    onQuotaExceeded(fn) {
      if (typeof fn === "function") quotaHandlers.push(fn);
    },
    getBytesUsed() {
      const merged = new Map(memoryStore);
      try {
        for (let i = 0; i < global.localStorage.length; i++) {
          const k = global.localStorage.key(i);
          if (!k) continue;
          merged.set(k, global.localStorage.getItem(k) || "");
        }
      } catch {
        // Opaque origin fallback uses memoryStore entries in `merged`
      }
      let totalChars = 0;
      for (const [k, v] of merged.entries()) {
        totalChars += String(k).length + String(v).length;
      }
      return totalChars * 2;
    },
    migrateVersion(prefix, fromSuffix, toSuffix) {
      const oldKey = `${prefix}_${fromSuffix}`;
      const newKey = `${prefix}_${toSuffix}`;
      const existingNew = this.get(newKey);
      if (existingNew !== null) return false;
      const legacy = this.get(oldKey);
      if (legacy !== null) {
        this.set(newKey, legacy);
        return true;
      }
      return false;
    },
  };

  function hasHttpOrigin() {
    try {
      return Boolean(
        global.location &&
          typeof global.location.origin === "string" &&
          /^https?:\/\//i.test(global.location.origin)
      );
    } catch {
      return false;
    }
  }

  function hashCodeHex(input) {
    const str = String(input || "guest");
    let h1 = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h1 ^= str.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let n = h1 >>> 0;
    for (let i = 0; i < 6; i++) {
      code += alphabet[(n + i * 7) % alphabet.length];
      n = Math.floor(n / 5) ^ ((h1 >>> (i * 3)) & 0xff);
    }
    return code;
  }

  // Offline / Standalone fallback catalog mirroring `XsollaCommerceService.js`
  const OFFLINE_REGIONS = {
    VN: {
      country: "VN",
      countryName: "Vietnam",
      currency: "VND",
      symbol: "₫",
      usdRate: 25000,
      decimals: 0,
      taxRate: 0.1,
      taxLabel: "10% VAT (VN)",
      paymentMethods: [
        { id: "vietqr", label: "VietQR Napas 24/7", badge: "Phổ biến #1 VN" },
        { id: "momo", label: "Ví MoMo", badge: "1-Chạm" },
        { id: "zalopay", label: "ZaloPay", badge: "QR / Ví" },
        { id: "card_4242", label: "Visa / Mastercard (Test 4242)", badge: "Global" },
      ],
    },
    US: {
      country: "US",
      countryName: "United States",
      currency: "USD",
      symbol: "$",
      usdRate: 1,
      decimals: 2,
      taxRate: 0.0825,
      taxLabel: "8.25% US Sales Tax",
      paymentMethods: [
        { id: "card_4242", label: "Visa / Mastercard (Xsolla Test 4242)", badge: "Instant" },
        { id: "apple_pay", label: "Apple Pay", badge: "iOS/Web" },
        { id: "google_pay", label: "Google Pay", badge: "Android/Web" },
      ],
    },
    DE: {
      country: "DE",
      countryName: "Germany (EU)",
      currency: "EUR",
      symbol: "€",
      usdRate: 0.92,
      decimals: 2,
      taxRate: 0.19,
      taxLabel: "19% EU VAT",
      paymentMethods: [
        { id: "sepa_klarna", label: "Klarna / Sofort", badge: "EU" },
        { id: "card_4242", label: "Visa / Mastercard (Test 4242)", badge: "Global" },
      ],
    },
    JP: {
      country: "JP",
      countryName: "Japan",
      currency: "JPY",
      symbol: "¥",
      usdRate: 152,
      decimals: 0,
      taxRate: 0.1,
      taxLabel: "10% JCT",
      paymentMethods: [
        { id: "paypay", label: "PayPay", badge: "JP #1" },
        { id: "card_4242", label: "JCB / Visa (Test 4242)", badge: "Card" },
      ],
    },
  };

  const OFFLINE_SKUS = [
    {
      sku: "amber_gems_100",
      gameId: "dino-race",
      name: "100 Hổ Phách Nộ Khí (Amber Gems)",
      nameEn: "100 Sanctuary Amber Gems",
      type: "consumable",
      category: "virtual_currency",
      priceUsd: 0.99,
      icon: "💎",
      grant: { amberGems: 100, boostRefill: true },
      description: "Nạp đầy thanh Nộ Khí Gầm Thét tức thì + 100 Hổ Phách.",
    },
    {
      sku: "revive_turbo_surge",
      gameId: "dino-race",
      name: "Bứt Tốc Khẩn Cấp (Impulse Surge)",
      nameEn: "Instant Primal Turbo Surge",
      type: "consumable",
      category: "impulse_item",
      priceUsd: 1.99,
      icon: "⚡",
      grant: { amberGems: 50, consumableKey: "turbo_surge", quantity: 3 },
      description: "3 lần phá choáng Thiên Thạch & phóng vọt 4.0s.",
    },
    {
      sku: "kol_meteor_pack_5",
      gameId: "dino-race",
      name: "Gói 5 Thiên Thạch Phá Đám Top 1",
      nameEn: "5x Leader Meteor Strike Pack",
      type: "consumable",
      category: "stream_powerup",
      priceUsd: 2.99,
      icon: "☄️",
      grant: { amberGems: 120, consumableKey: "meteor_strike", quantity: 5 },
      description: "Triệu hồi 5 quả cầu lửa giáng thẳng vào khủng long dẫn đầu.",
    },
    {
      sku: "golden_croc_skin",
      gameId: "dino-race",
      name: "Skin Cá Sấu Hoàng Kim (Vĩnh Viễn)",
      nameEn: "Golden Crocodilia Sovereign Skin",
      type: "non_consumable",
      category: "cosmetic_entitlement",
      priceUsd: 3.99,
      icon: "🐊",
      grant: { entitlement: "golden_croc_skin", amberGems: 150 },
      description: "Mở khóa vĩnh viễn vảy Hoàng Kim + hỗ trợ Restore Purchases.",
    },
    {
      sku: "sanctuary_vip_pass",
      gameId: "all",
      name: "Vé VIP Cổng Game9K (Miễn Quảng Cáo)",
      nameEn: "Game9K Portal Ad-Free VIP Pass",
      type: "non_consumable",
      category: "portal_pass",
      priceUsd: 4.99,
      icon: "👑",
      grant: { entitlement: "sanctuary_vip_pass", adFreeVip: true, amberGems: 300 },
      description: "Tự động bỏ qua mọi quảng cáo Poki commercialBreak() giữa trận + 300 Hổ Phách!",
    },
  ];

  function formatRegionalMoney(amount, region) {
    if (region.decimals === 0) {
      const rounded =
        region.currency === "VND" ? Math.round(amount / 1000) * 1000 : Math.round(amount);
      return {
        amount: rounded,
        formatted:
          region.currency === "VND"
            ? `${rounded.toLocaleString("vi-VN")} ${region.symbol}`
            : `${region.symbol}${rounded.toLocaleString("en-US")}`,
      };
    }
    const fixed = Number(amount.toFixed(region.decimals));
    return {
      amount: fixed,
      formatted: `${region.symbol}${fixed.toFixed(region.decimals)}`,
    };
  }

  // ==========================================================================
  // 1. MULTI-PLATFORM LIVE STREAM BRIDGE (TikTok Live + YouTube Live + OBS)
  // ==========================================================================
  class LiveStreamBridge {
    constructor() {
      this.socket = null;
      this.sse = null;
      this.pairSockets = new Map();
      this.pairSse = new Map();
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

      if (typeof global.addEventListener === "function") {
        global.addEventListener("DOMContentLoaded", () => this.autoConnectFromQuery());
      }
    }

    autoConnectFromQuery() {
      try {
        const params = new URLSearchParams(global.location.search || "");
        const tiktok =
          params.get("tiktok") || params.get("id") || params.get("username") || "";
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

    connect(targetOrOptions, serverUrl) {
      let opts = {};
      if (typeof targetOrOptions === "string") {
        opts = { roomId: targetOrOptions, tiktok: targetOrOptions };
      } else if (targetOrOptions && typeof targetOrOptions === "object") {
        opts = { ...targetOrOptions };
      } else {
        return;
      }

      const roomId = String(opts.roomId || opts.tiktok || opts.youtube || "sanctuary-main")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/[^a-z0-9_.-]/g, "-");

      this.roomId = roomId;
      this.config = opts;

      if (typeof global.io === "function") {
        if (!this.socket) {
          const base = serverUrl || (hasHttpOrigin() ? global.location.origin : undefined);
          this.socket = base ? global.io(base) : global.io();
          this._bindSocketListeners();
        } else if (this.socket.connected) {
          this.socket.emit("join-room", { ...opts, roomId });
        }
        return;
      }

      if (typeof global.EventSource === "function" && hasHttpOrigin()) {
        this._connectSseFallback(roomId, opts);
      }
    }

    /**
     * Connect two isolated upstream rooms for a PK battle. Each socket carries
     * its team label to the gateway, so normalized events stay attributable
     * even when both creators use the same platform.
     */
    connectPair(pair = {}, serverUrl) {
      this.socket?.disconnect?.();
      this.socket = null;
      this.sse?.close?.();
      this.sse = null;
      for (const socket of this.pairSockets.values()) socket.disconnect?.();
      for (const source of this.pairSse.values()) source.close?.();
      this.pairSockets.clear();
      this.pairSse.clear();

      const entries = [
        ["A", pair.A || pair.a || {}],
        ["B", pair.B || pair.b || {}],
      ];
      const base = serverUrl || (hasHttpOrigin() ? global.location.origin : undefined);
      this.roomId = "pk-pair";
      this.config = { pair: true };

      for (const [team, rawOpts] of entries) {
        const opts = { ...(rawOpts || {}), team };
        const roomId = String(opts.roomId || opts.tiktok || opts.youtube || `marble-pk-${team}`)
          .trim()
          .toLowerCase()
          .replace(/^@+/, "")
          .replace(/[^a-z0-9_.-]/g, "-");

        if (typeof global.io === "function") {
          const socket = base ? global.io(base) : global.io();
          this.pairSockets.set(team, socket);
          socket.on("connect", () => socket.emit("join-room", { ...opts, roomId, team }));
          socket.on("room-joined", (data) => this._emit("connected", { ...data, team, roomId }));
          socket.on("stream_event", (evt) =>
            this._routeNormalizedEvent({ ...evt, team: evt?.team || team, streamerTeam: evt?.streamerTeam || team })
          );
          socket.on("stream_status", (st) => {
            const status = { ...st, team, roomId };
            this._emit("status", status);
            if (st.status === "connected") this._emit("connected", status);
            if (st.status === "disconnected") this._emit("disconnected", status);
            if (st.status === "reconnecting") this._emit("reconnecting", status);
          });
          socket.on("connection-error", (err) => this._emit("error", { ...err, team, roomId }));
        } else if (typeof global.EventSource === "function" && hasHttpOrigin()) {
          this._connectPairSse(team, roomId, opts);
        }
      }
      return { ok: true, teams: entries.map(([team, opts]) => ({ team, roomId: opts.roomId || null })) };
    }

    async _connectPairSse(team, roomId, opts) {
      try {
        await fetch(`/api/rooms/${encodeURIComponent(roomId)}/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...opts, team }),
        });
        const source = new global.EventSource(`/api/sse/${encodeURIComponent(roomId)}`);
        this.pairSse.set(team, source);
        source.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data);
            if (parsed.kind === "event" && parsed.event) {
              this._routeNormalizedEvent({ ...parsed.event, team: parsed.event.team || team, streamerTeam: parsed.event.streamerTeam || team });
            } else if (parsed.kind === "status" && parsed.status) {
              this._emit("status", { ...parsed.status, team, roomId });
            } else if (parsed.kind === "connected") {
              this._emit("connected", { ...parsed, team, roomId });
            }
          } catch {
            // Ignore malformed SSE frame
          }
        };
      } catch (err) {
        this._emit("error", { message: err?.message || "PK SSE connection failed", team, roomId });
      }
    }

    _bindSocketListeners() {
      this.socket.on("connect", () => {
        this.socket.emit("join-room", { ...this.config, roomId: this.roomId });
      });
      this.socket.on("room-joined", (data) => this._emit("connected", data));
      this.socket.on("stream_event", (evt) => this._routeNormalizedEvent(evt));
      this.socket.on("stream_status", (st) => {
        this._emit("status", st);
        if (st.status === "connected") this._emit("connected", st);
        if (st.status === "disconnected") this._emit("disconnected", st);
        if (st.status === "reconnecting") this._emit("reconnecting", st);
      });
      this.socket.on("connection-error", (err) => this._emit("error", err));
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
      const team = raw.team === "B" ? "B" : raw.team === "A" ? "A" : undefined;

      if (type === "gift" || type === "superchat") {
        const coins = Math.max(1, Number(raw.giftValue ?? raw.coins ?? raw.diamonds ?? 1));
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
        let lane = typeof raw.lane === "number" ? raw.lane : null;
        if (lane !== null && raw.laneOneBased) lane = Math.max(0, lane - 1);

        const normalized = {
          type: "gift",
          platform,
          team,
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
          team,
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
          team,
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
        team,
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
  // 2. GOOGLE H5 GAMES AD PLACEMENT + BUILT-IN PORTAL AD OVERLAY
  // ==========================================================================
  class Game9KAdsManager {
    constructor(sdk) {
      this.sdk = sdk;
      this.configured = false;
      this.adBusy = false;
      this.adBlocked = false;
      this.simulateInteractiveOverlay = false;
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
     * Renders a lightweight Canvas/DOM interstitial or rewarded break modal when running
     * standalone in interactive demo mode (`setDebug(true)` or `rewardedBreak`).
     */
    _showStandaloneBreakModal({ kind = "commercial", size = "medium", durationMs = 1400 }) {
      if (typeof document === "undefined" || !document.body) {
        return Promise.resolve({ viewed: true });
      }
      return new Promise((resolve) => {
        const host = document.createElement("div");
        host.style.cssText =
          "position:fixed;inset:0;z-index:99998;background:rgba(4,10,14,0.88);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;color:#f8fafc;";
        const isReward = kind === "rewarded";
        host.innerHTML = `
          <div style="max-width:380px;width:100%;background:#0f172a;border:1px solid ${
            isReward ? "#f59e0b" : "#38bdf8"
          };border-radius:18px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,0.65);text-align:center;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${
              isReward ? "#fbbf24" : "#38bdf8"
            };">
              ${isReward ? `POKI REWARDED BREAK (${size.toUpperCase()})` : "POKI COMMERCIAL BREAK"}
            </div>
            <div style="font-size:28px;margin:10px 0;">${isReward ? "🎁" : "📺"}</div>
            <div style="font-size:14px;font-weight:700;margin-bottom:6px;">
              ${
                isReward
                  ? "Xem hết quảng cáo ngắn để nhận phần thưởng!"
                  : "Đang chuyển chặng trên Cổng Game9K..."
              }
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:14px;">
              Gameplay & âm thanh đã tự động tạm dừng an toàn theo chuẩn PokiSDK.
            </div>
            <div style="height:6px;background:#1e293b;border-radius:999px;overflow:hidden;margin-bottom:14px;">
              <div id="g9k-ad-bar" style="height:100%;width:0%;background:${
                isReward ? "#f59e0b" : "#38bdf8"
              };transition:width 120ms linear;"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:center;">
              ${
                isReward
                  ? `<button id="g9k-ad-skip" type="button" style="padding:8px 14px;border-radius:10px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;font-size:12px;font-weight:700;cursor:pointer;">Bỏ qua (Không nhận thưởng)</button>`
                  : ""
              }
              <span id="g9k-ad-timer" style="padding:8px 14px;border-radius:10px;background:#020617;color:#34d399;font-family:monospace;font-size:12px;font-weight:700;">
                ${(durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        `;
        document.body.appendChild(host);

        const bar = host.querySelector("#g9k-ad-bar");
        const timerEl = host.querySelector("#g9k-ad-timer");
        const skipBtn = host.querySelector("#g9k-ad-skip");
        const startedAt = Date.now();
        let closed = false;

        const finish = (viewed) => {
          if (closed) return;
          closed = true;
          clearInterval(iv);
          host.remove();
          resolve({ viewed });
        };

        if (skipBtn) {
          skipBtn.addEventListener("click", () => finish(false));
        }

        const iv = setInterval(() => {
          const elapsed = Date.now() - startedAt;
          const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
          if (bar) bar.style.width = `${pct}%`;
          if (timerEl) {
            timerEl.textContent = `${Math.max(0, (durationMs - elapsed) / 1000).toFixed(1)}s`;
          }
          if (elapsed >= durationMs) {
            finish(true);
          }
        }, 80);
      });
    }

    triggerAdBreak({
      type = "next",
      name = "game9k-break",
      size = "medium",
      interactive = false,
      onPause = null,
      onResume = null,
      onReward = null,
      onDone = null,
    } = {}) {
      this.ensureConfig();

      if (this.adBlocked) {
        if (typeof onDone === "function") {
          onDone({ breakStatus: "ad_blocked", breakType: type, rewarded: false });
        }
        return;
      }

      // Skip mid-roll commercial breaks automatically if player owns Xsolla Ad-Free VIP Pass!
      if (type !== "reward" && this.sdk.xsolla?.hasEntitlement("sanctuary_vip_pass")) {
        this.sdk.emitPortalEvent("ad_break_skipped_vip", { adType: type, name });
        if (typeof onDone === "function") {
          onDone({ breakStatus: "vip_ad_free_skipped", breakType: type, rewarded: false });
        }
        return;
      }

      if (this.sdk.isEmbedded) {
        this.sdk.emitPortalEvent("ad_break_requested", { adType: type, name, size });
      }

      // Delegate to Parent Portal Host via RPC when embedded inside Portal Shell (`portal.html`)
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        this.adBusy = true;
        this.sdk._setPaused(true, "ad");
        if (typeof onPause === "function") onPause();

        this.sdk
          ._portalRpc(
            type === "reward" ? "poki_rewarded_break" : "poki_commercial_break",
            { name, size },
            15000
          )
          .then((res) => {
            const rewarded = Boolean(res?.rewarded);
            if (type === "reward" && rewarded && typeof onReward === "function") {
              onReward();
            }
            this.adBusy = false;
            this.sdk._setPaused(false, "ad");
            if (typeof onResume === "function") onResume();
            if (typeof onDone === "function") {
              onDone({
                breakStatus: rewarded || type !== "reward" ? "viewed" : "dismissed",
                breakType: type,
                rewarded,
              });
            }
          })
          .catch(() => {
            this.adBusy = false;
            this.sdk._setPaused(false, "ad");
            if (typeof onResume === "function") onResume();
            if (typeof onDone === "function") {
              onDone({ breakStatus: "portal_fallback", breakType: type, rewarded: false });
            }
          });
        return;
      }

      if (typeof global.adBreak !== "function") {
        if (interactive || this.simulateInteractiveOverlay) {
          this.adBusy = true;
          this.sdk._setPaused(true, "ad");
          if (typeof onPause === "function") onPause();
          this._showStandaloneBreakModal({
            kind: type === "reward" ? "rewarded" : "commercial",
            size,
            durationMs: type === "reward" ? 1600 : 1100,
          }).then(({ viewed }) => {
            this.adBusy = false;
            this.sdk._setPaused(false, "ad");
            if (type === "reward" && viewed && typeof onReward === "function") {
              onReward();
            }
            if (typeof onResume === "function") onResume();
            if (typeof onDone === "function") {
              onDone({
                breakStatus: viewed ? "viewed" : "dismissed",
                breakType: type,
                rewarded: Boolean(type === "reward" && viewed),
              });
            }
          });
          return;
        }

        // Non-blocking fast standalone resolution (unit tests / headless / quick play)
        if (type === "reward" && typeof onReward === "function") {
          onReward();
        }
        if (typeof onDone === "function") {
          onDone({
            breakStatus: "standalone_simulated",
            breakType: type,
            rewarded: type === "reward",
          });
        }
        return;
      }

      let settled = false;
      let rewardGranted = false;
      this.adBusy = true;

      const finalize = (info = {}) => {
        if (settled) return;
        settled = true;
        this.adBusy = false;
        this.sdk._setPaused(false, "ad");
        if (typeof onResume === "function") onResume();
        if (typeof onDone === "function") {
          onDone({ ...info, rewarded: rewardGranted });
        }
      };

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
          rewardGranted = true;
          if (typeof onReward === "function") onReward();
        },
        adDismissed: () => {
          rewardGranted = false;
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
  // 3. XSOLLA SDK 3 — 4-STEP GAME MONETIZATION CLIENT (`window.XsollaSDK`)
  // ==========================================================================
  class Game9KXsollaClient {
    constructor(sdk) {
      this.sdk = sdk;
      this.settings = {
        projectId: 249001,
        loginId: "026201e3-7e40-4784-b61b-a75979884924",
        sandbox: true,
        country: "VN",
        platform: "web_portal",
        browserMode: "portal_modal", // 'portal_modal' | 'paystation_overlay' | 'external'
        webhookMode: false,
        buyButton: false,
        registeredProducts: [],
      };

      this.user = null;
      this.accessToken = null;
      this.catalog = [];
      this.region = OFFLINE_REGIONS.VN;
      this.lastOrder = null;
      this.checkoutBusy = false;
      this.purchaseListeners = [];
      this.eventListeners = [];
      this.inventory = this._loadCachedInventory();
    }

    _loadCachedInventory() {
      const raw = SafeStorage.get("g9k_xsolla_inventory");
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {
          // Ignore corrupt cache
        }
      }
      return {
        amberGems: 50,
        consumables: {},
        entitlements: [],
        adFreeVip: false,
        transactions: [],
      };
    }

    _saveCachedInventory() {
      SafeStorage.set("g9k_xsolla_inventory", JSON.stringify(this.inventory));
    }

    configure(overrides = {}) {
      if (overrides && typeof overrides === "object") {
        if (Array.isArray(overrides.products)) {
          this.settings.registeredProducts = overrides.products.slice();
        }
        Object.assign(this.settings, overrides);
      }
      this._emitStep("configure", { settings: { ...this.settings } });
      return this;
    }

    addProducts(skus = []) {
      if (Array.isArray(skus)) {
        this.settings.registeredProducts = Array.from(
          new Set([...this.settings.registeredProducts, ...skus])
        );
      }
      return this;
    }

    onPurchase(listener) {
      if (typeof listener === "function") this.purchaseListeners.push(listener);
      return () => {
        this.purchaseListeners = this.purchaseListeners.filter((fn) => fn !== listener);
      };
    }

    onEvent(listener) {
      if (typeof listener === "function") this.eventListeners.push(listener);
      return () => {
        this.eventListeners = this.eventListeners.filter((fn) => fn !== listener);
      };
    }

    _emitStep(eventType, detail = {}) {
      const record = {
        event: eventType,
        timestamp: new Date().toISOString(),
        ...detail,
      };
      for (const fn of this.eventListeners) {
        try {
          fn(record);
        } catch {
          // Ignore listener error
        }
      }
      this.sdk.emitPortalEvent(`xsolla_${eventType}`, detail);
    }

    hasEntitlement(sku) {
      if (sku === "sanctuary_vip_pass" && this.inventory.adFreeVip) return true;
      return Array.isArray(this.inventory.entitlements)
        ? this.inventory.entitlements.includes(sku)
        : false;
    }

    getInventory() {
      return {
        ...this.inventory,
        entitlements: [...(this.inventory.entitlements || [])],
        consumables: { ...(this.inventory.consumables || {}) },
        transactions: [...(this.inventory.transactions || [])],
      };
    }

    consumeLocalItem(consumableKey, amount = 1) {
      const current = Number(this.inventory.consumables?.[consumableKey] || 0);
      if (current < amount) return false;
      this.inventory.consumables[consumableKey] = current - amount;
      this._saveCachedInventory();
      return true;
    }

    /**
     * STEP 01: AUTHENTICATE
     * Silent Device ID auth (default, zero login friction) or Portal SSO / Server Login.
     */
    async authenticate(options = {}) {
      const payload = {
        method: options.method || "device_id",
        deviceId: options.deviceId || this.sdk.playerId,
        playerId: this.sdk.playerId,
        userId: options.userId || undefined,
        nickname: options.nickname || undefined,
        projectId: options.projectId || this.settings.projectId,
        loginId: options.loginId || this.settings.loginId,
        sandbox: options.sandbox ?? this.settings.sandbox,
        country: options.country || this.settings.country,
        platform: options.platform || this.settings.platform,
      };
      if (options.country) this.settings.country = options.country;

      let result = null;

      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        try {
          result = await this.sdk._portalRpc("xsolla_authenticate", payload, 6000);
        } catch {
          result = null;
        }
      }

      if (!result && hasHttpOrigin()) {
        try {
          const res = await fetch("/api/xsolla/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) result = await res.json();
        } catch {
          result = null;
        }
      }

      if (!result || !result.ok) {
        const explorerId = hashCodeHex(payload.deviceId);
        const reg =
          OFFLINE_REGIONS[String(payload.country || "VN").toUpperCase()] ||
          OFFLINE_REGIONS.VN;
        result = {
          ok: true,
          step: "01_authenticate",
          offlineFallback: true,
          user: {
            userId: `xsolla_${explorerId.toLowerCase()}`,
            explorerId,
            nickname: payload.nickname || `Player_${explorerId}`,
            method: payload.method,
            projectId: payload.projectId,
            loginId: payload.loginId,
            sandbox: payload.sandbox,
            country: reg.country,
            currency: reg.currency,
          },
          accessToken: `xl3.local.${explorerId.toLowerCase()}`,
          payStationHost: payload.sandbox
            ? "sandbox-secure.xsolla.com"
            : "secure.xsolla.com",
        };
      }

      this.user = result.user;
      this.accessToken = result.accessToken;
      if (result.inventorySummary) {
        this.inventory.amberGems =
          result.inventorySummary.amberGems ?? this.inventory.amberGems;
        if (Array.isArray(result.inventorySummary.entitlements)) {
          this.inventory.entitlements = Array.from(
            new Set([
              ...(this.inventory.entitlements || []),
              ...result.inventorySummary.entitlements,
            ])
          );
        }
        if (result.inventorySummary.adFreeVip) this.inventory.adFreeVip = true;
        this._saveCachedInventory();
      }

      this._emitStep("authenticated", {
        userId: this.user.userId,
        explorerId: this.user.explorerId,
        country: this.user.country,
        currency: this.user.currency,
      });

      return result;
    }

    /**
     * STEP 02: LOAD CATALOG
     * Fetches localized virtual items / currencies with VAT & Xsolla 5% fee breakdown.
     */
    async loadCatalog(options = {}) {
      const country = String(
        options.country || this.settings.country || this.user?.country || "VN"
      ).toUpperCase();
      this.settings.country = country;
      const gameId = options.gameId !== undefined ? options.gameId : this.sdk.gameId;
      const skusList =
        options.skus ||
        (this.settings.registeredProducts.length > 0
          ? this.settings.registeredProducts
          : null);

      let result = null;

      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        try {
          result = await this.sdk._portalRpc(
            "xsolla_load_catalog",
            { country, gameId, skus: skusList },
            6000
          );
        } catch {
          result = null;
        }
      }

      if (!result && hasHttpOrigin()) {
        try {
          const qs = new URLSearchParams({ country });
          if (gameId) qs.set("gameId", gameId);
          if (Array.isArray(skusList) && skusList.length > 0) {
            qs.set("skus", skusList.join(","));
          }
          const res = await fetch(`/api/xsolla/catalog?${qs.toString()}`);
          if (res.ok) result = await res.json();
        } catch {
          result = null;
        }
      }

      if (!result || !result.ok) {
        const reg = OFFLINE_REGIONS[country] || OFFLINE_REGIONS.VN;
        const items = OFFLINE_SKUS.filter((it) => {
          if (Array.isArray(skusList) && skusList.length > 0 && !skusList.includes(it.sku)) {
            return false;
          }
          if (gameId && it.gameId !== "all" && it.gameId !== gameId) return false;
          return true;
        }).map((it) => {
          const sub = formatRegionalMoney(it.priceUsd * reg.usdRate, reg);
          const tax = formatRegionalMoney(sub.amount * reg.taxRate, reg);
          const tot = formatRegionalMoney(sub.amount + tax.amount, reg);
          const fee = formatRegionalMoney(sub.amount * 0.05, reg);
          const net = formatRegionalMoney(sub.amount * 0.95, reg);
          return {
            ...it,
            name: reg.country === "VN" ? it.name : it.nameEn,
            pricing: {
              currency: reg.currency,
              country: reg.country,
              subtotal: sub.amount,
              subtotalFormatted: sub.formatted,
              taxRate: reg.taxRate,
              taxLabel: reg.taxLabel,
              taxAmount: tax.amount,
              taxFormatted: tax.formatted,
              total: tot.amount,
              totalFormatted: tot.formatted,
              xsollaFeeRate: 0.05,
              xsollaFeeFormatted: fee.formatted,
              studioNetFormatted: net.formatted,
            },
          };
        });
        result = {
          ok: true,
          step: "02_load_catalog",
          offlineFallback: true,
          projectId: this.settings.projectId,
          region: reg,
          items,
        };
      }

      this.catalog = result.items || [];
      this.region = result.region || OFFLINE_REGIONS.VN;
      this._emitStep("catalog_loaded", {
        count: this.catalog.length,
        country: this.region.country,
        currency: this.region.currency,
      });
      return result;
    }

    /**
     * Renders an interactive Xsolla Pay Station 4 Checkout Modal when running standalone.
     */
    _openStandalonePayStationModal(order) {
      if (typeof document === "undefined" || !document.body) {
        return Promise.resolve({
          action: "pay",
          paymentMethod: order.paymentMethods?.[0]?.id || "card_4242",
        });
      }

      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;inset:0;z-index:99999;background:rgba(3,7,18,0.86);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,-apple-system,sans-serif;color:#f8fafc;";

        const methods = order.paymentMethods || OFFLINE_REGIONS.VN.paymentMethods;
        let selectedMethod = methods[0]?.id || "card_4242";

        const methodsHtml = methods
          .map(
            (m, idx) => `
            <button type="button" data-ps-method="${m.id}" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:11px;border:1px solid ${
              idx === 0 ? "#10b981" : "#334155"
            };background:${
              idx === 0 ? "rgba(16,185,129,0.14)" : "#0f172a"
            };color:#f8fafc;font-size:12px;font-weight:700;cursor:pointer;text-align:left;margin-bottom:7px;">
              <span>${m.label}</span>
              <span style="font-size:10px;padding:2px 7px;border-radius:999px;background:#1e293b;color:#34d399;">${
                m.badge
              }</span>
            </button>`
          )
          .join("");

        overlay.innerHTML = `
          <div style="max-width:430px;width:100%;background:#0b1120;border:1px solid rgba(52,211,153,0.45);border-radius:20px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,0.75);">
            <div style="padding:14px 18px;background:linear-gradient(90deg,#064e3b,#0f172a);border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:10px;font-weight:800;letter-spacing:0.08em;color:#34d399;text-transform:uppercase;">
                  XSOLLA PAY STATION 4 · ${order.sandbox ? "SANDBOX" : "LIVE"}
                </div>
                <div style="font-size:13px;font-weight:800;color:#fff;margin-top:2px;">
                  Thanh toán Bảo mật Đa Quốc Gia (${order.country} · ${order.currency})
                </div>
              </div>
              <button type="button" id="g9k-ps-close" style="background:#1e293b;border:0;color:#cbd5e1;width:28px;height:28px;border-radius:8px;cursor:pointer;font-weight:800;">✕</button>
            </div>
            <div style="padding:18px;">
              <div style="display:flex;align-items:center;justify-content:space-between;background:#020617;border:1px solid #1e293b;border-radius:13px;padding:12px;margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:26px;">${order.icon || "💎"}</span>
                  <div>
                    <div style="font-size:13px;font-weight:800;color:#fbbf24;">${order.productName}</div>
                    <div style="font-size:11px;color:#94a3b8;">User: <code style="color:#38bdf8;">${
                      order.explorerId || order.userId
                    }</code> · SKU: <code>${order.sku}</code></div>
                  </div>
                </div>
              </div>

              <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">
                Chọn phương thức thanh toán (1,000+ kênh toàn cầu):
              </div>
              <div id="g9k-ps-methods">${methodsHtml}</div>

              <div style="background:#020617;border:1px solid #1e293b;border-radius:12px;padding:10px 12px;font-size:11px;margin:12px 0;space-y:4px;">
                <div style="display:flex;justify-content:space-between;color:#cbd5e1;margin-bottom:4px;">
                  <span>Tạm tính vật phẩm:</span>
                  <span>${order.subtotalFormatted}</span>
                </div>
                <div style="display:flex;justify-content:space-between;color:#94a3b8;margin-bottom:6px;">
                  <span>Thuế tự động (${order.taxLabel}):</span>
                  <span>${order.taxFormatted}</span>
                </div>
                <div style="display:flex;justify-content:space-between;color:#34d399;font-size:13px;font-weight:800;border-top:1px solid #1e293b;padding-top:6px;">
                  <span>Tổng thanh toán:</span>
                  <span>${order.totalFormatted}</span>
                </div>
              </div>

              <div style="display:flex;gap:8px;margin-top:14px;">
                <button type="button" id="g9k-ps-cancel" style="flex:1;padding:11px;border-radius:12px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;font-size:12px;font-weight:700;cursor:pointer;">
                  Hủy giao dịch
                </button>
                <button type="button" id="g9k-ps-pay" style="flex:2;padding:11px;border-radius:12px;background:linear-gradient(90deg,#f59e0b,#10b981);color:#090d16;border:0;font-size:12px;font-weight:900;cursor:pointer;">
                  ✓ Thanh Toán Ngay (${order.totalFormatted})
                </button>
              </div>
              <div style="font-size:10px;color:#64748b;text-align:center;margin-top:10px;">
                🛡️ Bảo vệ chống gian lận Xsolla Anti-Fraud · Tự động kê khai thuế toàn cầu
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelectorAll("[data-ps-method]").forEach((btn) => {
          btn.addEventListener("click", () => {
            selectedMethod = btn.getAttribute("data-ps-method");
            overlay.querySelectorAll("[data-ps-method]").forEach((b) => {
              const active = b === btn;
              b.style.borderColor = active ? "#10b981" : "#334155";
              b.style.background = active ? "rgba(16,185,129,0.14)" : "#0f172a";
            });
          });
        });

        const cleanup = (res) => {
          overlay.remove();
          resolve(res);
        };

        overlay
          .querySelector("#g9k-ps-close")
          ?.addEventListener("click", () => cleanup({ action: "cancel" }));
        overlay
          .querySelector("#g9k-ps-cancel")
          ?.addEventListener("click", () => cleanup({ action: "cancel" }));
        overlay
          .querySelector("#g9k-ps-pay")
          ?.addEventListener("click", () =>
            cleanup({ action: "pay", paymentMethod: selectedMethod })
          );
      });
    }

    /**
     * STEP 03: PURCHASE PRODUCT (`initiatePurchase` / `purchaseProduct`)
     * Pauses Poki gameplay & audio, opens Pay Station (via Portal Host RPC when sandboxed,
     * or built-in Pay Station 4 modal when standalone), and returns the paid order + receipt.
     */
    async purchaseProduct(sku, options = {}) {
      if (this.checkoutBusy) {
        return { ok: false, error: "Another Pay Station checkout is already active." };
      }

      if (!this.user) {
        await this.authenticate({ country: options.country || this.settings.country });
      }
      if (this.catalog.length === 0) {
        await this.loadCatalog({ country: options.country || this.settings.country });
      }

      this.checkoutBusy = true;
      const wasGameplayActive = this.sdk.poki?.isGameplayActive;
      if (wasGameplayActive) {
        this.sdk.poki.gameplayStop("xsolla_paystation");
      }
      this.sdk._setPaused(true, "xsolla_paystation");
      this._emitStep("paystation_open", { sku });

      try {
        // Case A: Embedded inside Game9K Portal Host (`<iframe sandbox="allow-scripts">`)
        if (this.sdk.isEmbedded && this.sdk.portalHostConnected && !options.headless) {
          const portalOrderRes = await this.sdk._portalRpc(
            "xsolla_open_paystation",
            {
              sku,
              userId: this.user.userId,
              accessToken: this.accessToken,
              country: options.country || this.settings.country,
              couponCode: options.couponCode || "",
              managerApproved: Boolean(options.managerApproved),
              sandbox: this.settings.sandbox,
              webhookMode: this.settings.webhookMode,
              autoFinalize: Boolean(options.autoFinalize),
            },
            180000
          );

          if (portalOrderRes?.order) {
            this.lastOrder = portalOrderRes.order;
          }
          if (portalOrderRes?.finalized && portalOrderRes.inventory) {
            this._syncRemoteInventory(portalOrderRes.inventory);
            this._notifyPurchaseListeners(portalOrderRes);
          }
          this._emitStep("paystation_status", {
            sku,
            status: portalOrderRes?.order?.status || "closed",
          });
          return portalOrderRes;
        }

        // Case B: Server REST API (`/api/xsolla/orders`) or offline standalone fallback
        let created = null;
        if (hasHttpOrigin()) {
          try {
            const res = await fetch("/api/xsolla/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sku,
                gameId: this.sdk.gameId,
                userId: this.user.userId,
                accessToken: this.accessToken,
                country: options.country || this.settings.country,
                couponCode: options.couponCode || "",
                managerApproved: Boolean(options.managerApproved),
                sandbox: this.settings.sandbox,
                webhookMode: this.settings.webhookMode,
                autoPay: Boolean(options.headless),
                paymentMethod: options.paymentMethod,
              }),
            });
            const bodyJson = await res.json();
            if (!res.ok && (res.status === 400 || res.status === 409)) {
              return { ok: false, status: res.status, error: bodyJson?.error || "Order rejected" };
            }
            if (res.ok) created = bodyJson;
          } catch {
            created = null;
          }
        }

        if (!created || !created.ok) {
          const item =
            this.catalog.find((i) => i.sku === sku) ||
            OFFLINE_SKUS.find((i) => i.sku === sku);
          if (!item) {
            return { ok: false, error: `SKU "${sku}" not found in catalog.` };
          }
          const reg =
            OFFLINE_REGIONS[this.settings.country] || this.region || OFFLINE_REGIONS.VN;
          const sub = formatRegionalMoney((item.priceUsd || 0.99) * reg.usdRate, reg);
          const tax = formatRegionalMoney(sub.amount * reg.taxRate, reg);
          const tot = formatRegionalMoney(sub.amount + tax.amount, reg);
          created = {
            ok: true,
            offlineFallback: true,
            order: {
              orderId: `ord_local_${Date.now().toString(36)}`,
              userId: this.user.userId,
              explorerId: this.user.explorerId,
              sku: item.sku,
              productName: item.name,
              icon: item.icon,
              productType: item.type,
              grant: item.grant,
              country: reg.country,
              currency: reg.currency,
              subtotalFormatted: sub.formatted,
              taxLabel: reg.taxLabel,
              taxFormatted: tax.formatted,
              totalAmount: tot.amount,
              totalFormatted: tot.formatted,
              paymentMethods: reg.paymentMethods,
              sandbox: this.settings.sandbox,
              status: options.headless ? "paid" : "created",
              receiptToken: options.headless ? `xsolla_rcpt_local_${sku}` : null,
            },
          };
        }

        let order = created.order;

        // Open interactive Pay Station modal unless running headless automated flow
        if (order.status === "created" && !options.headless) {
          if (this.settings.browserMode === "external" && order.externalPaystationUrl) {
            this.sdk.poki.openExternalLink(order.externalPaystationUrl);
          }
          const choice = await this._openStandalonePayStationModal(order);
          if (choice.action === "cancel") {
            if (hasHttpOrigin() && !created.offlineFallback) {
              try {
                await fetch(`/api/xsolla/orders/${encodeURIComponent(order.orderId)}/pay`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "cancel" }),
                });
              } catch {
                // Ignore
              }
            }
            order.status = "cancelled";
            this.lastOrder = order;
            this._emitStep("paystation_cancelled", { orderId: order.orderId, sku });
            return { ok: false, cancelled: true, order };
          }

          if (hasHttpOrigin() && !created.offlineFallback) {
            const payRes = await fetch(
              `/api/xsolla/orders/${encodeURIComponent(order.orderId)}/pay`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "pay",
                  paymentMethod: choice.paymentMethod,
                }),
              }
            );
            if (payRes.ok) {
              const paidData = await payRes.json();
              order = paidData.order;
            }
          } else {
            order.status = "paid";
            order.paymentMethod = choice.paymentMethod;
            order.transactionId = `xtx_local_${Date.now().toString(36)}`;
            order.receiptToken = `xsolla_rcpt_local_${order.orderId}`;
          }
        }

        this.lastOrder = order;
        this._emitStep("paystation_paid", {
          orderId: order.orderId,
          sku: order.sku,
          receiptToken: order.receiptToken,
        });

        if (options.autoFinalize) {
          return await this.finalizePurchase(order, options);
        }

        return { ok: true, step: "03_purchase_product", order };
      } finally {
        this.checkoutBusy = false;
        this.sdk._setPaused(false, "xsolla_paystation");
      }
    }

    initiatePurchase(sku, options = {}) {
      return this.purchaseProduct(sku, options);
    }

    /**
     * STEP 04: FINALIZE PURCHASE (`validateTransaction` + `consumeAsync` / `Complete`)
     * Validates cryptographic receipt and grants consumables / permanent entitlements idempotently.
     */
    async finalizePurchase(orderOrId = null, options = {}) {
      const targetOrder =
        typeof orderOrId === "object" && orderOrId !== null
          ? orderOrId
          : typeof orderOrId === "string"
          ? { orderId: orderOrId, receiptToken: options.receiptToken }
          : this.lastOrder;

      if (!targetOrder?.orderId) {
        return {
          ok: false,
          error: "No orderId available to finalize. Complete Step 03 first.",
        };
      }

      let finalizedRes = null;

      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        try {
          finalizedRes = await this.sdk._portalRpc(
            "xsolla_finalize_purchase",
            {
              orderId: targetOrder.orderId,
              receiptToken: targetOrder.receiptToken || options.receiptToken,
              gameId: this.sdk.gameId,
            },
            8000
          );
        } catch {
          finalizedRes = null;
        }
      }

      if (!finalizedRes && hasHttpOrigin() && !String(targetOrder.orderId).startsWith("ord_local_")) {
        try {
          const res = await fetch("/api/xsolla/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: targetOrder.orderId,
              receiptToken: targetOrder.receiptToken || options.receiptToken,
              gameId: this.sdk.gameId,
            }),
          });
          finalizedRes = await res.json();
        } catch {
          finalizedRes = null;
        }
      }

      if (!finalizedRes) {
        // Offline deterministic finalization with idempotency check
        const already = (this.inventory.transactions || []).some(
          (t) => t.orderId === targetOrder.orderId
        );
        if (!already) {
          const grant = targetOrder.grant || {};
          if (typeof grant.amberGems === "number") {
            this.inventory.amberGems += grant.amberGems;
          }
          if (grant.consumableKey) {
            this.inventory.consumables[grant.consumableKey] =
              (this.inventory.consumables[grant.consumableKey] || 0) +
              (grant.quantity || 1);
          }
          if (grant.entitlement && !this.inventory.entitlements.includes(grant.entitlement)) {
            this.inventory.entitlements.push(grant.entitlement);
          }
          if (grant.adFreeVip) {
            this.inventory.adFreeVip = true;
          }
          this.inventory.transactions.unshift({
            orderId: targetOrder.orderId,
            transactionId: targetOrder.transactionId || `xtx_${Date.now().toString(36)}`,
            sku: targetOrder.sku,
            productName: targetOrder.productName,
            totalFormatted: targetOrder.totalFormatted,
            finalizedAt: new Date().toISOString(),
          });
          this._saveCachedInventory();
        }
        finalizedRes = {
          ok: true,
          step: "04_finalize_purchase",
          alreadyFinalized: already,
          validation: { verified: true, antiFraud: "PASS" },
          order: { ...targetOrder, finalized: true },
          inventory: this.getInventory(),
        };
      } else if (finalizedRes.ok && finalizedRes.inventory) {
        this._syncRemoteInventory(finalizedRes.inventory);
      }

      if (finalizedRes.ok) {
        this._emitStep("purchase_finalized", {
          orderId: targetOrder.orderId,
          sku: finalizedRes.order?.sku || targetOrder.sku,
          alreadyFinalized: Boolean(finalizedRes.alreadyFinalized),
        });
        if (!finalizedRes.alreadyFinalized) {
          this._notifyPurchaseListeners(finalizedRes);
        }
        await this.sdk.saveCloudState({
          xsollaInventory: this.getInventory(),
        });
      }

      return finalizedRes;
    }

    async buyAndFinalize(sku, options = {}) {
      return this.purchaseProduct(sku, { ...options, autoFinalize: true });
    }

    async restorePurchases() {
      if (!this.user) await this.authenticate();
      if (hasHttpOrigin()) {
        try {
          const res = await fetch("/api/xsolla/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: this.user.userId }),
          });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.restoredEntitlements)) {
              this.inventory.entitlements = Array.from(
                new Set([...this.inventory.entitlements, ...json.restoredEntitlements])
              );
            }
            if (json.adFreeVip) this.inventory.adFreeVip = true;
            this._saveCachedInventory();
            this._emitStep("purchases_restored", json);
            return json;
          }
        } catch {
          // Fallback to local/cloud state
        }
      }
      return {
        ok: true,
        userId: this.user.userId,
        restoredEntitlements: [...this.inventory.entitlements],
        adFreeVip: this.inventory.adFreeVip,
      };
    }

    /**
     * One-line In-Game Storefront Drawer/Modal (`Game9K.xsolla.openStoreModal()`)
     * Lets any studio HTML5 game offer localized Xsolla SDK 3 IAP with zero custom UI boilerplate.
     */
    async openStoreModal(options = {}) {
      if (typeof document === "undefined" || !document.body) return null;
      await this.authenticate({ country: options.country || this.settings.country });
      await this.loadCatalog({
        country: options.country || this.settings.country,
        gameId: options.gameId || this.sdk.gameId,
      });

      const wasPlaying = this.sdk.poki?.isGameplayActive;
      if (wasPlaying) this.sdk.poki.gameplayStop("xsolla_storefront");
      this.sdk._setPaused(true, "xsolla_storefront");

      return new Promise((resolve) => {
        let activeCoupon = String(options.couponCode || "").trim().toUpperCase();
        let storeBannerMsg = "";
        const modal = document.createElement("div");
        modal.style.cssText =
          "position:fixed;inset:0;z-index:99995;background:rgba(4,9,16,0.85);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,-apple-system,sans-serif;color:#f8fafc;";

        const renderStore = () => {
          const inv = this.getInventory();
          const cardsHtml = this.catalog
            .map((item) => {
              const owned =
                item.type === "non_consumable" && this.hasEntitlement(item.sku);
              const soldOut = Boolean(
                item.stock?.autoEightySixed || item.stock?.status === "out"
              );
              const lowStock = item.stock?.status === "low";
              const stockBadge = item.stock?.trackStock
                ? soldOut
                  ? `<span style="margin-left:6px;font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(244,63,94,0.2);color:#fb7185;">86'd · HẾT HÀNG</span>`
                  : `<span style="margin-left:6px;font-size:10px;padding:2px 6px;border-radius:999px;background:${
                      lowStock ? "rgba(245,158,11,0.2)" : "rgba(56,189,248,0.16)"
                    };color:${lowStock ? "#fbbf24" : "#38bdf8"};">Còn ${
                      item.stock.stockOnHand
                    } gói</span>`
                : "";
              const hhBadge = item.happyHour
                ? `<span style="margin-left:6px;font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(232,121,249,0.2);color:#f0abfc;">⚡ HAPPY HOUR -${item.happyHour.percent}%</span>`
                : "";
              const disabled = owned || soldOut;

              return `
                <div style="background:#0f172a;border:1px solid ${
                  owned ? "#10b981" : soldOut ? "#4c0519" : "#1e293b"
                };border-radius:14px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:26px;">${item.icon || "💎"}</span>
                    <div>
                      <div style="font-size:13px;font-weight:800;color:#fff;">
                        ${item.name}
                        ${
                          owned
                            ? `<span style="margin-left:6px;font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(16,185,129,0.2);color:#34d399;">ĐÃ SỞ HỮU</span>`
                            : ""
                        }
                        ${hhBadge}
                        ${stockBadge}
                      </div>
                      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${
                        item.description
                      }</div>
                    </div>
                  </div>
                  <button type="button" data-buy-sku="${item.sku}" ${
                disabled ? "disabled" : ""
              } style="shrink:0;white-space:nowrap;padding:9px 14px;border-radius:11px;border:0;font-size:12px;font-weight:900;cursor:${
                disabled ? "default" : "pointer"
              };background:${
                disabled ? "#1e293b" : "linear-gradient(90deg,#f59e0b,#10b981)"
              };color:${disabled ? "#64748b" : "#090d16"};">
                    ${
                      owned
                        ? "Đã Mở Khóa"
                        : soldOut
                        ? "86'd Hết Hàng"
                        : item.pricing.totalFormatted
                    }
                  </button>
                </div>
              `;
            })
            .join("");

          modal.innerHTML = `
            <div style="max-width:560px;width:100%;max-height:92vh;display:flex;flex-direction:column;background:#090e1a;border:1px solid rgba(251,191,36,0.4);border-radius:22px;overflow:hidden;box-shadow:0 28px 75px rgba(0,0,0,0.8);">
              <div style="padding:14px 18px;background:linear-gradient(90deg,#064e3b,#0f172a);border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div>
                  <div style="font-size:10px;font-weight:800;color:#fbbf24;letter-spacing:0.08em;text-transform:uppercase;">
                    CỬA HÀNG TRONG GAME · XSOLLA × POS LIVE-OPS × POKI PORTAL
                  </div>
                  <div style="font-size:14px;font-weight:900;color:#fff;margin-top:2px;">
                    💎 Ví Hổ Phách: <span style="color:#34d399;">${inv.amberGems}</span>
                    ${
                      inv.adFreeVip
                        ? `<span style="margin-left:8px;font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(251,191,36,0.2);color:#fbbf24;">👑 VIP MIỄN QUẢNG CÁO</span>`
                        : ""
                    }
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <select id="g9k-store-country" style="background:#020617;color:#38bdf8;border:1px solid #334155;border-radius:8px;padding:5px 8px;font-size:11px;font-weight:700;">
                    ${["VN", "US", "DE", "JP"]
                      .map(
                        (c) =>
                          `<option value="${c}" ${
                            this.settings.country === c ? "selected" : ""
                          }>${c}</option>`
                      )
                      .join("")}
                  </select>
                  <button type="button" id="g9k-store-close" style="background:#1e293b;border:0;color:#e2e8f0;width:30px;height:30px;border-radius:9px;cursor:pointer;font-weight:800;">✕</button>
                </div>
              </div>
              <div style="padding:10px 18px;background:#050811;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:11px;font-weight:800;color:#cbd5e1;">🎟️ Coupon POS:</span>
                <input id="g9k-store-coupon" value="${activeCoupon}" placeholder="VD: GAMER9K hoặc KOL20" style="flex:1;min-width:140px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:5px 10px;font-size:11px;color:#fbbf24;font-weight:700;text-transform:uppercase;" />
                <span style="font-size:10px;color:#34d399;">${storeBannerMsg}</span>
              </div>
              <div style="padding:14px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;">
                ${cardsHtml}
              </div>
              <div style="padding:10px 18px;background:#020617;border-top:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#94a3b8;">
                <span>User ID: <code style="color:#38bdf8;">${
                  this.user?.explorerId || this.sdk.playerId
                }</code></span>
                <button type="button" id="g9k-store-restore" style="background:transparent;border:1px solid #334155;color:#cbd5e1;padding:4px 10px;border-radius:8px;font-size:11px;cursor:pointer;">
                  ↻ Khôi phục giao dịch (Restore)
                </button>
              </div>
            </div>
          `;

          modal.querySelector("#g9k-store-coupon")?.addEventListener("input", (ev) => {
            activeCoupon = String(ev.target.value || "").trim().toUpperCase();
          });

          modal.querySelector("#g9k-store-close")?.addEventListener("click", () => {
            modal.remove();
            this.sdk._setPaused(false, "xsolla_storefront");
            resolve({ closed: true, inventory: this.getInventory() });
          });

          modal
            .querySelector("#g9k-store-country")
            ?.addEventListener("change", async (ev) => {
              await this.loadCatalog({
                country: ev.target.value,
                gameId: options.gameId || this.sdk.gameId,
              });
              renderStore();
            });

          modal
            .querySelector("#g9k-store-restore")
            ?.addEventListener("click", async () => {
              await this.restorePurchases();
              renderStore();
            });

          modal.querySelectorAll("[data-buy-sku]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const sku = btn.getAttribute("data-buy-sku");
              const res = await this.buyAndFinalize(sku, { couponCode: activeCoupon });
              if (!res?.ok && res?.error) {
                storeBannerMsg = `⚠️ ${res.error}`;
              } else if (res?.ok) {
                storeBannerMsg = res.posFulfillment?.posOrderNumber
                  ? `✅ KDS #${res.posFulfillment.posOrderNumber}`
                  : "✅ Đã thanh toán!";
                await this.loadCatalog({
                  country: this.settings.country,
                  gameId: options.gameId || this.sdk.gameId,
                });
              }
              this.sdk._setPaused(true, "xsolla_storefront");
              renderStore();
              if (res?.ok && typeof options.onPurchased === "function") {
                options.onPurchased(res);
              }
            });
          });
        };

        document.body.appendChild(modal);
        renderStore();
      });
    }

    _syncRemoteInventory(remoteInv) {
      if (!remoteInv || typeof remoteInv !== "object") return;
      this.inventory = {
        amberGems: remoteInv.amberGems ?? this.inventory.amberGems,
        consumables: { ...(remoteInv.consumables || {}) },
        entitlements: Array.isArray(remoteInv.entitlements)
          ? remoteInv.entitlements.slice()
          : [],
        adFreeVip: Boolean(remoteInv.adFreeVip),
        transactions: Array.isArray(remoteInv.transactions)
          ? remoteInv.transactions.slice(0, 20)
          : [],
      };
      this._saveCachedInventory();
    }

    _notifyPurchaseListeners(purchaseResult) {
      for (const fn of this.purchaseListeners) {
        try {
          fn(purchaseResult);
        } catch {
          // Ignore listener error
        }
      }
    }
  }

  // ==========================================================================
  // 4. POKI PORTAL SDK COMPATIBILITY ENGINE (`window.PokiSDK`)
  // ==========================================================================
  class Game9KPokiAdapter {
    constructor(sdk) {
      this.sdk = sdk;
      this.isInitialized = false;
      this.loadingFinished = false;
      this.isGameplayActive = false;
      this.gameplayStartedAt = null;
      this.totalGameplayMs = 0;
      this.debug = false;
      this.logging = false;
      this.lastShareableUrl = "";
      this.pillPosition = { topPercent: 0, topPx: 16 };
    }

    _log(method, details = {}) {
      if (this.debug || this.logging) {
        console.info(`[PokiSDK × Game9K] ${method}`, details);
      }
    }

    init(options = {}) {
      if (options && typeof options === "object" && (options.gameId || options.version)) {
        this.sdk.init(options);
      }
      this.isInitialized = true;
      this._log("init", { embedded: this.sdk.isEmbedded });
      this.sdk.emitPortalEvent("poki_init", {
        embedded: this.sdk.isEmbedded,
        language: this.getLanguage(),
      });
      return Promise.resolve();
    }

    gameLoadingStart() {
      this._log("gameLoadingStart");
      this.sdk.emitPortalEvent("poki_loading_start", {});
    }

    gameLoadingProgress(progress = {}) {
      const pct = Number(progress?.percentageDone ?? progress ?? 0);
      this._log("gameLoadingProgress", { percentageDone: pct });
      this.sdk.emitPortalEvent("poki_loading_progress", { percentageDone: pct });
    }

    gameLoadingFinished() {
      if (this.loadingFinished) return;
      this.loadingFinished = true;
      this._log("gameLoadingFinished");
      this.sdk.emitPortalEvent("poki_loading_finished", {
        loadTimeMs:
          typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
      });
    }

    /**
     * Poki Golden Rule: Never fire `gameplayStart` while a commercialBreak,
     * rewardedBreak, Pay Station checkout, or NĐ147 lock is active!
     */
    gameplayStart() {
      if (
        this.sdk.ads.adBusy ||
        this.sdk.xsolla.checkoutBusy ||
        this.sdk.legalLocked
      ) {
        this._log("gameplayStart deferred (break/checkout/lock active)");
        return false;
      }
      if (this.isGameplayActive) return true;
      this.isGameplayActive = true;
      this.gameplayStartedAt = Date.now();
      this._log("gameplayStart");
      this.sdk.emitPortalEvent("poki_gameplay_start", {});
      return true;
    }

    gameplayStop(reason = "interruption") {
      if (!this.isGameplayActive) return false;
      this.isGameplayActive = false;
      const sessionMs = this.gameplayStartedAt
        ? Math.max(0, Date.now() - this.gameplayStartedAt)
        : 0;
      this.totalGameplayMs += sessionMs;
      this.gameplayStartedAt = null;
      this._log("gameplayStop", { reason, sessionMs, totalGameplayMs: this.totalGameplayMs });
      this.sdk.emitPortalEvent("poki_gameplay_stop", {
        reason,
        sessionMs,
        totalGameplaySec: Number((this.totalGameplayMs / 1000).toFixed(1)),
      });
      return true;
    }

    happyTime(intensity = 0.5) {
      const clamped = Math.max(0, Math.min(1, Number(intensity) || 0.5));
      this._log("happyTime", { intensity: clamped });
      this.sdk.emitPortalEvent("poki_happy_time", { intensity: clamped });
    }

    commercialBreak(onStart) {
      if (this.sdk.ads.adBusy) return Promise.resolve();
      this.gameplayStop("commercial_break");
      this._log("commercialBreak:request");

      return new Promise((resolve) => {
        let startCalled = false;
        const invokeStart = () => {
          if (!startCalled && typeof onStart === "function") {
            startCalled = true;
            try {
              onStart();
            } catch {
              // Ignore
            }
          }
        };

        this.sdk.ads.triggerAdBreak({
          type: "next",
          name: "poki-commercial-break",
          interactive: this.debug,
          onPause: invokeStart,
          onDone: (info) => {
            this._log("commercialBreak:done", info);
            resolve();
          },
        });
      });
    }

    rewardedBreak(optionsOrOnStart) {
      if (this.sdk.ads.adBusy) return Promise.resolve(false);
      if (this.isAdBlocked()) return Promise.resolve(false);

      let size = "medium";
      let onStart = null;
      let interactive = false;

      if (typeof optionsOrOnStart === "function") {
        onStart = optionsOrOnStart;
      } else if (optionsOrOnStart && typeof optionsOrOnStart === "object") {
        size = optionsOrOnStart.size || "medium";
        onStart = optionsOrOnStart.onStart || null;
        interactive = Boolean(optionsOrOnStart.interactive);
      }

      this.gameplayStop("rewarded_break");
      this._log("rewardedBreak:request", { size });

      return new Promise((resolve) => {
        let rewarded = false;
        let startCalled = false;
        const invokeStart = () => {
          if (!startCalled && typeof onStart === "function") {
            startCalled = true;
            try {
              onStart();
            } catch {
              // Ignore
            }
          }
        };

        this.sdk.ads.triggerAdBreak({
          type: "reward",
          name: `poki-rewarded-${size}`,
          size,
          interactive: interactive || this.debug,
          onPause: invokeStart,
          onReward: () => {
            rewarded = true;
          },
          onDone: (info) => {
            const finalReward = Boolean(rewarded || info?.rewarded);
            this._log("rewardedBreak:done", { rewarded: finalReward, size });
            resolve(finalReward);
          },
        });
      });
    }

    displayAd(container, size = "300x250", onComplete, onError) {
      if (!container || typeof container !== "object") {
        if (typeof onError === "function") onError("Invalid ad container");
        return;
      }
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:50px;background:#0f172a;border:1px dashed #334155;border-radius:8px;color:#94a3b8;font-size:11px;font-family:monospace;">Game9K × Poki Ad Slot (${size})</div>`;
      this.sdk.emitPortalEvent("poki_display_ad", { size });
      if (typeof onComplete === "function") onComplete();
    }

    destroyAd(container) {
      if (container && typeof container === "object") {
        container.innerHTML = "";
      }
      this.sdk.emitPortalEvent("poki_destroy_ad", {});
    }

    isAdBlocked() {
      return Boolean(this.sdk.ads.adBlocked);
    }

    async shareableURL(params = {}) {
      const cleanParams = {};
      if (params && typeof params === "object") {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null) cleanParams[k] = String(v);
        }
      }

      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        try {
          const res = await this.sdk._portalRpc(
            "poki_shareable_url",
            { params: cleanParams, gameId: this.sdk.gameId },
            3000
          );
          if (res?.url) {
            this.lastShareableUrl = res.url;
            return res.url;
          }
        } catch {
          // Fallback below
        }
      }

      let base = "https://game9k-starter-kit.vercel.app/";
      try {
        if (global.location?.href && !global.location.href.startsWith("about:")) {
          base = global.location.href.split("?")[0];
        }
      } catch {
        // Ignore
      }
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(cleanParams)) {
        const key = k.startsWith("gd") ? k : `gd${k}`;
        qs.set(key, v);
      }
      const query = qs.toString();
      const built = query ? `${base}?${query}` : base;
      this.lastShareableUrl = built;
      this.sdk.emitPortalEvent("poki_shareable_url", { params: cleanParams, url: built });
      return built;
    }

    getURLParam(key) {
      if (!key) return "";
      const k = String(key);
      if (this.sdk.portalParams) {
        if (`gd${k}` in this.sdk.portalParams) return this.sdk.portalParams[`gd${k}`];
        if (k in this.sdk.portalParams) return this.sdk.portalParams[k];
      }
      try {
        const qs = new URLSearchParams(global.location.search || "");
        return qs.get(`gd${k}`) ?? qs.get(k) ?? "";
      } catch {
        return "";
      }
    }

    getLanguage() {
      try {
        const raw =
          this.sdk.portalLanguage ||
          global.navigator?.language ||
          "vi-VN";
        return String(raw).slice(0, 2).toLowerCase();
      } catch {
        return "vi";
      }
    }

    getIsoLanguage() {
      return this.getLanguage();
    }

    getDeviceInfo() {
      const ua = String(global.navigator?.userAgent || "");
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      return {
        isMobile,
        screenWidth: Number(global.innerWidth || 1280),
        screenHeight: Number(global.innerHeight || 720),
        pixelRatio: Number(global.devicePixelRatio || 1),
        isEmbedded: this.sdk.isEmbedded,
        sandboxed: !hasHttpOrigin(),
      };
    }

    movePill(topPercent = 0, topPx = 16) {
      this.pillPosition = {
        topPercent: Math.max(0, Math.min(85, Number(topPercent) || 0)),
        topPx: Number(topPx) || 0,
      };
      this._log("movePill", this.pillPosition);
      this.sdk.emitPortalEvent("poki_move_pill", this.pillPosition);
    }

    openExternalLink(url) {
      const safeUrl = String(url || "").trim();
      if (!/^https?:\/\//i.test(safeUrl)) return;
      this.sdk.emitPortalEvent("poki_open_external_link", { url: safeUrl });
      if (!this.sdk.isEmbedded && typeof global.open === "function") {
        global.open(safeUrl, "_blank", "noopener,noreferrer");
      }
    }

    measure(category = "game", what = "", action = "", value = undefined) {
      const payload = { category, what, action, value };
      this._log("measure", payload);
      this.sdk.emitPortalEvent("poki_measure", payload);
    }

    captureError(error) {
      const message =
        typeof error === "string"
          ? error
          : error?.stack || error?.message || String(error);
      this.sdk.emitPortalEvent("poki_error", { message });
    }

    setDebug(toggle = true) {
      this.debug = Boolean(toggle);
      this.sdk.ads.simulateInteractiveOverlay = Boolean(toggle);
    }

    setLogging(toggle = true) {
      this.logging = Boolean(toggle);
    }

    enableEventTracking() {}

    // Unified Poki Identity <-> Xsolla SDK 3 Step 01 Authenticate!
    async login(options = {}) {
      const res = await this.sdk.xsolla.authenticate({
        method: "portal_sso",
        ...options,
      });
      return res.user;
    }

    async getUser() {
      if (!this.sdk.xsolla.user) {
        await this.sdk.xsolla.authenticate({ method: "device_id" });
      }
      return this.sdk.xsolla.user;
    }

    async getToken() {
      if (!this.sdk.xsolla.accessToken) {
        await this.sdk.xsolla.authenticate({ method: "device_id" });
      }
      return this.sdk.xsolla.accessToken;
    }

    get splice() {
      return this.sdk.splice;
    }

    get economy() {
      return this.sdk.pos;
    }

    get runtime() {
      return this.sdk.runtime;
    }

    get interpreter() {
      return this.sdk.interpreter;
    }

    get fragments() {
      return this.sdk.fragments;
    }

    get computerUse() {
      return this.sdk.computerUse;
    }

    get ai() {
      return this.sdk.ai;
    }

    get agentOps() {
      return this.sdk.agentOps;
    }

    get cloud() {
      return this.sdk.cloud;
    }

    get arena() {
      return this.sdk.arena;
    }
  }

  // ==========================================================================
  // 4B. SPLICE SPEC-TO-SDK & INTERCEPTOR GATEWAY (`window.SpliceSDK`)
  // ==========================================================================
  class Game9KSpliceAdapter {
    constructor(sdk) {
      this.sdk = sdk;
      this.apiKey = SafeStorage.get("g9k_splice_api_key") || "";
      this.maxRetries = 2;
      this.requestInterceptors = [];
      this.responseInterceptors = [];

      // Built-in Splice Auth Auto-Injector (`sk_live_...` + `xl3.*`)
      this.useRequestInterceptor((url, init) => {
        const headers = { ...(init.headers || {}) };
        if (this.apiKey) headers["x-g9k-api-key"] = this.apiKey;
        if (this.sdk.xsolla?.accessToken && !headers.Authorization) {
          headers.Authorization = `Bearer ${this.sdk.xsolla.accessToken}`;
        }
        return [url, { ...init, headers }];
      });
    }

    isValidApiKeyFormat(key) {
      return /^sk_live_[A-Za-z0-9_-]{32}$/.test(String(key || ""));
    }

    maskApiKey(key) {
      const s = String(key ?? this.apiKey ?? "");
      if (s.length < 16) return "****";
      return `${s.slice(0, 12)}...${s.slice(-4)}`;
    }

    setApiKey(key) {
      this.apiKey = String(key || "").trim();
      if (this.apiKey) SafeStorage.set("g9k_splice_api_key", this.apiKey);
      else SafeStorage.remove("g9k_splice_api_key");
      return this.maskApiKey(this.apiKey);
    }

    useRequestInterceptor(fn) {
      if (typeof fn === "function") this.requestInterceptors.push(fn);
    }

    useResponseInterceptor(fn) {
      if (typeof fn === "function") this.responseInterceptors.push(fn);
    }

    async request(path, init = {}) {
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        try {
          return await this.sdk._portalRpc("splice_http_proxy", {
            path,
            method: init.method || "GET",
            body: init.body ? JSON.parse(init.body) : null,
            apiKey: this.apiKey,
          });
        } catch {
          // Fallback to direct fetch if available
        }
      }

      if (!hasHttpOrigin()) {
        return { ok: false, offline: true, error: "Offline sandbox — use Portal Host RPC." };
      }

      let targetUrl = path;
      let reqInit = {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      };

      for (const fn of this.requestInterceptors) {
        const out = await fn(targetUrl, reqInit);
        if (Array.isArray(out)) {
          targetUrl = out[0];
          reqInit = out[1];
        }
      }

      let attempt = 0;
      while (true) {
        try {
          let res = await fetch(targetUrl, reqInit);
          for (const rFn of this.responseInterceptors) {
            res = (await rFn(res)) || res;
          }
          if (res.status >= 500 && attempt < this.maxRetries) {
            attempt++;
            await new Promise((r) => setTimeout(r, 140 * Math.pow(2, attempt)));
            continue;
          }
          return await res.json();
        } catch (err) {
          if (attempt < this.maxRetries) {
            attempt++;
            await new Promise((r) => setTimeout(r, 140 * Math.pow(2, attempt)));
            continue;
          }
          return { ok: false, error: err?.message || "Network request failed" };
        }
      }
    }

    getOpenAPISpec() {
      return this.request("/api/openapi.json", { method: "GET" });
    }

    parseSpec(spec = null) {
      return this.request("/api/splice/parse", {
        method: "POST",
        body: JSON.stringify({ spec }),
      });
    }

    async startMockServer(specId = "game9k-portal", spec = null) {
      const res = await this.request("/api/splice/mock-servers", {
        method: "POST",
        body: JSON.stringify({ specId, spec }),
      });
      if (res?.mock?.apiKey) {
        this.setApiKey(res.mock.apiKey);
      }
      this.sdk.emitPortalEvent("splice_mock_started", {
        specId,
        maskedKey: res?.mock?.maskedApiKey || null,
      });
      return res;
    }

    async stopMockServer(specId = "game9k-portal") {
      const res = await this.request(
        `/api/splice/mock-servers/${encodeURIComponent(specId)}`,
        { method: "DELETE" }
      );
      if (res?.stopped) this.setApiKey("");
      this.sdk.emitPortalEvent("splice_mock_stopped", { specId });
      return res;
    }

    executeMockRequest(specId = "game9k-portal", req = {}) {
      return this.request("/api/splice/mock-request", {
        method: "POST",
        body: JSON.stringify({
          specId,
          method: req.method || "GET",
          path: req.path || "/api/health",
          headers: {
            ...(this.apiKey ? { "x-g9k-api-key": this.apiKey } : {}),
            ...(req.headers || {}),
          },
          body: req.body || null,
        }),
      });
    }

    async generateTypedSDK(config = {}) {
      const res = await this.request("/api/splice/generate-sdk", {
        method: "POST",
        body: JSON.stringify({
          gameId: config.gameId || this.sdk.gameId,
          config,
        }),
      });
      if (res?.ok) {
        this.sdk.emitPortalEvent("splice_sdk_generated", {
          generationId: res.generationId,
          packageName: res.config?.packageName,
          endpointCount: res.endpointCount,
        });
      }
      return res;
    }
  }

  // ==========================================================================
  // 4C. COUNTER POS, STOCK/86, HAPPY HOUR, KDS & Z-REPORT (`window.Game9KPOS`)
  // ==========================================================================
  class Game9KPosEconomyAdapter {
    constructor(sdk) {
      this.sdk = sdk;
    }

    _call(rpcAction, method, path, body = null) {
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return this.sdk._portalRpc(rpcAction, body || {}).catch(() =>
          this.sdk.splice.request(path, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          })
        );
      }
      return this.sdk.splice.request(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }

    getStockCatalog() {
      return this._call("pos_get_stock", "GET", "/api/pos/stock");
    }

    adjustStock(sku, delta, reason = "adjustment", note = "") {
      return this._call("pos_adjust_stock", "POST", "/api/pos/stock/adjust", {
        sku,
        delta,
        reason,
        note,
      });
    }

    getDiscounts() {
      return this._call("pos_get_discounts", "GET", "/api/pos/discounts");
    }

    async toggleHappyHour(active = true) {
      const res = await this._call("pos_toggle_happy_hour", "POST", "/api/pos/happy-hour", {
        active,
      });
      if (res?.happyHourActive) {
        this.sdk.poki.happyTime(0.85);
      }
      return res;
    }

    validateCoupon(couponCode, subtotalCents = 299, managerApproved = false) {
      return this._call("pos_validate_coupon", "POST", "/api/pos/validate-coupon", {
        couponCode,
        subtotalCents,
        managerApproved,
      });
    }

    quoteOrder(payload = {}) {
      return this._call("pos_quote_order", "POST", "/api/pos/quote", payload);
    }

    getKdsQueue() {
      return this._call("pos_get_kds", "GET", "/api/pos/kds");
    }

    async bumpTicket(ticketId) {
      const res = await this._call("pos_bump_ticket", "POST", "/api/pos/kds/bump", {
        ticketId,
      });
      if (res?.ok) {
        this.sdk.emitPortalEvent("pos_kds_bumped", { ticketId });
      }
      return res;
    }

    recallTicket(ticketId) {
      return this._call("pos_recall_ticket", "POST", "/api/pos/kds/recall", { ticketId });
    }

    enqueueStreamGift(gift = {}) {
      return this._call("pos_stream_gift", "POST", "/api/pos/kds/stream-gift", gift);
    }

    getShifts() {
      return this._call("pos_get_shifts", "GET", "/api/pos/shifts");
    }

    openShift(opts = {}) {
      return this._call("pos_open_shift", "POST", "/api/pos/shifts/open", opts);
    }

    closeShift(opts = {}) {
      return this._call("pos_close_shift", "POST", "/api/pos/shifts/close", opts);
    }

    getZReport(params = {}) {
      const parts = [];
      if (params.from) parts.push(`from=${encodeURIComponent(params.from)}`);
      if (params.to) parts.push(`to=${encodeURIComponent(params.to)}`);
      const suffix = parts.length > 0 ? `?${parts.join("&")}` : "";
      return this._call("pos_get_z_report", "GET", `/api/pos/z-report${suffix}`);
    }

    downloadCSV(kind = "orders") {
      const safeKind = ["orders", "payments", "shifts"].includes(kind) ? kind : "orders";
      const relUrl = `/api/pos/export/${safeKind}.csv`;
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        this.sdk.emitPortalEvent("pos_download_csv", { kind: safeKind, url: relUrl });
        return relUrl;
      }
      if (typeof document !== "undefined" && hasHttpOrigin()) {
        const a = document.createElement("a");
        a.href = relUrl;
        a.download = `game9k-${safeKind}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return relUrl;
    }
  }

  // ==========================================================================
  // 4D. E2B RUNTIME SANDBOX & IN-FRAME `envd` AGENT (`window.E2BRuntimeSDK`)
  // ==========================================================================
  class Game9KE2BRuntimeAdapter {
    constructor(sdk) {
      this.sdk = sdk;
      this.activeSandboxId = null;
      this.envd = {
        frozen: false,
        lifecycleId: null,
        cpuCount: 2,
        startedTasks: 0,
      };
    }

    _call(rpcAction, method, path, body = null) {
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return this.sdk._portalRpc(rpcAction, { ...(body || {}), path, method }).catch(() =>
          this.sdk.splice.request(path, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          })
        );
      }
      return this.sdk.splice.request(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }

    spawnEnvdTask(taskFn) {
      if (this.envd.frozen) {
        return {
          ok: false,
          status: 503,
          error: "unavailable: workload cgroup is frozen for pause",
        };
      }
      this.envd.startedTasks += 1;
      const out = typeof taskFn === "function" ? taskFn() : null;
      return { ok: true, taskIndex: this.envd.startedTasks, result: out };
    }

    listTemplates() {
      return this._call("e2b_list_templates", "GET", "/api/e2b/templates");
    }

    listSandboxes() {
      return this._call("e2b_list_sandboxes", "GET", "/api/e2b/sandboxes");
    }

    async createSandbox(opts = {}) {
      const res = await this._call("e2b_create_sandbox", "POST", "/api/e2b/sandboxes", opts);
      if (res?.sandbox?.sandboxId) {
        this.activeSandboxId = res.sandbox.sandboxId;
        this.envd.lifecycleId = res.sandbox.lifecycleId;
        this.envd.frozen = false;
      }
      return res;
    }

    getSandbox(sandboxId) {
      const id = sandboxId || this.activeSandboxId;
      return this._call(
        "e2b_get_sandbox",
        "GET",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}`
      );
    }

    async pauseSandbox(sandboxId) {
      const id = sandboxId || this.activeSandboxId;
      const res = await this._call(
        "e2b_pause_sandbox",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/pause`,
        { sandboxId: id }
      );
      if (res?.ok && id === this.activeSandboxId) {
        this.envd.frozen = true;
      }
      return res;
    }

    async resumeSandbox(sandboxId) {
      const id = sandboxId || this.activeSandboxId;
      const res = await this._call(
        "e2b_resume_sandbox",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/resume`,
        { sandboxId: id }
      );
      if (res?.ok && id === this.activeSandboxId) {
        this.envd.frozen = false;
        this.envd.lifecycleId = res.sandbox?.lifecycleId || this.envd.lifecycleId;
      }
      return res;
    }

    checkpointSandbox(sandboxId) {
      const id = sandboxId || this.activeSandboxId;
      return this._call(
        "e2b_checkpoint_sandbox",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/checkpoint`,
        { sandboxId: id }
      );
    }

    forkSandbox(sandboxId, opts = {}) {
      const id = sandboxId || this.activeSandboxId;
      return this._call(
        "e2b_fork_sandbox",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/fork`,
        { sandboxId: id, ...opts }
      );
    }

    setSandboxTimeout(sandboxId, timeoutMs = 60000) {
      const id = sandboxId || this.activeSandboxId;
      return this._call(
        "e2b_set_timeout",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/timeout`,
        { sandboxId: id, timeoutMs }
      );
    }

    killSandbox(sandboxId) {
      const id = sandboxId || this.activeSandboxId;
      return this._call(
        "e2b_kill_sandbox",
        "DELETE",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}`,
        { sandboxId: id }
      );
    }

    createVolume(name = "studio-assets") {
      return this._call("e2b_create_volume", "POST", "/api/e2b/volumes", { name });
    }
  }

  // ==========================================================================
  // 4E. E2B STATEFUL CODE INTERPRETER (`window.CodeInterpreterSDK`)
  // ==========================================================================
  class Game9KCodeInterpreterAdapter {
    constructor(sdk) {
      this.sdk = sdk;
    }

    async create(opts = {}) {
      const created = await this.sdk.runtime.createSandbox({
        templateId: "code-interpreter-v1",
        ...opts,
      });
      const sandboxId = created?.sandbox?.sandboxId;
      return {
        sandboxId,
        sandbox: created?.sandbox,
        runCode: (code, runOpts = {}) =>
          this.runCode(code, { ...runOpts, sandboxId }),
        pause: () => this.sdk.runtime.pauseSandbox(sandboxId),
        resume: () => this.sdk.runtime.resumeSandbox(sandboxId),
        fork: () => this.sdk.runtime.forkSandbox(sandboxId),
        kill: () => this.sdk.runtime.killSandbox(sandboxId),
      };
    }

    async runCode(code, opts = {}) {
      const sandboxId = opts.sandboxId || this.sdk.runtime.activeSandboxId || null;
      const res = await this.sdk.runtime._call(
        "e2b_run_code",
        "POST",
        "/api/e2b/interpreter/run",
        {
          sandboxId,
          code: String(code || ""),
          contextId: opts.contextId || "ctx_default",
          timeoutMs: opts.timeoutMs || 500,
          autoResume: opts.autoResume !== false,
        }
      );
      if (res?.sandboxId && !this.sdk.runtime.activeSandboxId) {
        this.sdk.runtime.activeSandboxId = res.sandboxId;
      }
      return res;
    }
  }

  // ==========================================================================
  // 4F. E2B FRAGMENTS & MORPH LAZY EDIT ENGINE (`window.FragmentsSDK`)
  // ==========================================================================
  class Game9KFragmentsAdapter {
    constructor(sdk) {
      this.sdk = sdk;
    }

    listTemplates() {
      return this.sdk.runtime.listTemplates();
    }

    async deployFragment(fragment = {}) {
      const res = await this.sdk.runtime._call(
        "e2b_deploy_fragment",
        "POST",
        "/api/e2b/fragments",
        { fragment, userID: this.sdk.playerId }
      );
      if (res?.sbxId) {
        this.sdk.runtime.activeSandboxId = res.sbxId;
      }
      return res;
    }

    applyMorphEdit(sandboxId, morphEdit = {}) {
      const id = sandboxId || this.sdk.runtime.activeSandboxId;
      return this.sdk.runtime._call(
        "e2b_morph_edit",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/morph-edit`,
        { sandboxId: id, ...morphEdit }
      );
    }

    writeFile(sandboxId, filePath, content) {
      const id = sandboxId || this.sdk.runtime.activeSandboxId;
      return this.sdk.runtime._call(
        "e2b_write_file",
        "POST",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/files`,
        { sandboxId: id, path: filePath, content }
      );
    }

    readFile(sandboxId, filePath = "index.html") {
      const id = sandboxId || this.sdk.runtime.activeSandboxId;
      return this.sdk.runtime._call(
        "e2b_read_file",
        "GET",
        `/api/e2b/sandboxes/${encodeURIComponent(id)}/files?path=${encodeURIComponent(
          filePath
        )}`,
        { sandboxId: id, path: filePath }
      );
    }
  }

  // ==========================================================================
  // 4G. OPEN COMPUTER USE VISION + GROUNDING AGENT (`window.ComputerUseSDK`)
  // ==========================================================================
  class Game9KComputerUseAdapter {
    constructor(sdk) {
      this.sdk = sdk;
      this.typingDelayMs = 12;
      this.typingGroupSize = 50;
    }

    collectUiElements() {
      if (typeof document === "undefined" || !document.querySelectorAll) return [];
      const nodes = document.querySelectorAll("button, a, canvas, [data-cu-label]");
      const items = [];
      for (const el of nodes) {
        if (typeof el.getBoundingClientRect !== "function") continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        items.push({
          label:
            el.getAttribute("data-cu-label") ||
            el.id ||
            (el.textContent || "").trim().slice(0, 32) ||
            el.tagName.toLowerCase(),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          width: Math.round(r.width),
          height: Math.round(r.height),
        });
      }
      return items.slice(0, 30);
    }

    screenshot(canvasEl = null) {
      try {
        const target =
          canvasEl ||
          (typeof document !== "undefined" ? document.querySelector("canvas") : null);
        if (target && typeof target.toDataURL === "function") {
          return target.toDataURL("image/png");
        }
      } catch {
        // Cross-origin tainted canvas fallback
      }
      return null;
    }

    drawBigDot(x, y, containerEl = null) {
      if (typeof document === "undefined" || !document.body) return null;
      const host = containerEl || document.body;
      const dot = document.createElement("div");
      dot.style.cssText = `position:${
        containerEl ? "absolute" : "fixed"
      };left:${Math.round(x) - 11}px;top:${Math.round(
        y
      ) - 11}px;width:22px;height:22px;border-radius:999px;background:rgba(244,63,94,0.85);border:3px solid #fde047;box-shadow:0 0 18px rgba(244,63,94,0.9);pointer-events:none;z-index:99998;transition:transform 0.35s ease,opacity 0.35s ease;`;
      host.appendChild(dot);
      setTimeout(() => {
        dot.style.transform = "scale(1.5)";
        dot.style.opacity = "0";
        setTimeout(() => dot.remove(), 380);
      }, 650);
      return { x: Math.round(x), y: Math.round(y) };
    }

    sendKey(name = "Space") {
      if (typeof document !== "undefined" && typeof KeyboardEvent === "function") {
        const down = new KeyboardEvent("keydown", { key: name, code: name, bubbles: true });
        const up = new KeyboardEvent("keyup", { key: name, code: name, bubbles: true });
        global.dispatchEvent?.(down);
        document.dispatchEvent?.(down);
        global.dispatchEvent?.(up);
        document.dispatchEvent?.(up);
      }
      this.sdk.emitPortalEvent("computer_use_key", { key: name });
      return { ok: true, key: name };
    }

    async typeText(text = "", inputEl = null) {
      const str = String(text);
      let out = "";
      for (let i = 0; i < str.length; i += this.typingGroupSize) {
        out += str.slice(i, i + this.typingGroupSize);
        if (inputEl && "value" in inputEl) inputEl.value = out;
        await new Promise((r) => setTimeout(r, this.typingDelayMs));
      }
      return { ok: true, typedLength: str.length };
    }

    async stepAgent(instruction, opts = {}) {
      const screenshotDataUrl = opts.screenshotDataUrl ?? this.screenshot(opts.canvasEl);
      const viewport = opts.viewport || {
        width: Number(global.innerWidth || 360),
        height: Number(global.innerHeight || 220),
      };
      const res = await this.sdk.runtime._call(
        "e2b_computer_use_step",
        "POST",
        "/api/e2b/computer-use/step",
        {
          sandboxId: opts.sandboxId || this.sdk.runtime.activeSandboxId,
          instruction,
          action: opts.action || "click",
          query: opts.query || instruction,
          key: opts.key,
          text: opts.text,
          viewport,
          uiElements: opts.uiElements || this.collectUiElements(),
          screenshotDataUrl,
        }
      );

      const tc = res?.step?.toolCall;
      if (tc) {
        if (tc.name === "send_key") {
          this.sendKey(tc.parameters.name);
        } else if (tc.name === "type_text") {
          await this.typeText(tc.parameters.text, opts.inputEl);
        } else if (typeof tc.parameters?.x === "number") {
          this.drawBigDot(tc.parameters.x, tc.parameters.y, opts.containerEl);
          if (opts.canvasEl && typeof MouseEvent === "function") {
            const rect = opts.canvasEl.getBoundingClientRect();
            opts.canvasEl.dispatchEvent(
              new MouseEvent("click", {
                clientX: rect.left + tc.parameters.x,
                clientY: rect.top + tc.parameters.y,
                bubbles: true,
              })
            );
          }
        }
      }
      return res;
    }

    click(query, opts = {}) {
      return this.stepAgent(`Click ${query}`, { ...opts, action: "click", query });
    }

    doubleClick(query, opts = {}) {
      return this.stepAgent(`Double click ${query}`, {
        ...opts,
        action: "double_click",
        query,
      });
    }

    rightClick(query, opts = {}) {
      return this.stepAgent(`Right click ${query}`, {
        ...opts,
        action: "right_click",
        query,
      });
    }

    pauseAgent(sandboxId) {
      return this.sdk.runtime._call(
        "e2b_computer_use_step",
        "POST",
        "/api/e2b/computer-use/step",
        { sandboxId: sandboxId || this.sdk.runtime.activeSandboxId, control: "pause" }
      );
    }

    stopAgent(sandboxId) {
      return this.sdk.runtime._call(
        "e2b_computer_use_step",
        "POST",
        "/api/e2b/computer-use/step",
        { sandboxId: sandboxId || this.sdk.runtime.activeSandboxId, control: "stop" }
      );
    }
  }

  // ==========================================================================
  // 4H. OPENROUTER MULTI-MODEL GATEWAY, OAUTH PKCE & AGENT PROTOCOL (`PokiSDK.ai`)
  // ==========================================================================
  class Game9KOpenRouterAdapter {
    constructor(sdk) {
      this.sdk = sdk;
      this.defaultSort = "latency";
      this.zdrEnabled = true;
    }

    _call(rpcAction, method, path, body = null) {
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return this.sdk._portalRpc(rpcAction, { ...(body || {}), path, method }).catch(() =>
          this.sdk.splice.request(path, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          })
        );
      }
      return this.sdk.splice.request(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }

    getStatus() {
      return this._call("openrouter_status", "GET", "/api/openrouter/status");
    }

    startPkceAuth(opts = {}) {
      return this._call("openrouter_pkce_start", "POST", "/api/openrouter/pkce/start", opts);
    }

    exchangePkceCode(opts = {}) {
      return this._call(
        "openrouter_pkce_exchange",
        "POST",
        "/api/openrouter/pkce/exchange",
        opts
      );
    }

    setBudgetLimit(limitUsd = 2.0) {
      return this._call("openrouter_budget", "POST", "/api/openrouter/budget", {
        limitUsd,
      });
    }

    chat(promptOrMessages, opts = {}) {
      const payload = Array.isArray(promptOrMessages)
        ? { messages: promptOrMessages, ...opts }
        : { prompt: String(promptOrMessages || ""), ...opts };
      if (!payload.sort) payload.sort = this.defaultSort;
      if (payload.zdr === undefined) payload.zdr = this.zdrEnabled;
      return this._call("openrouter_chat", "POST", "/api/openrouter/chat", payload);
    }

    /**
     * Vercel AI SDK-inspired non-blocking streaming across Poki `<iframe sandbox="allow-scripts">`
     * OR top-level SSE `/api/openrouter/stream`. Never blocks 60 FPS `requestAnimationFrame`.
     */
    async streamChat(promptOrMessages, opts = {}) {
      const { onDelta, onDone, ...rest } = opts || {};
      const payload = Array.isArray(promptOrMessages)
        ? { messages: promptOrMessages, ...rest }
        : { prompt: String(promptOrMessages || ""), ...rest };
      if (!payload.sort) payload.sort = this.defaultSort;
      if (payload.zdr === undefined) payload.zdr = this.zdrEnabled;

      // 1. Sandboxed Poki iframe (`origin === "null"`): bridge via PORTAL_STREAM_* postMessage
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return new Promise((resolve, reject) => {
          const streamId = `stream_${++this.sdk.rpcCounter}_${Date.now()}`;
          let fullText = "";
          const timer = setTimeout(() => {
            this.sdk.pendingStreams.delete(streamId);
            reject(new Error("Portal streamChat timeout"));
          }, 12000);
          this.sdk.pendingStreams.set(streamId, {
            timer,
            onChunk: (delta, evt) => {
              fullText += delta;
              if (typeof onDelta === "function") onDelta(delta, evt);
            },
            onFinish: (summary) => {
              clearTimeout(timer);
              this.sdk.pendingStreams.delete(streamId);
              const out = { ok: true, content: fullText, ...(summary || {}) };
              if (typeof onDone === "function") onDone(out);
              resolve(out);
            },
            onError: (errMsg) => {
              clearTimeout(timer);
              this.sdk.pendingStreams.delete(streamId);
              reject(new Error(errMsg || "Portal stream failed"));
            },
          });
          global.parent.postMessage(
            { type: "PORTAL_STREAM_START", streamId, payload },
            "*"
          );
        });
      }

      // 2. Top-level HTTP origin: read SSE `data: {...}\n\n` stream directly
      if (hasHttpOrigin() && typeof fetch === "function") {
        const res = await fetch("/api/openrouter/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Stream HTTP ${res.status}`);
        }
        let fullText = "";
        let finishSummary = {};
        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";
            for (const block of parts) {
              const line = block
                .split("\n")
                .find((l) => l.startsWith("data:"));
              if (!line) continue;
              try {
                const evt = JSON.parse(line.slice(5).trim());
                if (evt.type === "text-delta") {
                  fullText += evt.delta || "";
                  if (typeof onDelta === "function") onDelta(evt.delta || "", evt);
                } else if (evt.type === "finish") {
                  finishSummary = evt;
                }
              } catch {
                // Ignore malformed partial frame
              }
            }
          }
        } else {
          const raw = await res.text();
          for (const block of raw.split("\n\n")) {
            const line = block.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.type === "text-delta") {
              fullText += evt.delta || "";
              if (typeof onDelta === "function") onDelta(evt.delta || "", evt);
            } else if (evt.type === "finish") {
              finishSummary = evt;
            }
          }
        }
        const out = { ok: true, content: fullText, ...finishSummary };
        if (typeof onDone === "function") onDone(out);
        return out;
      }

      // 3. Offline standalone fallback
      const fallbackWords = ["Game9K ", "Poki ", "Stream ", "Ready!"];
      let acc = "";
      for (const w of fallbackWords) {
        acc += w;
        if (typeof onDelta === "function") onDelta(w, { type: "text-delta", delta: w });
      }
      const out = { ok: true, content: acc.trim(), cached: false, mode: "offline_mock" };
      if (typeof onDone === "function") onDone(out);
      return out;
    }

    async generateFragment(prompt, opts = {}) {
      const res = await this._call(
        "openrouter_generate_fragment",
        "POST",
        "/api/openrouter/fragments/generate",
        { prompt, ...opts }
      );
      if (res?.sbxId) {
        this.sdk.runtime.activeSandboxId = res.sbxId;
      }
      return res;
    }

    smartMorphEdit(sandboxId, instruction, filePath = "index.html") {
      return this._call(
        "openrouter_smart_morph",
        "POST",
        "/api/openrouter/fragments/morph",
        {
          sandboxId: sandboxId || this.sdk.runtime.activeSandboxId,
          instruction,
          file_path: filePath,
        }
      );
    }

    shoutcast(eventPayload = {}) {
      return this._call("openrouter_shoutcast", "POST", "/api/openrouter/shoutcast", eventPayload);
    }

    async playAudioDataUri(audioDataUri) {
      if (!audioDataUri || this.sdk.isPaused) return false;
      try {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (typeof AudioCtx === "function" && typeof global.atob === "function") {
          const base64Part = String(audioDataUri).split(",")[1] || "";
          const binary = global.atob(base64Part);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const ctx = new AudioCtx();
          const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.start(0);
          return true;
        }
        if (typeof global.Audio === "function") {
          const el = new global.Audio(audioDataUri);
          await el.play();
          return true;
        }
      } catch {
        // Ignore browser autoplay policy blocks prior to gesture
      }
      return false;
    }

    async speakShoutcast(eventOrText = {}, opts = {}) {
      const payload =
        typeof eventOrText === "string"
          ? { input: eventOrText, ...opts }
          : { ...eventOrText, ...opts };
      const res = await this._call(
        "openrouter_audio_speech",
        "POST",
        "/api/openrouter/audio/speech",
        payload
      );
      if (res?.ok && res.audioDataUri && opts.autoPlay !== false) {
        await this.playAudioDataUri(res.audioDataUri);
      }
      return res;
    }

    generateSprite(prompt, opts = {}) {
      const payload =
        typeof prompt === "object" && prompt !== null
          ? { ...prompt }
          : { prompt: String(prompt || "Golden T-Rex Sprite"), ...opts };
      return this._call(
        "openrouter_generate_sprite",
        "POST",
        "/api/openrouter/images/generate",
        payload
      );
    }

    listKolKeys() {
      return this._call("openrouter_kol_keys_list", "GET", "/api/openrouter/kol-keys");
    }

    createKolKey(opts = {}) {
      return this._call("openrouter_kol_keys_create", "POST", "/api/openrouter/kol-keys", opts);
    }

    updateKolKey(keyHash, patch = {}) {
      const h = encodeURIComponent(String(keyHash || ""));
      return this._call(
        "openrouter_kol_keys_update",
        "PATCH",
        `/api/openrouter/kol-keys/${h}`,
        patch
      );
    }

    revokeKolKey(keyHash) {
      const h = encodeURIComponent(String(keyHash || ""));
      return this._call(
        "openrouter_kol_keys_delete",
        "DELETE",
        `/api/openrouter/kol-keys/${h}`
      );
    }

    stickyChat(sessionId, promptOrMessages, opts = {}) {
      return this.chat(promptOrMessages, {
        ...opts,
        sessionId: String(sessionId || "g9k_sticky_kol_session"),
        cache_control: opts.cache_control || { type: "ephemeral" },
        cacheTtl: opts.cacheTtl || "30m",
      });
    }

    runBenchmark() {
      return this._call("openrouter_benchmark", "POST", "/api/openrouter/benchmark", {});
    }

    createAgentProtocolTask(input, additionalInput = {}) {
      return this._call(
        "openrouter_agent_task",
        "POST",
        "/api/agent-protocol/v1/agent/tasks",
        { input, additional_input: additionalInput }
      );
    }
  }

  // ==========================================================================
  // 4H. AGENTOPS, HELICONE CACHE, CHIDORI REACTIVE, SID CAPSULE & STEAMSHIP WEBHOOKS (`window.AgentOpsSDK`)
  // ==========================================================================
  class Game9KAgentOpsAdapter {
    constructor(sdk) {
      this.sdk = sdk;
    }

    _call(rpcAction, method, path, body = null) {
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return this.sdk._portalRpc(rpcAction, { ...(body || {}), path, method }).catch(() =>
          this.sdk.splice.request(path, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          })
        );
      }
      return this.sdk.splice.request(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }

    getDashboard() {
      return this._call("agentops_dashboard", "GET", "/api/agentops/dashboard");
    }

    getTraceReplay(traceId) {
      const id = encodeURIComponent(String(traceId || ""));
      return this._call(
        "agentops_trace_replay",
        "GET",
        `/api/agentops/traces/${id}/replay`,
        { traceId }
      );
    }

    scoreTrace(traceId, opts = {}) {
      const id = encodeURIComponent(String(traceId || ""));
      return this._call(
        "agentops_score_trace",
        "POST",
        `/api/agentops/traces/${id}/score`,
        { traceId, ...opts }
      );
    }

    emitReactiveEvent(eventType = "kol.high_tier_gift", payload = {}) {
      return this._call(
        "agentops_reactive_emit",
        "POST",
        "/api/agentops/reactive/emit",
        { eventType, payload }
      );
    }

    getContextCapsule(gameId = "dino-race") {
      const q = encodeURIComponent(String(gameId || "dino-race"));
      return this._call(
        "agentops_context_capsule",
        "GET",
        `/api/agentops/context-capsule?gameId=${q}`,
        { gameId }
      );
    }

    registerWebhook(opts = {}) {
      return this._call(
        "agentops_register_webhook",
        "POST",
        "/api/agentops/webhooks",
        opts
      );
    }

    dispatchWebhook(event = "studio.test_webhook", payload = {}) {
      return this._call(
        "agentops_dispatch_webhook",
        "POST",
        "/api/agentops/webhooks/dispatch",
        { event, payload }
      );
    }
  }

  // ==========================================================================
  // 4I. CLOUDFLARE R2 SIGV4 · SUPABASE · SOLANA ED25519 · NĐ 147 U18 GUARD (`PokiSDK.cloud`)
  // ==========================================================================
  class Game9KCloudEdgeAdapter {
    constructor(sdk) {
      this.sdk = sdk;
    }

    _call(rpcAction, method, path, body = null) {
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return this.sdk._portalRpc(rpcAction, { ...(body || {}), path, method }).catch(() =>
          this.sdk.splice.request(path, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          })
        );
      }
      return this.sdk.splice.request(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }

    getStatus() {
      return this._call("cloud_status", "GET", "/api/cloud/status");
    }

    publishToR2(gameSlug = "dino-race", opts = {}) {
      return this._call("cloud_r2_publish", "POST", "/api/cloud/r2/publish", {
        gameSlug,
        ...opts,
      });
    }

    syncSupabaseSave(gameId = "dino-race", data = {}, playerId = null) {
      return this._call("cloud_supabase_save", "POST", "/api/cloud/supabase/save", {
        gameId,
        playerId: playerId || this.sdk.playerId,
        data,
      });
    }

    submitSupabaseScore(gameId = "dino-race", scorePayload = {}) {
      return this._call(
        "cloud_supabase_leaderboard",
        "POST",
        "/api/cloud/supabase/leaderboard",
        {
          gameId,
          playerId: scorePayload.playerId || this.sdk.playerId,
          ...scorePayload,
        }
      );
    }

    evaluateSolanaMilestones(opts = {}) {
      return this._call(
        "cloud_solana_milestones",
        "POST",
        "/api/cloud/solana/milestones",
        opts
      );
    }

    verifySolanaSignature(message, signatureHex) {
      return this._call("cloud_solana_verify", "POST", "/api/cloud/solana/verify", {
        message,
        signatureHex,
      });
    }

    async heartbeatPlaytime(opts = {}) {
      const res = await this._call(
        "cloud_nd147_heartbeat",
        "POST",
        "/api/cloud/nd147/heartbeat",
        {
          playerId: opts.playerId || this.sdk.playerId,
          gameId: opts.gameId || this.sdk.gameId,
          ...opts,
        }
      );
      if (res?.shouldLockUnder18) {
        this.sdk.legalLocked = true;
        this.sdk.poki.gameplayStop("nd147_under18_limit");
        this.sdk._setPaused(true, "nd147_under18_limit");
      }
      return res;
    }

    async resetPlaytime(playerId = null) {
      const res = await this._call("cloud_nd147_reset", "POST", "/api/cloud/nd147/reset", {
        playerId: playerId || this.sdk.playerId,
      });
      if (res?.ok) {
        this.sdk.legalLocked = false;
        this.sdk._setPaused(false, "nd147_under18_limit");
      }
      return res;
    }
  }

  // ==========================================================================
  // 4J. MULTI-GAME KOL ESPORTS ARENA (ELO, ANTI-CHEAT & BATTLE PASS)
  // ==========================================================================
  class Game9KArenaAdapter {
    constructor(sdk) {
      this.sdk = sdk;
      this.activeScoreSession = null;
    }

    _call(rpcAction, method, path, body = null) {
      const payload = { ...(body || {}), path, method };
      if (this.sdk.isEmbedded && this.sdk.portalHostConnected) {
        return this.sdk._portalRpc(rpcAction, payload).catch(() =>
          this.sdk.splice.request(path, {
            method,
            ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
          })
        );
      }
      return this.sdk.splice.request(path, {
        method,
        ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
      });
    }

    getStatus() {
      return this._call("arena_status", "GET", "/api/arena/status");
    }

    listTournaments() {
      return this._call("arena_tournaments_list", "GET", "/api/arena/tournaments");
    }

    createTournament(options = {}) {
      return this._call("arena_tournaments_create", "POST", "/api/arena/tournaments", options);
    }

    reportMatchResult(tournamentId, result = {}) {
      const id = encodeURIComponent(String(tournamentId || ""));
      return this._call(
        "arena_match_report",
        "POST",
        `/api/arena/tournaments/${id}/matches`,
        result
      );
    }

    async startScoreSession(gameIdOrOptions = this.sdk.gameId) {
      const options =
        typeof gameIdOrOptions === "string"
          ? { gameId: gameIdOrOptions }
          : { ...(gameIdOrOptions || {}) };
      const res = await this._call("arena_anticheat_session", "POST", "/api/arena/anticheat/session", {
        playerId: options.playerId || this.sdk.playerId,
        gameId: options.gameId || this.sdk.gameId,
      });
      if (res?.ok && res.sessionToken) this.activeScoreSession = res;
      return res;
    }

    async _hmacSha256Hex(secret, message) {
      const cryptoApi = global.crypto;
      if (!cryptoApi?.subtle || typeof global.TextEncoder !== "function") return "";
      const encoder = new global.TextEncoder();
      const key = await cryptoApi.subtle.importKey(
        "raw",
        encoder.encode(String(secret)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await cryptoApi.subtle.sign("HMAC", key, encoder.encode(String(message)));
      return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    async computeClientProof({ session, score, durationSec, eventsCount, gameId, playerId } = {}) {
      const active = session || this.activeScoreSession;
      if (!active?.sessionToken) return "";
      const canonical = `${active.sessionToken}|${gameId || active.gameId}|${playerId || active.playerId}|${Number(score)}|${Number(durationSec)}|${Number(eventsCount)}`;
      return this._hmacSha256Hex(active.sessionToken, canonical);
    }

    async submitVerifiedScore({ session, nickname = "ArenaExplorer", score = 0, durationSec = 30, eventsCount = 25, clientProof, ...rest } = {}) {
      const active = session || this.activeScoreSession;
      if (!active?.sessionId || !active?.sessionToken) {
        return { ok: false, error: "No active anti-cheat score session." };
      }
      const gameId = active.gameId || this.sdk.gameId;
      const playerId = active.playerId || this.sdk.playerId;
      const proof =
        clientProof ||
        (await this.computeClientProof({
          session: active,
          score,
          durationSec,
          eventsCount,
          gameId,
          playerId,
        }));
      if (!proof) {
        return { ok: false, error: "Web Crypto HMAC is unavailable in this browser context." };
      }

      const res = await this._call("arena_anticheat_submit", "POST", "/api/arena/anticheat/submit", {
        ...rest,
        sessionId: active.sessionId,
        playerId,
        nickname,
        gameId,
        score,
        durationSec,
        eventsCount,
        clientProof: proof,
      });
      if (res?.ok) {
        if (this.activeScoreSession?.sessionId === active.sessionId) this.activeScoreSession = null;
        this.sdk.emitPortalEvent("arena_verified_score", {
          receiptId: res.record?.receiptId || null,
          score: Number(score) || 0,
          gameId,
        });
      }
      return res;
    }

    getBattlePass(playerId = this.sdk.playerId) {
      const id = encodeURIComponent(String(playerId || this.sdk.playerId || "guest"));
      return this._call("arena_battlepass_get", "GET", `/api/arena/battlepass/${id}`);
    }

    async awardBattlePassXp(gameIdOrOptions = this.sdk.gameId, xp = 50, reason = "gameplay_milestone", playerId = this.sdk.playerId) {
      const options =
        gameIdOrOptions && typeof gameIdOrOptions === "object"
          ? { ...gameIdOrOptions }
          : { gameId: gameIdOrOptions, xp, reason, playerId };
      const res = await this._call("arena_battlepass_xp", "POST", "/api/arena/battlepass/xp", {
        playerId: options.playerId || this.sdk.playerId,
        gameId: options.gameId || this.sdk.gameId,
        xp: options.xp ?? 50,
        reason: options.reason || "gameplay_milestone",
      });
      if (res?.ok) {
        this.sdk.emitPortalEvent("battlepass_xp_earned", {
          gameId: options.gameId || this.sdk.gameId,
          xp: res.xpAdded,
          reason: options.reason || "gameplay_milestone",
        });
      }
      return res;
    }

    async attributeCreatorSale(options = {}) {
      const res = await this._call("arena_creator_attribute", "POST", "/api/arena/creators/attribute", {
        buyerId: this.sdk.playerId,
        gameId: this.sdk.gameId,
        ...options,
      });
      if (res?.ok) this.sdk.emitPortalEvent("xsolla_purchase_finalized", res.attribution || {});
      return res;
    }
  }

  // ==========================================================================
  // 5. GAME9K CORE BRIDGE (Sandbox PostMessage RPC, Telemetry <= 20Hz, Legal Lock)
  // ==========================================================================
  class Game9KSDK {
    constructor() {
      this.gameId = "dino-race";
      this.version = "9.0.0";
      this.sdkVersion = "9.0.0";
      this.playerId = this._resolveGuestId();
      this.isEmbedded = Boolean(global.parent && global.parent !== global);
      this.portalHostConnected = false;
      this.portalParams = {};
      this.portalLanguage = null;

      this.pausedReasons = new Set();
      this.legalLocked = false;
      this.minTelemetryIntervalMs = 66; // ~15 Hz default (strictly <= 20 Hz Supabase limit)
      this.lastTelemetryAt = 0;
      this.pauseListeners = [];
      this.pendingRpcs = new Map();
      this.pendingStreams = new Map();
      this.rpcCounter = 0;

      this.stream = new LiveStreamBridge();
      this.ads = new Game9KAdsManager(this);
      this.splice = new Game9KSpliceAdapter(this);
      this.pos = new Game9KPosEconomyAdapter(this);
      this.economy = this.pos;
      this.runtime = new Game9KE2BRuntimeAdapter(this);
      this.interpreter = new Game9KCodeInterpreterAdapter(this);
      this.fragments = new Game9KFragmentsAdapter(this);
      this.computerUse = new Game9KComputerUseAdapter(this);
      this.ai = new Game9KOpenRouterAdapter(this);
      this.openRouter = this.ai;
      this.agentOps = new Game9KAgentOpsAdapter(this);
      this.cloud = new Game9KCloudEdgeAdapter(this);
      this.arena = new Game9KArenaAdapter(this);
      this.xsolla = new Game9KXsollaClient(this);
      this.commerce = this.xsolla;
      this.poki = new Game9KPokiAdapter(this);
      this.storage = SafeStorage;

      if (typeof global.addEventListener === "function") {
        global.addEventListener("message", (evt) => this._handleWindowMessage(evt));
      }

      if (this.isEmbedded) {
        this._handshakeWithPortal();
      }
    }

    _resolveGuestId() {
      const existing = SafeStorage.get("g9k_player_id");
      if (existing) return existing;
      const fresh = "g9k_" + Math.random().toString(36).slice(2, 10);
      SafeStorage.set("g9k_player_id", fresh);
      return fresh;
    }

    _handshakeWithPortal() {
      if (!this.isEmbedded || !global.parent) return;
      try {
        global.parent.postMessage(
          {
            source: `game9k:${this.gameId}`,
            type: "PORTAL_HANDSHAKE_SYN",
            sdkVersion: this.sdkVersion,
            playerId: this.playerId,
          },
          "*"
        );
      } catch {
        // Ignore
      }
    }

    _portalRpc(action, payload = {}, timeoutMs = 10000) {
      if (!this.isEmbedded || !global.parent) {
        return Promise.reject(new Error("Not embedded inside a parent portal"));
      }
      const reqId = `g9k_rpc_${++this.rpcCounter}_${Date.now().toString(36)}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingRpcs.delete(reqId);
          reject(new Error(`Portal RPC timeout (${action})`));
        }, timeoutMs);

        this.pendingRpcs.set(reqId, { resolve, reject, timer });
        global.parent.postMessage(
          {
            source: `game9k:${this.gameId}`,
            gameId: this.gameId,
            playerId: this.playerId,
            type: "PORTAL_RPC_REQUEST",
            reqId,
            action,
            payload,
          },
          "*"
        );
      });
    }

    init({ gameId, version, maxTelemetryHz = 15, onPauseChange, xsolla } = {}) {
      if (gameId) this.gameId = gameId;
      if (version) this.version = version;
      const clampedHz = Math.max(1, Math.min(20, Number(maxTelemetryHz) || 15));
      this.minTelemetryIntervalMs = Math.ceil(1000 / clampedHz);

      if (typeof onPauseChange === "function") {
        this.pauseListeners.push(onPauseChange);
      }
      if (xsolla && typeof xsolla === "object") {
        this.xsolla.configure(xsolla);
      }

      this.poki.isInitialized = true;
      this._handshakeWithPortal();

      this.emitPortalEvent("game_ready", {
        gameId: this.gameId,
        version: this.version,
        sdkVersion: this.sdkVersion,
        mode: this.isEmbedded ? "PORTAL_CONNECTED" : "STANDALONE_G4",
        maxTelemetryHz: clampedHz,
        capabilities: [
          "poki-portal-sdk",
          "xsolla-sdk-3",
          "splice-spec-to-sdk",
          "pos-kds-economy",
          "e2b-runtime-sandboxes",
          "e2b-code-interpreter",
          "e2b-fragments-morph",
          "open-computer-use",
          "openrouter-multi-model-pkce",
          "agent-protocol-v1",
          "arena-esports-brackets",
          "arena-anticheat-score-proofs",
          "arena-cross-game-battle-pass",
          "kol-live-bridge",
        ],
      });

      return this;
    }

    // Top-level Poki convenience aliases directly on `window.Game9K`
    gameplayStart() {
      return this.poki.gameplayStart();
    }
    gameplayStop(reason) {
      return this.poki.gameplayStop(reason);
    }
    gameLoadingFinished() {
      return this.poki.gameLoadingFinished();
    }
    happyTime(intensity) {
      return this.poki.happyTime(intensity);
    }
    commercialBreak(onStart) {
      return this.poki.commercialBreak(onStart);
    }
    rewardedBreak(optionsOrOnStart) {
      return this.poki.rewardedBreak(optionsOrOnStart);
    }
    sendTelemetry(eventType = "tick", payload = {}) {
      return this.broadcastTick({ eventType, ...payload });
    }
    shareableURL(params) {
      return this.poki.shareableURL(params);
    }
    movePill(topPercent, topPx) {
      return this.poki.movePill(topPercent, topPx);
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

      if (msg.type === "PORTAL_HANDSHAKE_ACK") {
        this.portalHostConnected = true;
        if (msg.params && typeof msg.params === "object") {
          this.portalParams = { ...this.portalParams, ...msg.params };
        }
        if (msg.language) this.portalLanguage = msg.language;
        if (msg.country) this.xsolla.settings.country = msg.country;
        return;
      }

      if (msg.type === "PORTAL_RPC_RESPONSE" && msg.reqId) {
        const pending = this.pendingRpcs.get(msg.reqId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRpcs.delete(msg.reqId);
          if (msg.ok === false) {
            pending.reject(new Error(msg.error || "Portal RPC failed"));
          } else {
            pending.resolve(msg.data);
          }
        }
        return;
      }

      if (msg.type === "PORTAL_STREAM_CHUNK" && msg.streamId) {
        const st = this.pendingStreams.get(msg.streamId);
        if (st && typeof st.onChunk === "function") {
          st.onChunk(msg.delta || "", msg);
        }
        return;
      }

      if (msg.type === "PORTAL_STREAM_DONE" && msg.streamId) {
        const st = this.pendingStreams.get(msg.streamId);
        if (st) {
          if (msg.ok === false && typeof st.onError === "function") {
            st.onError(msg.error || "Portal stream failed");
          } else if (typeof st.onFinish === "function") {
            st.onFinish(msg.summary || {});
          }
        }
        return;
      }

      if (msg.type === "PAUSE_GAME") {
        this._setPaused(true, "portal");
      } else if (msg.type === "RESUME_GAME") {
        this._setPaused(false, "portal");
      } else if (msg.type === "UNDER18_LIMIT_LOCK") {
        this.legalLocked = true;
        this.poki.gameplayStop("nd147_under18_limit");
        this._setPaused(true, "nd147_under18_limit");
      } else if (msg.type === "UNDER18_LIMIT_UNLOCK") {
        this.legalLocked = false;
        this._setPaused(false, "nd147_under18_limit");
      } else if (msg.type === "PORTAL_OPEN_STORE") {
        this.xsolla.openStoreModal(msg.payload || {});
      } else if (msg.type === "ENVD_FREEZE") {
        this.runtime.envd.frozen = true;
        this._setPaused(true, "envd_freeze");
      } else if (msg.type === "ENVD_THAW") {
        this.runtime.envd.frozen = false;
        this._setPaused(false, "envd_freeze");
      } else if (msg.type === "COMPUTER_USE_ACTION" && msg.payload) {
        if (msg.payload.key) this.computerUse.sendKey(msg.payload.key);
        else if (typeof msg.payload.x === "number") {
          this.computerUse.drawBigDot(msg.payload.x, msg.payload.y);
        }
      } else if (
        (msg.type === "TIKTOK_EVENT" || msg.type === "STREAM_EVENT") &&
        msg.payload
      ) {
        this.stream.ingest(msg.payload);
      }
    }

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

    async submitScore(entry = {}) {
      const payload = {
        playerId: this.playerId,
        ...entry,
      };
      this.emitPortalEvent("leaderboard_submit", payload);

      if (hasHttpOrigin()) {
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

    async saveCloudState(stateObj) {
      SafeStorage.set(`g9k_save_${this.gameId}`, JSON.stringify(stateObj));
      this.emitPortalEvent("cloud_save", { data: stateObj });

      if (hasHttpOrigin()) {
        try {
          await fetch(
            `/api/portal/cloud-save/${encodeURIComponent(
              this.gameId
            )}/${encodeURIComponent(this.playerId)}`,
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
      if (hasHttpOrigin()) {
        try {
          const res = await fetch(
            `/api/portal/cloud-save/${encodeURIComponent(
              this.gameId
            )}/${encodeURIComponent(this.playerId)}`
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
  global.PokiSDK = sdkInstance.poki;
  global.XsollaSDK = sdkInstance.xsolla;
  global.SpliceSDK = sdkInstance.splice;
  global.Game9KPOS = sdkInstance.pos;
  global.E2BRuntimeSDK = sdkInstance.runtime;
  global.CodeInterpreterSDK = sdkInstance.interpreter;
  global.FragmentsSDK = sdkInstance.fragments;
  global.ComputerUseSDK = sdkInstance.computerUse;
  global.OpenRouterSDK = sdkInstance.ai;
  global.AgentOpsSDK = sdkInstance.agentOps;
  global.CloudEdgeSDK = sdkInstance.cloud;
  global.ArenaSDK = sdkInstance.arena;
  global.LiveStreamBridge = sdkInstance.stream;
  global.TikTokBridge = sdkInstance.stream;
})(typeof window !== "undefined" ? window : globalThis);
