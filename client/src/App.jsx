import React, { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const api = async (path, token) => {
  const r = await fetch(`${API_BASE}/api${path}`, { headers: token ? { Authorization:`Bearer ${token}` } : {} });
  if (!r.ok) throw new Error((await r.json()).error || 'Request failed');
  return r.json();
};

function Login({ onLogin }) {
  const [email,setEmail] = useState(''); const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      const data = await r.json(); if(!r.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.token,data.user);
    } catch(err) { setError(err.message); }
  }
  return <main className="login-wrap"><form className="login card" onSubmit={submit}>
    <div className="brand-mark">NP</div><p className="eyebrow">ENTERPRISE DEVICE MANAGEMENT</p>
    <h1>NEXUS PRO</h1><p className="muted">Super Admin sign in</p>
    <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>
    {error && <p className="error">{error}</p>}<button className="primary">Sign in</button>
    <small>Authorized administrators only.</small>
  </form></main>;
}

export default function App() {
  const [token,setToken] = useState(localStorage.getItem('nexus_token') || '');
  const [user,setUser] = useState(null); const [summary,setSummary] = useState(null);
  const [devices,setDevices] = useState([]); const [logs,setLogs] = useState([]);
  const [tab,setTab] = useState('Overview'); const [error,setError] = useState('');
  async function load(t=token) {
    try {
      const [s,d,l] = await Promise.all([api('/dashboard/summary',t),api('/devices',t),api('/audit-logs',t)]);
      setSummary(s); setDevices(d.devices); setLogs(l.logs); setError('');
    } catch(e) { setError(e.message); if(e.message.includes('session')) logout(); }
  }
  function login(t,u) { localStorage.setItem('nexus_token',t); setToken(t); setUser(u); }
  function logout() { localStorage.removeItem('nexus_token'); setToken(''); setUser(null); setSummary(null); }
  useEffect(()=>{ if(token) { api('/auth/me',token).then(setUser).then(()=>load(token)).catch(logout); } },[]);
  useEffect(()=>{ if(token && user) load(token); },[tab]);
  if(!token || !user) return <Login onLogin={login}/>;
  const nav = ['Overview','Devices','Security Center','Applications','Employees','Reports','Audit Logs','Settings'];
  return <div className="shell">
    <aside className="sidebar"><div className="logo"><span>NP</span><div>NEXUS PRO<small>ENTERPRISE</small></div></div>
      <div className="side-label">WORKSPACE</div>{nav.map(n=><button key={n} className={tab===n?'nav active':'nav'} onClick={()=>setTab(n)}>{n}</button>)}
      <div className="side-bottom"><div className="admin-dot">SA</div><div><b>Super Admin</b><small>{user.email}</small></div><button className="logout" onClick={logout}>↗</button></div>
    </aside>
    <main className="main"><header><div><p className="eyebrow">DEVICE MANAGEMENT / {tab.toUpperCase()}</p><h1>{tab}</h1></div><div className="header-right"><span className="secure">● Secure session</span><button className="ghost" onClick={()=>load()}>↻ Refresh</button></div></header>
      {error && <div className="notice">{error}</div>}
      {tab==='Overview' && <><div className="welcome"><div><h2>Enterprise command center</h2><p>Manage authorized company devices and employee Work Profiles.</p></div><span className="capacity">FLEET CAPACITY · 200+</span></div>
        <div className="grid stats">{[['Total devices',summary?.total ?? '—'],['Online',summary?.online ?? '—'],['Offline',summary?.offline ?? '—'],['Non-compliant',summary?.non_compliant ?? '—']].map(([a,b])=><div className="card stat" key={a}><p>{a}</p><strong>{b}</strong><small>Registered inventory</small></div>)}</div>
        <div className="grid two"><section className="card panel"><h3>Ownership breakdown</h3><div className="breakdown"><div><b>{summary?.company_owned ?? '—'}</b><span>Company-owned · Fully managed</span></div><div><b>{summary?.employee_owned ?? '—'}</b><span>Employee-owned · Work Profile</span></div></div></section>
        <section className="card panel"><h3>Android Enterprise connection</h3><p className="muted">{summary?.android_enterprise?.note || 'Checking integration…'}</p><span className="tag warn">NOT CONNECTED</span></section></div>
        <section className="card panel"><h3>Recent security events</h3>{summary?.recent_events?.length ? summary.recent_events.map(e=><div className="row" key={e.id}><span className={`severity ${e.severity.toLowerCase()}`}>{e.severity}</span><div><b>{e.title}</b><small>{e.description}</small></div><time>{new Date(e.created_at).toLocaleString()}</time></div>) : <p className="muted">No security events recorded. Live security telemetry is not connected.</p>}</section>
      </>}
      {tab==='Devices' && <section className="card panel"><h3>Device inventory <span className="count">{devices.length} records</span></h3><div className="table-wrap"><table><thead><tr><th>Asset tag</th><th>Device</th><th>Ownership</th><th>Assigned to</th><th>Status</th><th>Compliance</th><th>Enrolled</th></tr></thead><tbody>{devices.map(d=><tr key={d.id}><td>{d.asset_tag}</td><td>{d.display_name}<small>{[d.manufacturer,d.model].filter(Boolean).join(' ')}</small></td><td>{d.ownership_type==='COMPANY_OWNED'?'Company-owned':'Employee-owned'}</td><td>{d.assigned_to || '—'}</td><td><span className="tag">{d.status}</span></td><td>{d.compliance_status}</td><td>{d.enrolled?'Yes':'No'}</td></tr>)}</tbody></table>{!devices.length && <p className="muted">No device inventory records yet. Register devices through the secured API.</p>}</div></section>}
      {tab==='Audit Logs' && <section className="card panel"><h3>Administrative audit history</h3>{logs.map(l=><div className="row" key={l.id}><span className="tag">{l.action}</span><div><b>{l.actor_email}</b><small>{l.target_type || '—'} · {l.target_id || '—'}</small></div><time>{new Date(l.created_at).toLocaleString()}</time></div>)}</section>}
      {!['Overview','Devices','Audit Logs'].includes(tab) && <section className="card panel"><h3>{tab}</h3><p className="muted">Module scaffold. Connect the approved Android Enterprise integration and configure policy before enabling live actions.</p></section>}
      <footer>NEXUS PRO ENTERPRISE <span>Authorized management only · Employee personal data stays private</span></footer>
    </main>
  </div>;
}
