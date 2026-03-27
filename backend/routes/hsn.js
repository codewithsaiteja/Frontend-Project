const router = require('express').Router();
const { dbGet, dbAll } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { search, type } = req.query;
    if (!search || search.length < 2) return res.json({ success: true, data: [] });
    const q = `%${search}%`;
    let sql = 'SELECT * FROM hsn_sac_codes WHERE (code LIKE ? OR description LIKE ?)';
    const params = [q, q];
    if (type) { sql += ' AND type=?'; params.push(type.toUpperCase()); }
    sql += ' ORDER BY CASE WHEN code LIKE ? THEN 0 ELSE 1 END, code LIMIT 20';
    params.push(`${search}%`);
    res.json({ success: true, data: await dbAll(sql, params) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/rate/:code', auth, async (req, res) => {
  const r = await dbGet('SELECT * FROM hsn_sac_codes WHERE code=?', [req.params.code]);
  res.json({ success: !!r, data: r || null });
});

module.exports = router;
