const router = require('express').Router();
const Job = require('../models/job');
const { importApplicationsFromEmail, scanEmails } = require('../services/emailService');

// POST /api/email/scan
// Body: { email, password, daysBack?, preview? }
// Scans emails and returns preview (or imports if preview=false)
router.post('/scan', async (req, res, next) => {
  try {
    const { email, password, daysBack = 30, preview = true } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and app password are required' });
    }

    if (preview) {
      // Just preview - don't import
      console.log('📧 Preview mode - scanning emails...');
      const applications = await scanEmails({ email, password, daysBack, limit: 50 });
      
      return res.json({
        preview: true,
        count: applications.length,
        applications: applications.map(app => ({
          subject: app.subject,
          status: app.status,
          title: app.title,
          company: app.company,
          url: app.urls[0],
          receivedDate: app.receivedDate,
          emailFrom: app.emailFrom,
        })),
      });
    }

    // Full import with AI analysis
    console.log('📧 Full import mode - importing applications...');
    const result = await importApplicationsFromEmail(Job, {
      email,
      password,
      daysBack,
      analyzeWithAI: true,
    });

    res.json({
      preview: false,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      applications: result.applications,
    });

  } catch (err) {
    console.error('Email scan error:', err.message);
    
    if (err.message.includes('Invalid credentials') || err.message.includes('AUTHENTICATIONFAILED')) {
      return res.status(401).json({ 
        error: 'Invalid email or app password. Make sure you are using a Gmail App Password, not your regular password.',
        hint: 'Generate an app password at: https://myaccount.google.com/apppasswords'
      });
    }
    
    res.status(500).json({ 
      error: err.message,
      hint: 'Make sure IMAP is enabled in your Gmail settings'
    });
  }
});

// GET /api/email/status
// Check email import status and settings
router.get('/status', async (req, res) => {
  try {
    const emailImportedCount = await Job.countDocuments({ source: 'email' });
    
    res.json({
      emailImportedCount,
      imapEnabled: true,
      supportedProviders: ['Gmail'],
      instructions: {
        step1: 'Enable 2-Step Verification in your Google Account',
        step2: 'Generate an App Password at https://myaccount.google.com/apppasswords',
        step3: 'Use your email and the 16-character app password (not your regular password)',
        step4: 'Scan emails from the past 30 days',
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;