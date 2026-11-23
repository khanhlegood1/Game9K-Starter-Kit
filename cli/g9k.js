#!/usr/bin/env node
/**
 * g9k.js
 * Deterministic Game9K Starter Kit CLI (inspired by lexuankhanh1612/chainplot).
 *
 * Commands:
 *   node cli/g9k.js capabilities [--json]
 *   node cli/g9k.js validate [--game <slug>] [--json]
 *   node cli/g9k.js build [--game <slug>] [--json]
 *   node cli/g9k.js verify [--json]
 *   node cli/g9k.js doctor [--json]
 *
 * With `--json`, returns structured envelope:
 *   `{ schema_version: 1, ok, command, data, warnings, error }`
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  validateGamePackage,
  sha256Hex,
  computeTreeSha256,
  listFilesDeterministic,
} from "../src/lib/manifestValidator.js";
import ProjectDecisionsService from "../src/services/ProjectDecisionsService.js";
import SpliceSpecService from "../src/services/SpliceSpecService.js";
import CloudEdgeLaunchService from "../src/services/CloudEdgeLaunchService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const PUBLIC_DIR = join(ROOT_DIR, "public");
const GAMES_DIR = join(PUBLIC_DIR, "games");
const DIST_DIR = join(ROOT_DIR, "dist");

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args.find((a) => !a.startsWith("-")) || "help";
  const json = args.includes("--json");
  let game = null;
  const gameIdx = args.indexOf("--game");
  if (gameIdx >= 0 && args[gameIdx + 1]) {
    game = args[gameIdx + 1];
  }
  return { command, json, game };
}

function emitResult({ json, ok, command, data = null, warnings = [], error = null }) {
  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          schema_version: 1,
          ok,
          command,
          data,
          warnings,
          error,
        },
        null,
        2
      ) + "\n"
    );
  } else if (ok) {
    console.log(`✅ [g9k ${command}] OK`);
    if (data) console.log(JSON.stringify(data, null, 2));
    for (const w of warnings) console.warn(`⚠️  ${w}`);
  } else {
    console.error(`❌ [g9k ${command}] FAILED: ${error?.message || "Unknown error"}`);
    if (data) console.error(JSON.stringify(data, null, 2));
  }
  process.exitCode = ok ? 0 : 1;
}

function discoverGames(filterSlug = null) {
  if (!existsSync(GAMES_DIR)) return [];
  return readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => !filterSlug || slug === filterSlug)
    .sort();
}

/**
 * Bundle `public/games/dino-race` ES modules + `game9k-sdk.js` into a single-file
 * portable HTML (`public/games/dino-race/standalone.html`) ready for zero-server R2 / offline play!
 */
function compileDinoRaceStandalone() {
  const dinoDir = join(GAMES_DIR, "dino-race");
  const indexHtmlPath = join(dinoDir, "index.html");
  if (!existsSync(indexHtmlPath)) return null;

  const sdkCode = readFileSync(join(PUBLIC_DIR, "sdk/game9k-sdk.js"), "utf8");
  const moduleOrder = [
    "js/config.js",
    "js/audio.js",
    "js/race-engine.js",
    "js/renderer.js",
    "js/main.js",
  ];

  const strippedModules = moduleOrder.map((relPath) => {
    const raw = readFileSync(join(dinoDir, relPath), "utf8");
    // Strip ESM import lines and `export ` keywords so modules combine cleanly inside an IIFE
    return raw
      .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
      .replace(/^\s*export\s+(class|function|const|let)\s+/gm, "$1 ");
  });

  const combinedScript = [
    "<script>",
    sdkCode,
    "</script>",
    "<script>",
    "(function () {",
    '"use strict";',
    ...strippedModules,
    "})();",
    "</script>",
  ].join("\n");

  const templateHtml = readFileSync(indexHtmlPath, "utf8");
  const standaloneHtml = templateHtml
    .replace(/<script src="\/socket\.io\/socket\.io\.js"[^>]*><\/script>\s*/g, "")
    .replace(/<script src="\/sdk\/game9k-sdk\.js"><\/script>\s*/g, "")
    .replace(/<script type="module" src="\.\/js\/main\.js"><\/script>/, () => combinedScript);

  const outPath = join(dinoDir, "standalone.html");
  writeFileSync(outPath, standaloneHtml, "utf8");

  const buf = Buffer.from(standaloneHtml, "utf8");
  const gz = gzipSync(buf, { level: 9 });

  return {
    path: "public/games/dino-race/standalone.html",
    rawKb: Number((buf.length / 1024).toFixed(2)),
    gzipKb: Number((gz.length / 1024).toFixed(2)),
    sha256: sha256Hex(buf),
  };
}

