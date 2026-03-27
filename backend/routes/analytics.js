const router = require('express').Router();
const { dbGet, dbAll } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/dashboard', auth, async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1;
    const fy = `${fyStart}-${fyStart+1}`;
    const fromDate = `${fyStart}-04-01`, toDate = `${fyStart+1}-03-31`;

    const summary = await dbGet(`SELECT COUNT(*) total_invoices, COALESCE(SUM(total_amount),0) total_sales, COALESCE(SUM(taxable_value),0) total_taxable, COALESCE(SUM(cgst+sgst+igst),0) total_tax, COALESCE(SUM(cess),0) total_cess FROM invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND status != 'cancelled'`, [business_id, fromDate, toDate]);
    const itcSummary = await dbGet(`SELECT COALESCE(SUM(cgst+sgst+igst),0) itc_eligible FROM purchase_invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND itc_eligible=1`, [business_id, fromDate, toDate]);
    const monthly = await dbAll(`SELECT DATE_FORMAT(invoice_date, '%m') m, DATE_FORMAT(invoice_date, '%Y') y, COALESCE(SUM(taxable_value),0) taxable, COALESCE(SUM(cgst+sgst+igst),0) tax, COUNT(*) count FROM invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY y, m ORDER BY y, m`, [business_id, fromDate, toDate]);
    const topCustomers = await dbAll(`SELECT party_name, COALESCE(SUM(total_amount),0) total, COUNT(*) invoices FROM invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY party_name ORDER BY total DESC LIMIT 10`, [business_id, fromDate, toDate]);
    const bySupplyType = await dbAll(`SELECT supply_type, COALESCE(SUM(taxable_value),0) taxable, COALESCE(SUM(cgst),0) cgst, COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst FROM invoices WHERE business_id=? AND invoice_date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY supply_type`, [business_id, fromDate, toDate]);
    const pendingComp = await dbGet(`SELECT COUNT(*) c FROM compliance_calendar WHERE business_id=? AND status='pending' AND due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`, [business_id]);
    const overdueComp = await dbGet(`SELECT COUNT(*) c FROM compliance_calendar WHERE business_id=? AND status='overdue'`, [business_id]);

    res.json({ success: true, data: {
      summary: { ...summary, itc_eligible: itcSummary?.itc_eligible||0, net_liability: Math.max(0,(summary?.total_tax||0)-(itcSummary?.itc_eligible||0)), financial_year: fy },
      monthly, top_customers: topCustomers, by_supply_type: bySupplyType,
      compliance: { pending_upcoming: pendingComp?.c||0, overdue: overdueComp?.c||0 }
    }});
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/tax-trend', auth, async (req, res) => {
  try {
    const { business_id, months = 12 } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const rows = await dbAll(`SELECT DATE_FORMAT(invoice_date, '%m/%Y') period, COALESCE(SUM(cgst),0) cgst, COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst, COALESCE(SUM(taxable_value),0) taxable FROM invoices WHERE business_id=? AND status != 'cancelled' AND invoice_date >= DATE_SUB(CURDATE(), INTERVAL ${parseInt(months)} MONTH) GROUP BY period ORDER BY invoice_date`, [business_id]);
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/itc-summary', auth, async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const r = await dbGet(`SELECT COALESCE(SUM(cgst),0) cgst, COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst, COALESCE(SUM(cess),0) cess, COUNT(*) bills FROM purchase_invoices WHERE business_id=? AND itc_eligible=1`, [business_id]);
    res.json({ success: true, data: r });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
