import { useState } from 'react';
import { searchJobs, parseResume } from '../services/api';
import '../styles/JobSearch.css';

const PLATFORMS = [
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
  { id: 'naukri', name: 'Naukri', icon: '🇮🇳' },
  { id: 'indeed', name: 'Indeed', icon: '🔍' },
  { id: 'internshala', name: 'Internshala', icon: '🎓' },
  { id: 'foundit', name: 'Foundit', icon: '🔎' },
];

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];
const EXPERIENCE_LEVELS = ['Entry Level', '1-3 years', '3-5 years', '5-10 years', '10+ years'];

function JobCard({ job, onSave }) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(job);
    setSaving(false);
  }

  return (
    <div className="search-job-card fade-up">
      <div className="search-job-card__header">
        <div>
          <h3 className="search-job-card__title">{job.title}</h3>
          <div className="search-job-card__company">
            {job.company} {job.company && job.platform && '·'} <span className="platform-badge">{job.platform}</span>
          </div>
        </div>
        <button 
          className={`search-job-card__save-btn ${saving ? 'saving' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '💾...' : '➕ Save'}
        </button>
      </div>

      <div className="search-job-card__details">
        {job.location && <span className="detail-badge">📍 {job.location}</span>}
        {job.salary && <span className="detail-badge">💰 {job.salary}</span>}
        {job.analysis && (
          <span 
            className="detail-badge verdict-badge"
            style={{ 
              color: job.analysis.verdict === 'FAKE' ? '#f87171' : 
                     job.analysis.verdict === 'SUSPICIOUS' ? '#fbbf24' : '#34d399'
            }}
          >
            {job.analysis.verdict === 'FAKE' && '🚨'}
            {job.analysis.verdict === 'SUSPICIOUS' && '⚠️'}
            {job.analysis.verdict === 'REAL' && '✓'}
            {job.analysis.verdict} · {job.analysis.riskScore}/100
          </span>
        )}
      </div>

      <div className="search-job-card__footer">
        <a 
          href={job.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="search-job-card__link"
        >
          View Job →
        </a>
      </div>
    </div>
  );
}

export default function JobSearch() {
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState('');
  const [experience, setExperience] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(['linkedin', 'naukri', 'indeed']);
  
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  
  const [resumeText, setResumeText] = useState('');
  const [parsingResume, setParsingResume] = useState(false);

  // Handle platform toggle
  function togglePlatform(platformId) {
    if (selectedPlatforms.includes(platformId)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== platformId));
    } else {
      setSelectedPlatforms([...selectedPlatforms, platformId]);
    }
  }

  // Parse resume and extract keywords
  async function handleParseResume() {
    if (!resumeText.trim()) {
      setError('Please paste your resume text');
      return;
    }

    setParsingResume(true);
    setError('');

    try {
      const result = await parseResume(resumeText);
      setKeywords(result.suggested.keywords);
      alert(`✓ Found ${result.keywords.length} relevant keywords from your resume!`);
    } catch (err) {
      setError('Failed to parse resume: ' + err.message);
    } finally {
      setParsingResume(false);
    }
  }

  // Search for jobs
  async function handleSearch(e) {
    e?.preventDefault();

    if (!keywords.trim()) {
      setError('Please enter job keywords or upload your resume');
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError('Please select at least one platform');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const data = await searchJobs({
        keywords,
        location,
        jobType,
        experience,
        platforms: selectedPlatforms,
        autoSave: false,
        analyzeScams: false, // Set to true to analyze, but uses API quota
      });

      setResults(data.jobs);
      
      if (data.jobs.length === 0) {
        setError('No jobs found. Try different keywords or locations.');
      }
    } catch (err) {
      setError('Search failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Save job to tracker
  async function handleSaveJob(job) {
    try {
      // This would call your save job API
      console.log('Saving job:', job);
      alert(`Saved: ${job.title} at ${job.company}`);
    } catch (err) {
      alert('Failed to save job');
    }
  }

  return (
    <div className="job-search">
      <header className="job-search__header fade-up">
        <h1 className="job-search__title">
          <span>🔍</span> Job Search
        </h1>
        <p className="job-search__subtitle">
          Search across LinkedIn, Naukri, Indeed, Internshala & more
        </p>
      </header>

      {/* Resume Parser */}
      <div className="resume-parser fade-up d1">
        <div className="resume-parser__header">
          <h3>📄 Or Upload Your Resume</h3>
          <p>We'll extract relevant keywords automatically</p>
        </div>
        <textarea
          className="resume-parser__textarea"
          placeholder="Paste your resume text here..."
          value={resumeText}
          onChange={e => setResumeText(e.target.value)}
          rows={4}
        />
        <button 
          className="resume-parser__btn"
          onClick={handleParseResume}
          disabled={parsingResume || !resumeText.trim()}
        >
          {parsingResume ? '⏳ Parsing...' : '✨ Extract Keywords from Resume'}
        </button>
      </div>

      {/* Search Form */}
      <form className="search-form fade-up d2" onSubmit={handleSearch}>
        <div className="search-form__grid">
          <div className="form-group">
            <label>Job Keywords *</label>
            <input
              type="text"
              placeholder="e.g. Software Engineer, Data Analyst"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              placeholder="e.g. Bangalore, Remote, Mumbai"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Job Type</label>
            <select
              value={jobType}
              onChange={e => setJobType(e.target.value)}
              className="form-select"
            >
              <option value="">All Types</option>
              {JOB_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Experience Level</label>
            <select
              value={experience}
              onChange={e => setExperience(e.target.value)}
              className="form-select"
            >
              <option value="">All Levels</option>
              {EXPERIENCE_LEVELS.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Platform Selection */}
        <div className="form-group">
          <label>Search Platforms</label>
          <div className="platform-select">
            {PLATFORMS.map(platform => (
              <button
                key={platform.id}
                type="button"
                className={`platform-btn ${selectedPlatforms.includes(platform.id) ? 'platform-btn--active' : ''}`}
                onClick={() => togglePlatform(platform.id)}
              >
                <span>{platform.icon}</span>
                <span>{platform.name}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="search-error">
            ⚠️ {error}
          </div>
        )}

        <button 
          type="submit"
          className="search-btn"
          disabled={loading || !keywords.trim() || selectedPlatforms.length === 0}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Searching {selectedPlatforms.length} platforms...
            </>
          ) : (
            <>
              <span>🔍</span>
              Search Jobs
            </>
          )}
        </button>
      </form>

      {/* Results */}
      {loading && (
        <div className="search-loading fade-in">
          <div className="search-loading__spinner" />
          <p>Searching across {selectedPlatforms.length} platforms...</p>
          <p className="search-loading__sub">This may take 10-15 seconds</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results fade-up d3">
          <div className="search-results__header">
            <h2>Found {results.length} Jobs</h2>
            <div className="search-results__breakdown">
              {Object.entries(
                results.reduce((acc, job) => {
                  acc[job.platform] = (acc[job.platform] || 0) + 1;
                  return acc;
                }, {})
              ).map(([platform, count]) => (
                <span key={platform} className="breakdown-badge">
                  {platform}: {count}
                </span>
              ))}
            </div>
          </div>

          <div className="search-results__grid">
            {results.map((job, i) => (
              <JobCard key={i} job={job} onSave={handleSaveJob} />
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="search-empty fade-up d3">
          <div className="search-empty__icon">🔍</div>
          <h3>Ready to Search</h3>
          <p>Enter job keywords and select platforms to start searching</p>
          <div className="search-tips">
            <h4>💡 Pro Tips:</h4>
            <ul>
              <li>Use specific job titles (e.g., "React Developer" vs just "Developer")</li>
              <li>Include location for better results</li>
              <li>Upload resume to auto-extract relevant keywords</li>
              <li>Select multiple platforms for comprehensive results</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}