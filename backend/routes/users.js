const router = require('express').Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.get('/', auth, requireRole('admin'), async (req, res) => {
  res.json({ success: true, data: await dbAll('SELECT id,name,email,role,active,created_at FROM users ORDER BY name') });
});

router.post('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password required' });
    if (!['admin','accountant','viewer'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
    const existing = await dbGet('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
    const hash = bcrypt.hashSync(password, 10);
    const r = await dbRun('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)', [name, email.toLowerCase(), hash, role]);
    res.json({ success: true, data: { id: r.lastID }, message: 'User created' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const { name, role, active } = req.body;
    if (req.params.id == req.user.id && active === 0) return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    const cur = await dbGet('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({ success: false, message: 'Not found' });
    await dbRun('UPDATE users SET name=?, role=?, active=? WHERE id=?', [name||cur.name, role||cur.role, active??cur.active, req.params.id]);
    res.json({ success: true, message: 'User updated' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  await dbRun('UPDATE users SET active=0 WHERE id=?', [req.params.id]);
  res.json({ success: true, message: 'User deactivated' });
});

module.exports = router;
