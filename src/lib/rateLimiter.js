/**
 * rateLimiter.js
 * Lightweight per-IP connection and sliding-window request rate limiter
 * protecting KOL rooms and TikTok/YouTube upstream connectors from abuse.
 * Inspired by khanhlx6/TikTok-Chat-Reader/limiter.js.
 */

export class IpRateLimiter {
  constructor({ maxSocketsPerIp = 25, maxRequestsPerMinute = 120 } = {}) {
    this.maxSocketsPerIp = maxSocketsPerIp;
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    /** @type {Map<string, {count: number, resetAt: number}>} */
    this.windowCounts = new Map();
  }

  /**
   * Extract client IP safely behind reverse proxies (Cloudflare / E2B / Nginx).
   * @param {Object} reqOrSocket
   * @returns {string}
   */
  extractIp(reqOrSocket) {
    const headers = reqOrSocket?.headers || reqOrSocket?.handshake?.headers || {};
    const forwarded = headers["cf-connecting-ip"] || headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0].trim();
    }
    return (
      reqOrSocket?.ip ||
      reqOrSocket?.socket?.remoteAddress ||
      reqOrSocket?.handshake?.address ||
      "unknown"
    );
  }

  /**
   * Check & increment per-minute request quota for an IP.
   * @param {string} ip
   * @returns {{allowed: boolean, remaining: number}}
   */
  consumeRequest(ip) {
    const now = Date.now();
    let bucket = this.windowCounts.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60_000 };
      this.windowCounts.set(ip, bucket);
    }
    bucket.count += 1;

    if (this.windowCounts.size > 2000) {
      for (const [k, v] of this.windowCounts.entries()) {
        if (now >= v.resetAt) this.windowCounts.delete(k);
      }
    }

    return {
      allowed: bucket.count <= this.maxRequestsPerMinute,
      remaining: Math.max(0, this.maxRequestsPerMinute - bucket.count),
    };
  }

  /**
   * Check whether a new Socket.io client exceeds per-IP concurrent connection cap.
   * @param {import('socket.io').Server} io
   * @param {import('socket.io').Socket} socket
   * @returns {boolean} true if blocked
   */
  isSocketBlocked(io, socket) {
    const ip = this.extractIp(socket);
    let activeFromIp = 0;
    io.of("/").sockets.forEach((s) => {
      if (this.extractIp(s) === ip) activeFromIp += 1;
    });
    if (activeFromIp > this.maxSocketsPerIp) return true;
    return !this.consumeRequest(ip).allowed;
  }
}