/**
 * Bundle the viewer-first Marble Race modules and the Game9K SDK into a
 * portable single-file HTML for OBS Browser Source and offline demos.
 */
function compileMarbleRaceStandalone() {
  const marbleDir = join(GAMES_DIR, "marble-race-live");
  const indexHtmlPath = join(marbleDir, "index.html");
  if (!existsSync(indexHtmlPath)) return null;

  const sdkCode = readFileSync(join(PUBLIC_DIR, "sdk/game9k-sdk.js"), "utf8");
  const moduleOrder = [
    "js/marble-engine.js",
    "js/renderer.js",
    "js/main.js",
  ];
  const strippedModules = moduleOrder.map((relPath) => {
    const raw = readFileSync(join(marbleDir, relPath), "utf8");
    return raw
      .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
      .replace(/^\s*export\s+(class|function|const|let)\s+/gm, "$1 ");
  });

  const combinedScript = [
    "<script>",
    sdkCode,
    "</script>",
    "<script>",
    "(function () {",
    '"use strict";',
    ...strippedModules,
    "})();",
    "</script>",
  ].join("\n");

  const templateHtml = readFileSync(indexHtmlPath, "utf8");
  const standaloneHtml = templateHtml
    .replace(/<script src="\/socket\.io\/socket\.io\.js"[^>]*><\/script>\s*/g, "")
    .replace(/<script src="\/sdk\/game9k-sdk\.js"><\/script>\s*/g, "")
    .replace(/<script type="module" src="\.\/js\/main\.js"><\/script>/, () => combinedScript);

  const outPath = join(marbleDir, "standalone.html");
  writeFileSync(outPath, standaloneHtml, "utf8");
  const buf = Buffer.from(standaloneHtml, "utf8");
  const gz = gzipSync(buf, { level: 9 });
  return {
    path: "public/games/marble-race-live/standalone.html",
    rawKb: Number((buf.length / 1024).toFixed(2)),
    gzipKb: Number((gz.length / 1024).toFixed(2)),
    sha256: sha256Hex(buf),
  };
}

function runCapabilities(opts) {
  emitResult({
    json: opts.json,
    ok: true,
    command: "capabilities",
    data: {
      cli: "g9k",
      version: "9.0.0",
      commands: ["capabilities", "validate", "build", "verify", "doctor", "decide", "codegen", "deploy"],
      sdk: {
        version: "9.0.0",
        standards: [
          "poki-portal-sdk",
          "xsolla-sdk-3",
          "splice-spec-to-sdk",
          "pos-kds-economy",
          "e2b-runtime-sandboxes",
          "e2b-code-interpreter",
          "e2b-fragments-morph",
          "open-computer-use",
          "openrouter-multi-model-pkce",
          "openrouter-audio-speech-tts",
          "openrouter-transparent-sprite-images",
          "openrouter-kol-fleet-subkeys",
          "openrouter-sticky-prompt-cache",
          "agent-protocol-v1",
          "vercel-ai-stream-bridge",
          "agentops-langfuse-replay",
          "helicone-sha256-prompt-cache",
          "chidori-reactive-event-bus",
          "sid-context-capsule",
          "steamship-hmac-webhooks",
          "cloudflare-r2-sigv4-publisher",
          "supabase-postgrest-dual-write",
          "solana-ed25519-milestone-vault",
          "arena-esports-brackets",
          "arena-anticheat-score-proofs",
          "arena-cross-game-battle-pass",
          "arena-creator-revshare-70-20-10",
          "nd147-under18-playtime-guard",
          "game9k-sandbox-bridge",
        ],
        xsolla_steps: [
          "01_authenticate",
          "02_load_catalog",
          "03_purchase_product",
          "04_finalize_purchase",
        ],
      },
      infrastructure: [
        "cloudflare-r2",
        "supabase-realtime-broadcast",
        "solana-milestones",
        "gemini-decisions-governance",
        "xsolla-paystation-4",
      ],
      live_platforms: ["tiktok-live", "youtube-live"],
      legal_modes: ["G1", "G2", "G3", "G4"],
      max_telemetry_hz: 20,
    },
  });
}

