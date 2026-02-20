const router = require('express').Router();
const Job    = require('../models/job');
const { sendStatusEmail, sendAnalysisAlertEmail } = require('../services/emailService');
const { detectPlatform } = require('../services/geminiService');

// GET /api/jobs  — list all jobs (with optional filters)
router.get('/', async (req, res, next) => {
  try {
    const { status, verdict, platform, search, sort = '-createdAt' } = req.query;
    const query = {};
    if (status)   query.status = status;
    if (verdict)  query['analysis.verdict'] = verdict;
    if (platform) query.platform = platform;
    if (search) {
      query.$or = [
        { title:   { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }
    const jobs = await Job.find(query).sort(sort).lean();
    res.json(jobs);
  } catch (err) { next(err); }
});

// GET /api/jobs/:id
router.get('/:id', async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) { next(err); }
});

// POST /api/jobs  — create job (also accepts analysis data from frontend)
router.post('/', async (req, res, next) => {
  try {
    const {
      title, company, url, status, salary, location, jobType,
      description, notes, userEmail, recruiterName, recruiterEmail,
      followUpDate, appliedDate, analysis, source,
    } = req.body;

    if (!title || !company || !url) {
      return res.status(400).json({ error: 'title, company, and url are required' });
    }

    const job = await Job.create({
      title, company, url,
      status: status || 'Applied',
      salary, location, jobType, description, notes,
      userEmail, recruiterName, recruiterEmail,
      followUpDate, appliedDate,
      platform: detectPlatform(url),
      analysis: analysis || {},
      source: source || 'manual',
      statusHistory: [{ status: status || 'Applied', note: 'Initial save', changedAt: new Date() }],
    });

    // Alert if analysis shows FAKE/SUSPICIOUS
    if (analysis?.verdict === 'FAKE' || analysis?.verdict === 'SUSPICIOUS') {
      await sendAnalysisAlertEmail(job);
    }

    res.status(201).json(job);
  } catch (err) { next(err); }
});

// PATCH /api/jobs/:id  — update job (partial update)
router.patch('/:id', async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const prevStatus = job.status;
    const newStatus  = req.body.status;

    // Apply updates
    Object.assign(job, req.body);

    // Track status history
    if (newStatus && newStatus !== prevStatus) {
      job.statusHistory.push({
        status:    newStatus,
        note:      req.body.statusNote || '',
        changedAt: new Date(),
      });
      // Send email notification
      await sendStatusEmail(job, newStatus, req.body.statusNote || '');
    }

    await job.save();
    res.json(job);
  } catch (err) { next(err); }
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await Job.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: 'Job deleted successfully' });
  } catch (err) { next(err); }
});

// POST /api/jobs/extension  — receive from Chrome extension
router.post('/extension', async (req, res, next) => {
  try {
    // Verify extension secret
    const secret = req.headers['x-extension-secret'];
    if (secret !== process.env.EXTENSION_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url, title, company, description, salary, location } = req.body;
    if (!url || !title) return res.status(400).json({ error: 'url and title required' });

    // Check if already tracked
    const existing = await Job.findOne({ url });
    if (existing) return res.json({ message: 'Already tracked', job: existing, duplicate: true });

    const job = await Job.create({
      url, title, company: company || 'Unknown',
      description, salary, location,
      status: 'Saved',
      platform: detectPlatform(url),
      source: 'extension',
      statusHistory: [{ status: 'Saved', note: 'Added via Chrome extension' }],
    });

    res.status(201).json({ job, duplicate: false });
  } catch (err) { next(err); }
});

module.exports = router;