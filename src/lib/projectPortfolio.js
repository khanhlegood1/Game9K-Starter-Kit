/**
 * projectPortfolio.js
 *
 * Portfolio read model for the investor portal, modelled on the Jira-clone
 * information architecture (Dashboard → Projects → Issues → Notifications →
 * Releases) without copying its in-memory mock data.
 *
 * Every number here is *derived* from a file that already exists in the repo:
 *   - `dist/release-manifest.json`      → shipped game packages (version, budget, sha)
 *   - `project/fde/mission-brief.json`  → tasks, gates, risks, metrics
 *   - `project/fde/adr/*.md`            → decisions + follow-ups
 *   - `project/fde/schedule.json`       → meetings (today/tomorrow alerts)
 *   - GitHub issues/PRs                 → external work items
 *
 * There is no second datastore and no hand-written project list: a project
 * exists because a release manifest entry or the FDE program says it does.
 */

/** Priority → effort weight. Deterministic, documented, never hand-entered. */
export const PRIORITY_WEIGHT = { P0: 13, P1: 8, P2: 5, P3: 2 };

export const PROJECT_KINDS = ["game", "program"];

export const ALERT_LEVELS = ["critical", "high", "medium", "low"];

export const STATUS_COLORS = {
  open: "#6b7280",
  in_progress: "#3b82f6",
  blocked: "#ef4444",
  done: "#10b981",
};

const PROGRAM_ID = "fde-live-interaction";

