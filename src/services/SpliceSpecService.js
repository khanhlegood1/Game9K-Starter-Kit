/**
 * SpliceSpecService.js
 * Applies the architecture of `Darhlilove/splice` ("Spec-to-SDK Generator, OpenAPI Explorer & Mock Server")
 * into the Game9K Poki Portal SDK platform:
 *   1. OpenAPI 3.1 Spec Builder & Circular-Safe Parser (`getOpenAPISpec`, `parseSpec`)
 *   2. Cryptographic `sk_live_<32_base64url>` API Key Manager (`generateApiKey`, `isValidApiKeyFormat`, `maskApiKey`)
 *   3. `MockServerManager` (`startMockServer`, `stopMockServer`, `executeMockRequest` with auth enforcement & key cleanup)
 *   4. Native `SDKGenerator` + `SDKEnhancer` (`validateConfig`, `generateSDK`) generating a typed
 *      Poki Portal + Xsolla + Live-Ops POS TypeScript SDK (`client.ts`, `types.ts`, `http/interceptors.ts`, `poki-portal-bridge.ts`, `README.md`).
 */

import { randomBytes } from "node:crypto";

const GLOBAL_STORE_KEY = "__g9kSpliceState";

function getGlobalState() {
  if (!globalThis[GLOBAL_STORE_KEY]) {
    globalThis[GLOBAL_STORE_KEY] = {
      mocks: new Map(), // specId -> mockSession
      apiKeys: new Map(), // apiKey -> specId
      generations: new Map(), // genId -> GenerationState
    };
  }
  return globalThis[GLOBAL_STORE_KEY];
}

export function generateApiKey() {
  const base64url = randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `sk_live_${base64url}`;
}

export function isValidApiKeyFormat(apiKey) {
  return /^sk_live_[A-Za-z0-9_-]{32}$/.test(String(apiKey || ""));
}

export function maskApiKey(apiKey) {
  if (!apiKey || String(apiKey).length < 16) return "****";
  const s = String(apiKey);
  return `${s.slice(0, 12)}...${s.slice(-4)}`;
}

export function removeCircularReferences(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") return obj;
  if (seen.has(obj)) return "[Circular]";
  seen.add(obj);
  if (Array.isArray(obj)) {
    return obj.map((item) => removeCircularReferences(item, seen));
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = removeCircularReferences(v, seen);
  }
  return clean;
}

export default class SpliceSpecService {
  constructor(options = {}) {
    this.portalTitle = options.portalTitle || "Game9K Poki Portal & Live-Ops Gateway API";
    this.portalVersion = options.portalVersion || "7.0.0";
    this.state = getGlobalState();
  }

  // ==========================================================================
  // 1. OPENAPI 3.1 SPECIFICATION & PARSER (`packages/openapi/src/parser.ts`)
  // ==========================================================================

