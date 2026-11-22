import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame9KServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

test("Xsolla SDK 3 4-Step API (Auth, Localized Catalog, Pay Station, Idempotent Finalize & Webhook)", async () => {
  const { httpServer, liveRoomHub, xsollaService } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Step 01: Authenticate with silent Device ID
    const authRes = await fetch(`${baseUrl}/api/xsolla/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "device_id",
        deviceId: "device_kol_test_01",
        country: "VN",
      }),
    });
    assert.equal(authRes.status, 200);
    const auth = await authRes.json();
    assert.equal(auth.ok, true);
    assert.match(auth.user.explorerId, /^[A-Z0-9]{6}$/);
    assert.match(auth.accessToken, /^xl3\./);
    assert.equal(auth.user.currency, "VND");

    // Step 02: Load Catalog localized for VN (VND + 10% VAT) and US (USD + Sales Tax)
    const vnCat = await fetch(
      `${baseUrl}/api/xsolla/catalog?country=VN&gameId=dino-race`
    ).then((r) => r.json());
    assert.equal(vnCat.ok, true);
    assert.equal(vnCat.region.currency, "VND");
    assert.ok(vnCat.items.length >= 5);
    const vipItem = vnCat.items.find((i) => i.sku === "sanctuary_vip_pass");
    assert.ok(vipItem);
    assert.equal(vipItem.pricing.xsollaFeeRate, 0.05);
    assert.equal(vipItem.pricing.taxRate, 0.1);

    const usCat = await fetch(
      `${baseUrl}/api/xsolla/catalog?country=US&gameId=dino-race`
    ).then((r) => r.json());
    assert.equal(usCat.region.currency, "USD");

    // Step 03: Initiate Order & Complete Pay Station Checkout
    const orderRes = await fetch(`${baseUrl}/api/xsolla/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: "sanctuary_vip_pass",
        userId: auth.user.userId,
        accessToken: auth.accessToken,
        country: "VN",
      }),
    }).then((r) => r.json());
    assert.equal(orderRes.ok, true);
    assert.equal(orderRes.order.status, "created");

    const paidRes = await fetch(
      `${baseUrl}/api/xsolla/orders/${orderRes.order.orderId}/pay`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", paymentMethod: "vietqr" }),
      }
    ).then((r) => r.json());
    assert.equal(paidRes.ok, true);
    assert.equal(paidRes.order.status, "paid");
    assert.match(paidRes.order.receiptToken, /^xsolla_rcpt_/);

    // Step 04a: Tampered receipt is rejected with HTTP 403 Anti-Fraud error
    const badFinalize = await fetch(`${baseUrl}/api/xsolla/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: paidRes.order.orderId,
        receiptToken: "xsolla_rcpt_forged_signature",
      }),
    });
    assert.equal(badFinalize.status, 403);

    // Step 04b: Valid receipt grants VIP Pass + 300 Amber Gems (50 initial + 300 = 350)
    const goodFinalize = await fetch(`${baseUrl}/api/xsolla/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: paidRes.order.orderId,
        receiptToken: paidRes.order.receiptToken,
      }),
    }).then((r) => r.json());
    assert.equal(goodFinalize.ok, true);
    assert.equal(goodFinalize.alreadyFinalized, false);
    assert.equal(goodFinalize.inventory.amberGems, 350);
    assert.equal(goodFinalize.inventory.adFreeVip, true);
    assert.ok(goodFinalize.inventory.entitlements.includes("sanctuary_vip_pass"));

    // Step 04c: Duplicate finalize is strictly idempotent (stays at 350 Amber Gems!)
    const retryFinalize = await fetch(`${baseUrl}/api/xsolla/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: paidRes.order.orderId,
        receiptToken: paidRes.order.receiptToken,
      }),
    }).then((r) => r.json());
    assert.equal(retryFinalize.ok, true);
    assert.equal(retryFinalize.alreadyFinalized, true);
    assert.equal(retryFinalize.inventory.amberGems, 350);

    // Official Xsolla Webhook SHA-1 Signature verification
    const webhookBody = JSON.stringify({
      notification_type: "user_validation",
      user: { id: auth.user.userId },
    });
    const invalidHook = await fetch(`${baseUrl}/api/xsolla/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Signature deadbeef",
      },
      body: webhookBody,
    });
    assert.equal(invalidHook.status, 400);

    const validSig = xsollaService.computeWebhookSignature(webhookBody);
    const validHook = await fetch(`${baseUrl}/api/xsolla/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Signature ${validSig}`,
      },
      body: webhookBody,
    });
    assert.equal(validHook.status, 204);
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Unified Browser SDK (`PokiSDK` + `XsollaSDK` + `Game9K`) runs safely inside opaque-origin sandbox", async () => {
  const sdkSource = readFileSync(join(ROOT_DIR, "public/sdk/game9k-sdk.js"), "utf8");

  const parentMessages = [];
  const messageHandlers = [];

  // Mock Parent Portal Host (`portal.html`) mediating RPC calls across `<iframe sandbox="allow-scripts">`
  const parentWindow = {
    postMessage(envelope) {
      parentMessages.push(envelope);
      if (envelope.type === "PORTAL_HANDSHAKE_SYN") {
        queueMicrotask(() => {
          dispatchFromParent({
            type: "PORTAL_HANDSHAKE_ACK",
            params: { gdroom: "kol-sanctuary" },
            language: "vi",
            country: "VN",
          });
        });
      } else if (envelope.type === "PORTAL_RPC_REQUEST") {
        queueMicrotask(() => {
          let data = {};
          if (envelope.action === "poki_commercial_break") {
            data = { rewarded: false };
          } else if (envelope.action === "poki_rewarded_break") {
            data = { rewarded: true };
          } else if (envelope.action === "poki_shareable_url") {
            data = { url: "https://game9k.com/portal?gdroom=kol-vn" };
          } else if (envelope.action === "xsolla_authenticate") {
            data = {
              ok: true,
              user: {
                userId: "xsolla_aa1dxe",
                explorerId: "AA1DXE",
                nickname: "Player_AA1DXE",
                country: "VN",
                currency: "VND",
              },
              accessToken: "xl3.sandbox.token",
              inventorySummary: { amberGems: 50, entitlements: [], adFreeVip: false },
            };
          } else if (envelope.action === "xsolla_load_catalog") {
            data = {
              ok: true,
              region: { country: "VN", currency: "VND" },
              items: [{ sku: "sanctuary_vip_pass", name: "VIP Pass", type: "non_consumable" }],
            };
          } else if (envelope.action === "xsolla_open_paystation") {
            data = {
              ok: true,
              order: {
                orderId: "ord_portal_1",
                sku: envelope.payload.sku,
                status: "paid",
                receiptToken: "xsolla_rcpt_ok",
              },
            };
          } else if (envelope.action === "xsolla_finalize_purchase") {
            data = {
              ok: true,
              alreadyFinalized: false,
              order: { orderId: envelope.payload.orderId, sku: "sanctuary_vip_pass" },
              inventory: {
                amberGems: 350,
                consumables: {},
                entitlements: ["sanctuary_vip_pass"],
                adFreeVip: true,
                transactions: [{ orderId: envelope.payload.orderId }],
              },
            };
          }
          dispatchFromParent({
            type: "PORTAL_RPC_RESPONSE",
            reqId: envelope.reqId,
            ok: true,
            data,
          });
        });
      }
    },
  };

  const sandboxGlobal = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    performance: { now: () => Date.now() },
    navigator: { language: "vi-VN", userAgent: "Mozilla/5.0 iPhone" },
    location: { origin: "null", search: "?gdscore=1800", href: "about:srcdoc" },
    parent: parentWindow,
    get localStorage() {
      throw new Error("SecurityError: Sandbox opaque origin denies localStorage");
    },
    addEventListener(type, fn) {
      if (type === "message") messageHandlers.push(fn);
    },
  };
  sandboxGlobal.window = sandboxGlobal;
  sandboxGlobal.globalThis = sandboxGlobal;

  function dispatchFromParent(data) {
    for (const fn of messageHandlers) {
      fn({ source: parentWindow, origin: "null", data });
    }
  }

  vm.runInNewContext(sdkSource, sandboxGlobal);

  const { Game9K, PokiSDK, XsollaSDK } = sandboxGlobal;
  assert.ok(Game9K && PokiSDK && XsollaSDK);

  await PokiSDK.init({ gameId: "dino-race", version: "2.0.0" });
  // Allow handshake microtask to settle
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(Game9K.portalHostConnected, true);

  // Poki URL params, Loading, Gameplay, Pill & Shareable URL
  PokiSDK.gameLoadingFinished();
  assert.equal(PokiSDK.getURLParam("score"), "1800");
  assert.equal(PokiSDK.getURLParam("room"), "kol-sanctuary");
  PokiSDK.movePill(10, 48);
  assert.equal(PokiSDK.gameplayStart(), true);
  assert.equal(PokiSDK.isGameplayActive, true);

  // Poki Rewarded Break pauses game, blocks premature gameplayStart(), and grants reward
  let gameplayBlockedDuringAd = false;
  const rewarded = await PokiSDK.rewardedBreak(() => {
    gameplayBlockedDuringAd = PokiSDK.gameplayStart() === false && Game9K.isPaused === true;
  });
  assert.equal(gameplayBlockedDuringAd, true);
  assert.equal(rewarded, true);
  assert.equal(Game9K.isPaused, false);

  const shareUrl = await PokiSDK.shareableURL({ room: "kol-vn" });
  assert.equal(shareUrl, "https://game9k.com/portal?gdroom=kol-vn");

  // Xsolla SDK 3 4-Step Flow over Portal RPC inside Opaque-Origin Sandbox
  const auth = await XsollaSDK.authenticate({ country: "VN" });
  assert.equal(auth.user.explorerId, "AA1DXE");

  const cat = await XsollaSDK.loadCatalog({ country: "VN" });
  assert.equal(cat.items.length, 1);

  const purchased = await XsollaSDK.purchaseProduct("sanctuary_vip_pass");
  assert.equal(purchased.order.status, "paid");

  const finalized = await XsollaSDK.finalizePurchase(purchased.order.orderId);
  assert.equal(finalized.ok, true);
  assert.equal(XsollaSDK.hasEntitlement("sanctuary_vip_pass"), true);

  // Once `sanctuary_vip_pass` is owned, `PokiSDK.commercialBreak()` skips ads immediately!
  const beforeCount = parentMessages.filter(
    (m) => m.action === "poki_commercial_break"
  ).length;
  await PokiSDK.commercialBreak();
  const afterCount = parentMessages.filter(
    (m) => m.action === "poki_commercial_break"
  ).length;
  assert.equal(afterCount, beforeCount, "VIP Pass should skip commercialBreak RPC");
  assert.ok(parentMessages.some((m) => m.type === "ad_break_skipped_vip"));
});
