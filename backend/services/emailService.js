const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { analyzeJobListing } = require('./geminiService');

// ── Email patterns for job applications ──────────────────────────────────────
const JOB_PATTERNS = {
  // Common sender domains for job platforms
  senderDomains: [
    'linkedin.com',
    'naukri.com', 
    'indeed.com',
    'internshala.com',
    'foundit.in',
    'monster.com',
    'shine.com',
    'timesjobs.com',
    'instahyre.com',
    'cutshort.io',
    'angellist.com',
    'wellfound.com',
    'glassdoor.com',
    'hirist.com',
    'iimjobs.com',
  ],

  subjects: [
    /application.*confirmed/i,
    /thank you.*applying/i,
    /application.*received/i,
    /application.*submitted/i,
    /applied.*successfully/i,
    /your application.*for/i,
    /job application/i,
    /application status/i,
    /interview.*scheduled/i,
    /interview.*invitation/i,
    /offer.*letter/i,
    /rejection/i,
    /unfortunately/i,
    /you.*applied/i,
    /applied.*to/i,
    /profile.*viewed/i,
    /recruiter.*messaged/i,
    /job.*alert/i,
    /application.*update/i,
  ],
  
  urlPatterns: [
    // International platforms
    /linkedin\.com\/jobs\/view\/\d+/gi,
    /indeed\.com\/viewjob\?jk=[a-f0-9]+/gi,
    /indeed\.com\/job\//gi,
    /glassdoor\.com\/job-listing\//gi,
    /monster\.com\/job-openings\//gi,
    /ziprecruiter\.com\/c\//gi,
    /wellfound\.com\/jobs\/\d+/gi,
    /angel\.co\/company\/.*\/jobs\//gi,
    /greenhouse\.io\/.*\/jobs\/\d+/gi,
    /lever\.co\/.*\/jobs\/[a-f0-9-]+/gi,
    /workday\.com\/.*\/job\//gi,
    /myworkdayjobs\.com\/.*\/job\//gi,
    /smartrecruiters\.com\/.*\/\d+/gi,
    
    // Indian platforms
    /naukri\.com\/job-listings-/gi,
    /naukri\.com\/.*\/jd\//gi,
    /internshala\.com\/internship\/detail\//gi,
    /internshala\.com\/job\/detail\//gi,
    /foundit\.in\/.*\/job\//gi,
    /foundit\.in\/srp\/results\//gi,
    /monsterindia\.com\/job\//gi,
    /shine\.com\/jobs\//gi,
    /timesjobs\.com\/job-detail\//gi,
    /instahyre\.com\/jobs\//gi,
    /cutshort\.io\/job\//gi,
    /hirist\.com\/jobs\//gi,
    /iimjobs\.com\/j\//gi,
    /freshersworld\.com\/jobs\//gi,
    /apna\.co\/jobs\//gi,
  ],
};

// ── Status detection from email content ──────────────────────────────────────
function detectStatusFromEmail(subject, body) {
  const text = (subject + ' ' + body).toLowerCase();
  
  if (/interview.*scheduled|interview.*invitation|schedule.*interview/i.test(text)) {
    return 'Interview';
  }
  if (/offer.*letter|offer.*extended|pleased.*offer|congratulations.*offer/i.test(text)) {
    return 'Offer';
  }
  if (/reject|unfortunately|not.*selected|not.*move.*forward|position.*filled/i.test(text)) {
    return 'Rejected';
  }
  if (/application.*confirmed|application.*received|thank you.*applying|successfully.*applied/i.test(text)) {
    return 'Applied';
  }
  
  return 'Applied'; // Default
}

