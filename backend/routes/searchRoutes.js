const router = require('express').Router();
const { aggregateJobs, parseResumeKeywords } = require('../services/jobAggregatorService');
const { analyzeJobListing } = require('../services/geminiService');
const Job = require('../models/job');

// POST /api/search/jobs
// Body: { keywords, location, jobType, experience, platforms, autoSave?, analyzeScams? }
router.post('/jobs', async (req, res, next) => {
  try {
    const { 
      keywords, 
      location, 
      jobType, 
      experience, 
      platforms,
      autoSave = false,
      analyzeScams = false,
    } = req.body;

    if (!keywords) {
      return res.status(400).json({ error: 'Keywords are required' });
    }

    console.log('🔍 Job search request:', { keywords, location, jobType, experience, platforms });

    // Aggregate jobs from multiple platforms
    const jobs = await aggregateJobs({
      keywords,
      location,
      jobType,
      experience,
      platforms: platforms || ['linkedin', 'naukri', 'indeed', 'internshala', 'foundit'],
    });

    // Optional: Auto-save to tracker
    if (autoSave && jobs.length > 0) {
      let saved = 0;
      let skipped = 0;

      for (const job of jobs) {
        try {
          // Check if already exists
          const existing = await Job.findOne({ url: job.url });
          if (existing) {
            skipped++;
            continue;
          }

          // Save to database
          await Job.create({
            title: job.title,
            company: job.company,
            url: job.url,
            platform: job.platform,
            status: 'Saved',
            salary: job.salary,
            location: job.location,
            description: job.description,
            source: 'search',
            statusHistory: [{
              status: 'Saved',
              note: `Found via job search: ${keywords}`,
              changedAt: new Date(),
            }],
          });
          saved++;
        } catch (err) {
          console.error('Error saving job:', err.message);
        }
      }

      console.log(`💾 Auto-saved: ${saved} jobs, skipped ${skipped} duplicates`);
      return res.json({
        jobs,
        saved,
        skipped,
        total: jobs.length,
      });
    }

    // Optional: Analyze for scams (WARNING: Uses Gemini API quota)
    if (analyzeScams && jobs.length > 0) {
      console.log('⚠️ Scam analysis enabled - this will use Gemini API quota!');
      
      for (let i = 0; i < Math.min(jobs.length, 5); i++) { // Limit to 5 to save API calls
        try {
          const analysis = await analyzeJobListing({
            url: jobs[i].url,
            title: jobs[i].title,
            company: jobs[i].company,
            description: jobs[i].description,
            salary: jobs[i].salary,
            location: jobs[i].location,
          });
          
          jobs[i].analysis = {
            verdict: analysis.verdict,
            riskScore: analysis.riskScore,
            confidence: analysis.confidence,
          };
        } catch (err) {
          console.error(`Analysis failed for job ${i}:`, err.message);
        }
      }
    }

    res.json({
      jobs,
      total: jobs.length,
      platforms: [...new Set(jobs.map(j => j.platform))],
    });

  } catch (err) {
    console.error('Job search error:', err);
    next(err);
  }
});

// POST /api/search/resume
// Upload resume and auto-generate search keywords
router.post('/resume', async (req, res, next) => {
  try {
    const { resumeText } = req.body;

    if (!resumeText) {
      return res.status(400).json({ error: 'Resume text is required' });
    }

    console.log('📄 Parsing resume...');

    // Extract keywords from resume
    const keywords = parseResumeKeywords(resumeText);

    console.log('✓ Extracted keywords:', keywords);

    res.json({
      keywords,
      suggested: {
        keywords: keywords.join(', '),
        message: 'Use these keywords to search for relevant jobs',
      },
    });

  } catch (err) {
    console.error('Resume parsing error:', err);
    next(err);
  }
});

// GET /api/search/trending
// Get trending job searches (based on recent searches - mock data for now)
router.get('/trending', async (req, res) => {
  // Mock trending searches
  const trending = [
    { keywords: 'software engineer', count: 1250 },
    { keywords: 'data analyst', count: 980 },
    { keywords: 'full stack developer', count: 875 },
    { keywords: 'python developer', count: 720 },
    { keywords: 'frontend developer react', count: 650 },
    { keywords: 'backend engineer node', count: 580 },
    { keywords: 'devops engineer', count: 520 },
    { keywords: 'machine learning engineer', count: 450 },
  ];

  res.json({ trending });
});

module.exports = router;