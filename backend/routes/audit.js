const router = require('express').Router();
const { dbAll } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { business_id, entity_type, user_id, limit = 100, page = 1 } = req.query;
    let sql = `SELECT a.*, u.name as user_name, u.email as user_email FROM audit_log a LEFT JOIN users u ON a.user_id=u.id WHERE 1=1`;
    const params = [];
    if (business_id) { sql += ' AND a.business_id=?'; params.push(business_id); }
    if (entity_type) { sql += ' AND a.entity_type=?'; params.push(entity_type); }
    if (user_id) { sql += ' AND a.user_id=?'; params.push(user_id); }
    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
    res.json({ success: true, data: await dbAll(sql, params) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
