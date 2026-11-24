/* Game9K Tasks — investor-facing task workspace, vanilla ES module (no build step). */
"use strict";

const STATUS_LABEL = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};
const PRIORITY_LABEL = { P0: "P0 · Critical", P1: "P1 · High", P2: "P2 · Medium", P3: "P3 · Low" };
const SOURCE_ICON = {
  "fde-action": "🎯",
  "fde-risk": "🚧",
  adr: "📜",
  "github-issue": "🐙",
  "github-pr": "🔀",
};

const state = {
  board: null,
  view: "overview",
  filters: { status: "all", owner: "all", priority: "all", source: "all", query: "" },
  error: null,
};

const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function initials(name) {
  const clean = String(name || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusBadge(status) {
  return `<span class="badge ${status}">${STATUS_LABEL[status] || status}</span>`;
}
function priorityBadge(priority) {
  return `<span class="badge ${String(priority).toLowerCase()}">${priority}</span>`;
}
function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ngày trước` : new Date(iso).toLocaleDateString("vi-VN");
}

/* ------------------------------------------------------------------ data */
async function loadBoard({ refresh = false } = {}) {
  el("loading").hidden = false;
  el("loading").textContent = "Đang tải dữ liệu từ repository…";
  try {
    const response = await fetch(`/api/tasks${refresh ? "?refresh=1" : ""}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.board = await response.json();
    state.error = null;
  } catch (error) {
    state.error = error.message || "network_error";
    // Static-host fallback: Vercel serves public/ without the Express API.
    if (!state.board) {
      state.board = demoBoard();
      state.error = "static_mode";
    }
  } finally {
    el("loading").hidden = Boolean(state.board);
  }
  render();
}

/** Offline/static fallback so the portal still demos on a pure static host. */
function demoBoard() {
  const now = new Date().toISOString();
  return {
    ok: false,
    projectId: "game9k-live-interaction",
    mission:
      "Bridge the Game9K live-interaction product to the messy reality of creators, viewers, live platforms and commerce operations without losing a measurable viewer outcome.",
    currentStage: "pilot",
    generatedAt: now,
    githubReady: false,
    sources: { missionBrief: "project/fde/mission-brief.json", adrDirectory: "project/fde/adr", github: null },
    kpis: { total: 0, active: 0, open: 0, inProgress: 0, blocked: 0, done: 0, completionPct: 0, adrOpen: 0, adrTotal: 0, gatePassed: 0, gateTotal: 0, criticalOpen: 0 },
    owners: [],
    tasks: [],
    adrs: [],
    gates: [],
    metrics: [],
  };
}

/* ---------------------------------------------------------------- render */
function render() {
  const board = state.board;
  if (!board) return;

  el("navCount").textContent = board.kpis.active ?? 0;
  el("navAdr").textContent = board.adrs.length ?? 0;

  const gh = el("githubState");
  if (state.error === "static_mode") {
    gh.className = "git-state warn";
    gh.textContent = "Static mode — cần /api/tasks";
  } else if (board.githubReady) {
    gh.className = "git-state ok";
    gh.textContent = `GitHub live · ${board.sources?.github?.count ?? 0} item`;
  } else {
    gh.className = "git-state warn";
    gh.textContent = "GitHub offline — dùng FDE + ADR";
  }

  renderHero(board);
  renderKpis(board);
  renderPriority(board);
  renderOwners(board);
  renderOverviewTasks(board);
  renderGateTimeline(board);
  renderNotes(board);
  renderActivity(board);
  renderTaskList();
  renderKanban(board);
  renderAdrs(board);
  renderGates(board);
  renderMetrics(board);
  syncFilterControls(board);
}

