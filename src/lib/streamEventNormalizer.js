/**
 * streamEventNormalizer.js
 * Unified pure normalization layer for TikTok Live, YouTube Live, and Webhook events.
 *
 * Bridges:
 * - TikTok Live (`tiktok-live-connector` v2 & v1 event shapes + streak combo delta tracking)
 * - YouTube Live (Data API v3 `liveChatMessages` + InnerTube `get_live_chat` actions)
 * - Custom KOL Webhook / Simulator payloads
 *
 * Emits a canonical Game9K stream event shape while preserving compatibility
 * with `vamnguyen/tiktok-live-games` (`tiktok_chat`, `tiktok_gift`, `tiktok_like`, `tiktok_share`).
 */

/** Allowed CDN hostnames for CORS-safe Canvas 2D avatar proxying */
export const ALLOWED_AVATAR_HOSTS =
  /(^|\.)(tiktokcdn(-[a-z0-9]+)?\.(com|net)|ibyteimg\.com|byteimg\.com|ibytedtos\.com|muscdn\.com|ggpht\.com|googleusercontent\.com|ytimg\.com)$/i;

/**
 * Convert raw external avatar URL into a same-origin proxy path so Canvas 2D
 * can draw viewer profile photos inside marbles/dino badges without CORS taint.
 * @param {string} rawUrl
 * @returns {string}
 */
export function toSafeAvatarUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  if (rawUrl.startsWith("/api/avatar")) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "https:" && ALLOWED_AVATAR_HOSTS.test(parsed.hostname)) {
      return `/api/avatar?u=${encodeURIComponent(rawUrl)}`;
    }
  } catch {
    // Ignore malformed URLs
  }
  return "";
}

/**
 * Extract raw avatar URL from diverse TikTok v1/v2 or YouTube user objects.
 * @param {Object} userObj
 * @returns {string}
 */
export function extractRawAvatar(userObj) {
  if (!userObj || typeof userObj !== "object") return "";
  return (
    userObj.profilePictureUrl ||
    userObj.avatarUrl ||
    userObj.profileImageUrl ||
    userObj.profilePicture?.url?.[0] ||
    userObj.profilePicture?.urls?.[0] ||
    userObj.avatarThumb?.urlList?.[0] ||
    userObj.avatarThumb?.url?.[0] ||
    userObj.authorPhoto?.thumbnails?.[0]?.url ||
    ""
  );
}

/**
 * Normalize user identity across TikTok Live, YouTube Live, and Simulator.
 * @param {Object} raw
 * @param {"tiktok"|"youtube"|"simulator"|"webhook"} platform
 */
export function normalizeUser(raw = {}, platform = "tiktok") {
  const u = raw.user && typeof raw.user === "object" ? raw.user : raw;
  const uniqueId = String(
    u.uniqueId ||
      u.channelId ||
      u.externalChannelId ||
      u.id ||
      u.user ||
      u.nickname ||
      "viewer"
  )
    .trim()
    .slice(0, 64);

  const nickname = String(
    u.nickname ||
      u.displayName ||
      u.authorName?.simpleText ||
      u.uniqueId ||
      raw.user ||
      "Khán Giả"
  )
    .trim()
    .slice(0, 48);

  const rawAvatar = extractRawAvatar(u) || extractRawAvatar(raw);

  return {
    uniqueId,
    nickname,
    profilePictureUrl: toSafeAvatarUrl(rawAvatar),
    rawAvatarUrl: rawAvatar,
    platform,
  };
}

/**
 * Categorize gift size (`small` < 10, `medium` 10-98, `large` >= 99)
 * @param {number} coins
 * @returns {"small"|"medium"|"large"}
 */
export function categorizeGiftSize(coins) {
  if (coins >= 99) return "large";
  if (coins >= 10) return "medium";
  return "small";
}

