const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, period, entry_type } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = `SELECT t.*, p.name as party_name FROM tds_tcs_entries t LEFT JOIN parties p ON t.party_id=p.id WHERE t.business_id=?`;
    const params = [business_id];
    if (period) { sql += ' AND t.period=?'; params.push(period); }
    if (entry_type) { sql += ' AND t.entry_type=?'; params.push(entry_type); }
    sql += ' ORDER BY t.created_at DESC';
    res.json({ success: true, data: await dbAll(sql, params) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { business_id, entry_type, party_id, invoice_id, section, base_amount, rate, period } = req.body;
    if (!business_id || !entry_type || !base_amount || !rate || !period) return res.status(400).json({ success: false, message: 'Required fields missing' });
    const amount = parseFloat(((base_amount * rate) / 100).toFixed(2));
    const r = await dbRun(`INSERT INTO tds_tcs_entries(business_id,entry_type,party_id,invoice_id,section,base_amount,rate,amount,period) VALUES(?,?,?,?,?,?,?,?,?)`,
      [business_id, entry_type, party_id||null, invoice_id||null, section, base_amount, rate, amount, period]);
    res.json({ success: true, data: { id: r.lastID, amount }, message: `${entry_type} entry created` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/summary', auth, async (req, res) => {
  try {
    const { business_id, period } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = `SELECT entry_type, section, COUNT(*) entries, SUM(base_amount) base, SUM(amount) tds_tcs FROM tds_tcs_entries WHERE business_id=?`;
    const params = [business_id];
    if (period) { sql += ' AND period=?'; params.push(period); }
    sql += ' GROUP BY entry_type, section';
    res.json({ success: true, data: await dbAll(sql, params) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  await dbRun('DELETE FROM tds_tcs_entries WHERE id=?', [req.params.id]);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