function renderHero(board) {
  el("heroEyebrow").textContent = `FDE CONTROL PLANE · ${String(board.currentStage || "pilot").toUpperCase()}`;
  el("heroTitle").textContent = board.mission || "Game9K project mission";
  el("heroSub").textContent =
    `Project ${board.projectId || "—"} · ${board.kpis.active} task còn mở · ` +
    `${board.kpis.criticalOpen} việc P0/P1 · ${board.kpis.adrOpen}/${board.kpis.adrTotal} ADR còn mở · ` +
    `cập nhật ${relativeTime(board.generatedAt)}`;
  el("heroBadges").innerHTML = [
    `<span class="chip chip-info">${escapeHtml(board.projectId || "—")}</span>`,
    `<span class="chip ${board.kpis.criticalOpen ? "chip-warn" : "chip-good"}">${board.kpis.criticalOpen} critical open</span>`,
    `<span class="chip">${board.kpis.gatePassed}/${board.kpis.gateTotal} gates pass</span>`,
  ].join("");
}

function renderKpis(board) {
  const k = board.kpis;
  const cards = [
    { label: "Task còn mở", value: k.active, foot: `${k.total} task tổng cộng`, alert: false },
    { label: "Đang làm", value: k.inProgress, foot: "in progress", alert: false },
    { label: "Blocked", value: k.blocked, foot: "cần gỡ để ship", alert: k.blocked > 0 },
    { label: "P0 / P1 mở", value: k.criticalOpen, foot: "ưu tiên nhà đầu tư", alert: k.criticalOpen > 0 },
    { label: "Hoàn thành", value: `${k.completionPct}%`, foot: `${k.done}/${k.total} task`, alert: false, good: k.completionPct >= 60 },
    { label: "ADR mở", value: `${k.adrOpen}/${k.adrTotal}`, foot: "decision log", alert: false },
  ];
  el("kpiGrid").innerHTML = cards
    .map(
      (card) => `
      <div class="kpi ${card.alert ? "is-alert" : ""} ${card.good ? "is-good" : ""}">
        <div class="kpi-label"><span>${card.label}</span></div>
        <div class="kpi-value">${card.value}</div>
        <div class="kpi-foot">${card.foot}</div>
        ${card.label === "Hoàn thành" ? `<div class="progress"><span style="width:${k.completionPct}%"></span></div>` : ""}
      </div>`
    )
    .join("");
}

function openTasks(board) {
  return (board.tasks || []).filter((t) => t.status !== "done");
}

function renderPriority(board) {
  const items = openTasks(board)
    .filter((t) => ["P0", "P1"].includes(t.priority))
    .slice(0, 6);
  el("criticalChip").textContent = `${board.kpis.criticalOpen} critical`;
  el("priorityList").innerHTML = items.length
    ? items
        .map(
          (t) => `
        <div class="p-row" data-task="${escapeHtml(t.id)}">
          <span class="p-dot ${t.priority.toLowerCase()}"></span>
          <div class="p-body">
            <div class="p-title">${escapeHtml(t.title)}</div>
            <div class="p-meta">
              ${statusBadge(t.status)} ${priorityBadge(t.priority)}
              <span>${escapeHtml(t.owner)}</span>
              <span>${SOURCE_ICON[t.source] || ""} ${escapeHtml(t.sourceLabel || t.source)}</span>
            </div>
          </div>
        </div>`
        )
        .join("")
    : `<div class="empty">Không có task P0/P1 đang mở 🎉</div>`;
}

function renderOwners(board) {
  const owners = (board.owners || []).filter((o) => o.total > 0).slice(0, 7);
  const max = Math.max(...owners.map((o) => o.total), 1);
  el("ownerList").innerHTML = owners.length
    ? owners
        .map(
          (o) => `
      <div class="owner-row">
        <span class="avatar">${escapeHtml(initials(o.name))}</span>
        <div class="owner-body">
          <div class="owner-name">${escapeHtml(o.name)}</div>
          <div class="owner-bar"><span style="width:${Math.round((o.total / max) * 100)}%"></span></div>
        </div>
        <span class="owner-count">${o.open + o.in_progress + o.blocked} mở / ${o.total}</span>
      </div>`
        )
        .join("")
    : `<div class="empty">Chưa có owner nào</div>`;
}

