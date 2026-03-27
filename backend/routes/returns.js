const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, return_type, period } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = 'SELECT * FROM gst_returns WHERE business_id=?'; const params = [business_id];
    if (return_type) { sql += ' AND return_type=?'; params.push(return_type); }
    if (period) { sql += ' AND period=?'; params.push(period); }
    sql += ' ORDER BY period DESC';
    res.json({ success: true, data: await dbAll(sql, params) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/prepare', auth, requireRole('admin','accountant'), async (req, res) => {
  try {
    const { business_id, return_type, period } = req.body;
    if (!business_id || !return_type || !period) return res.status(400).json({ success: false, message: 'Required fields missing' });
    const m = period.substring(0,2), y = period.substring(2);
    const fromDate = `${y}-${m}-01`;
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    const toDate = `${y}-${m}-${lastDay}`;
    let data = {}, totals = {};

    if (return_type === 'GSTR1') {
      const sales = await dbAll(`SELECT * FROM invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND status='confirmed'`, [business_id, fromDate, toDate]);
      totals = sales.reduce((a,i)=>({ taxable:a.taxable+i.taxable_value, cgst:a.cgst+i.cgst, sgst:a.sgst+i.sgst, igst:a.igst+i.igst, cess:a.cess+i.cess }), {taxable:0,cgst:0,sgst:0,igst:0,cess:0});
      data = { b2b_invoices: sales.filter(i=>i.invoice_type==='B2B').length, b2c_invoices: sales.filter(i=>i.invoice_type==='B2C').length, total_invoices: sales.length, totals };
    } else if (return_type === 'GSTR3B') {
      const sales = await dbGet(`SELECT COALESCE(SUM(taxable_value),0) tv, COALESCE(SUM(cgst),0) cgst, COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst FROM invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND status='confirmed'`, [business_id, fromDate, toDate]);
      const purch = await dbGet(`SELECT COALESCE(SUM(cgst),0) cgst, COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst FROM purchase_invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND itc_eligible=1`, [business_id, fromDate, toDate]);
      const totalTax = (sales.cgst||0)+(sales.sgst||0)+(sales.igst||0);
      const totalITC = (purch.cgst||0)+(purch.sgst||0)+(purch.igst||0);
      totals = { taxable: sales.tv||0, cgst: sales.cgst||0, sgst: sales.sgst||0, igst: sales.igst||0, cess: 0 };
      data = { outward_supplies: sales, itc_available: purch, net_payable: Math.max(0,totalTax-totalITC), itc_claimed: totalITC };
    }

    const summary = { total_taxable:totals.taxable||0, total_cgst:totals.cgst||0, total_sgst:totals.sgst||0, total_igst:totals.igst||0, total_cess:totals.cess||0, itc_claimed:data.itc_claimed||0, net_liability:data.net_payable||0 };
    const existing = await dbGet('SELECT id FROM gst_returns WHERE business_id=? AND return_type=? AND period=?', [business_id, return_type, period]);
    if (existing) {
      await dbRun(`UPDATE gst_returns SET status='prepared',total_taxable=?,total_cgst=?,total_sgst=?,total_igst=?,total_cess=?,itc_claimed=?,net_liability=?,json_data=? WHERE id=?`,
        [summary.total_taxable, summary.total_cgst, summary.total_sgst, summary.total_igst, summary.total_cess, summary.itc_claimed, summary.net_liability, JSON.stringify(data), existing.id]);
    } else {
      await dbRun(`INSERT INTO gst_returns(business_id,return_type,period,status,total_taxable,total_cgst,total_sgst,total_igst,total_cess,itc_claimed,net_liability,json_data,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [business_id, return_type, period, 'prepared', summary.total_taxable, summary.total_cgst, summary.total_sgst, summary.total_igst, summary.total_cess, summary.itc_claimed, summary.net_liability, JSON.stringify(data), req.user.id]);
    }
    res.json({ success: true, data: { ...summary, details: data }, message: 'Return prepared successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/file', auth, requireRole('admin','accountant'), async (req, res) => {
  const arn = `AA${Date.now()}`;
  await dbRun(`UPDATE gst_returns SET status='filed', arn=?, filed_at=NOW() WHERE id=?`, [arn, req.params.id]);
  res.json({ success: true, message: 'Return filed', data: { arn } });
});

module.exports = router;
