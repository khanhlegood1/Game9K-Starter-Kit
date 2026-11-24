import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function runCli(args) {
  return JSON.parse(
    execFileSync(process.execPath, ["cli/g9k.js", ...args, "--json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: { ...process.env, G9K_GH_API_TOKEN: "", GITHUB_TOKEN: "", GH_TOKEN: "" },
    })
  );
}

test("CLI `g9k tasks --json` reports the deterministic FDE + ADR board", () => {
  const out = runCli(["tasks"]);
  assert.equal(out.schema_version, 1);
  assert.equal(out.ok, true);
  assert.equal(out.command, "tasks");
  assert.equal(out.data.projectId, "game9k-live-interaction");
  assert.ok(out.data.kpis.total >= 6);
  assert.ok(out.data.tasks.some((task) => task.id === "fde-001"));
  assert.ok(out.data.adrs.some((adr) => adr.id === "ADR-002"));
  assert.equal(out.data.github, null);
  assert.ok(out.warnings.some((warning) => /GitHub lookup skipped/.test(warning)));
  assert.equal(out.error, null);
});

test("CLI `g9k tasks` filters by status and priority", () => {
  const blocked = runCli(["tasks", "--status", "blocked"]);
  assert.ok(blocked.data.tasks.length >= 1);
  assert.ok(blocked.data.tasks.every((task) => task.status === "blocked"));

  const p0 = runCli(["tasks", "--priority", "P0"]);
  assert.ok(p0.data.tasks.length >= 1);
  assert.ok(p0.data.tasks.every((task) => task.priority === "P0"));

  const none = runCli(["tasks", "--priority", "P3", "--status", "done"]);
  assert.equal(none.ok, true);
  assert.equal(none.data.tasks.length, 0);
});
