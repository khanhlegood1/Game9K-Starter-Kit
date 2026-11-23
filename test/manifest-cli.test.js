import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { validateGamePackage } from "../src/lib/manifestValidator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

test("validateGamePackage approves dino-race, Marble Race, and starter-template", () => {
  const dino = validateGamePackage(join(ROOT_DIR, "public/games/dino-race"));
  assert.equal(dino.ok, true, dino.errors.join("; "));
  assert.ok(dino.metrics.gzipKb < 125);
  assert.match(dino.releaseSha256, /^[0-9a-f]{64}$/);

  const marble = validateGamePackage(join(ROOT_DIR, "public/games/marble-race-live"));
  assert.equal(marble.ok, true, marble.errors.join("; "));
  assert.equal(marble.manifest.legal_classification, "G2");
  assert.ok(marble.metrics.gzipKb < 125);

  const tmpl = validateGamePackage(join(ROOT_DIR, "public/games/starter-template"));
  assert.equal(tmpl.ok, true, tmpl.errors.join("; "));
});

test("validateGamePackage rejects forbidden <video>, eval(), and >20Hz telemetry", () => {
  const tmpGame = mkdtempSync(join(tmpdir(), "g9k-bad-game-"));
  try {
    writeFileSync(
      join(tmpGame, "game9k.manifest.json"),
      JSON.stringify({
        schema_version: 1,
        id: "bad-game",
        title: "Bad Game",
        version: "1.0.0",
        entry: "index.html",
        legal_classification: "G2",
        bridge: { max_telemetry_hz: 60 },
      })
    );
    writeFileSync(
      join(tmpGame, "index.html"),
      `<!DOCTYPE html><video autoplay></video><script>eval("1+1")</script>`
    );

    const res = validateGamePackage(tmpGame);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.includes("20 Hz")));
    assert.ok(res.errors.some((e) => e.includes("<video>")));
    assert.ok(res.errors.some((e) => e.includes("eval")));
  } finally {
    rmSync(tmpGame, { recursive: true, force: true });
  }
});

test("g9k CLI validate, build, and verify return valid --json envelopes", () => {
  const validateOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "validate", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(validateOut.schema_version, 1);
  assert.equal(validateOut.ok, true);

  const buildOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "build", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(buildOut.schema_version, 1);
  assert.equal(buildOut.ok, true);

  const verifyOut = JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", "verify", "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    })
  );
  assert.equal(verifyOut.ok, true);
  assert.equal(verifyOut.data.mismatches.length, 0);
});
