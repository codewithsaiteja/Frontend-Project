require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./utils/db');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }));

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/parties',    require('./routes/parties'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/purchases',  require('./routes/purchases'));
app.use('/api/returns',    require('./routes/returns'));
app.use('/api/reconcile',  require('./routes/reconcile'));
app.use('/api/hsn',        require('./routes/hsn'));
app.use('/api/analytics',  require('./routes/analytics'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/tds',        require('./routes/tds'));
app.use('/api/export',     require('./routes/export'));
app.use('/api/audit',      require('./routes/audit'));
app.use('/api/users',      require('./routes/users'));

// Database backup placeholder (MongoDB — use mongodump externally)
app.get('/api/backup', require('./middleware/auth').auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  res.json({ success: true, message: 'Use mongodump to backup MongoDB. URI: ' + (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gst_system') });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api'))
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status||500).json({ success: false, message: err.message||'Internal server error' });
});

const PORT = process.env.PORT || 3000;

initDb().then(() => {
  try {
    const cron = require('node-cron');
    const { updateOverdueCompliance } = require('./utils/compliance');
    cron.schedule('0 6 * * *', updateOverdueCompliance);
  } catch(e) {}

  app.listen(PORT, () => {
    console.log(`\n🚀 GST System running → http://localhost:${PORT}`);
    console.log(`📧 Login: admin@gst.local`);
    console.log(`🔑 Password: Admin@123\n`);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});
