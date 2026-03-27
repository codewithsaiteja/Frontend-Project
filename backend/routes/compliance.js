const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, status, year } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = 'SELECT * FROM compliance_calendar WHERE business_id=?'; const params = [business_id];
    if (status) { sql += ' AND status=?'; params.push(status); }
    if (year) { sql += ' AND due_date LIKE ?'; params.push(`${year}%`); }
    sql += ' ORDER BY due_date';
    const rows = await dbAll(sql, params);
    const today = new Date().toISOString().split('T')[0];
    const upcoming = rows.filter(r=>r.due_date>=today&&r.status==='pending').slice(0,5);
    res.json({ success: true, data: rows, upcoming });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/filed', auth, async (req, res) => {
  await dbRun(`UPDATE compliance_calendar SET status='filed', filed_date=CURDATE() WHERE id=?`, [req.params.id]);
  res.json({ success: true, message: 'Marked as filed' });
});

module.exports = router;
