/**
 * AgentOpsService.js
 * Production Observability, Prompt Caching, Reactive Runtime, Context Capsule & Webhook Engine
 * for Game9K Unified Poki Portal SDK v6.0 (`PokiSDK.agentOps`).
 *
 * Applies the 5 infrastructure pillars from `lexuankhanh1612/awesome-ai-sdks`:
 *   1. AgentOps + Langfuse + LangSmith:
 *      - Hierarchical `Trace -> Span -> Generation` execution graphs (`nodes[]`, `edges[]`),
 *        Time-Travel Session Replay (`replayFrames[]`), root-cause failure pinpointing & Eval Scores.
 *   2. Helicone:
 *      - Deterministic SHA-256 + TTL Prompt Cache (`$0.00` token cost & `< 1ms` hit latency on repeated
 *        KOL stream chats/prompts) + `P50 / P95 / P99` latency percentile analytics.
 *   3. Chidori:
 *      - Reactive Event-Driven Agent Graph (`registerReactiveRule` + `emitReactiveEvent`) that
 *        reacts autonomously to POS `86'd` stock scarcity & KOL Live Meteor combos.
 *   4. SID:
 *      - 1-Click Unified Context Capsule (`buildContextCapsule`) aggregating Game Manifest,
 *        POS Stock/KDS/Z-Report, Active E2B Sandboxes & OpenRouter Spend Budget for AI Agents.
 *   5. Steamship:
 *      - Async HMAC-SHA256 Signed Webhook Callbacks (`X-Game9K-Signature`) for serverless-safe
 *        long-running agent notifications.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, "../../public/games");

function percentile(sortedNums, p) {
  if (!sortedNums.length) return 0;
  const idx = Math.min(
    sortedNums.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedNums.length) - 1)
  );
  return sortedNums[idx];
}

export default class AgentOpsService {
  constructor(options = {}) {
    this.cacheTtlMs = Number(options.cacheTtlMs ?? 120_000);
    this.webhookSecret =
      options.webhookSecret || process.env.GAME9K_WEBHOOK_SECRET || "g9k_steamship_hmac_2026";

    // 1. AgentOps / Langfuse / LangSmith Traces
    this.traces = new Map(); // traceId -> trace object
    this.traceOrder = []; // newest first

    // 2. Helicone Cache & Latency Percentiles
    this.promptCache = new Map(); // hash -> { hash, value, createdAt, expiresAt, hits, savedUsd, savedTokens }
    this.cacheLookups = 0;
    this.cacheHits = 0;
    this.totalSavedUsd = 0;
    this.totalSavedTokens = 0;
    this.latencySamplesMs = [];

    // 3. Chidori Reactive Rules & Firing Log
    this.reactiveRules = new Map();
    this.reactiveEventsLog = [];

    // 4. Steamship Webhooks & Delivery Ledger
    this.webhooks = new Map(); // webhookId -> { id, url, events, secret, active, createdAt }
    this.webhookDeliveries = [];

    this._installDefaultReactiveRules();
  }

  // ==========================================================================
  // 1. AGENTOPS / LANGFUSE / LANGSMITH: TRACE -> SPAN -> REPLAY & EVAL SCORES
  // ==========================================================================

  startTrace({
    name = "poki_agent_workflow",
    sessionId = "studio_default",
    tags = [],
    metadata = {},
  } = {}) {
    const traceId = `tr_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const startedAtMs = Date.now();
    const trace = {
      traceId,
      name,
      sessionId,
      status: "running",
      tags: Array.isArray(tags) ? tags : [],
      metadata,
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      endedAt: null,
      durationMs: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      spans: [],
      evalScores: [],
    };
    this.traces.set(traceId, trace);
    this.traceOrder.unshift(traceId);
    if (this.traceOrder.length > 80) {
      const evicted = this.traceOrder.pop();
      this.traces.delete(evicted);
    }
    return trace;
  }

  addSpan(
    traceId,
    {
      name = "llm_generation",
      kind = "generation", // 'generation' | 'tool' | 'sandbox' | 'cache' | 'reactive'
      parentSpanId = null,
      model = null,
      input = null,
      output = null,
      status = "ok",
      latencyMs = 1,
      tokens = 0,
      costUsd = 0,
      cached = false,
      error = null,
    } = {}
  ) {
    let trace = traceId ? this.traces.get(String(traceId)) : null;
    if (!trace) {
      trace = this.startTrace({ name });
    }

    const spanId = `sp_${randomBytes(4).toString("hex")}`;
    const nowMs = Date.now();
    const cleanLatency = Math.max(0.2, Number(latencyMs) || 1);
    const span = {
      spanId,
      traceId: trace.traceId,
      parentSpanId,
      index: trace.spans.length + 1,
      name,
      kind,
      model,
      status,
      cached: Boolean(cached),
      latencyMs: Number(cleanLatency.toFixed(2)),
      offsetMs: Math.max(0, nowMs - trace.startedAtMs),
      tokens: Math.max(0, Number(tokens) || 0),
      costUsd: Math.max(0, Number(costUsd) || 0),
      inputPreview:
        typeof input === "string"
          ? input.slice(0, 220)
          : input
          ? JSON.stringify(input).slice(0, 220)
          : null,
      outputPreview:
        typeof output === "string"
          ? output.slice(0, 260)
          : output
          ? JSON.stringify(output).slice(0, 260)
          : null,
      error: error || null,
      timestamp: new Date(nowMs).toISOString(),
    };

    trace.spans.push(span);
    trace.totalTokens += span.tokens;
    trace.totalCostUsd = Number((trace.totalCostUsd + span.costUsd).toFixed(6));
    trace.durationMs = Math.max(trace.durationMs, span.offsetMs + span.latencyMs);
    if (status === "error" || error) {
      trace.status = "error";
    }
    this.recordLatency(cleanLatency);

    return span;
  }

  endTrace(traceId, status = null) {
    const trace = this.traces.get(String(traceId));
    if (!trace) return null;
    trace.endedAt = new Date().toISOString();
    trace.durationMs = Math.max(trace.durationMs, Date.now() - trace.startedAtMs);
    if (status) trace.status = status;
    else if (trace.status === "running") trace.status = "completed";
    return trace;
  }

  scoreTrace(traceId, { name = "playability_quality", value = 1.0, comment = "" } = {}) {
    const trace = this.traces.get(String(traceId));
    if (!trace) return { ok: false, status: 404, error: `Trace "${traceId}" not found.` };
    const score = {
      scoreId: `sc_${randomBytes(4).toString("hex")}`,
      name: String(name),
      value: Math.max(0, Math.min(1, Number(value) || 0)),
      comment: String(comment || ""),
      createdAt: new Date().toISOString(),
    };
    trace.evalScores.push(score);
    return { ok: true, traceId: trace.traceId, score, evalScores: trace.evalScores };
  }

  getTraceReplay(traceId) {
    const trace = this.traces.get(String(traceId));
    if (!trace) return { ok: false, status: 404, error: `Trace "${traceId}" not found.` };

    const nodes = [
      { id: trace.traceId, label: trace.name, kind: "root_trace", status: trace.status },
      ...trace.spans.map((s) => ({
        id: s.spanId,
        label: `${s.index}. ${s.name}`,
        kind: s.kind,
        model: s.model,
        cached: s.cached,
        latencyMs: s.latencyMs,
        status: s.status,
      })),
    ];

    const edges = trace.spans.map((s, idx) => ({
      from: s.parentSpanId || (idx === 0 ? trace.traceId : trace.spans[idx - 1].spanId),
      to: s.spanId,
    }));

    const failedStep = trace.spans.find((s) => s.status === "error" || s.error) || null;

    return {
      ok: true,
      traceId: trace.traceId,
      name: trace.name,
      status: trace.status,
      totalDurationMs: Number(trace.durationMs.toFixed(2)),
      totalTokens: trace.totalTokens,
      totalCostUsd: trace.totalCostUsd,
      failedStep,
      graph: { nodes, edges },
      replayFrames: trace.spans,
      evalScores: trace.evalScores,
    };
  }

  listTraces(limit = 20) {
    return this.traceOrder
      .slice(0, limit)
      .map((id) => this.traces.get(id))
      .filter(Boolean)
      .map((t) => ({
        traceId: t.traceId,
        name: t.name,
        status: t.status,
        spansCount: t.spans.length,
        durationMs: Number(t.durationMs.toFixed(2)),
        totalTokens: t.totalTokens,
        totalCostUsd: t.totalCostUsd,
        evalAvg:
          t.evalScores.length > 0
            ? Number(
                (
                  t.evalScores.reduce((acc, s) => acc + s.value, 0) / t.evalScores.length
                ).toFixed(3)
              )
            : null,
        startedAt: t.startedAt,
      }));
  }

  // ==========================================================================
  // 2. HELICONE: PROMPT RESPONSE CACHE (SHA-256 + TTL) & P50/P95/P99 LATENCY
  // ==========================================================================

  computeCacheKey(payload = {}) {
    const normalized = JSON.stringify({
      task: payload.task || "chat",
      model: payload.model || "openrouter/auto",
      sort: payload.sort || "latency",
      zdr: Boolean(payload.zdr ?? true),
      messages: payload.messages || payload.prompt || "",
    });
    return createHash("sha256").update(normalized).digest("hex");
  }

  lookupCache(payload = {}) {
    this.cacheLookups += 1;
    const key = this.computeCacheKey(payload);
    const hit = this.promptCache.get(key);
    if (!hit) return { hit: false, key };
    if (Date.now() > hit.expiresAt) {
      this.promptCache.delete(key);
      return { hit: false, key };
    }
    hit.hits += 1;
    this.cacheHits += 1;
    this.totalSavedUsd = Number((this.totalSavedUsd + hit.unitCostUsd).toFixed(6));
    this.totalSavedTokens += hit.unitTokens;
    return {
      hit: true,
      key,
      value: hit.value,
      hits: hit.hits,
      savedUsd: hit.unitCostUsd,
      savedTokens: hit.unitTokens,
    };
  }

  storeCache(payload = {}, value, { unitCostUsd = 0.000025, unitTokens = 32, ttlMs } = {}) {
    const key = this.computeCacheKey(payload);
    const now = Date.now();
    this.promptCache.set(key, {
      key,
      value,
      unitCostUsd: Number(unitCostUsd) || 0.000025,
      unitTokens: Number(unitTokens) || 32,
      hits: 0,
      createdAt: now,
      expiresAt: now + (Number(ttlMs) || this.cacheTtlMs),
    });
    return key;
  }

  recordLatency(latencyMs) {
    this.latencySamplesMs.push(Number(latencyMs) || 1);
    if (this.latencySamplesMs.length > 500) {
      this.latencySamplesMs.shift();
    }
  }

  getCacheAndLatencyStats() {
    const sorted = [...this.latencySamplesMs].sort((a, b) => a - b);
    const hitRate =
      this.cacheLookups > 0
        ? Number(((this.cacheHits / this.cacheLookups) * 100).toFixed(2))
        : 0;
    return {
      cacheEntries: this.promptCache.size,
      cacheLookups: this.cacheLookups,
      cacheHits: this.cacheHits,
      cacheHitRatePct: hitRate,
      savedUsd: this.totalSavedUsd,
      savedTokens: this.totalSavedTokens,
      latency: {
        samples: sorted.length,
        p50Ms: Number(percentile(sorted, 50).toFixed(2)),
        p95Ms: Number(percentile(sorted, 95).toFixed(2)),
        p99Ms: Number(percentile(sorted, 99).toFixed(2)),
      },
    };
  }

  // ==========================================================================
  // 3. CHIDORI: REACTIVE EVENT-DRIVEN AGENT GRAPH
  // ==========================================================================

  _installDefaultReactiveRules() {
    this.registerReactiveRule({
      id: "rule_pos_scarcity_guard",
      name: "POS Low/86'd Scarcity Reactive Broadcast",
      triggerEvent: "pos.stock_alert",
      description:
        "Khi vật phẩm POS xuống mức low hoặc tự khóa 86'd, tự động tạo thông báo khan hiếm & ghi Trace.",
      handler: async (payload) => ({
        action: "broadcast_scarcity_banner",
        sku: payload.sku || "kol_meteor_pack_5",
        status: payload.status || "out",
        banner: `⚠️ [Chidori Reactive] Vật phẩm ${payload.sku || "Meteor Pack"} vừa chạm ngưỡng ${
          payload.status || "86'd"
        }! Kích hoạt gợi ý gói dự phòng.`,
      }),
    });

    this.registerReactiveRule({
      id: "rule_kol_meteor_hype",
      name: "KOL Meteor Sabotage -> HappyTime + AI Shoutcast",
      triggerEvent: "kol.high_tier_gift",
      description:
        "Khi khán giả bắn quà Thiên Thạch / Vương Miện, tự động kích hoạt Poki HappyTime & Shoutcast.",
      handler: async (payload, ctx) => {
        let shout = null;
        if (ctx?.openRouterService) {
          const cast = await ctx.openRouterService.shoutcastStreamEvent({
            nickname: payload.nickname || "VIP_Viewer",
            giftTier: payload.giftTier || "meteor",
            comment: payload.comment || "Lật kèo chặng đua!",
          });
          shout = cast.shoutcast?.headline || null;
        }
        return {
          action: "trigger_poki_happy_time",
          intensity: 0.95,
          shoutcastHeadline:
            shout || `🔥 [Chidori Reactive] ${payload.nickname || "VIP"} kích nổ ${payload.giftTier || "METEOR"}!`,
        };
      },
    });
  }

  registerReactiveRule({ id, name, triggerEvent, description = "", handler }) {
    const ruleId = id || `rule_${randomBytes(4).toString("hex")}`;
    this.reactiveRules.set(ruleId, {
      id: ruleId,
      name: name || ruleId,
      triggerEvent,
      description,
      fireCount: 0,
      lastFiredAt: null,
      handler,
    });
    return this.reactiveRules.get(ruleId);
  }

  async emitReactiveEvent(eventType, payload = {}, contextServices = {}) {
    const trace = this.startTrace({
      name: `chidori_reactive:${eventType}`,
      tags: ["chidori", "reactive", eventType],
    });
    const reactions = [];

    for (const rule of this.reactiveRules.values()) {
      if (rule.triggerEvent !== eventType && rule.triggerEvent !== "*") continue;
      const t0 = performance.now();
      try {
        const result = await rule.handler(payload, contextServices);
        rule.fireCount += 1;
        rule.lastFiredAt = new Date().toISOString();
        const elapsed = performance.now() - t0;
        this.addSpan(trace.traceId, {
          name: rule.name,
          kind: "reactive",
          input: payload,
          output: result,
          latencyMs: elapsed,
        });
        reactions.push({ ruleId: rule.id, name: rule.name, result });
      } catch (err) {
        this.addSpan(trace.traceId, {
          name: rule.name,
          kind: "reactive",
          status: "error",
          error: err?.message || String(err),
        });
      }
    }

    this.endTrace(trace.traceId);
    const record = {
      eventId: `rev_${randomBytes(4).toString("hex")}`,
      eventType,
      traceId: trace.traceId,
      reactionsCount: reactions.length,
      reactions,
      timestamp: new Date().toISOString(),
    };
    this.reactiveEventsLog.unshift(record);
    if (this.reactiveEventsLog.length > 50) this.reactiveEventsLog.pop();

    await this.dispatchWebhook(`reactive.${eventType}`, record);
    return { ok: true, ...record };
  }

  // ==========================================================================
  // 4. SID: 1-CLICK UNIFIED CONTEXT CAPSULE FOR AGENTS
  // ==========================================================================

  buildContextCapsule({
    gameId = "dino-race",
    posService = null,
    e2bService = null,
    openRouterService = null,
    liveRoomHub = null,
  } = {}) {
    const manifestPath = join(GAMES_DIR, String(gameId), "game9k.manifest.json");
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : { id: gameId, legal_classification: "G2" };

    const zReport = posService ? posService.computeZReport() : null;
    const stockAlerts = posService
      ? posService
          .getStockCatalog()
          .filter((i) => i.status === "low" || i.status === "out")
          .map((i) => ({ sku: i.sku, stockOnHand: i.stockOnHand, status: i.status }))
      : [];

    return {
      ok: true,
      capsuleVersion: "sid-v1",
      generatedAt: new Date().toISOString(),
      game: {
        id: manifest.id || gameId,
        title: manifest.title || gameId,
        legalClassification: manifest.legal_classification || "G2",
        maxGzipKb: manifest.budgets?.max_gzip_kb || 125,
        maxTelemetryHz: manifest.budgets?.max_telemetry_hz || 20,
      },
      economySnapshot: zReport
        ? {
            checks: zReport.checks,
            studioNetCents: zReport.studioNetCents,
            aiUsage: zReport.aiUsage,
            stockAlerts,
          }
        : null,
      e2bSandboxesActive: e2bService ? e2bService.listSandboxes().length : 0,
      openRouterStatus: openRouterService ? openRouterService.getStatus().budget : null,
      liveStreamStats: liveRoomHub ? liveRoomHub.getStats() : null,
      observability: this.getCacheAndLatencyStats(),
    };
  }

  // ==========================================================================
  // 5. STEAMSHIP: ASYNC SIGNED HMAC-SHA256 WEBHOOK CALLBACKS
  // ==========================================================================

  signWebhookBody(rawBody, secret = this.webhookSecret) {
    const digest = createHmac("sha256", String(secret)).update(String(rawBody)).digest("hex");
    return `sha256=${digest}`;
  }

  registerWebhook({ url, events = ["*"], secret = null } = {}) {
    if (!url || typeof url !== "string") {
      return { ok: false, status: 400, error: "Webhook `url` is required." };
    }
    const id = `wh_${randomBytes(5).toString("hex")}`;
    const hook = {
      id,
      url,
      events: Array.isArray(events) && events.length > 0 ? events : ["*"],
      secret: secret || this.webhookSecret,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.webhooks.set(id, hook);
    return {
      ok: true,
      webhook: {
        id: hook.id,
        url: hook.url,
        events: hook.events,
        active: hook.active,
        createdAt: hook.createdAt,
      },
    };
  }

  async dispatchWebhook(event, payload = {}) {
    const deliveries = [];
    const bodyObj = {
      id: `evt_${randomBytes(5).toString("hex")}`,
      event,
      createdAt: new Date().toISOString(),
      payload,
    };
    const rawBody = JSON.stringify(bodyObj);

    for (const hook of this.webhooks.values()) {
      if (!hook.active) continue;
      if (!hook.events.includes("*") && !hook.events.includes(event)) continue;

      const signature = this.signWebhookBody(rawBody, hook.secret);
      let status = "signed_queued";
      let httpStatus = 202;

      if (/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(hook.url)) {
        try {
          const res = await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Game9K-Event": event,
              "X-Game9K-Signature": signature,
            },
            body: rawBody,
          });
          httpStatus = res.status;
          status = res.ok ? "delivered" : "failed";
        } catch {
          status = "delivery_error";
          httpStatus = 502;
        }
      }

      const rec = {
        deliveryId: `dlv_${randomBytes(4).toString("hex")}`,
        webhookId: hook.id,
        url: hook.url,
        event,
        signature,
        status,
        httpStatus,
        timestamp: bodyObj.createdAt,
      };
      this.webhookDeliveries.unshift(rec);
      if (this.webhookDeliveries.length > 60) this.webhookDeliveries.pop();
      deliveries.push(rec);
    }

    return { ok: true, event, deliveriesCount: deliveries.length, deliveries };
  }

  getDashboard() {
    return {
      ok: true,
      traces: this.listTraces(15),
      helicone: this.getCacheAndLatencyStats(),
      reactiveRules: Array.from(this.reactiveRules.values()).map((r) => ({
        id: r.id,
        name: r.name,
        triggerEvent: r.triggerEvent,
        description: r.description,
        fireCount: r.fireCount,
        lastFiredAt: r.lastFiredAt,
      })),
      recentReactiveEvents: this.reactiveEventsLog.slice(0, 10),
      webhooks: Array.from(this.webhooks.values()).map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        active: w.active,
      })),
      recentDeliveries: this.webhookDeliveries.slice(0, 10),
    };
  }
}
