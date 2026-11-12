import React, { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const PERMISSIONS = [
  ['dashboard', 'Dashboard'],
  ['devices', 'Devices'],
  ['screen_control', 'Screen Control'],
  ['applications', 'Applications'],
  ['security_policies', 'Security Policies'],
  ['remote_lock_wipe', 'Remote Lock / Wipe'],
  ['employees', 'Employees'],
  ['reports', 'Reports'],
  ['audit_logs', 'Audit Logs'],
  ['organization_settings', 'Organisation Settings']
];

const NAV = [
  ['Overview', 'dashboard'],
  ['Devices', 'devices'],
  ['Screen Control', 'screen_control'],
  ['Applications', 'applications'],
  ['Security Center', 'security_policies'],
  ['Employees', 'employees'],
  ['Reports', 'reports'],
  ['Audit Logs', 'audit_logs'],
  ['Settings', 'organization_settings']
];

const EMPTY_PERMISSIONS = Object.fromEntries(
  PERMISSIONS.map(([key]) => [key, false])
);

const isMainAdmin = user =>
  ['SUPER_ADMIN', 'MAIN_ADMIN'].includes(user?.role);

async function api(path, token, options = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = await api('/auth/login', '', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login card" onSubmit={submit}>
        <div className="brand-mark">NP</div>
        <p className="eyebrow">ENTERPRISE DEVICE MANAGEMENT</p>
        <h1>NEXUS PRO</h1>
        <p className="muted">Administrator sign in</p>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <small>Authorized administrators only.</small>
      </form>
    </main>
  );
}

function AddDeviceForm({ token, onClose, onCreated }) {
  const [form, setForm] = useState({
    asset_tag: '',
    display_name: '',
    manufacturer: '',
    model: '',
    ownership_type: 'COMPANY_OWNED',
    assigned_to: ''
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm(old => ({ ...old, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      await api('/devices', token, {
        method: 'POST',
        body: JSON.stringify(form)
      });

      await onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="card device-modal">
        <div className="modal-heading">
          <h2>Register device</h2>
          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Asset tag *
            <input
              value={form.asset_tag}
              onChange={e => update('asset_tag', e.target.value)}
              required
            />
          </label>

          <label>
            Device name *
            <input
              value={form.display_name}
              onChange={e => update('display_name', e.target.value)}
              required
            />
          </label>

          <label>
            Manufacturer
            <input
              value={form.manufacturer}
              onChange={e => update('manufacturer', e.target.value)}
            />
          </label>

          <label>
            Model
            <input
              value={form.model}
              onChange={e => update('model', e.target.value)}
            />
          </label>

          <label>
            Ownership
            <select
              value={form.ownership_type}
              onChange={e => update('ownership_type', e.target.value)}
            >
              <option value="COMPANY_OWNED">Company-owned</option>
              <option value="EMPLOYEE_OWNED">Employee-owned</option>
            </select>
          </label>

          <label>
            Assigned employee
            <input
              value={form.assigned_to}
              onChange={e => update('assigned_to', e.target.value)}
            />
          </label>

          <p className="form-note">
            This creates an inventory record only. Android enrollment and
            remote management are not yet connected.
          </p>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving...' : 'Register device'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdminManagement({ token, user, notify }) {
  const [admins, setAdmins] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'ADMIN',
    currentPassword: '',
    permissions: { ...EMPTY_PERMISSIONS }
  });

  async function loadAdmins() {
    setBusy(true);
    setError('');

    try {
      const data = await api('/admins', token);
      setAdmins(data.admins || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, [token]);

  function updateForm(field, value) {
    setForm(old => ({ ...old, [field]: value }));
  }

  function updatePermission(key, value) {
    setForm(old => ({
      ...old,
      permissions: {
        ...old.permissions,
        [key]: value
      }
    }));
  }

  async function createAdmin(e) {
    e.preventDefault();
    setError('');

    try {
      await api('/admins', token, {
        method: 'POST',
        body: JSON.stringify(form)
      });

      setShowCreate(false);
      setForm({
        email: '',
        password: '',
        role: 'ADMIN',
        currentPassword: '',
        permissions: { ...EMPTY_PERMISSIONS }
      });

      notify('Administrator account created.');
      await loadAdmins();
    } catch (err) {
      setError(err.message);
    }
  }

  async function accountAction(admin, action) {
    const actionLabels = {
      suspend: 'suspend',
      reactivate: 'reactivate',
      delete: 'permanently delete'
    };

    if (!window.confirm(
      `Are you sure you want to ${actionLabels[action]} ${admin.email}?`
    )) return;

    const currentPassword = window.prompt(
      'Enter your own Main Admin password to confirm this action:'
    );

    if (!currentPassword) return;

    setError('');

    try {
      if (action === 'delete') {
        await api(`/admins/${admin.id}`, token, {
          method: 'DELETE',
          body: JSON.stringify({ currentPassword })
        });
      } else {
        await api(`/admins/${admin.id}/${action}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ currentPassword })
        });
      }

      notify(`Account ${action} action completed.`);
      await loadAdmins();
    } catch (err) {
      setError(err.message);
    }
  }

  async function editPermissions(admin) {
    const currentPassword = window.prompt(
      'Enter your Main Admin password to change permissions:'
    );

    if (!currentPassword) return;

    const permissions = {};

    for (const [key, label] of PERMISSIONS) {
      permissions[key] = window.confirm(
        `Allow ${admin.email} to access ${label}?\n\nOK = Allow\nCancel = Deny`
      );
    }

    if (!window.confirm(
      'Save these permissions for ' + admin.email + '?'
    )) return;

    try {
      await api(`/admins/${admin.id}/permissions`, token, {
        method: 'PATCH',
        body: JSON.stringify({ permissions, currentPassword })
      });

      notify('Administrator permissions updated.');
      await loadAdmins();
    } catch (err) {
      setError(err.message);
    }
  }

  const mainAdminCount = admins.filter(a =>
    ['SUPER_ADMIN', 'MAIN_ADMIN'].includes(a.role)
  ).length;

  return (
    <section className="card panel">
      <div className="device-toolbar">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h2>Admin Management</h2>
          <p className="muted">
            Manage the three fixed Main Admin positions and ordinary Admins.
          </p>
        </div>

        <button className="primary" onClick={() => setShowCreate(!showCreate)}>
          + Add Admin
        </button>
      </div>

      <div className="grid stats">
        <div className="card stat">
          <p>Main Admin positions</p>
          <strong>{mainAdminCount}/3</strong>
          <small>Suspended accounts still occupy a position</small>
        </div>

        <div className="card stat">
          <p>Ordinary Admins</p>
          <strong>
            {admins.filter(a => a.role === 'ADMIN').length}
          </strong>
          <small>Individually permissioned</small>
        </div>
      </div>

      {error && <div className="notice">{error}</div>}

      {showCreate && (
        <form className="card panel" onSubmit={createAdmin}>
          <h3>Create administrator</h3>

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={e => updateForm('email', e.target.value)}
              required
            />
          </label>

          <label>
            Temporary password
            <input
              type="password"
              minLength="14"
              value={form.password}
              onChange={e => updateForm('password', e.target.value)}
              required
              autoComplete="new-password"
            />
            <small>Use at least 14 characters.</small>
          </label>

          <label>
            Account type
            <select
              value={form.role}
              onChange={e => updateForm('role', e.target.value)}
            >
              <option value="ADMIN">Ordinary Admin</option>
              <option value="MAIN_ADMIN">Main Admin</option>
            </select>
          </label>

          {form.role === 'ADMIN' && (
            <>
              <h3>Individual permissions</h3>
              <div className="permission-grid">
                {PERMISSIONS.map(([key, label]) => (
                  <label key={key} className="permission-option">
                    <input
                      type="checkbox"
                      checked={form.permissions[key]}
                      onChange={e => updatePermission(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}

          <label>
            Your current Main Admin password
            <input
              type="password"
              value={form.currentPassword}
              onChange={e => updateForm('currentPassword', e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button className="primary">Create account</button>
          </div>
        </form>
      )}

      {busy && <p className="muted">Loading administrator accounts...</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {admins.map(admin => {
              const main = isMainAdmin(admin);
              const self = String(admin.id) === String(user.id);

              return (
                <tr key={admin.id}>
                  <td>
                    {admin.email}
                    {self && <small>Your account</small>}
                  </td>

                  <td>{main ? 'Main Admin' : 'Admin'}</td>

                  <td>
                    <span className="tag">
                      {admin.status || 'ACTIVE'}
                    </span>
                  </td>

                  <td>
                    {self ? (
                      <span className="muted">Current account protected</span>
                    ) : (
                      <div className="admin-actions">
                        {main ? (
                          <>
                            <button
                              className="ghost"
                              onClick={() => accountAction(
                                admin,
                                admin.status === 'SUSPENDED'
                                  ? 'reactivate'
                                  : 'suspend'
                              )}
                            >
                              {admin.status === 'SUSPENDED'
                                ? 'Reactivate'
                                : 'Suspend'}
                            </button>

                            <button
                              className="ghost danger"
                              onClick={() => accountAction(admin, 'delete')}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="ghost"
                              onClick={() => editPermissions(admin)}
                            >
                              Permissions
                            </button>

                            <button
                              className="ghost"
                              onClick={() => accountAction(
                                admin,
                                admin.status === 'SUSPENDED'
                                  ? 'reactivate'
                                  : 'suspend'
                              )}
                            >
                              {admin.status === 'SUSPENDED'
                                ? 'Reactivate'
                                : 'Suspend'}
                            </button>

                            <button
                              className="ghost danger"
                              onClick={() => accountAction(admin, 'delete')}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="form-note">
        Main Admins have equal authority. Each can manage the other Main Admin
        accounts. A suspended Main Admin continues to occupy one of the three
        fixed positions. The last active Main Admin is protected by the backend.
      </p>
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState(
    localStorage.getItem('nexus_token') || ''
  );

  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);

  const mainAdmin = isMainAdmin(user);

  function hasPermission(key) {
    return mainAdmin || user?.permissions?.[key] === true;
  }

  function logout() {
    localStorage.removeItem('nexus_token');
    setToken('');
    setUser(null);
    setSummary(null);
    setDevices([]);
    setLogs([]);
  }

  function login(t, u) {
    localStorage.setItem('nexus_token', t);
    setToken(t);
    setUser(u);
  }

  useEffect(() => {
    if (!token) return;

    api('/auth/me', token)
      .then(data => setUser(data.user || data))
      .catch(logout);
  }, [token]);

  async function load() {
    if (!token || !user) return;

    setLoading(true);
    setError('');

    try {
      if (tab === 'Overview' && hasPermission('dashboard')) {
        const data = await api('/dashboard/summary', token);
        setSummary(data);
      }

      if (tab === 'Devices' && hasPermission('devices')) {
        const data = await api('/devices', token);
        setDevices(data.devices || []);
      }

      if (tab === 'Audit Logs' && hasPermission('audit_logs')) {
        const data = await api('/audit-logs', token);
        setLogs(data.logs || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab, token, user]);

  function notify(message) {
    setNotice(message);
    setError('');
  }

  async function refresh() {
    setNotice('');
    await load();
  }

  async function deviceCreated() {
    const data = await api('/devices', token);
    setDevices(data.devices || []);
    notify('Device inventory record registered.');
  }

  if (!token || !user) {
    return <Login onLogin={login} />;
  }

  const nav = NAV.filter(([, permission]) =>
    hasPermission(permission)
  );

  if (mainAdmin) {
    nav.push(['Admin Management', 'admin_management']);
  }

  const allowedTabs = nav.map(([name]) => name);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <span>NP</span>
          <div>
            NEXUS PRO
            <small>ENTERPRISE</small>
          </div>
        </div>

        <div className="side-label">WORKSPACE</div>

        {nav.map(([name]) => (
          <button
            key={name}
            className={tab === name ? 'nav active' : 'nav'}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}

        <div className="side-bottom">
          <div className="admin-dot">NP</div>
          <div>
            <b>{mainAdmin ? 'Main Admin' : 'Admin'}</b>
            <small>{user.email}</small>
          </div>
          <button className="logout" onClick={logout}>↗</button>
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="eyebrow">
              NEXUS PRO / {tab.toUpperCase()}
            </p>
            <h1>{tab}</h1>
          </div>

          <div className="header-right">
            <span className="secure">● Secure session</span>
            <button className="ghost" onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </header>

        {error && <div className="notice">{error}</div>}
        {notice && <div className="success-notice">{notice}</div>}

        {!allowedTabs.includes(tab) && (
          <section className="card panel">
            <h3>Access restricted</h3>
            <p className="muted">
              Your administrator account does not have permission to view
              this module.
            </p>
          </section>
        )}

        {tab === 'Overview' && hasPermission('dashboard') && (
          <>
            <div className="welcome">
              <div>
                <h2>Enterprise command center</h2>
                <p>
                  Manage authorized company devices and employee Work Profiles.
                </p>
              </div>
              <span className="capacity">FLEET CAPACITY · 200+</span>
            </div>

            <div className="grid stats">
              {[
                ['Total devices', summary?.total ?? '—'],
                ['Online', summary?.online ?? '—'],
                ['Offline', summary?.offline ?? '—'],
                ['Non-compliant', summary?.non_compliant ?? '—']
              ].map(([label, value]) => (
                <div className="card stat" key={label}>
                  <p>{label}</p>
                  <strong>{value}</strong>
                  <small>Registered inventory</small>
                </div>
              ))}
            </div>

            <div className="grid two">
              <section className="card panel">
                <h3>Ownership breakdown</h3>
                <div className="breakdown">
                  <div>
                    <b>{summary?.company_owned ?? '—'}</b>
                    <span>Company-owned · Fully managed</span>
                  </div>
                  <div>
                    <b>{summary?.employee_owned ?? '—'}</b>
                    <span>Employee-owned · Work Profile</span>
                  </div>
                </div>
              </section>

              <section className="card panel">
                <h3>Android Enterprise connection</h3>
                <p className="muted">
                  {summary?.android_enterprise?.note ||
                    'Android Enterprise integration is not connected.'}
                </p>
                <span className="tag warn">NOT CONNECTED</span>
              </section>
            </div>
          </>
        )}

        {tab === 'Devices' && hasPermission('devices') && (
          <section className="card panel">
            <div className="device-toolbar">
              <div>
                <h3>Device inventory</h3>
                <p className="muted">{devices.length} inventory records</p>
              </div>

              <button
                className="primary"
                onClick={() => setShowAddDevice(true)}
              >
                + Add Device
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset tag</th>
                    <th>Device</th>
                    <th>Ownership</th>
                    <th>Assigned to</th>
                    <th>Status</th>
                    <th>Compliance</th>
                    <th>Enrolled</th>
                  </tr>
                </thead>

                <tbody>
                  {devices.map(d => (
                    <tr key={d.id}>
                      <td>{d.asset_tag}</td>
                      <td>{d.display_name}</td>
                      <td>{d.ownership_type}</td>
                      <td>{d.assigned_to || '—'}</td>
                      <td>{d.status}</td>
                      <td>{d.compliance_status}</td>
                      <td>{d.enrolled ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!devices.length && (
              <p className="muted">No inventory records found.</p>
            )}
          </section>
        )}

        {tab === 'Audit Logs' && hasPermission('audit_logs') && (
          <section className="card panel">
            <h3>Administrative audit history</h3>

            {logs.map(log => (
              <div className="row" key={log.id}>
                <span className="tag">{log.action}</span>
                <div>
                  <b>{log.actor_email}</b>
                  <small>
                    {log.target_type || '—'} · {log.target_id || '—'}
                  </small>
                </div>
                <time>{new Date(log.created_at).toLocaleString()}</time>
              </div>
            ))}

            {!logs.length && (
              <p className="muted">No audit entries found.</p>
            )}
          </section>
        )}

        {tab === 'Admin Management' && mainAdmin && (
          <AdminManagement
            token={token}
            user={user}
            notify={notify}
          />
        )}

        {[
          'Screen Control',
          'Applications',
          'Security Center',
          'Employees',
          'Reports',
          'Settings'
        ].includes(tab) && (
          <section className="card panel">
            <h3>{tab}</h3>
            <p className="muted">
              This module is not yet connected to a live Android Enterprise
              service. Remote support and device actions must be implemented
              with appropriate authorization and consent before activation.
            </p>
          </section>
        )}

        <footer>
          NEXUS PRO ENTERPRISE
          <span>
            Authorized management only · Employee personal data stays private
          </span>
        </footer>
      </main>

      {showAddDevice && (
        <AddDeviceForm
          token={token}
          onClose={() => setShowAddDevice(false)}
          onCreated={deviceCreated}
        />
      )}
    </div>
  );
}
