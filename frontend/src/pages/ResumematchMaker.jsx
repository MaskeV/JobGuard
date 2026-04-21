import { useState } from 'react';
import '../styles/ResumematchMaker.css';

const API_BASE = import.meta.env.VITE_APP_API_URL || 'http://localhost:5000/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function callGeminiViaBackend(prompt) {
  // We route through the backend's /api/analyze proxy to keep the API key safe
  // The backend has Gemini configured, so we'll use a dedicated endpoint
  const res = await fetch(`${API_BASE}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('Backend match endpoint not available');
  return res.json();
}

// Fallback: use Anthropic API via the artifact system (client-side)
async function analyzeMatch({ resume, jobDescription, jobTitle, company }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are an expert career coach and ATS specialist. Analyze resume-job fit and respond ONLY with a valid JSON object, no markdown.`,
      messages: [{
        role: 'user',
        content: `Analyze this resume vs job description match.

JOB TITLE: ${jobTitle || 'Not specified'}
COMPANY: ${company || 'Not specified'}

JOB DESCRIPTION:
${jobDescription.slice(0, 2000)}

RESUME:
${resume.slice(0, 2000)}

Respond with ONLY this JSON (no markdown, no backticks):
{
  "matchScore": <integer 0-100>,
  "matchLevel": "Excellent" | "Good" | "Fair" | "Poor",
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<missing skill/exp 1>", "<gap 2>"],
  "keywords": {
    "matched": ["<keyword found in both>"],
    "missing": ["<keyword in JD not in resume>"]
  },
  "atsScore": <integer 0-100>,
  "suggestions": ["<specific improvement 1>", "<improvement 2>", "<improvement 3>"]
}`
      }]
    })
  });
  if (!res.ok) throw new Error('Analysis failed');
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function generateCoverLetter({ resume, jobDescription, jobTitle, company }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are an expert cover letter writer. Write compelling, personalized cover letters. Be professional but not robotic. Avoid clichés. Be specific to the role and company.`,
      messages: [{
        role: 'user',
        content: `Write a compelling cover letter for this job application.

JOB TITLE: ${jobTitle || 'the role'}
COMPANY: ${company || 'the company'}

JOB DESCRIPTION (key parts):
${jobDescription.slice(0, 1500)}

RESUME HIGHLIGHTS:
${resume.slice(0, 1500)}

Write a 3-paragraph cover letter. First para: opening hook + why this role/company. Second para: 2-3 specific examples from resume matching the JD. Third para: closing with call to action. Keep it under 350 words. Do NOT use "I am writing to express my interest" or other clichés.`
      }]
    })
  });
  if (!res.ok) throw new Error('Cover letter generation failed');
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── Match Score Ring ──────────────────────────────────────────────────────────
function ScoreRing({ score, level }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : score >= 30 ? '#f97316' : '#f87171';
  return (
    <div className="score-ring">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div className="score-ring__inner">
        <div className="score-ring__val" style={{ color }}>{score}%</div>
        <div className="score-ring__level" style={{ color }}>{level}</div>
      </div>
    </div>
  );
}

// ── Keyword Chips ─────────────────────────────────────────────────────────────
function KeywordChips({ keywords, type }) {
  if (!keywords?.length) return <div className="kw-empty">None detected</div>;
  return (
    <div className="kw-chips">
      {keywords.map((kw, i) => (
        <span key={i} className={`kw-chip kw-chip--${type}`}>{kw}</span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ResumeMatcher() {
  const [resume, setResume] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');

  const [loading, setLoading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('match'); // 'match' | 'cover'

  async function handleAnalyze() {
    if (!resume.trim() || !jobDesc.trim()) {
      setError('Please paste both your resume and the job description');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setCoverLetter('');
    try {
      const data = await analyzeMatch({ resume, jobDescription: jobDesc, jobTitle, company });
      setResult(data);
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateCoverLetter() {
    setCoverLoading(true);
    setError('');
    try {
      const letter = await generateCoverLetter({ resume, jobDescription: jobDesc, jobTitle, company });
      setCoverLetter(letter);
      setActiveTab('cover');
    } catch (err) {
      setError(`Cover letter generation failed: ${err.message}`);
    } finally {
      setCoverLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="matcher">
      {/* Header */}
      <header className="matcher__header fade-up">
        <div className="matcher__logo">
          <span>🎯</span>
          <div>
            <div className="matcher__title">Resume Matcher</div>
            <div className="matcher__sub">AI-powered resume vs job description fit analysis</div>
          </div>
        </div>
      </header>

      {/* Input grid */}
      <div className="matcher__inputs fade-up d1">
        <div className="matcher__input-col">
          <div className="input-header">
            <label className="input-label">📄 Your Resume</label>
            <span className="input-count">{resume.length > 0 ? `${resume.length} chars` : ''}</span>
          </div>
          <textarea
            className="matcher__textarea"
            placeholder="Paste your full resume text here — work experience, skills, education, everything..."
            value={resume}
            onChange={e => setResume(e.target.value)}
            rows={14}
          />
        </div>

        <div className="matcher__input-col">
          <div className="input-header">
            <label className="input-label">💼 Job Description</label>
            <span className="input-count">{jobDesc.length > 0 ? `${jobDesc.length} chars` : ''}</span>
          </div>
          <div className="matcher__job-meta">
            <input
              className="meta-input"
              placeholder="Job title (e.g. Senior Engineer)"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
            />
            <input
              className="meta-input"
              placeholder="Company name"
              value={company}
              onChange={e => setCompany(e.target.value)}
            />
          </div>
          <textarea
            className="matcher__textarea matcher__textarea--jd"
            placeholder="Paste the full job description here..."
            value={jobDesc}
            onChange={e => setJobDesc(e.target.value)}
            rows={11}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="matcher__error fade-up">⚠️ {error}</div>
      )}

      {/* Analyze button */}
      <button
        className={`matcher__btn ${loading ? 'matcher__btn--loading' : ''}`}
        onClick={handleAnalyze}
        disabled={loading || !resume.trim() || !jobDesc.trim()}
      >
        {loading ? (
          <><span className="btn-spinner" />Analyzing match with AI…</>
        ) : (
          <><span>🎯</span>Analyze Match</>
        )}
      </button>

      {/* Results */}
      {result && (
        <div className="matcher__results fade-up d2">

          {/* Tabs */}
          <div className="result-tabs">
            <button className={`result-tab ${activeTab === 'match' ? 'result-tab--active' : ''}`} onClick={() => setActiveTab('match')}>
              📊 Match Analysis
            </button>
            <button className={`result-tab ${activeTab === 'cover' ? 'result-tab--active' : ''}`} onClick={() => setActiveTab('cover')}>
              ✍️ Cover Letter
              {!coverLetter && <span className="result-tab__new">Generate</span>}
            </button>
          </div>

          {/* Match Analysis tab */}
          {activeTab === 'match' && (
            <div className="match-panel fade-up">
              {/* Score hero */}
              <div className="match-hero">
                <ScoreRing score={result.matchScore} level={result.matchLevel} />
                <div className="match-hero__right">
                  <div className="match-hero__summary">{result.summary}</div>
                  <div className="match-scores">
                    <div className="mini-score">
                      <div className="mini-score__label">Match score</div>
                      <div className="mini-score__val" style={{ color: result.matchScore >= 70 ? '#34d399' : result.matchScore >= 50 ? '#fbbf24' : '#f87171' }}>
                        {result.matchScore}%
                      </div>
                    </div>
                    <div className="mini-score">
                      <div className="mini-score__label">ATS score</div>
                      <div className="mini-score__val" style={{ color: result.atsScore >= 70 ? '#34d399' : result.atsScore >= 50 ? '#fbbf24' : '#f87171' }}>
                        {result.atsScore}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strengths & Gaps */}
              <div className="match-grid">
                <div className="match-section match-section--green">
                  <div className="match-section__title">✅ Your strengths</div>
                  <ul className="match-list">
                    {result.strengths?.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div className="match-section match-section--red">
                  <div className="match-section__title">⚠️ Gaps to address</div>
                  <ul className="match-list">
                    {result.gaps?.length ? result.gaps.map((g, i) => <li key={i}>{g}</li>) : <li>No significant gaps found</li>}
                  </ul>
                </div>
              </div>

              {/* Keywords */}
              <div className="match-grid">
                <div className="kw-card">
                  <div className="kw-card__title">✓ Keywords matched</div>
                  <KeywordChips keywords={result.keywords?.matched} type="matched" />
                </div>
                <div className="kw-card">
                  <div className="kw-card__title">✗ Keywords missing</div>
                  <KeywordChips keywords={result.keywords?.missing} type="missing" />
                </div>
              </div>

              {/* Suggestions */}
              {result.suggestions?.length > 0 && (
                <div className="suggestions">
                  <div className="suggestions__title">💡 How to improve your match</div>
                  <ol className="suggestions__list">
                    {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}

              {/* Generate cover letter CTA */}
              <button
                className="cover-cta"
                onClick={handleGenerateCoverLetter}
                disabled={coverLoading}
              >
                {coverLoading ? (
                  <><span className="btn-spinner btn-spinner--dark" />Writing your cover letter…</>
                ) : (
                  <>✍️ Generate tailored cover letter</>
                )}
              </button>
            </div>
          )}

          {/* Cover Letter tab */}
          {activeTab === 'cover' && (
            <div className="cover-panel fade-up">
              {!coverLetter ? (
                <div className="cover-empty">
                  <div className="cover-empty__icon">✍️</div>
                  <p>Click "Generate tailored cover letter" in the Match Analysis tab</p>
                  <button
                    className="cover-cta"
                    onClick={handleGenerateCoverLetter}
                    disabled={coverLoading}
                  >
                    {coverLoading ? <><span className="btn-spinner btn-spinner--dark" />Writing…</> : '✍️ Generate cover letter'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="cover-actions">
                    <button className="cover-copy-btn" onClick={handleCopy}>
                      {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
                    </button>
                    <button
                      className="cover-regen-btn"
                      onClick={handleGenerateCoverLetter}
                      disabled={coverLoading}
                    >
                      {coverLoading ? 'Rewriting…' : '🔄 Regenerate'}
                    </button>
                  </div>
                  <div className="cover-letter">
                    <textarea
                      className="cover-textarea"
                      value={coverLetter}
                      onChange={e => setCoverLetter(e.target.value)}
                      rows={18}
                    />
                  </div>
                  <div className="cover-tip">
                    💡 Tip: Edit the letter above to personalize it further before sending.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="matcher__empty fade-up d3">
          <div className="empty-grid">
            {[
              ['🎯', 'Match score 0-100%', 'See exactly how well your resume fits this role'],
              ['🔍', 'ATS optimization', 'Know which keywords are missing from your resume'],
              ['✅', 'Strengths & gaps', 'Understand what you bring and what to address'],
              ['✍️', 'Cover letter AI', 'Get a tailored cover letter written for this exact role'],
            ].map(([icon, title, desc], i) => (
              <div key={i} className="empty-feature">
                <div className="empty-feature__icon">{icon}</div>
                <div className="empty-feature__title">{title}</div>
                <div className="empty-feature__desc">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}