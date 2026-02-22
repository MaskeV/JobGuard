import { useState, useEffect } from 'react';
import { getJobs, getAnalytics, updateJob, deleteJob } from '../services/api';
import { scanEmails } from '../services/api';
import '../styles/Dashboard.css';

const STATUS_CONFIG = {
  Saved:     { color: '#8b5cf6', emoji: '💾', label: 'Saved' },
  Applied:   { color: '#3b82f6', emoji: '📨', label: 'Applied' },
  Interview: { color: '#f59e0b', emoji: '🎯', label: 'Interview' },
  Offer:     { color: '#10b981', emoji: '🏆', label: 'Offer' },
  Rejected:  { color: '#ef4444', emoji: '✕',  label: 'Rejected' },
  Ghosted:   { color: '#6b7280', emoji: '👻', label: 'Ghosted' },
};

const VERDICT_CONFIG = {
  REAL:       { color: '#34d399', label: 'Real' },
  FAKE:       { color: '#f87171', label: 'Fake' },
  SUSPICIOUS: { color: '#fbbf24', label: 'Suspicious' },
  UNKNOWN:    { color: '#64748b', label: 'Unknown' },
};

function StatCard({ title, value, subtitle, color, icon }) {
  return (
    <div className="stat-card fade-up">
      <div className="stat-card__icon" style={{ background: `${color}15`, color }}>{icon}</div>
      <div className="stat-card__content">
        <div className="stat-card__value" style={{ color }}>{value}</div>
        <div className="stat-card__title">{title}</div>
        {subtitle && <div className="stat-card__subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

function JobCard({ job, onUpdate, onDelete, onViewAnalysis }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(job.status);
  const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.Saved;
  const verdictCfg = VERDICT_CONFIG[job.analysis?.verdict] || VERDICT_CONFIG.UNKNOWN;

  async function handleStatusChange(newStatus) {
    try {
      await onUpdate(job._id, { status: newStatus });
      setStatus(newStatus);
      setEditing(false);
    } catch (err) {
      alert('Failed to update status');
    }
  }

  return (
    <div className="job-card fade-up">
      <div className="job-card__header">
        <div>
          <div className="job-card__title">{job.title}</div>
          <div className="job-card__company">
            {job.company} · {job.platform}
            {job.source === 'email' && <span className="job-card__badge">📧 Email</span>}
            {job.source === 'extension' && <span className="job-card__badge">🔌 Extension</span>}
          </div>
        </div>
        
        <div className="job-card__actions">
          <button className="job-card__btn" onClick={() => window.open(job.url, '_blank')}>
            🔗
          </button>
          <button className="job-card__btn" onClick={() => setEditing(!editing)}>
            ⚙️
          </button>
          <button className="job-card__btn job-card__btn--danger" onClick={() => onDelete(job._id)}>
            🗑️
          </button>
        </div>
      </div>

      {editing && (
        <div className="job-card__edit">
          <label className="job-card__label">Change Status:</label>
          <div className="status-grid">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                className={`status-btn ${status === key ? 'status-btn--active' : ''}`}
                style={{ borderColor: cfg.color, color: cfg.color }}
                onClick={() => handleStatusChange(key)}
              >
                {cfg.emoji} {cfg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="job-card__meta">
        <div className="job-card__status" style={{ background: `${statusCfg.color}15`, color: statusCfg.color, borderColor: `${statusCfg.color}40` }}>
          {statusCfg.emoji} {statusCfg.label}
        </div>
        
        {job.analysis?.verdict && job.analysis.verdict !== 'UNKNOWN' && (
          <div 
            className="job-card__verdict" 
            style={{ background: `${verdictCfg.color}15`, color: verdictCfg.color, borderColor: `${verdictCfg.color}40` }}
          >
            {job.analysis.verdict === 'FAKE' && '🚨'} 
            {job.analysis.verdict === 'SUSPICIOUS' && '⚠️'}
            {job.analysis.verdict === 'REAL' && '✓'}
            {verdictCfg.label}
            {job.analysis.riskScore > 0 && ` · ${job.analysis.riskScore}/100`}
          </div>
        )}
        
        {job.salary && <div className="job-card__info">💰 {job.salary}</div>}
        {job.location && <div className="job-card__info">📍 {job.location}</div>}
      </div>

      <div className="job-card__footer">
        <span className="job-card__date">
          Applied {new Date(job.appliedDate || job.createdAt).toLocaleDateString()}
        </span>
        {job.analysis?.summary && (
          <button className="job-card__analysis-btn" onClick={() => onViewAnalysis(job)}>
            View AI Analysis →
          </button>
        )}
      </div>
    </div>
  );
}

function EmailImporter({ onImport }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [daysBack, setDaysBack] = useState(30);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  async function handlePreview() {
    if (!email || !password) {
      setError('Please enter email and app password');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await scanEmails({ email, password, daysBack, preview: true });
      setPreview(result);
    } catch (err) {
      setError(err.message || 'Failed to scan emails');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setLoading(true);
    setError('');
    try {
      const result = await scanEmails({ email, password, daysBack, preview: false });
      alert(`✅ Import complete!\n\nImported: ${result.imported}\nSkipped: ${result.skipped}\nErrors: ${result.errors}`);
      setPreview(null);
      onImport();
    } catch (err) {
      setError(err.message || 'Failed to import');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="email-importer">
      <div className="email-importer__header">
        <h3>📧 Import from Gmail</h3>
        <p>Automatically scan your emails for job applications</p>
      </div>

      <div className="email-importer__form">
        <div className="form-group">
          <label>Gmail Address</label>
          <input
            type="email"
            placeholder="your.email@gmail.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>
            App Password 
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="help-link">
              Get App Password →
            </a>
          </label>
          <input
            type="password"
            placeholder="16-character app password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="form-input"
          />
          <small className="form-hint">
            Not your Gmail password! Generate an App Password from your Google Account settings.
          </small>
        </div>

        <div className="form-group">
          <label>Scan Last</label>
          <select value={daysBack} onChange={e => setDaysBack(Number(e.target.value))} className="form-select">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="email-importer__actions">
          <button 
            className="btn btn--secondary"
            onClick={handlePreview}
            disabled={loading || !email || !password}
          >
            {loading ? 'Scanning...' : '🔍 Preview'}
          </button>
          
          {preview && (
            <button 
              className="btn btn--primary"
              onClick={handleImport}
              disabled={loading || preview.count === 0}
            >
              ➕ Import {preview.count} Applications
            </button>
          )}
        </div>
      </div>

      {preview && preview.count > 0 && (
        <div className="email-preview">
          <h4>Found {preview.count} applications:</h4>
          <div className="email-preview__list">
            {preview.applications.slice(0, 10).map((app, i) => (
              <div key={i} className="email-preview__item">
                <div className="email-preview__title">{app.title || app.subject}</div>
                <div className="email-preview__meta">
                  {app.company && <span>🏢 {app.company}</span>}
                  <span>{new Date(app.receivedDate).toLocaleDateString()}</span>
                  <span className="email-preview__status">{app.status}</span>
                </div>
              </div>
            ))}
            {preview.count > 10 && (
              <div className="email-preview__more">+ {preview.count - 10} more...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', verdict: '', search: '' });
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  async function loadData() {
    try {
      const [jobsData, analyticsData] = await Promise.all([
        getJobs(filter),
        getAnalytics(),
      ]);
      setJobs(jobsData);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [filter]);

  async function handleUpdateJob(id, updates) {
    await updateJob(id, updates);
    loadData();
  }

  async function handleDeleteJob(id) {
    if (!confirm('Delete this job?')) return;
    await deleteJob(id);
    loadData();
  }

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard__header fade-up">
        <div>
          <h1 className="dashboard__title">
            <span>🛡️</span> JobGuard Dashboard
          </h1>
          <p className="dashboard__subtitle">Track applications · Detect scams · Stay organized</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowEmailImport(!showEmailImport)}>
          📧 Import from Email
        </button>
      </header>

      {/* Email Importer */}
      {showEmailImport && (
        <div className="fade-up d1">
          <EmailImporter onImport={() => { loadData(); setShowEmailImport(false); }} />
        </div>
      )}

      {/* Stats */}
      {analytics && (
        <div className="stats-grid fade-up d2">
          <StatCard title="Total Applications" value={analytics.total} subtitle="tracked" color="#63b3ed" icon="📊" />
          <StatCard title="Applied" value={analytics.applied} subtitle="submitted" color="#3b82f6" icon="📨" />
          <StatCard title="Interviews" value={analytics.interviews} subtitle="scheduled" color="#f59e0b" icon="🎯" />
          <StatCard title="Offers" value={analytics.offers} subtitle="received" color="#10b981" icon="🏆" />
          <StatCard title="Response Rate" value={`${analytics.responseRate}%`} subtitle="interview+offer" color="#a78bfa" icon="📈" />
          <StatCard title="Risk Score" value={analytics.avgRiskScore} subtitle="avg scam risk" color={analytics.avgRiskScore > 50 ? '#ef4444' : '#34d399'} icon="🚨" />
        </div>
      )}

      {/* Filters */}
      <div className="filters fade-up d3">
        <select 
          className="filter-select"
          value={filter.status}
          onChange={e => setFilter({ ...filter, status: e.target.value })}
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_CONFIG).map(status => (
            <option key={status} value={status}>{STATUS_CONFIG[status].emoji} {status}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filter.verdict}
          onChange={e => setFilter({ ...filter, verdict: e.target.value })}
        >
          <option value="">All Verdicts</option>
          <option value="REAL">✓ Real</option>
          <option value="SUSPICIOUS">⚠️ Suspicious</option>
          <option value="FAKE">🚨 Fake</option>
        </select>

        <input
          type="text"
          placeholder="🔍 Search jobs..."
          className="filter-search"
          value={filter.search}
          onChange={e => setFilter({ ...filter, search: e.target.value })}
        />
      </div>

      {/* Jobs Grid */}
      <div className="jobs-grid">
        {jobs.length === 0 ? (
          <div className="empty-state fade-up d4">
            <div className="empty-state__icon">📭</div>
            <h3>No jobs found</h3>
            <p>Try importing from email or adding jobs manually</p>
          </div>
        ) : (
          jobs.map((job, i) => (
            <JobCard
              key={job._id}
              job={job}
              onUpdate={handleUpdateJob}
              onDelete={handleDeleteJob}
              onViewAnalysis={setSelectedJob}
            />
          ))
        )}
      </div>

      {/* Analysis Modal */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3>AI Analysis: {selectedJob.title}</h3>
              <button className="modal__close" onClick={() => setSelectedJob(null)}>✕</button>
            </div>
            <div className="modal__body">
              <div className="analysis-detail">
                <div className="analysis-detail__verdict" style={{ 
                  background: `${VERDICT_CONFIG[selectedJob.analysis.verdict]?.color}15`,
                  color: VERDICT_CONFIG[selectedJob.analysis.verdict]?.color
                }}>
                  {selectedJob.analysis.verdict} · {selectedJob.analysis.confidence}% confidence · Risk: {selectedJob.analysis.riskScore}/100
                </div>
                
                <p className="analysis-detail__summary">{selectedJob.analysis.summary}</p>
                
                {selectedJob.analysis.redFlags?.length > 0 && (
                  <div className="analysis-section">
                    <h4>🚩 Red Flags</h4>
                    <ul>
                      {selectedJob.analysis.redFlags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedJob.analysis.positiveSignals?.length > 0 && (
                  <div className="analysis-section">
                    <h4>✅ Positive Signals</h4>
                    <ul>
                      {selectedJob.analysis.positiveSignals.map((signal, i) => (
                        <li key={i}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="analysis-section">
                  <h4>💡 Recommendation</h4>
                  <p>{selectedJob.analysis.recommendation}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}