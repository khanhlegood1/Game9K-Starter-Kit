/**
 * manifestValidator.js
 * Static verification, bundle budget auditing, WebView/Sandbox security scanning,
 * and SHA-256 immutable digest computation for Game9K Starter Kit packages.
 *
 * Enforces the 3-Step Build Verification Pipeline defined in Game9K Spec:
 * 1. Valid `game9k.manifest.json` + legal classification (`G1` | `G2` | `G3` | `G4`)
 * 2. Static security & TikTok WebView scan (no `<video>` autoplay pitfalls, no `eval()`,
 *    no parent cookie/top-navigation escape attempts, gzip bundle budget <= 275 KB)
 * 3. Deterministic per-file SHA-256 + tree `release_sha256` for Cloudflare R2 immutability
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const VALID_LEGAL_MODES = new Set(["G1", "G2", "G3", "G4"]);
const TEXT_EXTENSIONS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);

/**
 * Recursively list all files in a directory sorted deterministically by relative POSIX path.
 * @param {string} rootDir
 * @returns {string[]} Relative POSIX paths
 */
export function listFilesDeterministic(rootDir) {
  const results = [];
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const rel = relative(rootDir, fullPath).split("\\").join("/");
        results.push(rel);
      }
    }
  }
  walk(rootDir);
  return results.sort((a, b) => a.localeCompare(b));
}

/**
 * Compute SHA-256 hex digest of a Buffer or string.
 * @param {Buffer|string} content
 * @returns {string}
 */
export function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute deterministic tree digest over sorted `{ path, sha256 }` pairs.
 * @param {Array<{path: string, sha256: string}>} fileEntries
 * @returns {string}
 */
export function computeTreeSha256(fileEntries) {
  const canonical = fileEntries
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.sha256}  ${f.path}`)
    .join("\n");
  return sha256Hex(canonical);
}

/**
 * Audit a Game9K game folder (`public/games/<slug>`).
 * @param {string} gameDir
 * @returns {{
 *   ok: boolean,
 *   manifest: Object|null,
 *   errors: string[],
 *   warnings: string[],
 *   metrics: { fileCount: number, rawBytes: number, gzipBytes: number, rawKb: number, gzipKb: number, maxGzipKb: number },
 *   files: Array<{path: string, bytes: number, gzipBytes: number, sha256: string}>,
 *   releaseSha256: string
 * }}
 */
export function validateGamePackage(gameDir) {
  const errors = [];
  const warnings = [];

  const manifestPath = join(gameDir, "game9k.manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      manifest: null,
      errors: [`Missing game9k.manifest.json in ${gameDir}`],
      warnings,
      metrics: { fileCount: 0, rawBytes: 0, gzipBytes: 0, rawKb: 0, gzipKb: 0, maxGzipKb: 275 },
      files: [],
      releaseSha256: "",
    };
  }

  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      manifest: null,
      errors: [`Invalid JSON in game9k.manifest.json: ${err.message}`],
      warnings,
      metrics: { fileCount: 0, rawBytes: 0, gzipBytes: 0, rawKb: 0, gzipKb: 0, maxGzipKb: 275 },
      files: [],
      releaseSha256: "",
    };
  }

  // 1. Validate required manifest schema fields
  if (manifest.schema_version !== 1) {
    errors.push(`manifest.schema_version must be 1 (got ${manifest.schema_version})`);
  }
  if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push(`manifest.id must be lowercase slug (got "${manifest.id}")`);
  }
  if (!manifest.title || typeof manifest.title !== "string") {
    errors.push("manifest.title is required");
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push(`manifest.version must be valid semver (got "${manifest.version}")`);
  }
  if (!VALID_LEGAL_MODES.has(manifest.legal_classification)) {
    errors.push(
      `manifest.legal_classification must be one of G1, G2, G3, G4 per NĐ 147/2024/NĐ-CP (got "${manifest.legal_classification}")`
    );
  }
  if (Array.isArray(manifest.supported_modes)) {
    for (const m of manifest.supported_modes) {
      if (!VALID_LEGAL_MODES.has(m)) {
        errors.push(`Unsupported legal mode "${m}" in manifest.supported_modes`);
      }
    }
  }

  const entryFile = manifest.entry || "index.html";
  if (!existsSync(join(gameDir, entryFile))) {
    errors.push(`Entry HTML "${entryFile}" not found in game directory`);
  }

  // Check Realtime Hz declaration (must be <= 20 Hz per Supabase Realtime Broadcast spec)
  const declaredHz = Number(manifest.bridge?.max_telemetry_hz ?? 15);
  if (declaredHz > 20) {
    errors.push(
      `manifest.bridge.max_telemetry_hz (${declaredHz} Hz) exceeds Game9K 20 Hz Supabase Realtime Broadcast limit`
    );
  }

  // 2. Scan all files, compute sizes & SHA-256, and run static security / WebView checks
  const relFiles = listFilesDeterministic(gameDir);
  const fileRecords = [];
  let totalRaw = 0;
  let totalGzip = 0;

  for (const rel of relFiles) {
    const abs = join(gameDir, rel);
    const buf = readFileSync(abs);
    const gz = gzipSync(buf, { level: 9 });
    const hash = sha256Hex(buf);

    // Exclude standalone.html from double-counting modular bundle budget if both exist
    const countTowardsPrimaryBudget = rel !== "standalone.html";
    if (countTowardsPrimaryBudget) {
      totalRaw += buf.length;
      totalGzip += gz.length;
    }

    fileRecords.push({
      path: rel,
      bytes: buf.length,
      gzipBytes: gz.length,
      sha256: hash,
    });

    const ext = extname(rel).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext) && ext !== ".json") {
      const src = buf.toString("utf8");

      // Check 2a: TikTok In-App Browser <video> pitfall
      if (/<video\b/i.test(src) && !manifest.allow_video_tag) {
        errors.push(
          `${rel}: Contains <video> element, which breaks playsinline rendering in TikTok WebView. Render animations on <canvas> instead.`
        );
      }

      // Check 2b: Malware / Sandbox escape static patterns
      if (/\beval\s*\(/.test(src) || /\bnew\s+Function\s*\(/.test(src)) {
        errors.push(`${rel}: Dynamic code execution (eval / new Function) is forbidden by Game9K static scanner.`);
      }
      if (/\bwindow\.top\.location\s*=/.test(src) || /\bparent\.document\.cookie\b/.test(src)) {
        errors.push(`${rel}: Forbidden parent frame navigation or cookie access detected.`);
      }
      if (/http:\/\/(localhost|127\.0\.0\.1)\b/i.test(src)) {
        warnings.push(
          `${rel}: Hardcoded localhost URL detected; use relative paths or window.location.origin for Cloud/Live Preview compatibility.`
        );
      }
    }
  }

  const maxGzipKb = Number(manifest.budgets?.max_gzip_kb || 275);
  const rawKb = Number((totalRaw / 1024).toFixed(2));
  const gzipKb = Number((totalGzip / 1024).toFixed(2));

  if (gzipKb > maxGzipKb) {
    errors.push(
      `Gzipped bundle size (${gzipKb} KB) exceeds Game9K instant-play budget (${maxGzipKb} KB)`
    );
  }

  const releaseSha256 = computeTreeSha256(fileRecords);

  return {
    ok: errors.length === 0,
    manifest,
    errors,
    warnings,
    metrics: {
      fileCount: fileRecords.length,
      rawBytes: totalRaw,
      gzipBytes: totalGzip,
      rawKb,
      gzipKb,
      maxGzipKb,
    },
    files: fileRecords,
    releaseSha256,
  };
}
