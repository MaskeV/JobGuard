import { useState } from 'react';
import { analyzeJob, createJob } from '../services/api';
import '../styles/AnalyzerPage.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectPlatform(url = '') {
  const u = url.toLowerCase();
  const map = [
    ['linkedin.com',      'LinkedIn'],
    ['indeed.com',        'Indeed'],
    ['glassdoor.com',     'Glassdoor'],
    ['naukri.com',        'Naukri'],
    ['monster.com',       'Monster'],
    ['ziprecruiter.com',  'ZipRecruiter'],
    ['dice.com',          'Dice'],
    ['remoteok.com',      'RemoteOK'],
    ['wellfound.com',     'Wellfound'],
    ['angel.co',          'AngelList'],
    ['greenhouse.io',     'Greenhouse'],
    ['lever.co',          'Lever'],
    ['workday.com',       'Workday'],
  ];
  for (const [d, n] of map) if (u.includes(d)) return n;
  return 'Other';
}

const VERDICT_CONFIG = {
  REAL:       { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)',  icon: '🛡️', label: 'REAL',        sub: 'This job listing appears legitimate' },
  FAKE:       { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: '🚨', label: 'FAKE / SCAM', sub: 'Multiple scam indicators detected'    },
  SUSPICIOUS: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  icon: '⚠️', label: 'SUSPICIOUS',  sub: 'Proceed with caution — verify first'  },
  UNKNOWN:    { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', icon: '❓', label: 'UNKNOWN',     sub: 'Could not determine authenticity'    },
};

const PLATFORMS_LIST = [
  'LinkedIn','Indeed','Glassdoor','Naukri','Monster',
  'ZipRecruiter','Dice','RemoteOK','Wellfound','AngelList',
  'Greenhouse','Lever','Workday',
];

// ── Sub-components ────────────────────────────────────────────────────────────
function RiskMeter({ score }) {
  const color = score >= 70 ? '#f87171' : score >= 40 ? '#fbbf24' : '#34d399';
  const label = score >= 70 ? 'HIGH RISK' : score >= 40 ? 'MEDIUM RISK' : 'LOW RISK';
  return (
    <div className="risk-meter">
      <div className="risk-meter__header">
        <span className="risk-meter__label">Risk Score</span>
        <span className="risk-meter__value" style={{ color }}>{score}<span>/100</span></span>
      </div>
      <div className="risk-meter__track">
        <div
          className="risk-meter__fill"
          style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
      <div className="risk-meter__tag" style={{ color, borderColor: color + '33', background: color + '12' }}>
        {label}
      </div>
    </div>
  );
}

