import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWeek,
  loadSchedule,
  minutesOf,
  startOfWeek,
  toIsoDate,
  validateMeeting,
  validateSchedule,
  weekRange,
} from "../src/lib/scheduleBoard.js";
import TaskBoardService from "../src/services/TaskBoardService.js";
import { createGame9KServer } from "../src/server.js";

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

const MEETING = {
  id: "mtg-a",
  title: "Kickoff Meeting",
  date: "2026-11-25",
  start: "13:00",
  end: "14:30",
  kind: "meeting",
  owner: "Product",
  taskId: "fde-001",
  attendees: [
    { role: "Product", attendance: "required" },
    { role: "Live Ops", attendance: "optional" },
  ],
  agenda: ["Confirm scope"],
};

/* ------------------------------------------------------------------ dates */

test("weekRange returns a Monday→Sunday window regardless of the anchor day", () => {
  for (const anchor of ["2026-11-23", "2026-11-25", "2026-11-29"]) {
    assert.deepEqual(weekRange(anchor), { start: "2026-11-23", end: "2026-11-29" });
  }
  assert.equal(toIsoDate(startOfWeek("2026-11-25")), "2026-11-23");
  assert.equal(weekRange("not-a-date"), null);
});

test("minutesOf converts HH:MM into minutes and rejects garbage", () => {
  assert.equal(minutesOf("13:00"), 780);
  assert.equal(minutesOf("00:30"), 30);
  assert.equal(minutesOf("25:00"), null);
  assert.equal(minutesOf(undefined), null);
});

/* ------------------------------------------------------------- validation */

test("validateMeeting flags bad dates, inverted ranges and unknown roles", () => {
  const rules = validateMeeting({ ...MEETING, date: "2026-13-40", start: "14:00", end: "13:00" }).findings.map(
    (finding) => finding.rule
  );
  assert.ok(rules.includes("MEETING-DATE"));
  assert.ok(rules.includes("MEETING-RANGE"));
  assert.equal(validateMeeting(MEETING).ok, true);
});

test("validateSchedule rejects overlapping meetings of the same owner on one day", () => {
  const clash = { ...MEETING, id: "mtg-b", start: "14:00", end: "15:00" };
  const report = validateSchedule({ timezone: "Asia/Ho_Chi_Minh", meetings: [MEETING, clash] });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.rule === "MEETING-OVERLAP"));
});

