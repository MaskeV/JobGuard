const axios = require('axios');
const cheerio = require('cheerio');

// ── Job Aggregator Service ────────────────────────────────────────────────────
// Fetches jobs from multiple platforms based on user filters

// ── Platform Scrapers ──────────────────────────────────────────────────────────

// LinkedIn Jobs Scraper (public jobs, no login required)
async function scrapeLinkedIn({ keywords, location, jobType, experience }) {
  try {
    const searchParams = new URLSearchParams({
      keywords: keywords || '',
      location: location || '',
      f_JT: jobType === 'Full-time' ? 'F' : jobType === 'Part-time' ? 'P' : '',
    });
    
    const url = `https://www.linkedin.com/jobs/search?${searchParams}`;
    console.log('🔍 Searching LinkedIn:', url);
    
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    
    const $ = cheerio.load(data);
    const jobs = [];
    
    $('.job-search-card').each((i, el) => {
      if (jobs.length >= 10) return false; // Limit to 10 per platform
      
      const $el = $(el);
      const title = $el.find('.job-search-card__title').text().trim();
      const company = $el.find('.job-search-card__company-name').text().trim();
      const location = $el.find('.job-search-card__location').text().trim();
      const link = $el.find('a.job-search-card__link-wrapper').attr('href');
      
      if (title && link) {
        jobs.push({
          title,
          company,
          location,
          url: link.split('?')[0], // Clean URL
          platform: 'LinkedIn',
          salary: '',
          description: '',
        });
      }
    });
    
    console.log(`✓ Found ${jobs.length} jobs on LinkedIn`);
    return jobs;
  } catch (err) {
    console.error('LinkedIn scraping error:', err.message);
    return [];
  }
}

// Naukri Jobs Scraper
async function scrapeNaukri({ keywords, location, experience }) {
  try {
    const searchUrl = `https://www.naukri.com/${encodeURIComponent(keywords)}-jobs${location ? `-in-${encodeURIComponent(location)}` : ''}`;
    console.log('🔍 Searching Naukri:', searchUrl);
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    
    const $ = cheerio.load(data);
    const jobs = [];
    
    $('.jobTuple').each((i, el) => {
      if (jobs.length >= 10) return false;
      
      const $el = $(el);
      const title = $el.find('.title').text().trim();
      const company = $el.find('.companyInfo').text().trim();
      const location = $el.find('.location').text().trim();
      const salary = $el.find('.salary').text().trim();
      const experience = $el.find('.experience').text().trim();
      const link = $el.find('.title a').attr('href');
      
      if (title && link) {
        jobs.push({
          title,
          company,
          location,
          url: link.startsWith('http') ? link : `https://www.naukri.com${link}`,
          platform: 'Naukri',
          salary,
          description: experience,
        });
      }
    });
    
    console.log(`✓ Found ${jobs.length} jobs on Naukri`);
    return jobs;
  } catch (err) {
    console.error('Naukri scraping error:', err.message);
    return [];
  }
}

// Indeed Jobs Scraper
async function scrapeIndeed({ keywords, location }) {
  try {
    const searchParams = new URLSearchParams({
      q: keywords || '',
      l: location || '',
    });
    
    const url = `https://in.indeed.com/jobs?${searchParams}`;
    console.log('🔍 Searching Indeed:', url);
    
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    
    const $ = cheerio.load(data);
    const jobs = [];
    
    $('.job_seen_beacon, .jobsearch-SerpJobCard').each((i, el) => {
      if (jobs.length >= 10) return false;
      
      const $el = $(el);
      const title = $el.find('h2.jobTitle span').text().trim() || $el.find('.jobTitle').text().trim();
      const company = $el.find('.companyName').text().trim();
      const location = $el.find('.companyLocation').text().trim();
      const salary = $el.find('.salary-snippet').text().trim();
      const jobKey = $el.attr('data-jk') || $el.find('[data-jk]').attr('data-jk');
      
      if (title && jobKey) {
        jobs.push({
          title,
          company,
          location,
          url: `https://in.indeed.com/viewjob?jk=${jobKey}`,
          platform: 'Indeed',
          salary,
          description: '',
        });
      }
    });
    
    console.log(`✓ Found ${jobs.length} jobs on Indeed`);
    return jobs;
  } catch (err) {
    console.error('Indeed scraping error:', err.message);
    return [];
  }
}

// Internshala Scraper
async function scrapeInternshala({ keywords, location }) {
  try {
    const searchUrl = `https://internshala.com/jobs/${encodeURIComponent(keywords)}-jobs${location ? `-in-${encodeURIComponent(location)}` : ''}`;
    console.log('🔍 Searching Internshala:', searchUrl);
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    
    const $ = cheerio.load(data);
    const jobs = [];
    
    $('.individual_internship, .job-container').each((i, el) => {
      if (jobs.length >= 10) return false;
      
      const $el = $(el);
      const title = $el.find('.job-internship-name').text().trim() || $el.find('.profile').text().trim();
      const company = $el.find('.company-name').text().trim();
      const location = $el.find('.location-link').text().trim();
      const salary = $el.find('.stipend').text().trim();
      const link = $el.find('a.view-detail-button').attr('href') || $el.find('.job-internship-name').parent().attr('href');
      
      if (title && link) {
        jobs.push({
          title,
          company,
          location,
          url: link.startsWith('http') ? link : `https://internshala.com${link}`,
          platform: 'Internshala',
          salary,
          description: '',
        });
      }
    });
    
    console.log(`✓ Found ${jobs.length} jobs on Internshala`);
    return jobs;
  } catch (err) {
    console.error('Internshala scraping error:', err.message);
    return [];
  }
}

