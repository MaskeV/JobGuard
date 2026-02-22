const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios   = require('axios');
const cheerio = require('cheerio');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// ── Scraper ────────────────────────────────────────────────────────────────────
async function scrapeJobPage(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  
  try {
    const { data } = await axios.get(url, { headers, timeout: 10000 });
    const $ = cheerio.load(data);

    // Detect login/auth walls (LinkedIn, Naukri, etc. require login)
    const isLoginPage = 
      $('input[type="password"]').length > 0 ||
      $('form[action*="login"]').length > 0 ||
      $('form[action*="signin"]').length > 0 ||
      data.includes('Sign in to') ||
      data.includes('Log in to') ||
      data.includes('Join to view') ||
      $('title').text().toLowerCase().includes('sign in') ||
      $('title').text().toLowerCase().includes('log in') ||
      $('title').text().toLowerCase().includes('login');

    if (isLoginPage) {
      console.log('⚠️ Login wall detected - will rely on manual data and URL analysis');
      return { 
        title: '', 
        ogTitle: '', 
        ogDesc: '', 
        bodyText: '', 
        error: 'LOGIN_REQUIRED',
        loginWall: true 
      };
    }

    // Remove noise elements
    $('script, style, nav, footer, header, aside, .cookie-banner, [class*="popup"]').remove();

    const title   = $('title').text().trim();
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc  = $('meta[property="og:description"]').attr('content') || '';

    // Try platform-specific selectors first
    const selectors = [
      '.job-description', '.jobsearch-JobComponent-description',
      '[data-testid="job-description"]', '.description__text',
      '.show-more-less-html', '#job-content', '.jobDescriptionText',
    ];
    let bodyText = '';
    for (const sel of selectors) {
      const found = $(sel).text();
      if (found.length > 100) { bodyText = found; break; }
    }
    if (!bodyText) bodyText = $('body').text();

    // Clean whitespace
    bodyText = bodyText.replace(/\s+/g, ' ').trim().slice(0, 4000);

    return { title, ogTitle, ogDesc, bodyText, error: null, loginWall: false };
  } catch (err) {
    return { title: '', ogTitle: '', ogDesc: '', bodyText: '', error: err.message, loginWall: false };
  }
}

