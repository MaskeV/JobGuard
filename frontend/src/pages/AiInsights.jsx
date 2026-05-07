import { generateAIInsights } from '../services/api';
import { useState, useEffect } from 'react';
import { getJobs, getAnalytics } from '../services/api';
import '../styles/AiInsights.css';

async function generatePipelineHealth(jobs, analytics) {
  return await generateAIInsights('pipeline-health', jobs, analytics);
}

async function generateRolePatterns(jobs) {
  if (jobs.length < 2) return null;
  return await generateAIInsights('role-patterns', jobs, null);
}

async function generateWeeklyPlan(jobs, analytics) {
  return await generateAIInsights('weekly-plan', jobs, analytics);
}

async function generateScamInsights(jobs) {
  const analyzed = jobs.filter(j => j.analysis?.verdict);
  return {
    fakeCount: analyzed.filter(j => j.analysis.verdict === 'FAKE').length,
    suspiciousCount: analyzed.filter(j => j.analysis.verdict === 'SUSPICIOUS').length,
    avgRisk: Math.round(analyzed.reduce((sum, j) => sum + (j.analysis.riskScore || 0), 0) / (analyzed.length || 1)),
    analyzed: analyzed.length,
  };
}

function HealthGauge({ score, label }) {
  const color = score >= 75 ? '#34d399' : score >= 50 ? '#63b3ed' : score >= 30 ? '#fbbf24' : '#f87171';
  const r = 60;
  const circ = Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="health-gauge">
      <svg width="160" height="90" viewBox="0 0 160 90">
        <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div className="health-gauge__val" style={{ color }}>{score}</div>
      <div className="health-gauge__label" style={{ color }}>{label}</div>
    </div>
  );
}

function InsightCard({ icon, title, children, accent }) {
  return (
    <div className="insight-card" style={{ borderColor: accent ? `${accent}30` : undefined, background: accent ? `${accent}06` : undefined }}>
      <div className="insight-card__header">
        <span className="insight-card__icon">{icon}</span>
        <span className="insight-card__title">{title}</span>
      </div>
      <div className="insight-card__body">{children}</div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="insight-card insight-card--loading">
      <div className="insight-card__header">
        <div className="loading-shimmer" style={{ width: 20, height: 20, borderRadius: '50%' }} />
        <div className="loading-shimmer" style={{ width: 140, height: 14, borderRadius: 6 }} />
      </div>
      <div className="insight-card__body">
        <div className="loading-shimmer" style={{ width: '100%', height: 12, borderRadius: 6, marginBottom: 8 }} />
        <div className="loading-shimmer" style={{ width: '85%', height: 12, borderRadius: 6, marginBottom: 8 }} />
        <div className="loading-shimmer" style={{ width: '70%', height: 12, borderRadius: 6 }} />
      </div>
    </div>
  );
}

function BulletList({ items, type }) {
  return (
    <ul className="bullet-list">
      {items?.map((item, i) => (
        <li key={i} className={`bullet-list__item bullet-list__item--${type}`}>{item}</li>
      ))}
    </ul>
  );
}

function WeeklyPlan({ plan }) {
  const dayColors = {
    Monday: '#63b3ed', Tuesday: '#a78bfa', Wednesday: '#34d399',
    Thursday: '#fbbf24', Friday: '#f97316',
  };
  return (
    <div className="weekly-plan">
      {plan.actions?.map((a, i) => (
        <div key={i} className="plan-item">
          <div className="plan-item__day" style={{ color: dayColors[a.day] || 'var(--accent)' }}>{a.day}</div>
          <div className="plan-item__content">
            <div className="plan-item__action">{a.action}</div>
            <div className="plan-item__why">{a.why}</div>
          </div>
          <div className="plan-item__time">{a.timeEstimate}</div>
        </div>
      ))}
    </div>
  );
}