// ── IMPROVED: Extract job details from email ─────────────────────────────────
function extractJobDetails(subject, body, html) {
  const details = {
    title: null,
    company: null,
    urls: [],
  };

  // Extract URLs - try both text and HTML
  const allText = (html || body || '') + ' ' + subject;
  
  // First try platform-specific patterns
  JOB_PATTERNS.urlPatterns.forEach(pattern => {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      let url = match[0];
      
      // Clean up URL (remove trailing punctuation, HTML entities, etc.)
      url = url.replace(/[.,;!?\)\]}>]+$/, ''); // Remove trailing punctuation
      url = url.replace(/&amp;/g, '&'); // Fix HTML entities
      
      // Make sure it starts with http
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      
      if (!details.urls.includes(url)) {
        details.urls.push(url);
      }
    }
  });
  
  // Fallback: Look for any URLs from known job domains
  const urlRegex = /https?:\/\/[^\s<>"]+/gi;
  const allUrls = allText.match(urlRegex) || [];
  
  allUrls.forEach(url => {
    const cleanUrl = url.replace(/[.,;!?\)\]}>]+$/, '');
    const isJobUrl = JOB_PATTERNS.senderDomains.some(domain => 
      cleanUrl.includes(domain) && (
        cleanUrl.includes('/job') || 
        cleanUrl.includes('/internship') ||
        cleanUrl.includes('/jd/') ||
        cleanUrl.includes('jobs')
      )
    );
    
    if (isJobUrl && !details.urls.includes(cleanUrl)) {
      details.urls.push(cleanUrl);
    }
  });

  // ── IMPROVED: Extract job title ──────────────────────────────────────────
  const titlePatterns = [
    // LinkedIn specific
    /You applied to\s+(.+?)\s+at\s+/i,
    /application for\s+(.+?)\s+at\s+/i,
    /You're a top applicant for\s+(.+?)\s+at\s+/i,
    /(?:applied|application).*?:\s*(.+?)\s+at\s+/i,
    
    // Naukri specific  
    /applied for\s+(.+?)\s+(?:job\s+)?(?:at|with|in)\s+/i,
    /application.*?(?:job|position|role):\s*(.+?)(?:\n|at|with)/i,
    /Job:\s*(.+?)(?:\n|<br|at|Company)/i,
    
    // Indeed specific
    /(?:applied|application) (?:to|for)\s+(.+?)\s+(?:at|with)/i,
    
    // Generic patterns
    /(?:position|role|job title|opening):\s*(.+?)(?:\n|<br|at|with|$)/i,
    /for (?:the )?(position of|role of)\s+(.+?)(?:\n|<br|at|$)/i,
    
    // Subject line patterns (very common in LinkedIn/Naukri)
    /^(?:Application|Applied|You applied).*?(?:for|to)[\s:]+(.+?)\s+(?:at|with|[-–—])/i,
    /Application for\s+(.+?)(?:\s+at\s+|\s+-\s+|\s+with\s+)/i,
  ];
  
  for (const pattern of titlePatterns) {
    const match = (subject + '\n' + body).match(pattern);
    if (match) {
      let title = match[1] || match[2];
      if (title) {
        title = title
          .trim()
          .replace(/<[^>]*>/g, '')  // Remove HTML tags
          .replace(/\s+/g, ' ')      // Normalize spaces
          .replace(/^[-–—:]\s*/, '') // Remove leading dashes/colons
          .replace(/\s*[-–—:]$/, '') // Remove trailing dashes/colons
          .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical
          .substring(0, 100);
        
        // Skip if it looks like a company name or is too short
        const looksLikeCompany = title.match(/^[A-Z][a-z]+\s+(?:Inc|Ltd|LLC|Corp|Pvt|Limited|Technologies|Solutions)/);
        const isTooShort = title.length < 4;
        const isAllCaps = title === title.toUpperCase() && title.length < 20; // Skip short ALL CAPS (might be codes)
        
        if (!looksLikeCompany && !isTooShort && !isAllCaps) {
          details.title = title;
          break;
        }
      }
    }
  }

  // ── IMPROVED: Extract company name ───────────────────────────────────────
  const companyPatterns = [
    // LinkedIn specific patterns
    /You applied to .+ at\s+(.+?)(?:\n|<br|$|via|on|through|\s+\||\.)/i,
    /application for .+ at\s+(.+?)(?:\n|<br|$|via|on|through|\s+\||\.)/i,
    /top applicant for .+ at\s+(.+?)(?:\n|<br|$|via|on|through|\s+\||\.)/i,
    
    // Naukri specific patterns
    /applied for .+ (?:job\s+)?(?:at|with|in)\s+(.+?)(?:\n|<br|$|for|on|\s+\||\.)/i,
    /Job at\s+(.+?)(?:\n|<br|$|-|\s+\||\.)/i,
    /Company:\s*(.+?)(?:\n|<br|Location|$|\s+\||\.)/i,
    /Employer:\s*(.+?)(?:\n|<br|$|\s+\||\.)/i,
    
    // Indeed specific patterns
    /applied (?:to|at)\s+(.+?)\s+(?:for|on|as|\n)/i,
    
    // Generic patterns - match company names (typically capitalized words)
    /(?:at|with|@)\s+([A-Z][a-zA-Z0-9\s&.,'-]+(?:Inc|Ltd|LLC|Corp|Co|Pvt|Limited|Group|Technologies|Solutions|Software|Systems|Services)?)\s+(?:for|on|via|as|\n|<br|$|\s+\||\.)/i,
    /(?:at|with|@)\s+([A-Z][a-zA-Z][a-zA-Z\s&.,'-]{2,50}?)(?:\s+(?:for|on|via|in|as|\n|<br|$|\s+\||-))/,
    
    // Additional structured formats
    /Company Name:\s*(.+?)(?:\n|<br|$|\s+\||\.)/i,
    /Organization:\s*(.+?)(?:\n|<br|$|\s+\||\.)/i,
    
    // From HTML structure (look for company in mailto or specific tags)
    /<td[^>]*>Company:<\/td>\s*<td[^>]*>(.+?)<\/td>/i,
  ];
  
  for (const pattern of companyPatterns) {
    const match = (subject + '\n' + body + '\n' + html).match(pattern);
    if (match && match[1]) {
      let company = match[1]
        .trim()
        .replace(/<[^>]*>/g, '')   // Remove HTML tags
        .replace(/\s+/g, ' ')       // Normalize spaces
        .replace(/^[-–—:*•]\s*/, '')  // Remove leading punctuation/bullets
        .replace(/\s*[-–—:*•]$/, '')  // Remove trailing punctuation
        .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical notes
        .replace(/\s+(?:via|on|at)\s+.+$/i, '') // Remove trailing "via LinkedIn" etc
        .substring(0, 100);
      
      // Skip common false positives
      const skipWords = [
        'LinkedIn', 'Indeed', 'Naukri', 'Internshala', 'Monster', 'Shine', 'TimesJobs',
        'the job', 'this position', 'our team', 'email', 'job board', 'portal',
        'click here', 'view', 'apply', 'application', 'unsubscribe'
      ];
      const shouldSkip = skipWords.some(word => company.toLowerCase() === word.toLowerCase() || 
                                                 company.toLowerCase().includes(word.toLowerCase() + ' ') ||
                                                 company.toLowerCase().includes(' ' + word.toLowerCase()));
      
      // Additional validation
      const isTooShort = company.length < 2;
      const isAllNumbers = /^\d+$/.test(company);
      const isEmailAddress = /@/.test(company);
      const isUrl = /https?:\/\//.test(company);
      const hasOnlySpecialChars = /^[^a-zA-Z0-9]+$/.test(company);
      
      if (!isTooShort && !isAllNumbers && !shouldSkip && !isEmailAddress && !isUrl && !hasOnlySpecialChars) {
        details.company = company;
        break;
      }
    }
  }
  
  // ── Fallback: Try to extract from email HTML structure ───────────────────
  if (!details.company && html) {
    // Look for company in common HTML table structures
    const htmlCompanyMatch = html.match(/<td[^>]*>\s*(?:Company|Employer|Organization)[:\s]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    if (htmlCompanyMatch && htmlCompanyMatch[1]) {
      let company = htmlCompanyMatch[1].trim();
      if (company.length >= 2) {
        details.company = company.substring(0, 100);
      }
    }
  }
  
  if (!details.title && html) {
    // Look for title in common HTML table structures
    const htmlTitleMatch = html.match(/<td[^>]*>\s*(?:Job Title|Position|Role)[:\s]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    if (htmlTitleMatch && htmlTitleMatch[1]) {
      let title = htmlTitleMatch[1].trim();
      if (title.length >= 4) {
        details.title = title.substring(0, 100);
      }
    }
  }

  return details;
}

// ── Scan emails ───────────────────────────────────────────────────────────────
async function scanEmails({ email, password, daysBack = 30, limit = 50 }) {
  return new Promise((resolve, reject) => {
    // Validate and clean password (remove spaces if any)
    const cleanPassword = password.replace(/\s+/g, '');
    
    if (cleanPassword.length !== 16) {
      return reject(new Error('Gmail App Password must be exactly 16 characters (without spaces). Get one at: https://myaccount.google.com/apppasswords'));
    }

    const imap = new Imap({
      user: email,
      password: cleanPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    const applications = [];
    let processed = 0;

    function openInbox(cb) {
      imap.openBox('INBOX', true, cb);
    }

    imap.once('ready', () => {
      openInbox((err, box) => {
        if (err) return reject(err);

        // Search for emails from last N days
        const searchDate = new Date();
        searchDate.setDate(searchDate.getDate() - daysBack);
        
        // Format date as: Jan 01, 2024 (required by IMAP)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dateStr = `${months[searchDate.getMonth()]} ${String(searchDate.getDate()).padStart(2, '0')}, ${searchDate.getFullYear()}`;

        console.log(`🔍 Searching emails since: ${dateStr}`);

        // IMAP search syntax: SINCE must be in array format [criteria, value]
        const searchCriteria = [['SINCE', dateStr]];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          console.log(`📧 Found ${results?.length || 0} total emails in date range`);

          if (!results || results.length === 0) {
            console.log('⚠️ No emails found. Try:');
            console.log('  1. Increasing "Days back" to 60 or 90');
            console.log('  2. Checking if job emails are in Spam/Promotions');
            console.log('  3. Verifying you have job application emails in Inbox');
            imap.end();
            return resolve([]);
          }

          // Limit results
          const limitedResults = results.slice(0, limit);
          console.log(`📥 Processing ${limitedResults.length} emails...`);
          
          const f = imap.fetch(limitedResults, { bodies: '', struct: true });

          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) {
                  console.error('Parse error:', err);
                  return;
                }

                const subject = parsed.subject || '';
                const body = parsed.text || '';
                const html = parsed.html || '';
                const from = parsed.from?.text || '';

                // Check if email is from a job platform OR has job-related content
                const isFromJobPlatform = JOB_PATTERNS.senderDomains.some(domain => 
                  from.toLowerCase().includes(domain)
                );
                
                const hasJobKeywords = JOB_PATTERNS.subjects.some(p => 
                  p.test(subject) || p.test(body)
                );
                
                const isJobEmail = isFromJobPlatform || hasJobKeywords;
                
                if (isJobEmail) {
                  const details = extractJobDetails(subject, body, html);
                  
                  // Only include if we found at least one job URL
                  if (details.urls.length > 0) {
                    const status = detectStatusFromEmail(subject, body);
                    const receivedDate = parsed.date || new Date();

                    applications.push({
                      subject,
                      status,
                      receivedDate,
                      emailFrom: from,
                      ...details,
                    });
                    
                    console.log(`✓ Found: "${details.title || 'Unknown Title'}" at "${details.company || 'Unknown Company'}"`);
                  } else {
                    // Log emails from job platforms that don't have URLs (for debugging)
                    if (isFromJobPlatform) {
                      console.log(`⚠ Job platform email without URL: ${subject.substring(0, 50)}...`);
                    }
                  }
                }

                processed++;
                if (processed === limitedResults.length) {
                  imap.end();
                }
              });
            });
          });

          f.once('error', (err) => {
            imap.end();
            reject(err);
          });

          f.once('end', () => {
            // Will be called after all messages are fetched
          });
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.once('end', () => {
      console.log(`\n📊 Scan Summary:`);
      console.log(`   Total emails scanned: ${processed}`);
      console.log(`   Job applications found: ${applications.length}`);
      if (applications.length > 0) {
        console.log(`   Platforms: ${[...new Set(applications.map(a => {
          const url = a.urls[0] || '';
          for (const domain of JOB_PATTERNS.senderDomains) {
            if (url.includes(domain)) return domain.split('.')[0];
          }
          return 'other';
        }))].join(', ')}`);
      }
      resolve(applications);
    });

    imap.connect();
  });
}

// ── Auto-import with AI analysis ──────────────────────────────────────────────
async function importApplicationsFromEmail(Job, { email, password, daysBack = 30, analyzeWithAI = true }) {
  try {
    // Step 1: Scan emails
    console.log('📧 Scanning emails...');
    const applications = await scanEmails({ email, password, daysBack });
    console.log(`✅ Found ${applications.length} job application emails`);

    if (applications.length === 0) {
      return { imported: 0, skipped: 0, errors: 0, applications: [] };
    }

    // Step 2: Process each application
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const results = [];

    for (const app of applications) {
      try {
        // Use the first URL found
        const url = app.urls[0];

        // Check if already exists
        const existing = await Job.findOne({ url });
        if (existing) {
          skipped++;
          console.log(`⏭️  Skipped (exists): ${app.title || app.subject}`);
          continue;
        }

        // Build job object
        const jobData = {
          url,
          title: app.title || 'Imported from Email',
          company: app.company || 'Unknown Company',
          status: app.status,
          appliedDate: app.receivedDate,
          userEmail: email,
          source: 'email',
          statusHistory: [{
            status: app.status,
            note: `Auto-imported from email: ${app.subject}`,
            changedAt: app.receivedDate,
          }],
        };

        // Optional: Analyze with AI
        if (analyzeWithAI) {
          try {
            console.log(`🔍 Analyzing: ${jobData.title}...`);
            const analysis = await analyzeJobListing({
              url,
              title: jobData.title,
              company: jobData.company,
            });

            jobData.analysis = {
              verdict: analysis.verdict,
              confidence: analysis.confidence,
              riskScore: analysis.riskScore,
              summary: analysis.summary,
              redFlags: analysis.redFlags || [],
              positiveSignals: analysis.positiveSignals || [],
              recommendation: analysis.recommendation || '',
              analyzedAt: new Date(),
            };

            // Update title/company if extracted
            if (analysis.extractedTitle) jobData.title = analysis.extractedTitle;
            if (analysis.extractedCompany) jobData.company = analysis.extractedCompany;
          } catch (analyzeErr) {
            console.warn('⚠️  AI analysis failed:', analyzeErr.message);
          }
        }

        // Create job
        const job = await Job.create(jobData);
        imported++;
        results.push(job);
        console.log(`✅ Imported: ${job.title} at ${job.company}`);

      } catch (err) {
        errors++;
        console.error(`❌ Error importing application:`, err.message);
      }
    }

    console.log(`\n📊 Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);

    return { imported, skipped, errors, applications: results };
  } catch (err) {
    console.error('Email scan failed:', err.message);
    throw err;
  }
}

module.exports = {
  scanEmails,
  importApplicationsFromEmail,
  extractJobDetails,
  detectStatusFromEmail,
};