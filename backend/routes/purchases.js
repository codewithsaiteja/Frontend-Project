const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, from_date, to_date, match_status } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = 'SELECT p.*, pr.name as party_name_resolved FROM purchase_invoices p LEFT JOIN parties pr ON p.party_id=pr.id WHERE p.business_id=?';
    const params = [business_id];
    if (from_date) { sql += ' AND p.invoice_date >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND p.invoice_date <= ?'; params.push(to_date); }
    if (match_status) { sql += ' AND p.match_status=?'; params.push(match_status); }
    sql += ' ORDER BY p.invoice_date DESC';
    res.json({ success: true, data: await dbAll(sql, params) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { business_id, invoice_number, invoice_date, party_id, party_gstin, taxable_value, cgst, sgst, igst, cess, itc_eligible } = req.body;
    if (!business_id || !invoice_number || !invoice_date) return res.status(400).json({ success: false, message: 'Required fields missing' });
    const total = parseFloat(((taxable_value||0)+(cgst||0)+(sgst||0)+(igst||0)+(cess||0)).toFixed(2));
    const r = await dbRun(`INSERT INTO purchase_invoices(business_id,invoice_number,invoice_date,party_id,party_gstin,taxable_value,cgst,sgst,igst,cess,total_amount,itc_eligible,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [business_id, invoice_number, invoice_date, party_id||null, party_gstin, taxable_value||0, cgst||0, sgst||0, igst||0, cess||0, total, itc_eligible??1, req.user.id]);
    res.json({ success: true, data: { id: r.lastID }, message: 'Purchase invoice created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { invoice_number, invoice_date, supplier_name, party_gstin, taxable_value, cgst, sgst, igst, cess, itc_eligible } = req.body;
    await dbRun(`UPDATE purchase_invoices SET invoice_number=?,invoice_date=?,supplier_name=?,party_gstin=?,taxable_value=?,cgst=?,sgst=?,igst=?,cess=?,total_amount=?,itc_eligible=?,updated_at=NOW() WHERE id=?`,
      [invoice_number, invoice_date, supplier_name, party_gstin, taxable_value, cgst, sgst, igst, cess||0, (parseFloat(taxable_value)+parseFloat(cgst)+parseFloat(sgst)+parseFloat(igst)+parseFloat(cess||0)).toFixed(2), itc_eligible?1:0, req.params.id]);
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  await dbRun('DELETE FROM purchase_invoices WHERE id=?', [req.params.id]);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
