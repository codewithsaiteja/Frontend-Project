const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Business, UserBusiness } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

router.post('/login', [
  body('email').trim().isEmail(),
  body('password').notEmpty(),
  validate
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase(), active: 1 });
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'gst_secret', { expiresIn: '7d' });
    const ubLinks = await UserBusiness.find({ user_id: user._id });
    const bizIds = ubLinks.map(u => u.business_id);
    const businesses = await Business.find({ _id: { $in: bizIds }, active: 1 }).lean();
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role }, businesses: businesses.map(b => ({ ...b, id: b._id })) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/me', auth, async (req, res) => {
  const ubLinks = await UserBusiness.find({ user_id: req.user._id });
  const bizIds = ubLinks.map(u => u.business_id);
  const businesses = await Business.find({ _id: { $in: bizIds }, active: 1 }).lean();
  res.json({ success: true, user: req.user, businesses: businesses.map(b => ({ ...b, id: b._id })) });
});

router.post('/change-password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  validate
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!bcrypt.compareSync(currentPassword, user.password))
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    user.password = bcrypt.hashSync(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