function renderOverviewTasks(board) {
  const items = openTasks(board).slice(0, 6);
  el("overviewTasks").innerHTML = items.length
    ? items
        .map(
          (t) => `
      <tr data-task="${escapeHtml(t.id)}">
        <td class="task-cell">
          <strong>${escapeHtml(t.title)}</strong>
          <small>${escapeHtml(t.id)} · ${escapeHtml(t.sourceLabel || t.source)}</small>
        </td>
        <td><span class="avatar" style="width:24px;height:24px;font-size:10px">${escapeHtml(initials(t.owner))}</span> ${escapeHtml(t.owner)}</td>
        <td>${priorityBadge(t.priority)}</td>
        <td>${statusBadge(t.status)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="empty">Không còn task mở</td></tr>`;
}

function renderGateTimeline(board) {
  el("gateTimeline").innerHTML = board.gates.length
    ? board.gates
        .map(
          (gate, index) => `
      <div class="tl-item">
        <div class="tl-rail">
          <span class="tl-dot ${gate.status}"></span>
          ${index < board.gates.length - 1 ? '<span class="tl-line"></span>' : ""}
        </div>
        <div class="tl-body">
          <div class="tl-title">${escapeHtml(gate.id)} ${statusBadge(gate.status)}</div>
          <div class="tl-meta">${escapeHtml(gate.stage || "")}${gate.exitCriteria ? ` · ${escapeHtml(gate.exitCriteria)}` : ""}</div>
        </div>
      </div>`
        )
        .join("")
    : `<div class="empty">Chưa có delivery gate</div>`;
}

function renderNotes(board) {
  const notes = [];
  const blockers = openTasks(board).filter((t) => t.status === "blocked");
  for (const blocker of blockers) {
    notes.push({
      risk: true,
      title: `Blocker · ${blocker.title}`,
      body: `${blocker.description || "Cần owner gỡ blocker"} — owner: ${blocker.owner}`,
    });
  }
  const p0 = openTasks(board).filter((t) => t.priority === "P0" && t.status !== "blocked").slice(0, 2);
  for (const task of p0) {
    notes.push({
      risk: false,
      title: `P0 · ${task.title}`,
      body: task.definitionOfDone || task.description || `Owner: ${task.owner}`,
    });
  }
  const openAdr = board.adrs.filter((a) => a.statusKey !== "done");
  for (const adr of openAdr) {
    notes.push({ risk: false, title: `${adr.id} chưa chốt`, body: adr.title });
  }
  el("notesList").innerHTML = notes.length
    ? notes
        .map(
          (note) => `
      <div class="note ${note.risk ? "is-risk" : ""}">
        <div class="note-title">${escapeHtml(note.title)}</div>
        <div class="note-body">${escapeHtml(note.body)}</div>
      </div>`
        )
        .join("")
    : `<div class="empty">Không có rủi ro mở</div>`;
}

function renderActivity(board) {
  el("generatedChip").textContent = relativeTime(board.generatedAt);
  const rows = [];
  const github = board.sources?.github;
  if (github) {
    rows.push({
      icon: github.error ? "⚠️" : "🐙",
      text: github.error
        ? `GitHub API: ${github.error}`
        : `Đã đọc ${github.count} issue/PR mở từ ${github.repo}`,
      time: relativeTime(github.fetchedAt),
    });
  }
  rows.push({ icon: "📄", text: `Mission brief: ${board.sources?.missionBrief || "—"}`, time: relativeTime(board.generatedAt) });
  rows.push({ icon: "📜", text: `${board.adrs.length} ADR trong ${board.sources?.adrDirectory || "project/fde/adr"}`, time: relativeTime(board.generatedAt) });
  const latest = [...(board.tasks || [])].filter((t) => t.updatedAt).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  if (latest) rows.push({ icon: "🆕", text: `${latest.id} · ${latest.title}`, time: relativeTime(latest.updatedAt) });

  el("activityList").innerHTML = rows
    .map(
      (row) => `
    <div class="act-row">
      <span class="act-icon">${row.icon}</span>
      <div class="act-body">
        <div class="act-text">${escapeHtml(row.text)}</div>
        <div class="act-time">${escapeHtml(row.time)}</div>
      </div>
    </div>`
    )
    .join("");
}

/* ------------------------------------------------------------- task list */
function filteredTasks() {
  const board = state.board;
  if (!board) return [];
  const needle = state.filters.query.trim().toLowerCase();
  return (board.tasks || []).filter((task) => {
    const f = state.filters;
    if (f.status !== "all" && task.status !== f.status) return false;
    if (f.owner !== "all" && task.owner !== f.owner) return false;
    if (f.priority !== "all" && task.priority !== f.priority) return false;
    if (f.source !== "all" && task.source !== f.source) return false;
    if (!needle) return true;
    return `${task.id} ${task.title} ${task.description || ""} ${task.owner} ${(task.tags || []).join(" ")}`
      .toLowerCase()
      .includes(needle);
  });
}

function taskCard(task) {
  const href = task.url && /^https?:/.test(task.url) ? task.url : null;
  return `
  <article class="task-card" data-task="${escapeHtml(task.id)}">
    <div class="task-card-main">
      <div class="task-card-top">
        <span class="task-id">${escapeHtml(task.id)}</span>
        ${priorityBadge(task.priority)}
        ${statusBadge(task.status)}
        <span class="badge source">${SOURCE_ICON[task.source] || ""} ${escapeHtml(task.sourceLabel || task.source)}</span>
      </div>
      <h4 class="task-card-title">${escapeHtml(task.title)}</h4>
      ${task.description ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>` : ""}
      <div class="task-card-meta">
        <span>👤 ${escapeHtml(task.owner)}</span>
        ${task.definitionOfDone ? `<span>✅ ${escapeHtml(task.definitionOfDone)}</span>` : ""}
        ${task.updatedAt ? `<span>🕒 ${escapeHtml(relativeTime(task.updatedAt))}</span>` : ""}
        ${(task.tags || []).slice(0, 3).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
      </div>
    </div>
    <div class="task-card-side">
      ${
        href
          ? `<a class="task-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">Mở ↗</a>`
          : `<a class="task-link" href="/decisions.html">Studio →</a>`
      }
    </div>
  </article>`;
}

function renderTaskList() {
  const items = filteredTasks();
  const list = el("taskList");
  if (!list) return;
  list.innerHTML = items.length
    ? items.map(taskCard).join("")
    : `<div class="empty">Không có task khớp bộ lọc hiện tại.</div>`;
}

function renderKanban(board) {
  const columns = ["blocked", "in_progress", "open", "done"];
  el("kanban").innerHTML = columns
    .map((status) => {
      const items = (board.tasks || []).filter((t) => t.status === status);
      return `
      <div class="kanban-col">
        <div class="kanban-head">
          <span>${STATUS_LABEL[status]}</span>
          <span class="chip">${items.length}</span>
        </div>
        <div class="kanban-cards">
          ${
            items.length
              ? items
                  .map(
                    (t) => `
            <div class="kanban-card" data-task="${escapeHtml(t.id)}">
              <b>${escapeHtml(t.title)}</b>
              <div class="task-card-meta">
                ${priorityBadge(t.priority)}
                <span>${escapeHtml(t.owner)}</span>
              </div>
            </div>`
                  )
                  .join("")
              : `<div class="kanban-empty">Trống</div>`
          }
        </div>
      </div>`;
    })
    .join("");
}

function renderAdrs(board) {
  el("adrChip").textContent = `${board.kpis.adrOpen}/${board.kpis.adrTotal} open`;
  el("adrList").innerHTML = board.adrs.length
    ? board.adrs
        .map(
          (adr) => `
      <div class="adr-item">
        <div class="adr-top">
          <span class="adr-id">${escapeHtml(adr.id)}</span>
          <span class="badge ${adr.statusKey === "done" ? "done" : "in_progress"}">${escapeHtml(adr.status)}</span>
          <span class="adr-title">${escapeHtml(adr.title)}</span>
        </div>
        <div class="adr-meta">
          <span>📅 ${escapeHtml(adr.date || "—")}</span>
          <span>👥 ${escapeHtml((adr.deciders || []).join(", ") || "—")}</span>
          <span>📄 ${escapeHtml(adr.path)}</span>
        </div>
        ${
          adr.followUps?.length
            ? `<ul class="adr-fu">${adr.followUps
                .map((f) => `<li><b>${escapeHtml(f.id || "—")}</b> ${escapeHtml(f.title)}</li>`)
                .join("")}</ul>`
            : ""
        }
      </div>`
        )
        .join("")
    : `<div class="empty">Chưa có ADR nào trong project/fde/adr</div>`;

  const followUps = (board.tasks || []).filter((t) => (t.tags || []).includes("adr"));
  el("adrFollowUps").innerHTML = followUps.length
    ? followUps.map(taskCard).join("")
    : `<div class="empty">Không có follow-up task từ ADR</div>`;
}

function renderGates(board) {
  el("gateChip").textContent = `${board.kpis.gatePassed}/${board.kpis.gateTotal} passed`;
  el("gateList").innerHTML = board.gates.length
    ? board.gates
        .map(
          (gate) => `
      <div class="gate-row">
        <span class="tl-dot ${gate.status}"></span>
        <div>
          <div class="tl-title">${escapeHtml(gate.id)} · ${escapeHtml(gate.stage || "")}</div>
          <div class="gate-crit">${escapeHtml(gate.exitCriteria || "—")}</div>
        </div>
        ${statusBadge(gate.status)}
      </div>`
        )
        .join("")
    : `<div class="empty">Chưa có delivery gate</div>`;
}

function renderMetrics(board) {
  el("metricList").innerHTML = board.metrics.length
    ? board.metrics
        .map(
          (metric) => `
      <div class="metric-row">
        <div class="metric-top">
          <span class="metric-name">${escapeHtml(metric.id)}</span>
          ${statusBadge(metric.status)}
        </div>
        <div class="metric-def">${escapeHtml(metric.definition || "")}</div>
        <div class="metric-goal">🎯 <b>${escapeHtml(metric.target || "—")}</b> · owner ${escapeHtml(metric.owner || "—")}</div>
      </div>`
        )
        .join("")
    : `<div class="empty">Chưa có success metric</div>`;
}

/* --------------------------------------------------------------- filters */
function syncFilterControls(board) {
  const ownerSel = el("ownerFilter");
  const owners = Array.from(new Set((board.tasks || []).map((t) => t.owner))).sort();
  const current = state.filters.owner;
  ownerSel.innerHTML =
    `<option value="all">Mọi owner</option>` +
    owners.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
  ownerSel.value = owners.includes(current) ? current : "all";
  if (ownerSel.value !== current) state.filters.owner = "all";

  el("priorityFilter").value = state.filters.priority;
  el("sourceFilter").value = state.filters.source;

  document.querySelectorAll("#statusFilters .filter").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.value === state.filters.status);
  });
}

/* ----------------------------------------------------------------- views */
const VIEW_META = {
  overview: ["Overview", "Bảng điều hành task còn Open cho nhà đầu tư"],
  tasks: ["All Tasks", "Toàn bộ task từ FDE, ADR và GitHub — lọc theo owner, priority, nguồn"],
  board: ["Kanban", "Luồng công việc: Blocked → In Progress → Open → Done"],
  adr: ["Decision Logs", "Danh sách ADR và follow-up task sinh ra từ quyết định"],
  gates: ["Delivery Gates", "Cổng giao hàng theo vòng đời Forward Deployed Engineering"],
  metrics: ["Success Metrics", "Định nghĩa thành công, target và owner — bằng chứng giá trị"],
};

function setView(view) {
  state.view = view;
  for (const name of Object.keys(VIEW_META)) {
    const section = el(`view-${name}`);
    if (section) section.hidden = name !== view;
  }
  document.querySelectorAll(".side-item[data-view]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === view);
  });
  const [title, sub] = VIEW_META[view] || VIEW_META.overview;
  el("viewTitle").textContent = title;
  el("viewSub").textContent = sub;
  el("sidebar").classList.remove("is-open");
  if (typeof window.scrollTo === "function") {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* jsdom / older embedded webviews: scrolling is cosmetic */
    }
  }
}

/* ----------------------------------------------------------------- modal */
function openModal() {
  el("modal").hidden = false;
  el("taskResult").hidden = true;
  el("taskForm").reset();
  el("fPriority").value = "P1";
  setTimeout(() => el("fTitle").focus(), 30);
}
function closeModal() {
  el("modal").hidden = true;
}

async function submitTask(event) {
  event.preventDefault();
  const title = el("fTitle").value.trim();
  if (!title) return;
  const button = el("submitTask");
  button.disabled = true;
  button.textContent = "Đang tạo…";
  try {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: el("fDesc").value.trim(),
        priority: el("fPriority").value,
        owner: el("fOwner").value.trim(),
      }),
    });
    const data = await response.json();
    const box = el("taskResult");
    box.hidden = false;
    if (data.ok && data.mode === "github") {
      box.innerHTML = `✅ Đã tạo GitHub issue #${data.issue.number} — <a href="${escapeHtml(data.issue.url)}" target="_blank" rel="noopener">mở issue ↗</a>`;
      await loadBoard({ refresh: true });
    } else if (data.ok) {
      box.innerHTML =
        `⚠️ Chưa có <code>GITHUB_TOKEN</code> trên server (${escapeHtml(data.reason || "manual")}). ` +
        `Dùng một trong hai cách dưới đây để task vào đúng nguồn sự thật:` +
        `<a href="${escapeHtml(data.newIssueUrl || "#")}" target="_blank" rel="noopener">Mở form tạo issue ↗</a>` +
        `<code>${escapeHtml(data.command || "")}</code>`;
    } else {
      box.innerHTML = `❌ ${escapeHtml(data.error || "Không tạo được task")}`;
    }
  } catch (error) {
    const box = el("taskResult");
    box.hidden = false;
    box.innerHTML = `❌ Lỗi kết nối: ${escapeHtml(error.message)}. Trên static host, hãy tạo issue trực tiếp trên GitHub.`;
  } finally {
    button.disabled = false;
    button.textContent = "Tạo task";
  }
}

