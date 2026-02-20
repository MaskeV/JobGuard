const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const STATUS_COLORS = {
  Applied:   '#3b82f6',
  Saved:     '#8b5cf6',
  Interview: '#f59e0b',
  Offer:     '#10b981',
  Rejected:  '#ef4444',
  Ghosted:   '#6b7280',
};

const STATUS_MESSAGES = {
  Applied:   'Your application has been submitted.',
  Saved:     'Job saved to your tracker for later.',
  Interview: '🎉 Interview scheduled! Time to prepare.',
  Offer:     '🏆 Congratulations — you received an offer!',
  Rejected:  'Application was not successful this time. Keep going!',
  Ghosted:   'No response received. Consider following up.',
};

function buildEmailHTML(job, newStatus, note) {
  const color = STATUS_COLORS[newStatus] || '#3b82f6';
  const message = STATUS_MESSAGES[newStatus] || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #060d1a; font-family: 'DM Mono', monospace; }
  </style>
</head>
<body>
  <div style="max-width:580px;margin:32px auto;background:#0f172a;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,0.1)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:28px 32px;border-bottom:1px solid rgba(148,163,184,0.08)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#38bdf8,#818cf8);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px">🛡️</div>
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#e2e8f0;letter-spacing:-0.5px">JobGuard</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px">Application Status Update</div>
        </div>
      </div>
    </div>

    <!-- Status Banner -->
    <div style="padding:28px 32px 0">
      <div style="background:${color}18;border:1px solid ${color}40;border-radius:14px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:11px;color:${color};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-weight:500">Status Updated</div>
        <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:${color};letter-spacing:-0.5px">${newStatus}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:6px">${message}</div>
      </div>

      <!-- Job Details -->
      <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid rgba(148,163,184,0.08)">
        <div style="font-size:16px;font-weight:500;color:#e2e8f0;margin-bottom:4px">${job.title}</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:12px">${job.company} · ${job.platform}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${job.salary ? `<span style="font-size:11px;background:rgba(148,163,184,0.08);color:#94a3b8;padding:3px 10px;border-radius:6px">💰 ${job.salary}</span>` : ''}
          ${job.location ? `<span style="font-size:11px;background:rgba(148,163,184,0.08);color:#94a3b8;padding:3px 10px;border-radius:6px">📍 ${job.location}</span>` : ''}
        </div>
      </div>

      ${note ? `
      <div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="font-size:11px;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Note</div>
        <div style="font-size:13px;color:#94a3b8;line-height:1.5">${note}</div>
      </div>` : ''}

      <!-- CTA -->
      <div style="text-align:center;padding-bottom:32px">
        <a href="${job.url}" target="_blank"
           style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#818cf8);color:#060d1a;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:600">
          View Job Listing →
        </a>
        <div style="font-size:11px;color:#475569;margin-top:16px">
          You're receiving this because you track this job on JobGuard.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function sendStatusEmail(job, newStatus, note = '') {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('📧 Email not configured — skipping notification');
    return false;
  }
  if (!job.userEmail) {
    console.log('📧 No user email for this job — skipping');
    return false;
  }

  const subject = `${newStatus === 'Offer' ? '🏆' : newStatus === 'Interview' ? '🎯' : '📋'} ${job.title} at ${job.company} → ${newStatus}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"JobGuard" <${process.env.EMAIL_USER}>`,
      to:   job.userEmail,
      subject,
      html: buildEmailHTML(job, newStatus, note),
    });
    console.log(`✅ Email sent to ${job.userEmail} for "${job.title}" → ${newStatus}`);
    return true;
  } catch (err) {
    console.error('❌ Email error:', err.message);
    return false;
  }
}

async function sendAnalysisAlertEmail(job) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !job.userEmail) return false;
  if (job.analysis?.verdict !== 'FAKE' && job.analysis?.verdict !== 'SUSPICIOUS') return false;

  const isFake = job.analysis.verdict === 'FAKE';
  const color  = isFake ? '#ef4444' : '#f59e0b';

  const html = `<!DOCTYPE html>
<html><body style="background:#060d1a;font-family:'DM Mono',monospace">
<div style="max-width:580px;margin:32px auto;background:#0f172a;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,0.1)">
  <div style="padding:28px 32px">
    <div style="background:${color}18;border:1px solid ${color}40;border-radius:14px;padding:20px;margin-bottom:20px">
      <div style="font-size:22px;margin-bottom:8px">${isFake ? '🚨 SCAM ALERT' : '⚠️ SUSPICIOUS LISTING'}</div>
      <div style="font-size:13px;color:#94a3b8">Risk Score: ${job.analysis.riskScore}/100 · Confidence: ${job.analysis.confidence}%</div>
    </div>
    <div style="font-size:16px;color:#e2e8f0;margin-bottom:4px">${job.title}</div>
    <div style="font-size:13px;color:#64748b;margin-bottom:16px">${job.company}</div>
    <div style="font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:16px">${job.analysis.summary}</div>
    ${job.analysis.redFlags?.length ? `
    <div style="font-size:11px;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Red Flags</div>
    ${job.analysis.redFlags.map(f => `<div style="font-size:12px;color:#94a3b8;padding:4px 0">🚩 ${f}</div>`).join('')}
    ` : ''}
    <div style="margin-top:16px;font-size:13px;color:${color}">${job.analysis.recommendation}</div>
  </div>
</div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to:   job.userEmail,
      subject: `🚨 JobGuard Alert: ${isFake ? 'Fake' : 'Suspicious'} listing — ${job.title} at ${job.company}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;
  }
}

module.exports = { sendStatusEmail, sendAnalysisAlertEmail };