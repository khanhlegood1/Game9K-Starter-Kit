/**
 * TaskBoardService.js
 *
 * Investor-facing task board. Merges three deterministic sources:
 *   1. `project/fde/mission-brief.json`  → next actions + open risks
 *   2. `project/fde/adr/*.md`            → open ADRs + their follow-ups
 *      `project/fde/schedule.json`       → meetings for the week view
 *   3. GitHub issues / pull requests     → open work outside the repo docs
 *
 * The GitHub call is optional and always degradable: no token, no network or a
 * 4xx must still render a complete board, only with `github.error` set.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAdrRegistry } from "../lib/adrRegistry.js";
import { buildWeek, loadSchedule } from "../lib/scheduleBoard.js";
import { buildTaskBoard, filterTasks, loadAdrs } from "../lib/taskBoard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../..");
const DEFAULT_REPO = "khanhlegood1/Game9K-Starter-Kit";

export const TASK_BOARD_REPO =
  process.env.G9K_GITHUB_REPO || process.env.GITHUB_REPOSITORY || DEFAULT_REPO;

export default class TaskBoardService {
  constructor({
    rootDir = ROOT_DIR,
    repo = TASK_BOARD_REPO,
    token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",
    fetchImpl = globalThis.fetch,
    cacheTtlMs = 60_000,
    timeoutMs = 5_000,
  } = {}) {
    this.rootDir = rootDir;
    this.repo = repo;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.cacheTtlMs = cacheTtlMs;
    this.timeoutMs = timeoutMs;
    this.cache = null;
  }

  readBrief() {
    const path = join(this.rootDir, "project/fde/mission-brief.json");
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }

  loadAdrs() {
    return loadAdrs(this.rootDir);
  }

  /** Full ADR registry (graph + findings) for the Decision Logs panel. */
  loadAdrRegistry() {
    return buildAdrRegistry({ rootDir: this.rootDir });
  }

  /**
   * Week view for the Schedule card. Deadlines are *derived* (pending gates,
   * proposed ADRs, dated tasks) so the calendar can never drift from the board.
   */
  getSchedule({ anchor = null } = {}) {
    const { schedule, path, validation, error, message } = loadSchedule(this.rootDir);
    const brief = this.readBrief();
    const adrs = this.loadAdrs();
    const tasks = buildTaskBoard({ brief, adrs, github: null }).tasks;
    const today = new Date().toISOString().slice(0, 10);
    const week = buildWeek({ schedule, anchor: anchor || today, tasks, adrs, brief });
    return {
      ok: !error,
      path,
      error: error || null,
      message: message || null,
      validation: validation || { ok: true, errors: [], warnings: [] },
      anchor: anchor || today,
      ...week,
    };
  }

  /** Fetch open issues + PRs. Never throws: failures become `github.error`. */
  async fetchGithub({ refresh = false } = {}) {
    if (!refresh && this.cache && Date.now() - this.cache.at < this.cacheTtlMs) {
      return this.cache.value;
    }

    if (!this.fetchImpl) {
      return { items: [], repo: this.repo, fetchedAt: null, error: "fetch_unavailable" };
    }

    const tokenQuery = this.token ? "" : "&unauthenticated=1";
    const url =
      `https://api.github.com/repos/${this.repo}/issues` +
      `?state=open&per_page=50&sort=updated&direction=desc${tokenQuery}`;

    let value;
    try {
      const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "game9k-task-board",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const response = await this.fetchImpl(url, {
        headers,
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(this.timeoutMs) : undefined,
      });
      if (!response.ok) {
        value = {
          items: [],
          repo: this.repo,
          fetchedAt: new Date().toISOString(),
          error: `github_http_${response.status}`,
        };
      } else {
        const payload = await response.json();
        value = {
          items: Array.isArray(payload) ? payload : [],
          repo: this.repo,
          fetchedAt: new Date().toISOString(),
          error: null,
        };
      }
    } catch (error) {
      value = {
        items: [],
        repo: this.repo,
        fetchedAt: new Date().toISOString(),
        error: error?.name === "TimeoutError" ? "github_timeout" : "github_unreachable",
      };
    }

    this.cache = { at: Date.now(), value };
    return value;
  }

  /**
   * @param {{ refresh?: boolean, includeGithub?: boolean, filters?: object }} options
   */
  async getBoard({ refresh = false, includeGithub = true, filters = {} } = {}) {
    const brief = this.readBrief();
    const adrs = this.loadAdrs();
    const github = includeGithub ? await this.fetchGithub({ refresh }) : null;
    const board = buildTaskBoard({ brief, adrs, github, generatedAt: new Date().toISOString() });

    const filtered = Object.keys(filters).length
      ? { ...board, kpis: { ...board.kpis, filtered: filterTasks(board.tasks, filters).length } }
      : board;

    const registry = this.loadAdrRegistry();
    return {
      ...filtered,
      tasks: filterTasks(board.tasks, filters),
      adrGraph: registry.graph,
      adrFindings: registry.findings,
      adrSummary: registry.summary,
      githubReady: Boolean(github && !github.error),
      filters,
    };
  }

  /**
   * Turn a task request into actionable output. With a token we create the real
   * GitHub issue; without one we hand back a ready-to-run `gh` command so the
   * task still lands in the same source of truth instead of a shadow database.
   */
  async createTask({ title, description = "", priority = "P1", owner = "", labels = [] } = {}) {
    const cleanTitle = String(title || "").trim().slice(0, 160);
    if (!cleanTitle) return { ok: false, error: "title_required" };

    const priorityLabel = /^p[0-3]$/i.test(priority) ? String(priority).toLowerCase() : "p1";
    const tagList = Array.from(new Set(["task", priorityLabel, ...labels.map((l) => String(l).toLowerCase())]));
    const body =
      `${description || cleanTitle}\n\n` +
      `---\n` +
      `_Created from the Game9K Tasks portal._\n` +
      (owner ? `**Owner:** ${owner}\n` : "") +
      `**Priority:** ${priorityLabel.toUpperCase()}\n`;

    const command =
      `gh issue create --repo ${this.repo} --title ${JSON.stringify(cleanTitle)} ` +
      `--body ${JSON.stringify(body)} --label ${tagList.join(",")}`;
    const newIssueUrl = `https://github.com/${this.repo}/issues/new?title=${encodeURIComponent(
      cleanTitle
    )}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent(tagList.join(","))}`;

    if (this.token && this.fetchImpl) {
      try {
        const response = await this.fetchImpl(`https://api.github.com/repos/${this.repo}/issues`, {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "User-Agent": "game9k-task-board",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ title: cleanTitle, body, labels: tagList }),
          signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(this.timeoutMs) : undefined,
        });
        if (response.ok) {
          const issue = await response.json();
          this.cache = null;
          return { ok: true, mode: "github", issue: { number: issue.number, url: issue.html_url } };
        }
        return {
          ok: true,
          mode: "manual",
          reason: `github_http_${response.status}`,
          command,
          newIssueUrl,
        };
      } catch {
        return { ok: true, mode: "manual", reason: "github_unreachable", command, newIssueUrl };
      }
    }

    return { ok: true, mode: "manual", reason: "no_github_token", command, newIssueUrl };
  }
}
