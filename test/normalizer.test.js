import test from "node:test";
import assert from "node:assert/strict";
import {
  GiftStreakTracker,
  normalizeTikTokChat,
  normalizeTikTokGift,
  normalizeYouTubeApiItem,
  normalizeYouTubeInnerTubeItem,
  superChatToCoins,
  parseLaneChoice,
  toSafeAvatarUrl,
} from "../src/lib/streamEventNormalizer.js";
import { parseYouTubeVideoId } from "../src/services/YouTubeLiveService.js";

test("GiftStreakTracker emits exact incremental deltas for TikTok gift combos", () => {
  const tracker = new GiftStreakTracker();
  const baseGift = {
    user: { uniqueId: "minhanh_99" },
    giftId: 5655,
    groupId: "g1",
    giftDetails: { giftType: 1, giftName: "Rose", diamondCount: 1 },
  };

  // Viewer taps x1 -> x3 -> x5 (end)
  const d1 = tracker.consumeDelta({ ...baseGift, repeatCount: 1, repeatEnd: false });
  const d2 = tracker.consumeDelta({ ...baseGift, repeatCount: 3, repeatEnd: false });
  const d3 = tracker.consumeDelta({ ...baseGift, repeatCount: 5, repeatEnd: true });

  assert.equal(d1, 1);
  assert.equal(d2, 2);
  assert.equal(d3, 2);
  assert.equal(d1 + d2 + d3, 5);
});

test("parseLaneChoice maps numbers, Vietnamese aliases, and species prefixes", () => {
  assert.equal(parseLaneChoice("1 cố lên"), 0);
  assert.equal(parseLaneChoice("#2 carno"), 1);
  assert.equal(parseLaneChoice("ba sừng vô địch"), 2);
  assert.equal(parseLaneChoice("4"), 3);
  assert.equal(parseLaneChoice("hello streamer!"), null);
});

test("YouTube Data API v3 SuperChat & VND/USD conversion maps to Game9K tiers", () => {
  // $5.00 USD = 5,000,000 micros -> 100 coins -> 'crown' tier
  const coinsUsd = superChatToCoins(5_000_000, "USD", true);
  assert.equal(coinsUsd, 100);

  // 25,000 VND = $1 USD -> 20 coins -> 'meteor' tier
  const coinsVnd = superChatToCoins(25_000, "VND", false);
  assert.equal(coinsVnd, 20);

  const ytSuper = normalizeYouTubeApiItem({
    id: "yt_msg_1",
    snippet: {
      type: "superChatEvent",
      superChatDetails: {
        amountMicros: 1_000_000,
        currency: "USD",
        amountDisplayString: "$1.00",
        userComment: "2 bứt tốc!",
        tier: 2,
      },
    },
    authorDetails: {
      channelId: "UC_123",
      displayName: "TuanKhoi YT",
      profileImageUrl: "https://yt3.ggpht.com/ytc/avatar123.jpg",
    },
  });

  assert.equal(ytSuper.type, "gift");
  assert.equal(ytSuper.platform, "youtube");
  assert.equal(ytSuper.giftValue, 20);
  assert.equal(ytSuper.giftTier, "meteor");
  assert.equal(ytSuper.lane, 1);
  assert.ok(ytSuper.user.profilePictureUrl.startsWith("/api/avatar?u="));
});

test("YouTube InnerTube text and paid renderers normalize cleanly", () => {
  const chatEvt = normalizeYouTubeInnerTubeItem({
    liveChatTextMessageRenderer: {
      id: "it_1",
      authorExternalChannelId: "UC_abc",
      authorName: { simpleText: "HoangNam" },
      message: { runs: [{ text: "3" }] },
    },
  });
  assert.equal(chatEvt.type, "chat");
  assert.equal(chatEvt.lane, 2);

  const paidEvt = normalizeYouTubeInnerTubeItem({
    liveChatPaidMessageRenderer: {
      id: "it_2",
      authorExternalChannelId: "UC_vip",
      authorName: { simpleText: "VIP_YT" },
      purchaseAmountText: { simpleText: "$10.00" },
      message: { runs: [{ text: "1" }] },
    },
  });
  assert.equal(paidEvt.type, "gift");
  assert.equal(paidEvt.giftTier, "crown");
  assert.equal(paidEvt.lane, 0);
});

test("parseYouTubeVideoId extracts 11-char ID from watch, mobile, short, and live URLs", () => {
  assert.equal(parseYouTubeVideoId("https://m.youtube.com/watch?v=vmEeXa9zktk"), "vmEeXa9zktk");
  assert.equal(parseYouTubeVideoId("https://youtu.be/vmEeXa9zktk?t=12"), "vmEeXa9zktk");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/live/vmEeXa9zktk?si=abc"), "vmEeXa9zktk");
  assert.equal(parseYouTubeVideoId("vmEeXa9zktk"), "vmEeXa9zktk");
  assert.equal(parseYouTubeVideoId("not-a-valid-url"), null);
});

test("toSafeAvatarUrl permits TikTok/YouTube CDNs and blocks untrusted origins", () => {
  assert.ok(
    toSafeAvatarUrl("https://p16-sign-va.tiktokcdn.com/avatar.jpeg").startsWith("/api/avatar?u=")
  );
  assert.ok(
    toSafeAvatarUrl("https://p19-pu-sign-useast8.tiktokcdn-us.com/avatar.jpeg").startsWith(
      "/api/avatar?u="
    )
  );
  assert.equal(toSafeAvatarUrl("https://tiktokcdn.com.evil.example.com/steal.png"), "");
  assert.equal(toSafeAvatarUrl("https://evil.example.com/steal.png"), "");
  assert.equal(toSafeAvatarUrl("http://yt3.ggpht.com/insecure.jpg"), "");
});