test("validateSchedule accepts the schedule checked into the repository", () => {
  const { validation, error } = loadSchedule(ROOT_DIR);
  assert.equal(error, null);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

/* ------------------------------------------------------------- week model */

test("buildWeek places meetings on the right day with slots, spans and linked tasks", () => {
  const tasks = [{ id: "fde-001", title: "Run UAT", status: "in_progress", priority: "P0" }];
  const week = buildWeek({
    schedule: { timezone: "Asia/Ho_Chi_Minh", grid: { start_hour: 8, end_hour: 20 }, meetings: [MEETING] },
    anchor: "2026-11-25",
    tasks,
  });

  assert.deepEqual(week.range, { start: "2026-11-23", end: "2026-11-29" });
  assert.equal(week.days.length, 7);
  assert.deepEqual(week.days.map((day) => day.short), ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  assert.equal(week.days[2].isToday, true);
  assert.equal(week.days[2].meetings.length, 1);

  const meeting = week.meetings[0];
  assert.equal(meeting.startMinutes, 780);
  assert.equal(meeting.span, 3); // 90 minutes / 30-minute grid
  assert.equal(meeting.linkedTask.id, "fde-001");
  assert.deepEqual(meeting.attendeeRoles, ["Product", "Live Ops"]);
  assert.deepEqual(week.stats.requiredRoles, ["Product"]);
  assert.equal(week.stats.meetings, 1);
  assert.equal(week.stats.linkedTasks, 1);
});

test("buildWeek derives deadlines from pending gates and proposed ADRs", () => {
  const week = buildWeek({
    schedule: { meetings: [] },
    anchor: "2026-11-25",
    brief: { delivery_gates: [{ id: "g2", stage: "validate", status: "pending", exit_criteria: "Creator UAT" }] },
    adrs: [{ id: "0002", title: "Task board SoR", status: "proposed", proposedDate: "2026-11-26", deciders: ["Product"] }],
  });
  const deadlines = week.days.flatMap((day) => day.deadlines.map((entry) => ({ date: day.date, ...entry })));
  assert.equal(week.stats.deadlines, 2);
  // Undated pending gates pin to Friday of the shown week.
  assert.ok(deadlines.some((entry) => entry.kind === "gate" && entry.date === "2026-11-27"));
  assert.ok(deadlines.some((entry) => entry.kind === "adr" && entry.date === "2026-11-26"));
});

test("buildWeek returns upcoming meetings in chronological order", () => {
  const later = { ...MEETING, id: "mtg-c", title: "Later", date: "2026-11-27", start: "09:00", end: "10:00" };
  const week = buildWeek({ schedule: { meetings: [later, MEETING] }, anchor: "2026-11-25" });
  assert.deepEqual(week.upcoming.map((meeting) => meeting.id), ["mtg-a", "mtg-c"]);
  assert.ok(week.upcoming.length <= 5);
});

/* --------------------------------------------------------------- service */

test("TaskBoardService.getSchedule renders the committed schedule week", () => {
  const service = new TaskBoardService({ token: "", fetchImpl: null });
  const week = service.getSchedule({ anchor: "2026-11-26" });
  assert.equal(week.ok, true);
  assert.equal(week.path, "project/fde/schedule.json");
  assert.equal(week.range.start, "2026-11-23");
  assert.ok(week.stats.meetings >= 5);
  assert.ok(week.meetings.some((meeting) => meeting.kind === "uat"));
  // Meetings link back to real board tasks.
  assert.ok(week.meetings.some((meeting) => meeting.linkedTask));
});

test("Server exposes /api/schedule and the ADR registry endpoint", async () => {
  const { app } = createGame9KServer({ taskBoard: new TaskBoardService({ token: "", fetchImpl: null }) });
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const week = await (await fetch(`${baseUrl}/api/schedule?anchor=2026-11-25`)).json();
    assert.equal(week.ok, true);
    assert.equal(week.schema_version, 1);
    assert.equal(week.range.end, "2026-11-29");
    assert.equal(week.timezone, "Asia/Ho_Chi_Minh");
    assert.equal(week.validation.ok, true);

    const registry = await (await fetch(`${baseUrl}/api/tasks/adrs/registry`)).json();
    assert.equal(registry.ok, true);
    assert.equal(registry.summary.errors, 0);
    assert.ok(registry.graph.nodes.length >= 2);
    assert.ok(Array.isArray(registry.findings));

    // A malformed anchor must not throw — it falls back to today.
    const fallback = await (await fetch(`${baseUrl}/api/schedule?anchor=oops`)).json();
    assert.equal(fallback.ok, true);
    assert.equal(fallback.days.length, 7);
  } finally {
    server.close();
  }
});

/* -------------------------------------------------------------------- CLI */

test("CLI `g9k schedule --json` exposes the week the portal renders", () => {
  const out = runCli(["schedule", "--anchor", "2026-11-26"]);
  assert.equal(out.schema_version, 1);
  assert.equal(out.ok, true);
  assert.equal(out.command, "schedule");
  assert.deepEqual(out.data.range, { start: "2026-11-23", end: "2026-11-29" });
  assert.equal(out.data.days.length, 7);
  assert.ok(out.data.days.some((day) => day.meetings.length > 0));
  assert.equal(out.error, null);
  assert.deepEqual(out.warnings, []);
});

test("the Schedule view is wired into the portal page and script", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(join(ROOT_DIR, "public/tasks.html"), "utf8");
  const js = readFileSync(join(ROOT_DIR, "public/tasks/tasks.js"), "utf8");

  for (const id of ['id="scheduleCard"', 'id="weekStrip"', 'id="scheduleList"', 'id="view-schedule"']) {
    assert.ok(html.includes(id), `tasks.html is missing ${id}`);
  }
  assert.ok(html.includes("<h3>Schedule</h3>"));
  assert.ok(html.indexOf('id="scheduleCard"') > html.indexOf("My Projects"), "Schedule must sit under My Projects");
  assert.ok(js.includes("/api/schedule"));
  assert.ok(js.includes("renderSchedule"));
  assert.ok(js.includes("shiftWeek"));
});
