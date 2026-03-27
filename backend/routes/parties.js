const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { validateGSTIN, STATE_CODES } = require('../utils/gst');
const { body } = require('express-validator');
const { validateReq } = require('../middleware/validate');

router.get('/', auth, async (req, res) => {
  try {
    const { business_id, type, search } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    let sql = 'SELECT * FROM parties WHERE business_id=?';
    const p = [business_id];
    if (type && type !== 'all') { sql += ' AND party_type IN (?,?)'; p.push(type, 'both'); }
    if (search) { sql += ' AND (name LIKE ? OR gstin LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY name';
    res.json({ success: true, data: await dbAll(sql, p) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, [
  body('business_id').notEmpty().withMessage('Business ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('party_type').isIn(['customer','vendor','both']).withMessage('Invalid party type'),
  body('gstin').optional({ checkFalsy: true }).custom(v => validateGSTIN(v)).withMessage('Invalid GSTIN format'),
  body('pan').optional({ checkFalsy: true }).isLength({ min: 10, max: 10 }).withMessage('PAN must be 10 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
  validateReq
], async (req, res) => {
  try {
    const { business_id, name, gstin, pan, email, phone, address, state_code, party_type, is_registered } = req.body;
    const r = await dbRun(`INSERT INTO parties(business_id,name,gstin,pan,email,phone,address,state_code,party_type,is_registered) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [business_id, name, gstin?.toUpperCase(), pan, email, phone, address, state_code, party_type, is_registered ?? 1]);
    res.json({ success: true, data: { id: r.lastID }, message: 'Party created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/validate/:gstin', auth, (req, res) => {
  const gstin = req.params.gstin.toUpperCase();
  const valid = validateGSTIN(gstin);
  if (!valid) return res.json({ success: false, valid: false, message: 'Invalid GSTIN format' });
  const stateCode = gstin.substring(0, 2);
  res.json({ success: true, valid: true, data: { gstin, stateCode, state: STATE_CODES[stateCode], pan: gstin.substring(2, 12) } });
});

router.get('/:id', auth, async (req, res) => {
  const p = await dbGet('SELECT * FROM parties WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: p });
});

router.put('/:id', auth, [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('party_type').optional().isIn(['customer','vendor','both']).withMessage('Invalid party type'),
  body('gstin').optional({ checkFalsy: true }).custom(v => validateGSTIN(v)).withMessage('Invalid GSTIN format'),
  body('pan').optional({ checkFalsy: true }).isLength({ min: 10, max: 10 }).withMessage('PAN must be 10 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
  validateReq
], async (req, res) => {
  try {
    const { name, gstin, pan, email, phone, address, state_code, party_type, is_registered } = req.body;
    await dbRun(`UPDATE parties SET name=?,gstin=?,pan=?,email=?,phone=?,address=?,state_code=?,party_type=?,is_registered=? WHERE id=?`,
      [name, gstin?.toUpperCase(), pan, email, phone, address, state_code, party_type, is_registered, req.params.id]);
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  await dbRun('DELETE FROM parties WHERE id=?', [req.params.id]);
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