/* ------------------------------------------------------------------ boot */
function bindEvents() {
  document.querySelectorAll(".side-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.querySelectorAll("[data-view].link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setView(link.dataset.view);
    });
  });

  el("statusFilters").addEventListener("click", (event) => {
    const btn = event.target.closest(".filter");
    if (!btn) return;
    state.filters.status = btn.dataset.value;
    document.querySelectorAll("#statusFilters .filter").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderTaskList();
  });

  el("ownerFilter").addEventListener("change", (event) => {
    state.filters.owner = event.target.value;
    renderTaskList();
  });
  el("priorityFilter").addEventListener("change", (event) => {
    state.filters.priority = event.target.value;
    renderTaskList();
  });
  el("sourceFilter").addEventListener("change", (event) => {
    state.filters.source = event.target.value;
    renderTaskList();
  });

  let searchTimer = null;
  el("search").addEventListener("input", (event) => {
    state.filters.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (state.view !== "tasks") setView("tasks");
      renderTaskList();
    }, 120);
  });

  el("refreshBtn").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    await loadBoard({ refresh: true });
    btn.disabled = false;
  });

  el("newTaskBtn").addEventListener("click", openModal);
  el("modalClose").addEventListener("click", closeModal);
  el("modalCancel").addEventListener("click", closeModal);
  el("modal").addEventListener("click", (event) => {
    if (event.target === el("modal")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el("modal").hidden) closeModal();
  });
  el("taskForm").addEventListener("submit", submitTask);

  el("menuToggle").addEventListener("click", () => el("sidebar").classList.toggle("is-open"));
}

bindEvents();
setView("overview");
loadBoard();
// Keep the "x phút trước" labels honest without a full reload.
setInterval(() => {
  if (state.board) renderActivity(state.board);
}, 60_000);
