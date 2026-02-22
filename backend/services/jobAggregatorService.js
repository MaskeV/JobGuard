const axios = require('axios');

// ══════════════════════════════════════════════════════════════════════════════
// Multi-API Job Aggregator Service
// ══════════════════════════════════════════════════════════════════════════════
// Uses 3 different RapidAPI services for maximum coverage and reliability:
// 1. JSearch (Primary) - 150 free/month - Aggregates 20+ sites
// 2. LinkedIn API (Backup) - 100 free/month - LinkedIn specific  
// 3. Indeed12 (Emergency) - 25 free/month - Indeed specific
//
// Total: 275 free searches per month!
//
// Setup: https://rapidapi.com → Sign up → Subscribe to each API → Copy your key

const RAPIDAPI_KEY = "f1970f75c1mshc67d8385255fb93p10132ejsnd47fbc9cbf19"|| '';

// ── API 1: JSearch (Primary - Best Coverage) ─────────────────────────────────
async function searchViaJSearch({ keywords, location, limit = 20 }) {
  try {
    console.log('  → Calling JSearch API...');
    
    const { data } = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: {
        query: `${keywords} ${location || ''}`.trim(),
        num_pages: '1',
        page: '1',
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      },
      timeout: 15000,
    });

    if (!data.data || data.data.length === 0) {
      console.log('  ⚠️  JSearch returned no results');
      return [];
    }

    const jobs = data.data.slice(0, limit).map(job => ({
      title: job.job_title || 'Untitled',
      company: job.employer_name || 'Unknown Company',
      location: [job.job_city, job.job_state, job.job_country]
        .filter(Boolean).join(', ') || 'Remote',
      url: job.job_apply_link || job.job_google_link || '#',
      platform: detectPlatform(job.job_apply_link),
      salary: job.job_min_salary && job.job_max_salary
        ? `$${job.job_min_salary.toLocaleString()}-$${job.job_max_salary.toLocaleString()}`
        : job.job_salary || '',
      description: (job.job_description || '').substring(0, 500),
      apiSource: 'JSearch',
    }));

    console.log(`  ✅ JSearch: Found ${jobs.length} jobs`);
    return jobs;

  } catch (err) {
    if (err.response?.status === 401) {
      console.error('  ❌ JSearch: Invalid API key');
    } else if (err.response?.status === 429) {
      console.error('  ❌ JSearch: Rate limit exceeded (used all 150 free searches this month)');
    } else {
      console.error('  ❌ JSearch error:', err.message);
    }
    return [];
  }
}

// ── API 2: LinkedIn Job Search (Backup) ───────────────────────────────────────
async function searchViaLinkedIn({ keywords, location, limit = 20 }) {
  try {
    console.log('  → Calling LinkedIn API...');
    
    const { data } = await axios.get('https://linkedin-job-search-api.p.rapidapi.com/search', {
      params: {
        title: keywords,
        location: location || '',
        results: limit.toString(),
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'linkedin-job-search-api.p.rapidapi.com'
      },
      timeout: 15000,
    });

    if (!data.data || data.data.length === 0) {
      console.log('  ⚠️  LinkedIn API returned no results');
      return [];
    }

    const jobs = data.data.map(job => ({
      title: job.title || 'Untitled',
      company: job.company || 'Unknown Company',
      location: job.location || 'Remote',
      url: job.url || '#',
      platform: 'LinkedIn',
      salary: job.salary || '',
      description: (job.description || '').substring(0, 500),
      apiSource: 'LinkedIn API',
    }));

    console.log(`  ✅ LinkedIn: Found ${jobs.length} jobs`);
    return jobs;

  } catch (err) {
    if (err.response?.status === 401) {
      console.error('  ❌ LinkedIn: Invalid API key or not subscribed');
    } else if (err.response?.status === 429) {
      console.error('  ❌ LinkedIn: Rate limit exceeded (used all 100 free searches this month)');
    } else {
      console.error('  ❌ LinkedIn error:', err.message);
    }
    return [];
  }
}

