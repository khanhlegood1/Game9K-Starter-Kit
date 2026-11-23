import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame9KServer } from "../src/server.js";
import {
  generateApiKey,
  isValidApiKeyFormat,
  maskApiKey,
  removeCircularReferences,
} from "../src/services/SpliceSpecService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

test("Splice OpenAPI Spec Parser, sk_live_... Mock Server Auth & TypeScript SDK Generator", async () => {
  // 1. Key generator & circular-safe helper unit checks
  const key = generateApiKey();
  assert.equal(isValidApiKeyFormat(key), true);
  assert.match(key, /^sk_live_[A-Za-z0-9_-]{32}$/);
  assert.equal(maskApiKey(key).includes("..."), true);

  const cyclic = { name: "PortalSchema" };
  cyclic.self = cyclic;
  const cleaned = removeCircularReferences(cyclic);
  assert.equal(cleaned.self, "[Circular]");

  // 2. Live HTTP Gateway tests
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const specRes = await fetch(`${baseUrl}/api/openapi.json`).then((r) => r.json());
    assert.equal(specRes.openapi, "3.1.0");
    assert.ok(specRes.paths["/api/xsolla/auth"]);
    assert.ok(specRes.paths["/api/pos/kds"]);

    const parsed = await fetch(`${baseUrl}/api/splice/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((r) => r.json());
    assert.equal(parsed.ok, true);
    assert.ok(parsed.endpointCount >= 10);

    // Start Mock Server -> mints sk_live_... key
    const started = await fetch(`${baseUrl}/api/splice/mock-servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId: "studio-test" }),
    }).then((r) => r.json());
    assert.equal(started.ok, true);
    assert.equal(isValidApiKeyFormat(started.mock.apiKey), true);

    // Unauthenticated protected mock request must return 401
    const unauth = await fetch(`${baseUrl}/api/splice/mock-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        specId: "studio-test",
        method: "GET",
        path: "/api/xsolla/catalog",
      }),
    });
    assert.equal(unauth.status, 401);

    // Authenticated mock request with x-g9k-api-key succeeds (200)
    const authed = await fetch(`${baseUrl}/api/splice/mock-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        specId: "studio-test",
        method: "GET",
        path: "/api/xsolla/catalog",
        headers: { "x-g9k-api-key": started.mock.apiKey },
      }),
    }).then((r) => r.json());
    assert.equal(authed.ok, true);
    assert.equal(authed.mocked, true);

    // Stop Mock Server -> cleans up key
    const stopped = await fetch(`${baseUrl}/api/splice/mock-servers/studio-test`, {
      method: "DELETE",
    }).then((r) => r.json());
    assert.equal(stopped.stopped, true);

    // Spec-to-SDK Generation via REST API
    const sdkGen = await fetch(`${baseUrl}/api/splice/generate-sdk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: "dino-race",
        config: {
          packageName: "@game9k/dino-race-portal-sdk",
          packageVersion: "3.0.0",
          language: "typescript",
        },
      }),
    }).then((r) => r.json());
    assert.equal(sdkGen.ok, true);
    assert.ok(sdkGen.files["src/client.ts"].includes("class Game9KStudioClient"));
    assert.ok(sdkGen.files["src/poki-portal-bridge.ts"].includes("PokiPortalBridge"));
    assert.ok(sdkGen.files["src/http/interceptors.ts"].includes("x-g9k-api-key"));
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Restaurant-POS-Kitchen Economy: Limited Stock/Auto-86, Happy Hour, Coupons, KDS Queue, Shifts & Z-Report CSV", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Happy Hour (-15% on stream_powerup) + GAMER9K Coupon (-15% order) quote
    const quote = await fetch(`${baseUrl}/api/pos/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: "kol_meteor_pack_5",
        quantity: 1,
        couponCode: "GAMER9K",
      }),
    }).then((r) => r.json());
    assert.equal(quote.ok, true);
    assert.equal(quote.appliedCoupon, "GAMER9K");
    assert.ok(quote.totals.happyHourCents > 0);
    assert.ok(quote.totals.couponCents > 0);
    assert.ok(quote.totals.netCents < quote.totals.subtotalCents);

    // 2. Manager approval guard (>20% coupon WHALE30 requires managerApproved: true)
    const whaleBlocked = await fetch(`${baseUrl}/api/pos/validate-coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponCode: "WHALE30", subtotalCents: 399, managerApproved: false }),
    });
    assert.equal(whaleBlocked.status, 400);

    const whaleApproved = await fetch(`${baseUrl}/api/pos/validate-coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponCode: "WHALE30", subtotalCents: 399, managerApproved: true }),
    }).then((r) => r.json());
    assert.equal(whaleApproved.ok, true);

    // 3. Xsolla Order + Finalize automatically deducts stock & enqueues KDS ticket!
    const created = await fetch(`${baseUrl}/api/xsolla/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: "golden_croc_skin",
        country: "US",
        couponCode: "GAMER9K",
        autoPay: true,
      }),
    }).then((r) => r.json());
    assert.equal(created.ok, true);
    assert.equal(created.order.couponCode, "GAMER9K");

    const finalized = await fetch(`${baseUrl}/api/xsolla/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: created.order.orderId,
        receiptToken: created.order.receiptToken,
      }),
    }).then((r) => r.json());
    assert.equal(finalized.ok, true);
    assert.ok(finalized.posFulfillment.posOrderNumber.startsWith("G9K-"));
    assert.equal(finalized.posFulfillment.stockRemaining, 4);

    // 4. Deplete stock to 0 -> triggers Auto-86'd & blocks Xsolla checkout with 409 Conflict!
    await fetch(`${baseUrl}/api/pos/stock/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "golden_croc_skin", delta: -4, reason: "flash_sold_out" }),
    });

    const soldOutOrder = await fetch(`${baseUrl}/api/xsolla/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "golden_croc_skin", country: "US" }),
    });
    assert.equal(soldOutOrder.status, 409);

    // 5. KOL Stream Gift ingests into KDS Queue -> Bump -> 30-min Recall!
    await fetch(`${baseUrl}/api/rooms/kol-kds-room/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "gift",
        platform: "tiktok",
        user: "WhaleViewer9K",
        giftTier: "meteor",
        coins: 50,
      }),
    });

    const kds1 = await fetch(`${baseUrl}/api/pos/kds`).then((r) => r.json());
    assert.ok(kds1.activeTickets.length >= 2);
    assert.ok(kds1.allDayCounts.length >= 2);

    const targetTicketId = kds1.activeTickets[0].id;
    const bumped = await fetch(`${baseUrl}/api/pos/kds/bump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: targetTicketId }),
    }).then((r) => r.json());
    assert.equal(bumped.ok, true);

    const kds2 = await fetch(`${baseUrl}/api/pos/kds`).then((r) => r.json());
    assert.ok(kds2.recallTickets.some((t) => t.id === targetTicketId));

    const recalled = await fetch(`${baseUrl}/api/pos/kds/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: targetTicketId }),
    }).then((r) => r.json());
    assert.equal(recalled.recalled, true);

    // 6. Z-Report & RFC-4180 CSV Export
    const zReport = await fetch(`${baseUrl}/api/pos/z-report`).then((r) => r.json());
    assert.equal(zReport.reportType, "Z_REPORT");
    assert.ok(zReport.checks >= 2);
    assert.equal(zReport.solanaMilestoneUnlockReady, true);

    const csvResp = await fetch(`${baseUrl}/api/pos/export/orders.csv`);
    assert.equal(csvResp.status, 200);
    const csvText = await csvResp.text();
    assert.ok(csvText.includes('"Order Number"'));
    assert.ok(csvText.includes("G9K-"));
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Poki Portal SDK v3.0 Opaque Sandbox Bridge: PokiSDK.splice, PokiSDK.economy, Quota-Safe SafeStorage & CLI codegen", async () => {
  // 1. CLI `g9k codegen --json` check
  const cliOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "codegen", "--game", "dino-race", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(cliOut.ok, true);
  assert.equal(cliOut.data.packageName, "@game9k/dino-race-portal-sdk");
  assert.ok(cliOut.data.files.includes("src/poki-portal-bridge.ts"));

  // 2. Opaque-origin `<iframe sandbox="allow-scripts">` simulation
  const sdkSource = readFileSync(join(ROOT_DIR, "public/sdk/game9k-sdk.js"), "utf8");
  const messageHandlers = [];
  let quotaTriggeredForKey = null;

  const parentWindow = {
    postMessage(msg) {
      if (msg.type === "PORTAL_HANDSHAKE_SYN") {
        queueMicrotask(() =>
          dispatchFromParent({
            type: "PORTAL_HANDSHAKE_ACK",
            params: { gdroom: "pos-room" },
            language: "vi",
            country: "VN",
          })
        );
      } else if (msg.type === "PORTAL_RPC_REQUEST") {
        queueMicrotask(() => {
          if (msg.action === "pos_toggle_happy_hour") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: { ok: true, happyHourActive: true },
            });
          } else if (msg.action === "pos_get_z_report") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: { ok: true, reportType: "Z_REPORT", checks: 5, studioNetCents: 1250 },
            });
          } else if (msg.action === "splice_http_proxy") {
            const dynamicKey = generateApiKey();
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: {
                ok: true,
                mock: {
                  specId: "game9k-portal",
                  apiKey: dynamicKey,
                  maskedApiKey: maskApiKey(dynamicKey),
                },
              },
            });
          }
        });
      }
    },
  };

  // Simulate QuotaExceededError on localStorage writes while keeping memoryStore intact
  const quotaStorage = {
    get length() {
      return 0;
    },
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    },
    removeItem() {},
  };

  const sandboxGlobal = {
    parent: parentWindow,
    location: { origin: "null", href: "about:srcdoc", search: "" },
    navigator: { language: "vi-VN", userAgent: "Mozilla/5.0" },
    localStorage: quotaStorage,
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
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

  const { Game9K, PokiSDK, SpliceSDK, Game9KPOS } = sandboxGlobal;
  assert.equal(Game9K.sdkVersion, "4.0.0");
  assert.equal(PokiSDK.splice, SpliceSDK);
  assert.equal(PokiSDK.economy, Game9KPOS);

  await PokiSDK.init({ gameId: "dino-race", version: "3.0.0" });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(Game9K.portalHostConnected, true);

  // Quota-safe storage + migration + byte metering inside opaque sandbox
  Game9K.storage.onQuotaExceeded((key) => {
    quotaTriggeredForKey = key;
  });
  Game9K.storage.set("dino_save_v1", '{"best":1900}');
  assert.equal(quotaTriggeredForKey, "dino_save_v1");
  assert.equal(Game9K.storage.migrateVersion("dino_save", "v1", "v2"), true);
  assert.equal(Game9K.storage.getJson("dino_save_v2").best, 1900);
  assert.ok(Game9K.storage.getBytesUsed() > 0);

  // PokiSDK.economy.toggleHappyHour bridges over PORTAL_RPC_REQUEST & triggers happyTime!
  const hh = await PokiSDK.economy.toggleHappyHour(true);
  assert.equal(hh.happyHourActive, true);

  const zRep = await PokiSDK.economy.getZReport();
  assert.equal(zRep.reportType, "Z_REPORT");
  assert.equal(zRep.checks, 5);

  // PokiSDK.splice.startMockServer bridges over PORTAL_RPC_REQUEST & masks key!
  const mockRes = await PokiSDK.splice.startMockServer("game9k-portal");
  assert.equal(SpliceSDK.isValidApiKeyFormat(mockRes.mock.apiKey), true);
  assert.equal(SpliceSDK.maskApiKey(), maskApiKey(mockRes.mock.apiKey));
});
