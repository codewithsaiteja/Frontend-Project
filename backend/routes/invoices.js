const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, requireRole, auditLog } = require('../middleware/auth');
const { calcInvoiceTotals, generateIRN, getFinancialYear } = require('../utils/gst');
const { body } = require('express-validator');
const { validateReq } = require('../middleware/validate');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, status, from_date, to_date, invoice_type, page = 1, limit = 30 } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = `SELECT i.*, p.name as party_name_resolved FROM invoices i LEFT JOIN parties p ON i.party_id=p.id WHERE i.business_id=?`;
    const params = [business_id];
    if (status) { sql += ' AND i.status=?'; params.push(status); }
    if (from_date) { sql += ' AND i.invoice_date >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND i.invoice_date <= ?'; params.push(to_date); }
    if (invoice_type) { sql += ' AND i.invoice_type=?'; params.push(invoice_type); }
    sql += ' ORDER BY i.invoice_date DESC, i.id DESC';
    const countRow = await dbGet(sql.replace('SELECT i.*, p.name as party_name_resolved', 'SELECT COUNT(*) as c'), params);
    const total = countRow?.c || 0;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
    const rows = await dbAll(sql, params);
    res.json({ success: true, data: rows, total, page: parseInt(page), pages: Math.ceil(total/parseInt(limit)) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireRole('admin','accountant'), auditLog('CREATE_INVOICE','invoice'), [
  body('business_id').notEmpty().withMessage('Business ID is required'),
  body('invoice_number').trim().notEmpty().withMessage('Invoice number is required'),
  body('invoice_date').isISO8601().withMessage('Valid invoice date is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  validateReq
], async (req, res) => {
  try {
    const { business_id, invoice_number, invoice_date, invoice_type, supply_type, party_id, party_name, party_gstin, party_state_code, place_of_supply, reverse_charge, items, notes, tds_amount, tcs_amount } = req.body;
    const business = await dbGet('SELECT * FROM businesses WHERE id=?', [business_id]);
    if (!business) return res.status(404).json({ success: false, message: 'Business not found' });
    const totals = calcInvoiceTotals(items, supply_type, business.state_code, party_state_code);
    const r = await dbRun(`INSERT INTO invoices(business_id,invoice_number,invoice_date,invoice_type,supply_type,party_id,party_name,party_gstin,party_state_code,place_of_supply,reverse_charge,taxable_value,cgst,sgst,igst,cess,total_amount,tds_amount,tcs_amount,notes,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [business_id, invoice_number, invoice_date, invoice_type||'B2B', supply_type||'intra', party_id||null, party_name, party_gstin, party_state_code, place_of_supply||party_state_code, reverse_charge?1:0, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.cess, totals.total, tds_amount||0, tcs_amount||0, notes, 'draft', req.user.id]);
    for (const item of items) {
      await dbRun(`INSERT INTO invoice_items(invoice_id,description,hsn_sac,uom,quantity,unit_price,discount,taxable_value,gst_rate,cgst_rate,sgst_rate,igst_rate,cgst,sgst,igst,cess_rate,cess,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [r.lastID, item.description, item.hsn_sac, item.uom, item.quantity, item.unit_price, item.discount||0, item.taxable_value, item.gst_rate, item.cgst_rate||0, item.sgst_rate||0, item.igst_rate||0, item.cgst, item.sgst, item.igst, item.cess_rate||0, item.cess||0, item.total]);
    }
    res.json({ success: true, data: { id: r.lastID, ...totals }, message: 'Invoice created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const inv = await dbGet('SELECT i.*, p.name as party_resolved FROM invoices i LEFT JOIN parties p ON i.party_id=p.id WHERE i.id=?', [req.params.id]);
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    const items = await dbAll('SELECT * FROM invoice_items WHERE invoice_id=?', [req.params.id]);
    res.json({ success: true, data: { ...inv, items } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', auth, requireRole('admin','accountant'), [
  body('invoice_date').optional().isISO8601().withMessage('Valid invoice date is required'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  validateReq
], async (req, res) => {
  try {
    const inv = await dbGet('SELECT * FROM invoices WHERE id=?', [req.params.id]);
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (inv.status === 'cancelled') return res.status(400).json({ success: false, message: 'Cannot edit cancelled invoice' });
    const { invoice_date, party_id, party_name, party_gstin, party_state_code, place_of_supply, items, notes, tds_amount, tcs_amount, supply_type } = req.body;
    const business = await dbGet('SELECT * FROM businesses WHERE id=?', [inv.business_id]);
    const totals = calcInvoiceTotals(items || [], supply_type || inv.supply_type, business.state_code, party_state_code || inv.party_state_code);
    await dbRun(`UPDATE invoices SET invoice_date=?,party_id=?,party_name=?,party_gstin=?,party_state_code=?,place_of_supply=?,taxable_value=?,cgst=?,sgst=?,igst=?,cess=?,total_amount=?,tds_amount=?,tcs_amount=?,notes=?,updated_at=NOW() WHERE id=?`,
      [invoice_date||inv.invoice_date, party_id||inv.party_id, party_name||inv.party_name, party_gstin||inv.party_gstin, party_state_code||inv.party_state_code, place_of_supply||inv.place_of_supply, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.cess, totals.total, tds_amount??inv.tds_amount, tcs_amount??inv.tcs_amount, notes??inv.notes, req.params.id]);
    if (items) {
      await dbRun('DELETE FROM invoice_items WHERE invoice_id=?', [req.params.id]);
      for (const item of items) {
        await dbRun(`INSERT INTO invoice_items(invoice_id,description,hsn_sac,uom,quantity,unit_price,discount,taxable_value,gst_rate,cgst_rate,sgst_rate,igst_rate,cgst,sgst,igst,cess_rate,cess,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.params.id, item.description, item.hsn_sac, item.uom, item.quantity, item.unit_price, item.discount||0, item.taxable_value, item.gst_rate, item.cgst_rate||0, item.sgst_rate||0, item.igst_rate||0, item.cgst, item.sgst, item.igst, item.cess_rate||0, item.cess||0, item.total]);
      }
    }
    res.json({ success: true, message: 'Invoice updated', data: totals });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/confirm', auth, requireRole('admin','accountant'), async (req, res) => {
  try {
    const inv = await dbGet('SELECT * FROM invoices WHERE id=?', [req.params.id]);
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    const business = await dbGet('SELECT * FROM businesses WHERE id=?', [inv.business_id]);
    const irn = generateIRN(business.gstin, inv.invoice_number, getFinancialYear(inv.invoice_date));
    await dbRun(`UPDATE invoices SET status='confirmed', irn=?, ack_no=?, ack_date=NOW(), updated_at=NOW() WHERE id=?`,
      [irn, `ACK${Date.now()}`, req.params.id]);
    res.json({ success: true, message: 'Invoice confirmed', data: { irn } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id/cancel', auth, requireRole('admin','accountant'), async (req, res) => {
  await dbRun(`UPDATE invoices SET status='cancelled', updated_at=NOW() WHERE id=?`, [req.params.id]);
  res.json({ success: true, message: 'Invoice cancelled' });
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  const inv = await dbGet('SELECT * FROM invoices WHERE id=?', [req.params.id]);
  if (inv?.status === 'confirmed') return res.status(400).json({ success: false, message: 'Cannot delete confirmed invoice. Cancel first.' });
  await dbRun('DELETE FROM invoices WHERE id=?', [req.params.id]);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
