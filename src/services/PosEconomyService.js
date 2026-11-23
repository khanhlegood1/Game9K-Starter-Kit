/**
 * PosEconomyService.js
 * Applies the architecture of `khanhlegood1/Restaurant-POS-Kitchen` into the Game9K Portal SDK:
 *   1. Limited-Stock & Auto-86'd Scarcity Engine (`stockStatus`: 'untracked'|'ok'|'low'|'out', `canFulfill`, `stockLog`)
 *   2. Scheduled Happy Hour & Coupon Validation Engine (`activeScheduledRules`, `validateCoupon`, manager guard >20%)
 *   3. KDS Live Fulfillment Queue for KOL Gifts & IAP Orders (`activeTickets`, `recallTickets` 30m window, `allDayCounts`, SLA `on_time`|`watch`|`late`)
 *   4. KOL Stream Shift Register & End-of-Day Z-Report Reconciliation + CSV Exports (`orders.csv`, `payments.csv`, `shifts.csv`)
 */

import { randomBytes } from "node:crypto";

const STATION_BY_CATEGORY = {
  virtual_currency: "boost",
  impulse_item: "boost",
  stream_powerup: "sabotage",
  cosmetic_entitlement: "cosmetic",
  portal_pass: "vip",
  kol_gift: "stream_gift",
};

function dateKeyUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function parseHHMM(hhmm) {
  const [h, m] = String(hhmm || "00:00")
    .split(":")
    .map((n) => Number(n) || 0);
  return h * 60 + m;
}