function runValidate(opts) {
  const slugs = discoverGames(opts.game);
  if (slugs.length === 0) {
    return emitResult({
      json: opts.json,
      ok: false,
      command: "validate",
      error: { code: "not_found", message: "No matching game packages found in public/games" },
    });
  }

  const reports = [];
  const allWarnings = [];
  let allOk = true;

  for (const slug of slugs) {
    const rep = validateGamePackage(join(GAMES_DIR, slug));
    if (!rep.ok) allOk = false;
    allWarnings.push(...rep.warnings.map((w) => `[${slug}] ${w}`));
    reports.push({
      slug,
      ok: rep.ok,
      legalClassification: rep.manifest?.legal_classification || null,
      metrics: rep.metrics,
      releaseSha256: rep.releaseSha256,
      errors: rep.errors,
    });
  }

  emitResult({
    json: opts.json,
    ok: allOk,
    command: "validate",
    data: { games: reports },
    warnings: allWarnings,
    error: allOk
      ? null
      : { code: "validation_failed", message: "One or more Game9K packages failed validation" },
  });
}

function runBuild(opts) {
  const standaloneBundles = [];
  if (!opts.game || opts.game === "dino-race") {
    const info = compileDinoRaceStandalone();
    if (info) standaloneBundles.push(info);
  }
  if (!opts.game || opts.game === "marble-race-live") {
    const info = compileMarbleRaceStandalone();
    if (info) standaloneBundles.push(info);
  }
  const standaloneInfo = standaloneBundles[0] || null;

  const slugs = discoverGames(opts.game);
  if (slugs.length === 0) {
    return emitResult({
      json: opts.json,
      ok: false,
      command: "build",
      error: { code: "not_found", message: "No game packages found to build" },
    });
  }

  rmSync(DIST_DIR, { recursive: true, force: true });
  mkdirSync(join(DIST_DIR, "sdk"), { recursive: true });
  mkdirSync(join(DIST_DIR, "games"), { recursive: true });

  // Copy official SDK into dist/sdk
  cpSync(join(PUBLIC_DIR, "sdk"), join(DIST_DIR, "sdk"), { recursive: true });

  const builtGames = [];
  const allWarnings = [];

  for (const slug of slugs) {
    const srcGameDir = join(GAMES_DIR, slug);
    const rep = validateGamePackage(srcGameDir);
    if (!rep.ok) {
      return emitResult({
        json: opts.json,
        ok: false,
        command: "build",
        data: { failedGame: slug, errors: rep.errors },
        error: {
          code: "policy_refused",
          message: `Refusing to promote "${slug}" to R2 release: validation failed`,
        },
      });
    }

    allWarnings.push(...rep.warnings.map((w) => `[${slug}] ${w}`));
    const dstGameDir = join(DIST_DIR, "games", slug);
    cpSync(srcGameDir, dstGameDir, { recursive: true });

    builtGames.push({
      slug,
      id: rep.manifest.id,
      version: rep.manifest.version,
      legal_classification: rep.manifest.legal_classification,
      metrics: rep.metrics,
      release_sha256: rep.releaseSha256,
      files: rep.files,
    });
  }

  // Compute global immutable release digest across entire `dist/` directory (excluding release-manifest.json itself)
  const distRelFiles = listFilesDeterministic(DIST_DIR);
  const distEntries = distRelFiles.map((rel) => {
    const buf = readFileSync(join(DIST_DIR, rel));
    return {
      path: rel,
      bytes: buf.length,
      sha256: sha256Hex(buf),
    };
  });
  const bundleTreeSha256 = computeTreeSha256(distEntries);

  const releaseManifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    bundle_sha256: bundleTreeSha256,
    standalone_bundle: standaloneInfo,
    standalone_bundles: standaloneBundles,
    games: builtGames,
    artifacts: distEntries,
  };

  writeFileSync(
    join(DIST_DIR, "release-manifest.json"),
    JSON.stringify(releaseManifest, null, 2) + "\n",
    "utf8"
  );

  emitResult({
    json: opts.json,
    ok: true,
    command: "build",
    warnings: allWarnings,
    data: {
      outputDir: "dist/",
      bundleSha256: bundleTreeSha256,
      standalone: standaloneInfo,
      standaloneBundles,
      games: builtGames.map((g) => ({
        slug: g.slug,
        version: g.version,
        gzipKb: g.metrics.gzipKb,
        releaseSha256: g.release_sha256,
      })),
    },
  });
}

