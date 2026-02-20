const router  = require('express').Router();
const { analyzeJobListing } = require('../services/geminiService');

// POST /api/analyze
// Body: { url, title?, company?, description?, salary?, location? }
router.post('/', async (req, res, next) => {
  try {
    const { url, title, company, description, salary, location } = req.body;

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'A valid URL starting with http is required' });
    }

    const result = await analyzeJobListing({ url, title, company, description, salary, location });
    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err.message);
    // Return a structured error so frontend can show fallback
    res.status(500).json({
      error: err.message,
      verdict: 'UNKNOWN',
      confidence: 0,
      riskScore: 0,
      summary: 'Analysis failed. Check your Gemini API key or try again.',
      redFlags: [],
      positiveSignals: [],
      recommendation: 'Manual review recommended.',
    });
  }
});

module.exports = router;