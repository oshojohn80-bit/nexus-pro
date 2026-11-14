import React, { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const api = async (path, token, options = {}) => {
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
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

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
        <p className="muted">Super Admin sign in</p>

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
    setForm(previous => ({
      ...previous,
      [field]: value
    }));
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
          <div>
            <p className="eyebrow">DEVICE MANAGEMENT</p>
            <h2>Register device</h2>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Asset tag *
            <input
              value={form.asset_tag}
              onChange={e => update('asset_tag', e.target.value)}
              placeholder="e.g. NEXUS-001"
              required
            />
          </label>

          <label>
            Device name *
            <input
              value={form.display_name}
              onChange={e => update('display_name', e.target.value)}
              placeholder="e.g. Samsung Galaxy A55"
              required
            />
          </label>

          <div className="form-grid">
            <label>
              Manufacturer
              <input
                value={form.manufacturer}
                onChange={e => update('manufacturer', e.target.value)}
                placeholder="Samsung"
              />
            </label>

            <label>
              Model
              <input
                value={form.model}
                onChange={e => update('model', e.target.value)}
                placeholder="SM-A556"
              />
            </label>
          </div>

          <label>
            Ownership type *
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
              placeholder="Employee name or work email"
            />
          </label>

          <p className="form-note">
            This registers an inventory record only. It does not enroll
            or remotely manage the Android device.
          </p>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary form-submit"
              disabled={busy}
            >
              {busy ? 'Registering...' : 'Register device'}
            </button>
          </div>
        </form>
      </section>
    </div>
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

  async function load(t = token) {
    if (!t) return;

    setLoading(true);

    try {
      const [s, d, l] = await Promise.all([
        api('/dashboard/summary', t),
        api('/devices', t),
        api('/audit-logs', t)
      ]);

      setSummary(s);
      setDevices(d.devices || []);
      setLogs(l.logs || []);
      setError('');
    } catch (e) {
      setError(e.message);

      if (
        e.message.toLowerCase().includes('session') ||
        e.message.toLowerCase().includes('expired')
      ) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }

  function login(t, u) {
    localStorage.setItem('nexus_token', t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem('nexus_token');
    setToken('');
    setUser(null);
    setSummary(null);
    setDevices([]);
    setLogs([]);
  }

  useEffect(() => {
    if (token) {
      api('/auth/me', token)
        .then(setUser)
        .catch(logout);
    }
  }, []);

  useEffect(() => {
    if (token && user) {
      load(token);
    }
  }, [tab, token, user]);

  async function refresh() {
    setNotice('');
    await load();
  }

  async function deviceCreated() {
    await load();
    setNotice('Device inventory record registered successfully.');
  }

  if (!token || !user) {
    return <Login onLogin={login} />;
  }

const nav = [
  'Overview',
  'Devices',
  'Security Center',
  'Applications',
  'Employees',
  'Reports',
  'Audit Logs',
  'Settings',
  'NEXUS Suite'
];
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

        {nav.map(n => (
          <button
            key={n}
            className={tab === n ? 'nav active' : 'nav'}
            onClick={() => setTab(n)}
          >
            {n}
          </button>
        ))}

        <div className="side-bottom">
          <div className="admin-dot">SA</div>
          <div>
            <b>Super Admin</b>
            <small>{user.email}</small>
          </div>
          <button className="logout" onClick={logout}>
            ↗️
          </button>
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="eyebrow">
              DEVICE MANAGEMENT / {tab.toUpperCase()}
            </p>
            <h1>{tab}</h1>
          </div>

          <div className="header-right">
            <span className="secure">● Secure session</span>

            <button
              className="ghost"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </header>

        {error && <div className="notice">{error}</div>}
        {notice && <div className="success-notice">{notice}</div>}

        {tab === 'Overview' && (
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
              ].map(([a, b]) => (
                <div className="card stat" key={a}>
                  <p>{a}</p>
                  <strong>{b}</strong>
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
                    'Checking integration…'}
                </p>
                <span className="tag warn">NOT CONNECTED</span>
              </section>
            </div>

            <section className="card panel">
              <h3>Recent security events</h3>

              {summary?.recent_events?.length ? (
                summary.recent_events.map(e => (
                  <div className="row" key={e.id}>
                    <span className={`severity ${e.severity.toLowerCase()}`}>
                      {e.severity}
                    </span>
                    <div>
                      <b>{e.title}</b>
                      <small>{e.description}</small>
                    </div>
                    <time>{new Date(e.created_at).toLocaleString()}</time>
                  </div>
                ))
              ) : (
                <p className="muted">
                  No security events recorded. Live security telemetry is not connected.
                </p>
              )}
            </section>
          </>
        )}

        {tab === 'Devices' && (
          <section className="card panel">
            <div className="device-toolbar">
              <div>
                <h3>
                  Device inventory
                  <span className="count">{devices.length} records</span>
                </h3>
                <p className="muted">
                  Register and review authorised device inventory.
                </p>
              </div>

              <button
                className="primary add-device-button"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setShowAddDevice(true);
                }}
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
                      <td>
                        {d.display_name}
                        <small>
                          {[d.manufacturer, d.model]
                            .filter(Boolean)
                            .join(' ')}
                        </small>
                      </td>
                      <td>
                        {d.ownership_type === 'COMPANY_OWNED'
                          ? 'Company-owned'
                          : 'Employee-owned'}
                      </td>
                      <td>{d.assigned_to || '—'}</td>
                      <td>
                        <span className="tag">{d.status}</span>
                      </td>
                      <td>{d.compliance_status}</td>
                      <td>{d.enrolled ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!devices.length && (
                <p className="muted">
                  No device inventory records yet. Use Add Device to register
                  an inventory record.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === 'Audit Logs' && (
          <section className="card panel">
            <h3>Administrative audit history</h3>

            {logs.map(l => (
              <div className="row" key={l.id}>
                <span className="tag">{l.action}</span>
                <div>
                  <b>{l.actor_email}</b>
                  <small>
                    {l.target_type || '—'} · {l.target_id || '—'}
                  </small>
                </div>
                <time>{new Date(l.created_at).toLocaleString()}</time>
              </div>
            ))}
          </section>
        )}

     {tab === 'NEXUS Suite' && (
  <section className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
    <iframe
      src="/nexus-suite/NEXUS_PRO_v39_signin_audit_frontendperfect.html"
      title="NEXUS Suite"
      style={{
        width: '100%',
        height: '85vh',
        border: 'none',
        background: '#fff'
      }}
    />
  </section>
)}

{!['Overview', 'Devices', 'Audit Logs', 'NEXUS Suite'].includes(tab) && (
  <section className="card panel">
    <h3>{tab}</h3>
    <p className="muted">
      Module scaffold. Connect the approved Android Enterprise
      integration and configure policy before enabling live actions.
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
