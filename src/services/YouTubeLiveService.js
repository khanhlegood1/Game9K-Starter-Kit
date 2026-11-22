/**
 * YouTubeLiveService.js
 * Dual-mode YouTube Live Chat & SuperChat Connector for KOL Streamers:
 *
 * Mode A — YouTube Data API v3 (`liveChatMessages.list`):
 *   Used when `apiKey` (or `process.env.YOUTUBE_API_KEY`) is provided.
 *   Resolves `videoId` -> `activeLiveChatId` and polls official messages,
 *   SuperChats, SuperStickers, and Channel Memberships.
 *
 * Mode B — Zero-Key InnerTube Live Chat Polling (`youtubei/v1/live_chat/get_live_chat`):
 *   Used automatically when no API key is configured! Extracts initial
 *   InnerTube continuation token from the public `live_chat?v=VIDEO_ID` page
 *   and streams live comments & SuperChats without requiring Google Cloud setup.
 */

import {
  normalizeYouTubeApiItem,
  normalizeYouTubeInnerTubeItem,
} from "../lib/streamEventNormalizer.js";

/**
 * Extract 11-character YouTube Video ID from diverse URLs or raw input.
 * Supports:
 * - `https://www.youtube.com/watch?v=vmEeXa9zktk`
 * - `https://m.youtube.com/watch?v=vmEeXa9zktk`
 * - `https://youtu.be/vmEeXa9zktk`
 * - `https://www.youtube.com/live/vmEeXa9zktk?si=...`
 * - `vmEeXa9zktk`
 *
 * @param {string} input
 * @returns {string|null}
 */
