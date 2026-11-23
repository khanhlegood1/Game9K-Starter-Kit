import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame9KServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

test("E2B Runtime Architecture: Templates, Pause GCRA 429, Auto-Resume, Fork & Volume Audience JWT", async () => {
  const { httpServer, liveRoomHub, e2bService } = createGame9KServer({
    e2b: { pauseLimitPerMinute: 1, domain: "game9k.local" },
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Templates & Sandbox Creation
    const tplRes = await fetch(`${baseUrl}/api/e2b/templates`).then((r) => r.json());
    assert.equal(tplRes.ok, true);
    assert.ok(tplRes.templates.length >= 3);

    const created = await fetch(`${baseUrl}/api/e2b/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: "poki-canvas-mini" }),
    }).then((r) => r.json());
    assert.equal(created.ok, true);
    const sbxId = created.sandbox.sandboxId;
    const initialLifecycleId = created.sandbox.lifecycleId;
    assert.equal(created.sandbox.routingActive, true);

    // 2. First Pause succeeds: freezes envd, captures COW diff snapshot & clears routing
    const pause1 = await fetch(`${baseUrl}/api/e2b/sandboxes/${sbxId}/pause`, {
      method: "POST",
    }).then((r) => r.json());
    assert.equal(pause1.ok, true);
    assert.equal(pause1.sandbox.status, "paused");
    assert.equal(pause1.sandbox.envdFrozen, true);
    assert.equal(pause1.sandbox.routingActive, false);
    assert.match(pause1.snapshot.snapshotId, /^snap_/);

    // 3. Client-Proxy Auto-Resume on incoming preview traffic wakes sandbox & rotates lifecycleId!
    const previewRes = await fetch(`${baseUrl}/api/e2b/preview/${sbxId}`);
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.headers.get("x-e2b-auto-resumed"), "true");
    const html = await previewRes.text();
    assert.ok(html.includes("canvas"));

    const afterWake = e2bService.getSandbox(sbxId).sandbox;
    assert.equal(afterWake.status, "running");
    assert.notEqual(afterWake.lifecycleId, initialLifecycleId);

    // 4. Immediate second Pause hits GCRA per-sandbox rate limit -> HTTP 429 + Retry-After!
    const pause2Res = await fetch(`${baseUrl}/api/e2b/sandboxes/${sbxId}/pause`, {
      method: "POST",
    });
    assert.equal(pause2Res.status, 429);
    assert.ok(Number(pause2Res.headers.get("retry-after")) >= 1);

    // 5. Checkpoint & Fork creates independent running branch preserving files
    await fetch(`${baseUrl}/api/e2b/sandboxes/${sbxId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "branch.txt", content: "forked-state-ok" }),
    });
    const forked = await fetch(`${baseUrl}/api/e2b/sandboxes/${sbxId}/fork`, {
      method: "POST",
    }).then((r) => r.json());
    assert.equal(forked.ok, true);
    assert.notEqual(forked.sandbox.sandboxId, sbxId);

    const branchFile = await fetch(
      `${baseUrl}/api/e2b/sandboxes/${forked.sandbox.sandboxId}/files?path=branch.txt`
    ).then((r) => r.json());
    assert.equal(branchFile.content, "forked-state-ok");

    // 6. Audience-bound Volume Content JWT (`aud: https://api.game9k.local`)
    const volRes = await fetch(`${baseUrl}/api/e2b/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "kol-replay-vol" }),
    }).then((r) => r.json());
    assert.equal(volRes.ok, true);
    assert.equal(volRes.expectedAud, "https://api.game9k.local");

    const writeOk = await fetch(
      `${baseUrl}/api/e2b/volumecontent/${volRes.volume.volumeId}/state.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${volRes.contentToken}`,
        },
        body: JSON.stringify({ bestScore: 9900 }),
      }
    );
    assert.equal(writeOk.status, 200);

    // Wrong audience domain must be rejected with 403
    const readBadAud = await fetch(
      `${baseUrl}/api/e2b/volumecontent/${volRes.volume.volumeId}/state.json`,
      {
        headers: {
          Authorization: `Bearer ${volRes.contentToken}`,
          "X-E2B-Content-Domain": "evil-other.domain",
        },
      }
    );
    assert.equal(readBadAud.status, 403);
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("E2B Stateful Code Interpreter, SVG Chart Extractor, Fragments & Morph Lazy Patch", async () => {
  const { httpServer, liveRoomHub } = createGame9KServer();
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Stateful multi-cell execution + SVG chart extraction
    const cell1 = await fetch(`${baseUrl}/api/e2b/interpreter/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "globalThis.x = 40; console.log('init x');" }),
    }).then((r) => r.json());
    assert.equal(cell1.ok, true);
    assert.deepEqual(cell1.logs.stdout, ["init x"]);

    const cell2 = await fetch(`${baseUrl}/api/e2b/interpreter/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandboxId: cell1.sandboxId,
        code: `
          x += 2;
          emitChart({ type: "bar", title: "Dino XP", points: [{ label: "R1", value: x }] });
          x;
        `,
      }),
    }).then((r) => r.json());
    assert.equal(cell2.ok, true);
    assert.equal(cell2.text, "42");
    const chartRes = cell2.results.find((r) => r.type === "chart");
    assert.ok(chartRes);
    assert.ok(chartRes.svg.includes("<svg"));

    // Infinite-loop guard stops runaway user code cleanly
    const loopRes = await fetch(`${baseUrl}/api/e2b/interpreter/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandboxId: cell1.sandboxId,
        code: "while (true) {}",
        timeoutMs: 60,
      }),
    }).then((r) => r.json());
    assert.equal(loopRes.ok, false);
    assert.ok(loopRes.error);

    // 2. Fragments Deploy + Morph `// ... existing code ...` Lazy Edit
    const frag = await fetch(`${baseUrl}/api/e2b/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fragment: {
          template: "poki-canvas-mini",
          title: "Dino Fragment",
          file_path: "index.html",
          code: [
            "<!DOCTYPE html>",
            "<html>",
            "<head><title>Old</title></head>",
            "<body>",
            "<h1>Emerald Mode</h1>",
            "<p>Keep Footer Intact</p>",
            "</body>",
            "</html>",
          ].join("\n"),
        },
      }),
    }).then((r) => r.json());
    assert.equal(frag.ok, true);
    assert.ok(frag.url.includes(`/api/e2b/preview/${frag.sbxId}`));

    const morph = await fetch(
      `${baseUrl}/api/e2b/sandboxes/${frag.sbxId}/morph-edit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: "index.html",
          instruction: "Upgrade heading to Rose Turbo Mode",
          edit: [
            "// ... existing code ...",
            "<body>",
            "<h1>Rose Turbo Mode</h1>",
            "<p>Keep Footer Intact</p>",
            "// ... existing code ...",
          ].join("\n"),
        }),
      }
    ).then((r) => r.json());
    assert.equal(morph.ok, true);

    const updatedHtml = await fetch(`${baseUrl}${frag.url}`).then((r) => r.text());
    assert.ok(updatedHtml.includes("Rose Turbo Mode"));
    assert.ok(updatedHtml.includes("Keep Footer Intact"));
    assert.ok(!updatedHtml.includes("Emerald Mode"));
  } finally {
    liveRoomHub.shutdown();
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test("Open Computer Use & Poki Portal Sandbox RPC (`PokiSDK.runtime / interpreter / fragments / computerUse`)", async () => {
  const sdkSource = readFileSync(join(ROOT_DIR, "public/sdk/game9k-sdk.js"), "utf8");
  const messageHandlers = [];

  const parentWindow = {
    postMessage(msg) {
      if (msg.type === "PORTAL_HANDSHAKE_SYN") {
        setTimeout(() => {
          dispatchFromParent({
            type: "PORTAL_HANDSHAKE_ACK",
            language: "vi",
            country: "VN",
          });
        }, 2);
      } else if (msg.type === "PORTAL_RPC_REQUEST") {
        setTimeout(() => {
          if (msg.action === "e2b_create_sandbox") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: {
                ok: true,
                sandbox: {
                  sandboxId: "sbx_portal_rpc_1",
                  lifecycleId: "lc_001",
                  status: "running",
                },
              },
            });
          } else if (msg.action === "e2b_run_code") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: {
                ok: true,
                sandboxId: "sbx_portal_rpc_1",
                text: "99",
                logs: { stdout: ["rpc-cell-ok"], stderr: [] },
                results: [],
              },
            });
          } else if (msg.action === "e2b_computer_use_step") {
            dispatchFromParent({
              type: "PORTAL_RPC_RESPONSE",
              reqId: msg.reqId,
              ok: true,
              data: {
                ok: true,
                step: {
                  grounding: { x: 180, y: 90, matchedBy: "semantic_label" },
                  toolCall: { name: "click", parameters: { x: 180, y: 90 } },
                },
              },
            });
          }
        }, 2);
      }
    },
  };

  const sandboxGlobal = {
    parent: parentWindow,
    location: { origin: "null", href: "about:srcdoc", search: "" },
    navigator: { language: "vi-VN", userAgent: "Mozilla/5.0" },
    performance: { now: () => Date.now() },
    innerWidth: 360,
    innerHeight: 180,
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

  const {
    Game9K,
    PokiSDK,
    E2BRuntimeSDK,
    CodeInterpreterSDK,
    FragmentsSDK,
    ComputerUseSDK,
  } = sandboxGlobal;

  assert.equal(PokiSDK.runtime, E2BRuntimeSDK);
  assert.equal(PokiSDK.interpreter, CodeInterpreterSDK);
  assert.equal(PokiSDK.fragments, FragmentsSDK);
  assert.equal(PokiSDK.computerUse, ComputerUseSDK);

  await PokiSDK.init({ gameId: "dino-race", version: "4.0.0" });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(Game9K.portalHostConnected, true);

  // CodeInterpreterSDK.create() + sbx.runCode() mediated across Portal RPC
  const sbx = await CodeInterpreterSDK.create();
  assert.equal(sbx.sandboxId, "sbx_portal_rpc_1");
  const exec = await sbx.runCode("99");
  assert.equal(exec.text, "99");
  assert.equal(exec.logs.stdout[0], "rpc-cell-ok");

  // ENVD_FREEZE from Portal Host refuses new task spawns until ENVD_THAW!
  dispatchFromParent({ type: "ENVD_FREEZE" });
  assert.equal(PokiSDK.runtime.envd.frozen, true);
  const refused = PokiSDK.runtime.spawnEnvdTask(() => 123);
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 503);

  dispatchFromParent({ type: "ENVD_THAW" });
  const allowed = PokiSDK.runtime.spawnEnvdTask(() => 123);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.result, 123);

  // PokiSDK.computerUse.click() mediated across Portal RPC
  const cuStep = await PokiSDK.computerUse.click("Boost button", {
    uiElements: [{ label: "Boost button", x: 180, y: 90, width: 100, height: 32 }],
  });
  assert.equal(cuStep.step.grounding.x, 180);
  assert.equal(cuStep.step.toolCall.name, "click");
});
