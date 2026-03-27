const { dbRun } = require('./db');

async function updateOverdueCompliance() {
  try {
    await dbRun(`UPDATE compliance_calendar SET status='overdue' WHERE due_date < CURDATE() AND status='pending'`);
  } catch(e) { console.error('Compliance update error:', e); }
}

async function generateComplianceCalendar(businessId, financialYear) {
  const [startYear] = financialYear.split('-');
  const fy = parseInt(startYear);
  const months = [
    {m:'04',y:fy},{m:'05',y:fy},{m:'06',y:fy},{m:'07',y:fy},{m:'08',y:fy},{m:'09',y:fy},
    {m:'10',y:fy},{m:'11',y:fy},{m:'12',y:fy},{m:'01',y:fy+1},{m:'02',y:fy+1},{m:'03',y:fy+1}
  ];
  for (const {m, y} of months) {
    const period = `${m}${y}`;
    const nextM = parseInt(m) === 12 ? '01' : String(parseInt(m)+1).padStart(2,'0');
    const nextY = parseInt(m) === 12 ? y+1 : y;
    await dbRun(`INSERT OR IGNORE INTO compliance_calendar(business_id,return_type,period,due_date,status) VALUES(?,?,?,?,?)`,
      [businessId, 'GSTR1', period, `${nextY}-${nextM}-11`, 'pending']);
    await dbRun(`INSERT OR IGNORE INTO compliance_calendar(business_id,return_type,period,due_date,status) VALUES(?,?,?,?,?)`,
      [businessId, 'GSTR3B', period, `${nextY}-${nextM}-20`, 'pending']);
  }
  await dbRun(`INSERT OR IGNORE INTO compliance_calendar(business_id,return_type,period,due_date,status) VALUES(?,?,?,?,?)`,
    [businessId, 'GSTR9', financialYear, `${fy+1}-12-31`, 'pending']);
}

module.exports = { updateOverdueCompliance, generateComplianceCalendar };
