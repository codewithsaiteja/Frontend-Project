const router = require('express').Router();
const { Business, UserBusiness } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const { validateGSTIN } = require('../utils/gst');
const { generateComplianceCalendar } = require('../utils/compliance');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

function normBiz(b) { return { ...b, id: b._id }; }

router.get('/', auth, async (req, res) => {
  try {
    let businesses;
    if (req.user.role === 'admin') {
      businesses = await Business.find({ active: 1 }).lean();
    } else {
      const links = await UserBusiness.find({ user_id: req.user._id });
      const ids = links.map(l => l.business_id);
      businesses = await Business.find({ _id: { $in: ids }, active: 1 }).lean();
    }
    res.json({ success: true, data: businesses.map(normBiz) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', auth, requireRole('admin'), [
  body('gstin').trim().notEmpty().custom(v => validateGSTIN(v) || (() => { throw new Error('Invalid GSTIN'); })()),
  body('legal_name').trim().notEmpty(),
  body('state_code').trim().isLength({ min: 2, max: 2 }),
  validate
], async (req, res) => {
  try {
    const { gstin, legal_name, trade_name, address, state_code, pan, email, phone, registration_type } = req.body;
    const biz = await Business.create({ gstin: gstin.toUpperCase(), legal_name, trade_name, address, state_code, pan, email, phone, registration_type: registration_type || 'Regular' });
    await UserBusiness.create({ user_id: req.user._id, business_id: biz._id });
    try {
      const now = new Date();
      const fy = now.getMonth() >= 3 ? `${now.getFullYear()}-${(now.getFullYear()+1).toString().slice(2)}` : `${now.getFullYear()-1}-${now.getFullYear().toString().slice(2)}`;
      await generateComplianceCalendar(biz._id, fy);
    } catch(e) {}
    res.json({ success: true, data: { id: biz._id }, message: 'Business created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id', auth, async (req, res) => {
  const b = await Business.findById(req.params.id).lean();
  if (!b) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: normBiz(b) });
});

router.put('/:id', auth, requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const { legal_name, trade_name, address, state_code, pan, email, phone } = req.body;
    await Business.findByIdAndUpdate(req.params.id, { legal_name, trade_name, address, state_code, pan, email, phone });
    res.json({ success: true, message: 'Updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