export function parseYouTubeVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (seg && /^[a-zA-Z0-9_-]{11}$/.test(seg)) return seg;
    }
    const vParam = u.searchParams.get("v");
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

    const parts = u.pathname.split("/").filter(Boolean);
    const liveIdx = parts.findIndex((p) => p === "live" || p === "embed" || p === "shorts");
    if (liveIdx >= 0 && parts[liveIdx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[liveIdx + 1])) {
      return parts[liveIdx + 1];
    }
  } catch {
    // Fallback regex scan
    const match = raw.match(/(?:v=|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }

  return null;
}

export class YouTubeLiveService {
  constructor() {
    /**
     * Active YouTube polling sessions keyed by videoId
     * @type {Map<string, Object>}
     */
    this.sessions = new Map();
  }

  /**
   * Subscribe a Game9K room to a YouTube Live video stream.
   * @param {string} videoUrlOrId
   * @param {string} roomId
   * @param {Object} options - `{ apiKey?: string }`
   * @param {(roomId: string, event: Object) => void} onEvent
   * @param {(roomId: string, status: Object) => void} onStatus
   */
  async subscribe(videoUrlOrId, roomId, options = {}, onEvent, onStatus) {
    const videoId = parseYouTubeVideoId(videoUrlOrId);
    if (!videoId) {
      throw new Error(
        "Invalid YouTube Live URL or Video ID (expected watch?v=..., youtube.com/live/..., or 11-char ID)"
      );
    }

    const existing = this.sessions.get(videoId);
    if (existing && !existing.stopped) {
      existing.rooms.add(roomId);
      onStatus(roomId, {
        platform: "youtube",
        status: existing.status,
        target: videoId,
        mode: existing.mode,
      });
      return { ok: true, reused: true, videoId, status: existing.status };
    }

    const apiKey = String(options.apiKey || process.env.YOUTUBE_API_KEY || "").trim();
    const session = {
      videoId,
      apiKey,
      mode: apiKey ? "data-api-v3" : "innertube",
      rooms: new Set([roomId]),
      seenIds: new Set(),
      status: "connecting",
      stopped: false,
      timer: null,
      liveChatId: null,
      nextPageToken: null,
      innertubeKey: null,
      continuation: null,
    };
    this.sessions.set(videoId, session);

    session._broadcastEvent = (evt) => {
      if (evt.id) {
        if (session.seenIds.has(evt.id)) return;
        if (session.seenIds.size > 4000) {
          const iter = session.seenIds.keys();
          for (let i = 0; i < 1000; i++) session.seenIds.delete(iter.next().value);
        }
        session.seenIds.add(evt.id);
      }
      for (const rId of session.rooms) {
        onEvent(rId, evt);
      }
    };

    session._broadcastStatus = (info) => {
      session.status = info.status;
      for (const rId of session.rooms) {
        onStatus(rId, {
          platform: "youtube",
          target: videoId,
          mode: session.mode,
          ...info,
        });
      }
    };

    if (apiKey) {
      return this._startDataApiPolling(session);
    }
    return this._startInnerTubePolling(session);
  }

  // --------------------------------------------------------------------------
  // Mode A: Official YouTube Data API v3
  // --------------------------------------------------------------------------
  async _startDataApiPolling(session) {
    session._broadcastStatus({ status: "connecting" });
    try {
      const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${encodeURIComponent(
        session.videoId
      )}&key=${encodeURIComponent(session.apiKey)}`;

      const res = await fetch(videoUrl, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `YouTube API HTTP ${res.status}`);
      }

      const item = data?.items?.[0];
      const liveChatId = item?.liveStreamingDetails?.activeLiveChatId;
      if (!liveChatId) {
        throw new Error("Video does not have an active YouTube Live chat right now");
      }

      session.liveChatId = liveChatId;
      session._broadcastStatus({
        status: "connected",
        title: item?.snippet?.title || session.videoId,
      });

      this._pollDataApiTick(session, true);
      return { ok: true, videoId: session.videoId, status: "connected", mode: session.mode };
    } catch (err) {
      const message = err?.message || "Failed to connect to YouTube Data API v3";
      session._broadcastStatus({ status: "offline", message });
      return { ok: false, videoId: session.videoId, status: "offline", message };
    }
  }

  async _pollDataApiTick(session, isInitial = false) {
    if (session.stopped || session.rooms.size === 0) return;

    let nextPollMs = 4000;
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
      url.searchParams.set("liveChatId", session.liveChatId);
      url.searchParams.set("part", "id,snippet,authorDetails");
      url.searchParams.set("maxResults", "200");
      url.searchParams.set("key", session.apiKey);
      if (session.nextPageToken) {
        url.searchParams.set("pageToken", session.nextPageToken);
      }

      const res = await fetch(url.href, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();

      if (res.ok && data) {
        session.nextPageToken = data.nextPageToken || session.nextPageToken;
        nextPollMs = Math.max(2500, Number(data.pollingIntervalMillis || 4000));

        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          if (isInitial) {
            // Seed seenIds on initial fetch so historical chat backlog doesn't flood race start
            if (item.id) session.seenIds.add(item.id);
          } else {
            const normalized = normalizeYouTubeApiItem(item);
            if (normalized) session._broadcastEvent(normalized);
          }
        }
      } else {
        nextPollMs = 10_000;
        session._broadcastStatus({
          status: "warning",
          message: data?.error?.message || `Poll HTTP ${res.status}`,
        });
      }
    } catch (err) {
      nextPollMs = 8000;
      session._broadcastStatus({
        status: "warning",
        message: err?.message || "YouTube poll transient error",
      });
    }

    if (!session.stopped && session.rooms.size > 0) {
      session.timer = setTimeout(() => this._pollDataApiTick(session, false), nextPollMs);
    }
  }

  // --------------------------------------------------------------------------
  // Mode B: Zero-Key InnerTube `get_live_chat` Polling
  // --------------------------------------------------------------------------
  async _startInnerTubePolling(session) {
    session._broadcastStatus({ status: "connecting" });
    try {
      const chatPageUrl = `https://www.youtube.com/live_chat?v=${encodeURIComponent(session.videoId)}`;
      const res = await fetch(chatPageUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        },
      });
      if (!res.ok) {
        throw new Error(`YouTube live_chat page returned HTTP ${res.status}`);
      }

      const html = await res.text();
      const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      const contMatch = html.match(/"continuation":"([^"]+)"/);

      if (!keyMatch || !contMatch) {
        throw new Error("Stream is not currently live or live chat is disabled");
      }

      session.innertubeKey = keyMatch[1];
      session.continuation = contMatch[1];

      session._broadcastStatus({ status: "connected" });
      this._pollInnerTubeTick(session, true);
      return { ok: true, videoId: session.videoId, status: "connected", mode: session.mode };
    } catch (err) {
      const message =
        err?.message ||
        "Cannot reach YouTube Live (verify video is LIVE or supply YOUTUBE_API_KEY)";
      session._broadcastStatus({ status: "offline", message });
      return { ok: false, videoId: session.videoId, status: "offline", message };
    }
  }

  async _pollInnerTubeTick(session, isInitial = false) {
    if (session.stopped || session.rooms.size === 0) return;

    let nextPollMs = 3500;
    try {
      const endpoint = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${encodeURIComponent(
        session.innertubeKey
      )}`;
      const res = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20260101.00.00",
            },
          },
          continuation: session.continuation,
        }),
      });

      const data = await res.json();
      const liveChatCont = data?.continuationContents?.liveChatContinuation;
      if (liveChatCont) {
        const contArr = liveChatCont.continuations || [];
        for (const c of contArr) {
          const timed =
            c.invalidationContinuationData ||
            c.timedContinuationData ||
            c.reloadContinuationData;
          if (timed?.continuation) {
            session.continuation = timed.continuation;
            if (timed.timeoutMs) {
              nextPollMs = Math.max(2000, Math.min(10000, Number(timed.timeoutMs)));
            }
            break;
          }
        }

        const actions = liveChatCont.actions || [];
        for (const act of actions) {
          const item = act?.addChatItemAction?.item;
          if (!item) continue;
          const normalized = normalizeYouTubeInnerTubeItem(item);
          if (!normalized) continue;
          if (isInitial) {
            if (normalized.id) session.seenIds.add(normalized.id);
          } else {
            session._broadcastEvent(normalized);
          }
        }
      } else {
        nextPollMs = 8000;
      }
    } catch {
      nextPollMs = 7000;
    }

    if (!session.stopped && session.rooms.size > 0) {
      session.timer = setTimeout(() => this._pollInnerTubeTick(session, false), nextPollMs);
    }
  }

  unsubscribe(videoUrlOrId, roomId) {
    const videoId = parseYouTubeVideoId(videoUrlOrId);
    if (!videoId) return;
    const session = this.sessions.get(videoId);
    if (!session) return;

    session.rooms.delete(roomId);
    if (session.rooms.size === 0) {
      session.stopped = true;
      if (session.timer) clearTimeout(session.timer);
      this.sessions.delete(videoId);
    }
  }

  getStats() {
    const active = [];
    for (const [videoId, s] of this.sessions.entries()) {
      active.push({
        videoId,
        mode: s.mode,
        status: s.status,
        rooms: s.rooms.size,
      });
    }
    return active;
  }
}

export default new YouTubeLiveService();
