const router = require('express').Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// POST /api/ai/insights
router.post('/insights', async (req, res, next) => {
  try {
    const { type, jobs, analytics } = req.body;
    
    let prompt = '';
    let systemPrompt = '';
    
    if (type === 'pipeline-health') {
      systemPrompt = 'You are an expert career coach analyzing a job seeker\'s pipeline. Be specific, honest, and actionable.';
      prompt = `Here is a summary of this person's job search pipeline:
Total applications: ${analytics.total}
Applied: ${analytics.applied}, Interviews: ${analytics.interviews}, Offers: ${analytics.offers}
Response rate: ${analytics.responseRate}%
Avg risk score: ${analytics.avgRiskScore}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "healthScore": <integer 0-100>,
  "healthLabel": "Excellent" | "Good" | "Needs work" | "Critical",
  "headline": "<1 sentence sharp diagnosis>",
  "positives": ["<specific positive>", "<another>"],
  "concerns": ["<specific concern>", "<another>"],
  "topAction": "<single most impactful action>"
}`;
    } else if (type === 'role-patterns') {
      systemPrompt = 'You are a career strategist. Identify patterns in applications.';
      const list = jobs.slice(0, 20).map(j => 
        `${j.title} at ${j.company} → Status: ${j.status}, Risk: ${j.analysis?.verdict || 'N/A'}`
      ).join('\n');
      
      prompt = `Applications:\n${list}

Respond ONLY with valid JSON (no markdown):
{
  "targetRoles": ["<role type>"],
  "patternInsight": "<2 sentences about patterns>",
  "roleRecommendations": ["<role>", "<role>", "<role>"],
  "companyTypeInsight": "<1 sentence>",
  "diversificationAdvice": "<1 sentence>"
}`;
    } else if (type === 'weekly-plan') {
      systemPrompt = 'You are a career coach creating a weekly action plan.';
      prompt = `Pipeline stats:
- ${analytics.total} total jobs, ${analytics.interviews} interviews, ${analytics.offers} offers
- Response rate: ${analytics.responseRate}%

Create a 5-item weekly action plan. Respond ONLY with valid JSON:
{
  "weekOf": "<week description>",
  "actions": [
    {"day": "Monday", "action": "<action>", "why": "<why>", "timeEstimate": "<time>"},
    {"day": "Tuesday", "action": "<action>", "why": "<why>", "timeEstimate": "<time>"},
    {"day": "Wednesday", "action": "<action>", "why": "<why>", "timeEstimate": "<time>"},
    {"day": "Thursday", "action": "<action>", "why": "<why>", "timeEstimate": "<time>"},
    {"day": "Friday", "action": "<action>", "why": "<why>", "timeEstimate": "<time>"}
  ]
}`;
    }
    
    const result = await model.generateContent(`${systemPrompt}\n\n${prompt}`);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    res.json(parsed);
  } catch (err) {
    console.error('AI insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/resume-match
router.post('/resume-match', async (req, res, next) => {
  try {
    const { resume, jobDescription, jobTitle, company } = req.body;
    
    const prompt = `You are an expert career coach and ATS specialist. Analyze resume-job fit.

JOB TITLE: ${jobTitle || 'Not specified'}
COMPANY: ${company || 'Not specified'}

JOB DESCRIPTION:
${jobDescription.slice(0, 2000)}

RESUME:
${resume.slice(0, 2000)}

Respond ONLY with valid JSON (no markdown):
{
  "matchScore": <integer 0-100>,
  "matchLevel": "Excellent" | "Good" | "Fair" | "Poor",
  "summary": "<2-3 sentence assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "keywords": {
    "matched": ["<keyword>"],
    "missing": ["<keyword>"]
  },
  "atsScore": <integer 0-100>,
  "suggestions": ["<improvement 1>", "<improvement 2>", "<improvement 3>"]
}`;
    
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    res.json(parsed);
  } catch (err) {
    console.error('Resume match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/cover-letter
router.post('/cover-letter', async (req, res, next) => {
  try {
    const { resume, jobDescription, jobTitle, company } = req.body;
    
    const prompt = `You are an expert cover letter writer. Write compelling, personalized cover letters.

Write a cover letter for this job application.

JOB TITLE: ${jobTitle || 'the role'}
COMPANY: ${company || 'the company'}

JOB DESCRIPTION:
${jobDescription.slice(0, 1500)}

RESUME HIGHLIGHTS:
${resume.slice(0, 1500)}

Write a 3-paragraph cover letter:
- First para: opening hook + why this role/company
- Second para: 2-3 specific examples from resume matching the JD
- Third para: closing with call to action

Keep it under 350 words. Do NOT use clichés.`;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    res.json({ coverLetter: text });
  } catch (err) {
    console.error('Cover letter error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;