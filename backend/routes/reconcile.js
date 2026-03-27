const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, period } = req.query;
    if (!business_id || !period) return res.status(400).json({ success: false, message: 'business_id and period required' });
    const m = period.substring(0,2), y = period.substring(2);
    const from = `${y}-${m}-01`, to = `${y}-${m}-${new Date(parseInt(y),parseInt(m),0).getDate()}`;
    const purchases = await dbAll(`SELECT p.*, pr.name as vendor FROM purchase_invoices p LEFT JOIN parties pr ON p.party_id=pr.id WHERE p.business_id=? AND p.invoice_date BETWEEN ? AND ?`, [business_id, from, to]);
    const matched = purchases.filter(p=>p.match_status==='matched').length;
    const mismatched = purchases.filter(p=>p.match_status==='mismatch').length;
    const pending = purchases.filter(p=>p.match_status==='pending');
    const totalITC = purchases.filter(p=>p.itc_eligible).reduce((s,p)=>s+(p.cgst+p.sgst+p.igst),0);
    res.json({ success: true, data: { purchases, matched, mismatched, pending: pending.length, total_itc_eligible: parseFloat(totalITC.toFixed(2)), mismatched_invoices: purchases.filter(p=>p.match_status==='mismatch'), pending_invoices: pending } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/match', auth, async (req, res) => {
  try {
    const { ids, status } = req.body;
    for (const id of ids) await dbRun('UPDATE purchase_invoices SET match_status=?, gstr2b_matched=1 WHERE id=?', [status, id]);
    res.json({ success: true, message: `${ids.length} invoices updated` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