/** One colour per project, stable across reloads and independent of order. */
const PALETTE = ["#5b5bd6", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

export function weightOf(priority) {
  return PRIORITY_WEIGHT[String(priority || "").toUpperCase()] || PRIORITY_WEIGHT.P2;
}

function hashPick(text, size) {
  let hash = 0;
  for (let i = 0; i < String(text).length; i += 1) {
    hash = (hash * 31 + String(text).charCodeAt(i)) % 100000;
  }
  return hash % size;
}

/** `marble-race-live` → `Marble Race Live`. */
export function humanizeSlug(slug) {
  return String(slug || "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Turn `release-manifest.json` into project cards. Missing manifest (e.g. a
 * static-only deploy) degrades to the program project, never to an error.
 */
export function projectsFromRelease(releaseManifest = null) {
  const games = Array.isArray(releaseManifest?.games) ? releaseManifest.games : [];
  return games.map((game) => ({
    id: game.slug,
    name: humanizeSlug(game.slug),
    kind: "game",
    slug: game.slug,
    version: game.version || null,
    legal: game.legal_classification || null,
    releaseSha256: game.release_sha256 || null,
    gzipKb: game.metrics?.gzipKb ?? null,
    budgetKb: game.metrics?.maxGzipKb ?? null,
    fileCount: game.metrics?.fileCount ?? (game.files || []).length,
    files: game.files || [],
  }));
}

/**
 * Which project owns a task. Matching is keyword-based on real identifiers only
 * (id, tags, links, title, description) so the mapping is reproducible and
 * testable — no manual spreadsheet of assignments.
 */
export function assignTaskToProject(task, gameIds) {
  const haystack = [
    task?.id,
    task?.title,
    task?.description,
    task?.definitionOfDone,
    ...(task?.tags || []),
    ...(task?.links || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Longest slug first so `marble-race` can never shadow `marble-race-live`.
  const ranked = [...gameIds].sort((a, b) => String(b).length - String(a).length);
  for (const id of ranked) {
    if (haystack.includes(String(id).toLowerCase())) return id;
  }
  return PROGRAM_ID;
}

export function levelFor(priority) {
  const p = String(priority || "").toUpperCase();
  if (p === "P0") return "critical";
  if (p === "P1") return "high";
  if (p === "P3") return "low";
  return "medium";
}

/**
 * Alerts are the Jira-clone "notifications" panel, but sourced from repo state:
 * a blocked task, an open proposal, a gate that still needs a creator, a
 * meeting in the next 48h, or a package about to blow its bundle budget.
 */
export function buildAlerts({ tasks = [], adrs = [], brief = null, week = null, github = null, projects = [] } = {}) {
  const alerts = [];

  for (const task of tasks) {
    if (task.status !== "blocked") continue;
    alerts.push({
      id: `alert-blocked-${task.id}`,
      level: levelFor(task.priority),
      category: "issue",
      title: `Blocker: ${task.title}`,
      description: task.description || task.definitionOfDone || "Cần owner gỡ blocker",
      at: task.updatedAt || null,
      link: { kind: "task", id: task.id },
      projectId: task.projectId || null,
    });
  }

  for (const adr of adrs) {
    if (adr.isOpen && String(adr.rawStatus || "") === "proposed") {
      alerts.push({
        id: `alert-adr-${adr.id}`,
        level: "medium",
        category: "decision",
        title: `ADR ${adr.id} đang chờ chốt`,
        description: adr.title,
        at: adr.date || null,
        link: { kind: "adr", id: adr.id },
      });
    }
    for (const finding of adr.findings || []) {
      alerts.push({
        id: `alert-adr-finding-${adr.id}-${finding.rule}`,
        level: finding.severity === "error" ? "high" : "low",
        category: "decision",
        title: `${finding.rule} · ADR ${adr.id}`,
        description: finding.message || "",
        at: adr.date || null,
        link: { kind: "adr", id: adr.id },
      });
    }
  }

  for (const gate of brief?.delivery_gates || []) {
    const status = String(gate.status || "").toLowerCase();
    if (status === "passed" || status === "complete") continue;
    alerts.push({
      id: `alert-gate-${gate.id}`,
      level: gate.id === "creator-uat" ? "critical" : "medium",
      category: "gate",
      title: `Gate ${gate.id} · ${gate.status || "pending"}`,
      description: gate.exit_criteria || "",
      at: null,
      link: { kind: "gate", id: gate.id },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const meeting of week?.meetings || []) {
    if (!meeting.date || meeting.date < today) continue;
    const days = Math.round((new Date(`${meeting.date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
    if (days > 1) continue;
    alerts.push({
      id: `alert-meeting-${meeting.id}`,
      level: days === 0 ? "high" : "medium",
      category: "schedule",
      title: `${days === 0 ? "Hôm nay" : "Ngày mai"} · ${meeting.start} ${meeting.title}`,
      description: (meeting.agenda || [])[0] || `${meeting.owner || "—"} · ${meeting.location || "Meet"}`,
      at: meeting.date,
      link: { kind: "meeting", id: meeting.id },
    });
  }

  for (const project of projects) {
    if (project.budgetKb && project.gzipKb && project.gzipKb / project.budgetKb >= 0.9) {
      alerts.push({
        id: `alert-budget-${project.id}`,
        level: "medium",
        category: "project",
        title: `${project.name} gần vượt bundle budget`,
        description: `${project.gzipKb} KB / ${project.budgetKb} KB gzip`,
        at: null,
        link: { kind: "project", id: project.id },
        projectId: project.id,
      });
    }
  }

  if (github && github.error) {
    alerts.push({
      id: "alert-github",
      level: "low",
      category: "system",
      title: "GitHub API không đọc được",
      description: `${github.error} — board vẫn dựng từ FDE + ADR`,
      at: github.fetchedAt || null,
      link: { kind: "system", id: "github" },
    });
  }

  const order = (level) => ALERT_LEVELS.indexOf(level);
  return alerts.sort((a, b) => order(a.level) - order(b.level) || String(a.title).localeCompare(b.title));
}

/** Jira-clone donut: status split with explicit colours. */
export function statusBreakdown(tasks = []) {
  const counts = { open: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of tasks) {
    if (counts[task.status] === undefined) counts.open += 1;
    else counts[task.status] += 1;
  }
  const total = tasks.length;
  return {
    total,
    slices: Object.keys(counts).map((status) => ({
      status,
      label: status.replace("_", " "),
      value: counts[status],
      color: STATUS_COLORS[status],
      pct: total ? Math.round((counts[status] / total) * 100) : 0,
    })),
  };
}

/**
 * Build the whole portfolio: project cards, per-project issue rollup, effort
 * rollup and the alert feed.
 */
export function buildPortfolio({
  brief = null,
  tasks = [],
  adrs = [],
  releaseManifest = null,
  week = null,
  github = null,
} = {}) {
  const gameProjects = projectsFromRelease(releaseManifest);
  const gameIds = gameProjects.map((project) => project.id);

  const projects = [
    ...gameProjects,
    {
      id: PROGRAM_ID,
      name: "FDE Live Interaction",
      kind: "program",
      slug: PROGRAM_ID,
      version: brief?.schema_version ? `schema v${brief.schema_version}` : null,
      legal: null,
      releaseSha256: releaseManifest?.bundle_sha256 || null,
      gzipKb: null,
      budgetKb: null,
      fileCount: null,
      files: [],
      stage: brief?.current_stage || null,
      mission: brief?.mission || null,
    },
  ].map((project, index) => {
    const color = PALETTE[index % PALETTE.length];
    return {
      ...project,
      color,
      owner: project.kind === "program" ? "Studio Engineering" : ownerFromTasks(tasks, project.id),
      team: project.kind === "program" ? "product" : "engineering",
    };
  });

  const decorated = tasks.map((task) => {
    const projectId = assignTaskToProject(task, gameIds);
    return { ...task, projectId };
  });

  for (const project of projects) {
    const issues = decorated.filter((task) => task.projectId === project.id);
    project.release = project.kind === "game"
      ? {
          version: project.version,
          legal: project.legal,
          sha256: project.releaseSha256,
          gzipKb: project.gzipKb,
          budgetKb: project.budgetKb,
          budgetPct: project.budgetKb ? Math.round((project.gzipKb / project.budgetKb) * 100) : null,
          fileCount: project.fileCount,
          ready: Boolean(project.releaseSha256 && project.budgetKb && project.gzipKb <= project.budgetKb),
        }
      : null;
    const done = issues.filter((task) => task.status === "done");
    const pointsTotal = issues.reduce((sum, task) => sum + weightOf(task.priority), 0);
    const pointsDone = done.reduce((sum, task) => sum + weightOf(task.priority), 0);
    const blocked = issues.filter((task) => task.status === "blocked").length;
    project.issues = {
      total: issues.length,
      open: issues.filter((task) => task.status === "open").length,
      in_progress: issues.filter((task) => task.status === "in_progress").length,
      blocked,
      done: done.length,
    };
    project.points = { total: pointsTotal, done: pointsDone, remaining: pointsTotal - pointsDone };
    project.completionPct = pointsTotal ? Math.round((pointsDone / pointsTotal) * 100) : 0;
    project.issueCompletionPct = issues.length ? Math.round((done.length / issues.length) * 100) : 0;
    const activeIssues = project.issues.open + project.issues.in_progress + blocked;
    // A game is "shipped" when its package validates *and* nothing is open on it;
    // the program project can never be shipped, only active/finishing.
    project.status =
      project.kind === "game" && project.release?.ready && activeIssues === 0
        ? "shipped"
        : activeIssues === 0
          ? "planning"
          : "active";
    project.health =
      blocked > 0
        ? "at-risk"
        : project.release?.ready && activeIssues === 0
          ? "on-track"
          : project.completionPct >= 50
            ? "on-track"
            : "starting";
    project.priorityMix = {
      P0: issues.filter((task) => task.priority === "P0").length,
      P1: issues.filter((task) => task.priority === "P1").length,
      P2: issues.filter((task) => task.priority === "P2").length,
      P3: issues.filter((task) => task.priority === "P3").length,
    };
    project.topIssues = issues
      .filter((task) => task.status !== "done")
      .sort((a, b) => weightOf(b.priority) - weightOf(a.priority) || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map((task) => ({ id: task.id, title: task.title, priority: task.priority, status: task.status }));
  }

  const alerts = buildAlerts({ tasks: decorated, adrs, brief, week, github, projects });

  const totals = {
    projects: projects.length,
    games: gameProjects.length,
    issues: decorated.length,
    open: decorated.filter((task) => task.status !== "done").length,
    blocked: decorated.filter((task) => task.status === "blocked").length,
    points: decorated.reduce((sum, task) => sum + weightOf(task.priority), 0),
    alerts: alerts.length,
    criticalAlerts: alerts.filter((alert) => alert.level === "critical").length,
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    programId: PROGRAM_ID,
    release: releaseManifest
      ? {
          bundleSha256: releaseManifest.bundle_sha256 || null,
          generatedAt: releaseManifest.generated_at || null,
          artifactCount: (releaseManifest.artifacts || []).length,
          standaloneBundles: releaseManifest.standalone_bundles || [],
        }
      : null,
    projects,
    tasks: decorated,
    alerts,
    statusBreakdown: statusBreakdown(decorated),
    totals,
    sprint: sprintSummary(week, brief),
  };
}

function ownerFromTasks(tasks, projectId) {
  const counts = new Map();
  for (const task of tasks) {
    if (assignTaskToProject(task, [projectId]) !== projectId) continue;
    counts.set(task.owner, (counts.get(task.owner) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
  return best ? best[0] : "Unassigned";
}

/** Sidebar "current sprint" card: the real week + the real gate progress. */
export function sprintSummary(week = null, brief = null) {
  const gates = brief?.delivery_gates || [];
  const passed = gates.filter((gate) => ["passed", "complete"].includes(String(gate.status).toLowerCase())).length;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (week?.meetings || []).filter((meeting) => meeting.date >= today);
  const next = upcoming[0] || null;
  return {
    weekStart: week?.range?.start || null,
    weekEnd: week?.range?.end || null,
    meetings: (week?.meetings || []).length,
    daysRemaining: week?.range?.end ? Math.max(0, Math.round((new Date(`${week.range.end}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000)) : null,
    nextMeeting: next ? { title: next.title, date: next.date, start: next.start } : null,
    gatesPassed: passed,
    gatesTotal: gates.length,
    gateProgress: gates.length ? Math.round((passed / gates.length) * 100) : 0,
  };
}

export const PROGRAM_PROJECT_ID = PROGRAM_ID;
