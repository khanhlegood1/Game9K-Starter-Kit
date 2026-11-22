/**
 * TikTokConnectorService.js
 * Multi-tenant TikTok Live connector powered by `tiktok-live-connector` v2.
 *
 * Combines best practices from:
 * - `vamnguyen/tiktok-live-games` (room isolation, exponential backoff reconnect)
 * - `khanhlx6/khanh-dragon-egg-tiktok-live` (`TikTokLiveConnection`, `WebcastEvent`, `ControlEvent`)
 * - Real-time combo gift delta tracking (`GiftStreakTracker`)
 */

import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";
import {
  GiftStreakTracker,
  normalizeTikTokChat,
  normalizeTikTokGift,
  normalizeTikTokLike,
  normalizeTikTokSocial,
} from "../lib/streamEventNormalizer.js";
import { getReconnectDelay, shouldRetry, sleep } from "../lib/reconnectPolicy.js";

export class TikTokConnectorService {
  constructor() {
    /**
     * Active TikTok connections keyed by normalized TikTok username
     * @type {Map<string, {
     *   username: string,
     *   connection: TikTokLiveConnection,
     *   streakTracker: GiftStreakTracker,
     *   greetedMembers: Set<string>,
     *   rooms: Set<string>,
     *   status: string,
     *   roomId: string|null,
     *   stopped: boolean,
     *   reconnecting: boolean
     * }>}
     */
    this.sessions = new Map();
  }

