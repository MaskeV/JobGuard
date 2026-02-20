const router = require('express').Router();
const Job    = require('../models/job');

// GET /api/analytics
router.get('/', async (req, res, next) => {
  try {
    const [
      total,
      byStatus,
      byPlatform,
      byVerdict,
      byMonth,
      avgRisk,
      recentActivity,
    ] = await Promise.all([

      Job.countDocuments(),

      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

      Job.aggregate([{ $group: { _id: '$platform', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),

      Job.aggregate([{ $group: { _id: '$analysis.verdict', count: { $sum: 1 } } }]),

      Job.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 12 },
      ]),

      Job.aggregate([
        { $match: { 'analysis.riskScore': { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$analysis.riskScore' } } },
      ]),

      Job.find().sort('-updatedAt').limit(5).lean(),
    ]);

    const statusMap   = Object.fromEntries(byStatus.map(d => [d._id,   d.count]));
    const platformMap = Object.fromEntries(byPlatform.map(d => [d._id, d.count]));
    const verdictMap  = Object.fromEntries(byVerdict.map(d => [d._id,  d.count]));

    const interviews = statusMap['Interview'] || 0;
    const offers     = statusMap['Offer']     || 0;
    const applied    = total - (statusMap['Saved'] || 0);

    res.json({
      total,
      applied,
      interviews,
      offers,
      responseRate: applied > 0 ? Math.round(((interviews + offers) / applied) * 100) : 0,
      avgRiskScore: avgRisk[0]?.avg ? Math.round(avgRisk[0].avg) : 0,
      byStatus:   statusMap,
      byPlatform: platformMap,
      byVerdict:  verdictMap,
      byMonth:    byMonth.map(d => ({ month: d._id, count: d.count })),
      recentActivity,
    });
  } catch (err) { next(err); }
});

module.exports = router;