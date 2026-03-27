const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

let pool;

function getDb() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'gst_user',
      password: process.env.DB_PASSWORD || 'gst_password',
      database: process.env.DB_NAME || 'gst_system',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

async function dbRun(sql, params = []) {
  try {
    const safeParams = params.map(p => p === undefined ? null : p);
    const [result] = await getDb().query(sql, safeParams);
    // return SQLite format to keep backward compatibility
    return { lastID: result.insertId, changes: result.affectedRows };
  } catch(e) { console.error('DB_RUN ERROR:', e.message, '\nSQL:', sql, '\nPARAMS:', params); throw e; }
}

async function dbGet(sql, params = []) {
  try {
    const safeParams = params.map(p => p === undefined ? null : p);
    const [rows] = await getDb().query(sql, safeParams);
    return rows[0]; // return undefined if no rows
  } catch(e) { console.error('DB_GET ERROR:', e.message, '\nSQL:', sql, '\nPARAMS:', params); throw e; }
}

async function dbAll(sql, params = []) {
  try {
    const safeParams = params.map(p => p === undefined ? null : p);
    const [rows] = await getDb().query(sql, safeParams);
    return rows || [];
  } catch(e) { console.error('DB_ALL ERROR:', e.message, '\nSQL:', sql, '\nPARAMS:', params); throw e; }
}

async function dbExec(sql) {
  // MySQL execute doesn't support multiple queries natively unless multipleStatements is true
  // We can just use queries if we separate them or parse them.
  // Actually, for initDb we'll just execute queries one by one below.
  throw new Error("dbExec is deprecated for MySQL. Use specific migrations or schema execution sequentially.");
}