// ── Prompt Builder ─────────────────────────────────────────────────────────────
function buildPrompt({ url, scraped, manualData }) {
  // Check if we hit a login wall
  const hitLoginWall = scraped.loginWall || scraped.error === 'LOGIN_REQUIRED';
  
  return `You are an expert in detecting fraudulent job listings. Your analysis must be thorough and accurate.

=== JOB LISTING DATA ===
URL:            ${url}
Platform:       ${detectPlatform(url)}
${hitLoginWall ? '⚠️ NOTE: Could not scrape page (login required). Analysis based on URL and manual data only.' : ''}
Page Title:     ${scraped.title || manualData.title || 'N/A'}
OG Title:       ${scraped.ogTitle || 'N/A'}
OG Description: ${scraped.ogDesc || 'N/A'}
Manual Title:   ${manualData.title || 'N/A'}
Company:        ${manualData.company || 'N/A'}
Salary:         ${manualData.salary || 'N/A'}
Location:       ${manualData.location || 'N/A'}
Pasted JD:      ${manualData.description ? manualData.description.slice(0, 2000) : 'Not provided'}
${hitLoginWall ? 'Scraped Text:   Unable to scrape (login/auth wall detected)' : `Scraped Text:   ${scraped.bodyText || 'Could not scrape: ' + (scraped.error || 'unknown error')}`}

=== IMPORTANT INSTRUCTIONS FOR LOGIN-PROTECTED PLATFORMS ===
${hitLoginWall ? `
**LOGIN WALL DETECTED**: The page requires authentication (LinkedIn, Naukri, etc.). 

DO NOT flag this as fake just because scraping failed. Instead:
1. Check if the URL is from a legitimate platform (LinkedIn, Naukri, Indeed, etc.)
2. If user provided manual data (title, company, description), analyze THAT instead
3. If NO manual data provided, mark as "UNKNOWN" (not FAKE)
4. Focus on RED FLAGS in the manual data if available
5. Legitimate platforms with login walls are NOT scams by default

VERDICT LOGIC FOR LOGIN WALLS:
- Platform is LinkedIn/Naukri/Indeed + NO manual data → verdict: "UNKNOWN", riskScore: 10-20
- Platform is LinkedIn/Naukri/Indeed + HAS manual data → Analyze the manual data normally
- Platform is unknown/suspicious + login wall → verdict: "SUSPICIOUS", riskScore: 40-60
` : ''}

=== ANALYZE FOR THESE RED FLAGS ===
CRITICAL (each alone = FAKE):
  - Requests upfront payment, training fees, or equipment purchase
  - Asks for SSN, bank details, or passport before hiring
  - Promises unrealistic income (e.g., "$5000/week data entry", "earn $200/hr from home", "₹50,000/week part-time")
  - "Reshipping" or "money mule" patterns
  - Reply to personal gmail/yahoo for a corporate role
  - Asks to move conversation to WhatsApp/Telegram immediately

HIGH RISK:
  - Vague or missing job responsibilities
  - No identifiable company (can't be found online)
  - Generic boilerplate with no company-specific info
  - Grammar/spelling errors throughout
  - Extreme urgency ("Apply in next 2 hours!")
  - Job type mismatch with claimed salary (₹1 lakh/month for data entry)

MEDIUM RISK:
  - Salary not stated or very wide range
  - New account / recently created posting
  - No named recruiter or hiring manager
  - Platform URL doesn't match company name

=== POSITIVE SIGNALS ===
  - URL from verified platform (LinkedIn, Naukri, Indeed, Internshala, etc.)
  - Verifiable company LinkedIn/website
  - Clear role, team description, responsibilities
  - Standard salary for the role/location/industry
  - Named recruiter or HR contact
  - Standard multi-stage application process (resume → interview → offer)
  - Job posted on trusted verified company profile

=== OUTPUT FORMAT ===
Respond ONLY with a raw JSON object (no markdown, no backticks, no explanation outside JSON):
{
  "verdict": "REAL" | "FAKE" | "SUSPICIOUS" | "UNKNOWN",
  "confidence": <integer 0-100>,
  "riskScore": <integer 0-100>,
  "summary": "<2-3 concise sentences explaining your verdict>",
  "redFlags": ["<specific flag found>", ...],
  "positiveSignals": ["<specific positive>", ...],
  "recommendation": "<1-2 sentences of actionable advice for the job seeker>",
  "extractedTitle": "<job title from page or manual data>",
  "extractedCompany": "<company name from page or manual data>"
}

IMPORTANT REMINDERS:
- LinkedIn, Naukri, Indeed, Internshala URLs with login walls are NOT automatically fake
- If login wall + no manual data: verdict should be "UNKNOWN" with low risk (10-20)
- Focus analysis on the MANUAL DATA provided by user when scraping fails
- Only mark as FAKE if there are actual scam indicators in the data provided`;
}

function detectPlatform(url = '') {
  const u = url.toLowerCase();
  const map = [
    ['linkedin.com', 'LinkedIn'], ['indeed.com', 'Indeed'],
    ['glassdoor.com', 'Glassdoor'], ['naukri.com', 'Naukri'],
    ['monster.com', 'Monster'], ['ziprecruiter.com', 'ZipRecruiter'],
    ['dice.com', 'Dice'], ['remoteok.com', 'RemoteOK'],
    ['wellfound.com', 'Wellfound'], ['angel.co', 'AngelList'],
    ['greenhouse.io', 'Greenhouse'], ['lever.co', 'Lever'],
    ['workday.com', 'Workday'], ['smartrecruiters.com', 'SmartRecruiters'],
    ['internshala.com', 'Internshala'], ['foundit.in', 'Foundit'],
    ['shine.com', 'Shine'], ['timesjobs.com', 'TimesJobs'],
    ['instahyre.com', 'Instahyre'], ['cutshort.io', 'Cutshort'],
  ];
  for (const [domain, name] of map) { if (u.includes(domain)) return name; }
  return 'Other';
}

// ── Main Analyze Function ──────────────────────────────────────────────────────
async function analyzeJobListing({ url, title, company, description, salary, location }) {
  // Step 1: Scrape the URL
  const scraped = await scrapeJobPage(url);

  // Step 2: Build prompt
  const prompt = buildPrompt({
    url,
    scraped,
    manualData: { title, company, description, salary, location },
  });

  // Step 3: Call Gemini
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Step 4: Parse JSON (strip accidental markdown)
  const cleaned = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    ...parsed,
    platform: detectPlatform(url),
    scrapedOk: !scraped.error && !scraped.loginWall,
    loginWall: scraped.loginWall || false,
    analyzedAt: new Date(),
  };
}

module.exports = { analyzeJobListing, detectPlatform };