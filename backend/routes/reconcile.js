const router = require('express').Router();
const { Purchase, Party } = require('../utils/db');
const { auth } = require('../middleware/auth');
const mongoose = require('mongoose');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, period } = req.query;
    if (!business_id || !period) return res.status(400).json({ success: false, message: 'business_id and period required' });
    const m = period.substring(0,2), y = period.substring(2);
    const from = `${y}-${m}-01`, to = `${y}-${m}-${String(new Date(parseInt(y),parseInt(m),0).getDate()).padStart(2,'0')}`;
    const purchases = await Purchase.find({ business_id, invoice_date: { $gte: from, $lte: to } }).lean();
    for (const p of purchases) {
      if (p.party_id) { const party = await Party.findById(p.party_id).select('name').lean(); p.vendor = party?.name; }
    }
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
    await Purchase.updateMany({ _id: { $in: ids } }, { match_status: status, gstr2b_matched: 1 });
    res.json({ success: true, message: `${ids.length} invoices updated` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
