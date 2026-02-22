require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');

const analyzeRoutes = require('./routes/analyze');
const jobRoutes     = require('./routes/jobs');
const analyticsRoutes = require('./routes/analytics');
const emailRoutes   = require('./routes/EmailRoutes'); // NEW
const searchRoutes  = require('./routes/searchRoutes'); // NEW - Job 



const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security & Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: [process.env.CLIENT_URL || 'http://localhost:3000', 'chrome-extension://*'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'Too many requests' });
const analyzeLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Analyze limit: 10/min' });
const emailLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: 'Email scan limit: 5/min' }); // NEW
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Search limit: 10/min' }); // NEW


app.use('/api/', limiter);
app.use('/api/analyze', analyzeLimiter);
app.use('/api/email', emailLimiter); // NEW
app.use('/api/search', searchLimiter); // NEW
// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/analyze',   analyzeRoutes);
app.use('/api/jobs',      jobRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/email',     emailRoutes); // NEW
app.use('/api/search',    searchRoutes); 




app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── MongoDB + Server Start ────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });