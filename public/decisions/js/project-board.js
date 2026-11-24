// Game9K Dev Project Management Control Deck (mounted alongside the Gemini Decisions API Playground).
// Provides:
// 1. Live 4-Gate Repository Release & Legal Audit (`POST /api/decisions/audit-all`)
// 2. 1-Click Live Workspace Context Loader into Playground (`GET /api/decisions/live-context`)
// 3. Sprint Backlog & Automated AI Task/Incident Triage (`GET/POST /api/decisions/board`, `/api/decisions/tasks`)
'use strict';
(function () {
  const { html, render, useState, useEffect } = window.htmPreact;

  function GovernanceDeck() {
    const [expanded, setExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState('mission'); // 'mission' | 'gates' | 'backlog' | 'history'
    const [auditReport, setAuditReport] = useState(null);
    const [auditing, setAuditing] = useState(false);
    const [fdeProject, setFdeProject] = useState(null);
    const [fdeLoading, setFdeLoading] = useState(false);
    const [board, setBoard] = useState({ tasks: [], history: [] });
    const [loadingTarget, setLoadingTarget] = useState(null);

    // New task triage form
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskCategory, setTaskCategory] = useState('feature');
    const [triaging, setTriaging] = useState(false);

    function getLinkedBrowserKey() {
      try {
        const raw = window.localStorage.getItem('dp.apiKey');
        return raw ? JSON.parse(raw) : '';
      } catch {
        return '';
      }
    }

    async function fetchFdeProject() {
      setFdeLoading(true);
      try {
        const r = await fetch('/api/project/fde');
        const data = await r.json();
        if (data.ok) setFdeProject(data);
      } catch {
        // Offline static mode
      } finally {
        setFdeLoading(false);
      }
    }

    async function fetchBoard() {
      try {
        const r = await fetch('/api/decisions/board');
        const data = await r.json();
        if (data.ok) {
          setBoard({ tasks: data.tasks || [], history: data.history || [] });
        }
      } catch {
        // Offline static mode
      }
    }

    async function runFullAudit() {
      setAuditing(true);
      try {
        const key = getLinkedBrowserKey();
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['x-goog-api-key'] = key;
        const r = await fetch('/api/decisions/audit-all', {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        const data = await r.json();
        if (data.ok && data.report) {
          setAuditReport(data.report);
          await fetchBoard();
        }
      } catch {
        // Ignore network errors
      } finally {
        setAuditing(false);
      }
    }

    async function loadRepoContextIntoPlayground(target) {
      setLoadingTarget(target);
      try {
        const r = await fetch(`/api/decisions/live-context?target=${encodeURIComponent(target)}`);
        const data = await r.json();
        if (data.ok && data.context) {
          window.dispatchEvent(
            new CustomEvent('g9k:load-live-context', { detail: data.context })
          );
        }
      } finally {
        setLoadingTarget(null);
      }
    }

    async function submitNewTask(e) {
      e.preventDefault();
      if (!taskTitle.trim() || triaging) return;
      setTriaging(true);
      try {
        const key = getLinkedBrowserKey();
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['x-goog-api-key'] = key;
        const r = await fetch('/api/decisions/tasks', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: taskTitle.trim(),
            description: taskDesc.trim(),
            category: taskCategory,
          }),
        });
        const data = await r.json();
        if (data.ok) {
          setTaskTitle('');
          setTaskDesc('');
          await fetchBoard();
        }
      } finally {
        setTriaging(false);
      }
    }

    useEffect(() => {
      fetchFdeProject();
      runFullAudit();
      const onRefresh = () => {
        fetchBoard();
        fetchFdeProject();
      };
      window.addEventListener('g9k:decision-recorded', onRefresh);
      return () => window.removeEventListener('g9k:decision-recorded', onRefresh);
    }, []);

    return html`
      <div class="g9k-pm-shell">
        <!-- Top Game9K Studio Navigation Bar -->
        <div class="g9k-pm-nav">
          <div class="g9k-pm-nav-left">
            <a href="/index.html" class="g9k-nav-pill">← Hub KOL</a>
            <span class="g9k-pm-brand">
              🧠 <strong>QUẢN TRỊ DỰ ÁN DEV GAME9K</strong>
              <span class="g9k-pm-badge">Gemini Decisions API</span>
            </span>
          </div>
          <div class="g9k-pm-nav-right">
            <a href="/games/dino-race/index.html?mode=kol&autobot=1" class="g9k-nav-link">🦖 Dino Race Live</a>
            <a href="/portal.html" class="g9k-nav-link">🛡️ Cổng Sandbox</a>
            <a href="/debug.html" class="g9k-nav-link">📡 Stream Debug</a>
            <button
              type="button"
              class="g9k-nav-toggle"
              onClick=${() => setExpanded(!expanded)}
            >
              ${expanded ? '▾ Thu gọn Bảng Quản Trị' : '▸ Mở Bảng Quản Trị Dự Án'}
            </button>
          </div>
        </div>

        ${expanded &&
        html`
          <div class="g9k-pm-body">
            <!-- Sub-navigation + Live Repo Context Injectors -->
            <div class="g9k-pm-toolbar">
              <div class="g9k-pm-tabs">
                <button
                  type="button"
                  class=${`g9k-tab ${activeTab === 'mission' ? 'is-active' : ''}`}
                  onClick=${() => {
                    setActiveTab('mission');
                    fetchFdeProject();
                  }}
                >
                  🎯 Mission & Delta ${fdeProject?.summary ? `· ${fdeProject.summary.status}` : ''}
                </button>
                <button
                  type="button"
                  class=${`g9k-tab ${activeTab === 'gates' ? 'is-active' : ''}`}
                  onClick=${() => setActiveTab('gates')}
                >
                  🛡️ Cổng Duyệt Phát Hành (${auditReport ? `${auditReport.passedGates}/${auditReport.totalGates}` : '4'})
                </button>
                <button
                  type="button"
                  class=${`g9k-tab ${activeTab === 'backlog' ? 'is-active' : ''}`}
                  onClick=${() => setActiveTab('backlog')}
                >
                  📋 Sprint Backlog & Phân Luồng AI (${board.tasks.length})
                </button>
                <button
                  type="button"
                  class=${`g9k-tab ${activeTab === 'history' ? 'is-active' : ''}`}
                  onClick=${() => {
                    setActiveTab('history');
                    fetchBoard();
                  }}
                >
                  🕒 Nhật Ký Quyết Định (${board.history.length})
                </button>
              </div>

              <div class="g9k-pm-live-btns">
                <span class="g9k-pm-hint">Nạp dữ liệu thật từ Repo xuống Playground:</span>
                <button
                  type="button"
                  class="g9k-ctx-btn"
                  disabled=${loadingTarget !== null}
                  onClick=${() => loadRepoContextIntoPlayground('dino-race')}
                >
                  🦖 Gói dino-race
                </button>
                <button
                  type="button"
                  class="g9k-ctx-btn"
                  disabled=${loadingTarget !== null}
                  onClick=${() => loadRepoContextIntoPlayground('git-diff')}
                >
                  🔀 Git Commit/Diff
                </button>
                <button
                  type="button"
                  class="g9k-ctx-btn"
                  disabled=${loadingTarget !== null}
                  onClick=${() => loadRepoContextIntoPlayground('telemetry')}
                >
                  📡 Telemetry Cổng
                </button>
              </div>
            </div>

            <!-- TAB 1: FDE MISSION, DISCOVERY & OUTCOMES -->
            ${activeTab === 'mission' &&
            html`
              <div class="g9k-fde-wrap">
                <div class="g9k-fde-summary">
                  <div>
                    <div class="g9k-status-row">
                      <span
                        class=${`g9k-verdict-pill ${
                          fdeProject?.summary?.status === 'OPERATING' ? 'is-go' : 'is-hold'
                        }`}
                      >
                        ${fdeProject?.summary?.status || (fdeLoading ? 'ĐANG TẢI FDE BRIEF...' : 'FDE BRIEF CHƯA SẴN SÀNG')}
                      </span>
                      ${fdeProject?.summary &&
                      html`<span class="g9k-meta-text">
                        ${fdeProject.summary.gateSummary.passed}/${fdeProject.summary.gateSummary.total} delivery gates ·
                        Readiness <b>${Math.round(fdeProject.summary.readiness * 100)}%</b> ·
                        Stage: <code>${fdeProject.summary.currentStage}</code>
                      </span>`}
                    </div>
                    ${fdeProject?.brief &&
                    html`<div class="g9k-fde-mission">
                      <h3>${fdeProject.brief.mission}</h3>
                      <div class="g9k-fde-subline">
                        <b>${fdeProject.brief.project_id}</b> · ${fdeProject.brief.primary_game} ·
                        Source: <code>Awesome-FDE-Roadmap</code>
                      </div>
                    </div>`}
                  </div>
                  <button
                    type="button"
                    class="g9k-audit-btn"
                    disabled=${fdeLoading}
                    onClick=${fetchFdeProject}
                  >
                    ${fdeLoading ? '⏳ Đang đọc mission brief...' : '↻ Refresh FDE Control Plane'}
                  </button>
                </div>

                ${fdeProject?.validation && !fdeProject.validation.ok &&
                html`<div class="g9k-fde-error">
                  Brief validation failed: ${fdeProject.validation.errors.join(' · ')}
                </div>`}

                ${fdeProject?.brief &&
                html`
                  <div class="g9k-fde-whys">
                    <div class="g9k-fde-card"><b>System of Record</b><span>${fdeProject.brief.three_whys.system_of_record}</span></div>
                    <div class="g9k-fde-card"><b>Cost of Inaction</b><span>${fdeProject.brief.three_whys.cost_of_inaction}</span></div>
                    <div class="g9k-fde-card"><b>Day 2 Owner</b><span>${fdeProject.brief.three_whys.day_2_owner}</span></div>
                  </div>

                  <div class="g9k-fde-columns">
                    <section class="g9k-fde-panel">
                      <div class="g9k-form-title">Δ Product capability → Field reality</div>
                      ${fdeProject.brief.delta.map((item) => html`
                        <div key=${item.id} class="g9k-fde-delta">
                          <div class="g9k-fde-item-head"><code>${item.id}</code><b>${item.owner}</b></div>
                          <div><span class="g9k-fde-label">Current:</span> ${item.product_capability}</div>
                          <div><span class="g9k-fde-label">Gap:</span> ${item.field_gap}</div>
                          <div><span class="g9k-fde-label">Glue:</span> ${item.proposed_glue}</div>
                        </div>
                      `)}
                    </section>
                    <section class="g9k-fde-panel">
                      <div class="g9k-form-title">📏 Definition of Success</div>
                      ${fdeProject.brief.success_metrics.map((metric) => html`
                        <div key=${metric.id} class="g9k-fde-metric">
                          <div class="g9k-fde-item-head"><b>${metric.id}</b><span class=${`g9k-fde-status ${metric.status}`}>${metric.status}</span></div>
                          <div>${metric.definition}</div>
                          <div class="g9k-fde-subline">Target: <b>${metric.target}</b> · Owner: ${metric.owner}</div>
                        </div>
                      `)}
                    </section>
                  </div>

                  <div class="g9k-fde-columns">
                    <section class="g9k-fde-panel">
                      <div class="g9k-form-title">🔎 Discovery checklist</div>
                      <div class="g9k-fde-checklist">
                        ${fdeProject.brief.discovery_checklist.map((item) => html`
                          <div key=${item.id} class="g9k-fde-check-row">
                            <span class=${`g9k-fde-status ${item.status}`}>${item.status}</span>
                            <b>${item.id}</b>
                            <span>${item.owner}</span>
                          </div>
                        `)}
                      </div>
                    </section>
                    <section class="g9k-fde-panel">
                      <div class="g9k-form-title">🚧 Risks, blockers & next action</div>
                      ${(fdeProject.summary?.blockers || []).map((risk) => html`
                        <div key=${risk.id} class="g9k-fde-risk is-blocked"><b>BLOCKED · ${risk.title}</b><span>Owner: ${risk.owner} · ${risk.mitigation}</span></div>
                      `)}
                      ${fdeProject.brief.next_actions.slice(0, 4).map((action) => html`
                        <div key=${action.id} class="g9k-fde-risk">
                          <div class="g9k-fde-item-head">
                            <b>${action.priority} · ${action.title}</b>
                            <code>${action.id}</code>
                          </div>
                          <span>Owner: ${action.owner} · DoD: ${action.definition_of_done}</span>
                        </div>
                      `)}
                    </section>
                  </div>
                `}
              </div>
            `}

            <!-- TAB 2: LIVE REPO RELEASE GATES -->
            ${activeTab === 'gates' &&
            html`
              <div class="g9k-gates-wrap">
                <div class="g9k-gates-summary">
                  <div>
                    <div class="g9k-status-row">
                      <span
                        class=${`g9k-verdict-pill ${
                          auditReport?.overallStatus === 'GO_FOR_LAUNCH' ? 'is-go' : 'is-hold'
                        }`}
                      >
                        ${auditReport?.overallStatus === 'GO_FOR_LAUNCH'
                          ? '✅ GO FOR LAUNCH · ĐỦ ĐIỀU KIỆN PHÁT HÀNH'
                          : '⏳ ĐANG KIỂM ĐỊNH...'}
                      </span>
                      ${auditReport &&
                      html`<span class="g9k-meta-text">
                        Độ sẵn sàng hiệu chuẩn trung bình:
                        <b> ${(auditReport.calibratedReadiness * 100).toFixed(1)}%</b> ·
                        Engine: <code>${auditReport.gates?.[0]?.engine || 'gemini-decision-1'}</code>
                      </span>`}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="g9k-audit-btn"
                    disabled=${auditing}
                    onClick=${runFullAudit}
                  >
                    ${auditing ? '⏳ Đang chấm điểm...' : '⚡ Chạy Lại 4 Cổng Kiểm Định Repo'}
                  </button>
                </div>

                ${auditReport &&
                html`
                  <div class="g9k-gates-grid">
                    ${auditReport.gates.map((g) => {
                      const pct = Math.round((g.booleanProbability || 0) * 100);
                      return html`
                        <div key=${g.gateId} class="g9k-gate-card">
                          <div class="g9k-gate-head">
                            <span class="g9k-gate-title">${g.name}</span>
                            <span class=${`g9k-gate-pass ${g.passed ? 'ok' : 'fail'}`}>
                              ${g.passed ? `PASS · ${pct}%` : `HOLD · ${pct}%`}
                            </span>
                          </div>
                          <div class="g9k-prob-bar">
                            <div class="g9k-prob-fill" style=${{ width: `${pct}%` }}></div>
                          </div>
                          <div class="g9k-gate-meta">
                            <div>
                              Quyết định: <code>${g.recommendedChoice}</code>
                              <span> (${Math.round((g.choiceConfidence || 0) * 100)}%)</span>
                            </div>
                            <div>
                              Điểm Rubric: <b>${g.rubricScore?.toFixed(2)} / ${g.rubricMax}</b>
                            </div>
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                `}
              </div>
            `}

            <!-- TAB 2: SPRINT BACKLOG & AI TASK TRIAGE -->
            ${activeTab === 'backlog' &&
            html`
              <div class="g9k-backlog-grid">
                <form class="g9k-triage-form" onSubmit=${submitNewTask}>
                  <div class="g9k-form-title">➕ Thêm Hạng Mục Dev / Báo Lỗi Mới (Tự Động Phân Luồng AI)</div>
                  <div class="g9k-form-row">
                    <select
                      class="g9k-select"
                      value=${taskCategory}
                      onChange=${(e) => setTaskCategory(e.currentTarget.value)}
                    >
                      <option value="feature">✨ Tính năng mới</option>
                      <option value="bug">🐛 Báo lỗi QA / KOL</option>
                      <option value="compliance">⚖️ Pháp lý / Bảo mật</option>
                    </select>
                    <input
                      type="text"
                      class="g9k-input"
                      placeholder="Ví dụ: Thêm bản đồ Băng Hà + quà Cá Voi 299 xu TikTok Live..."
                      value=${taskTitle}
                      onInput=${(e) => setTaskTitle(e.currentTarget.value)}
                    />
                  </div>
                  <textarea
                    rows="2"
                    class="g9k-textarea"
                    placeholder="Mô tả kỹ thuật, log lỗi hoặc yêu cầu KPI (Decisions API sẽ tự động gán Squad, mức ưu tiên P0-P3 & xác suất rủi ro)..."
                    value=${taskDesc}
                    onInput=${(e) => setTaskDesc(e.currentTarget.value)}
                  ></textarea>
                  <button type="submit" class="g9k-audit-btn" disabled=${triaging || !taskTitle.trim()}>
                    ${triaging ? 'Đang phân tích xác suất...' : '🚀 Phân Luồng & Đưa Vào Sprint Backlog'}
                  </button>
                </form>

                <div class="g9k-task-list">
                  ${board.tasks.map(
                    (t) => html`
                      <div key=${t.id} class="g9k-task-item">
                        <div class="g9k-task-top">
                          <span class="g9k-task-id">${t.id}</span>
                          <span class="g9k-task-title">${t.title}</span>
                          <span class=${`g9k-task-status ${t.status === 'NEEDS_MITIGATION' ? 'warn' : ''}`}>
                            ${t.priority ? `${t.priority} · ` : ''}${t.status}
                          </span>
                        </div>
                        <div class="g9k-task-sub">
                          <span>Phụ trách: <b>${t.owner}</b></span>
                          <span>Kết quả Decisions: <code>${t.decisionSummary}</code></span>
                        </div>
                      </div>
                    `
                  )}
                </div>
              </div>
            `}

            <!-- TAB 3: AUDIT TRAIL -->
            ${activeTab === 'history' &&
            html`
              <div class="g9k-history-list">
                ${board.history.length === 0
                  ? html`<div class="g9k-meta-text">Chưa có lịch sử chạy quyết định nào trong phiên này.</div>`
                  : board.history.map(
                      (h) => html`
                        <div key=${h.id} class="g9k-history-row">
                          <div class="g9k-history-main">
                            <code>[${h.gateId}]</code>
                            <span>${h.headlines.join(' · ')}</span>
                          </div>
                          <div class="g9k-history-meta">
                            <span>${h.engine}</span>
                            <span>${h.latencyMs} ms</span>
                            <span>${new Date(h.timestamp).toLocaleTimeString('vi-VN', { hour12: false })}</span>
                          </div>
                        </div>
                      `
                    )}
              </div>
            `}
          </div>
        `}
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('g9k-governance-root');
    if (mount) {
      render(html`<${GovernanceDeck} />`, mount);
    }
  });
})();
