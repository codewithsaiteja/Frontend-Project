const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const { validateGSTIN } = require('../utils/gst');
const { generateComplianceCalendar } = require('../utils/compliance');
const { body } = require('express-validator');
const { validateReq } = require('../middleware/validate');

router.get('/', auth, async (req, res) => {
  try {
    const rows = req.user.role === 'admin'
      ? await dbAll('SELECT * FROM businesses WHERE active=1')
      : await dbAll(`SELECT b.* FROM businesses b JOIN user_businesses ub ON b.id=ub.business_id WHERE ub.user_id=? AND b.active=1`, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireRole('admin'), [
  body('gstin').trim().notEmpty().withMessage('GSTIN is required')
    .custom(v => validateGSTIN(v)).withMessage('Invalid GSTIN format'),
  body('legal_name').trim().notEmpty().withMessage('Legal name is required'),
  body('state_code').trim().isLength({ min: 2, max: 2 }).withMessage('State code must be 2 characters'),
  body('pan').optional({ checkFalsy: true }).isLength({ min: 10, max: 10 }).withMessage('PAN must be 10 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
  validateReq
], async (req, res) => {
  try {
    const { gstin, legal_name, trade_name, address, state_code, pan, email, phone, registration_type } = req.body;
    const r = await dbRun(`INSERT INTO businesses(gstin,legal_name,trade_name,address,state_code,pan,email,phone,registration_type) VALUES(?,?,?,?,?,?,?,?,?)`,
      [gstin.toUpperCase(), legal_name, trade_name, address, state_code, pan, email, phone, registration_type || 'Regular']);
    await dbRun('INSERT OR IGNORE INTO user_businesses(user_id,business_id) VALUES(?,?)', [req.user.id, r.lastID]);
    try {
      const now = new Date();
      const fy = now.getMonth() >= 3 ? `${now.getFullYear()}-${(now.getFullYear()+1).toString().slice(2)}` : `${now.getFullYear()-1}-${now.getFullYear().toString().slice(2)}`;
      await generateComplianceCalendar(r.lastID, fy);
    } catch(e) {}
    res.json({ success: true, data: { id: r.lastID }, message: 'Business created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id', auth, async (req, res) => {
  const b = await dbGet('SELECT * FROM businesses WHERE id=?', [req.params.id]);
  if (!b) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: b });
});

router.put('/:id', auth, requireRole('admin','accountant'), [
  body('legal_name').optional().trim().notEmpty().withMessage('Legal name cannot be empty'),
  body('state_code').optional().trim().isLength({ min: 2, max: 2 }).withMessage('State code must be 2 characters'),
  body('pan').optional({ checkFalsy: true }).isLength({ min: 10, max: 10 }).withMessage('PAN must be 10 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
  validateReq
], async (req, res) => {
  try {
    const { legal_name, trade_name, address, state_code, pan, email, phone } = req.body;
    await dbRun(`UPDATE businesses SET legal_name=?,trade_name=?,address=?,state_code=?,pan=?,email=?,phone=? WHERE id=?`,
      [legal_name, trade_name, address, state_code, pan, email, phone, req.params.id]);
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
