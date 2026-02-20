const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  // Core info
  title:    { type: String, required: true, trim: true },
  company:  { type: String, required: true, trim: true },
  url:      { type: String, required: true, trim: true },
  platform: { type: String, default: 'Other' },

  // Application details
  status: {
    type: String,
    enum: ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Ghosted'],
    default: 'Applied',
  },
  salary:      { type: String, default: '' },
  location:    { type: String, default: '' },
  jobType:     { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance', ''], default: '' },
  description: { type: String, default: '' },  // pasted JD
  notes:       { type: String, default: '' },
  appliedDate: { type: Date, default: Date.now },
  followUpDate:{ type: Date },

  // Contact
  recruiterName:  { type: String, default: '' },
  recruiterEmail: { type: String, default: '' },
  userEmail:      { type: String, default: '' },  // for notifications

  // AI Analysis
  analysis: {
    verdict:         { type: String, enum: ['REAL', 'FAKE', 'SUSPICIOUS', 'UNKNOWN'], default: 'UNKNOWN' },
    confidence:      { type: Number, default: 0 },
    riskScore:       { type: Number, default: 0 },
    summary:         { type: String, default: '' },
    redFlags:        [String],
    positiveSignals: [String],
    recommendation:  { type: String, default: '' },
    analyzedAt:      { type: Date },
  },

  // Status history for timeline
  statusHistory: [{
    status:    String,
    note:      String,
    changedAt: { type: Date, default: Date.now },
  }],

  // Source: manual | extension | email
  source: { type: String, default: 'manual' },

}, { timestamps: true });

// Auto-detect platform from URL
jobSchema.pre('save', function (next) {
  if (this.isModified('url')) {
    const url = this.url.toLowerCase();
    const map = {
      'linkedin.com':       'LinkedIn',
      'indeed.com':         'Indeed',
      'glassdoor.com':      'Glassdoor',
      'naukri.com':         'Naukri',
      'monster.com':        'Monster',
      'ziprecruiter.com':   'ZipRecruiter',
      'dice.com':           'Dice',
      'remoteok.com':       'RemoteOK',
      'wellfound.com':      'Wellfound',
      'angel.co':           'AngelList',
      'simplyhired.com':    'SimplyHired',
      'greenhouse.io':      'Greenhouse',
      'lever.co':           'Lever',
      'workday.com':        'Workday',
      'myworkdayjobs.com':  'Workday',
      'smartrecruiters.com':'SmartRecruiters',
      'careerbuilder.com':  'CareerBuilder',
    };
    for (const [domain, name] of Object.entries(map)) {
      if (url.includes(domain)) { this.platform = name; break; }
    }
  }
  next();
});

module.exports = mongoose.model('Job', jobSchema);