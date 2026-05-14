import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, BarChart2, Bell, Check, ChevronDown, ChevronRight,
  Eye, EyeOff, Flame, Heart, Lock, LogOut, RefreshCw, Search, Shield,
  ShieldCheck, Sparkles, Trash2, UserCheck, UserCog, UserRoundX, Users,
  X, Zap
} from 'lucide-react';
import { api } from './api';
import type { AdminStats, AuditEntry, RegisterPayload, User } from './types';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000';

const EMPTY_REGISTER: RegisterPayload = {
  email: '', password: '', displayName: '', campus: 'Fusagasugá',
  program: '', semester: '', bio: '', interests: ''
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function avatarSrc(user: User) {
  if (user.avatarUrl) return `${API_BASE}${user.avatarUrl}`;
  return null;
}

function gradientClass(g = 'violet') { return `avatar avatar-${g}`; }

function AvatarDisplay({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' | 'lg' }) {
  const src = avatarSrc(user);
  const cls = `${gradientClass(user.avatarGradient)} avatar-${size}`;
  if (src) return <img src={src} alt={user.displayName} className={`avatar-img avatar-${size}`} />;
  return <div className={cls}>{user.displayName.slice(0, 1).toUpperCase()}</div>;
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '8+ characters'}
        autoComplete="current-password"
      />
      <button type="button" className="pw-eye" onClick={() => setShow(s => !s)} tabIndex={-1}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [token, setToken] = useState(() => localStorage.getItem('cundi_token') || '');
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<'discover' | 'matches' | 'profile' | 'admin'>('discover');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState<RegisterPayload>(EMPTY_REGISTER);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [matches, setMatches] = useState<User[]>([]);
  const [pending, setPending] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [toast, setToast] = useState<{ msg: string; type?: 'ok' | 'err' | 'match' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [matchFlash, setMatchFlash] = useState<User | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' | 'match' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!token) return;
    api.me(token).then(({ user }) => setUser(user)).catch(() => logout());
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    refreshCore();
    if (user.role === 'admin') {
      pollRef.current = setInterval(() => {
        api.pending(token).then(({ pending }) => setPending(pending)).catch(() => {});
      }, 30_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, user?.id]);

  async function refreshCore() {
    if (!token) return;
    const [{ profiles }, { matches }] = await Promise.all([api.profiles(token), api.matches(token)]);
    setProfiles(profiles);
    setMatches(matches);
    if (user?.role === 'admin') refreshAdmin();
  }

  async function refreshAdmin() {
    if (!token) return;
    const [{ pending: p }, { users }] = await Promise.all([api.pending(token), api.users(token)]);
    setPending(p);
    setAllUsers(users);
  }

  function logout() {
    if (pollRef.current) clearInterval(pollRef.current);
    localStorage.removeItem('cundi_token');
    setToken(''); setUser(null); setProfiles([]); setMatches([]);
    setPending([]); setAllUsers([]); setTab('discover');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const session = await api.login(email, password);
      localStorage.setItem('cundi_token', session.token);
      setToken(session.token); setUser(session.user);
      showToast(`Welcome back, ${session.user.displayName}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Login failed', 'err');
    } finally { setBusy(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const res = await api.register(register);
      showToast(res.message);
      setRegister(EMPTY_REGISTER); setMode('login');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Registration failed', 'err');
    } finally { setBusy(false); }
  }

  async function swipe(action: 'like' | 'pass') {
    if (!token || !profiles[0]) return;
    const swiped = profiles[0];
    setProfiles(p => p.slice(1));
    try {
      const res = await api.swipe(token, swiped.id, action);
      if (res.matched) {
        setMatchFlash(swiped);
        const { matches: m } = await api.matches(token);
        setMatches(m);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Swipe failed', 'err');
    }
  }

  async function decide(id: number, decision: 'approve' | 'reject', note = '') {
    if (!token) return;
    const autoNote = decision === 'approve'
      ? 'Cross-referenced and approved by admin.'
      : note || 'Rejected by admin verification gate.';
    await api.decision(token, id, decision, autoNote);
    showToast(decision === 'approve' ? '✓ Student approved.' : '✗ Request rejected.', decision === 'approve' ? 'ok' : 'err');
    refreshAdmin();
  }

  const pendingCount = pending.length;

  // ── AUTH SCREEN ─────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="shell auth-shell">
        <section className="hero-panel glass">
          <div className="brand-mark"><Zap size={20} /> Cundiconnection</div>
          <h1>Campus sparks.<br />Verified humans.<br />No outsiders.</h1>
          <p>A university-only matching experience locked behind <strong>@ucundinamarca.edu.co</strong> and manual admin approval.</p>
          <div className="hero-grid">
            <span><ShieldCheck size={16} /> Domain gate</span>
            <span><UserCheck size={16} /> Admin verified</span>
            <span><Sparkles size={16} /> Dark neon UX</span>
          </div>
          <div className="orb orb-one" /><div className="orb orb-two" />
        </section>

        <section className="auth-card glass">
          <div className="switcher">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Request access</button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="form-stack">
              <label>Email
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@ucundinamarca.edu.co" autoComplete="email" />
              </label>
              <label>Password
                <PasswordInput value={password} onChange={setPassword} />
              </label>
              <button className="primary" disabled={busy}>
                <Lock size={16} /> {busy ? 'Entering…' : 'Enter the gate'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="form-stack two-col-form">
              <label>Email
                <input placeholder="name@ucundinamarca.edu.co" value={register.email}
                  onChange={e => setRegister({ ...register, email: e.target.value })} />
              </label>
              <label>Password
                <PasswordInput value={register.password} onChange={v => setRegister({ ...register, password: v })} />
              </label>
              <label>Display name
                <input value={register.displayName} onChange={e => setRegister({ ...register, displayName: e.target.value })} />
              </label>
              <label>Campus
                <input value={register.campus} onChange={e => setRegister({ ...register, campus: e.target.value })} />
              </label>
              <label>Program
                <input placeholder="Ingeniería, Psicología…" value={register.program}
                  onChange={e => setRegister({ ...register, program: e.target.value })} />
              </label>
              <label>Semester
                <input placeholder="5th, 8th…" value={register.semester}
                  onChange={e => setRegister({ ...register, semester: e.target.value })} />
              </label>
              <label className="wide">Bio
                <textarea placeholder="Tell the campus who you are." value={register.bio}
                  onChange={e => setRegister({ ...register, bio: e.target.value })} />
              </label>
              <label className="wide">Interests
                <input placeholder="AI, gym, anime, entrepreneurship…" value={register.interests}
                  onChange={e => setRegister({ ...register, interests: e.target.value })} />
              </label>
              <button className="primary wide" disabled={busy}>
                <ShieldCheck size={16} /> {busy ? 'Sending…' : 'Send to admin verification'}
              </button>
            </form>
          )}
          {toast && <div className={`toast toast-${toast.type || 'ok'}`}>{toast.msg}</div>}
        </section>
      </main>
    );
  }

  // ── APP SHELL ───────────────────────────────────────────────────────────────
  return (
    <main className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar glass">
        <div className="brand-mark"><Zap size={18} /> Cundiconnection</div>
        <div className="sidebar-avatar">
          <AvatarDisplay user={user} size="lg" />
        </div>
        <h2>{user.displayName}</h2>
        <p className="sidebar-sub">{user.program || 'University profile'} · {user.campus}</p>
        <nav>
          <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
            <Flame size={16} /> Discover
          </button>
          <button className={tab === 'matches' ? 'active' : ''} onClick={() => setTab('matches')}>
            <Heart size={16} /> Matches {matches.length > 0 && <b className="badge">{matches.length}</b>}
          </button>
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            <UserCog size={16} /> Profile
          </button>
          {user.role === 'admin' && (
            <button className={tab === 'admin' ? 'active' : ''} onClick={() => { setTab('admin'); refreshAdmin(); }}>
              <Shield size={16} /> Admin Gate
              {pendingCount > 0 && <b className="badge badge-red">{pendingCount}</b>}
            </button>
          )}
        </nav>
        <button className="ghost logout-btn" onClick={logout}><LogOut size={15} /> Logout</button>
      </aside>

      {/* ── Content ── */}
      <section className="content">
        <header className="topbar glass">
          <div>
            <span className="eyebrow">Verified campus social layer</span>
            <h1>{tab === 'discover' ? 'Find your spark' : tab === 'admin' ? 'Admin Control Center' : tab === 'matches' ? 'Your matches' : 'Edit profile'}</h1>
          </div>
          <div className="stat-strip">
            <span><Heart size={13} /> {matches.length} matches</span>
            {user.role === 'admin' && pendingCount > 0 && (
              <span className="stat-alert"><Bell size={13} /> {pendingCount} pending</span>
            )}
          </div>
        </header>

        {tab === 'discover' && (
          <DiscoverTab profiles={profiles} swipe={swipe} matchFlash={matchFlash} setMatchFlash={setMatchFlash} />
        )}
        {tab === 'matches' && (
          <section className="panel glass">
            <h2>Mutual sparks</h2>
            {matches.length === 0
              ? <p className="muted">No matches yet. Hit Discover and start cooking.</p>
              : <div className="cards-grid">{matches.map(u => <ProfileCard key={u.id} profile={u} />)}</div>}
          </section>
        )}
        {tab === 'profile' && (
          <ProfileEditor token={token} user={user} setUser={setUser} showToast={showToast} />
        )}
        {tab === 'admin' && user.role === 'admin' && (
          <AdminCenter
            token={token} pending={pending} allUsers={allUsers}
            decide={decide} refreshAdmin={refreshAdmin} showToast={showToast}
          />
        )}
      </section>

      {/* ── Toast ── */}
      {toast && <div className={`toast floating toast-${toast.type || 'ok'}`}>{toast.msg}</div>}
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  DISCOVER TAB
// ════════════════════════════════════════════════════════════════════════════════
function DiscoverTab({ profiles, swipe, matchFlash, setMatchFlash }: {
  profiles: User[];
  swipe: (a: 'like' | 'pass') => void;
  matchFlash: User | null;
  setMatchFlash: (u: User | null) => void;
}) {
  const current = profiles[0];
  const next = profiles[1];

  return (
    <section className="discover-grid">
      <div className="swipe-stage glass">
        {/* stacked card shadow */}
        {next && <div className="card-stack-bg" />}
        {current
          ? <ProfileCard profile={current} large />
          : (
            <div className="empty-state">
              <Flame size={52} />
              <h2>No more profiles right now.</h2>
              <p>Come back after new registrations are approved.</p>
            </div>
          )}
        {current && (
          <div className="actions">
            <button className="action-btn reject" onClick={() => swipe('pass')} title="Pass">
              <X size={28} />
            </button>
            <button className="action-btn like" onClick={() => swipe('like')} title="Like">
              <Heart size={28} />
            </button>
          </div>
        )}
        {matchFlash && (
          <div className="match-overlay" onClick={() => setMatchFlash(null)}>
            <div className="match-card glass">
              <Sparkles size={40} />
              <h2>It's a match!</h2>
              <AvatarDisplay user={matchFlash} size="lg" />
              <p>You and <strong>{matchFlash.displayName}</strong> both liked each other.</p>
              <button className="primary" onClick={() => setMatchFlash(null)}>Keep swiping</button>
            </div>
          </div>
        )}
      </div>
      <div className="rules-card glass">
        <h3>How it works</h3>
        <p>Every profile starts pending. Only the admin approves accounts after cross-referencing.</p>
        <ul>
          <li>Only @ucundinamarca.edu.co emails</li>
          <li>Rejected users cannot log in</li>
          <li>Mutual likes become matches</li>
        </ul>
        {profiles.length > 0 && (
          <div className="queue-count"><Flame size={14} /> {profiles.length} profiles in queue</div>
        )}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  PROFILE CARD
// ════════════════════════════════════════════════════════════════════════════════
function ProfileCard({ profile, large }: { profile: User; large?: boolean }) {
  const src = avatarSrc(profile);
  return (
    <article className={`profile-card ${large ? 'profile-card-large' : ''}`}
      style={src ? { backgroundImage: `url(${src})` } : {}}>
      <div className="card-gradient-overlay" />
      <div className="card-content">
        {!src && (
          <div className={gradientClass(profile.avatarGradient)} style={{ marginBottom: 'auto' }}>
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="chip">{profile.email.split('@')[1]}</span>
        <h2>{profile.displayName}</h2>
        <p className="program">{profile.program || 'Program not set'} · {profile.semester || '?'} sem · {profile.campus}</p>
        <p className="bio-text">{profile.bio || 'Mysterious campus energy.'}</p>
        <div className="interest-row">
          {(profile.interests || '').split(',').filter(Boolean).slice(0, 5).map(item => (
            <span key={item}>{item.trim()}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  PROFILE EDITOR
// ════════════════════════════════════════════════════════════════════════════════
function ProfileEditor({ token, user, setUser, showToast }: {
  token: string; user: User;
  setUser: (u: User) => void;
  showToast: (m: string, t?: 'ok' | 'err' | 'match') => void;
}) {
  const [draft, setDraft] = useState(user);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(avatarSrc(user));
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { user: updated } = await api.updateMe(token, draft);
      setUser(updated); showToast('Profile updated.');
    } catch { showToast('Update failed.', 'err'); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Max file size is 5 MB.', 'err'); return; }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { avatarUrl } = await api.uploadAvatar(token, file);
      const { user: updated } = await api.me(token);
      setUser(updated);
      showToast('Photo updated!');
    } catch { showToast('Upload failed.', 'err'); setPreview(avatarSrc(user)); }
    finally { setUploading(false); }
  }

  return (
    <section className="panel glass">
      <h2>Polish your signal</h2>

      {/* Avatar upload */}
      <div className="avatar-upload-section">
        <div className="avatar-upload-ring" onClick={() => fileRef.current?.click()}>
          {preview
            ? <img src={preview} alt="avatar" className="avatar-img avatar-xl" />
            : <div className={`${gradientClass(user.avatarGradient)} avatar-xl`}>{user.displayName.slice(0,1).toUpperCase()}</div>}
          <div className="avatar-upload-overlay">
            {uploading ? <RefreshCw size={22} className="spin" /> : <span>Change photo</span>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden-file-input" onChange={handleFileChange} />
        <p className="upload-hint">JPEG, PNG, WebP or GIF · max 5 MB</p>
      </div>

      <form className="form-stack two-col-form" onSubmit={save}>
        <label>Name<input value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })} /></label>
        <label>Campus<input value={draft.campus || ''} onChange={e => setDraft({ ...draft, campus: e.target.value })} /></label>
        <label>Program<input value={draft.program || ''} onChange={e => setDraft({ ...draft, program: e.target.value })} /></label>
        <label>Semester<input value={draft.semester || ''} onChange={e => setDraft({ ...draft, semester: e.target.value })} /></label>
        <label className="wide">Bio<textarea value={draft.bio || ''} onChange={e => setDraft({ ...draft, bio: e.target.value })} /></label>
        <label className="wide">Interests<input placeholder="AI, gym, salsa, entrepreneurship…" value={draft.interests || ''} onChange={e => setDraft({ ...draft, interests: e.target.value })} /></label>
        <button className="primary wide"><Check size={16} /> Save profile</button>
      </form>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  ADMIN CENTER
// ════════════════════════════════════════════════════════════════════════════════
type AdminTab = 'queue' | 'users' | 'analytics' | 'audit';

function AdminCenter({ token, pending, allUsers, decide, refreshAdmin, showToast }: {
  token: string; pending: User[]; allUsers: User[];
  decide: (id: number, d: 'approve' | 'reject', note?: string) => void;
  refreshAdmin: () => void;
  showToast: (m: string, t?: 'ok' | 'err' | 'match') => void;
}) {
  const [adminTab, setAdminTab] = useState<AdminTab>('queue');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  async function loadStats() {
    setLoadingStats(true);
    try {
      const s = await api.stats(token);
      setStats(s);
      const { log } = await api.auditLog(token);
      setAuditLog(log);
    } catch { showToast('Could not load stats.', 'err'); }
    finally { setLoadingStats(false); }
  }

  useEffect(() => {
    if (adminTab === 'analytics' || adminTab === 'audit') loadStats();
  }, [adminTab]);

  const approved = allUsers.filter(u => u.status === 'approved').length;
  const rejected = allUsers.filter(u => u.status === 'rejected').length;

  return (
    <div className="admin-layout">
      {/* ── Top metric strip ── */}
      <div className="admin-kpi-row">
        <KpiCard label="Total Users" value={allUsers.length} icon={<Users size={20} />} color="violet" />
        <KpiCard label="Approved" value={approved} icon={<UserCheck size={20} />} color="green" />
        <KpiCard label="Pending" value={pending.length} icon={<Bell size={20} />} color="amber" alert={pending.length > 0} />
        <KpiCard label="Rejected" value={rejected} icon={<UserRoundX size={20} />} color="red" />
        <KpiCard label="Matches" value={stats?.matches ?? '–'} icon={<Heart size={20} />} color="pink" />
        <KpiCard label="Like Rate" value={stats ? `${stats.swipes.likeRate}%` : '–'} icon={<Activity size={20} />} color="cyan" />
      </div>

      {/* ── Tab bar ── */}
      <div className="admin-tab-bar glass">
        {([
          ['queue',     <UserCheck size={15} />, 'Approval Queue', pending.length],
          ['users',     <Users size={15} />,     'User Management', null],
          ['analytics', <BarChart2 size={15} />, 'Analytics',       null],
          ['audit',     <Activity size={15} />,  'Audit Log',       null],
        ] as [AdminTab, React.ReactNode, string, number | null][]).map(([key, icon, label, count]) => (
          <button key={key} className={`admin-tab-btn ${adminTab === key ? 'active' : ''}`}
            onClick={() => setAdminTab(key)}>
            {icon} {label}
            {count !== null && count > 0 && <b className="badge badge-red">{count}</b>}
          </button>
        ))}
        <button className="admin-refresh ghost" onClick={() => { refreshAdmin(); if (adminTab === 'analytics') loadStats(); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {adminTab === 'queue'     && <ApprovalQueue pending={pending} decide={decide} />}
      {adminTab === 'users'     && <UserManagement token={token} users={allUsers} refreshAdmin={refreshAdmin} showToast={showToast} />}
      {adminTab === 'analytics' && <AnalyticsPanel stats={stats} loading={loadingStats} />}
      {adminTab === 'audit'     && <AuditLogPanel log={auditLog} loading={loadingStats} />}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, alert }: {
  label: string; value: number | string;
  icon: React.ReactNode; color: string; alert?: boolean;
}) {
  return (
    <div className={`kpi-card glass kpi-${color} ${alert ? 'kpi-alert' : ''}`}>
      <div className="kpi-icon">{icon}</div>
      <div>
        <strong className="kpi-value">{value}</strong>
        <span className="kpi-label">{label}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  APPROVAL QUEUE
// ════════════════════════════════════════════════════════════════════════════════
function ApprovalQueue({ pending, decide }: {
  pending: User[];
  decide: (id: number, d: 'approve' | 'reject', note?: string) => void;
}) {
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<number | null>(null);

  if (pending.length === 0) {
    return (
      <div className="panel glass empty-state">
        <ShieldCheck size={44} />
        <h2>Queue is clear</h2>
        <p>No pending access requests. The gate is clean.</p>
      </div>
    );
  }

  return (
    <div className="queue-list panel glass">
      <div className="panel-heading">
        <h2>Requests awaiting cross-reference</h2>
        <span className="muted">{pending.length} pending</span>
      </div>
      {pending.map(student => {
        const src = avatarSrc(student);
        const open = expanded === student.id;
        return (
          <div key={student.id} className={`request-row ${open ? 'request-row-open' : ''}`}>
            <div className="request-main" onClick={() => setExpanded(open ? null : student.id)}>
              <div className="request-avatar">
                {src
                  ? <img src={src} alt={student.displayName} className="avatar-img avatar-sm" />
                  : <div className={`${gradientClass(student.avatarGradient)} avatar-sm`}>{student.displayName.slice(0,1).toUpperCase()}</div>}
              </div>
              <div className="request-info">
                <strong>{student.displayName}</strong>
                <p>{student.email}</p>
                <p className="muted">{student.program || 'No program'} · {student.campus} · Registered {new Date(student.createdAt || '').toLocaleDateString()}</p>
              </div>
              <ChevronDown size={18} className={`chevron ${open ? 'chevron-up' : ''}`} />
            </div>

            {open && (
              <div className="request-detail">
                {student.bio && <p><strong>Bio:</strong> {student.bio}</p>}
                {student.interests && <p><strong>Interests:</strong> {student.interests}</p>}
                {student.semester && <p><strong>Semester:</strong> {student.semester}</p>}
                <label className="note-label">Admin note (optional)
                  <input value={notes[student.id] || ''} placeholder="Reason for decision…"
                    onChange={e => setNotes(n => ({ ...n, [student.id]: e.target.value }))} />
                </label>
                <div className="row-actions">
                  <button className="btn-approve" onClick={() => decide(student.id, 'approve', notes[student.id])}>
                    <UserCheck size={15} /> Approve
                  </button>
                  <button className="btn-deny" onClick={() => decide(student.id, 'reject', notes[student.id])}>
                    <UserRoundX size={15} /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════════
function UserManagement({ token, users, refreshAdmin, showToast }: {
  token: string; users: User[];
  refreshAdmin: () => void;
  showToast: (m: string, t?: 'ok' | 'err' | 'match') => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const filtered = useMemo(() => users.filter(u => {
    const matchStatus = filter === 'all' || u.status === filter;
    const matchSearch = !search || u.displayName.toLowerCase().includes(search.toLowerCase())
      || u.email.toLowerCase().includes(search.toLowerCase())
      || (u.program || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }), [users, search, filter]);

  async function handleDelete(id: number) {
    try {
      await api.deleteUser(token, id);
      showToast('User deleted.', 'ok');
      refreshAdmin();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'err');
    }
    setConfirmDelete(null);
  }

  async function handleRole(id: number, role: 'admin' | 'student') {
    try {
      await api.changeRole(token, id, role);
      showToast(`Role changed to ${role}.`);
      refreshAdmin();
    } catch { showToast('Role change failed.', 'err'); }
  }

  async function handleStatus(id: number, decision: 'approve' | 'reject') {
    try {
      await api.decision(token, id, decision, 'Status changed manually by admin.');
      showToast(`User ${decision}d.`);
      refreshAdmin();
    } catch { showToast('Status change failed.', 'err'); }
  }

  return (
    <div className="panel glass">
      <div className="panel-heading">
        <h2>User Base · {filtered.length}</h2>
        <div className="um-controls">
          <div className="search-box">
            <Search size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, program…" />
          </div>
          <div className="filter-tabs">
            {(['all', 'approved', 'pending', 'rejected'] as const).map(s => (
              <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="user-table">
        <div className="user-table-head">
          <span>User</span><span>Program · Campus</span><span>Last login</span><span>Status</span><span>Actions</span>
        </div>
        {filtered.length === 0
          ? <p className="muted" style={{ padding: '24px 0' }}>No users match this filter.</p>
          : filtered.map(u => (
            <div key={u.id} className="user-table-row">
              <div className="ut-user">
                <AvatarDisplay user={u} size="sm" />
                <div>
                  <strong>{u.displayName}</strong>
                  <p>{u.email}</p>
                </div>
              </div>
              <div className="ut-prog">
                <span>{u.program || '—'}</span>
                <span className="muted">{u.campus}</span>
              </div>
              <div className="ut-login muted">
                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
              </div>
              <div>
                <b className={`status-badge status-${u.status}`}>{u.status}</b>
                {u.role === 'admin' && <b className="role-badge">admin</b>}
              </div>
              <div className="ut-actions">
                {u.status !== 'approved' && (
                  <button className="icon-btn green" title="Approve" onClick={() => handleStatus(u.id, 'approve')}><UserCheck size={14} /></button>
                )}
                {u.status !== 'rejected' && u.role !== 'admin' && (
                  <button className="icon-btn red" title="Reject" onClick={() => handleStatus(u.id, 'reject')}><UserRoundX size={14} /></button>
                )}
                {u.role !== 'admin' && (
                  <button className="icon-btn violet" title="Promote to admin" onClick={() => handleRole(u.id, 'admin')}><Shield size={14} /></button>
                )}
                {u.role === 'admin' && (
                  <button className="icon-btn muted-btn" title="Demote to student" onClick={() => handleRole(u.id, 'student')}><UserCog size={14} /></button>
                )}
                {u.role !== 'admin' && (
                  confirmDelete === u.id
                    ? (
                      <span className="confirm-delete">
                        Sure?
                        <button className="icon-btn red" onClick={() => handleDelete(u.id)}><Check size={13} /></button>
                        <button className="icon-btn muted-btn" onClick={() => setConfirmDelete(null)}><X size={13} /></button>
                      </span>
                    )
                    : <button className="icon-btn red" title="Delete user" onClick={() => setConfirmDelete(u.id)}><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  ANALYTICS PANEL
// ════════════════════════════════════════════════════════════════════════════════
function AnalyticsPanel({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  if (loading || !stats) {
    return <div className="panel glass loading-state"><RefreshCw size={30} className="spin" /><p>Loading analytics…</p></div>;
  }
  const { users, swipes, daily, campuses, programs } = stats;
  const maxDaily = Math.max(...daily.map(d => d.count), 1);
  const total = users.total || 1;

  return (
    <div className="analytics-layout">
      {/* ── User Distribution donut ── */}
      <div className="panel glass analytics-card">
        <h3><Users size={16} /> User Distribution</h3>
        <DonutChart segments={[
          { label: 'Approved', value: users.approved, color: '#34d399' },
          { label: 'Pending',  value: users.pending,  color: '#f59e0b' },
          { label: 'Rejected', value: users.rejected, color: '#fb7185' },
        ]} total={users.total} />
      </div>

      {/* ── Swipe metrics ── */}
      <div className="panel glass analytics-card">
        <h3><Activity size={16} /> Engagement Metrics</h3>
        <div className="metric-list">
          <MetricRow label="Total swipes" value={swipes.total} />
          <MetricRow label="Likes sent" value={swipes.likes} />
          <MetricRow label="Passes" value={swipes.passes} />
          <MetricRow label="Like rate" value={`${swipes.likeRate}%`} highlight />
          <MetricRow label="Total matches" value={stats.matches} highlight />
          <MetricRow label="Match rate" value={swipes.likes > 0 ? `${Math.round((stats.matches * 2 / swipes.likes) * 100)}%` : '—'} />
        </div>
      </div>

      {/* ── Daily registrations bar chart ── */}
      <div className="panel glass analytics-card analytics-wide">
        <h3><BarChart2 size={16} /> Registrations — Last 14 Days</h3>
        <div className="bar-chart">
          {daily.map(d => (
            <div key={d.day} className="bar-col">
              <div className="bar-fill" style={{ height: `${(d.count / maxDaily) * 100}%` }}>
                {d.count > 0 && <span className="bar-val">{d.count}</span>}
              </div>
              <span className="bar-label">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Top campuses ── */}
      <div className="panel glass analytics-card">
        <h3>Top Campuses</h3>
        <div className="rank-list">
          {campuses.length === 0
            ? <p className="muted">No data yet.</p>
            : campuses.map((c, i) => (
              <div key={c.campus} className="rank-row">
                <span className="rank-num">{i + 1}</span>
                <span className="rank-name">{c.campus || 'Unknown'}</span>
                <div className="rank-bar-wrap">
                  <div className="rank-bar" style={{ width: `${(c.count / (campuses[0]?.count || 1)) * 100}%` }} />
                </div>
                <span className="rank-count">{c.count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* ── Top programs ── */}
      <div className="panel glass analytics-card">
        <h3>Top Programs</h3>
        <div className="rank-list">
          {programs.length === 0
            ? <p className="muted">No data yet.</p>
            : programs.map((p, i) => (
              <div key={p.program} className="rank-row">
                <span className="rank-num">{i + 1}</span>
                <span className="rank-name">{p.program || 'Unknown'}</span>
                <div className="rank-bar-wrap">
                  <div className="rank-bar rank-bar-cyan" style={{ width: `${(p.count / (programs[0]?.count || 1)) * 100}%` }} />
                </div>
                <span className="rank-count">{p.count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function DonutChart({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) {
  const r = 70; const cx = 90; const cy = 90; const stroke = 22;
  let offset = 0;
  const circ = 2 * Math.PI * r;
  const filled = segments.filter(s => s.value > 0);

  return (
    <div className="donut-wrap">
      <svg width={180} height={180} viewBox="0 0 180 180">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        {filled.map(seg => {
          const pct = seg.value / (total || 1);
          const dash = pct * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none"
              stroke={seg.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-(offset * circ) + circ / 4}
              strokeLinecap="round" />
          );
          offset += pct;
          return el;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize={28} fontWeight={900}>{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#a5a6bd" fontSize={11}>total</text>
      </svg>
      <div className="donut-legend">
        {segments.map(s => (
          <div key={s.label} className="legend-row">
            <span className="legend-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`metric-row ${highlight ? 'metric-highlight' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ════════════════════════════════════════════════════════════════════════════════
function AuditLogPanel({ log, loading }: { log: AuditEntry[]; loading: boolean }) {
  if (loading) return <div className="panel glass loading-state"><RefreshCw size={30} className="spin" /><p>Loading audit log…</p></div>;

  const actionColor: Record<string, string> = {
    approved: 'green', rejected: 'red', deleted: 'red', role_change: 'violet'
  };

  return (
    <div className="panel glass">
      <h2>Audit Log · {log.length} entries</h2>
      {log.length === 0
        ? <p className="muted">No admin actions recorded yet.</p>
        : (
          <div className="audit-table">
            <div className="audit-head">
              <span>Action</span><span>Target</span><span>Admin</span><span>Note</span><span>Date</span>
            </div>
            {log.map(e => (
              <div key={e.id} className="audit-row">
                <b className={`status-badge status-${actionColor[e.action] || 'muted'}`}>{e.action}</b>
                <span>{e.target_name || '(deleted)'} <span className="muted">· {e.target_email}</span></span>
                <span className="muted">{e.admin_name}</span>
                <span className="audit-note">{e.note || '—'}</span>
                <span className="muted">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────
createRoot(document.getElementById('root')!).render(<App />);