// Foundit (Monster India) Scraper
async function scrapeFoundit({ keywords, location }) {
  try {
    const searchUrl = `https://www.foundit.in/srp/results?query=${encodeURIComponent(keywords)}&locations=${encodeURIComponent(location || '')}`;
    console.log('🔍 Searching Foundit:', searchUrl);
    
    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    
    const $ = cheerio.load(data);
    const jobs = [];
    
    $('.jobTuple, .srpResultCardContainer').each((i, el) => {
      if (jobs.length >= 10) return false;
      
      const $el = $(el);
      const title = $el.find('.jobTitle').text().trim();
      const company = $el.find('.companyName').text().trim();
      const location = $el.find('.locWdth').text().trim();
      const salary = $el.find('.salary').text().trim();
      const link = $el.find('.jobTitle a').attr('href');
      
      if (title && link) {
        jobs.push({
          title,
          company,
          location,
          url: link.startsWith('http') ? link : `https://www.foundit.in${link}`,
          platform: 'Foundit',
          salary,
          description: '',
        });
      }
    });
    
    console.log(`✓ Found ${jobs.length} jobs on Foundit`);
    return jobs;
  } catch (err) {
    console.error('Foundit scraping error:', err.message);
    return [];
  }
}

// ── Main Aggregator Function ───────────────────────────────────────────────────
async function aggregateJobs({ keywords, location, jobType, experience, platforms = [] }) {
  console.log('\n🚀 Starting job aggregation...');
  console.log('Filters:', { keywords, location, jobType, experience, platforms });
  
  // Default to all platforms if none specified
  if (!platforms || platforms.length === 0) {
    platforms = ['linkedin', 'naukri', 'indeed', 'internshala', 'foundit'];
  }
  
  const scrapers = {
    linkedin: scrapeLinkedIn,
    naukri: scrapeNaukri,
    indeed: scrapeIndeed,
    internshala: scrapeInternshala,
    foundit: scrapeFoundit,
  };
  
  // Run scrapers in parallel for enabled platforms
  const promises = platforms
    .filter(p => scrapers[p])
    .map(platform => 
      scrapers[platform]({ keywords, location, jobType, experience })
        .catch(err => {
          console.error(`Error scraping ${platform}:`, err.message);
          return [];
        })
    );
  
  const results = await Promise.all(promises);
  const allJobs = results.flat();
  
  // Deduplicate based on URL
  const uniqueJobs = [];
  const seenUrls = new Set();
  
  for (const job of allJobs) {
    if (!seenUrls.has(job.url)) {
      seenUrls.add(job.url);
      uniqueJobs.push(job);
    }
  }
  
  console.log(`\n✅ Total unique jobs found: ${uniqueJobs.length}`);
  console.log('Breakdown by platform:');
  const breakdown = {};
  uniqueJobs.forEach(job => {
    breakdown[job.platform] = (breakdown[job.platform] || 0) + 1;
  });
  console.log(breakdown);
  
  return uniqueJobs;
}

// ── Resume Parser (Basic) ──────────────────────────────────────────────────────
function parseResumeKeywords(resumeText) {
  // Extract skills, job titles, technologies from resume
  const keywords = [];
  
  // Common tech skills
  const techSkills = [
    'javascript', 'python', 'java', 'react', 'node', 'sql', 'mongodb',
    'aws', 'docker', 'kubernetes', 'typescript', 'angular', 'vue',
    'machine learning', 'data science', 'ai', 'backend', 'frontend',
    'full stack', 'devops', 'cloud', 'api', 'rest', 'graphql',
  ];
  
  const lowerText = resumeText.toLowerCase();
  
  techSkills.forEach(skill => {
    if (lowerText.includes(skill)) {
      keywords.push(skill);
    }
  });
  
  // Extract job titles (look for common patterns)
  const titlePatterns = [
    /(?:software|senior|junior|lead|principal)\s+(?:engineer|developer|architect)/gi,
    /(?:data|business|system)\s+analyst/gi,
    /(?:product|project|program)\s+manager/gi,
    /(?:frontend|backend|full[\s-]?stack)\s+developer/gi,
  ];
  
  titlePatterns.forEach(pattern => {
    const matches = resumeText.match(pattern);
    if (matches) {
      keywords.push(...matches);
    }
  });
  
  // Return top 5 most relevant keywords
  return [...new Set(keywords)].slice(0, 5);
}

module.exports = {
  aggregateJobs,
  parseResumeKeywords,
  scrapeLinkedIn,
  scrapeNaukri,
  scrapeIndeed,
  scrapeInternshala,
  scrapeFoundit,
};