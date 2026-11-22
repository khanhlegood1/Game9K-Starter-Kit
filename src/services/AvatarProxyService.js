/**
 * AvatarProxyService.js
 * CORS-safe avatar proxy & deterministic SVG badge fallback so HTML5 Canvas 2D
 * can render TikTok Live & YouTube Live viewer avatars inside marbles/dino tags
 * without tainting the canvas.
 * Inspired by khanhlx6/khanh-dragon-egg-tiktok-live.
 */

import { ALLOWED_AVATAR_HOSTS } from "../lib/streamEventNormalizer.js";

const MAX_CACHE_ITEMS = 250;
const CACHE_TTL_MS = 30 * 60 * 1000;

export class AvatarProxyService {
  constructor() {
    /** @type {Map<string, {buffer: Buffer, contentType: string, expiresAt: number}>} */
    this.cache = new Map();
  }

  /**
   * Generate a clean SVG avatar badge for fallback or simulated viewers.
   * @param {string} name
   * @returns {{buffer: Buffer, contentType: string}}
   */
  generateFallbackSvg(name = "G9K") {
    const clean = String(name || "G9K").trim();
    const initials = clean.slice(0, 2).toUpperCase();
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = (hash * 31 + clean.charCodeAt(i)) | 0;
    }
    const hues = [38, 158, 175, 345, 265, 198];
    const hue = hues[Math.abs(hash) % hues.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue}, 82%, 48%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 35) % 360}, 78%, 28%)"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#g)" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      <text x="32" y="39" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="22" fill="#ffffff">${initials.replace(/[<>&"']/g, "")}</text>
    </svg>`;
    return {
      buffer: Buffer.from(svg, "utf8"),
      contentType: "image/svg+xml",
    };
  }

  /**
   * Validate and fetch remote avatar from allowlisted TikTok / YouTube CDNs.
   * @param {string} rawUrl
   * @param {string} [fallbackName]
   * @returns {Promise<{status: number, buffer?: Buffer, contentType?: string, error?: string}>}
   */
  async fetchAvatar(rawUrl, fallbackName = "") {
    if (!rawUrl) {
      if (fallbackName) {
        return { status: 200, ...this.generateFallbackSvg(fallbackName) };
      }
      return { status: 400, error: "Missing avatar URL (`u` query param)" };
    }

    let parsed;
    try {
      parsed = new URL(String(rawUrl));
    } catch {
      return { status: 400, error: "Malformed avatar URL" };
    }

    if (parsed.protocol !== "https:" || !ALLOWED_AVATAR_HOSTS.test(parsed.hostname)) {
      return {
        status: 403,
        error: "Avatar hostname not in Game9K CDN allowlist",
      };
    }

    const cached = this.cache.get(parsed.href);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        status: 200,
        buffer: cached.buffer,
        contentType: cached.contentType,
      };
    }

    try {
      const res = await fetch(parsed.href, {
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Game9KAvatarProxy/1.0)",
        },
      });
      if (!res.ok) {
        if (fallbackName) {
          return { status: 200, ...this.generateFallbackSvg(fallbackName) };
        }
        return { status: 502, error: `Upstream CDN returned HTTP ${res.status}` };
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        return { status: 415, error: "Upstream response is not an image" };
      }

      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > 1_500_000) {
        return { status: 413, error: "Avatar image exceeds 1.5MB safety cap" };
      }

      const buffer = Buffer.from(arrayBuf);
      if (this.cache.size >= MAX_CACHE_ITEMS) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(parsed.href, {
        buffer,
        contentType,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return { status: 200, buffer, contentType };
    } catch {
      if (fallbackName) {
        return { status: 200, ...this.generateFallbackSvg(fallbackName) };
      }
      return { status: 504, error: "Timed out fetching avatar" };
    }
  }
}

export default new AvatarProxyService();