function csvEscapeRow(fields) {
  return fields
    .map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

export default class PosEconomyService {
  constructor(options = {}) {
    this.settings = {
      studioName: options.studioName || "Game9K Sanctuary Live-Ops POS",
      currency: "USD",
      taxRatePercent: 10,
      kdsWarnSeconds: options.kdsWarnSeconds ?? 30,
      kdsLateSeconds: options.kdsLateSeconds ?? 90,
      receiptPrefix: "G9K",
      nextOrderSeq: 1001,
    };

    // SKU Stock Ledger (mirrors `MenuItem` stock fields in Restaurant-POS-Kitchen)
    this.skuStock = new Map([
      [
        "amber_gems_100",
        {
          sku: "amber_gems_100",
          name: "100 Hổ Phách Nộ Khí",
          category: "virtual_currency",
          priceCents: 99,
          station: "boost",
          trackStock: false,
          stockOnHand: 999,
          parLevel: 999,
          lowStockAt: 0,
          autoEightySixed: false,
        },
      ],
      [
        "revive_turbo_surge",
        {
          sku: "revive_turbo_surge",
          name: "Bứt Tốc Khẩn Cấp (Impulse Surge)",
          category: "impulse_item",
          priceCents: 199,
          station: "boost",
          trackStock: true,
          stockOnHand: 25,
          parLevel: 30,
          lowStockAt: 5,
          autoEightySixed: false,
        },
      ],
      [
        "kol_meteor_pack_5",
        {
          sku: "kol_meteor_pack_5",
          name: "Gói 5 Thiên Thạch Phá Đám Top 1",
          category: "stream_powerup",
          priceCents: 299,
          station: "sabotage",
          trackStock: true,
          stockOnHand: 12,
          parLevel: 20,
          lowStockAt: 4,
          autoEightySixed: false,
        },
      ],
      [
        "golden_croc_skin",
        {
          sku: "golden_croc_skin",
          name: "Skin Cá Sấu Hoàng Kim (Limited Drop)",
          category: "cosmetic_entitlement",
          priceCents: 399,
          station: "cosmetic",
          trackStock: true,
          stockOnHand: 5,
          parLevel: 10,
          lowStockAt: 2,
          autoEightySixed: false,
        },
      ],
      [
        "sanctuary_vip_pass",
        {
          sku: "sanctuary_vip_pass",
          name: "Vé VIP Cổng Game9K (Miễn Quảng Cáo)",
          category: "portal_pass",
          priceCents: 499,
          station: "vip",
          trackStock: false,
          stockOnHand: 999,
          parLevel: 999,
          lowStockAt: 0,
          autoEightySixed: false,
        },
      ],
    ]);

    this.stockLog = [];

    // Discount & Coupon Rules (mirrors `DiscountRule` in Restaurant-POS-Kitchen)
    this.discountRules = [
      {
        id: "hh-powerups",
        name: "Happy Hour Stream Surge",
        description: "Giảm tự động 15% cho các gói Vật Phẩm Đua & Phá Đám trong khung giờ vàng!",
        trigger: "scheduled",
        scope: "category",
        kind: "percent",
        value: 15,
        categoryIds: ["stream_powerup", "impulse_item"],
        itemIds: [],
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: "00:00",
        endTime: "23:59",
        couponCode: null,
        minSubtotalCents: 0,
        expiresOn: null,
        requiresManager: false,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "cpn-gamer9k",
        name: "Mã Tân Thủ Cổng Game9K",
        description: "Giảm 15% tổng đơn hàng Xsolla trên cổng Game9K.",
        trigger: "coupon",
        scope: "order",
        kind: "percent",
        value: 15,
        categoryIds: [],
        itemIds: [],
        days: [],
        startTime: null,
        endTime: null,
        couponCode: "GAMER9K",
        minSubtotalCents: 0,
        expiresOn: "2027-12-31",
        requiresManager: false,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "cpn-kol20",
        name: "Mã Khán Giả Livestream KOL",
        description: "Giảm 20% cho đơn từ $1.99 trở lên khi xem phiên Live KOL.",
        trigger: "coupon",
        scope: "order",
        kind: "percent",
        value: 20,
        categoryIds: [],
        itemIds: [],
        days: [],
        startTime: null,
        endTime: null,
        couponCode: "KOL20",
        minSubtotalCents: 199,
        expiresOn: "2027-12-31",
        requiresManager: false,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "cpn-whale30",
        name: "VIP Whale Override (-30%)",
        description: "Giảm sâu 30% (>20% cần cờ phê duyệt Studio Manager).",
        trigger: "coupon",
        scope: "order",
        kind: "percent",
        value: 30,
        categoryIds: [],
        itemIds: [],
        days: [],
        startTime: null,
        endTime: null,
        couponCode: "WHALE30",
        minSubtotalCents: 299,
        expiresOn: "2027-12-31",
        requiresManager: true,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    this.orders = [];
    this.shifts = [];
    this.currentShiftId = null;

    // Open default live-ops shift automatically
    this.openShift({
      operatorId: "op_kol_host",
      operatorName: "KOL Sanctuary Host",
      openingFloatCents: 10000,
    });
  }

  // ==========================================================================
  // 1. STOCK & AUTO-86 ENGINE (`src/lib/stock.ts`)
  // ==========================================================================

  stockStatus(item) {
    if (!item || !item.trackStock) return "untracked";
    if (item.stockOnHand <= 0) return "out";
    if (item.stockOnHand <= item.lowStockAt) return "low";
    return "ok";
  }

  getStockCatalog() {
    return Array.from(this.skuStock.values()).map((item) => ({
      ...item,
      status: this.stockStatus(item),
    }));
  }

  canFulfill(lines = []) {
    const neededBySku = new Map();
    for (const line of lines) {
      if (line.voided) continue;
      const sku = String(line.sku || line.menuItemId || "");
      const qty = Math.max(1, Number(line.quantity || 1));
      neededBySku.set(sku, (neededBySku.get(sku) || 0) + qty);
    }

    for (const [sku, needed] of neededBySku.entries()) {
      const item = this.skuStock.get(sku);
      if (!item || !item.trackStock) continue;
      if (item.autoEightySixed || needed > item.stockOnHand) {
        return {
          ok: false,
          sku,
          itemName: item.name,
          remaining: item.stockOnHand,
          autoEightySixed: item.autoEightySixed,
        };
      }
    }
    return { ok: true };
  }

  adjustStock(sku, delta, reason = "adjustment", note = "") {
    const item = this.skuStock.get(String(sku));
    if (!item) {
      return { ok: false, error: `Unknown SKU "${sku}"` };
    }
    const prev = item.stockOnHand;
    if (item.trackStock) {
      item.stockOnHand = Math.max(0, item.stockOnHand + Number(delta || 0));
      item.autoEightySixed = item.stockOnHand === 0;
    }
    const entry = {
      id: `stk_${randomBytes(4).toString("hex")}`,
      timestamp: new Date().toISOString(),
      sku: item.sku,
      name: item.name,
      previousStock: prev,
      change: Number(delta || 0),
      newStock: item.stockOnHand,
      autoEightySixed: item.autoEightySixed,
      reason,
      note,
    };
    this.stockLog.unshift(entry);
    return { ok: true, item: { ...item, status: this.stockStatus(item) }, entry };
  }

  // ==========================================================================
  // 2. HAPPY HOUR & COUPON ENGINE (`src/lib/discounts.ts` + `totals.ts`)
  // ==========================================================================

  activeScheduledRules(now = new Date()) {
    const day = now.getUTCDay();
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    return this.discountRules.filter((r) => {
      if (!r.active || r.trigger !== "scheduled") return false;
      if (r.days.length > 0 && !r.days.includes(day)) return false;
      if (!r.startTime || !r.endTime) return false;
      const startMin = parseHHMM(r.startTime);
      const endMin = parseHHMM(r.endTime);
      return nowMin >= startMin && nowMin <= endMin;
    });
  }

  toggleHappyHour(active) {
    const hh = this.discountRules.find((r) => r.id === "hh-powerups");
    if (hh) hh.active = Boolean(active);
    return {
      ok: true,
      happyHourActive: Boolean(hh?.active),
      activeRules: this.activeScheduledRules(),
    };
  }

  scheduledRuleForSku(sku, now = new Date()) {
    const item = this.skuStock.get(sku);
    if (!item) return null;
    const matches = this.activeScheduledRules(now).filter((r) => {
      if (r.scope === "category") return r.categoryIds.includes(item.category);
      if (r.scope === "item") return r.itemIds.includes(item.sku);
      return false;
    });
    if (matches.length === 0) return null;
    const saving = (r) =>
      r.kind === "percent"
        ? Math.round((item.priceCents * r.value) / 100)
        : Math.min(item.priceCents, r.value);
    matches.sort((a, b) => saving(b) - saving(a));
    return matches[0];
  }

  needsManagerApproval(kind, value, ruleRequiresManager = false) {
    if (ruleRequiresManager) return true;
    return kind === "percent" ? value > 20 : value > 2000;
  }

  validateCoupon(rawCode, subtotalAfterLineDiscountsCents, options = {}) {
    const code = String(rawCode || "")
      .trim()
      .toUpperCase();
    if (!code) {
      return { ok: false, error: "Mã giảm giá trống." };
    }
    const rule = this.discountRules.find(
      (r) => r.trigger === "coupon" && r.couponCode?.toUpperCase() === code && r.active
    );
    if (!rule) {
      return { ok: false, error: `Không nhận diện được mã "${code}".` };
    }

    const now = options.now ? new Date(options.now) : new Date();
    const today = dateKeyUTC(now);
    if (rule.expiresOn && today > rule.expiresOn) {
      return { ok: false, error: `Mã ${code} đã hết hạn ngày ${rule.expiresOn}.` };
    }
    if (rule.days.length > 0 && !rule.days.includes(now.getUTCDay())) {
      return { ok: false, error: `Mã ${code} không áp dụng vào hôm nay.` };
    }
    if (
      Array.isArray(options.existingCoupons) &&
      options.existingCoupons.length > 0
    ) {
      return { ok: false, error: "Mỗi đơn hàng chỉ áp dụng tối đa 1 mã coupon." };
    }
    if (
      rule.minSubtotalCents > 0 &&
      subtotalAfterLineDiscountsCents < rule.minSubtotalCents
    ) {
      return {
        ok: false,
        error: `Đơn cần tối thiểu $${(rule.minSubtotalCents / 100).toFixed(
          2
        )} để dùng mã ${code}.`,
      };
    }

    const requiresManager = this.needsManagerApproval(
      rule.kind,
      rule.value,
      rule.requiresManager
    );
    if (requiresManager && !options.managerApproved) {
      return {
        ok: false,
        requiresManager: true,
        error: `Mã ${code} giảm >20% (${rule.value}%) — cần cờ phê duyệt Studio Manager (managerApproved: true).`,
      };
    }

    const discountCents =
      rule.kind === "percent"
        ? Math.round((subtotalAfterLineDiscountsCents * rule.value) / 100)
        : Math.min(subtotalAfterLineDiscountsCents, rule.value);

    return {
      ok: true,
      rule,
      couponCode: code,
      discountCents,
    };
  }

  quoteOrder({
    sku,
    quantity = 1,
    couponCode = "",
    managerApproved = false,
    now = new Date(),
  } = {}) {
    const item = this.skuStock.get(String(sku));
    if (!item) {
      return { ok: false, status: 404, error: `Unknown SKU "${sku}"` };
    }
    const qty = Math.max(1, Number(quantity) || 1);
    const stockCheck = this.canFulfill([{ sku: item.sku, quantity: qty }]);
    if (!stockCheck.ok) {
      return {
        ok: false,
        status: 409,
        error: `SKU "${item.name}" đã hết hàng (86'd)! Còn lại: ${stockCheck.remaining}.`,
        stockCheck,
      };
    }

    const subtotalCents = item.priceCents * qty;
    const hhRule = this.scheduledRuleForSku(item.sku, now);
    const happyHourCents = hhRule
      ? hhRule.kind === "percent"
        ? Math.round((subtotalCents * hhRule.value) / 100)
        : Math.min(subtotalCents, hhRule.value * qty)
      : 0;

    const afterLineCents = Math.max(0, subtotalCents - happyHourCents);
    let couponCents = 0;
    let appliedCoupon = null;
    let couponError = null;

    if (couponCode && String(couponCode).trim()) {
      const cRes = this.validateCoupon(couponCode, afterLineCents, {
        now,
        managerApproved,
      });
      if (!cRes.ok) {
        couponError = cRes.error;
      } else {
        couponCents = cRes.discountCents;
        appliedCoupon = cRes.couponCode;
      }
    }

    const discountCents = happyHourCents + couponCents;
    const netCents = Math.max(0, subtotalCents - discountCents);
    const taxCents = Math.round((netCents * this.settings.taxRatePercent) / 100);
    const totalDueCents = netCents + taxCents;
    const xsollaFeeCents = Math.round(netCents * 0.05);
    const studioNetCents = netCents - xsollaFeeCents;

    return {
      ok: true,
      sku: item.sku,
      itemName: item.name,
      quantity: qty,
      stockRemaining: item.stockOnHand,
      stockStatus: this.stockStatus(item),
      happyHourRule: hhRule ? { id: hhRule.id, name: hhRule.name, value: hhRule.value } : null,
      appliedCoupon,
      couponError,
      totals: {
        subtotalCents,
        happyHourCents,
        couponCents,
        discountCents,
        netCents,
        taxCents,
        totalDueCents,
        xsollaFeeCents,
        studioNetCents,
      },
    };
  }

  // ==========================================================================
  // 3. KDS FULFILLMENT QUEUE FOR LIVE STREAM GIFTS & IAP (`src/lib/kds.ts`)
  // ==========================================================================

  createPosOrder({
    sku = "amber_gems_100",
    quantity = 1,
    customerName = "Sanctuary Player",
    source = "xsolla_iap",
    paymentMethod = "card_demo",
    couponCode = "",
    managerApproved = false,
    prepNote = "",
    autoClosePayment = true,
  } = {}) {
    const quote = this.quoteOrder({ sku, quantity, couponCode, managerApproved });
    if (!quote.ok) return quote;

    const item = this.skuStock.get(sku);
    const nowIso = new Date().toISOString();
    const orderNumber = `${this.settings.receiptPrefix}-${this.settings.nextOrderSeq++}`;
    const orderId = `pos_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

    // Deduct tracked stock & auto-86 if depleted
    if (item.trackStock) {
      this.adjustStock(item.sku, -quote.quantity, "sale", orderNumber);
    }

    const lineId = `ln_${randomBytes(4).toString("hex")}`;
    const station = item.station || STATION_BY_CATEGORY[item.category] || "boost";

    const order = {
      id: orderId,
      orderNumber,
      type: source === "kol_stream" ? "kol_live" : "portal_iap",
      source,
      customerName,
      operatorName: this.getCurrentShift()?.operatorName || "Game9K Gateway",
      shiftId: this.currentShiftId,
      serviceStatus: "sent", // Active on KDS until bumped, then closed when paid & bumped
      paymentStatus: autoClosePayment ? "paid" : "unpaid",
      openedAt: nowIso,
      sentAt: nowIso,
      closedAt: autoClosePayment ? nowIso : null,
      prepNote: String(prepNote || ""),
      lines: [
        {
          id: lineId,
          menuItemId: item.sku,
          sku: item.sku,
          nameSnapshot: item.name,
          category: item.category,
          quantity: quote.quantity,
          unitPriceCentsSnapshot: item.priceCents,
          lineTotalCents: quote.totals.subtotalCents,
          lineDiscountCents: quote.totals.happyHourCents,
          lineDiscountType: quote.totals.happyHourCents > 0 ? "happy_hour" : "none",
          station,
          sent: true,
          sentAt: nowIso,
          bumpedAt: null,
          voided: false,
          voidReason: null,
        },
      ],
      orderDiscounts: quote.appliedCoupon
        ? [
            {
              id: `disc_${randomBytes(3).toString("hex")}`,
              name: quote.appliedCoupon,
              source: "coupon",
              couponCode: quote.appliedCoupon,
              amountCents: quote.totals.couponCents,
            },
          ]
        : [],
      subtotalCents: quote.totals.subtotalCents,
      happyHourCents: quote.totals.happyHourCents,
      lineDiscountCents: quote.totals.happyHourCents,
      compCents: 0,
      orderDiscountCents: quote.totals.couponCents,
      discountCents: quote.totals.discountCents,
      serviceChargeCents: 0,
      taxCents: quote.totals.taxCents,
      totalDueCents: quote.totals.totalDueCents,
      xsollaFeeCents: quote.totals.xsollaFeeCents,
      studioNetCents: quote.totals.studioNetCents,
      amountPaidCents: autoClosePayment ? quote.totals.totalDueCents : 0,
      refundedAmountCents: 0,
      payments: autoClosePayment
        ? [
            {
              id: `pay_${randomBytes(4).toString("hex")}`,
              timestamp: nowIso,
              shiftId: this.currentShiftId,
              method: paymentMethod === "cash" ? "cash" : "card_demo",
              amountCents: quote.totals.totalDueCents,
              operatorName: this.getCurrentShift()?.operatorName || "Game9K Gateway",
            },
          ]
        : [],
      refunds: [],
    };

    this.orders.unshift(order);
    this._syncShiftTotals(order);

    return {
      ok: true,
      order,
      ticketId: `${order.id}|${station}|${nowIso}`,
      stockStatus: this.stockStatus(this.skuStock.get(sku)),
      stockRemaining: this.skuStock.get(sku)?.stockOnHand ?? 999,
    };
  }

  enqueueStreamGiftTicket(giftEvt = {}) {
    const tier = giftEvt.giftTier || "rose";
    const coins = Number(giftEvt.giftValue || 1);
    const viewerName = giftEvt.user?.nickname || "Khán Giả Live";
    const nowIso = new Date().toISOString();
    const orderNumber = `LIVE-${this.settings.nextOrderSeq++}`;
    const orderId = `live_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    const station = tier === "banana" || tier === "meteor" ? "sabotage" : "stream_gift";

    const order = {
      id: orderId,
      orderNumber,
      type: "kol_live",
      source: giftEvt.platform || "tiktok",
      customerName: viewerName,
      operatorName: "StreamBridge",
      shiftId: this.currentShiftId,
      serviceStatus: "sent",
      paymentStatus: "paid",
      openedAt: nowIso,
      sentAt: nowIso,
      closedAt: nowIso,
      prepNote: giftEvt.comment || `Lane ${(giftEvt.lane ?? 0) + 1}`,
      lines: [
        {
          id: `ln_${randomBytes(4).toString("hex")}`,
          menuItemId: `gift_${tier}`,
          sku: `gift_${tier}`,
          nameSnapshot: `${giftEvt.giftName || tier.toUpperCase()} (${coins} xu)`,
          category: "kol_gift",
          quantity: Number(giftEvt.repeatCount || 1),
          unitPriceCentsSnapshot: coins * 2,
          lineTotalCents: coins * 2,
          lineDiscountCents: 0,
          lineDiscountType: "none",
          station,
          sent: true,
          sentAt: nowIso,
          bumpedAt: null,
          voided: false,
          voidReason: null,
        },
      ],
      orderDiscounts: [],
      subtotalCents: coins * 2,
      happyHourCents: 0,
      lineDiscountCents: 0,
      compCents: 0,
      orderDiscountCents: 0,
      discountCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      totalDueCents: coins * 2,
      xsollaFeeCents: 0,
      studioNetCents: coins * 2,
      amountPaidCents: coins * 2,
      refundedAmountCents: 0,
      payments: [
        {
          id: `pay_${randomBytes(4).toString("hex")}`,
          timestamp: nowIso,
          shiftId: this.currentShiftId,
          method: "cash", // Stream coins / virtual tender bucket
          amountCents: coins * 2,
          operatorName: "StreamBridge",
        },
      ],
      refunds: [],
    };

    this.orders.unshift(order);
    this._syncShiftTotals(order);
    return order;
  }

  getTicketState(sentAtIso, now = new Date()) {
    const elapsedSec = (now.getTime() - new Date(sentAtIso).getTime()) / 1000;
    if (elapsedSec >= this.settings.kdsLateSeconds) return "late";
    if (elapsedSec >= this.settings.kdsWarnSeconds) return "watch";
    return "on_time";
  }

  buildKdsSnapshot(now = new Date()) {
    const activeTickets = [];
    const recallTickets = [];
    const nowMs = now.getTime();

    for (const order of this.orders) {
      if (order.serviceStatus === "canceled") continue;
      const groups = new Map();
      for (const line of order.lines) {
        if (!line.sent || !line.sentAt || line.voided) continue;
        const key = `${line.station}|${line.sentAt}`;
        const list = groups.get(key) || [];
        list.push(line);
        groups.set(key, list);
      }

      for (const [key, lines] of groups.entries()) {
        const [station, sentAt] = key.split("|");
        const isActive = lines.some((l) => l.bumpedAt === null);
        let latestBumpedAt = null;
        for (const l of lines) {
          if (l.bumpedAt && (!latestBumpedAt || l.bumpedAt > latestBumpedAt)) {
            latestBumpedAt = l.bumpedAt;
          }
        }

        const ticket = {
          id: `${order.id}|${station}|${sentAt}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          source: order.source,
          customerName: order.customerName,
          station,
          sentAt,
          slaState: this.getTicketState(sentAt, now),
          prepNote: order.prepNote,
          lines,
          active: isActive,
          latestBumpedAt,
        };

        if (isActive) {
          activeTickets.push(ticket);
        } else if (
          latestBumpedAt &&
          nowMs - new Date(latestBumpedAt).getTime() <= 30 * 60 * 1000
        ) {
          recallTickets.push(ticket);
        }
      }
    }

    activeTickets.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    recallTickets.sort((a, b) =>
      (b.latestBumpedAt || "").localeCompare(a.latestBumpedAt || "")
    );

    // Compute All-Day Counts across active tickets (`allDayCounts` from `kds.ts`)
    const countsMap = new Map();
    for (const t of activeTickets) {
      for (const l of t.lines) {
        if (l.voided || l.bumpedAt !== null) continue;
        const k = `${l.sku}|${t.station}`;
        const existing = countsMap.get(k);
        if (existing) existing.count += l.quantity;
        else {
          countsMap.set(k, {
            key: k,
            sku: l.sku,
            name: l.nameSnapshot,
            station: t.station,
            count: l.quantity,
          });
        }
      }
    }
    const allDayCounts = Array.from(countsMap.values()).sort(
      (a, b) => b.count - a.count
    );

    return {
      ok: true,
      activeTickets,
      recallTickets: recallTickets.slice(0, 10),
      allDayCounts,
    };
  }

  bumpTicket(ticketId) {
    const [orderId, station] = String(ticketId || "").split("|");
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, status: 404, error: "Ticket order not found" };

    const nowIso = new Date().toISOString();
    let bumped = 0;
    for (const line of order.lines) {
      if ((!station || line.station === station) && !line.bumpedAt && !line.voided) {
        line.bumpedAt = nowIso;
        bumped++;
      }
    }
    if (order.lines.every((l) => l.voided || Boolean(l.bumpedAt))) {
      order.serviceStatus = order.paymentStatus === "paid" ? "closed" : "served";
      if (!order.closedAt && order.paymentStatus === "paid") {
        order.closedAt = nowIso;
      }
    }
    return { ok: true, bumpedCount: bumped, orderId: order.id, bumpedAt: nowIso };
  }

  recallTicket(ticketId) {
    const [orderId, station] = String(ticketId || "").split("|");
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, status: 404, error: "Ticket order not found" };

    for (const line of order.lines) {
      if (!station || line.station === station) {
        line.bumpedAt = null;
      }
    }
    order.serviceStatus = "sent";
    return { ok: true, recalled: true, orderId: order.id };
  }

  // ==========================================================================
  // 4. SHIFT MANAGEMENT & Z-REPORT RECONCILIATION (`src/lib/reports.ts`)
  // ==========================================================================

  getCurrentShift() {
    if (!this.currentShiftId) return null;
    return this.shifts.find((s) => s.id === this.currentShiftId) || null;
  }

  openShift({
    operatorId = "op_kol_host",
    operatorName = "KOL Sanctuary Host",
    openingFloatCents = 10000,
  } = {}) {
    const current = this.getCurrentShift();
    if (current && current.status === "open") {
      return { ok: true, shift: current, alreadyOpen: true };
    }
    const shift = {
      id: `shf_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`,
      operatorId,
      operatorName,
      openedAt: new Date().toISOString(),
      closedAt: null,
      status: "open",
      openingFloatCents: Number(openingFloatCents) || 0,
      cashSalesCents: 0,
      cardSalesCents: 0,
      totalSalesCents: 0,
      totalTaxCents: 0,
      totalDiscountCents: 0,
      totalRefundsCents: 0,
      cashRefundsCents: 0,
      paidInCents: 0,
      paidOutCents: 0,
      expectedCashCents: Number(openingFloatCents) || 0,
      countedCashCents: null,
      varianceCents: null,
      varianceNote: null,
      movements: [],
    };
    this.shifts.unshift(shift);
    this.currentShiftId = shift.id;
    return { ok: true, shift };
  }

  _syncShiftTotals(order) {
    const shift = this.getCurrentShift();
    if (!shift || shift.status !== "open") return;
    for (const p of order.payments) {
      if (p.method === "card_demo") shift.cardSalesCents += p.amountCents;
      else shift.cashSalesCents += p.amountCents;
    }
    shift.totalSalesCents += order.totalDueCents;
    shift.totalTaxCents += order.taxCents;
    shift.totalDiscountCents += order.discountCents;
    shift.expectedCashCents =
      shift.openingFloatCents +
      shift.cashSalesCents -
      shift.cashRefundsCents +
      shift.paidInCents -
      shift.paidOutCents;
  }

  closeShift({ countedCashCents = null, varianceNote = "" } = {}) {
    const shift = this.getCurrentShift();
    if (!shift || shift.status !== "open") {
      return { ok: false, status: 400, error: "No open shift to close." };
    }
    shift.status = "closed";
    shift.closedAt = new Date().toISOString();
    const counted =
      countedCashCents !== null && countedCashCents !== undefined
        ? Number(countedCashCents)
        : shift.expectedCashCents;
    shift.countedCashCents = counted;
    shift.varianceCents = counted - shift.expectedCashCents;
    shift.varianceNote = varianceNote || null;
    this.currentShiftId = null;
    return { ok: true, shift };
  }

  computeZReport({ fromKey, toKey } = {}) {
    const today = dateKeyUTC(new Date());
    const start = fromKey || today;
    const end = toKey || today;

    const matching = this.orders.filter((o) => {
      if (o.paymentStatus !== "paid" && o.serviceStatus !== "closed") return false;
      const dk = dateKeyUTC(new Date(o.openedAt));
      return dk >= start && dk <= end;
    });

    let portalIapChecks = 0;
    let kolLiveChecks = 0;
    let grossCents = 0;
    let happyHourCents = 0;
    let couponDiscountCents = 0;
    let discountsTotalCents = 0;
    let taxCents = 0;
    let xsollaFeeCents = 0;
    let studioNetCents = 0;
    let cardPaymentsCents = 0;
    let streamCoinsCents = 0;
    let refundsCents = 0;

    const topSellersMap = new Map();
    const categoryMixMap = new Map();
    const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      checks: 0,
      netCents: 0,
    }));

    for (const o of matching) {
      if (o.type === "kol_live") kolLiveChecks++;
      else portalIapChecks++;

      grossCents += o.subtotalCents;
      happyHourCents += o.happyHourCents;
      couponDiscountCents += o.orderDiscountCents;
      discountsTotalCents += o.discountCents;
      taxCents += o.taxCents;
      xsollaFeeCents += o.xsollaFeeCents || 0;
      studioNetCents += o.studioNetCents || 0;
      refundsCents += o.refundedAmountCents || 0;

      const orderNet = Math.max(0, o.subtotalCents - o.discountCents);
      const hr = new Date(o.openedAt).getUTCHours();
      hourlyBuckets[hr].checks += 1;
      hourlyBuckets[hr].netCents += orderNet;

      for (const p of o.payments) {
        if (p.method === "card_demo") cardPaymentsCents += p.amountCents;
        else streamCoinsCents += p.amountCents;
      }

      for (const l of o.lines) {
        if (l.voided) continue;
        const lineNet = Math.max(0, l.lineTotalCents - l.lineDiscountCents);
        const cur = topSellersMap.get(l.sku) || {
          sku: l.sku,
          name: l.nameSnapshot,
          quantity: 0,
          netCents: 0,
        };
        cur.quantity += l.quantity;
        cur.netCents += lineNet;
        topSellersMap.set(l.sku, cur);

        const cat = l.category || "other";
        const cCur = categoryMixMap.get(cat) || {
          category: cat,
          itemsSold: 0,
          netCents: 0,
        };
        cCur.itemsSold += l.quantity;
        cCur.netCents += lineNet;
        categoryMixMap.set(cat, cCur);
      }
    }

    const checks = matching.length;
    const netCents = Math.max(0, grossCents - discountsTotalCents);
    const totalCollectedCents = netCents + taxCents;
    const avgCheckCents = checks > 0 ? Math.round(netCents / checks) : 0;

    const topSellers = Array.from(topSellersMap.values()).sort(
      (a, b) => b.netCents - a.netCents || b.quantity - a.quantity
    );
    const categoryMix = Array.from(categoryMixMap.values()).map((row) => ({
      ...row,
      sharePercent:
        netCents > 0 ? Number(((row.netCents / netCents) * 100).toFixed(1)) : 0,
    }));

    return {
      ok: true,
      reportType: "Z_REPORT",
      generatedAt: new Date().toISOString(),
      fromKey: start,
      toKey: end,
      currentShift: this.getCurrentShift(),
      checks,
      portalIapChecks,
      kolLiveChecks,
      grossCents,
      happyHourCents,
      couponDiscountCents,
      discountsTotalCents,
      netCents,
      taxCents,
      totalCollectedCents,
      xsollaFeeCents,
      studioNetCents,
      avgCheckCents,
      cardPaymentsCents,
      streamCoinsCents,
      refundsCents,
      solanaMilestoneUnlockReady: checks >= 1,
      topSellers,
      categoryMix,
      hourly: hourlyBuckets.filter((b) => b.checks > 0),
    };
  }

  exportCSV(kind = "orders") {
    const normalized = String(kind || "orders").toLowerCase();
    if (normalized === "payments") {
      const headers = [
        "Timestamp",
        "Order Number",
        "Source",
        "Method",
        "Amount USD",
        "Operator",
        "Shift ID",
      ];
      const rows = [];
      for (const o of this.orders) {
        for (const p of o.payments) {
          rows.push([
            p.timestamp,
            o.orderNumber,
            o.source,
            p.method,
            (p.amountCents / 100).toFixed(2),
            p.operatorName,
            p.shiftId || "",
          ]);
        }
      }
      return [headers, ...rows].map(csvEscapeRow).join("\n");
    }

    if (normalized === "shifts") {
      const headers = [
        "Shift ID",
        "Operator",
        "Status",
        "Opened At",
        "Closed At",
        "Opening Float USD",
        "Xsolla Card Sales USD",
        "Stream Coin Sales USD",
        "Expected Drawer USD",
        "Counted USD",
        "Variance USD",
      ];
      const rows = this.shifts.map((s) => [
        s.id,
        s.operatorName,
        s.status,
        s.openedAt,
        s.closedAt || "",
        (s.openingFloatCents / 100).toFixed(2),
        (s.cardSalesCents / 100).toFixed(2),
        (s.cashSalesCents / 100).toFixed(2),
        (s.expectedCashCents / 100).toFixed(2),
        s.countedCashCents !== null ? (s.countedCashCents / 100).toFixed(2) : "",
        s.varianceCents !== null ? (s.varianceCents / 100).toFixed(2) : "",
      ]);
      return [headers, ...rows].map(csvEscapeRow).join("\n");
    }

    const headers = [
      "Order Number",
      "Opened At",
      "Closed At",
      "Type",
      "Customer",
      "Service Status",
      "Payment Status",
      "Subtotal USD",
      "Happy Hour USD",
      "Coupon USD",
      "Tax USD",
      "Total Due USD",
      "Xsolla 5% Fee USD",
      "Studio Net USD",
    ];
    const rows = this.orders.map((o) => [
      o.orderNumber,
      o.openedAt,
      o.closedAt || "",
      o.type,
      o.customerName || "",
      o.serviceStatus,
      o.paymentStatus,
      (o.subtotalCents / 100).toFixed(2),
      (o.happyHourCents / 100).toFixed(2),
      (o.orderDiscountCents / 100).toFixed(2),
      (o.taxCents / 100).toFixed(2),
      (o.totalDueCents / 100).toFixed(2),
      ((o.xsollaFeeCents || 0) / 100).toFixed(2),
      ((o.studioNetCents || 0) / 100).toFixed(2),
    ]);
    return [headers, ...rows].map(csvEscapeRow).join("\n");
  }
}