function runVerify(opts) {
  const manifestFile = join(DIST_DIR, "release-manifest.json");
  if (!existsSync(manifestFile)) {
    return emitResult({
      json: opts.json,
      ok: false,
      command: "verify",
      error: {
        code: "missing_release",
        message: "dist/release-manifest.json not found. Run `npm run build` first.",
      },
    });
  }

  const release = JSON.parse(readFileSync(manifestFile, "utf8"));
  const mismatches = [];

  for (const art of release.artifacts || []) {
    const full = join(DIST_DIR, art.path);
    if (!existsSync(full)) {
      mismatches.push({ path: art.path, reason: "missing_file" });
      continue;
    }
    const actualHash = sha256Hex(readFileSync(full));
    if (actualHash !== art.sha256) {
      mismatches.push({
        path: art.path,
        reason: "sha256_mismatch",
        expected: art.sha256,
        actual: actualHash,
      });
    }
  }

  const currentFiles = listFilesDeterministic(DIST_DIR).filter(
    (f) => f !== "release-manifest.json"
  );
  const recomputedTree = computeTreeSha256(
    currentFiles.map((rel) => ({
      path: rel,
      sha256: sha256Hex(readFileSync(join(DIST_DIR, rel))),
    }))
  );

  if (recomputedTree !== release.bundle_sha256) {
    mismatches.push({
      path: "dist/",
      reason: "bundle_tree_sha256_mismatch",
      expected: release.bundle_sha256,
      actual: recomputedTree,
    });
  }

  const ok = mismatches.length === 0;
  emitResult({
    json: opts.json,
    ok,
    command: "verify",
    data: {
      bundleSha256: release.bundle_sha256,
      verifiedArtifacts: (release.artifacts || []).length,
      mismatches,
    },
    error: ok
      ? null
      : { code: "integrity_violation", message: "Release artifact hash verification failed" },
  });
}

async function runDoctor(opts) {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    check: "node_runtime",
    ok: nodeMajor >= 20,
    detail: `Node.js ${process.version}`,
  });

  for (const pkg of ["express", "socket.io", "cors", "tiktok-live-connector"]) {
    try {
      await import(pkg);
      checks.push({ check: `dep:${pkg}`, ok: true, detail: "installed" });
    } catch (err) {
      checks.push({ check: `dep:${pkg}`, ok: false, detail: err.message });
    }
  }

  const slugs = discoverGames();
  for (const slug of slugs) {
    const rep = validateGamePackage(join(GAMES_DIR, slug));
    checks.push({
      check: `game:${slug}`,
      ok: rep.ok,
      detail: rep.ok
        ? `${rep.metrics.gzipKb} KB gzip (${rep.manifest.legal_classification})`
        : rep.errors.join("; "),
    });
  }

  const warnings = [];
  if (!process.env.YOUTUBE_API_KEY) {
    warnings.push(
      "YOUTUBE_API_KEY not set — YouTubeLiveService will use zero-key InnerTube live_chat polling mode."
    );
  }
  if (!process.env.SUPABASE_URL) {
    warnings.push(
      "SUPABASE_URL not set — Portal Cloud Save & Leaderboards running in local in-memory sandbox mode."
    );
  }

  const allOk = checks.every((c) => c.ok);
  emitResult({
    json: opts.json,
    ok: allOk,
    command: "doctor",
    data: { checks },
    warnings,
    error: allOk ? null : { code: "doctor_failed", message: "One or more environment checks failed" },
  });
}