/**
 * Map gift name or coin value to Jurassic Sanctuary Sprint's 5 action tiers:
 * - `rose`   (1-4 coins):   Nitro Roar Boost (+45 Boost, 2.0s surge)
 * - `meat`   (5-9 coins):   Primal Frenzy (Full Nitro, 3.0s surge, swamp immunity)
 * - `banana` (10-19 coins): Prehistoric Tar/Banana Skid Trap on #1 Leader
 * - `meteor` (20-98 coins): Meteor Shell Strike on #1 Leader + pack shockwave
 * - `crown`  (99+ coins):   Jurassic Chaos + Golden Goat Rain + King Aura
 *
 * @param {number} coins
 * @param {string} [giftName]
 * @param {string} [explicitTier]
 * @returns {"rose"|"meat"|"banana"|"meteor"|"crown"}
 */
export function resolvePowerUpTier(coins, giftName = "", explicitTier = "") {
  const validTiers = new Set(["rose", "meat", "banana", "meteor", "crown"]);
  if (validTiers.has(explicitTier)) return explicitTier;

  const lower = String(giftName || "").toLowerCase();
  if (/(crown|lion|universe|galaxy|king|queen|vương miện|rồng|dragon|star|concert)/.test(lower)) {
    return "crown";
  }
  if (/(meteor|thiên thạch|rocket|shell|thunder|sấm|pháo|sunglasses|garland)/.test(lower)) {
    return "meteor";
  }
  if (/(banana|chuối|trap|bẫy|perfume|doughnut|donut|cap|football|cookie)/.test(lower)) {
    return "banana";
  }
  if (/(meat|thịt|heart|tim|crown_mini|butterfly|steak|gg_plus|hand heart)/.test(lower)) {
    return "meat";
  }

  const val = Number(coins) || 1;
  if (val >= 99) return "crown";
  if (val >= 20) return "meteor";
  if (val >= 10) return "banana";
  if (val >= 5) return "meat";
  return "rose";
}

/**
 * Convert YouTube SuperChat / SuperSticker currency amount into Game9K Coins.
 * Calibration: $1.00 USD ≈ 20 coins (so $0.50 -> 10 banana, $1 -> 20 meteor, $5 -> 100 crown).
 * Approximate FX rates to USD for common KOL streaming currencies.
 */
const CURRENCY_TO_USD = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  AUD: 0.66,
  CAD: 0.73,
  SGD: 0.74,
  VND: 1 / 25000,
  JPY: 1 / 150,
  KRW: 1 / 1380,
  THB: 1 / 35,
  IDR: 1 / 16000,
  MYR: 1 / 4.5,
  PHP: 1 / 57,
  TWD: 1 / 32,
  HKD: 1 / 7.8,
  INR: 1 / 84,
  BRL: 1 / 5.5,
  MXN: 1 / 19,
};

/**
 * @param {number|string} amountMicrosOrUnits - Micros (if isMicros=true) or major currency units
 * @param {string} currency - ISO 4217 code (e.g. 'USD', 'VND')
 * @param {boolean} [isMicros=true]
 * @returns {number} Integer coin value >= 1
 */
export function superChatToCoins(amountMicrosOrUnits, currency = "USD", isMicros = true) {
  const num = Number(amountMicrosOrUnits) || 0;
  const majorUnits = isMicros ? num / 1_000_000 : num;
  const code = String(currency || "USD").toUpperCase().trim();
  const rate = CURRENCY_TO_USD[code] ?? 1.0;
  const usdValue = majorUnits * rate;
  return Math.max(1, Math.round(usdValue * 20));
}

/**
 * Parse lane index (0..3) from viewer chat comment or gift name if targeted.
 * Returns null if comment does not pick a specific lane (can still join Viewer Stampede!).
 * @param {string} text
 * @returns {number|null}
 */
