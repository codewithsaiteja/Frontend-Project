const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { body } = require('express-validator');
const { validateReq } = require('../middleware/validate');

router.post('/login', [
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validateReq
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE email=? AND active=1', [email.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'gst_secret', { expiresIn: '7d' });
    const businesses = await dbAll(`SELECT b.* FROM businesses b JOIN user_businesses ub ON b.id=ub.business_id WHERE ub.user_id=? AND b.active=1`, [user.id]);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, businesses });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/me', auth, async (req, res) => {
  const businesses = await dbAll(`SELECT b.* FROM businesses b JOIN user_businesses ub ON b.id=ub.business_id WHERE ub.user_id=? AND b.active=1`, [req.user.id]);
  res.json({ success: true, user: req.user, businesses });
});

router.post('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateReq
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password))
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    const hash = bcrypt.hashSync(newPassword, 10);
    await dbRun('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
