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

const ADR_LIFECYCLE = ["proposed", "accepted", "deprecated", "superseded"];
const EVENT_KIND_LABEL = {
  meeting: "Meeting",
  review: "Review",
  uat: "UAT",
  gate: "Gate",
  sync: "Sync",
  decision: "Decision",
  deadline: "Deadline",
};

const state = {
  board: null,
  registry: null,
  portfolio: null,
  schedule: null,
  weekAnchor: null, // ISO date of the day selected in the week strip
  view: "overview",
  filters: { status: "all", owner: "all", priority: "all", source: "all", query: "" },
  projectFilter: "all",
  alertFilter: "all",
  selectedProject: null,
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
/** 12-hour clock label, matching the reference card ("01:00 PM"). */
function clockLabel(time) {
  const [h, m] = String(time || "").split(":").map(Number);
  if (!Number.isFinite(h)) return String(time || "—");
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

function formatRange(start, end) {
  return `${clockLabel(start)} to ${clockLabel(end)}`;
}

function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoOf(date);
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
    const [boardRes, registryRes] = await Promise.all([
      fetch(`/api/tasks${refresh ? "?refresh=1" : ""}`, { headers: { Accept: "application/json" } }),
      fetch("/api/tasks/adrs/registry", { headers: { Accept: "application/json" } }),
    ]);
    if (!boardRes.ok) throw new Error(`HTTP ${boardRes.status}`);
    state.board = await boardRes.json();
    state.registry = registryRes.ok ? await registryRes.json() : null;
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
  await Promise.all([loadSchedule(), loadPortfolio()]);
  render();
}

/**
 * Portfolio overlay (projects / alerts / releases). Derived from the release
 * manifest + brief + ADRs + schedule, so it must fail independently.
 */
async function loadPortfolio() {
  try {
    const response = await fetch("/api/tasks/portfolio", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.portfolio = await response.json();
  } catch (error) {
    state.portfolio = { ok: false, error: error.message || "network_error", projects: [], alerts: [], totals: {} };
  }
  renderPortfolio();
}

/** Schedule is its own endpoint: a broken calendar must never blank the board. */
async function loadSchedule({ anchor = null } = {}) {
  const query = anchor ? `?anchor=${encodeURIComponent(anchor)}` : "";
  try {
    const response = await fetch(`/api/schedule${query}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.schedule = await response.json();
    state.schedule.error = null;
  } catch (error) {
    state.schedule = {
      ok: false,
      error: error.message || "network_error",
      range: null,
      timezone: "Asia/Ho_Chi_Minh",
      days: [],
      meetings: [],
      upcoming: [],
      stats: { meetings: 0, deadlines: 0, requiredRoles: [], linkedTasks: 0 },
    };
  }
  renderSchedule();
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
    kpis: { total: 0, active: 0, open: 0, inProgress: 0, blocked: 0, done: 0, completionPct: 0, adrOpen: 0, adrTotal: 0, adrAccepted: 0, adrProposed: 0, gatePassed: 0, gateTotal: 0, criticalOpen: 0 },
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
  renderAdrRegistry();
  renderPortfolio();
  renderSchedule();
  renderGates(board);
  renderMetrics(board);
  syncFilterControls(board);
}

function renderHero(board) {
  el("heroEyebrow").textContent = `FDE CONTROL PLANE · ${String(board.currentStage || "pilot").toUpperCase()}`;
  el("heroTitle").textContent = board.mission || "Game9K project mission";
  el("heroSub").textContent =
    `Project ${board.projectId || "—"} · ${board.kpis.active} task còn mở · ` +
    `${board.kpis.criticalOpen} việc P0/P1 · ${board.kpis.adrAccepted}/${board.kpis.adrTotal} ADR đã chốt · ` +
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
    {
      label: "ADR đã chốt",
      value: `${k.adrAccepted}/${k.adrTotal}`,
      foot: `${k.adrProposed} đang proposed`,
      alert: k.adrProposed > 0,
      good: k.adrProposed === 0 && k.adrTotal > 0,
    },
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

/* ------------------------------------------------------------- schedule */
/**
 * Week strip + timed event rows, mirroring the reference layout:
 * `Mo 15 … Su 21` with today circled, then "Kickoff Meeting · 01:00 PM to
 * 02:30 PM" rows carrying stacked attendee avatars.
 */
function eventRow(meeting) {
  const kind = meeting.kind || "meeting";
  const roles = meeting.attendeeRoles?.length
    ? meeting.attendeeRoles
    : (meeting.attendees || []).map((attendee) => attendee.role);
  const avatars = roles
    .slice(0, 3)
    .map((role) => `<span class="avatar" title="${escapeHtml(role)}">${escapeHtml(initials(role))}</span>`)
    .join("");
  const overflow = roles.length > 3
    ? `<span class="avatar more" title="${escapeHtml(roles.slice(3).join(", "))}">+${roles.length - 3}</span>`
    : "";
  return `
    <div class="event-row kind-${escapeHtml(kind)}">
      <div class="event-time">
        <span>${clockLabel(meeting.start)}</span>
        <span>${clockLabel(meeting.end)}</span>
      </div>
      <div class="event-body">
        <div class="event-title">
          <span class="event-kind">${escapeHtml(EVENT_KIND_LABEL[kind] || kind)}</span>
          ${escapeHtml(meeting.title)}
        </div>
        <div class="event-meta">
          <span class="event-range">${formatRange(meeting.start, meeting.end)}</span>
          <span>👤 ${escapeHtml(meeting.owner || "—")}</span>
          ${meeting.location ? `<span>📍 ${escapeHtml(meeting.location)}</span>` : ""}
          ${
            meeting.linkedTask
              ? `<a href="#tasks" class="link" data-view="tasks">${escapeHtml(meeting.linkedTask.id)} · ${escapeHtml(meeting.linkedTask.priority || "")}</a>`
              : ""
          }
        </div>
      </div>
      <div class="event-side">
        <span class="avatar-stack">${avatars}${overflow}</span>
        <button class="icon-btn sm" data-event-menu="${escapeHtml(meeting.id)}" aria-label="Tùy chọn sự kiện">⋯</button>
      </div>
    </div>`;
}

function deadlineRow(entry) {
  return `
    <div class="event-row is-deadline">
      <div class="event-time"><span>Deadline</span><span>${escapeHtml(entry.kind)}</span></div>
      <div class="event-body">
        <div class="event-title">${escapeHtml(entry.title)}</div>
        <div class="event-meta">
          <span>👤 ${escapeHtml(entry.owner || "—")}</span>
          <span>🔖 ${escapeHtml(entry.id || "")}</span>
        </div>
      </div>
      <div class="event-side"></div>
    </div>`;
}

function renderSchedule() {
  const week = state.schedule;
  const targets = [
    { strip: "weekStrip", list: "scheduleList", foot: "scheduleFoot", range: "scheduleRange", limitDays: true },
    { strip: "weekStripFull", list: "scheduleListFull", foot: "scheduleFootFull", range: "scheduleViewRange", limitDays: false },
  ];

  for (const target of targets) {
    const strip = el(target.strip);
    const list = el(target.list);
    const foot = el(target.foot);
    const range = el(target.range);
    if (!strip || !list) continue;

    if (!week || !week.days?.length) {
      strip.innerHTML = "";
      const reason = week?.error ? `Không tải được lịch (${week.error})` : "Đang tải lịch…";
      list.innerHTML = `<div class="schedule-empty">${escapeHtml(reason)}</div>`;
      if (foot) foot.innerHTML = "";
      if (range) range.textContent = "—";
      continue;
    }

    const selected = state.weekAnchor && week.days.some((day) => day.date === state.weekAnchor)
      ? state.weekAnchor
      : week.days.find((day) => day.isToday)?.date || week.days[0].date;

    if (range) {
      const start = week.days[0];
      const end = week.days[6];
      // Cross-month weeks keep the month so "Su 6" can never be read as Nov 6.
      const crossesMonth = start.date.slice(0, 7) !== end.date.slice(0, 7);
      const label = (day) =>
        crossesMonth ? `${day.short} ${day.dayOfMonth}/${day.date.slice(5, 7)}` : `${day.short} ${day.dayOfMonth}`;
      range.textContent = `${label(start)} – ${label(end)}`;
    }

    strip.innerHTML = week.days
      .map((day) => {
        const classes = ["week-day"];
        if (day.isToday) classes.push("is-today");
        if (day.date === selected) classes.push("is-selected");
        return `<button class="${classes.join(" ")}" data-day="${day.date}" title="${escapeHtml(day.label)} ${day.dayOfMonth}">
          <span class="wd-label">${day.short}</span>
          <span class="wd-num">${day.dayOfMonth}</span>
          <span class="wd-dot ${day.meetings.length ? "has-event" : ""}"></span>
        </button>`;
      })
      .join("");

    // Compact card shows the selected day; the Schedule view shows the week.
    const visibleDays = target.limitDays ? week.days.filter((day) => day.date === selected) : week.days;
    const blocks = visibleDays
      .map((day) => {
        const rows = [...day.meetings.map(eventRow), ...day.deadlines.map(deadlineRow)];
        if (!rows.length) return "";
        return `<div class="schedule-day-label">${escapeHtml(day.label)} · ${day.dayOfMonth}</div>${rows.join("")}`;
      })
      .join("");
    list.innerHTML = blocks || '<div class="schedule-empty">Không có cuộc họp nào trong ngày này.</div>';

    if (foot) {
      const stats = week.stats || {};
      const link = target.limitDays
        ? '<a href="#schedule" class="link" data-view="schedule">Xem cả tuần →</a>'
        : "";
      foot.innerHTML = `
        <span>${stats.meetings ?? 0} cuộc họp · ${stats.deadlines ?? 0} deadline tuần này ${link}</span>
        <span>${escapeHtml(week.timezone || "Asia/Ho_Chi_Minh")} · ${week.days[0].date} → ${week.days[6].date}</span>`;
    }
  }
}

async function shiftWeek(days) {
  const week = state.schedule;
  if (!week?.days?.length) return;
  const base = state.weekAnchor || week.days.find((day) => day.isToday)?.date || week.days[0].date;
  const next = shiftDays(base, days);
  state.weekAnchor = next;
  await loadSchedule({ anchor: next });
}

/* ------------------------------------------- portfolio (Jira-clone parity) */
const PROJECT_STATUS_LABEL = {
  active: "Active",
  planning: "Planning",
  shipped: "Shipped",
};
const HEALTH_LABEL = {
  "at-risk": "Có blocker",
  "on-track": "Đúng nhịp",
  starting: "Khởi động",
};
const ALERT_ICON = {
  issue: "🐞",
  gate: "🛡️",
  decision: "📜",
  schedule: "📅",
  project: "📁",
  system: "⚙️",
};

function renderPortfolio() {
  const portfolio = state.portfolio;
  if (!portfolio) return;

  el("navProjects").textContent = portfolio.totals?.projects ?? 0;
  el("navAlerts").textContent = portfolio.totals?.alerts ?? 0;
  el("navReleases").textContent = portfolio.totals?.games ?? 0;

  renderSprintCard(portfolio);
  renderStatusDonut(portfolio);
  renderAlertPreview(portfolio);
  renderProjects(portfolio);
  renderAlerts(portfolio);
  renderReleases(portfolio);
}

/** Sidebar card: real week + real gate progress (Jira "Sprint 24"). */
function renderSprintCard(portfolio) {
  const sprint = portfolio.sprint || {};
  if (!el("sprintCard")) return;
  el("sprintDays").textContent = sprint.daysRemaining === null || sprint.daysRemaining === undefined
    ? "—"
    : `${sprint.daysRemaining} ngày còn lại`;
  const progress = sprint.gateProgress ?? 0;
  el("sprintBar").style.width = `${progress}%`;
  const next = sprint.nextMeeting;
  el("sprintMeta").innerHTML =
    `${sprint.gatesPassed ?? 0}/${sprint.gatesTotal ?? 0} gate đã qua · ${sprint.meetings ?? 0} cuộc họp` +
    (next
      ? `<br /><b>${escapeHtml(next.date.slice(5))} ${escapeHtml(clockLabel(next.start))}</b> · ${escapeHtml(next.title)}`
      : "");
}

/** Donut built from the same status counts the KPI cards use. */
function renderStatusDonut(portfolio) {
  const donut = el("statusDonut");
  if (!donut) return;
  const breakdown = portfolio.statusBreakdown || { total: 0, slices: [] };
  const total = breakdown.total || 0;
  el("donutChip").textContent = `${total} task`;

  if (!total) {
    donut.innerHTML = "";
    el("statusLegend").innerHTML = '<div class="empty">Chưa có task để vẽ</div>';
    return;
  }

  const size = 156;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const slices = breakdown.slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const length = (slice.value / total) * circumference;
      const circle = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent"
        stroke="${slice.color}" stroke-width="${stroke}"
        stroke-dasharray="${length} ${circumference - length}"
        stroke-dashoffset="${-offset}" />`;
      offset += length;
      return circle;
    })
    .join("");

  donut.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut-svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="#eef1f7" stroke-width="${stroke}" />
      <g transform="rotate(-90 ${size / 2} ${size / 2})">${slices}</g>
      <text x="50%" y="47%" text-anchor="middle" class="donut-total">${total}</text>
      <text x="50%" y="61%" text-anchor="middle" class="donut-sub">task</text>
    </svg>`;

  el("statusLegend").innerHTML = breakdown.slices
    .map(
      (slice) => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${slice.color}"></span>
        <span class="legend-label">${escapeHtml(STATUS_LABEL[slice.status] || slice.label)}</span>
        <span class="legend-value">${slice.value} · ${slice.pct}%</span>
      </div>`
    )
    .join("");
}

function alertRow(alert, { compact = false } = {}) {
  const link = alert.link || {};
  const targetView = link.kind === "adr" ? "adr" : link.kind === "meeting" ? "schedule" : link.kind === "gate" ? "gates" : link.kind === "project" ? "projects" : "tasks";
  return `
    <div class="alert-row level-${escapeHtml(alert.level)}">
      <span class="alert-icon">${ALERT_ICON[alert.category] || "•"}</span>
      <div class="alert-body">
        <div class="alert-title">
          <span class="alert-level">${escapeHtml(alert.level)}</span>
          ${escapeHtml(alert.title)}
        </div>
        ${compact ? "" : `<div class="alert-desc">${escapeHtml(alert.description || "")}</div>`}
        <div class="alert-meta">
          <span class="chip">${escapeHtml(alert.category)}</span>
          ${link.id ? `<a class="link" href="#${targetView}" data-view="${targetView}">${escapeHtml(link.kind)} · ${escapeHtml(link.id)} →</a>` : ""}
          ${alert.at ? `<span>${escapeHtml(alert.at)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

function renderAlertPreview(portfolio) {
  const list = el("alertPreview");
  if (!list) return;
  const alerts = (portfolio.alerts || []).slice(0, 4);
  list.innerHTML = alerts.length
    ? alerts.map((alert) => alertRow(alert, { compact: true })).join("")
    : '<div class="empty">Không có cảnh báo nào 🎉</div>';
}

function renderAlerts(portfolio) {
  const list = el("alertList");
  if (!list) return;
  const all = portfolio.alerts || [];
  const filter = state.alertFilter;
  const filtered = all.filter((alert) =>
    filter === "all" ? true : filter === "critical" ? alert.level === "critical" : alert.category === filter
  );
  el("alertChip").textContent = `${filtered.length}/${all.length} cảnh báo`;
  list.innerHTML = filtered.length
    ? filtered.map((alert) => alertRow(alert)).join("")
    : '<div class="empty">Không có cảnh báo khớp bộ lọc.</div>';
}

function projectMatchesFilter(project, filter) {
  if (filter === "all") return true;
  if (filter === "at-risk") return project.health === "at-risk";
  return project.kind === filter;
}

function renderProjects(portfolio) {
  const grid = el("projectGrid");
  if (!grid) return;
  const projects = (portfolio.projects || []).filter((project) => projectMatchesFilter(project, state.projectFilter));
  const all = portfolio.projects || [];
  const pointsTotal = all.reduce((sum, project) => sum + (project.points?.total || 0), 0);
  const pointsDone = all.reduce((sum, project) => sum + (project.points?.done || 0), 0);
  el("projectChip").textContent = `${projects.length}/${all.length} project`;
  el("projectPointsChip").textContent = `${pointsDone}/${pointsTotal} điểm`;

  grid.innerHTML = projects.length
    ? projects
        .map(
          (project) => `
      <article class="project-card" style="--project-color:${project.color}">
        <div class="project-stripe"></div>
        <header class="project-head">
          <div>
            <h4>${escapeHtml(project.name)}</h4>
            <div class="project-sub">
              ${escapeHtml(project.kind === "game" ? "Game package" : "FDE program")}
              ${project.release?.version ? ` · v${escapeHtml(project.release.version)}` : ""}
              ${project.release?.legal ? ` · ${escapeHtml(project.release.legal)}` : ""}
            </div>
          </div>
          <span class="badge ${project.status === "shipped" ? "done" : project.status === "active" ? "in_progress" : "open"}">${escapeHtml(PROJECT_STATUS_LABEL[project.status] || project.status)}</span>
        </header>

        <div class="project-kpis">
          <div><b>${project.issues?.total ?? 0}</b><span>task</span></div>
          <div><b>${project.issues?.blocked ?? 0}</b><span>blocker</span></div>
          <div><b>${project.completionPct ?? 0}%</b><span>effort</span></div>
        </div>

        <div class="owner-bar"><span style="width:${project.completionPct ?? 0}%;background:${project.color}"></span></div>
        <div class="project-meta">
          <span class="chip">${escapeHtml(HEALTH_LABEL[project.health] || project.health)}</span>
          <span>👤 ${escapeHtml(project.owner || "—")}</span>
          ${project.release?.budgetKb ? `<span>📦 ${project.release.gzipKb}/${project.release.budgetKb} KB</span>` : ""}
        </div>

        ${
          project.topIssues?.length
            ? `<ul class="project-issues">${project.topIssues
                .map((issue) => `<li><b>${escapeHtml(issue.id)}</b> ${priorityBadge(issue.priority)} ${escapeHtml(issue.title)}</li>`)
                .join("")}</ul>`
            : '<div class="project-empty">Không còn task mở trên project này</div>'
        }
      </article>`
        )
        .join("")
    : '<div class="empty">Không có project khớp bộ lọc.</div>';

  const max = Math.max(...all.map((project) => project.points?.total || 0), 1);
  el("projectEffort").innerHTML = all
    .map(
      (project) => `
      <div class="effort-row">
        <span class="effort-name">${escapeHtml(project.name)}</span>
        <div class="effort-bar">
          <span style="width:${Math.round(((project.points?.done || 0) / max) * 100)}%;background:${project.color}"></span>
          <i style="width:${Math.round(((project.points?.remaining || 0) / max) * 100)}%"></i>
        </div>
        <span class="effort-value">${project.points?.done ?? 0}/${project.points?.total ?? 0}</span>
      </div>`
    )
    .join("");
}

function renderReleases(portfolio) {
  const body = el("releaseRows");
  if (!body) return;
  const games = (portfolio.projects || []).filter((project) => project.kind === "game");
  const release = portfolio.release;
  el("releaseChip").textContent = release?.bundleSha256
    ? `bundle ${release.bundleSha256.slice(0, 10)}…`
    : "chưa có dist/";

  body.innerHTML = games.length
    ? games
        .map((project) => {
          const rel = project.release || {};
          const state_ = rel.ready ? "done" : rel.budgetPct > 100 ? "blocked" : "in_progress";
          return `
        <tr>
          <td class="task-cell">
            <strong>${escapeHtml(project.name)}</strong>
            <small>${escapeHtml(project.id)} · ${rel.fileCount ?? 0} file</small>
          </td>
          <td>v${escapeHtml(rel.version || "—")}</td>
          <td>${rel.legal ? `<span class="badge source">${escapeHtml(rel.legal)}</span>` : "—"}</td>
          <td>
            <div class="budget-cell">
              <span>${rel.gzipKb ?? "—"} / ${rel.budgetKb ?? "—"} KB</span>
              <div class="owner-bar"><span style="width:${Math.min(100, rel.budgetPct ?? 0)}%;background:${rel.ready ? "var(--green)" : "var(--amber)"}"></span></div>
            </div>
          </td>
          <td><code class="sha">${escapeHtml(String(rel.sha256 || "").slice(0, 12))}…</code></td>
          <td>${statusBadge(state_)}</td>
          <td><a class="link" href="/games/${escapeHtml(project.id)}/index.html" target="_blank" rel="noopener">Mở game ↗</a></td>
        </tr>`;
        })
        .join("")
    : '<tr><td colspan="7" class="empty">Chưa có release manifest — chạy <code>npm run build</code>.</td></tr>';

  el("releaseFoot").innerHTML = release
    ? `<span>bundle sha256 ${escapeHtml(release.bundleSha256 || "—")}</span>
       <span>${release.artifactCount ?? 0} artifact · ${(release.standaloneBundles || []).length} standalone · build ${escapeHtml(String(release.generatedAt || "").slice(0, 10))}</span>`
    : "<span>dist/release-manifest.json chưa có trong bản deploy này</span>";

  const standalone = release?.standaloneBundles || [];
  el("releaseFiles").innerHTML = standalone.length
    ? standalone
        .map(
          (bundle) => `
      <div class="release-file">
        <span class="chip">standalone</span>
        <span class="release-path">${escapeHtml(bundle.path)}</span>
        <span class="release-size">${bundle.rawKb} KB · gzip ${bundle.gzipKb} KB</span>
      </div>`
        )
        .join("")
    : '<div class="empty">Không có standalone bundle trong manifest</div>';
}

/* --------------------------------------------------- ADR governance panel */
/** Lifecycle + lineage + findings + graph, straight from `/api/tasks/adrs/registry`. */
function renderAdrRegistry() {
  const registry = state.registry;
  if (!el("adrGraph")) return;

  if (!registry) {
    el("adrGraph").innerHTML = '<div class="empty">Không đọc được ADR registry</div>';
    if (el("adrFindings")) el("adrFindings").innerHTML = "";
    if (el("adrGraphChip")) el("adrGraphChip").textContent = "—";
    return;
  }

  const summary = registry.summary || {};
  if (el("adrGraphChip")) {
    el("adrGraphChip").textContent = `${summary.ok ? "0 error" : `${summary.errors} error`} · next ${summary.nextId || "—"}`;
    el("adrGraphChip").className = `chip ${summary.ok ? "chip-good" : "chip-warn"}`;
  }

  const graph = registry.graph || { nodes: [], edges: [] };
  const edgesByFrom = new Map();
  for (const edge of graph.edges || []) {
    if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, []);
    edgesByFrom.get(edge.from).push(edge);
  }

  el("adrGraph").innerHTML = (graph.nodes || []).length
    ? graph.nodes
        .map((node) => {
          const outgoing = edgesByFrom.get(node.id) || [];
          return `
        <div class="adr-graph-node">
          <span class="gn-id">${escapeHtml(node.id)}</span>
          <span class="adr-status ${node.status === "accepted" ? "is-reached" : ""}">${escapeHtml(node.status)}</span>
          <span>${escapeHtml(node.title)}</span>
        </div>
        ${outgoing
          .filter((edge) => edge.kind !== "shared-task")
          .map((edge) => `<div class="adr-graph-edge">↳ ${escapeHtml(edge.kind)} → <code>${escapeHtml(edge.to)}</code> ${escapeHtml(edge.reason || "")}</div>`)
          .join("")}`;
        })
        .join("")
    : '<div class="empty">Chưa có ADR nào để vẽ graph</div>';

  const findings = registry.findings || [];
  if (el("adrFindings")) {
    el("adrFindings").innerHTML = findings.length
      ? findings
          .map(
            (finding) => `
        <div class="adr-finding ${finding.severity === "error" ? "error" : "warn"}">
          <span>${finding.severity === "error" ? "⛔" : "⚠️"}</span>
          <span><b>${escapeHtml(finding.rule)}</b> · ${escapeHtml(finding.adrId || "")} — ${escapeHtml(finding.message)}</span>
        </div>`
          )
          .join("")
      : '<div class="empty">Không có vi phạm — MADR v4 + hve-core ADR standard đang sạch.</div>';
  }

  const config = registry.config || {};
  if (el("adrConfigLine")) {
    el("adrConfigLine").textContent =
      `${registry.adrDir || "project/fde/adr"} · template ${config.template_source || "_template.md"} · ` +
      `last_decision_id ${config.last_decision_id || "—"} · layout ${config.graph_layout || "lane"}`;
  }
}

function renderAdrs(board) {
  el("adrChip").textContent = `${board.kpis.adrAccepted}/${board.kpis.adrTotal} accepted`;
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
          ${adr.type ? `<span class="adr-type">${escapeHtml(adr.type)}</span>` : ""}
          <span>📅 ${escapeHtml(adr.date || "—")}</span>
          <span>👥 ${escapeHtml((adr.deciders || []).join(", ") || "—")}</span>
          <span>📄 ${escapeHtml(adr.path)}</span>
        </div>
        <div class="adr-status-line">
          ${ADR_LIFECYCLE.map((step) => {
            const current = step === String(adr.rawStatus || "");
            return `<span class="adr-status ${current ? "is-current" : ""}">${escapeHtml(step)}</span>`;
          }).join("")}
        </div>
        ${
          adr.supersedes?.length || adr.supersededBy
            ? `<div class="adr-lineage">
                ${adr.supersedes?.length ? `Supersedes <code>${escapeHtml(adr.supersedes.join(", "))}</code>` : ""}
                ${adr.supersededBy ? ` · Superseded by <code>${escapeHtml(adr.supersededBy)}</code>` : ""}
              </div>`
            : ""
        }
        ${
          adr.asrTriggers?.length
            ? `<div class="adr-lineage">⚡ ASR: ${adr.asrTriggers
                .map((trigger) => escapeHtml(trigger.kind))
                .join(", ")}</div>`
            : ""
        }
        ${
          adr.findings?.length
            ? `<div class="adr-findings">${adr.findings
                .map((finding) => {
                  const icon = finding.severity === "error" ? "⛔" : "⚠️";
                  const cls = finding.severity === "error" ? "error" : "warn";
                  return `<div class="adr-finding ${cls}">${icon} ${escapeHtml(finding.rule)}</div>`;
                })
                .join("")}</div>`
            : ""
        }
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
  projects: ["Projects", "Project thật từ release manifest: game package đã verify + chương trình FDE"],
  notifications: ["Notifications", "Cảnh báo suy ra từ blocker, gate, ADR, lịch họp và bundle budget"],
  releases: ["Releases", "Gói phát hành đã verify: version, legal class, budget, bundle sha256"],
  schedule: ["Schedule", "Lịch họp tuần + deadline sinh ra từ delivery gate, ADR và task"],
  adr: ["Decision Logs", "ADR theo MADR v4 + hve-core: lifecycle, supersession, ASR trigger, graph và follow-up"],
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
  // Delegated: in-card links ("Xem cả tuần →", task id in an event row) are
  // re-rendered on every refresh, so a per-node listener would go stale.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.link[data-view]");
    if (!link) return;
    event.preventDefault();
    setView(link.dataset.view);
  });

  el("statusFilters").addEventListener("click", (event) => {
    const btn = event.target.closest(".filter");
    if (!btn) return;
    state.filters.status = btn.dataset.value;
    document.querySelectorAll("#statusFilters .filter").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderTaskList();
  });

  el("projectFilters")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-project-filter]");
    if (!btn) return;
    state.projectFilter = btn.dataset.projectFilter;
    document.querySelectorAll("#projectFilters .filter").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderProjects(state.portfolio || {});
  });

  el("alertFilters")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-alert-filter]");
    if (!btn) return;
    state.alertFilter = btn.dataset.alertFilter;
    document.querySelectorAll("#alertFilters .filter").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderAlerts(state.portfolio || {});
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

  // ---- Schedule: week pager + day selection ----
  for (const id of ["weekPrev", "weekPrevFull"]) {
    el(id)?.addEventListener("click", () => shiftWeek(-7));
  }
  for (const id of ["weekNext", "weekNextFull"]) {
    el(id)?.addEventListener("click", () => shiftWeek(7));
  }

  const dayClick = (event) => {
    const btn = event.target.closest("[data-day]");
    if (!btn) return;
    const date = btn.dataset.day;
    state.weekAnchor = date;
    const week = state.schedule;
    if (week?.days?.length && !week.days.some((day) => day.date === date)) {
      loadSchedule({ anchor: date });
      return;
    }
    renderSchedule();
  };
  el("weekStrip")?.addEventListener("click", dayClick);
  el("weekStripFull")?.addEventListener("click", dayClick);

  // ---- Event row menu: show the agenda that makes the meeting actionable ----
  const eventMenu = (event) => {
    const trigger = event.target.closest("[data-event-menu]");
    if (!trigger) return;
    const meeting = (state.schedule?.meetings || []).find((item) => item.id === trigger.dataset.eventMenu);
    if (!meeting) return;
    const lines = (meeting.agenda || []).map((line, index) => `${index + 1}. ${line}`);
    const text = [meeting.title, "", ...lines].join("\n");
    if (typeof window.alert === "function") window.alert(text);
  };
  el("scheduleList")?.addEventListener("click", eventMenu);
  el("scheduleListFull")?.addEventListener("click", eventMenu);

}

bindEvents();
setView("overview");
loadBoard();
// Keep the "x phút trước" labels honest without a full reload.
setInterval(() => {
  if (state.board) renderActivity(state.board);
}, 60_000);
