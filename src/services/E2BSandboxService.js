/**
 * E2BSandboxService.js
 * Applies the 4 E2B ecosystem architectures into the Game9K Poki Portal SDK v4.0 platform:
 *   1. `e2b-dev/runtime` (`docs/ARCHITECTURE.md`):
 *      - Control Plane vs Data Plane separation, Pre-booted Template Snapshots, COW Filesystem/State Diffs,
 *        Pause / Checkpoint / Fork / Client-Proxy Auto-Resume, GCRA Pause Rate Limiter (`429 Retry-After`),
 *        In-Sandbox `envd` Freeze/Thaw lifecycle, and Audience-Scoped Volume Content JWTs (`aud` verification).
 *   2. `e2b-dev/code-interpreter`:
 *      - Stateful multi-cell JS/Math Sandbox Execution (`vm.createContext` with CPU timeout guard),
 *        `stdout`/`stderr` capture, `execution.text`, and built-in Chart Extractor (`emitChart` -> SVG + series).
 *   3. `lexuankhanh1612/fragments`:
 *      - `FragmentSchema` validation, Persona Templates (`poki-canvas-mini`, `kol-stream-overlay`, `code-interpreter-v1`),
 *        instant playable Web Fragment hosting (`/api/e2b/preview/:sandboxId`), and `MorphEditSchema`
 *        (`// ... existing code ...` token-efficient code patching).
 *   4. `e2b-dev/open-computer-use`:
 *      - `SandboxAgent` loop (`OBJECTIVE` -> `On the screen, I see` -> `THOUGHT` -> `ACTION`),
 *        semantic UI/Canvas grounding + `drawBigDot` coordinate markers, `click`/`double_click`/`right_click`/`type_text`/`send_key`,
 *        timeout keepalive (`set_timeout`), and live `pause` / `prompt` / `stop` controls.
 */