export function parseLaneChoice(text) {
  const clean = String(text || "").trim().toLowerCase();
  if (!clean) return null;
  if (/^(#?1\b|croc|cá sấu|ca sau|vàng|vang|amber)/.test(clean)) return 0;
  if (/^(#?2\b|carno|t-?rex|xanh lá|xanh la|green)/.test(clean)) return 1;
  if (/^(#?3\b|trike|tricera|ba sừng|ba sung|lam|teal|blue)/.test(clean)) return 2;
  if (/^(#?4\b|bary|thằn lằn|than lan|đỏ|do|hồng|red|pink)/.test(clean)) return 3;
  return null;
}

/**
 * Tracks ongoing TikTok combo gift streaks (`giftType === 1`) so incremental
 * repeats emit exact delta coins immediately without double-counting at `repeatEnd`.
 */
export class GiftStreakTracker {
  constructor(ttlMs = 45_000) {
    this.ttlMs = ttlMs;
    /** @type {Map<string, {count: number, updatedAt: number}>} */
    this.streaks = new Map();
  }

  /**
   * Compute incremental repeat delta for a TikTok gift event.
   * Returns 0 if this exact count was already emitted.
   * @param {Object} rawGift
   * @returns {number} deltaCount >= 0
   */
  consumeDelta(rawGift) {
    this._prune();
    const isStreakable =
      rawGift?.giftDetails?.giftType === 1 || rawGift?.giftType === 1;
    const repeatCount = Math.max(1, Number(rawGift?.repeatCount || 1));

    if (!isStreakable) {
      return repeatCount;
    }

    const userId =
      rawGift?.user?.uniqueId || rawGift?.uniqueId || rawGift?.userId || "anon";
    const giftId = rawGift?.giftId || rawGift?.giftDetails?.giftName || "0";
    const groupId = rawGift?.groupId || "default";
    const key = `${userId}:${giftId}:${groupId}`;

    const prev = this.streaks.get(key)?.count || 0;
    const delta = Math.max(0, repeatCount - prev);

    if (rawGift?.repeatEnd) {
      this.streaks.delete(key);
    } else {
      this.streaks.set(key, { count: repeatCount, updatedAt: Date.now() });
    }

    return delta;
  }

  _prune() {
    if (this.streaks.size < 200) return;
    const cutoff = Date.now() - this.ttlMs;
    for (const [k, v] of this.streaks.entries()) {
      if (v.updatedAt < cutoff) this.streaks.delete(k);
    }
  }
}

// ============================================================================
// TIKTOK LIVE NORMALIZERS (Compatible with v2 `TikTokLiveConnection` & v1)
// ============================================================================

export function normalizeTikTokChat(raw) {
  const user = normalizeUser(raw, "tiktok");
  const comment = String(raw?.comment || raw?.text || "").trim();
  return {
    type: "chat",
    platform: "tiktok",
    user,
    comment,
    lane: parseLaneChoice(comment),
    timestamp: Date.now(),
  };
}

export function normalizeTikTokGift(raw, deltaRepeatCount = null) {
  const user = normalizeUser(raw, "tiktok");
  const unitDiamonds = Math.max(
    1,
    Number(
      raw?.giftDetails?.diamondCount ??
        raw?.diamondCount ??
        raw?.giftValue ??
        raw?.coins ??
        1
    )
  );
  const repeatCount =
    deltaRepeatCount !== null
      ? deltaRepeatCount
      : Math.max(1, Number(raw?.repeatCount || 1));
  const totalCoins = unitDiamonds * repeatCount;
  const giftName = String(
    raw?.giftDetails?.giftName || raw?.giftName || raw?.gift || "Rose"
  ).trim();
  const giftId = Number(raw?.giftId || 0);
  const giftTier = resolvePowerUpTier(totalCoins, giftName, raw?.giftTier);

  return {
    type: "gift",
    platform: "tiktok",
    user,
    giftId,
    giftName,
    giftValue: totalCoins,
    unitValue: unitDiamonds,
    repeatCount,
    giftType: categorizeGiftSize(totalCoins),
    giftTier,
    lane: typeof raw?.lane === "number" ? raw.lane : parseLaneChoice(giftName),
    timestamp: Date.now(),
  };
}

export function normalizeTikTokLike(raw) {
  const user = normalizeUser(raw, "tiktok");
  return {
    type: "like",
    platform: "tiktok",
    user,
    likeCount: Math.max(1, Number(raw?.likeCount || raw?.count || 1)),
    totalLikeCount: Number(raw?.totalLikeCount || 0),
    timestamp: Date.now(),
  };
}

export function normalizeTikTokSocial(raw, action = "share") {
  const user = normalizeUser(raw, "tiktok");
  return {
    type: action, // 'share' | 'follow' | 'join'
    platform: "tiktok",
    user,
    timestamp: Date.now(),
  };
}

// ============================================================================
// YOUTUBE LIVE NORMALIZERS (Data API v3 `liveChatMessages` & InnerTube)
// ============================================================================

/**
 * Normalize a YouTube Data API v3 `liveChatMessage` resource into canonical Game9K event.
 * @param {Object} item - Resource from `youtube/v3/liveChat/messages`
 * @returns {Object|null}
 */
export function normalizeYouTubeApiItem(item) {
  if (!item?.snippet) return null;
  const { snippet, authorDetails = {} } = item;
  const user = normalizeUser(
    {
      uniqueId: authorDetails.channelId || snippet.authorChannelId,
      nickname: authorDetails.displayName || "YouTube Viewer",
      profilePictureUrl: authorDetails.profileImageUrl || "",
    },
    "youtube"
  );

  const msgType = snippet.type;

  if (msgType === "textMessageEvent") {
    const comment = String(
      snippet.textMessageDetails?.messageText ?? snippet.displayMessage ?? ""
    ).trim();
    if (!comment) return null;
    return {
      type: "chat",
      platform: "youtube",
      id: item.id,
      user,
      comment,
      lane: parseLaneChoice(comment),
      timestamp: Date.now(),
    };
  }

  if (msgType === "superChatEvent" || msgType === "superStickerEvent") {
    const details = snippet.superChatDetails || snippet.superStickerDetails || {};
    const coins = superChatToCoins(
      details.amountMicros || 1_000_000,
      details.currency || "USD",
      true
    );
    const comment = String(details.userComment || snippet.displayMessage || "").trim();
    const giftName =
      msgType === "superStickerEvent"
        ? `Super Sticker (${details.amountDisplayString || "$1"})`
        : `Super Chat (${details.amountDisplayString || "$1"})`;
    return {
      type: "gift",
      platform: "youtube",
      id: item.id,
      user,
      giftId: 9000 + (details.tier || 1),
      giftName,
      giftValue: coins,
      unitValue: coins,
      repeatCount: 1,
      giftType: categorizeGiftSize(coins),
      giftTier: resolvePowerUpTier(coins, comment),
      comment,
      lane: parseLaneChoice(comment),
      timestamp: Date.now(),
    };
  }

  if (msgType === "newSponsorEvent" || msgType === "memberMilestoneChatEvent") {
    const coins = 25; // Channel membership = Meteor-tier celebration!
    const comment = String(
      snippet.memberMilestoneChatDetails?.userComment || snippet.displayMessage || ""
    ).trim();
    return {
      type: "gift",
      platform: "youtube",
      id: item.id,
      user,
      giftId: 9500,
      giftName: "YouTube Membership",
      giftValue: coins,
      unitValue: coins,
      repeatCount: 1,
      giftType: categorizeGiftSize(coins),
      giftTier: "meteor",
      comment,
      lane: parseLaneChoice(comment),
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Normalize an InnerTube `addChatItemAction.item` renderer (zero-API-key YouTube Live).
 * @param {Object} rendererItem
 * @returns {Object|null}
 */
export function normalizeYouTubeInnerTubeItem(rendererItem) {
  if (!rendererItem || typeof rendererItem !== "object") return null;

  const textRenderer = rendererItem.liveChatTextMessageRenderer;
  if (textRenderer) {
    const runs = textRenderer.message?.runs || [];
    const comment = runs.map((r) => r.text || r.emoji?.shortcuts?.[0] || "").join("").trim();
    if (!comment) return null;
    const user = normalizeUser(
      {
        uniqueId: textRenderer.authorExternalChannelId || textRenderer.id,
        nickname: textRenderer.authorName?.simpleText || "YT Viewer",
        authorPhoto: textRenderer.authorPhoto,
      },
      "youtube"
    );
    return {
      type: "chat",
      platform: "youtube",
      id: textRenderer.id,
      user,
      comment,
      lane: parseLaneChoice(comment),
      timestamp: Date.now(),
    };
  }

  const paidRenderer =
    rendererItem.liveChatPaidMessageRenderer ||
    rendererItem.liveChatPaidStickerRenderer;
  if (paidRenderer) {
    const amountText = paidRenderer.purchaseAmountText?.simpleText || "$2.00";
    const parsedNum = parseFloat(amountText.replace(/[^0-9.]/g, "")) || 2;
    let currency = "USD";
    if (amountText.includes("₫") || /vnd/i.test(amountText)) currency = "VND";
    else if (amountText.includes("¥")) currency = "JPY";
    else if (amountText.includes("₩")) currency = "KRW";
    else if (amountText.includes("€")) currency = "EUR";

    const coins = superChatToCoins(parsedNum, currency, false);
    const runs = paidRenderer.message?.runs || [];
    const comment = runs.map((r) => r.text || "").join("").trim();
    const user = normalizeUser(
      {
        uniqueId: paidRenderer.authorExternalChannelId || paidRenderer.id,
        nickname: paidRenderer.authorName?.simpleText || "YT Supporter",
        authorPhoto: paidRenderer.authorPhoto,
      },
      "youtube"
    );

    return {
      type: "gift",
      platform: "youtube",
      id: paidRenderer.id,
      user,
      giftId: 9100,
      giftName: `Super Chat (${amountText})`,
      giftValue: coins,
      unitValue: coins,
      repeatCount: 1,
      giftType: categorizeGiftSize(coins),
      giftTier: resolvePowerUpTier(coins, comment),
      comment,
      lane: parseLaneChoice(comment),
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Normalize an arbitrary webhook / simulator payload into a safe canonical event.
 * @param {Object} raw
 * @returns {Object|null}
 */
export function normalizeCustomEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const platform = raw.platform === "youtube" ? "youtube" : raw.platform === "tiktok" ? "tiktok" : "simulator";
  const type = String(raw.type || "chat").toLowerCase();
  const team = raw.team === "B" ? "B" : raw.team === "A" ? "A" : undefined;
  const user = normalizeUser(raw, platform);

  if (type === "gift" || type === "superchat") {
    const coins = Math.max(
      1,
      Number(
        raw.coins ??
          raw.giftValue ??
          raw.diamonds ??
          (raw.amountUsd ? superChatToCoins(raw.amountUsd, "USD", false) : 1)
      )
    );
    const giftTier = resolvePowerUpTier(coins, raw.giftName || raw.comment || "", raw.giftTier);
    const tierNames = {
      rose: platform === "youtube" ? "Super Sticker ($0.50)" : "Hoa Hồng",
      meat: platform === "youtube" ? "Super Chat ($1)" : "Đùi Thịt Khủng Long",
      banana: platform === "youtube" ? "Super Chat ($2)" : "Bẫy Bùn Chuối",
      meteor: platform === "youtube" ? "Super Chat ($5)" : "Thiên Thạch Cổ Đại",
      crown: platform === "youtube" ? "Super Chat ($20)" : "Vương Miện Chúa Tể",
    };

    return {
      type: "gift",
      platform,
      team,
      user,
      giftId: Number(raw.giftId || 1),
      giftName: String(raw.giftName || tierNames[giftTier] || "Gift"),
      giftValue: coins,
      unitValue: coins,
      repeatCount: Math.max(1, Number(raw.repeatCount || 1)),
      giftType: categorizeGiftSize(coins),
      giftTier,
      comment: String(raw.comment || raw.text || "").trim(),
      lane: typeof raw.lane === "number" ? raw.lane : parseLaneChoice(raw.comment || raw.text || ""),
      timestamp: Date.now(),
    };
  }

  if (type === "like") {
    return {
      type: "like",
      platform,
      team,
      user,
      likeCount: Math.max(1, Number(raw.likeCount || raw.count || 5)),
      totalLikeCount: Number(raw.totalLikeCount || 0),
      timestamp: Date.now(),
    };
  }

  if (type === "share" || type === "follow" || type === "join") {
    return {
      type,
      platform,
      team,
      user,
      timestamp: Date.now(),
    };
  }

  const comment = String(raw.comment ?? raw.text ?? "1").trim();
  return {
    type: "chat",
    platform,
    team,
    user,
    comment,
    lane: typeof raw.lane === "number" ? raw.lane : parseLaneChoice(comment),
    timestamp: Date.now(),
  };
}
