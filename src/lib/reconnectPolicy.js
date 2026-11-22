/**
 * reconnectPolicy.js
 * Exponential backoff with ±30% jitter for resilient 24/7 KOL livestream connections.
 */

export const DEFAULT_RECONNECT_CONFIG = {
  baseDelayMs: 2000,
  maxDelayMs: 32000,
  maxAttempts: 6,
  jitterRatio: 0.3,
};

/**
 * Whether another reconnect attempt should be made.
 * @param {number} attempt - 0-indexed attempt count
 * @param {Object} [cfg]
 */
export function shouldRetry(attempt, cfg = DEFAULT_RECONNECT_CONFIG) {
  return attempt < (cfg.maxAttempts ?? DEFAULT_RECONNECT_CONFIG.maxAttempts);
}

/**
 * Compute next delay in ms using exponential backoff + random jitter.
 * @param {number} attempt - 0-indexed attempt count
 * @param {Object} [cfg]
 */
export function getReconnectDelay(attempt, cfg = DEFAULT_RECONNECT_CONFIG) {
  const base = cfg.baseDelayMs ?? DEFAULT_RECONNECT_CONFIG.baseDelayMs;
  const max = cfg.maxDelayMs ?? DEFAULT_RECONNECT_CONFIG.maxDelayMs;
  const jitterRatio = cfg.jitterRatio ?? DEFAULT_RECONNECT_CONFIG.jitterRatio;

  const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
  const jitter = exp * jitterRatio * (Math.random() * 2 - 1);
  return Math.max(500, Math.round(exp + jitter));
}

/**
 * Promise sleep helper.
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