import vm from "node:vm";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const DEFAULT_TEMPLATES = [
  {
    templateId: "poki-canvas-mini",
    aliases: ["poki-mini", "game9k-html5"],
    name: "Poki HTML5 Instant Mini-Game",
    vcpu: 2,
    maxVcpu: 4,
    ramMb: 512,
    port: 3000,
    file: "index.html",
    lib: ["@game9k/poki-portal-sdk"],
    instructions:
      "Self-contained 60 FPS HTML5 Canvas mini-game pre-wired with window.PokiSDK lifecycle hooks.",
    baseFiles: {
      "index.html": `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<title>Poki Fragment Mini-Game</title>
<script src="/sdk/game9k-sdk.js"></script>
<style>
  body { margin:0; background:#04120e; color:#ecfdf5; font-family:system-ui,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; overflow:hidden; }
  canvas { border:1px solid rgba(52,211,153,0.4); border-radius:14px; background:#071f18; cursor:pointer; }
  .hud { font-size:12px; margin-bottom:8px; font-family:monospace; color:#fbbf24; }
</style>
</head>
<body>
  <div class="hud" id="hud">🦖 Nhấn vào khủng long để ghi điểm! Điểm: 0</div>
  <canvas id="c" width="360" height="200"></canvas>
  <script>
    window.PokiSDK?.init({ gameId: "fragment-mini", version: "4.0.0" });
    window.PokiSDK?.gameLoadingFinished();
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");
    let score = 0;
    let targetX = 160, targetY = 100;
    canvas.addEventListener("click", (e) => {
      window.PokiSDK?.gameplayStart();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (Math.hypot(x - targetX, y - targetY) < 42) {
        score += 10;
        if (score % 50 === 0) window.PokiSDK?.happyTime(0.8);
        targetX = 40 + Math.random() * 280;
        targetY = 40 + Math.random() * 120;
        document.getElementById("hud").textContent = "🦖 Điểm Fragment: " + score;
      }
    });
    function loop() {
      ctx.fillStyle = "#071f18";
      ctx.fillRect(0, 0, 360, 200);
      ctx.fillStyle = "rgba(52,211,153,0.22)";
      ctx.beginPath(); ctx.arc(targetX, targetY, 28, 0, Math.PI * 2); ctx.fill();
      ctx.font = "26px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🦖", targetX, targetY);
      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>`,
    },
  },
  {
    templateId: "code-interpreter-v1",
    aliases: ["python-data", "js-interpreter", "economy-notebook"],
    name: "E2B Stateful Code Interpreter & Chart Kernel",
    vcpu: 2,
    maxVcpu: 4,
    ramMb: 1024,
    port: null,
    file: "notebook.js",
    lib: ["math", "emitChart", "stats"],
    instructions:
      "Stateful multi-cell JavaScript/Math sandbox kernel with stdout/stderr capture and SVG chart extraction.",
    baseFiles: {
      "notebook.js": "// Stateful Game9K Economy & Physics Interpreter\nconst baseSpeed = 240;\nbaseSpeed;\n",
    },
  },
  {
    templateId: "kol-stream-overlay",
    aliases: ["obs-hud", "tiktok-fragment"],
    name: "KOL TikTok/YouTube Live Stream HUD Fragment",
    vcpu: 1,
    maxVcpu: 2,
    ramMb: 256,
    port: 3000,
    file: "index.html",
    lib: ["@game9k/tiktok-bridge"],
    instructions: "Transparent OBS / KOL Live overlay reactive to TikTokBridge gift & chat events.",
    baseFiles: {
      "index.html": `<!DOCTYPE html><html><body style="background:transparent;color:#fbbf24;font-family:sans-serif;"><h3>🔴 KOL Live Fragment Ready</h3></body></html>`,
    },
  },
];

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderChartSvg({ type = "bar", title = "Chart", labels = [], values = [] }) {
  const w = 360;
  const h = 160;
  const maxVal = Math.max(1, ...values.map((v) => Number(v) || 0));
  const barW = Math.max(16, Math.floor(260 / Math.max(1, values.length)) - 8);

  const shapes =
    type === "line"
      ? `<polyline fill="none" stroke="#34d399" stroke-width="3" points="${values
          .map((v, i) => {
            const x = 44 + i * Math.max(28, Math.floor(260 / Math.max(1, values.length - 1)));
            const y = 128 - Math.round(((Number(v) || 0) / maxVal) * 86);
            return `${x},${y}`;
          })
          .join(" ")}" />`
      : values
          .map((v, i) => {
            const bh = Math.max(4, Math.round(((Number(v) || 0) / maxVal) * 86));
            const x = 42 + i * (barW + 10);
            const y = 128 - bh;
            const lbl = escapeXml(labels[i] ?? `#${i + 1}`);
            return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="#10b981" />
                    <text x="${x + barW / 2}" y="144" font-size="9" fill="#94a3b8" text-anchor="middle">${lbl}</text>`;
          })
          .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" rx="12" fill="#090e1a" stroke="#1e293b"/>
    <text x="16" y="22" font-size="11" font-family="monospace" font-weight="bold" fill="#fbbf24">${escapeXml(
      title
    )}</text>
    <line x1="34" y1="128" x2="340" y2="128" stroke="#334155" stroke-width="1"/>
    ${shapes}
  </svg>`;
}

/**
 * Token-efficient Morph Lazy Edit Applier (`// ... existing code ...`)
 * Mirrors `morphEditSchema` from `lexuankhanh1612/fragments/lib/schema.ts`.
 */
export function applyMorphLazyEdit(originalContent, editSnippet) {
  const orig = String(originalContent ?? "");
  const rawEdit = String(editSnippet ?? "");
  const markerRegex = /^\s*(?:\/\/|\/\*|<!--|#)\s*\.\.\.\s*existing code\s*\.\.\.(?:\s*\*\/|\s*-->)?\s*$/gim;

  if (!markerRegex.test(rawEdit)) {
    // Direct full replacement if no lazy markers are present
    return { ok: true, content: rawEdit, mode: "full_replace" };
  }

  const chunks = rawEdit
    .split(/^\s*(?:\/\/|\/\*|<!--|#)\s*\.\.\.\s*existing code\s*\.\.\.(?:\s*\*\/|\s*-->)?\s*$/gim)
    .map((c) => c.replace(/^\n+|\n+$/g, ""))
    .filter((c) => c.length > 0);

  if (chunks.length === 0) {
    return { ok: true, content: orig, mode: "noop" };
  }

  let updated = orig;
  let appliedCount = 0;

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    // Try matching first and last context lines inside `updated`
    const firstLine = lines[0].trim();
    const lastLine = lines[lines.length - 1].trim();

    if (lines.length >= 2 && firstLine && lastLine) {
      const startIdx = updated.indexOf(firstLine);
      if (startIdx >= 0) {
        const afterStart = startIdx + firstLine.length;
        const endIdx = updated.indexOf(lastLine, afterStart);
        if (endIdx >= 0) {
          const lineStart = updated.lastIndexOf("\n", startIdx) + 1;
          const lineEndPos = updated.indexOf("\n", endIdx);
          const actualEnd = lineEndPos === -1 ? updated.length : lineEndPos;
          updated =
            updated.slice(0, lineStart) + chunk + updated.slice(actualEnd);
          appliedCount++;
          continue;
        }
      }
    }

    // Fallback: if firstLine matches, replace that single anchor line with the chunk
    if (firstLine && updated.includes(firstLine)) {
      const idx = updated.indexOf(firstLine);
      const lineStart = updated.lastIndexOf("\n", idx) + 1;
      const lineEndPos = updated.indexOf("\n", idx);
      const actualEnd = lineEndPos === -1 ? updated.length : lineEndPos;
      updated = updated.slice(0, lineStart) + chunk + updated.slice(actualEnd);
      appliedCount++;
    } else {
      // Append cleanly before </body> or at EOF
      if (updated.includes("</body>")) {
        updated = updated.replace("</body>", `${chunk}\n</body>`);
      } else {
        updated = `${updated}\n${chunk}`;
      }
      appliedCount++;
    }
  }

  return { ok: true, content: updated, mode: "morph_lazy_patch", appliedChunks: appliedCount };
}

export default class E2BSandboxService {
  constructor(options = {}) {
    this.domain = options.domain || process.env.E2B_DOMAIN || "game9k.portal";
    this.apiKey = options.apiKey || process.env.E2B_API_KEY || "";
    this.tokenSecret =
      options.tokenSecret || process.env.E2B_VOLUME_SECRET || "g9k_e2b_volume_jwt_2026";
    this.pauseLimitPerMinute = options.pauseLimitPerMinute ?? 6;

    this.templates = new Map();
    this.aliasCache = new Map();
    for (const tpl of DEFAULT_TEMPLATES) {
      this.templates.set(tpl.templateId, tpl);
      for (const alias of tpl.aliases || []) {
        this.aliasCache.set(alias, tpl.templateId);
      }
    }

    this.sandboxes = new Map(); // sandboxId -> sandbox state
    this.routingCatalog = new Map(); // sandboxId -> routing record (`client-proxy` style)
    this.snapshots = new Map(); // snapshotId -> COW diff snapshot
    this.pauseRateBuckets = new Map(); // sandboxId -> [timestamps]
    this.volumes = new Map(); // volumeId -> { volumeId, name, files: Map }
    this.events = []; // ClickHouse-style sandbox lifecycle event stream
  }

  _recordEvent(sandboxId, type, details = {}) {
    const evt = {
      id: `ev_${randomBytes(4).toString("hex")}`,
      sandboxId,
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    this.events.unshift(evt);
    if (this.events.length > 100) this.events.pop();
    return evt;
  }

  resolveTemplate(idOrAlias = "poki-canvas-mini") {
    const key = String(idOrAlias || "poki-canvas-mini").trim();
    if (this.templates.has(key)) return this.templates.get(key);
    const resolved = this.aliasCache.get(key);
    if (resolved && this.templates.has(resolved)) return this.templates.get(resolved);
    return this.templates.get("poki-canvas-mini");
  }

  listTemplates() {
    return Array.from(this.templates.values()).map(({ baseFiles, ...meta }) => ({
      ...meta,
      defaultFiles: Object.keys(baseFiles || {}),
    }));
  }

  // ==========================================================================
  // 1. E2B RUNTIME CONTROL PLANE & SNAPSHOT ORCHESTRATOR (`e2b-dev/runtime`)
  // ==========================================================================

  createSandbox(payload = {}) {
    const fromSnapshot = payload.snapshotId
      ? this.snapshots.get(String(payload.snapshotId))
      : null;

    const tpl = this.resolveTemplate(
      fromSnapshot?.templateId || payload.templateId || payload.template || "poki-canvas-mini"
    );

    const sandboxId = `sbx_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    const lifecycleId = randomUUID();
    const envdAccessToken = `envd_${randomBytes(12).toString("hex")}`;
    const allowPublicTraffic = payload.allowPublicTraffic !== false;
    const trafficAccessToken = allowPublicTraffic
      ? null
      : `trf_${randomBytes(12).toString("hex")}`;
    const timeoutMs = Math.max(5000, Math.min(3600_000, Number(payload.timeoutMs) || 600_000));
    const now = Date.now();

    // Copy-on-Write (COW) overlay seeded from base template + optional snapshot diff
    const cowFiles = new Map(Object.entries(tpl.baseFiles || {}));
    if (fromSnapshot?.cowDiff) {
      for (const [fPath, content] of Object.entries(fromSnapshot.cowDiff)) {
        cowFiles.set(fPath, content);
      }
    }

    const contexts = new Map();
    const defaultContextId = "ctx_default";
    contexts.set(defaultContextId, this._createVmContext(fromSnapshot?.vmVars || {}));

    const port = payload.port !== undefined ? payload.port : tpl.port;
    const host = port ? `${port}-${sandboxId}.${this.domain}` : null;

    const record = {
      sandboxId,
      templateId: tpl.templateId,
      templateName: tpl.name,
      lifecycleId,
      status: "running", // 'running' | 'paused' | 'killed'
      frozen: false, // `envd` cgroup freeze flag during pause
      vcpu: tpl.vcpu,
      ramMb: tpl.ramMb,
      port,
      host,
      previewUrl: `/api/e2b/preview/${sandboxId}`,
      allowPublicTraffic,
      envdAccessToken,
      trafficAccessToken,
      metadata: payload.metadata || {},
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + timeoutMs).toISOString(),
      timeoutMs,
      lastSnapshotId: fromSnapshot?.snapshotId || null,
      cowFiles,
      contexts,
      commandHistory: [],
      computerUse: {
        status: "idle",
        objective: "",
        messages: [],
        groundingDots: [],
        screenshots: [],
        stepCount: 0,
      },
    };

    this.sandboxes.set(sandboxId, record);
    this._publishRouting(record);
    this._recordEvent(sandboxId, "sandbox.created", {
      templateId: tpl.templateId,
      resumedFromSnapshot: fromSnapshot?.snapshotId || "base_template",
      lifecycleId,
    });

    return {
      ok: true,
      sandbox: this._serializeSandbox(record),
    };
  }

  _publishRouting(record) {
    if (record.status !== "running") {
      this.routingCatalog.delete(record.sandboxId);
      return;
    }
    this.routingCatalog.set(record.sandboxId, {
      sandboxId: record.sandboxId,
      lifecycleId: record.lifecycleId,
      nodeId: "orch-local-01",
      ingressPort: record.port || 49983,
      updatedAt: new Date().toISOString(),
    });
  }

  _serializeSandbox(rec, includeTokens = true) {
    return {
      sandboxId: rec.sandboxId,
      templateId: rec.templateId,
      templateName: rec.templateName,
      lifecycleId: rec.lifecycleId,
      status: rec.status,
      frozen: rec.frozen,
      envdFrozen: rec.frozen,
      vcpu: rec.vcpu,
      ramMb: rec.ramMb,
      port: rec.port,
      host: rec.host,
      previewUrl: rec.previewUrl,
      allowPublicTraffic: rec.allowPublicTraffic,
      ...(includeTokens
        ? {
            envdAccessToken: rec.envdAccessToken,
            trafficAccessToken: rec.trafficAccessToken,
          }
        : {}),
      metadata: rec.metadata,
      startedAt: rec.startedAt,
      expiresAt: rec.expiresAt,
      lastSnapshotId: rec.lastSnapshotId,
      snapshotId: rec.lastSnapshotId,
      files: Array.from(rec.cowFiles.keys()),
      routingActive: this.routingCatalog.has(rec.sandboxId),
    };
  }

  listSandboxes() {
    return Array.from(this.sandboxes.values()).map((r) => this._serializeSandbox(r, false));
  }

  getSandbox(sandboxId) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: `Sandbox "${sandboxId}" not found.` };
    return { ok: true, sandbox: this._serializeSandbox(rec) };
  }

  setSandboxTimeout(sandboxId, timeoutMs = 60_000) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: `Sandbox "${sandboxId}" not found.` };
    const clamped = Math.max(5000, Math.min(3600_000, Number(timeoutMs) || 60_000));
    rec.timeoutMs = clamped;
    rec.expiresAt = new Date(Date.now() + clamped).toISOString();
    return { ok: true, sandboxId: rec.sandboxId, expiresAt: rec.expiresAt };
  }

  /**
   * Pause Sandbox -> Captures COW diff + VM context variables into a Snapshot (`snap_...`),
   * enforces GCRA per-sandbox pause rate limit (`429` + `Retry-After`), freezes `envd`,
   * and deletes `sandbox:routing:{id}` (`MarkStopping`).
   */
  pauseSandbox(sandboxId) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: `Sandbox "${sandboxId}" not found.` };
    if (rec.status === "paused") {
      return {
        ok: true,
        alreadyPaused: true,
        snapshotId: rec.lastSnapshotId,
        sandbox: this._serializeSandbox(rec),
      };
    }

    // Per-sandbox GCRA pause rate limit check (`ARCHITECTURE.md` -> 429 + Retry-After)
    const now = Date.now();
    const history = (this.pauseRateBuckets.get(rec.sandboxId) || []).filter(
      (t) => now - t < 60_000
    );
    if (history.length >= this.pauseLimitPerMinute) {
      return {
        ok: false,
        status: 429,
        retryAfterSec: 10,
        error: `Sandbox pause rate limit exceeded (${this.pauseLimitPerMinute}/min). Retry after 10s.`,
      };
    }
    history.push(now);
    this.pauseRateBuckets.set(rec.sandboxId, history);

    rec.frozen = true;
    const snapshot = this._captureSnapshot(rec, "pause");
    rec.status = "paused";
    rec.lastSnapshotId = snapshot.snapshotId;
    this._publishRouting(rec); // Removes routing record (`MarkStopping`)
    this._recordEvent(rec.sandboxId, "sandbox.paused", { snapshotId: snapshot.snapshotId });

    return {
      ok: true,
      snapshotId: snapshot.snapshotId,
      snapshot: { snapshotId: snapshot.snapshotId, kind: snapshot.kind },
      dirtyFilesCount: Object.keys(snapshot.cowDiff).length,
      sandbox: this._serializeSandbox(rec),
    };
  }

  /**
   * Checkpoint Sandbox -> Captures a durable COW + memory snapshot while keeping sandbox running!
   */
  checkpointSandbox(sandboxId) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: `Sandbox "${sandboxId}" not found.` };
    const snapshot = this._captureSnapshot(rec, "checkpoint");
    rec.lastSnapshotId = snapshot.snapshotId;
    this._recordEvent(rec.sandboxId, "sandbox.checkpointed", {
      snapshotId: snapshot.snapshotId,
    });
    return {
      ok: true,
      snapshotId: snapshot.snapshotId,
      sandbox: this._serializeSandbox(rec),
    };
  }

  /**
   * Fork Sandbox -> Creates a brand-new sandbox restored from the source sandbox's live state!
   */
  forkSandbox(sandboxId, options = {}) {
    const chk = this.checkpointSandbox(sandboxId);
    if (!chk.ok) return chk;
    const created = this.createSandbox({
      ...options,
      snapshotId: chk.snapshotId,
      metadata: { forkedFrom: sandboxId, ...(options.metadata || {}) },
    });
    return {
      ...created,
      forkedFrom: sandboxId,
      sourceSnapshotId: chk.snapshotId,
    };
  }

  _captureSnapshot(rec, kind = "pause") {
    const tpl = this.resolveTemplate(rec.templateId);
    const baseFiles = tpl.baseFiles || {};
    const cowDiff = {};
    for (const [fPath, content] of rec.cowFiles.entries()) {
      if (baseFiles[fPath] !== content) {
        cowDiff[fPath] = content;
      }
    }

    // Capture serializable state from default interpreter context
    const vmVars = {};
    const defaultCtx = rec.contexts.get("ctx_default");
    if (defaultCtx) {
      for (const [k, v] of Object.entries(defaultCtx)) {
        if (k.startsWith("__") || typeof v === "function") continue;
        if (k === "console" || k === "Math" || k === "emitChart") continue;
        try {
          JSON.stringify(v);
          vmVars[k] = v;
        } catch {
          // Skip non-serializable handles
        }
      }
    }

    const snapshotId = `snap_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    const snap = {
      snapshotId,
      sandboxId: rec.sandboxId,
      templateId: rec.templateId,
      kind,
      vcpuCount: rec.vcpu,
      cowDiff,
      vmVars,
      createdAt: new Date().toISOString(),
    };
    this.snapshots.set(snapshotId, snap);
    return snap;
  }

  /**
   * Resume Sandbox (explicit OR automatic `client-proxy` wake on incoming preview/RPC traffic!)
   */
  resumeSandbox(sandboxId, { autoResumed = false } = {}) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: `Sandbox "${sandboxId}" not found.` };
    if (rec.status === "killed") {
      return { ok: false, status: 410, error: `Sandbox "${sandboxId}" was killed.` };
    }
    const wasPaused = rec.status === "paused";
    rec.status = "running";
    rec.frozen = false;
    rec.lifecycleId = wasPaused ? randomUUID() : rec.lifecycleId;
    rec.expiresAt = new Date(Date.now() + rec.timeoutMs).toISOString();
    this._publishRouting(rec);

    if (wasPaused) {
      this._recordEvent(rec.sandboxId, autoResumed ? "sandbox.auto_resumed" : "sandbox.resumed", {
        snapshotId: rec.lastSnapshotId,
        lifecycleId: rec.lifecycleId,
      });
    }

    return {
      ok: true,
      wasPaused,
      autoResumed,
      sandbox: this._serializeSandbox(rec),
    };
  }

  killSandbox(sandboxId) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: `Sandbox "${sandboxId}" not found.` };
    rec.status = "killed";
    rec.frozen = true;
    this._publishRouting(rec);
    this._recordEvent(rec.sandboxId, "sandbox.killed", {});
    return { ok: true, killed: true, sandboxId: rec.sandboxId };
  }

  // ==========================================================================
  // 1B. PERSISTENT VOLUMES & AUDIENCE-SCOPED VOLUME CONTENT JWT (`belt`)
  // ==========================================================================

  createVolume(name = "studio-assets") {
    const volumeId = `vol_${randomBytes(5).toString("hex")}`;
    const vol = {
      volumeId,
      name: String(name || "studio-assets"),
      createdAt: new Date().toISOString(),
      files: new Map(),
    };
    this.volumes.set(volumeId, vol);
    const tokenInfo = this.mintVolumeToken(volumeId);
    return {
      ok: true,
      volumeId,
      name: vol.name,
      volume: { volumeId, name: vol.name, createdAt: vol.createdAt },
      token: tokenInfo.token,
      contentToken: tokenInfo.token,
      domain: tokenInfo.domain,
      audience: tokenInfo.audience,
      expectedAud: tokenInfo.audience,
    };
  }

  mintVolumeToken(volumeId, customDomain = null) {
    const targetDomain = customDomain || `api.${this.domain}`;
    const audience = `https://${targetDomain}`;
    const payloadB64 = Buffer.from(
      JSON.stringify({
        sub: volumeId,
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const sig = createHmac("sha256", this.tokenSecret)
      .update(payloadB64)
      .digest("base64url");
    return {
      token: `vct.${payloadB64}.${sig}`,
      domain: customDomain || undefined,
      audience,
    };
  }

  verifyVolumeToken(token, expectedVolumeId, requestDomain = null) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || parts[0] !== "vct") {
      return { ok: false, status: 401, error: "Malformed volume content token" };
    }
    const expectedSig = createHmac("sha256", this.tokenSecret)
      .update(parts[1])
      .digest("base64url");
    if (parts[2] !== expectedSig) {
      return { ok: false, status: 403, error: "Invalid volume token signature" };
    }
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (claims.sub !== expectedVolumeId) {
      return { ok: false, status: 403, error: "Volume token subject mismatch" };
    }
    const expectedAud = `https://${requestDomain || `api.${this.domain}`}`;
    if (claims.aud !== expectedAud) {
      return {
        ok: false,
        status: 403,
        error: `Volume token audience mismatch: got ${claims.aud}, expected ${expectedAud}`,
      };
    }
    return { ok: true, claims };
  }

  writeVolumeFile(volumeId, filePath, content, bearerToken, requestDomain = null) {
    const vol = this.volumes.get(String(volumeId));
    if (!vol) return { ok: false, status: 404, error: "Volume not found" };
    const auth = this.verifyVolumeToken(bearerToken, volumeId, requestDomain);
    if (!auth.ok) return auth;
    vol.files.set(String(filePath), String(content ?? ""));
    return { ok: true, volumeId, path: filePath, sizeBytes: Buffer.byteLength(String(content ?? "")) };
  }

  readVolumeFile(volumeId, filePath, bearerToken, requestDomain = null) {
    const vol = this.volumes.get(String(volumeId));
    if (!vol) return { ok: false, status: 404, error: "Volume not found" };
    const auth = this.verifyVolumeToken(bearerToken, volumeId, requestDomain);
    if (!auth.ok) return auth;
    if (!vol.files.has(String(filePath))) {
      return { ok: false, status: 404, error: "File not found in volume" };
    }
    return { ok: true, volumeId, path: filePath, content: vol.files.get(String(filePath)) };
  }

  // ==========================================================================
  // 2. STATEFUL CODE INTERPRETER & CHART EXTRACTOR (`e2b-dev/code-interpreter`)
  // ==========================================================================

  _createVmContext(seedVars = {}) {
    const base = {
      Math,
      Date,
      JSON,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Map,
      Set,
      ...seedVars,
    };
    return vm.createContext(base);
  }

  runCode(sandboxId, code, options = {}) {
    let rec = sandboxId ? this.sandboxes.get(String(sandboxId)) : null;
    if (!rec) {
      const created = this.createSandbox({ templateId: "code-interpreter-v1" });
      rec = this.sandboxes.get(created.sandbox.sandboxId);
    }

    // `envd` behavior from ARCHITECTURE.md: refuse process starts while frozen/paused unless autoResume enabled
    if (rec.frozen && options.autoResume === false) {
      return {
        ok: false,
        status: 409,
        error: "Sandbox workload cgroups are frozen (paused). Resume sandbox first.",
      };
    }
    if (rec.status === "paused") {
      this.resumeSandbox(rec.sandboxId, { autoResumed: true });
    }

    const contextId = String(options.contextId || "ctx_default");
    if (!rec.contexts.has(contextId)) {
      rec.contexts.set(contextId, this._createVmContext());
    }
    const ctx = rec.contexts.get(contextId);

    const stdout = [];
    const stderr = [];
    const results = [];

    ctx.console = {
      log: (...args) => stdout.push(args.map((a) => String(a)).join(" ")),
      info: (...args) => stdout.push(args.map((a) => String(a)).join(" ")),
      warn: (...args) => stderr.push(args.map((a) => String(a)).join(" ")),
      error: (...args) => stderr.push(args.map((a) => String(a)).join(" ")),
    };

    ctx.emitChart = (chartSpec = {}) => {
      const pts = Array.isArray(chartSpec.points) ? chartSpec.points : [];
      const normalized = {
        type: chartSpec.type || "bar",
        title: chartSpec.title || "Game9K Sandbox Chart",
        labels: Array.isArray(chartSpec.labels)
          ? chartSpec.labels
          : pts.map((p, i) => String(p?.label ?? `#${i + 1}`)),
        values: Array.isArray(chartSpec.values)
          ? chartSpec.values
          : pts.map((p) => Number(p?.value ?? 0)),
      };
      const svg = renderChartSvg(normalized);
      results.push({
        type: "chart",
        chart: normalized,
        svg,
      });
      return normalized;
    };

    let text = undefined;
    let runtimeError = null;

    try {
      const val = vm.runInContext(String(code || ""), ctx, {
        timeout: Math.min(2000, Number(options.timeoutMs) || 500),
        displayErrors: true,
      });
      if (val !== undefined) {
        text = typeof val === "object" ? JSON.stringify(val) : String(val);
        results.unshift({ type: "text", text });
      }
    } catch (err) {
      runtimeError = {
        name: err?.name || "ExecutionError",
        value: err?.message || String(err),
        traceback: err?.stack || "",
      };
    }

    return {
      ok: runtimeError === null,
      sandboxId: rec.sandboxId,
      contextId,
      text: text ?? null,
      logs: {
        stdout,
        stderr,
      },
      results,
      error: runtimeError,
    };
  }

  // ==========================================================================
  // 3. FRAGMENTS ARTIFACT ENGINE & MORPH LAZY EDITS (`lexuankhanh1612/fragments`)
  // ==========================================================================

  validateFragment(fragment = {}) {
    const errors = [];
    if (!fragment || typeof fragment !== "object") {
      return { valid: false, errors: ["Fragment payload must be an object"] };
    }
    if (!fragment.template || typeof fragment.template !== "string") {
      errors.push("`template` is required");
    }
    if (!fragment.file_path || typeof fragment.file_path !== "string") {
      errors.push("`file_path` is required");
    }
    if (typeof fragment.code !== "string") {
      errors.push("`code` must be a runnable string");
    }
    return { valid: errors.length === 0, errors };
  }

  deployFragment(payload = {}) {
    const fragment = payload.fragment || payload;
    const validation = this.validateFragment(fragment);
    if (!validation.valid) {
      return { ok: false, status: 400, errors: validation.errors, error: validation.errors.join("; ") };
    }

    const created = this.createSandbox({
      templateId: fragment.template,
      port: fragment.port ?? 3000,
      metadata: {
        title: fragment.title || "Untitled Fragment",
        description: fragment.description || "",
        userId: payload.userID || "guest",
      },
    });
    const sbxId = created.sandbox.sandboxId;
    const rec = this.sandboxes.get(sbxId);

    if (fragment.has_additional_dependencies && fragment.install_dependencies_command) {
      rec.commandHistory.push({
        command: fragment.install_dependencies_command,
        exitCode: 0,
        timestamp: new Date().toISOString(),
      });
    }

    rec.cowFiles.set(fragment.file_path, fragment.code);

    if (rec.templateId === "code-interpreter-v1") {
      const execRes = this.runCode(sbxId, fragment.code);
      return {
        ok: true,
        kind: "interpreter",
        sbxId,
        template: rec.templateId,
        stdout: execRes.logs.stdout,
        stderr: execRes.logs.stderr,
        text: execRes.text,
        runtimeError: execRes.error,
        cellResults: execRes.results,
      };
    }

    return {
      ok: true,
      kind: "web",
      sbxId,
      template: rec.templateId,
      title: fragment.title || "Poki Fragment",
      filePath: fragment.file_path,
      url: `/api/e2b/preview/${sbxId}`,
      hostUrl: `https://${rec.host}`,
    };
  }

  writeSandboxFile(sandboxId, filePath, content) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: "Sandbox not found" };
    if (rec.status === "paused") this.resumeSandbox(rec.sandboxId, { autoResumed: true });
    rec.cowFiles.set(String(filePath), String(content ?? ""));
    return { ok: true, sandboxId: rec.sandboxId, filePath, files: Array.from(rec.cowFiles.keys()) };
  }

  readSandboxFile(sandboxId, filePath = "index.html") {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: "Sandbox not found" };
    // Client-proxy style auto-resume when incoming preview/file read hits a paused sandbox!
    const wasPaused = rec.status === "paused";
    if (wasPaused) {
      this.resumeSandbox(rec.sandboxId, { autoResumed: true });
    }
    const content = rec.cowFiles.get(String(filePath));
    if (content === undefined) {
      return { ok: false, status: 404, error: `File "${filePath}" not found in sandbox` };
    }
    return { ok: true, sandboxId: rec.sandboxId, filePath, autoResumed: wasPaused, content };
  }

  applyMorphEdit(sandboxId, morphPayload = {}) {
    const rec = this.sandboxes.get(String(sandboxId));
    if (!rec) return { ok: false, status: 404, error: "Sandbox not found" };
    if (rec.status === "paused") this.resumeSandbox(rec.sandboxId, { autoResumed: true });

    const filePath = String(morphPayload.file_path || "index.html");
    const existing = rec.cowFiles.get(filePath) || "";
    const patched = applyMorphLazyEdit(existing, morphPayload.edit || "");
    rec.cowFiles.set(filePath, patched.content);

    this._recordEvent(rec.sandboxId, "fragment.morph_edited", {
      filePath,
      instruction: morphPayload.instruction || "",
      mode: patched.mode,
    });

    return {
      ok: true,
      sandboxId: rec.sandboxId,
      filePath,
      mode: patched.mode,
      instruction: morphPayload.instruction || "",
      content: patched.content,
      previewUrl: `/api/e2b/preview/${rec.sandboxId}`,
    };
  }

  // ==========================================================================
  // 4. OPEN COMPUTER USE AGENT (`e2b-dev/open-computer-use`)
  // ==========================================================================

  groundElementQuery(query = "", uiElements = [], viewport = { width: 360, height: 220 }) {
    const q = String(query || "").toLowerCase().trim();

    // 1. Match explicit bounding boxes supplied by in-game HUD/Canvas inspector
    for (const el of uiElements) {
      const label = String(el.label || el.id || "").toLowerCase();
      if (label && (label.includes(q) || q.includes(label))) {
        return {
          x: Math.round(el.x),
          y: Math.round(el.y),
          matchedLabel: el.label || el.id,
          confidence: 0.96,
        };
      }
    }

    // 2. Built-in semantic grounding map for Game9K / Dino Race / Poki HUD layouts
    const w = Number(viewport.width) || 360;
    const h = Number(viewport.height) || 220;
    const presets = [
      { match: ["lane 1", "làn 1", "croc", "#1"], rx: 0.25, ry: 0.28, label: "Lane 1 (Crocodilia)" },
      { match: ["lane 2", "làn 2", "raptor", "#2"], rx: 0.25, ry: 0.46, label: "Lane 2 (Velociraptor)" },
      { match: ["lane 3", "làn 3", "rex", "#3"], rx: 0.25, ry: 0.64, label: "Lane 3 (Tyrannosaurus)" },
      { match: ["lane 4", "làn 4", "trike", "#4"], rx: 0.25, ry: 0.82, label: "Lane 4 (Triceratops)" },
      { match: ["boost", "bứt tốc", "roar", "space"], rx: 0.82, ry: 0.82, label: "Primal Roar Boost Button" },
      { match: ["store", "shop", "cửa hàng", "xsolla"], rx: 0.88, ry: 0.14, label: "Xsolla Storefront Button" },
      { match: ["start", "play", "đua", "target", "dino"], rx: 0.5, ry: 0.5, label: "Center Play Target" },
    ];

    for (const p of presets) {
      if (p.match.some((m) => q.includes(m))) {
        return {
          x: Math.round(w * p.rx),
          y: Math.round(h * p.ry),
          matchedLabel: p.label,
          confidence: 0.91,
        };
      }
    }

    return {
      x: Math.round(w * 0.5),
      y: Math.round(h * 0.5),
      matchedLabel: query || "Viewport Center",
      confidence: 0.72,
    };
  }

  stepComputerUseAgent(sandboxId, payload = {}) {
    let rec = sandboxId ? this.sandboxes.get(String(sandboxId)) : null;
    if (!rec) {
      const created = this.createSandbox({ templateId: "poki-canvas-mini" });
      rec = this.sandboxes.get(created.sandbox.sandboxId);
    }

    // Keep sandbox alive on every agent turn (`self.sandbox.set_timeout(60)` in `sandbox_agent.py`)
    this.setSandboxTimeout(rec.sandboxId, 60_000);

    const cu = rec.computerUse;
    if (payload.control === "pause") {
      cu.status = "paused";
      return { ok: true, sandboxId: rec.sandboxId, status: cu.status, messages: cu.messages };
    }
    if (payload.control === "stop") {
      cu.status = "completed";
      return { ok: true, sandboxId: rec.sandboxId, status: cu.status, messages: cu.messages };
    }

    const instruction = String(
      payload.instruction || cu.objective || "Click play target and trigger boost"
    );
    cu.objective = instruction;
    cu.status = "running";
    cu.stepCount += 1;

    if (payload.screenshotDataUrl) {
      cu.screenshots.unshift({
        id: `screenshot_${cu.stepCount}.png`,
        capturedAt: new Date().toISOString(),
        sizeBytes: String(payload.screenshotDataUrl).length,
      });
      if (cu.screenshots.length > 10) cu.screenshots.pop();
    }

    const actionType = payload.action || "click";
    const targetQuery = payload.query || instruction;
    const grounded = this.groundElementQuery(
      targetQuery,
      payload.uiElements || [],
      payload.viewport || { width: 360, height: 200 }
    );

    let toolCall = null;
    if (actionType === "type_text") {
      toolCall = {
        name: "type_text",
        parameters: {
          text: payload.text || "1",
          chunkSize: 50,
          delayMs: 12,
        },
      };
    } else if (actionType === "send_key") {
      toolCall = {
        name: "send_key",
        parameters: { name: payload.key || "Space" },
      };
    } else {
      toolCall = {
        name: actionType, // 'click' | 'double_click' | 'right_click'
        parameters: {
          query: targetQuery,
          x: grounded.x,
          y: grounded.y,
        },
      };
      cu.groundingDots.unshift({
        step: cu.stepCount,
        x: grounded.x,
        y: grounded.y,
        label: grounded.matchedLabel,
        timestamp: new Date().toISOString(),
      });
      if (cu.groundingDots.length > 15) cu.groundingDots.pop();
    }

    const visionReport =
      `The objective is: ${instruction}\n` +
      `On the screen, I see: Poki Sandbox viewport with ${grounded.matchedLabel} at (${grounded.x}, ${grounded.y}).\n` +
      `This means the objective is: in_progress\n` +
      `The next step is to ${toolCall.name} (${grounded.matchedLabel}) to advance gameplay.`;

    const entry = {
      step: cu.stepCount,
      timestamp: new Date().toISOString(),
      thought: visionReport,
      toolCall,
      grounding: grounded,
    };
    cu.messages.unshift(entry);
    if (cu.messages.length > 25) cu.messages.pop();

    return {
      ok: true,
      sandboxId: rec.sandboxId,
      status: cu.status,
      step: entry,
      groundingDots: cu.groundingDots,
      screenshotsCount: cu.screenshots.length,
    };
  }
}