// ── API 3: Indeed12 (Emergency Backup) ────────────────────────────────────────
async function searchViaIndeed({ keywords, location, limit = 15 }) {
  try {
    console.log('  → Calling Indeed12 API...');
    
    // Determine locality (country code)
    let locality = 'us';
    if (location?.toLowerCase().includes('india')) locality = 'in';
    else if (location?.toLowerCase().includes('uk')) locality = 'uk';
    else if (location?.toLowerCase().includes('canada')) locality = 'ca';
    
    const { data } = await axios.get('https://indeed12.p.rapidapi.com/jobs/search', {
      params: {
        query: keywords,
        location: location || 'United States',
        page_id: '1',
        locality: locality,
        fromage: '7', // Last 7 days
        radius: '50', // 50 miles
        sort: 'date',
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'indeed12.p.rapidapi.com'
      },
      timeout: 15000,
    });

    if (!data.hits || data.hits.length === 0) {
      console.log('  ⚠️  Indeed12 returned no results');
      return [];
    }

    const jobs = data.hits.slice(0, limit).map(job => ({
      title: job.title || 'Untitled',
      company: job.company_name || 'Unknown Company',
      location: job.location?.city || job.location?.state || 'Remote',
      url: job.link || '#',
      platform: 'Indeed',
      salary: job.salary_text || '',
      description: (job.description || job.snippet || '').substring(0, 500),
      apiSource: 'Indeed12',
    }));

    console.log(`  ✅ Indeed12: Found ${jobs.length} jobs`);
    return jobs;

  } catch (err) {
    if (err.response?.status === 401) {
      console.error('  ❌ Indeed12: Invalid API key or not subscribed');
    } else if (err.response?.status === 429) {
      console.error('  ❌ Indeed12: Rate limit exceeded (used all 25 free searches this month)');
    } else {
      console.error('  ❌ Indeed12 error:', err.message);
    }
    return [];
  }
}

// ── Main Aggregator Function (Multi-API with Fallback) ───────────────────────
async function aggregateJobs({ keywords, location, jobType, experience, platforms = [] }) {
  console.log('\n🚀 Starting multi-API job aggregation...');
  console.log('📝 Search params:', { keywords, location });

  // Validate API key
  if (!RAPIDAPI_KEY) {
    console.error('\n❌ RAPIDAPI_KEY not configured!');
    console.log('\n📖 Quick Setup:');
    console.log('   1. Go to https://rapidapi.com and sign up (free)');
    console.log('   2. Subscribe to these APIs (all have free tiers):');
    console.log('      - JSearch: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch');
    console.log('      - LinkedIn: https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/linkedin-job-search-api');
    console.log('      - Indeed12: https://rapidapi.com/letscrape-6bRBa3QguO5/api/indeed12');
    console.log('   3. Copy your RapidAPI key (one key works for all!)');
    console.log('   4. Add to .env: RAPIDAPI_KEY=your_key_here');
    console.log('   5. Restart server\n');
    throw new Error('RAPIDAPI_KEY not configured. See instructions above.');
  }

  let allJobs = [];

  // Strategy: Try APIs in order until we get enough results
  // This maximizes free tier usage and ensures we get results

  // Try JSearch first (best coverage, 150 free/month)
  console.log('\n1️⃣ Trying JSearch API (Primary)...');
  const jSearchJobs = await searchViaJSearch({ keywords, location, limit: 20 });
  allJobs = allJobs.concat(jSearchJobs);

  // If we got good results from JSearch, we're done
  if (allJobs.length >= 15) {
    console.log(`\n🎉 Got enough results from JSearch (${allJobs.length} jobs)`);
  } else {
    // Try LinkedIn next (100 free/month)
    console.log(`\n2️⃣ Need more results (have ${allJobs.length}), trying LinkedIn API...`);
    const linkedInJobs = await searchViaLinkedIn({ keywords, location, limit: 20 });
    allJobs = allJobs.concat(linkedInJobs);
  }

  // If still not enough, try Indeed (25 free/month - save for emergencies)
  if (allJobs.length < 10) {
    console.log(`\n3️⃣ Still need more (have ${allJobs.length}), trying Indeed12 API...`);
    const indeedJobs = await searchViaIndeed({ keywords, location, limit: 15 });
    allJobs = allJobs.concat(indeedJobs);
  }

  // Deduplicate based on URL
  const uniqueJobs = [];
  const seenUrls = new Set();
  
  for (const job of allJobs) {
    if (job.url && !seenUrls.has(job.url)) {
      seenUrls.add(job.url);
      uniqueJobs.push(job);
    }
  }

  console.log(`\n✅ Total unique jobs found: ${uniqueJobs.length}`);
  
  // Show breakdown by source
  const breakdown = {};
  uniqueJobs.forEach(job => {
    breakdown[job.apiSource] = (breakdown[job.apiSource] || 0) + 1;
  });
  console.log('📊 Breakdown by API source:', breakdown);

  // Show breakdown by platform
  const platformBreakdown = {};
  uniqueJobs.forEach(job => {
    platformBreakdown[job.platform] = (platformBreakdown[job.platform] || 0) + 1;
  });
  console.log('📊 Breakdown by platform:', platformBreakdown);

  if (uniqueJobs.length === 0) {
    console.error('\n❌ No jobs found!');
    console.log('\n💡 Troubleshooting tips:');
    console.log('   • Try simpler keywords (e.g., "developer" instead of "senior full-stack developer")');
    console.log('   • Try broader locations (e.g., "United States" instead of "Small Town, TX")');
    console.log('   • Check if you\'ve exceeded API rate limits (check RapidAPI dashboard)');
    console.log('   • Verify APIs are subscribed on RapidAPI');
    throw new Error('No jobs found. Try different search terms or check API subscriptions.');
  }

  return uniqueJobs;
}

