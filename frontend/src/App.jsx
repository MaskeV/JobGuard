import { useState, useEffect } from 'react';
import AnalyzerPage from './pages/Analyzer.jsx';
import Dashboard from './pages/Dashboard.jsx';
import JobSearch from './pages/JobSearch.jsx';
import AIInsights from './pages/AiInsights.jsx';
import ResumeMatcher from './pages/ResumematchMaker.jsx';
import './App.css';

export default function App() {
  const [page, setPage] = useState('analyzer');
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log(' App component mounted');
    console.log(' Current page:', page);
  }, [page]);

  if (error) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center', 
        color: '#e8edf8',
        fontFamily: 'monospace',
        minHeight: '100vh',
        background: '#060910'
      }}>
        <h1 style={{ marginBottom: '20px' }}> Error Loading App</h1>
        <pre style={{ 
          background: 'rgba(248,113,113,0.1)', 
          padding: '20px', 
          borderRadius: '8px',
          marginTop: '20px',
          textAlign: 'left',
          maxWidth: '600px',
          margin: '20px auto',
          overflow: 'auto'
        }}>
          {error.toString()}
        </pre>
      </div>
    );
  }

  try {
    return (
      <div className="app">
        {/* Navigation Bar */}
        <nav className="app-nav">
          <div className="app-nav__brand">
            <span className="app-nav__logo">🛡️</span>
            <span className="app-nav__title">JobGuard</span>
          </div>
          
          <div className="app-nav__tabs">
            <button 
              className={`app-nav__tab ${page === 'analyzer' ? 'app-nav__tab--active' : ''}`}
              onClick={() => setPage('analyzer')}
            >
              <span></span>
              <span>Analyzer</span>
            </button>
            
            <button 
              className={`app-nav__tab ${page === 'dashboard' ? 'app-nav__tab--active' : ''}`}
              onClick={() => setPage('dashboard')}
            >
              <span></span>
              <span>Dashboard</span>
            </button>

            <button 
              className={`app-nav__tab ${page === 'search' ? 'app-nav__tab--active' : ''}`}
              onClick={() => setPage('search')}
            >
              <span></span>
              <span>Job Search</span>
            </button>

            <button 
              className={`app-nav__tab ${page === 'insights' ? 'app-nav__tab--active' : ''}`}
              onClick={() => setPage('insights')}
            >
              <span></span>
              <span>AI Insights</span>
            </button>

            <button 
              className={`app-nav__tab ${page === 'matcher' ? 'app-nav__tab--active' : ''}`}
              onClick={() => setPage('matcher')}
            >
              <span></span>
              <span>Resume Match</span>
            </button>
          </div>
        </nav>

        {/* Page Content */}
        <div className="app-content">
          {page === 'analyzer' && <AnalyzerPage />}
          {page === 'dashboard' && <Dashboard />}
          {page === 'search' && <JobSearch />}
          {page === 'insights' && <AIInsights />}
          {page === 'matcher' && <ResumeMatcher />}
        </div>
      </div>
    );
  } catch (err) {
    console.error(' App render error:', err);
    setError(err);
    return null;
  }
}