  /**
   * Sanitize `@username` -> `username`
   * @param {string} raw
   * @returns {string}
   */
  sanitizeUsername(raw) {
    return String(raw || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .toLowerCase();
  }

  /**
   * Attach a Game9K room to a TikTok Live username. Reuses existing upstream connection
   * if another room is already subscribed to the same creator.
   *
   * @param {string} rawUsername
   * @param {string} roomId
   * @param {(roomId: string, event: Object) => void} onEvent
   * @param {(roomId: string, status: Object) => void} onStatus
   */
  async subscribe(rawUsername, roomId, onEvent, onStatus) {
    const username = this.sanitizeUsername(rawUsername);
    if (!username) {
      throw new Error("Invalid TikTok username");
    }

    const existing = this.sessions.get(username);
    if (existing && !existing.stopped) {
      existing.rooms.add(roomId);
      onStatus(roomId, {
        platform: "tiktok",
        status: existing.status,
        target: `@${username}`,
        upstreamRoomId: existing.roomId,
      });
      return { ok: true, reused: true, username, status: existing.status };
    }

    const session = {
      username,
      connection: null,
      streakTracker: new GiftStreakTracker(),
      greetedMembers: new Set(),
      rooms: new Set([roomId]),
      status: "connecting",
      roomId: null,
      stopped: false,
      reconnecting: false,
    };
    this.sessions.set(username, session);

    const broadcastEvent = (evt) => {
      for (const rId of session.rooms) {
        onEvent(rId, evt);
      }
    };

    const broadcastStatus = (statusObj) => {
      session.status = statusObj.status;
      for (const rId of session.rooms) {
        onStatus(rId, {
          platform: "tiktok",
          target: `@${username}`,
          ...statusObj,
        });
      }
    };

    session._broadcastEvent = broadcastEvent;
    session._broadcastStatus = broadcastStatus;

    return this._openConnection(session);
  }

  async _openConnection(session) {
    const { username } = session;
    if (session.stopped || session.rooms.size === 0) {
      this.sessions.delete(username);
      return { ok: false, username, status: "stopped" };
    }

    session._broadcastStatus({ status: "connecting" });

    try {
      const options = {
        processInitialData: true,
        enableExtendedGiftInfo: true,
      };
      if (process.env.TIKTOK_SESSION_ID) {
        options.sessionId = process.env.TIKTOK_SESSION_ID;
      }
      if (process.env.TIKTOK_TARGET_IDC) {
        options.ttTargetIdc = process.env.TIKTOK_TARGET_IDC;
      }

      const conn = new TikTokLiveConnection(username, options);
      session.connection = conn;

      conn.on(WebcastEvent.CHAT, (data) => {
        session._broadcastEvent(normalizeTikTokChat(data));
      });

      conn.on(WebcastEvent.GIFT, (data) => {
        const delta = session.streakTracker.consumeDelta(data);
        if (delta <= 0) return;
        session._broadcastEvent(normalizeTikTokGift(data, delta));
      });

      conn.on(WebcastEvent.LIKE, (data) => {
        session._broadcastEvent(normalizeTikTokLike(data));
      });

      if (WebcastEvent.SHARE) {
        conn.on(WebcastEvent.SHARE, (data) => {
          session._broadcastEvent(normalizeTikTokSocial(data, "share"));
        });
      }

      conn.on(WebcastEvent.SOCIAL, (data) => {
        if (String(data?.displayType || "").includes("share")) {
          session._broadcastEvent(normalizeTikTokSocial(data, "share"));
        }
      });

      if (WebcastEvent.FOLLOW) {
        conn.on(WebcastEvent.FOLLOW, (data) => {
          session._broadcastEvent(normalizeTikTokSocial(data, "follow"));
        });
      }

      conn.on(WebcastEvent.MEMBER, (data) => {
        const uid = data?.user?.uniqueId || data?.uniqueId;
        if (!uid || session.greetedMembers.has(uid)) return;
        if (session.greetedMembers.size > 2000) session.greetedMembers.clear();
        session.greetedMembers.add(uid);
        session._broadcastEvent(normalizeTikTokSocial(data, "join"));
      });

      conn.on(ControlEvent.CONNECTED, (state) => {
        session.roomId = state?.roomId || null;
        session._broadcastStatus({
          status: "connected",
          upstreamRoomId: session.roomId,
        });
      });

      conn.on(ControlEvent.DISCONNECTED, () => {
        if (session.stopped) return;
        session._broadcastStatus({ status: "disconnected" });
        this._scheduleReconnect(session);
      });

      conn.on(ControlEvent.ERROR, (err) => {
        const msg = err?.info || err?.exception?.message || err?.message || String(err);
        session._broadcastStatus({ status: "warning", message: msg });
      });

      const state = await conn.connect();
      session.roomId = state?.roomId || null;
      session._broadcastStatus({
        status: "connected",
        upstreamRoomId: session.roomId,
      });
      return { ok: true, username, status: "connected", roomId: session.roomId };
    } catch (err) {
      const message = err?.message || "Unable to connect (creator may be offline or network restricted)";
      session._broadcastStatus({
        status: "offline",
        message,
      });
      this._scheduleReconnect(session);
      return { ok: false, username, status: "offline", message };
    }
  }

  async _scheduleReconnect(session) {
    if (session.reconnecting || session.stopped) return;
    session.reconnecting = true;

    let attempt = 0;
    while (!session.stopped && session.rooms.size > 0 && shouldRetry(attempt)) {
      const delayMs = getReconnectDelay(attempt);
      session._broadcastStatus({
        status: "reconnecting",
        attempt: attempt + 1,
        delayMs,
      });
      await sleep(delayMs);
      if (session.stopped || session.rooms.size === 0) break;

      try {
        session.connection?.removeAllListeners?.();
        session.connection?.disconnect?.();
      } catch {
        // Ignore cleanup errors
      }

      const res = await this._openConnection(session);
      if (res.ok) {
        session.reconnecting = false;
        return;
      }
      attempt += 1;
    }

    session.reconnecting = false;
  }

  /**
   * Unsubscribe a room from a TikTok creator; closes upstream socket if 0 rooms remain.
   * @param {string} rawUsername
   * @param {string} roomId
   */
  unsubscribe(rawUsername, roomId) {
    const username = this.sanitizeUsername(rawUsername);
    const session = this.sessions.get(username);
    if (!session) return;

    session.rooms.delete(roomId);
    if (session.rooms.size === 0) {
      session.stopped = true;
      try {
        session.connection?.removeAllListeners?.();
        session.connection?.disconnect?.();
      } catch {
        // Ignore
      }
      this.sessions.delete(username);
    }
  }

  getStats() {
    const active = [];
    for (const [username, s] of this.sessions.entries()) {
      active.push({
        username: `@${username}`,
        status: s.status,
        rooms: s.rooms.size,
      });
    }
    return active;
  }
}

export default new TikTokConnectorService();