// ── Helper Functions ──────────────────────────────────────────────────────────

function detectPlatform(url = '') {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('linkedin.com')) return 'LinkedIn';
  if (lowerUrl.includes('indeed.com')) return 'Indeed';
  if (lowerUrl.includes('glassdoor.com')) return 'Glassdoor';
  if (lowerUrl.includes('ziprecruiter.com')) return 'ZipRecruiter';
  if (lowerUrl.includes('naukri.com')) return 'Naukri';
  if (lowerUrl.includes('monster.com')) return 'Monster';
  if (lowerUrl.includes('dice.com')) return 'Dice';
  if (lowerUrl.includes('careerbuilder.com')) return 'CareerBuilder';
  if (lowerUrl.includes('simplyhired.com')) return 'SimplyHired';
  if (lowerUrl.includes('wellfound.com')) return 'Wellfound';
  if (lowerUrl.includes('greenhouse.io')) return 'Greenhouse';
  if (lowerUrl.includes('lever.co')) return 'Lever';
  
  return 'Other';
}

function parseResumeKeywords(resumeText) {
  const keywords = [];
  
  const techSkills = [
    'javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go',
    'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring',
    'sql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'terraform',
    'machine learning', 'data science', 'ai', 'tensorflow', 'pytorch',
    'full stack', 'backend', 'frontend', 'devops', 'mobile', 'ios', 'android',
  ];
  
  const lowerText = resumeText.toLowerCase();
  
  techSkills.forEach(skill => {
    if (lowerText.includes(skill)) {
      keywords.push(skill);
    }
  });
  
  // Also extract job titles
  const titlePatterns = [
    /(?:software|senior|junior|lead|principal)\s+(?:engineer|developer|architect)/gi,
    /(?:data|business|system)\s+(?:analyst|scientist)/gi,
    /(?:product|project|program)\s+manager/gi,
    /(?:frontend|backend|full[\s-]?stack)\s+developer/gi,
  ];
  
  titlePatterns.forEach(pattern => {
    const matches = resumeText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalized = match.trim().toLowerCase();
        if (!keywords.includes(normalized)) {
          keywords.push(normalized);
        }
      });
    }
  });
  
  return [...new Set(keywords)].slice(0, 7);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  aggregateJobs,
  parseResumeKeywords,
  // Individual API functions (for testing)
  searchViaJSearch,
  searchViaLinkedIn,
  searchViaIndeed,
};