async function runDecide(opts) {
  const service = new ProjectDecisionsService();
  const report = await service.runFullProjectAudit({
    apiKey: process.env.GEMINI_API_KEY || "",
  });
  const ok = report.overallStatus === "GO_FOR_LAUNCH";
  const warnings = [];
  if (!process.env.GEMINI_API_KEY) {
    warnings.push(
      "GEMINI_API_KEY not set — evaluated using built-in Game9K Calibrated Decisions Engine (set GEMINI_API_KEY for live gemini-decision-1)."
    );
  }
  emitResult({
    json: opts.json,
    ok,
    command: "decide",
    data: report,
    warnings,
    error: ok
      ? null
      : { code: "governance_hold", message: "One or more Game9K project governance gates require attention" },
  });
}

function runCodegen(opts) {
  const gameSlug = opts.game || "dino-race";
  const manifestPath = join(GAMES_DIR, gameSlug, "game9k.manifest.json");
  let manifest = null;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  }
  const splice = new SpliceSpecService();
  const generated = splice.generateSDK(
    {
      packageName: `@game9k/${gameSlug}-portal-sdk`,
      packageVersion: "9.0.0",
      gameId: gameSlug,
      language: "typescript",
    },
    null,
    manifest
  );
  if (!generated.ok) {
    return emitResult({
      json: opts.json,
      ok: false,
      command: "codegen",
      error: { code: "codegen_failed", message: generated.error || "SDK generation failed" },
    });
  }

  const outDir = join(DIST_DIR, "generated-sdk", gameSlug);
  rmSync(outDir, { recursive: true, force: true });
  for (const [relFile, content] of Object.entries(generated.files)) {
    const absFile = join(outDir, relFile);
    mkdirSync(dirname(absFile), { recursive: true });
    writeFileSync(absFile, content, "utf8");
  }

  emitResult({
    json: opts.json,
    ok: true,
    command: "codegen",
    data: {
      generationId: generated.generationId,
      packageName: generated.config.packageName,
      packageVersion: generated.config.packageVersion,
      endpointCount: generated.endpointCount,
      outputDir: `dist/generated-sdk/${gameSlug}`,
      files: generated.fileNames,
    },
  });
}

async function runDeploy(opts) {
  const gameSlug = opts.game || "dino-race";
  if (gameSlug === "dino-race") {
    compileDinoRaceStandalone();
  }
  const cloud = new CloudEdgeLaunchService();
  const published = await cloud.publishGameToR2({ gameSlug });
  if (!published.ok) {
    return emitResult({
      json: opts.json,
      ok: false,
      command: "deploy",
      error: { code: "r2_deploy_rejected", message: published.error },
    });
  }
  const milestones = cloud.evaluateAndSignMilestones({ gameSlug });
  emitResult({
    json: opts.json,
    ok: true,
    command: "deploy",
    data: {
      deployment: published.deployment,
      solanaMilestones: {
        authorityAddress: milestones.authorityAddress,
        totalUnlockedG9K: milestones.totalUnlockedG9K,
      },
    },
  });
}

const opts = parseArgs(process.argv);
if (opts.command === "capabilities") runCapabilities(opts);
else if (opts.command === "validate") runValidate(opts);
else if (opts.command === "build") runBuild(opts);
else if (opts.command === "verify") runVerify(opts);
else if (opts.command === "doctor") await runDoctor(opts);
else if (opts.command === "decide") await runDecide(opts);
else if (opts.command === "codegen") runCodegen(opts);
else if (opts.command === "deploy") await runDeploy(opts);
else {
  console.log(`Game9K Starter Kit CLI (g9k)
Usage:
  npm run g9k -- capabilities [--json]
  npm run g9k -- validate [--game dino-race] [--json]
  npm run g9k -- build [--game dino-race] [--json]
  npm run g9k -- verify [--json]
  npm run g9k -- doctor [--json]
  npm run g9k -- decide [--json]
  npm run g9k -- codegen [--game dino-race] [--json]
  npm run g9k -- deploy [--game dino-race] [--json]`);
}
