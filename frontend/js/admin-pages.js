// ─── USERS PAGE ───────────────────────────────────────────────────────────────
Pages.register('users', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="card-header">
      <div><div class="card-title">User Management</div><div class="card-sub">Manage access and roles</div></div>
      <button class="btn btn-primary" onclick="openUserModal()">+ Add User</button>
    </div>
    <div id="users-table" class="table-wrap"></div>
  </div>
  <div class="modal-overlay" id="user-modal">
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title" id="user-modal-title">Add User</div><button class="btn btn-sm btn-secondary" onclick="closeModal('user-modal')">✕</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full"><label>Full Name *</label><input id="usr-name" placeholder="John Doe"></div>
          <div class="form-group full"><label>Email *</label><input id="usr-email" type="email" placeholder="john@company.com"></div>
          <div class="form-group"><label>Password *</label><input id="usr-password" type="password" placeholder="Min 6 chars"></div>
          <div class="form-group"><label>Role *</label>
            <select id="usr-role">
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div class="alert alert-info mt-3"><span>ℹ</span><span><b>Admin:</b> Full access &nbsp;|&nbsp; <b>Accountant:</b> Create/edit invoices &nbsp;|&nbsp; <b>Viewer:</b> Read only</span></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('user-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser()">Create User</button>
      </div>
    </div>
  </div>`;
  loadUsers();
});

async function loadUsers() {
  try {
    const res = await API.get('/users');
    const el = document.getElementById('users-table');
    el.innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${res.data.map(u => `<tr>
      <td class="font-bold">${u.name}</td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-red' : u.role === 'accountant' ? 'badge-blue' : 'badge-gray'}">${u.role}</span></td>
      <td>${u.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${u.id !== App.user?.id ? `<button class="btn btn-xs btn-danger" onclick="deactivateUser(${u.id})">Deactivate</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function openUserModal() {
  document.getElementById('usr-name').value = '';
  document.getElementById('usr-email').value = '';
  document.getElementById('usr-password').value = '';
  document.getElementById('usr-role').value = 'accountant';
  openModal('user-modal');
}

async function saveUser() {
  const name = document.getElementById('usr-name').value.trim();
  const email = document.getElementById('usr-email').value.trim();
  const password = document.getElementById('usr-password').value;
  const role = document.getElementById('usr-role').value;
  if (!name || !email || !password) { toast('All fields required', 'error'); return; }
  try {
    await API.post('/users', { name, email, password, role });
    toast('User created', 'success');
    closeModal('user-modal');
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deactivateUser(id) {
  confirmModal('Deactivate User', 'This user will lose access.', async () => {
    try { await API.delete(`/users/${id}`); toast('User deactivated', 'success'); loadUsers(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

// ─── BUSINESSES PAGE ──────────────────────────────────────────────────────────
// Global biz form state — avoids stale DOM reference bug
window._bizForm = {};

Pages.register('businesses', async () => {
  window._bizForm = {};
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="card-header">
      <div><div class="card-title">Businesses</div><div class="card-sub">Manage GSTINs and entities</div></div>
      <button class="btn btn-primary" onclick="openBizModal()">+ Add Business</button>
    </div>
    <div id="biz-table" class="table-wrap"></div>
  </div>
  <div class="modal-overlay" id="biz-modal">
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title">Add Business</div><button class="btn btn-sm btn-secondary" onclick="closeModal('biz-modal')">✕</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full">
            <label>GSTIN <span class="req">*</span></label>
            <input id="biz-gstin" placeholder="29AAAPL1234F1Z5"
              oninput="this.value=this.value.toUpperCase(); window._bizForm.gstin=this.value; validateBizGSTIN()">
            <div id="biz-gstin-msg" class="text-xs mt-2"></div>
          </div>
          <div class="form-group full">
            <label>Legal Name <span class="req">*</span></label>
            <input id="biz-legal" placeholder="ABC Private Limited"
              oninput="window._bizForm.legal_name=this.value">
          </div>
          <div class="form-group full">
            <label>Trade Name</label>
            <input id="biz-trade" placeholder="ABC Corp"
              oninput="window._bizForm.trade_name=this.value">
          </div>
          <div class="form-group">
            <label>State <span class="req">*</span></label>
            <select id="biz-state" onchange="window._bizForm.state_code=this.value">
              <option value="">Select state</option>
              ${Object.entries(STATE_CODES).map(([k, v]) => `<option value="${k}">${k} - ${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Registration Type</label>
            <select id="biz-regtype" onchange="window._bizForm.registration_type=this.value">
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="QRMP">QRMP</option>
            </select>
          </div>
          <div class="form-group">
            <label>PAN</label>
            <input id="biz-pan" placeholder="AAAPL1234F"
              oninput="this.value=this.value.toUpperCase(); window._bizForm.pan=this.value">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input id="biz-email" type="email" placeholder="info@company.com"
              oninput="window._bizForm.email=this.value">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input id="biz-phone" placeholder="+91 9999999999"
              oninput="window._bizForm.phone=this.value">
          </div>
          <div class="form-group full">
            <label>Address</label>
            <textarea id="biz-address" rows="2"
              oninput="window._bizForm.address=this.value"></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('biz-modal')">Cancel</button>
        <button class="btn btn-primary" id="biz-save-btn" onclick="saveBusiness()">Save Business</button>
      </div>
    </div>
  </div>`;
  window._bizForm = { registration_type: 'Regular' };
  window._loadedBusinesses = [];
  loadBusinesses();
});

async function loadBusinesses() {
  try {
    const res = await API.get('/businesses');
    const el = document.getElementById('biz-table');
    if (!res.data?.length) {
      el.innerHTML = '<div class="empty-state" style="padding:32px"><div class="empty-icon">🏢</div><div class="empty-title">No businesses yet</div><div class="empty-sub">Add your first business to get started</div></div>';
      return;
    }
    window._loadedBusinesses = res.data;
    el.innerHTML = `<table><thead><tr><th>GSTIN</th><th>Legal Name</th><th>Trade Name</th><th>State</th><th>Type</th><th>Actions</th></tr></thead>
    <tbody>${res.data.map(b => `<tr>
      <td class="font-mono">${b.gstin}</td>
      <td class="font-bold">${b.legal_name}</td>
      <td>${b.trade_name || '—'}</td>
      <td>${STATE_CODES[b.state_code] || b.state_code}</td>
      <td><span class="badge badge-blue">${b.registration_type}</span></td>
      <td>
        <button class="btn btn-xs btn-secondary" onclick="switchBusiness(${b.id})">Switch to</button>
        <button class="btn btn-xs btn-secondary" onclick="openBizModalById(${b.id})">Edit</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function openBizModalById(id) {
  const b = window._loadedBusinesses.find(x => x.id === id);
  if (b) openBizModal(b);
}

function openBizModal(biz = null) {
  window._bizForm = biz ? { ...biz } : { registration_type: 'Regular' };
  
  // Set modal title
  document.getElementById('biz-modal-title').textContent = biz ? 'Edit Business' : 'Add New Business';
  
  // Reset all DOM inputs so the form appears blank or populated
  document.getElementById('biz-gstin').value = window._bizForm.gstin || '';
  document.getElementById('biz-legal').value = window._bizForm.legal_name || '';
  document.getElementById('biz-trade').value = window._bizForm.trade_name || '';
  document.getElementById('biz-state').value = window._bizForm.state_code || '';
  document.getElementById('biz-regtype').value = window._bizForm.registration_type || 'Regular';
  document.getElementById('biz-pan').value = window._bizForm.pan || '';
  document.getElementById('biz-email').value = window._bizForm.email || '';
  document.getElementById('biz-phone').value = window._bizForm.phone || '';
  document.getElementById('biz-address').value = window._bizForm.address || '';
  
  // Clear validation message
  const msg = document.getElementById('biz-gstin-msg');
  if (msg) { msg.textContent = ''; msg.className = 'text-xs mt-2'; }
  if (biz) validateBizGSTIN(); // auto-validate if editing

  // Reset save button state
  const btn = document.getElementById('biz-save-btn');
  if (btn) { btn.disabled = false; btn.textContent = biz ? 'Update Business' : 'Save Business'; }
  openModal('biz-modal');
}

function validateBizGSTIN() {
  const v = (window._bizForm.gstin || '').toUpperCase();
  const msg = document.getElementById('biz-gstin-msg');
  if (!msg) return;
  if (!v) { msg.textContent = ''; return; }
  if (validateGSTIN(v)) {
    const sc = v.substring(0, 2);
    msg.textContent = '✓ Valid · State: ' + (STATE_CODES[sc] || sc);
    msg.className = 'text-xs mt-2 text-green';
    window._bizForm.state_code = sc;
    // Also update the dropdown visually
    const sel = document.getElementById('biz-state');
    if (sel) sel.value = sc;
  } else {
    msg.textContent = '✗ Invalid — must be 15 chars e.g. 29AAAPL1234F1Z5';
    msg.className = 'text-xs mt-2 text-red';
  }
}

async function saveBusiness() {
  // Read from global state object — 100% reliable, no DOM dependency
  const f = window._bizForm || {};

  // Also try reading directly from DOM as fallback
  const gstin = (f.gstin || document.getElementById('biz-gstin')?.value || '').trim().toUpperCase();
  const legal_name = (f.legal_name || document.getElementById('biz-legal')?.value || '').trim();
  const state_code = f.state_code || document.getElementById('biz-state')?.value || '';
  const registration_type = f.registration_type || document.getElementById('biz-regtype')?.value || 'Regular';
  const trade_name = (f.trade_name || document.getElementById('biz-trade')?.value || '').trim();
  const pan = (f.pan || document.getElementById('biz-pan')?.value || '').trim();
  const email = (f.email || document.getElementById('biz-email')?.value || '').trim();
  const phone = (f.phone || document.getElementById('biz-phone')?.value || '').trim();
  const address = (f.address || document.getElementById('biz-address')?.value || '').trim();

  // Validate
  if (!gstin) { toast('GSTIN is required', 'error'); return; }
  if (!validateGSTIN(gstin)) { toast('Invalid GSTIN format — use e.g. 29AAAPL1234F1Z5', 'error'); return; }
  if (!legal_name) { toast('Legal Name is required', 'error'); return; }
  if (!state_code) {
    // Try to auto-extract state from GSTIN
    const autoState = gstin.substring(0, 2);
    if (!STATE_CODES[autoState]) { toast('Please select a State', 'error'); return; }
    window._bizForm.state_code = autoState;
  }

  const finalState = state_code || gstin.substring(0, 2);

  const btn = document.getElementById('biz-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const payload = { gstin, legal_name, trade_name, state_code: finalState, registration_type, pan, email, phone, address };
    if (f.id) {
      await API.put(`/businesses/${f.id}`, payload);
      toast('Business updated successfully!', 'success');
    } else {
      await API.post('/businesses', payload);
      toast('Business added successfully!', 'success');
    }
    closeModal('biz-modal');
    window._bizForm = {};
    try {
      const me = await API.get('/auth/me');
      App.businesses = me.businesses || [];
      if (!App.currentBiz && App.businesses.length > 0) {
        App.currentBiz = App.businesses[0];
        localStorage.setItem('gst_biz_id', App.currentBiz.id);
        App.renderSidebar();
      }
    } catch (e) { }
    loadBusinesses();
  } catch (e) {
    toast(e.message || 'Failed to save business', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Business'; }
  }
}

async function switchBusiness(id) {
  try {
    App.currentBiz = App.businesses.find(b => b.id === id) || (await API.get(`/businesses/${id}`)).data;
    localStorage.setItem('gst_biz_id', id);
    App.renderSidebar();
    toast(`Switched to ${App.currentBiz.trade_name || App.currentBiz.legal_name}`, 'success');
    Pages.navigate('dashboard');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
Pages.register('settings', () => {
  document.getElementById('page-content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">
    <div class="card">
      <div class="card-header"><div class="card-title">Change Password</div></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group full"><label>Current Password</label><input id="set-cur-pw" type="password"></div>
          <div class="form-group full"><label>New Password</label><input id="set-new-pw" type="password"></div>
          <div class="form-group full"><label>Confirm New Password</label><input id="set-conf-pw" type="password"></div>
        </div>
        <button class="btn btn-primary mt-3" onclick="changePassword()">Update Password</button>
      </div>
    </div>
    <div>
      <div class="card mb-4">
        <div class="card-header"><div class="card-title">Data Management</div></div>
        <div class="card-body">
          <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">Download a full backup of your database. This includes all businesses, invoices, parties, and settings.</p>
          <button class="btn btn-secondary w-full" onclick="downloadBackup()">💾 Download Database Backup</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">System Info</div></div>
        <div class="card-body" style="font-size:0.85rem;color:var(--text2)">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Version</span><span class="font-mono text-accent">2.0.0</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>User</span><span>${App.user?.name || '—'}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Role</span><span class="badge badge-blue">${App.user?.role || '—'}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Businesses</span><span>${App.businesses?.length || 0}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Database</span><span class="font-mono">SQLite</span></div>
        </div>
      </div>
    </div>
  </div>`;
});

async function changePassword() {
  const cur = document.getElementById('set-cur-pw').value;
  const nw = document.getElementById('set-new-pw').value;
  const conf = document.getElementById('set-conf-pw').value;
  if (nw !== conf) { toast('Passwords do not match', 'error'); return; }
  try {
    await API.post('/auth/change-password', { currentPassword: cur, newPassword: nw });
    toast('Password changed successfully', 'success');
    document.getElementById('set-cur-pw').value = '';
    document.getElementById('set-new-pw').value = '';
    document.getElementById('set-conf-pw').value = '';
  } catch (e) { toast(e.message, 'error'); }
}

function downloadBackup() {
  const token = localStorage.getItem('gst_token');
  const a = document.createElement('a');
  a.href = `/api/backup?token=${token}`;
  a.download = `gst_backup_${new Date().toISOString().split('T')[0]}.db`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Downloading backup...', 'info');
}
