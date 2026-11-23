/**
 * CloudEdgeLaunchService.js
 * Production Cloud, Edge, Blockchain & Regulatory Infrastructure for Game9K SDK v8.0 (`PokiSDK.cloud`):
 *
 *   1. Cloudflare R2 S3v4 Bundle Publisher (`AWS4-HMAC-SHA256` canonical signing, immutable CDN headers,
 *      pre-flight `<= 125 KB` gzip & zero-`<video>` gate, + `g9k deploy` CLI integration).
 *   2. Supabase PostgREST Cloud Save & Global Leaderboard Adapter (`SUPABASE_URL` + `SUPABASE_ANON_KEY`
 *      with dual-write local sandbox persistence & `<= 20 Hz` Realtime Broadcast guard).
 *   3. Solana Treasury Milestone Ed25519 Attestation Engine (`node:crypto` Ed25519 keypair, detached
 *      cryptographic tranche proofs & public-key signature verifier).
 *   4. Vietnam Decree 147/2024/NĐ-CP Under-18 Playtime Guard (60-minute per-game & 180-minute daily caps
 *      with automatic `UNDER18_LIMIT_LOCK` trigger for `<iframe sandbox="allow-scripts">`).
 */

import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { validateGamePackage } from "../lib/manifestValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "../..");
const GAMES_DIR = join(ROOT_DIR, "public/games");

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

export default class CloudEdgeLaunchService {
  constructor(options = {}) {
    // 1. Cloudflare R2 configuration
    this.r2AccountId = options.r2AccountId || process.env.R2_ACCOUNT_ID || "";
    this.r2AccessKeyId = options.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID || "";
    this.r2SecretAccessKey =
      options.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY || "";
    this.r2Bucket = options.r2Bucket || process.env.R2_BUCKET || "game9k-prod-bundles";
    this.r2PublicDomain =
      options.r2PublicDomain || process.env.R2_PUBLIC_DOMAIN || "https://cdn.game9k.vn";
    this.r2Deployments = [];

    // 2. Supabase PostgREST + Broadcast configuration
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || "";
    this.supabaseAnonKey =
      options.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || "";
    this.liveRoomHub = options.liveRoomHub || null;
    this.posService = options.posService || null;

    // 3. Solana Ed25519 Treasury Milestone Authority
    const kp = generateKeyPairSync("ed25519");
    this.solanaPrivateKey = kp.privateKey;
    this.solanaPublicKey = kp.publicKey;
    const rawPubSpki = kp.publicKey.export({ type: "spki", format: "der" });
    const raw32Pub = rawPubSpki.subarray(rawPubSpki.length - 32);
    this.solanaAuthorityPubkey = encodeBase58(raw32Pub);
    this.solanaPublicKeyHex = raw32Pub.toString("hex");
    this.unlockedTranches = new Map(); // trancheId -> signedAttestation

    // 4. NĐ 147/2024 Under-18 Playtime Sessions (`<= 60m` per game, `<= 180m` daily)
    this.maxSingleGameSec = Number(options.maxSingleGameSec ?? 3600); // 60 minutes
    this.maxDailyTotalSec = Number(options.maxDailyTotalSec ?? 10800); // 180 minutes
    this.playtimeLedger = new Map(); // playerId -> { playerId, ageGroup, dailySec, byGame: { [gameId]: sec }, updatedAt }
  }

  getStatus() {
    return {
      ok: true,
      cloudflareR2: {
        liveConfigured: Boolean(
          this.r2AccountId && this.r2AccessKeyId && this.r2SecretAccessKey
        ),
        bucket: this.r2Bucket,
        publicDomain: this.r2PublicDomain,
        deploymentsCount: this.r2Deployments.length,
      },
      supabase: {
        liveConfigured: Boolean(this.supabaseUrl && this.supabaseAnonKey),
        mode:
          this.supabaseUrl && this.supabaseAnonKey
            ? "supabase_postgrest_live"
            : "dual_write_local_sandbox",
        maxBroadcastHz: 20,
      },
      solanaTreasury: {
        authorityAddress: this.solanaAuthorityPubkey,
        publicKeyHex: this.solanaPublicKeyHex,
        signatureScheme: "Ed25519",
        unlockedTranchesCount: this.unlockedTranches.size,
      },
      nd147PlaytimeGuard: {
        singleGameLimitMin: Math.round(this.maxSingleGameSec / 60),
        dailyTotalLimitMin: Math.round(this.maxDailyTotalSec / 60),
        trackedPlayers: this.playtimeLedger.size,
      },
    };
  }