export default function AIInsights() {
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [health, setHealth] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [scam, setScam] = useState(null);
  const [weekPlan, setWeekPlan] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [jobsData, analyticsData] = await Promise.all([getJobs({}), getAnalytics()]);
        setJobs(jobsData);
        setAnalytics(analyticsData);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, []);

  async function generateAllInsights() {
    if (jobs.length === 0) {
      setError('Add some jobs to your tracker first to get AI insights.');
      return;
    }
    setGenerating(true);
    setError('');
    setHealth(null); setPatterns(null); setScam(null); setWeekPlan(null);
    setHealthLoading(true); setPatternsLoading(true); setPlanLoading(true);

    try {
      const [h, p, s, w] = await Promise.all([
        generatePipelineHealth(jobs, analytics).finally(() => setHealthLoading(false)),
        generateRolePatterns(jobs).finally(() => setPatternsLoading(false)),
        generateScamInsights(jobs),
        generateWeeklyPlan(jobs, analytics).finally(() => setPlanLoading(false)),
      ]);
      setHealth(h); setPatterns(p); setScam(s); setWeekPlan(w);
      setGenerated(true);
    } catch (err) {
      setError(`Failed to generate insights: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  if (loadingData) {
    return <div className="ai-insights-loading">Loading your job data…</div>;
  }

  return (
    <div className="ai-insights">
      <header className="ai-insights__header fade-up">
        <div className="ai-insights__logo">
          <div className="ai-insights__logo-icon">✦</div>
          <div>
            <h1 className="ai-insights__title">AI Insights</h1>
            <p className="ai-insights__sub">Personalised coaching based on your {analytics?.total || 0} tracked applications</p>
          </div>
        </div>
        <button className={`generate-btn ${generating ? 'generate-btn--loading' : ''}`} onClick={generateAllInsights} disabled={generating || loadingData}>
          {generating ? <><span className="gen-spinner" />Analysing…</> : generated ? <>↺ Regenerate insights</> : <>✦ Generate AI insights</>}
        </button>
      </header>

      {jobs.length === 0 && (
        <div className="ai-insights__empty fade-up">
          <div className="ai-insights__empty-icon">📭</div>
          <h3>No jobs tracked yet</h3>
          <p>Add jobs via the Analyzer or Job Search tab first.</p>
        </div>
      )}

      {jobs.length > 0 && !generated && !generating && !error && (
        <div className="ai-insights__prompt fade-up d1">
          <div className="prompt-card">
            <div className="prompt-card__icon">✦</div>
            <div className="prompt-card__text">
              <strong>Ready to analyse {jobs.length} applications</strong>
              <p>Click "Generate AI insights" to get your pipeline health score, role patterns, scam exposure, and a personalised weekly action plan.</p>
            </div>
          </div>
          <div className="preview-stats">
            {[
              { label: 'Applications', value: analytics?.total || 0 },
              { label: 'Interviews', value: analytics?.interviews || 0 },
              { label: 'Response rate', value: `${analytics?.responseRate || 0}%` },
              { label: 'Platforms', value: Object.keys(analytics?.byPlatform || {}).length },
            ].map((s, i) => (
              <div key={i} className="preview-stat">
                <div className="preview-stat__val">{s.value}</div>
                <div className="preview-stat__label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="insights-error fade-up">⚠ {error}</div>}

      {(generating || generated) && (
        <div className="insights-grid">
          {healthLoading ? <LoadingCard /> : health ? (
            <InsightCard icon="📊" title="Pipeline health" accent={health.healthScore >= 60 ? '#34d399' : '#f87171'}>
              <div className="health-row">
                <HealthGauge score={health.healthScore} label={health.healthLabel} />
                <div className="health-details">
                  <p className="health-headline">{health.headline}</p>
                  <div className="health-top-action">
                    <span className="health-top-action__label">This week's #1 priority</span>
                    <span className="health-top-action__text">{health.topAction}</span>
                  </div>
                </div>
              </div>
              <div className="pos-neg-grid">
                <div>
                  <div className="list-label list-label--green">What's working</div>
                  <BulletList items={health.positives} type="green" />
                </div>
                <div>
                  <div className="list-label list-label--red">Areas of concern</div>
                  <BulletList items={health.concerns} type="red" />
                </div>
              </div>
            </InsightCard>
          ) : null}

          {patternsLoading ? <LoadingCard /> : patterns ? (
            <InsightCard icon="🎯" title="Role patterns & strategy">
              <p className="pattern-insight">{patterns.patternInsight}</p>
              <p className="pattern-insight" style={{ marginTop: 6 }}>{patterns.companyTypeInsight}</p>
              <p className="pattern-insight" style={{ color: 'var(--accent)' }}>{patterns.diversificationAdvice}</p>
              {patterns.roleRecommendations?.length > 0 && (
                <div className="role-recs">
                  <div className="role-recs__label">Roles worth exploring</div>
                  <div className="role-recs__chips">
                    {patterns.roleRecommendations.map((r, i) => <span key={i} className="role-chip">{r}</span>)}
                  </div>
                </div>
              )}
            </InsightCard>
          ) : null}

          {scam && (
            <InsightCard icon="🛡️" title="Scam exposure" accent={scam.fakeCount > 0 ? '#f87171' : '#34d399'}>
              <div className="scam-stats">
                <div className="scam-stat">
                  <div className="scam-stat__val" style={{ color: scam.fakeCount > 0 ? '#f87171' : '#34d399' }}>{scam.fakeCount}</div>
                  <div className="scam-stat__label">Fake jobs detected</div>
                </div>
                <div className="scam-stat">
                  <div className="scam-stat__val" style={{ color: scam.suspiciousCount > 0 ? '#fbbf24' : '#34d399' }}>{scam.suspiciousCount}</div>
                  <div className="scam-stat__label">Suspicious jobs</div>
                </div>
                <div className="scam-stat">
                  <div className="scam-stat__val">{scam.avgRisk}</div>
                  <div className="scam-stat__label">Avg risk score</div>
                </div>
              </div>
              <p className="scam-msg">
                {scam.fakeCount > 0
                  ? `⚠ ${scam.fakeCount} of your applications may be scams.`
                  : scam.suspiciousCount > 0
                  ? `${scam.suspiciousCount} jobs flagged as suspicious.`
                  : `Your tracked jobs look clean across ${scam.analyzed} analysed listings.`}
              </p>
            </InsightCard>
          )}

          {planLoading ? <LoadingCard /> : weekPlan ? (
            <InsightCard icon="📅" title="Your personalised weekly plan" accent="#a78bfa">
              <WeeklyPlan plan={weekPlan} />
            </InsightCard>
          ) : null}
        </div>
      )}
    </div>
  );
}