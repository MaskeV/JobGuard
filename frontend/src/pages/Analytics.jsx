import { useState, useEffect, useRef } from 'react';
import { getJobs, getAnalytics, updateJob, deleteJob } from '../services/api';
import '../styles/Analytics.css';

// ── Config ────────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  Saved:     { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', emoji: '💾', label: 'Saved' },
  Applied:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', emoji: '📨', label: 'Applied' },
  Interview: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', emoji: '🎯', label: 'Interview' },
  Offer:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)', emoji: '🏆', label: 'Offer' },
  Rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  emoji: '✕',  label: 'Rejected' },
  Ghosted:   { color: '#6b7280', bg: 'rgba(107,114,128,0.12)',emoji: '👻', label: 'Ghosted' },
};

const VERDICT_CONFIG = {
  REAL:       { color: '#34d399', label: 'Real' },
  FAKE:       { color: '#f87171', label: 'Fake' },
  SUSPICIOUS: { color: '#fbbf24', label: 'Suspicious' },
  UNKNOWN:    { color: '#64748b', label: 'Unknown' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function exportToCSV(jobs) {
  const headers = ['Title', 'Company', 'Platform', 'Status', 'Salary', 'Location', 'Applied Date', 'Verdict', 'Risk Score', 'URL', 'Notes'];
  const rows = jobs.map(j => [
    j.title, j.company, j.platform, j.status,
    j.salary || '', j.location || '',
    new Date(j.appliedDate || j.createdAt).toLocaleDateString(),
    j.analysis?.verdict || '', j.analysis?.riskScore || '',
    j.url, (j.notes || '').replace(/,/g, ';'),
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `jobguard-tracker-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function isOverdue(job) {
  if (!job.followUpDate) return false;
  return new Date(job.followUpDate) < new Date() && !['Offer','Rejected','Ghosted'].includes(job.status);
}

function isDueSoon(job) {
  if (!job.followUpDate) return false;
  const diff = new Date(job.followUpDate) - new Date();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
}

function daysAgo(date) {
  const d = Math.floor((Date.now() - new Date(date)) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data, colorKey }) {
  if (!data || !data.length) return <div className="chart-empty">No data yet</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="bar-chart">
      {data.slice(0, 8).map((d, i) => (
        <div key={i} className="bar-chart__row">
          <div className="bar-chart__label">{d.label || d.month || 'Unknown'}</div>
          <div className="bar-chart__track">
            <div
              className="bar-chart__fill"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: colorKey?.[d.label] || 'var(--accent)',
              }}
            />
          </div>
          <div className="bar-chart__count">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

// ── Funnel Chart ──────────────────────────────────────────────────────────────
function FunnelChart({ analytics }) {
  if (!analytics) return null;
  const stages = [
    { label: 'Applied',   count: analytics.applied,    color: '#3b82f6' },
    { label: 'Interview', count: analytics.interviews, color: '#f59e0b' },
    { label: 'Offer',     count: analytics.offers,     color: '#10b981' },
  ];
  const max = Math.max(analytics.applied || 1, 1);
  return (
    <div className="funnel">
      {stages.map((s, i) => (
        <div key={i} className="funnel__stage">
          <div className="funnel__bar-wrap">
            <div
              className="funnel__bar"
              style={{
                width: `${Math.max((s.count / max) * 100, 4)}%`,
                background: s.color,
                opacity: 0.85 - i * 0.1,
              }}
            />
          </div>
          <div className="funnel__meta">
            <span style={{ color: s.color }}>{s.label}</span>
            <span className="funnel__count">{s.count}</span>
            {i > 0 && <span className="funnel__rate">
              {stages[i-1].count > 0 ? Math.round((s.count / stages[i-1].count) * 100) : 0}% conv.
            </span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanCard({ job, onUpdate, onDelete }) {
  const vc = VERDICT_CONFIG[job.analysis?.verdict];
  const overdue = isOverdue(job);
  const dueSoon = isDueSoon(job);

  return (
    <div className={`kanban-card ${overdue ? 'kanban-card--overdue' : ''}`}>
      {overdue && <div className="kanban-card__overdue-badge">⏰ Follow-up overdue</div>}
      {dueSoon && !overdue && <div className="kanban-card__soon-badge">📌 Due soon</div>}
      <div className="kanban-card__title">{job.title}</div>
      <div className="kanban-card__company">{job.company}</div>
      {job.salary && <div className="kanban-card__salary">💰 {job.salary}</div>}
      <div className="kanban-card__footer">
        <span className="kanban-card__date">{daysAgo(job.appliedDate || job.createdAt)}</span>
        {vc && (
          <span className="kanban-card__verdict" style={{ color: vc.color }}>
            {job.analysis.verdict === 'REAL' ? '✓' : job.analysis.verdict === 'FAKE' ? '🚨' : '⚠'}
          </span>
        )}
        <button className="kanban-card__link" onClick={() => window.open(job.url, '_blank')}>↗</button>
        <button className="kanban-card__del" onClick={() => onDelete(job._id)}>×</button>
      </div>
    </div>
  );
}

function KanbanColumn({ status, jobs, onUpdate, onDelete }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div className="kanban-col">
      <div className="kanban-col__header" style={{ borderColor: cfg.color }}>
        <span>{cfg.emoji}</span>
        <span className="kanban-col__title">{cfg.label}</span>
        <span className="kanban-col__count" style={{ background: cfg.bg, color: cfg.color }}>
          {jobs.length}
        </span>
      </div>
      <div className="kanban-col__body">
        {jobs.length === 0 ? (
          <div className="kanban-col__empty">No jobs here</div>
        ) : (
          jobs.map(job => (
            <KanbanCard key={job._id} job={job} onUpdate={onUpdate} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Follow-up Tracker ─────────────────────────────────────────────────────────
function FollowUpTracker({ jobs, onUpdate }) {
  const needFollowUp = jobs.filter(j =>
    !['Offer','Rejected','Ghosted'].includes(j.status) &&
    (isOverdue(j) || isDueSoon(j) || !j.followUpDate)
  ).sort((a, b) => {
    if (isOverdue(a)) return -1;
    if (isOverdue(b)) return 1;
    if (isDueSoon(a)) return -1;
    return 0;
  }).slice(0, 10);

  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');

  async function saveFollowUp(id) {
    await onUpdate(id, { followUpDate: editDate });
    setEditingId(null);
  }

  return (
    <div className="followup">
      <div className="followup__header">
        <span className="followup__title">⏰ Follow-up Tracker</span>
        <span className="followup__sub">{needFollowUp.length} needing attention</span>
      </div>
      {needFollowUp.length === 0 ? (
        <div className="followup__empty">All follow-ups are on track 🎉</div>
      ) : (
        <div className="followup__list">
          {needFollowUp.map(job => {
            const overdue = isOverdue(job);
            const soon = isDueSoon(job);
            return (
              <div key={job._id} className={`followup__item ${overdue ? 'followup__item--overdue' : soon ? 'followup__item--soon' : ''}`}>
                <div className="followup__info">
                  <div className="followup__job-title">{job.title}</div>
                  <div className="followup__company">{job.company} · {STATUS_CONFIG[job.status]?.emoji} {job.status}</div>
                  {job.followUpDate ? (
                    <div className="followup__date" style={{ color: overdue ? '#f87171' : soon ? '#fbbf24' : 'var(--text2)' }}>
                      {overdue ? '🔴 Overdue: ' : soon ? '🟡 Due: ' : '📅 '}
                      {new Date(job.followUpDate).toLocaleDateString()}
                    </div>
                  ) : (
                    <div className="followup__no-date">No follow-up date set</div>
                  )}
                </div>
                {editingId === job._id ? (
                  <div className="followup__edit">
                    <input
                      type="date"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      className="followup__date-input"
                    />
                    <button className="followup__save-btn" onClick={() => saveFollowUp(job._id)}>Save</button>
                    <button className="followup__cancel-btn" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <button
                    className="followup__set-btn"
                    onClick={() => { setEditingId(job._id); setEditDate(''); }}
                  >
                    {job.followUpDate ? 'Update' : 'Set date'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Quick Notes Modal ─────────────────────────────────────────────────────────
function NotesModal({ job, onSave, onClose }) {
  const [notes, setNotes] = useState(job.notes || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(job._id, { notes });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <div className="modal__title">{job.title}</div>
            <div className="modal__sub">{job.company}</div>
          </div>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <label className="modal__label">Notes & interview prep</label>
          <textarea
            className="modal__textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Interview notes, contacts, key requirements, salary negotiation points..."
            rows={8}
            autoFocus
          />
          <div className="modal__actions">
            <button className="modal__save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : '💾 Save notes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Analytics Component ──────────────────────────────────────────────────
export default function Analytics() {
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('overview'); // 'overview' | 'kanban' | 'followups'
  const [notesJob, setNotesJob] = useState(null);

  async function loadData() {
    const [jobsData, analyticsData] = await Promise.all([getJobs({}), getAnalytics()]);
    setJobs(jobsData);
    setAnalytics(analyticsData);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleUpdate(id, updates) {
    await updateJob(id, updates);
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this job from your tracker?')) return;
    await deleteJob(id);
    loadData();
  }

  const jobsByStatus = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = jobs.filter(j => j.status === s);
    return acc;
  }, {});

  const statusChartData = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    label: cfg.label,
    count: jobsByStatus[key]?.length || 0,
    color: cfg.color,
  }));

  const verdictChartData = Object.entries(VERDICT_CONFIG).map(([key, cfg]) => ({
    label: cfg.label,
    count: analytics?.byVerdict?.[key] || 0,
    color: cfg.color,
  })).filter(d => d.count > 0);

  const overdueCount = jobs.filter(isOverdue).length;
  const dueSoonCount = jobs.filter(isDueSoon).length;

  if (loading) {
    return <div className="analytics-loading">Loading analytics…</div>;
  }

  return (
    <div className="analytics">
      {/* Header */}
      <header className="analytics__header fade-up">
        <div className="analytics__title-row">
          <div>
            <h1 className="analytics__title">📊 Analytics & Tracker</h1>
            <p className="analytics__sub">Full visibility into your job search pipeline</p>
          </div>
          <div className="analytics__header-actions">
            {overdueCount > 0 && (
              <div className="overdue-alert">
                ⏰ {overdueCount} overdue follow-up{overdueCount > 1 ? 's' : ''}
              </div>
            )}
            <button className="export-btn" onClick={() => exportToCSV(jobs)}>
              📤 Export CSV
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="view-tabs">
          {[['overview','📈 Overview'],['kanban','📋 Kanban'],['followups','⏰ Follow-ups']].map(([v,l]) => (
            <button
              key={v}
              className={`view-tab ${view === v ? 'view-tab--active' : ''}`}
              onClick={() => setView(v)}
            >
              {l}
              {v === 'followups' && (overdueCount + dueSoonCount) > 0 && (
                <span className="view-tab__badge">{overdueCount + dueSoonCount}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── Stat cards (always visible) ── */}
      <div className="stat-row fade-up d1">
        {[
          { label: 'Total tracked', value: analytics?.total || 0, color: '#63b3ed', icon: '📊' },
          { label: 'Applied', value: analytics?.applied || 0, color: '#3b82f6', icon: '📨' },
          { label: 'Interviews', value: analytics?.interviews || 0, color: '#f59e0b', icon: '🎯' },
          { label: 'Offers', value: analytics?.offers || 0, color: '#10b981', icon: '🏆' },
          { label: 'Response rate', value: `${analytics?.responseRate || 0}%`, color: '#a78bfa', icon: '📈' },
          { label: 'Avg risk score', value: analytics?.avgRiskScore || 0, color: (analytics?.avgRiskScore || 0) > 50 ? '#f87171' : '#34d399', icon: '🚨' },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="stat-card__icon" style={{ background: `${s.color}15` }}>{s.icon}</div>
            <div className="stat-card__val" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-card__label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Overview ── */}
      {view === 'overview' && (
        <div className="overview-grid fade-up d2">

          {/* Application funnel */}
          <div className="chart-card">
            <div className="chart-card__title">Application funnel</div>
            <FunnelChart analytics={analytics} />
          </div>

          {/* Status breakdown */}
          <div className="chart-card">
            <div className="chart-card__title">By status</div>
            <BarChart
              data={statusChartData.filter(d => d.count > 0)}
              colorKey={Object.fromEntries(Object.entries(STATUS_CONFIG).map(([,v]) => [v.label, v.color]))}
            />
          </div>

          {/* Monthly trend */}
          <div className="chart-card">
            <div className="chart-card__title">Monthly applications</div>
            <BarChart data={(analytics?.byMonth || []).map(d => ({ label: d.month, count: d.count }))} />
          </div>

          {/* Verdict breakdown */}
          <div className="chart-card">
            <div className="chart-card__title">AI verdict breakdown</div>
            <BarChart
              data={verdictChartData}
              colorKey={Object.fromEntries(Object.entries(VERDICT_CONFIG).map(([,v]) => [v.label, v.color]))}
            />
          </div>

          {/* Recent jobs list */}
          <div className="chart-card chart-card--wide">
            <div className="chart-card__title">Recent applications</div>
            <div className="recent-list">
              {jobs.slice(0, 8).map(job => {
                const sc = STATUS_CONFIG[job.status];
                return (
                  <div key={job._id} className="recent-item">
                    <div className="recent-item__left">
                      <div className="recent-item__title">{job.title}</div>
                      <div className="recent-item__company">{job.company} · {job.platform}</div>
                    </div>
                    <div className="recent-item__right">
                      <span className="recent-item__status" style={{ color: sc?.color, background: sc?.bg }}>
                        {sc?.emoji} {sc?.label}
                      </span>
                      <span className="recent-item__date">{daysAgo(job.appliedDate || job.createdAt)}</span>
                      <button className="recent-item__note-btn" onClick={() => setNotesJob(job)} title="Add notes">
                        📝
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Kanban ── */}
      {view === 'kanban' && (
        <div className="kanban fade-up d2">
          {Object.keys(STATUS_CONFIG).map(status => (
            <KanbanColumn
              key={status}
              status={status}
              jobs={jobsByStatus[status] || []}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Follow-ups ── */}
      {view === 'followups' && (
        <div className="fade-up d2">
          <FollowUpTracker jobs={jobs} onUpdate={handleUpdate} />
        </div>
      )}

      {/* Notes modal */}
      {notesJob && (
        <NotesModal job={notesJob} onSave={handleUpdate} onClose={() => setNotesJob(null)} />
      )}
    </div>
  );
}