async function initDb() {
  const p = getDb();
  
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'accountant',
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gstin VARCHAR(50) UNIQUE NOT NULL,
      legal_name VARCHAR(255) NOT NULL,
      trade_name VARCHAR(255),
      address TEXT,
      state_code VARCHAR(10) NOT NULL,
      registration_type VARCHAR(50) DEFAULT 'Regular',
      pan VARCHAR(50), email VARCHAR(255), phone VARCHAR(50),
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_businesses (
      user_id INT, business_id INT,
      PRIMARY KEY(user_id, business_id)
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS parties (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT, name VARCHAR(255) NOT NULL,
      gstin VARCHAR(50), pan VARCHAR(50), email VARCHAR(255), phone VARCHAR(50), address TEXT, state_code VARCHAR(10),
      party_type VARCHAR(50) NOT NULL DEFAULT 'customer',
      is_registered TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT, invoice_number VARCHAR(100) NOT NULL, invoice_date DATE NOT NULL,
      invoice_type VARCHAR(50) NOT NULL DEFAULT 'B2B', supply_type VARCHAR(50) NOT NULL DEFAULT 'intra',
      party_id INT, party_name VARCHAR(255), party_gstin VARCHAR(50), party_state_code VARCHAR(10),
      place_of_supply VARCHAR(255), reverse_charge TINYINT DEFAULT 0,
      taxable_value DECIMAL(12,2) DEFAULT 0, cgst DECIMAL(12,2) DEFAULT 0, sgst DECIMAL(12,2) DEFAULT 0,
      igst DECIMAL(12,2) DEFAULT 0, cess DECIMAL(12,2) DEFAULT 0, total_amount DECIMAL(12,2) DEFAULT 0,
      tds_amount DECIMAL(12,2) DEFAULT 0, tcs_amount DECIMAL(12,2) DEFAULT 0,
      irn VARCHAR(255), ack_no VARCHAR(100), ack_date DATETIME, ewb_number VARCHAR(100), ewb_date DATETIME,
      status VARCHAR(50) DEFAULT 'draft', notes TEXT, created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE(business_id, invoice_number)
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT, description TEXT NOT NULL, hsn_sac VARCHAR(50), uom VARCHAR(50),
      quantity DECIMAL(10,2) DEFAULT 1, unit_price DECIMAL(10,2) NOT NULL, discount DECIMAL(10,2) DEFAULT 0,
      taxable_value DECIMAL(12,2) NOT NULL, gst_rate DECIMAL(5,2) NOT NULL,
      cgst_rate DECIMAL(5,2) DEFAULT 0, sgst_rate DECIMAL(5,2) DEFAULT 0, igst_rate DECIMAL(5,2) DEFAULT 0,
      cgst DECIMAL(12,2) DEFAULT 0, sgst DECIMAL(12,2) DEFAULT 0, igst DECIMAL(12,2) DEFAULT 0,
      cess_rate DECIMAL(5,2) DEFAULT 0, cess DECIMAL(12,2) DEFAULT 0, total DECIMAL(12,2) NOT NULL
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT, invoice_number VARCHAR(100) NOT NULL, invoice_date DATE NOT NULL,
      party_id INT, party_gstin VARCHAR(50),
      taxable_value DECIMAL(12,2) DEFAULT 0, cgst DECIMAL(12,2) DEFAULT 0, sgst DECIMAL(12,2) DEFAULT 0,
      igst DECIMAL(12,2) DEFAULT 0, cess DECIMAL(12,2) DEFAULT 0, total_amount DECIMAL(12,2) DEFAULT 0,
      itc_eligible TINYINT DEFAULT 1, itc_availed DECIMAL(12,2) DEFAULT 0,
      gstr2b_matched TINYINT DEFAULT 0, match_status VARCHAR(50) DEFAULT 'pending',
      status VARCHAR(50) DEFAULT 'draft', created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS gst_returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT, return_type VARCHAR(50) NOT NULL, period VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      total_taxable DECIMAL(12,2) DEFAULT 0, total_cgst DECIMAL(12,2) DEFAULT 0,
      total_sgst DECIMAL(12,2) DEFAULT 0, total_igst DECIMAL(12,2) DEFAULT 0, total_cess DECIMAL(12,2) DEFAULT 0,
      itc_claimed DECIMAL(12,2) DEFAULT 0, net_liability DECIMAL(12,2) DEFAULT 0,
      filed_at DATETIME, arn VARCHAR(255), json_data MEDIUMTEXT, created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, return_type, period)
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS hsn_sac_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL, type VARCHAR(50) NOT NULL, description TEXT NOT NULL,
      gst_rate DECIMAL(5,2) NOT NULL, cess_rate DECIMAL(5,2) DEFAULT 0
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS compliance_calendar (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT, return_type VARCHAR(50) NOT NULL, period VARCHAR(50) NOT NULL,
      due_date DATE NOT NULL, status VARCHAR(50) DEFAULT 'pending',
      filed_date DATE, penalty_amount DECIMAL(12,2) DEFAULT 0
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT, business_id INT, action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50), entity_id INT, old_data TEXT, new_data TEXT,
      ip_address VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS tds_tcs_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id INT, entry_type VARCHAR(50) NOT NULL,
      party_id INT, invoice_id INT, section VARCHAR(50),
      base_amount DECIMAL(12,2) NOT NULL, rate DECIMAL(5,2) NOT NULL, amount DECIMAL(12,2) NOT NULL,
      period VARCHAR(50) NOT NULL, status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create Indexes
  // IF NOT EXISTS syntax for indexes in MySQL is tricky, we'll try/catch them to be safe
  try { await p.query('CREATE INDEX idx_invoices_business ON invoices(business_id)'); } catch(e) {}
  try { await p.query('CREATE INDEX idx_invoices_date ON invoices(invoice_date)'); } catch(e) {}
  try { await p.query('CREATE INDEX idx_parties_business ON parties(business_id)'); } catch(e) {}

  const [hsnRows] = await p.query('SELECT COUNT(*) as c FROM hsn_sac_codes');
  if (hsnRows[0].c === 0) {
    const hsns = [
      ['0101','HSN','Live horses, asses, mules',0,0],
      ['0901','HSN','Coffee, whether or not roasted',5,0],
      ['1001','HSN','Wheat and meslin',0,0],
      ['1701','HSN','Cane or beet sugar',5,0],
      ['2201','HSN','Waters, ice and snow',12,0],
      ['2710','HSN','Petroleum oils',18,0],
      ['3004','HSN','Medicaments for retail sale',12,0],
      ['3401','HSN','Soap and surface-active products',18,0],
      ['4901','HSN','Printed books, brochures',0,0],
      ['6101','HSN','Mens overcoats, windcheaters',12,0],
      ['7108','HSN','Gold in non-monetary form',3,0],
      ['8471','HSN','Computers and data-processing machines',18,0],
      ['8517','HSN','Telephones including smartphones',18,0],
      ['8703','HSN','Motor cars and vehicles',28,22],
      ['9403','HSN','Furniture',18,0],
      ['996111','SAC','Hotel accommodation services',12,0],
      ['996311','SAC','Restaurant services',5,0],
      ['997212','SAC','Rental of commercial property',18,0],
      ['998311','SAC','IT consulting and management services',18,0],
      ['999299','SAC','Other miscellaneous services',18,0],
    ];
    for (const h of hsns) {
      await dbRun('INSERT IGNORE INTO hsn_sac_codes(code,type,description,gst_rate,cess_rate) VALUES(?,?,?,?,?)', h);
    }
  }

  const [admin] = await p.query("SELECT id FROM users WHERE email='admin@gst.local'");
  if (admin.length === 0) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    await dbRun("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)", ['Administrator','admin@gst.local',hash,'admin']);
    console.log('✅ Default admin: admin@gst.local / Admin@123');
  }
  console.log('✅ MySQL Database ready');
}

module.exports = { getDb, dbRun, dbGet, dbAll, dbExec, initDb };
