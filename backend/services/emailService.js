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
    /linkedin\.com\/comm\/jobs\/view\/\d+/gi,  // Email links
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

// ── Filter out bulk/aggregate notification emails ────────────────────────────
function isBulkNotificationEmail(subject, body) {
  const bulkPatterns = [
    // LinkedIn bulk notifications
    /\d+\s+(?:more\s+)?jobs?\s+(?:in|for|at)/i,  // "12 more jobs in Pune"
    /\d+\s+jobs?\s+(?:that\s+)?you\s+haven't\s+applied/i,  // "7 jobs you haven't applied"
    /and\s+\d+\s+more\s+jobs/i,  // "Enzigma and 12 more jobs"
    /jobs?\s+you\s+may\s+be\s+interested/i,  // "Jobs you may be interested in"
    /recommended\s+(?:for\s+)?you/i,  // "Recommended for you"
    /suggested\s+jobs?/i,  // "Suggested jobs"
    /(?:daily|weekly)\s+job\s+alert/i,  // "Daily job alert"
    /new\s+jobs?\s+for\s+you/i,  // "New jobs for you"
    /jobs?\s+matching\s+your/i,  // "Jobs matching your..."
    
    // Naukri bulk notifications
    /best\s+matching\s+jobs?/i,
    /jobs?\s+as\s+per\s+your\s+profile/i,
    /recommended\s+jobs?\s+based\s+on/i,
    
    // Indeed bulk notifications
    /jobs?\s+matching\s+your\s+(?:search|preferences)/i,
    
    // Generic patterns
    /\d+\s+new\s+jobs?/i,  // "5 new jobs"
    /top\s+\d+\s+jobs?/i,  // "Top 10 jobs"
  ];
  
  const text = (subject + ' ' + body).toLowerCase();
  return bulkPatterns.some(pattern => pattern.test(text));
}

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

  // Combine all text sources
  const allText = (html || body || '') + ' ' + subject;
  
  // CRITICAL: Clean HTML entities FIRST before any pattern matching
  const cleanText = allText
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  // ── ENHANCED: LinkedIn tracking URL extraction ──────────────────────────────
  // LinkedIn URLs have this pattern: /jobs/view/JOBID/?trackingId=HASH&refId=HASH
  const linkedInPattern = /https?:\/\/(?:www\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/\d+\/?\?[^\s<>"]+/gi;
  const linkedInMatches = cleanText.match(linkedInPattern) || [];
  
  linkedInMatches.forEach(rawUrl => {
    // Clean up: remove HTML artifacts and normalize
    let url = rawUrl
      .replace(/[.,;!?\)\]}>'"]+$/, '')       // Remove trailing punctuation
      .replace(/%3D%3D&.*$/, '%3D%3D')        // Keep only trackingId, remove refId
      .replace(/&refId=[^&\s]+/g, '')         // Remove refId parameter
      .replace(/\\/g, '')                     // Remove escape chars
      .replace(/&trackingId=.*?(?=&|$)/, (match) => match.split('&')[0]); // Clean trackingId
    
    if (!details.urls.includes(url)) {
      details.urls.push(url);
    }
  });
  
  // ── Platform-specific URL patterns ──────────────────────────────────────────
  JOB_PATTERNS.urlPatterns.forEach(pattern => {
    const matches = cleanText.matchAll(pattern);
    for (const match of matches) {
      let url = match[0]
        .replace(/[.,;!?\)\]}>'"]+$/, '')
        .replace(/\\/g, '');
      
      // Make sure it starts with http
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      
      if (!details.urls.includes(url)) {
        details.urls.push(url);
      }
    }
  });
  
  // ── Fallback: Generic job URLs ──────────────────────────────────────────────
  const urlRegex = /https?:\/\/[^\s<>"]+/gi;
  const allUrls = cleanText.match(urlRegex) || [];
  
  allUrls.forEach(rawUrl => {
    const cleanUrl = rawUrl.replace(/[.,;!?\)\]}>'"]+$/, '');
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

  // ── IMPROVED: Title extraction (avoid notification text) ────────────────────
  const titlePatterns = [
    // LinkedIn specific - AVOID bulk notification patterns
    /(?:^|: )([A-Z][^:\n]{10,80}?)\s+at\s+[A-Z]/m,  // "Title at Company"
    /You applied (?:to|for)\s+([^:\n]{8,80}?)\s+at\s+/i,
    /application for\s+([^:\n]{8,80}?)\s+at\s+/i,
    /You're a top applicant for\s+([^:\n]{8,80}?)\s+at\s+/i,
    /(?:applied|application).*?:\s*(.+?)\s+at\s+/i,
    
    // Naukri specific  
    /applied for\s+([^:\n]{8,80}?)\s+(?:job\s+)?(?:at|with|in)\s+/i,
    /application.*?(?:job|position|role):\s*(.+?)(?:\n|at|with)/i,
    /Job:\s*(.+?)(?:\n|<br|at|Company)/i,
    
    // Indeed specific
    /(?:applied|application) (?:to|for)\s+([^:\n]{8,80}?)\s+(?:at|with)/i,
    
    // Generic patterns
    /(?:position|role|job title|opening):\s*(.+?)(?:\n|<br|at|with|$)/i,
    /for (?:the )?(position of|role of)\s+(.+?)(?:\n|<br|at|$)/i,
    
    // Subject line patterns
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
          .replace(/<[^>]*>/g, '')          // Remove HTML tags
          .replace(/\s+/g, ' ')              // Normalize spaces
          .replace(/^[-–—:]\s*/, '')         // Remove leading dashes/colons
          .replace(/\s*[-–—:]$/, '')         // Remove trailing dashes/colons
          .replace(/\s*\(.*?\)\s*/g, '')     // Remove parenthetical
          .substring(0, 100);
        
        // ⚠️ CRITICAL: Skip if it's a bulk notification phrase
        const isBulkPhrase = /\d+\s+(?:more\s+)?jobs?|and\s+\d+\s+more|you\s+haven't\s+applied|may\s+be\s+interested/i.test(title);
        const looksLikeCompany = title.match(/^[A-Z][a-z]+\s+(?:Inc|Ltd|LLC|Corp|Pvt|Limited|Technologies|Solutions)/);
        const isTooShort = title.length < 8;
        const isAllCaps = title === title.toUpperCase() && title.length < 20;
        
        if (!isBulkPhrase && !looksLikeCompany && !isTooShort && !isAllCaps) {
          details.title = title;
          break;
        }
      }
    }
  }

  // ── IMPROVED: Company extraction (avoid bulk text) ──────────────────────────
  const companyPatterns = [
    // LinkedIn specific patterns
    /You applied to .+ at\s+([A-Z][^:\n]{2,60}?)(?:\s+(?:for|on|via|as|\n|<br|$|\s+\||\.|-|–))/i,
    /application for .+ at\s+([A-Z][^:\n]{2,60}?)(?:\s+(?:for|on|via|as|\n|<br|$|\s+\||\.|-|–))/i,
    /top applicant for .+ at\s+([A-Z][^:\n]{2,60}?)(?:\s+(?:for|on|via|as|\n|<br|$|\s+\||\.|-|–))/i,
    
    // Naukri specific patterns
    /applied for .+ (?:job\s+)?(?:at|with|in)\s+([A-Z][^:\n]{2,60}?)(?:\n|<br|$|for|on|\s+\||\.|-|–)/i,
    /Job at\s+([A-Z][^:\n]{2,60}?)(?:\n|<br|$|-|\s+\||\.)/i,
    /Company:\s*([A-Z][^:\n<]{2,60}?)(?:\n|<br|Location|$|\s+\||\.)/i,
    /Employer:\s*([A-Z][^:\n<]{2,60}?)(?:\n|<br|$|\s+\||\.)/i,
    
    // Indeed specific patterns
    /applied (?:to|at)\s+([A-Z][^:\n]{2,60}?)\s+(?:for|on|as|\n)/i,
    
    // Generic patterns - match company names (typically capitalized words)
    /(?:at|with|@)\s+([A-Z][a-zA-Z0-9\s&.,'-]+(?:Inc|Ltd|LLC|Corp|Co|Pvt|Limited|Group|Technologies|Solutions|Software|Systems|Services)?)\s+(?:for|on|via|as|\n|<br|$|\s+\||\.|-|–)/i,
    /(?:at|with|@)\s+([A-Z][a-zA-Z][a-zA-Z\s&.,'-]{2,50}?)(?:\s+(?:for|on|via|in|as|\n|<br|$|\s+\||-|–))/,
    
    // Additional structured formats
    /Company Name:\s*([A-Z][^:\n<]{2,60}?)(?:\n|<br|$|\s+\||\.)/i,
    /Organization:\s*([A-Z][^:\n<]{2,60}?)(?:\n|<br|$|\s+\||\.)/i,
  ];
  
  for (const pattern of companyPatterns) {
    const match = (subject + '\n' + body + '\n' + html).match(pattern);
    if (match && match[1]) {
      let company = match[1]
        .trim()
        .replace(/<[^>]*>/g, '')              // Remove HTML tags
        .replace(/\s+/g, ' ')                 // Normalize spaces
        .replace(/^[-–—:*•]\s*/, '')          // Remove leading punctuation/bullets
        .replace(/\s*[-–—:*•]$/, '')          // Remove trailing punctuation
        .replace(/\s*\(.*?\)\s*/g, '')        // Remove parenthetical notes
        .replace(/\s+(?:via|on|at)\s+.+$/i, '') // Remove trailing "via LinkedIn" etc
        .substring(0, 100);
      
      // ⚠️ CRITICAL: Skip bulk notification phrases
      const isBulkPhrase = /\d+\s+(?:more\s+)?jobs?|and\s+\d+\s+more|you\s+haven't\s+applied|may\s+be\s+interested/i.test(company);
      const skipWords = [
        'LinkedIn', 'Indeed', 'Naukri', 'Internshala', 'Monster', 'Shine', 'TimesJobs',
        'the job', 'this position', 'our team', 'email', 'job board', 'portal',
        'click here', 'view', 'apply', 'application', 'unsubscribe', 'Apply Now'
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
      
      if (!isBulkPhrase && !shouldSkip && !isTooShort && !isAllNumbers && !isEmailAddress && !isUrl && !hasOnlySpecialChars) {
        details.company = company;
        break;
      }
    }
  }
  
  // ── Fallback: Try to extract from email HTML structure ──────────────────────
  if (!details.company && html) {
    // Look for company in common HTML table structures
    const htmlCompanyMatch = html.match(/<td[^>]*>\s*(?:Company|Employer|Organization)[:\s]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    if (htmlCompanyMatch && htmlCompanyMatch[1]) {
      let company = htmlCompanyMatch[1].trim();
      if (company.length >= 2 && !/\d+\s+more\s+jobs/i.test(company)) {
        details.company = company.substring(0, 100);
      }
    }
  }
  
  if (!details.title && html) {
    // Look for title in common HTML table structures
    const htmlTitleMatch = html.match(/<td[^>]*>\s*(?:Job Title|Position|Role)[:\s]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
    if (htmlTitleMatch && htmlTitleMatch[1]) {
      let title = htmlTitleMatch[1].trim();
      if (title.length >= 8 && !/\d+\s+more\s+jobs/i.test(title)) {
        details.title = title.substring(0, 100);
      }
    }
  }

  return details;
}

// ── Scan emails ──────────────────────────────────────────────────────────────
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
                  processed++;
                  if (processed === limitedResults.length) {
                    imap.end();
                  }
                  return;
                }

                const subject = parsed.subject || '';
                const body = parsed.text || '';
                const html = parsed.html || '';
                const from = parsed.from?.text || '';

                // ⚠️ CRITICAL: Skip bulk notification emails FIRST
                if (isBulkNotificationEmail(subject, body)) {
                  console.log(`⏭️  Skipped bulk notification: ${subject.substring(0, 60)}...`);
                  processed++;
                  if (processed === limitedResults.length) {
                    imap.end();
                  }
                  return;  // Skip this email entirely
                }

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

// ── Auto-import with AI analysis ─────────────────────────────────────────────
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