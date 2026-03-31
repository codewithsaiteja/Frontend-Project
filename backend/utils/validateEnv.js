const REQUIRED = [
  'JWT_SECRET',
  'MONGO_URI',
];

const WARNINGS = [
  'EMAIL_USER',
  'EMAIL_PASS',
  'SESSION_SECRET',
];

function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n❌ Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
    console.error('Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }

  const warned = WARNINGS.filter(k => !process.env[k]);
  if (warned.length) {
    console.warn(`\n⚠️  Optional env vars not set (some features may be disabled):\n  ${warned.join('\n  ')}\n`);
  }

  // Warn if using default secrets in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET === 'gst_super_secret_key_change_in_production_2024') {
      console.error('❌ You are using the default JWT_SECRET in production. Change it immediately!');
      process.exit(1);
    }
    if (process.env.SESSION_SECRET === 'gst_session_secret') {
      console.error('❌ You are using the default SESSION_SECRET in production. Change it immediately!');
      process.exit(1);
    }
  }
}

module.exports = validateEnv;