function FlagList({ items, type }) {
  if (!items?.length) return (
    <div className="flag-empty">
      {type === 'red' ? '✓ No red flags detected' : '— No positive signals found'}
    </div>
  );
  return (
    <ul className="flag-list">
      {items.map((item, i) => (
        <li key={i} className={`flag-list__item flag-list__item--${type}`}>
          <span className="flag-list__dot" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ConfidenceRing({ value, color }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="conf-ring">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div className="conf-ring__val" style={{ color }}>{value}%</div>
      <div className="conf-ring__label">Confidence</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnalyzerPage() {
  const [url,         setUrl]     = useState('');
  const [title,       setTitle]   = useState('');
  const [company,     setCompany] = useState('');
  const [description, setDesc]    = useState('');
  const [salary,      setSalary]  = useState('');
  const [location,    setLoc]     = useState('');

  const [loading,   setLoading]  = useState(false);
  const [result,    setResult]   = useState(null);
  const [error,     setError]    = useState('');
  const [saved,     setSaved]    = useState(false);
  const [saving,    setSaving]   = useState(false);
  const [activeTab, setTab]      = useState('url');

  const platform = detectPlatform(url);
  const vc = result ? (VERDICT_CONFIG[result.verdict] || VERDICT_CONFIG.UNKNOWN) : null;

  async function handleAnalyze() {
    const trimmed = url.trim();
    if (!trimmed)                      { setError('Please paste a job URL'); return; }
    if (!trimmed.startsWith('http'))   { setError('URL must start with http:// or https://'); return; }

    setLoading(true);
    setError('');
    setResult(null);
    setSaved(false);

    try {
      const data = await analyzeJob({ url: trimmed, title, company, description, salary, location });
      setResult(data);
    } catch (err) {
      setError(`Analysis failed: ${err.message}. Is your backend running on port 5000?`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result || saved) return;
    setSaving(true);
    try {
      await createJob({
        title:    result.extractedTitle   || title   || 'Untitled Job',
        company:  result.extractedCompany || company || 'Unknown Company',
        url:      url.trim(),
        platform: result.platform || platform,
        status:   'Saved',
        salary, location,
        analysis: {
          verdict:         result.verdict,
          confidence:      result.confidence,
          riskScore:       result.riskScore,
          summary:         result.summary,
          redFlags:        result.redFlags        || [],
          positiveSignals: result.positiveSignals || [],
          recommendation:  result.recommendation  || '',
          analyzedAt:      result.analyzedAt      || new Date().toISOString(),
        },
      });
      setSaved(true);
    } catch (err) {
      setError('Could not save — is your backend running?');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setResult(null); setError(''); setSaved(false);
    setUrl(''); setTitle(''); setCompany(''); setDesc(''); setSalary(''); setLoc('');
  }

  return (
    <div className="analyzer">

      {/* ── Header ── */}
      <header className="analyzer__header fade-up">
        <div className="analyzer__logo">
          <span className="analyzer__logo-icon">🛡️</span>
          <span className="analyzer__logo-text">JobGuard</span>
          <span className="analyzer__logo-badge">AI Analyzer</span>
        </div>
        <p className="analyzer__tagline">
          Paste any job URL · AI detects scams across 13+ platforms
        </p>
      </header>

      {/* ── Platform pills ── */}
      <div className="platform-pills fade-up d1">
        {PLATFORMS_LIST.map(p => (
          <span key={p} className={`platform-pill ${platform === p ? 'platform-pill--active' : ''}`}>{p}</span>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="analyzer__grid">

        {/* ══ LEFT: Input Panel ══ */}
        <div className="input-panel fade-up d2">

          {/* Tab bar */}
          <div className="tab-bar">
            <button className={`tab-btn ${activeTab === 'url' ? 'tab-btn--active' : ''}`} onClick={() => setTab('url')}>
              🔗 Job URL
            </button>
            <button className={`tab-btn ${activeTab === 'details' ? 'tab-btn--active' : ''}`} onClick={() => setTab('details')}>
              📝 Extra Details
              <span className="tab-btn__badge">boosts accuracy</span>
            </button>
          </div>

          {/* URL tab */}
          {activeTab === 'url' && (
            <div className="tab-content fade-up">
              <div className="form-group">
                <label className="form-label">
                  Job Listing URL
                  {platform !== 'Other' && (
                    <span className="detected-platform">✓ {platform} detected</span>
                  )}
                </label>
                <div className="url-input-wrap">
                  <span className="url-input-icon">🔗</span>
                  <input
                    className="url-input"
                    type="url"
                    placeholder="https://linkedin.com/jobs/... or indeed.com/job/..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !loading && handleAnalyze()}
                    autoFocus
                  />
                  {url && <button className="url-clear" onClick={() => setUrl('')}>✕</button>}
                </div>
                <div className="url-hint">
                  Paste the full URL from LinkedIn, Indeed, Naukri, Glassdoor, or any other job board
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Job Description Text
                  <span className="form-label__opt">recommended</span>
                </label>
                <textarea
                  className="form-textarea"
                  placeholder="Paste the job description here for much better accuracy..."
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  rows={6}
                />
                {description && (
                  <div className="char-count">{description.length} chars · {Math.round(description.length / 5)} words estimated</div>
                )}
              </div>
            </div>
          )}

          {/* Details tab */}
          {activeTab === 'details' && (
            <div className="tab-content fade-up">
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Job Title</label>
                  <input className="form-input" placeholder="e.g. Senior Engineer" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  <input className="form-input" placeholder="e.g. TechCorp India" value={company} onChange={e => setCompany(e.target.value)} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Salary / CTC</label>
                  <input className="form-input" placeholder="e.g. 20 LPA or $120k" value={salary} onChange={e => setSalary(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" placeholder="e.g. Pune / Remote" value={location} onChange={e => setLoc(e.target.value)} />
                </div>
              </div>
              <div className="details-tip">
                💡 Extra details help Model-check salary reasonability, location consistency, and company legitimacy
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-box fade-up">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Analyze button */}
          <button
            className={`analyze-btn ${loading ? 'analyze-btn--loading' : ''}`}
            onClick={handleAnalyze}
            disabled={loading || !url.trim()}
          >
            {loading ? (
              <><span className="btn-spinner" /><span>Analyzing with Gemini Flash...</span></>
            ) : (
              <><span>🔍</span><span>Analyze Job Listing</span></>
            )}
          </button>

          {/* Loading steps */}
          {loading && (
            <div className="loading-steps fade-in">
              <div className="loading-step loading-step--done">✓ Sending to backend</div>
              <div className="loading-step loading-step--active">◌ Scraping job page...</div>
              <div className="loading-step">◌ Running Gemini analysis...</div>
              <div className="loading-step">◌ Checking 10+ red flags...</div>
            </div>
          )}

          {/* Info footer */}
          {!loading && !result && (
            <div className="input-footer">
              <div className="info-chips">
                <span className="info-chip">🤖 Gemini 1.5 Flash</span>
                <span className="info-chip">🕷️ Auto page scraper</span>
                <span className="info-chip">⚡ ~3 sec analysis</span>
                <span className="info-chip">🚩 10+ scam patterns</span>
              </div>
            </div>
          )}
        </div>

        {/* ══ RIGHT: Result Panel ══ */}
        <div className="result-panel">

          {/* Empty state */}
          {!result && !loading && (
            <div className="result-empty fade-up d3">
              <div className="result-empty__icon">🔍</div>
              <div className="result-empty__title">Ready to Scan</div>
              <div className="result-empty__sub">
                Paste a job URL on the left and click Analyze.<br />
                The Model will scan for scam patterns in seconds.
              </div>
              <div className="result-empty__checks">
                {[
                  ['🚩', 'Unrealistic salary claims'],
                  ['🚩', 'Vague / missing job description'],
                  ['🚩', 'Unverifiable company'],
                  ['🚩', 'Upfront payment requests'],
                  ['🚩', 'Personal info asked early'],
                  ['✅', 'Named recruiter / hiring manager'],
                  ['✅', 'Clear role & responsibilities'],
                  ['✅', 'Market-rate compensation'],
                ].map(([e, t], i) => (
                  <div key={i} className="check-item"><span>{e}</span><span>{t}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="result-skeleton fade-in">
              <div className="skeleton-hero" />
              <div className="skeleton-bar" style={{ width: '100%' }} />
              <div className="skeleton-bar" style={{ width: '85%' }} />
              <div className="skeleton-bar" style={{ width: '70%' }} />
              <div className="skeleton-grid">
                <div className="skeleton-block" />
                <div className="skeleton-block" />
              </div>
            </div>
          )}

          {/* Result */}
          {result && vc && (
            <div className="result-content fade-up">

              <div className="verdict-hero" style={{ background: vc.bg, borderColor: vc.border }}>
                <div className="verdict-hero__left">
                  <div className="verdict-hero__emoji">{vc.icon}</div>
                  <div>
                    <div className="verdict-hero__label" style={{ color: vc.color }}>{vc.label}</div>
                    <div className="verdict-hero__sub">{vc.sub}</div>
                    <div className="verdict-hero__meta">
                      <span>{result.platform || detectPlatform(url)}</span>
                      {result.scrapedOk === false && <span className="scrape-warn">⚠ Manual mode</span>}
                    </div>
                  </div>
                </div>
                <ConfidenceRing value={result.confidence || 0} color={vc.color} />
              </div>

              <RiskMeter score={result.riskScore || 0} />

              <div className="result-section">
                <div className="result-section__title">AI Summary</div>
                <p className="result-summary">{result.summary}</p>
              </div>

              <div className="flags-grid">
                <div className="flags-card flags-card--red">
                  <div className="flags-card__header">
                    <span>🚩</span> Red Flags <span className="flags-count">{result.redFlags?.length || 0}</span>
                  </div>
                  <FlagList items={result.redFlags} type="red" />
                </div>
                <div className="flags-card flags-card--green">
                  <div className="flags-card__header">
                    <span>✅</span> Positive Signals <span className="flags-count">{result.positiveSignals?.length || 0}</span>
                  </div>
                  <FlagList items={result.positiveSignals} type="green" />
                </div>
              </div>

              <div className="recommendation" style={{ borderColor: vc.border, background: vc.bg }}>
                <div className="recommendation__label" style={{ color: vc.color }}>💡 Recommendation</div>
                <p className="recommendation__text">{result.recommendation}</p>
              </div>

              <div className="result-actions">
                <button className={`save-btn ${saved ? 'save-btn--saved' : ''}`} onClick={handleSave} disabled={saved || saving}>
                  {saving ? <><span className="btn-spinner btn-spinner--dark" /> Saving...</> : saved ? <>✓ Saved to Tracker</> : <>➕ Save to Job Tracker</>}
                </button>
                <button className="reset-btn" onClick={handleReset}>🔄 Analyze Another</button>
              </div>

              {(result.extractedTitle || result.extractedCompany) && (
                <div className="extracted-data">
                  <div className="extracted-data__label">Extracted from page</div>
                  <div className="extracted-data__row">
                    {result.extractedTitle   && <span>📋 {result.extractedTitle}</span>}
                    {result.extractedCompany && <span>🏢 {result.extractedCompany}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}