  getOpenAPISpec(serverUrl = "/") {
    return {
      openapi: "3.1.0",
      info: {
        title: this.portalTitle,
        version: this.portalVersion,
        description:
          "Unified OpenAPI 3.1 Contract for Game9K Portal SDK v7.0 — Poki Lifecycle RPC, Xsolla SDK 3, POS/KDS, E2B Sandboxes, OpenRouter Multimodal (Audio Speech TTS, Transparent Sprite/Poster Images, KOL Sub-Keys, Sticky Prompt Caching), and AgentOps Observability.",
        license: { name: "MIT" },
      },
      servers: [
        { url: serverUrl, description: "Game9K Active Portal Gateway" },
        { url: "/api/splice/mock/game9k-portal", description: "Splice Isolated Mock Sandbox" },
      ],
      components: {
        securitySchemes: {
          StudioApiKey: {
            type: "apiKey",
            in: "header",
            name: "x-g9k-api-key",
            description: "Splice cryptographic studio key (`sk_live_...`)",
          },
          XsollaBearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Xsolla SDK 3 Player Token (`xl3.*`) or Studio Key (`sk_live_...`)",
          },
        },
        schemas: {
          XsollaAuthRequest: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["device_id", "portal_sso", "server_token"] },
              deviceId: { type: "string" },
              country: { type: "string", default: "VN" },
              sandbox: { type: "boolean", default: true },
            },
          },
          PosQuoteRequest: {
            type: "object",
            required: ["sku"],
            properties: {
              sku: { type: "string", example: "kol_meteor_pack_5" },
              quantity: { type: "integer", default: 1 },
              couponCode: { type: "string", example: "GAMER9K" },
              managerApproved: { type: "boolean", default: false },
            },
          },
          KdsTicket: {
            type: "object",
            properties: {
              id: { type: "string" },
              orderNumber: { type: "string" },
              station: { type: "string", enum: ["boost", "sabotage", "cosmetic", "vip", "stream_gift"] },
              slaState: { type: "string", enum: ["on_time", "watch", "late"] },
              customerName: { type: "string" },
              sentAt: { type: "string", format: "date-time" },
            },
          },
          ZReportSummary: {
            type: "object",
            properties: {
              reportType: { type: "string", example: "Z_REPORT" },
              checks: { type: "integer" },
              grossCents: { type: "integer" },
              happyHourCents: { type: "integer" },
              couponDiscountCents: { type: "integer" },
              netCents: { type: "integer" },
              taxCents: { type: "integer" },
              studioNetCents: { type: "integer" },
            },
          },
        },
      },
      security: [{ StudioApiKey: [] }, { XsollaBearerAuth: [] }],
      paths: {
        "/api/health": {
          get: {
            operationId: "getPortalHealth",
            tags: ["Portal Core"],
            summary: "Inspect Game9K Portal & active KOL rooms health",
            security: [],
            responses: { 200: { description: "Portal operational status" } },
          },
        },
        "/api/xsolla/auth": {
          post: {
            operationId: "authenticateXsollaPlayer",
            tags: ["Xsolla SDK 3"],
            summary: "Step 01 — Silent Device ID or Poki Portal SSO Authentication",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/XsollaAuthRequest" },
                },
              },
            },
            responses: { 200: { description: "Mints xl3.* JWT & 6-char Explorer ID" } },
          },
        },
        "/api/xsolla/catalog": {
          get: {
            operationId: "getXsollaCatalog",
            tags: ["Xsolla SDK 3"],
            summary: "Step 02 — Localized SKU Catalog with Happy Hour & Stock/86'd Badges",
            parameters: [
              { name: "country", in: "query", schema: { type: "string", default: "VN" } },
              { name: "gameId", in: "query", schema: { type: "string", default: "dino-race" } },
            ],
            responses: { 200: { description: "Localized catalog items with VAT & 5% fee breakdown" } },
          },
        },
        "/api/xsolla/orders": {
          post: {
            operationId: "createXsollaOrder",
            tags: ["Xsolla SDK 3"],
            summary: "Step 03 — Create Pay Station 4 Checkout Order (with Coupon & Stock Guard)",
            responses: { 200: { description: "Pay Station 4 order & token" } },
          },
        },
        "/api/xsolla/orders/{orderId}/finalize": {
          post: {
            operationId: "finalizeXsollaPurchase",
            tags: ["Xsolla SDK 3"],
            summary: "Step 04 — Verify HMAC Receipt, Grant Items & Enqueue KDS Fulfillment Ticket",
            parameters: [
              { name: "orderId", in: "path", required: true, schema: { type: "string" } },
            ],
            responses: { 200: { description: "Verified fulfillment & updated inventory" } },
          },
        },
        "/api/pos/quote": {
          post: {
            operationId: "quotePosOrder",
            tags: ["POS & Economy"],
            summary: "Pre-flight Stock Check + Happy Hour + Coupon Quote (`GAMER9K` / `KOL20`)",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PosQuoteRequest" },
                },
              },
            },
            responses: { 200: { description: "Computed cents breakdown & remaining stock" } },
          },
        },
        "/api/pos/stock": {
          get: {
            operationId: "getPosStockCatalog",
            tags: ["POS & Economy"],
            summary: "List SKU stock levels, par thresholds & Auto-86'd sold-out status",
            responses: { 200: { description: "SKU stock ledger" } },
          },
        },
        "/api/pos/kds": {
          get: {
            operationId: "getKdsTickets",
            tags: ["KDS Fulfillment"],
            summary: "Fetch Active KDS Tickets (`on_time`/`watch`/`late`), 30m Recall Queue & All-Day Counts",
            responses: { 200: { description: "Live KDS station snapshot" } },
          },
        },
        "/api/pos/kds/bump": {
          post: {
            operationId: "bumpKdsTicket",
            tags: ["KDS Fulfillment"],
            summary: "Bump (complete) an active KOL Gift or IAP Fulfillment Ticket",
            responses: { 200: { description: "Ticket bumped to 30-min recall window" } },
          },
        },
        "/api/pos/z-report": {
          get: {
            operationId: "getPosZReport",
            tags: ["Shifts & Z-Report"],
            summary: "Compute End-of-Day / KOL Stream Z-Report & Solana Milestone Readiness",
            responses: { 200: { description: "Full Z-Report reconciliation" } },
          },
        },
        "/api/e2b/sandboxes": {
          post: {
            operationId: "createE2BSandbox",
            tags: ["E2B Runtime"],
            summary: "Boot or resume an isolated E2B Portal Sandbox from a pre-built template snapshot",
            responses: { 201: { description: "Sandbox started with lifecycleId & envd token" } },
          },
        },
        "/api/e2b/interpreter/run": {
          post: {
            operationId: "runCodeInterpreter",
            tags: ["E2B Code Interpreter"],
            summary: "Execute stateful multi-cell JS/Math code with stdout/stderr & SVG chart extraction",
            responses: { 200: { description: "Execution text, logs & chart results" } },
          },
        },
        "/api/e2b/fragments": {
          post: {
            operationId: "deployFragment",
            tags: ["E2B Fragments"],
            summary: "Deploy a playable Poki HTML5 or KOL Live Fragment from FragmentSchema",
            responses: { 200: { description: "Playable fragment preview URL or cell results" } },
          },
        },
        "/api/e2b/computer-use/step": {
          post: {
            operationId: "stepComputerUseAgent",
            tags: ["Open Computer Use"],
            summary: "Run Vision/Grounding + drawBigDot + Click/Key action step in sandbox",
            responses: { 200: { description: "Grounded coordinate dot & executed tool call" } },
          },
        },
        "/api/openrouter/chat": {
          post: {
            operationId: "openRouterChat",
            tags: ["OpenRouter AI"],
            summary: "Multi-model routed completion with provider fallbacks & ZDR privacy policy",
            responses: { 200: { description: "Routed model response & Z-Report token spend" } },
          },
        },
        "/api/openrouter/fragments/generate": {
          post: {
            operationId: "generatePlayableFragment",
            tags: ["OpenRouter AI"],
            summary: "Prompt-to-Poki-Game via Structured Output FragmentSchema + E2B deploy",
            responses: { 200: { description: "Playable fragment preview URL & usage ledger" } },
          },
        },
        "/api/openrouter/pkce/start": {
          post: {
            operationId: "startOpenRouterPkce",
            tags: ["OpenRouter AI"],
            summary: "Initiate 1-click OAuth PKCE S256 BYOK session with spend cap",
            responses: { 200: { description: "PKCE code_challenge & authorization URL" } },
          },
        },
        "/api/agent-protocol/v1/agent/tasks": {
          post: {
            operationId: "createAgentProtocolTask",
            tags: ["Agent Protocol v1"],
            summary: "Standardized OpenAPI v3 Agent Protocol task creation & step execution",
            responses: { 200: { description: "Agent Protocol Task with steps & artifacts" } },
          },
        },
        "/api/openrouter/stream": {
          post: {
            operationId: "streamOpenRouterChat",
            tags: ["Vercel AI Stream"],
            summary: "Real-time SSE Data Stream (`text-delta` + `finish`) mediated across Poki Sandbox",
            responses: { 200: { description: "text/event-stream chunk stream" } },
          },
        },
        "/api/agentops/dashboard": {
          get: {
            operationId: "getAgentOpsDashboard",
            tags: ["AgentOps & Helicone"],
            summary: "Inspect Trace->Span Replay Graph, Helicone Cache Hit Rate, P50/P95 Latency & Chidori Rules",
            responses: { 200: { description: "Full AgentOps observability snapshot" } },
          },
        },
        "/api/agentops/context-capsule": {
          get: {
            operationId: "getSidContextCapsule",
            tags: ["AgentOps & Helicone"],
            summary: "SID 1-Click Unified Context Capsule (Manifest + POS Z-Report + E2B + OpenRouter)",
            responses: { 200: { description: "Unified studio context capsule" } },
          },
        },
        "/api/openrouter/audio/speech": {
          post: {
            operationId: "speakOpenRouterShoutcast",
            tags: ["OpenRouter Multimodal v7"],
            summary: "OpenRouter Audio Speech TTS (`/api/v1/audio/speech`) for KOL Live voice shoutcasting with NĐ 147 moderation",
            responses: { 200: { description: "Web Audio playable WAV/MP3 base64 + X-Generation-Id" } },
          },
        },
        "/api/openrouter/images/generate": {
          post: {
            operationId: "generateOpenRouterSprite",
            tags: ["OpenRouter Multimodal v7"],
            summary: "OpenRouter Dedicated Image API (`/api/v1/images`) for R2-safe transparent sprites & 9:16 TikTok Live posters",
            responses: { 200: { description: "Generated sprite/poster b64_json & R2 budget verification" } },
          },
        },
        "/api/openrouter/kol-keys": {
          get: {
            operationId: "listOpenRouterKolKeys",
            tags: ["OpenRouter Multimodal v7"],
            summary: "List provisioned per-KOL sub-keys & daily/monthly spend caps (`/api/v1/keys`)",
            responses: { 200: { description: "KOL fleet sub-keys list" } },
          },
          post: {
            operationId: "createOpenRouterKolKey",
            tags: ["OpenRouter Multimodal v7"],
            summary: "Provision isolated per-KOL OpenRouter sub-key with daily/monthly reset & BYOK cap",
            responses: { 201: { description: "Provisioned KOL sub-key & hash" } },
          },
        },
      },
    };
  }

  parseSpec(rawSpec) {
    const spec = removeCircularReferences(rawSpec || this.getOpenAPISpec());
    const endpoints = [];
    const paths = spec.paths || {};
    const methods = ["get", "post", "put", "patch", "delete"];

    for (const [routePath, pathObj] of Object.entries(paths)) {
      if (!pathObj || typeof pathObj !== "object") continue;
      for (const method of methods) {
        const op = pathObj[method];
        if (!op) continue;
        const hasOpSecurity = Array.isArray(op.security)
          ? op.security.length > 0
          : Array.isArray(spec.security) && spec.security.length > 0;
        endpoints.push({
          method: method.toUpperCase(),
          path: routePath,
          operationId:
            op.operationId ||
            `${method}_${routePath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
          summary: op.summary || "",
          tags: op.tags || ["Default"],
          requiresAuth: hasOpSecurity,
          parameters: op.parameters || [],
        });
      }
    }

    const securitySchemes = spec.components?.securitySchemes || {};
    const schemas = Object.keys(spec.components?.schemas || {});

    return {
      ok: true,
      info: spec.info || { title: "Untitled API", version: "1.0.0" },
      servers: spec.servers || [],
      requiresAuth: Object.keys(securitySchemes).length > 0,
      securitySchemes,
      schemas,
      endpointCount: endpoints.length,
      endpoints,
    };
  }

  // ==========================================================================
  // 2. MOCK SERVER & `sk_live_...` AUTH KEY MANAGER (`mock-manager.ts`)
  // ==========================================================================

  startMockServer(specId = "game9k-portal", customSpec = null) {
    const normalizedId = String(specId || "game9k-portal");
    const existing = this.state.mocks.get(normalizedId);
    if (existing && existing.running) {
      return {
        ok: true,
        alreadyRunning: true,
        mock: {
          ...existing,
          maskedApiKey: maskApiKey(existing.apiKey),
        },
      };
    }

    const spec = customSpec || this.getOpenAPISpec();
    const parsed = this.parseSpec(spec);
    const apiKey = parsed.requiresAuth ? generateApiKey() : null;

    const mockSession = {
      specId: normalizedId,
      url: `/api/splice/mock/${encodeURIComponent(normalizedId)}`,
      running: true,
      requiresAuth: parsed.requiresAuth,
      authHeader: "x-g9k-api-key",
      apiKey,
      endpointCount: parsed.endpointCount,
      requestCount: 0,
      recentRequests: [],
      startedAt: new Date().toISOString(),
    };

    this.state.mocks.set(normalizedId, mockSession);
    if (apiKey) {
      this.state.apiKeys.set(apiKey, normalizedId);
    }

    return {
      ok: true,
      mock: {
        ...mockSession,
        maskedApiKey: apiKey ? maskApiKey(apiKey) : null,
      },
    };
  }

  stopMockServer(specId = "game9k-portal") {
    const normalizedId = String(specId || "game9k-portal");
    const existing = this.state.mocks.get(normalizedId);
    if (!existing) {
      return { ok: true, stopped: false, message: "Mock server was not active." };
    }
    if (existing.apiKey) {
      this.state.apiKeys.delete(existing.apiKey);
    }
    this.state.mocks.delete(normalizedId);
    return {
      ok: true,
      stopped: true,
      specId: normalizedId,
      cleanedApiKey: existing.apiKey ? maskApiKey(existing.apiKey) : null,
    };
  }

  listMockServers() {
    return Array.from(this.state.mocks.values()).map((m) => ({
      ...m,
      maskedApiKey: m.apiKey ? maskApiKey(m.apiKey) : null,
    }));
  }

  executeMockRequest(specId, { method = "GET", path = "/api/health", headers = {}, body = null } = {}) {
    const session = this.state.mocks.get(String(specId || "game9k-portal"));
    if (!session || !session.running) {
      return {
        ok: false,
        status: 404,
        error: `Mock server "${specId}" is not running. Start it first via POST /api/splice/mock-servers.`,
      };
    }

    const lowerHeaders = {};
    for (const [k, v] of Object.entries(headers || {})) {
      lowerHeaders[k.toLowerCase()] = String(v);
    }

    const bearer = (lowerHeaders.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const providedKey = lowerHeaders["x-g9k-api-key"] || bearer;

    // Enforce `sk_live_...` auth on protected routes
    const isPublicHealth = path === "/api/health";
    if (session.requiresAuth && !isPublicHealth) {
      if (!providedKey || providedKey !== session.apiKey) {
        return {
          ok: false,
          status: 401,
          error:
            "Unauthorized Mock Request: Missing or invalid `sk_live_...` API key. Enable Auto-Inject Key in Splice Explorer.",
          expectedFormat: "sk_live_<32_chars>",
        };
      }
    }

    session.requestCount += 1;
    const hit = {
      id: `req_${randomBytes(3).toString("hex")}`,
      method: String(method).toUpperCase(),
      path,
      authenticated: Boolean(providedKey && providedKey === session.apiKey),
      timestamp: new Date().toISOString(),
    };
    session.recentRequests.unshift(hit);
    if (session.recentRequests.length > 20) session.recentRequests.pop();

    return {
      ok: true,
      status: 200,
      mocked: true,
      specId: session.specId,
      authenticatedWith: providedKey ? maskApiKey(providedKey) : "public",
      request: hit,
      data: {
        message: `Splice Mock Response for ${hit.method} ${path}`,
        portalSdk: "PokiSDK + Game9K v3.0",
        sandboxEcho: body || null,
        serverTime: hit.timestamp,
      },
    };
  }

  // ==========================================================================
  // 3. SPEC-TO-SDK GENERATOR & ENHANCER (`sdk-generator.ts` + `sdk-enhancer.ts`)
  // ==========================================================================

  validateConfig(config = {}) {
    const errors = [];
    const packageName = String(config.packageName || "").trim();
    const packageVersion = String(config.packageVersion || "").trim();
    const language = String(config.language || "typescript").toLowerCase();

    if (!packageName || !/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(packageName)) {
      errors.push({
        field: "packageName",
        message: "Package name must be a valid npm identifier (e.g. `@game9k/dino-race-sdk`).",
      });
    }
    if (!packageVersion || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(packageVersion)) {
      errors.push({
        field: "packageVersion",
        message: "Package version must follow semver (e.g. `3.0.0`).",
      });
    }
    if (!["typescript", "javascript"].includes(language)) {
      errors.push({
        field: "language",
        message: "Supported languages: `typescript` or `javascript`.",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  generateSDK(config = {}, customSpec = null, gameManifest = null) {
    const normalizedConfig = {
      packageName: config.packageName || "@game9k/portal-studio-sdk",
      packageVersion: config.packageVersion || "3.0.0",
      gameId: config.gameId || gameManifest?.id || "dino-race",
      author: config.author || "Game9K Studio",
      description:
        config.description ||
        "Type-safe Poki Portal + Xsolla SDK 3 + POS/KDS Live-Ops Client generated by Game9K Splice",
      language: config.language || "typescript",
    };

    const validation = this.validateConfig(normalizedConfig);
    if (!validation.valid) {
      return {
        ok: false,
        success: false,
        errors: validation.errors,
        error: validation.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
      };
    }

    const generationId = `gen_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    const spec = customSpec || this.getOpenAPISpec();
    const parsed = this.parseSpec(spec);
    const envPrefix = normalizedConfig.packageName
      .toUpperCase()
      .replace(/^@/, "")
      .replace(/[^A-Z0-9]+/g, "_");

    const giftUnion = Array.isArray(gameManifest?.kol?.giftMapping)
      ? gameManifest.kol.giftMapping.map((g) => `"${g.tier}"`).join(" | ")
      : `"rose" | "banana" | "boost" | "meteor" | "crown"`;

    const files = {
      "package.json": JSON.stringify(
        {
          name: normalizedConfig.packageName,
          version: normalizedConfig.packageVersion,
          description: normalizedConfig.description,
          type: "module",
          main: "./dist/client.js",
          types: "./dist/client.d.ts",
          scripts: {
            build: "tsc -p tsconfig.json",
          },
          keywords: ["game9k", "poki-sdk", "xsolla-sdk-3", "splice-openapi", "pos-kds"],
          author: normalizedConfig.author,
          license: "MIT",
        },
        null,
        2
      ),
      "src/types.ts": `/**
 * Auto-generated by Game9K Splice Spec-to-SDK Generator
 * Spec: ${parsed.info.title} v${parsed.info.version}
 * Target Game: ${normalizedConfig.gameId}
 */

export type GiftTier = ${giftUnion};
export type KdsStation = "boost" | "sabotage" | "cosmetic" | "vip" | "stream_gift";
export type KdsSlaState = "on_time" | "watch" | "late";
export type StockStatus = "untracked" | "ok" | "low" | "out";

export interface SDKClientConfig {
  baseUrl?: string;
  apiKey?: string; // Format: sk_live_<32_chars>
  xsollaToken?: string; // Format: xl3.*
  timeoutMs?: number;
  maxRetries?: number;
}

export interface PosQuoteRequest {
  sku: string;
  quantity?: number;
  couponCode?: string;
  managerApproved?: boolean;
}

export interface PosQuoteResponse {
  ok: boolean;
  sku: string;
  stockRemaining: number;
  stockStatus: StockStatus;
  appliedCoupon: string | null;
  totals: {
    subtotalCents: number;
    happyHourCents: number;
    couponCents: number;
    discountCents: number;
    netCents: number;
    taxCents: number;
    totalDueCents: number;
    studioNetCents: number;
  };
}
`,
      "src/auth/credentials.ts": `/**
 * Splice Credential Provider & Key Masking
 */
export function isValidStudioKey(key: string): boolean {
  return /^sk_live_[A-Za-z0-9_-]{32}$/.test(key);
}

export function maskApiKey(key?: string): string {
  if (!key || key.length < 16) return "****";
  return \`\${key.slice(0, 12)}...\${key.slice(-4)}\`;
}
`,
      "src/http/interceptors.ts": `/**
 * Enhanced HTTP Interceptor Pipeline (Auth Injection + Retry Backoff)
 */
export type RequestInterceptor = (
  url: string,
  init: RequestInit
) => Promise<[string, RequestInit]> | [string, RequestInit];

export type ResponseInterceptor = (res: Response) => Promise<Response> | Response;

export function createAuthInterceptor(getCredentials: () => { apiKey?: string; bearer?: string }): RequestInterceptor {
  return (url, init) => {
    const creds = getCredentials();
    const headers = new Headers(init.headers || {});
    if (creds.apiKey) headers.set("x-g9k-api-key", creds.apiKey);
    if (creds.bearer) headers.set("Authorization", \`Bearer \${creds.bearer}\`);
    return [url, { ...init, headers }];
  };
}
`,
      "src/http/httpClient.ts": `import type { RequestInterceptor, ResponseInterceptor } from "./interceptors.js";

export class EnhancedHttpClient {
  private reqInterceptors: RequestInterceptor[] = [];
  private resInterceptors: ResponseInterceptor[] = [];

  constructor(
    private readonly baseUrl = "",
    private readonly maxRetries = 2
  ) {}

  useRequest(fn: RequestInterceptor): void {
    this.reqInterceptors.push(fn);
  }

  useResponse(fn: ResponseInterceptor): void {
    this.resInterceptors.push(fn);
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    let targetUrl = \`\${this.baseUrl}\${path}\`;
    let currentInit: RequestInit = {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    };

    for (const interceptor of this.reqInterceptors) {
      [targetUrl, currentInit] = await interceptor(targetUrl, currentInit);
    }

    let attempt = 0;
    while (true) {
      try {
        let res = await fetch(targetUrl, currentInit);
        for (const rInt of this.resInterceptors) {
          res = await rInt(res);
        }
        if (res.status >= 500 && attempt < this.maxRetries) {
          attempt++;
          await new Promise((r) => setTimeout(r, 150 * Math.pow(2, attempt)));
          continue;
        }
        return (await res.json()) as T;
      } catch (err) {
        if (attempt < this.maxRetries) {
          attempt++;
          await new Promise((r) => setTimeout(r, 150 * Math.pow(2, attempt)));
          continue;
        }
        throw err;
      }
    }
  }
}
`,
      "src/poki-portal-bridge.ts": `/**
 * Poki Portal SDK Sandbox Bridge (\`<iframe sandbox="allow-scripts">\` safe)
 * Mediates lifecycle, Xsolla 4-Step IAP, and POS/KDS actions via postMessage RPC.
 */
export class PokiPortalBridge {
  async init(): Promise<boolean> {
    const g = globalThis as Record<string, any>;
    if (g.PokiSDK?.init) return g.PokiSDK.init();
    return true;
  }

  gameplayStart(): void {
    (globalThis as Record<string, any>).PokiSDK?.gameplayStart?.();
  }

  gameplayStop(): void {
    (globalThis as Record<string, any>).PokiSDK?.gameplayStop?.();
  }

  happyTime(intensity = 0.8): void {
    (globalThis as Record<string, any>).PokiSDK?.happyTime?.(intensity);
  }

  async purchaseWithCoupon(sku: string, couponCode?: string): Promise<unknown> {
    const g = globalThis as Record<string, any>;
    return g.XsollaSDK?.purchaseProduct?.(sku, { couponCode });
  }
}
`,
      "src/client.ts": `import { EnhancedHttpClient } from "./http/httpClient.js";
import { createAuthInterceptor } from "./http/interceptors.js";
import { PokiPortalBridge } from "./poki-portal-bridge.js";
import type { SDKClientConfig, PosQuoteRequest, PosQuoteResponse } from "./types.js";

export class Game9KStudioClient {
  public readonly http: EnhancedHttpClient;
  public readonly poki: PokiPortalBridge;
  private apiKey?: string;
  private xsollaToken?: string;

  constructor(config: SDKClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.xsollaToken = config.xsollaToken;
    this.http = new EnhancedHttpClient(config.baseUrl || "", config.maxRetries ?? 2);
    this.poki = new PokiPortalBridge();
    this.http.useRequest(
      createAuthInterceptor(() => ({ apiKey: this.apiKey, bearer: this.xsollaToken }))
    );
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

${parsed.endpoints
  .map((ep) => {
    const hasBody = ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH";
    const pathExpr = ep.path.includes("{orderId}")
      ? "`/api/xsolla/orders/${encodeURIComponent(String((payload as any)?.orderId || ''))}/finalize`"
      : `"${ep.path}"`;
    return `  /** ${ep.method} ${ep.path} — ${ep.summary} */
  async ${ep.operationId}(${hasBody ? "payload: Record<string, unknown> = {}" : ""}): Promise<unknown> {
    return this.http.request(${pathExpr}, {
      method: "${ep.method}",${hasBody ? "\n      body: JSON.stringify(payload)," : ""}
    });
  }`;
  })
  .join("\n\n")}

  /** Typed helper for POS Stock + Happy Hour + Coupon Quote */
  async quoteCheckout(req: PosQuoteRequest): Promise<PosQuoteResponse> {
    return this.http.request<PosQuoteResponse>("/api/pos/quote", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }
}
`,
      ".env.example": `${envPrefix}_API_KEY=<YOUR_SPLICE_STUDIO_KEY>
${envPrefix}_BASE_URL=https://game9k-starter-kit.vercel.app
`,
      "README.md": `# ${normalizedConfig.packageName} v${normalizedConfig.packageVersion}

Auto-generated by **Game9K Splice Spec-to-SDK Engine** for **Poki Portal SDK v3.0**.

## Quickstart

\`\`\`ts
import { Game9KStudioClient } from "${normalizedConfig.packageName}";

const sdk = new Game9KStudioClient({
  apiKey: process.env.${envPrefix}_API_KEY,
});

await sdk.poki.init();
const quote = await sdk.quoteCheckout({ sku: "kol_meteor_pack_5", couponCode: "GAMER9K" });
console.log("Net due cents:", quote.totals.totalDueCents);
\`\`\`

## Included Modules
- \`src/client.ts\`: ${parsed.endpointCount} typed operations generated from OpenAPI 3.1.0
- \`src/poki-portal-bridge.ts\`: Zero-friction \`window.PokiSDK\` + \`window.XsollaSDK\` sandbox bridge
- \`src/http/interceptors.ts\`: Auto-injected \`sk_live_...\` headers & exponential retry backoff
`,
    };

    const progressStages = [
      { stage: "validating", progress: 20, message: "Validated OpenAPI 3.1 & npm config" },
      { stage: "generating", progress: 60, message: `Generated ${parsed.endpointCount} typed operations` },
      { stage: "enhancing", progress: 90, message: "Injected HTTP interceptors, Poki bridge & auth maskers" },
      { stage: "complete", progress: 100, message: "SDK bundle ready" },
    ];

    const record = {
      generationId,
      createdAt: new Date().toISOString(),
      config: normalizedConfig,
      endpointCount: parsed.endpointCount,
      progress: progressStages[progressStages.length - 1],
      stages: progressStages,
      fileNames: Object.keys(files),
      files,
    };

    this.state.generations.set(generationId, record);

    return {
      ok: true,
      success: true,
      generationId,
      config: normalizedConfig,
      endpointCount: parsed.endpointCount,
      stages: progressStages,
      fileNames: record.fileNames,
      files,
    };
  }

  getGeneration(generationId) {
    const rec = this.state.generations.get(String(generationId));
    if (!rec) return { ok: false, status: 404, error: "Generation ID not found" };
    return { ok: true, ...rec };
  }
}
