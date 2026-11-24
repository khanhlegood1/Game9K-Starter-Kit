/**
 * scheduleBoard.js
 *
 * Deterministic schedule for the investor-facing Tasks portal: a week view
 * (Mon–Sun) built from the FDE mission brief, ADR registry and GitHub items —
 * no calendar database, same philosophy as the task board.
 *
 * Two kinds of entries:
 *   - meeting: real calendar events (creator UAT, review, gate check, investor
 *     sync) stored in `project/fde/schedule.json`;
 *   - deadline: derived from artifacts (pending delivery gates, ADR decisions
 *     that need a date, GitHub issues updated recently).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MEETING_KINDS = ["meeting", "review", "uat", "gate", "sync", "decision"];
export const ATTENDANCE = ["required", "optional", "informed"];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ISO weekdays: Monday=1 … Sunday=7. `Date#getUTCDay` uses Sunday=0. */
export function isoWeekday(date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export function parseIsoDate(value) {
  if (!DATE_PATTERN.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value, days) {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  if (!date) return null;
  return new Date(date.getTime() + days * DAY_MS);
}

/** Monday of the week containing `value` (UTC). */
export function startOfWeek(value) {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  if (!date) return null;
  return addDays(date, 1 - isoWeekday(date));
}

export function weekRange(anchor) {
  const start = startOfWeek(anchor);
  if (!start) return null;
  const end = addDays(start, 6);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

/** Minutes since midnight for `HH:MM`, or null. */
export function minutesOf(time) {
  if (!TIME_PATTERN.test(String(time ?? ""))) return null;
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

/** Grid slot index for a start time, using a 30-minute resolution. */
export function slotOf(time) {
  const minutes = minutesOf(time);
  return minutes === null ? null : Math.round(minutes / 30);
}

export function validateMeeting(meeting, index = 0) {
  const findings = [];
  const id = meeting?.id || `meetings[${index}]`;
  const add = (rule, message) => findings.push({ rule, meetingId: id, message });

  for (const key of ["id", "title", "date", "start", "end", "kind", "owner"]) {
    if (typeof meeting?.[key] !== "string" || !meeting[key].trim()) {
      add("MEETING-FIELD-REQUIRED", `${id}.${key} is required`);
    }
  }
  if (meeting?.date && (!DATE_PATTERN.test(meeting.date) || !parseIsoDate(meeting.date))) {
    add("MEETING-DATE", `${id}.date must be a real calendar date (YYYY-MM-DD)`);
  }
  const startMinutes = minutesOf(meeting?.start);
  const endMinutes = minutesOf(meeting?.end);
  if (meeting?.start && startMinutes === null) add("MEETING-TIME", `${id}.start must be HH:MM (24h)`);
  if (meeting?.end && endMinutes === null) add("MEETING-TIME", `${id}.end must be HH:MM (24h)`);
  if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
    add("MEETING-RANGE", `${id}.end must be after ${id}.start`);
  }
  if (meeting?.kind && !MEETING_KINDS.includes(meeting.kind)) {
    add("MEETING-KIND", `${id}.kind must be one of ${MEETING_KINDS.join(", ")}`);
  }
  if (meeting?.attendees !== undefined && !Array.isArray(meeting.attendees)) {
    add("MEETING-ATTENDEES", `${id}.attendees must be an array`);
  }
  for (const [position, attendee] of (meeting?.attendees || []).entries()) {
    if (!attendee || typeof attendee !== "object") {
      add("MEETING-ATTENDEES", `${id}.attendees[${position}] must be an object`);
      continue;
    }
    if (!attendee.role && !attendee.name) add("MEETING-ATTENDEE-ROLE", `${id}.attendees[${position}].role is required`);
    if (attendee.attendance && !ATTENDANCE.includes(attendee.attendance)) {
      add("MEETING-ATTENDEE-ATTENDANCE", `${id}.attendees[${position}].attendance must be ${ATTENDANCE.join("|")}`);
    }
  }
  if (meeting?.taskId && !/^[a-z0-9-]+$/i.test(String(meeting.taskId))) {
    add("MEETING-TASK-ID", `${id}.taskId must look like a task id (fde-001)`);
  }
  return { ok: findings.length === 0, findings, errors: findings.map((finding) => finding.message) };
}

/**
 * Validate the whole schedule file: field rules, duplicate ids and overlaps.
 * Same owner + same day + intersecting window is a hard conflict; two rooms can
 * legitimately meet in parallel, so the check is scoped per owner.
 */
export function validateSchedule(schedule) {
  const findings = [];
  const add = (rule, message, meetingId = null) => findings.push({ rule, meetingId, message });

  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    return { ok: false, findings: [{ rule: "SCHEDULE-SHAPE", meetingId: null, message: "schedule must be an object" }], errors: ["schedule must be an object"], warnings: [] };
  }
  if (!Array.isArray(schedule.meetings)) {
    const finding = { rule: "SCHEDULE-SHAPE", meetingId: null, message: "schedule.meetings must be an array" };
    return { ok: false, findings: [finding], errors: [finding.message], warnings: [] };
  }
  if (schedule.timezone !== undefined && typeof schedule.timezone !== "string") {
    add("SCHEDULE-TIMEZONE", "schedule.timezone must be an IANA string");
  }

  const ids = new Set();
  for (const [index, meeting] of schedule.meetings.entries()) {
    findings.push(...validateMeeting(meeting, index).findings);
    if (meeting?.id) {
      if (ids.has(meeting.id)) add("MEETING-ID-DUPLICATE", `duplicate meeting id "${meeting.id}"`, meeting.id);
      ids.add(meeting.id);
    }
  }

  const byDayOwner = new Map();
  for (const meeting of schedule.meetings) {
    if (!parseIsoDate(meeting?.date)) continue;
    const key = `${meeting.date}::${meeting.owner || ""}`;
    if (!byDayOwner.has(key)) byDayOwner.set(key, []);
    byDayOwner.get(key).push(meeting);
  }
  for (const [key, meetings] of byDayOwner) {
    const [date, owner] = key.split("::");
    const sorted = [...meetings].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (minutesOf(current.start) < minutesOf(previous.end)) {
        add(
          "MEETING-OVERLAP",
          `${current.id} overlaps ${previous.id} on ${date} for the same owner (${owner || "unassigned"}).`,
          current.id
        );
      }
    }
  }

  const errors = findings.filter((finding) => finding.rule !== "SCHEDULE-WARN");
  return {
    ok: errors.length === 0,
    findings,
    errors: errors.map((finding) => finding.message),
    warnings: [],
  };
}

/**
 * Build the week model for the portal.
 * @param {object} options
 * @param {object} options.schedule raw `project/fde/schedule.json`
 * @param {string} options.anchor ISO date inside the week to render
 * @param {Array} options.tasks board tasks (for linkage + deadlines)
 * @param {Array} options.adrs ADR registry entries
 * @param {object} options.brief mission brief (pending gates become deadlines)
 */
export function buildWeek({ schedule, anchor, tasks = [], adrs = [], brief = null } = {}) {
  const range = weekRange(anchor) || weekRange(toIsoDate(new Date()));
  const meetings = (schedule?.meetings || []).filter((meeting) => {
    return meeting?.date >= range.start && meeting.date <= range.end;
  });

  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = toIsoDate(addDays(range.start, index));
    const dayMeetings = meetings
      .filter((meeting) => meeting.date === date)
      .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    return {
      date,
      weekday: isoWeekday(parseIsoDate(date)),
      label: ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"][index],
      short: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][index],
      dayOfMonth: Number(date.slice(8, 10)),
      isToday: anchor ? date === anchor : false,
      meetings: dayMeetings,
      deadlines: [],
    };
  });

  // Derived deadlines: pending gates + ADRs without a decision date + stale tasks.
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const deadlinePush = (date, entry) => {
    const day = dayByDate.get(date);
    if (day) day.deadlines.push(entry);
  };

  for (const gate of brief?.delivery_gates || []) {
    if (!["pending", "in_progress"].includes(String(gate.status))) continue;
    // Gates without an explicit date are pinned to Friday of the shown week.
    const date = gate.due_date && DATE_PATTERN.test(gate.due_date) ? gate.due_date : toIsoDate(addDays(range.start, 4));
    deadlinePush(date, { kind: "gate", id: gate.id, title: gate.exit_criteria || gate.id, owner: gate.owner || "Unassigned" });
  }
  for (const adr of adrs) {
    if (!adr?.proposedDate || adr.status !== "proposed") continue;
    if (adr.proposedDate < range.start || adr.proposedDate > range.end) continue;
    deadlinePush(adr.proposedDate, { kind: "adr", id: adr.id, title: adr.title, owner: (adr.deciders || [])[0] || "Unassigned" });
  }
  for (const task of tasks) {
    if (task.status === "done" || !task.due) continue;
    if (!DATE_PATTERN.test(String(task.due))) continue;
    deadlinePush(task.due, { kind: "task", id: task.id, title: task.title, owner: task.owner });
  }

  const enriched = meetings.map((meeting) => {
    const linkedTask = meeting.taskId ? tasks.find((task) => task.id === meeting.taskId) : null;
    return {
      ...meeting,
      startMinutes: minutesOf(meeting.start),
      endMinutes: minutesOf(meeting.end),
      slot: slotOf(meeting.start),
      span: Math.max(1, Math.round(((minutesOf(meeting.end) ?? 0) - (minutesOf(meeting.start) ?? 0)) / 30)),
      linkedTask: linkedTask
        ? { id: linkedTask.id, title: linkedTask.title, status: linkedTask.status, priority: linkedTask.priority }
        : null,
      attendeeRoles: (meeting.attendees || []).map((attendee) => attendee.role || attendee.name),
    };
  });

  const upcoming = enriched
    .filter((meeting) => meeting.date >= (anchor || range.start))
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  return {
    range,
    timezone: schedule?.timezone || "Asia/Ho_Chi_Minh",
    grid: {
      startHour: schedule?.grid?.start_hour ?? 8,
      endHour: schedule?.grid?.end_hour ?? 20,
      slotMinutes: 30,
    },
    days: days.map((day) => ({
      ...day,
      meetings: enriched.filter((meeting) => meeting.date === day.date),
    })),
    meetings: enriched,
    upcoming: upcoming.slice(0, 5),
    stats: {
      meetings: enriched.length,
      requiredRoles: Array.from(
        new Set(
          enriched.flatMap((meeting) =>
            (meeting.attendees || [])
              .filter((attendee) => (attendee.attendance || "required") === "required")
              .map((attendee) => attendee.role || attendee.name)
          )
        )
      ),
      deadlines: days.reduce((total, day) => total + day.deadlines.length, 0),
      linkedTasks: enriched.filter((meeting) => meeting.linkedTask).length,
    },
  };
}

/** Load `project/fde/schedule.json`; missing file is a warning, not a crash. */
export function loadSchedule(rootDir) {
  const path = join(rootDir, "project/fde/schedule.json");
  if (!existsSync(path)) {
    return { schedule: { timezone: "Asia/Ho_Chi_Minh", meetings: [] }, path: null, error: "schedule_missing" };
  }
  try {
    const schedule = JSON.parse(readFileSync(path, "utf8"));
    const validation = validateSchedule(schedule);
    return { schedule, path: "project/fde/schedule.json", validation, error: validation.ok ? null : "schedule_invalid" };
  } catch (error) {
    return {
      schedule: { timezone: "Asia/Ho_Chi_Minh", meetings: [] },
      path: "project/fde/schedule.json",
      error: "schedule_unparseable",
      message: error.message,
    };
  }
}