  // ==========================================================================
  // 1. CLOUDFLARE R2 AWS SIGV4 BUNDLE PUBLISHER (`<= 125 KB` GZIP GATE)
  // ==========================================================================

  buildS3v4Headers({
    method = "PUT",
    objectKey,
    payloadSha256,
    contentType = "text/html; charset=utf-8",
    now = new Date(),
  }) {
    const account = this.r2AccountId || "demo_r2_account_9k";
    const accessKey = this.r2AccessKeyId || "AKIA_GAME9K_SANDBOX";
    const secretKey = this.r2SecretAccessKey || "r2_sandbox_secret_signing_key_9k";
    const region = "auto";
    const service = "s3";

    const isoBasic = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = isoBasic.slice(0, 8);
    const host = `${account}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${this.r2Bucket}/${objectKey.replace(/^\/+/, "")}`;
    const cacheControl = "public, max-age=31536000, immutable";

    const canonicalHeaders =
      `cache-control:${cacheControl}\n` +
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadSha256}\n` +
      `x-amz-date:${isoBasic}\n`;
    const signedHeaders =
      "cache-control;content-type;host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method.toUpperCase(),
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadSha256,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      isoBasic,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, service);
    const kSigning = hmacSha256(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      endpointUrl: `https://${host}${canonicalUri}`,
      headers: {
        Host: host,
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "x-amz-content-sha256": payloadSha256,
        "x-amz-date": isoBasic,
        Authorization: authorization,
      },
      signature,
      isoDate: isoBasic,
    };
  }

  async publishGameToR2({ gameSlug = "dino-race", dryRun = false } = {}) {
    const cleanSlug = String(gameSlug || "dino-race").replace(/[^a-z0-9_-]/gi, "");
    const gameDir = join(GAMES_DIR, cleanSlug);
    if (!existsSync(gameDir)) {
      return { ok: false, status: 404, error: `Game package "${cleanSlug}" not found.` };
    }

    // Pre-flight validation (`<= 125 KB` gzip, zero `<video>`, zero `eval()`, `<= 20 Hz`)
    const audit = validateGamePackage(gameDir);
    if (!audit.ok) {
      return {
        ok: false,
        status: 422,
        error: `R2 Pre-flight Gate Rejected "${cleanSlug}": ${audit.errors.join("; ")}`,
        errors: audit.errors,
      };
    }

    const standalonePath = join(gameDir, "standalone.html");
    const entryPath = existsSync(standalonePath)
      ? standalonePath
      : join(gameDir, "index.html");
    const rawBuf = readFileSync(entryPath);
    const gzBuf = gzipSync(rawBuf, { level: 9 });
    const gzipKb = Number((gzBuf.length / 1024).toFixed(2));
    const maxKb = Number(audit.manifest?.budgets?.max_gzip_kb || 125);
    if (gzipKb > maxKb) {
      return {
        ok: false,
        status: 413,
        error: `Bundle gzip (${gzipKb} KB) exceeds Cloudflare R2 cap (${maxKb} KB).`,
      };
    }

    const version = audit.manifest?.version || "2.0.0";
    const contentSha = sha256Hex(rawBuf);
    const objectKey = `games/${cleanSlug}/v${version}/${contentSha.slice(0, 12)}/standalone.html`;
    const sigV4 = this.buildS3v4Headers({
      method: "PUT",
      objectKey,
      payloadSha256: contentSha,
    });

    let uploadedLive = false;
    const isLiveR2 = Boolean(
      !dryRun && this.r2AccountId && this.r2AccessKeyId && this.r2SecretAccessKey
    );
    if (isLiveR2) {
      try {
        const res = await fetch(sigV4.endpointUrl, {
          method: "PUT",
          headers: sigV4.headers,
          body: rawBuf,
        });
        uploadedLive = res.ok;
      } catch {
        uploadedLive = false;
      }
    }

    const receipt = {
      deployId: `r2dep_${randomBytes(5).toString("hex")}`,
      gameSlug: cleanSlug,
      version,
      legalClassification: audit.manifest?.legal_classification || "G2",
      mode: uploadedLive ? "cloudflare_r2_live" : "cloudflare_r2_sigv4_staged",
      bucket: this.r2Bucket,
      objectKey,
      cdnUrl: `${this.r2PublicDomain.replace(/\/+$/, "")}/${objectKey}`,
      rawKb: Number((rawBuf.length / 1024).toFixed(2)),
      gzipKb,
      maxGzipKb: maxKb,
      sha256: contentSha,
      cacheControl: sigV4.headers["Cache-Control"],
      sigV4Signature: sigV4.signature,
      deployedAt: new Date().toISOString(),
    };
    this.r2Deployments.unshift(receipt);
    if (this.r2Deployments.length > 30) this.r2Deployments.pop();

    return { ok: true, deployment: receipt };
  }

  // ==========================================================================
  // 2. SUPABASE CLOUD SAVE & GLOBAL LEADERBOARD ADAPTER
  // ==========================================================================

  async syncCloudSave(gameId = "dino-race", playerId = "guest", stateData = {}) {
    const localSaved = this.liveRoomHub
      ? this.liveRoomHub.saveCloudState(gameId, playerId, stateData)
      : { gameId, playerId, data: stateData, updatedAt: new Date().toISOString() };

    let supabaseSynced = false;
    if (this.supabaseUrl && this.supabaseAnonKey) {
      try {
        const res = await fetch(`${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/g9k_cloud_saves`, {
          method: "POST",
          headers: {
            apikey: this.supabaseAnonKey,
            Authorization: `Bearer ${this.supabaseAnonKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({
            game_id: gameId,
            player_id: playerId,
            payload: stateData,
            updated_at: new Date().toISOString(),
          }),
        });
        supabaseSynced = res.ok;
      } catch {
        supabaseSynced = false;
      }
    }

    return {
      ok: true,
      provider: supabaseSynced ? "supabase_postgrest" : "local_dual_write",
      save: localSaved,
    };
  }

  async submitGlobalScore(gameId = "dino-race", scorePayload = {}) {
    const entries = this.liveRoomHub
      ? this.liveRoomHub.submitLeaderboardScore(gameId, scorePayload)
      : [];

    let supabaseSynced = false;
    if (this.supabaseUrl && this.supabaseAnonKey) {
      try {
        const res = await fetch(`${this.supabaseUrl.replace(/\/+$/, "")}/rest/v1/g9k_leaderboards`, {
          method: "POST",
          headers: {
            apikey: this.supabaseAnonKey,
            Authorization: `Bearer ${this.supabaseAnonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            game_id: gameId,
            player_id: scorePayload.playerId || "guest",
            nickname: scorePayload.nickname || "DinoExplorer",
            score: Number(scorePayload.score || 0),
          }),
        });
        supabaseSynced = res.ok;
      } catch {
        supabaseSynced = false;
      }
    }

    return {
      ok: true,
      provider: supabaseSynced ? "supabase_postgrest" : "local_dual_write",
      gameId,
      topEntries: entries.slice(0, 10),
    };
  }

  // ==========================================================================
  // 3. SOLANA TREASURY MILESTONE ED25519 ATTESTATION & VERIFIER
  // ==========================================================================

  evaluateAndSignMilestones({ gameSlug = "dino-race", forceSimulateKpi = false } = {}) {
    const audit = validateGamePackage(join(GAMES_DIR, gameSlug));
    const telemetryCount = this.liveRoomHub ? this.liveRoomHub.telemetryLog.length : 0;
    const zRep = this.posService ? this.posService.computeZReport() : { studioNetCents: 0, checks: 0 };

    const tranchesSpec = [
      {
        trancheId: "tranche_1_r2_sandbox_ready",
        title: "Milestone #1 — Chuẩn Poki Sandbox & Gói R2 <= 125 KB",
        amountG9K: 25_000,
        eligible: Boolean(audit.ok),
        evidence: {
          gzipKb: audit.metrics?.gzipKb || 0,
          releaseSha256: audit.releaseSha256 || "",
        },
      },
      {
        trancheId: "tranche_2_kol_live_engagement",
        title: "Milestone #2 — Vận Hành Phòng Đua KOL Live & Telemetry",
        amountG9K: 35_000,
        eligible: Boolean(forceSimulateKpi || telemetryCount >= 1 || this.r2Deployments.length >= 1),
        evidence: {
          telemetryEvents: telemetryCount,
          r2Deployments: this.r2Deployments.length,
        },
      },
      {
        trancheId: "tranche_3_pos_xsolla_revenue",
        title: "Milestone #3 — Doanh Thu Thực Xsolla / POS Z-Report Dương",
        amountG9K: 40_000,
        eligible: Boolean(forceSimulateKpi || zRep.studioNetCents > 0),
        evidence: {
          studioNetCents: zRep.studioNetCents,
          completedChecks: zRep.checks,
        },
      },
    ];

    const results = tranchesSpec.map((t) => {
      if (!t.eligible) {
        return { ...t, status: "LOCKED_PENDING_KPI", attestation: null };
      }
      const messageObj = {
        program: "Game9K_Solana_Milestone_Vault_v1",
        authority: this.solanaAuthorityPubkey,
        gameSlug,
        trancheId: t.trancheId,
        amountG9K: t.amountG9K,
        evidenceHash: sha256Hex(JSON.stringify(t.evidence)),
      };
      const canonicalMessage = JSON.stringify(messageObj);
      const sigBytes = cryptoSign(
        null,
        Buffer.from(canonicalMessage, "utf8"),
        this.solanaPrivateKey
      );
      const attestation = {
        message: canonicalMessage,
        signatureHex: sigBytes.toString("hex"),
        signatureBase58: encodeBase58(sigBytes),
        authorityAddress: this.solanaAuthorityPubkey,
        publicKeyHex: this.solanaPublicKeyHex,
        signedAt: new Date().toISOString(),
      };
      this.unlockedTranches.set(t.trancheId, attestation);
      return { ...t, status: "UNLOCKED_SIGNED_ED25519", attestation };
    });

    const totalUnlockedG9K = results
      .filter((r) => r.status === "UNLOCKED_SIGNED_ED25519")
      .reduce((acc, r) => acc + r.amountG9K, 0);

    return {
      ok: true,
      authorityAddress: this.solanaAuthorityPubkey,
      publicKeyHex: this.solanaPublicKeyHex,
      totalUnlockedG9K,
      maxAllocationG9K: 100_000,
      tranches: results,
    };
  }

  verifyMilestoneSignature({ message, signatureHex }) {
    try {
      const msgBuf = Buffer.from(String(message || ""), "utf8");
      const sigBuf = Buffer.from(String(signatureHex || ""), "hex");
      const valid = cryptoVerify(null, msgBuf, this.solanaPublicKey, sigBuf);
      return {
        ok: true,
        valid,
        authorityAddress: this.solanaAuthorityPubkey,
      };
    } catch (err) {
      return { ok: false, valid: false, error: err?.message || "Invalid signature format" };
    }
  }

  // ==========================================================================
  // 4. VIETNAM DECREE 147/2024/NĐ-CP UNDER-18 PLAYTIME SESSION GUARD
  // ==========================================================================

  heartbeatPlaytime({
    playerId = "guest_u18",
    gameId = "dino-race",
    ageGroup = "under18",
    elapsedSec = 60,
  } = {}) {
    const cleanId = String(playerId || "guest_u18");
    const cleanGame = String(gameId || "dino-race");
    const delta = Math.max(0, Math.min(7200, Number(elapsedSec) || 0));

    let rec = this.playtimeLedger.get(cleanId);
    if (!rec) {
      rec = {
        playerId: cleanId,
        ageGroup: ageGroup === "adult" ? "adult" : "under18",
        dailySec: 0,
        byGame: {},
        updatedAt: new Date().toISOString(),
      };
      this.playtimeLedger.set(cleanId, rec);
    }
    if (ageGroup) rec.ageGroup = ageGroup === "adult" ? "adult" : "under18";

    rec.dailySec += delta;
    rec.byGame[cleanGame] = (rec.byGame[cleanGame] || 0) + delta;
    rec.updatedAt = new Date().toISOString();

    const gameSec = rec.byGame[cleanGame];
    const isUnder18 = rec.ageGroup === "under18";
    const singleGameExceeded = isUnder18 && gameSec >= this.maxSingleGameSec;
    const dailyExceeded = isUnder18 && rec.dailySec >= this.maxDailyTotalSec;
    const shouldLockUnder18 = singleGameExceeded || dailyExceeded;
    const warningNearLimit =
      isUnder18 &&
      !shouldLockUnder18 &&
      (gameSec >= this.maxSingleGameSec * 0.85 || rec.dailySec >= this.maxDailyTotalSec * 0.85);

    return {
      ok: true,
      playerId: cleanId,
      gameId: cleanGame,
      ageGroup: rec.ageGroup,
      gamePlayedSec: gameSec,
      dailyPlayedSec: rec.dailySec,
      remainingGameSec: isUnder18 ? Math.max(0, this.maxSingleGameSec - gameSec) : null,
      remainingDailySec: isUnder18 ? Math.max(0, this.maxDailyTotalSec - rec.dailySec) : null,
      warningNearLimit,
      shouldLockUnder18,
      lockReason: dailyExceeded
        ? "nd147_180m_daily_cap"
        : singleGameExceeded
        ? "nd147_60m_single_game_cap"
        : null,
      portalPostMessageCmd: shouldLockUnder18 ? "UNDER18_LIMIT_LOCK" : "UNDER18_LIMIT_UNLOCK",
    };
  }

  resetPlaytime(playerId = "guest_u18") {
    this.playtimeLedger.delete(String(playerId));
    return { ok: true, playerId: String(playerId), reset: true };
  }
}
