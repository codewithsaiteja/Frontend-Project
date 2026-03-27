const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../utils/db');

function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ success: false, message: 'No token provided' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  jwt.verify(token, process.env.JWT_SECRET || 'gst_secret', async (err, decoded) => {
    if (err) return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    const user = await dbGet('SELECT id,name,email,role,active FROM users WHERE id=?', [decoded.id]);
    if (!user || !user.active) return res.status(401).json({ success: false, message: 'Invalid session' });
    req.user = user;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    next();
  };
}

function auditLog(action, entityType) {
  return (req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (data) => {
      if (data?.success !== false && req.user) {
        dbRun(`INSERT INTO audit_log(user_id,business_id,action,entity_type,entity_id,new_data,ip_address) VALUES(?,?,?,?,?,?,?)`,
          [req.user.id, req.body?.business_id || null, action, entityType || null, data?.data?.id || null, JSON.stringify(req.body || {}), req.ip]
        ).catch(() => {});
      }
      return orig(data);
    };
    next();
  };
}

module.exports = { auth, requireRole, auditLog };
