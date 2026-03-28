const router = require('express').Router();
const { Compliance } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, status, year } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (status) filter.status = status;
    if (year) filter.due_date = { $regex: `^${year}` };
    const rows = await Compliance.find(filter).sort({ due_date: 1 }).lean();
    const today = new Date().toISOString().split('T')[0];
    const upcoming = rows.filter(r => r.due_date >= today && r.status === 'pending').slice(0, 5);
    res.json({ success: true, data: rows, upcoming });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/filed', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  await Compliance.findByIdAndUpdate(req.params.id, { status: 'filed', filed_date: today });
  res.json({ success: true, message: 'Marked as filed' });
});

module.exports = router;
