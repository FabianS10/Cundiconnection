import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { all, get, initDb, run } from './db.js';
import { publicUser, requireAdmin, requireAuth, signToken } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'ucundinamarca.edu.co';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const gradientOptions = ['violet', 'cyan', 'pink', 'amber', 'emerald', 'blue'];

// ── Upload directory ──────────────────────────────────────────────────────────
const uploadsDir = join(__dirname, '..', 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPEG, PNG, WebP, or GIF allowed'), ok);
  }
});

// ── CORS / Middleware ─────────────────────────────────────────────────────────

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  CLIENT_ORIGIN,
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allows curl/Postman/server-to-server requests where Origin is missing.
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('❌ CORS blocked origin:', origin);
    console.log('✅ Allowed origins:', allowedOrigins);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};

app.use(cors(corsOptions));

// Express 5-safe wildcard OPTIONS handler.
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeEmail(email = '') {
  return email.trim().toLowerCase();
}

function hasAllowedDomain(email) {
  return normalizeEmail(email).endsWith(`@${ALLOWED_DOMAIN}`);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

async function seedAdmin() {
  const email = normalizeEmail(
    process.env.FIRST_ADMIN_EMAIL || 'fandressabogal@ucundinamarca.edu.co'
  );

  const password = process.env.FIRST_ADMIN_PASSWORD || 'CundiConnection#2026';

  const existing = await get('SELECT * FROM users WHERE email = ?', [email]);

  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await run(
    `INSERT INTO users
      (email, password_hash, display_name, campus, program, semester, bio, interests, avatar_gradient, status, role, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'admin', CURRENT_TIMESTAMP)`,
    [
      email,
      passwordHash,
      'Fabian Sabogal',
      'Fusagasugá',
      'Ingeniería de Sistemas',
      'Founder Mode',
      'Admin gatekeeper de Cundiconnection.',
      'AI, startups, dark UI',
      'violet'
    ]
  );

  console.log(`Seeded admin: ${email}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'Cundiconnection API',
    allowedDomain: ALLOWED_DOMAIN,
    clientOrigin: CLIENT_ORIGIN,
    corsOrigins: allowedOrigins,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = str(req.body.password);
    const displayName = str(req.body.displayName);

    if (!email || !password || !displayName) {
      return res.status(400).json({
        message: 'Email, password, and display name are required.'
      });
    }

    if (!hasAllowedDomain(email)) {
      return res.status(400).json({
        message: `Only @${ALLOWED_DOMAIN} emails can request access.`
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters.'
      });
    }

    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);

    if (existing) {
      return res.status(409).json({
        message: 'This email already requested access or exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const gradient = gradientOptions[Math.floor(Math.random() * gradientOptions.length)];

    await run(
      `INSERT INTO users
       (email, password_hash, display_name, campus, program, semester, bio, interests, avatar_gradient, status, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'student')`,
      [
        email,
        passwordHash,
        displayName,
        str(req.body.campus, 'Fusagasugá'),
        str(req.body.program),
        str(req.body.semester),
        str(req.body.bio),
        str(req.body.interests),
        gradient
      ]
    );

    res.status(201).json({
      message: 'Access request received. The admin must verify and approve your profile before login.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not create access request.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = str(req.body.password);

    const user = await get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({
        message: 'Your profile is pending admin approval.'
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({
        message: 'Your access request was rejected.'
      });
    }

    await run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const fresh = await get('SELECT * FROM users WHERE id = ?', [user.id]);

    res.json({
      token: signToken(fresh),
      user: publicUser(fresh)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login failed.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROFILE & AVATAR UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch('/api/me', requireAuth, async (req, res) => {
  try {
    await run(
      `UPDATE users SET display_name=?, campus=?, program=?, semester=?, bio=?, interests=? WHERE id=?`,
      [
        str(req.body.displayName, req.user.display_name),
        str(req.body.campus, req.user.campus),
        str(req.body.program, req.user.program),
        str(req.body.semester, req.user.semester),
        str(req.body.bio, req.user.bio),
        str(req.body.interests, req.user.interests),
        req.user.id
      ]
    );

    const fresh = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    res.json({ user: publicUser(fresh) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Profile update failed.' });
  }
});

app.post('/api/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided.' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    await run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);

    res.json({ avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Avatar upload failed.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DISCOVERY & SWIPES & MATCHES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/profiles', requireAuth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, email, display_name, campus, program, semester, bio, interests, avatar_gradient, avatar_url
       FROM users
       WHERE status = 'approved'
         AND id != ?
         AND id NOT IN (SELECT swiped_id FROM swipes WHERE swiper_id = ?)
       ORDER BY created_at DESC
       LIMIT 25`,
      [req.user.id, req.user.id]
    );

    res.json({ profiles: rows.map(publicUser) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load profiles.' });
  }
});

app.post('/api/swipes', requireAuth, async (req, res) => {
  try {
    const swipedId = Number(req.body.swipedId);
    const action = req.body.action === 'like' ? 'like' : 'pass';

    if (!swipedId || swipedId === req.user.id) {
      return res.status(400).json({ message: 'Invalid target profile.' });
    }

    const target = await get('SELECT id, status FROM users WHERE id = ?', [swipedId]);

    if (!target || target.status !== 'approved') {
      return res.status(404).json({ message: 'Profile not available.' });
    }

    await run(
      `INSERT INTO swipes (swiper_id, swiped_id, action) VALUES (?, ?, ?)
       ON CONFLICT(swiper_id, swiped_id) DO UPDATE SET action = excluded.action, created_at = CURRENT_TIMESTAMP`,
      [req.user.id, swipedId, action]
    );

    const mutual = action === 'like'
      ? await get(
          `SELECT id FROM swipes WHERE swiper_id = ? AND swiped_id = ? AND action = 'like'`,
          [swipedId, req.user.id]
        )
      : null;

    res.json({ matched: Boolean(mutual) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Swipe failed.' });
  }
});

app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT u.id, u.email, u.display_name, u.campus, u.program, u.semester, u.bio, u.interests, u.avatar_gradient, u.avatar_url
       FROM users u
       WHERE u.status = 'approved'
         AND EXISTS (SELECT 1 FROM swipes s1 WHERE s1.swiper_id = ? AND s1.swiped_id = u.id AND s1.action = 'like')
         AND EXISTS (SELECT 1 FROM swipes s2 WHERE s2.swiper_id = u.id AND s2.swiped_id = ? AND s2.action = 'like')
       ORDER BY u.display_name ASC`,
      [req.user.id, req.user.id]
    );

    res.json({ matches: rows.map(publicUser) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load matches.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/pending', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await all(
    `SELECT id, email, display_name, campus, program, semester, bio, interests, avatar_gradient, avatar_url, status, created_at, admin_note
     FROM users WHERE status = 'pending' ORDER BY created_at ASC`
  );

  res.json({ pending: rows.map(publicUser) });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await all(
    `SELECT id, email, display_name, campus, program, semester, bio, interests, avatar_gradient, avatar_url,
            status, role, created_at, approved_at, last_login_at, admin_note
     FROM users ORDER BY created_at DESC LIMIT 200`
  );

  res.json({ users: rows.map(publicUser) });
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [totals, daily, campuses, programs, swipeStats, matchCount] = await Promise.all([
      all(`SELECT status, COUNT(*) as count FROM users GROUP BY status`),

      all(`
        SELECT date(created_at) as day, COUNT(*) as count
        FROM users
        WHERE created_at >= date('now', '-13 days')
        GROUP BY date(created_at)
        ORDER BY day ASC
      `),

      all(`
        SELECT campus, COUNT(*) as count
        FROM users
        WHERE status='approved' AND campus != ''
        GROUP BY campus
        ORDER BY count DESC
        LIMIT 8
      `),

      all(`
        SELECT program, COUNT(*) as count
        FROM users
        WHERE status='approved' AND program != ''
        GROUP BY program
        ORDER BY count DESC
        LIMIT 8
      `),

      all(`SELECT action, COUNT(*) as count FROM swipes GROUP BY action`),

      get(`
        SELECT COUNT(*) as count FROM (
          SELECT DISTINCT
            CASE
              WHEN s1.swiper_id < s2.swiper_id
              THEN s1.swiper_id || '-' || s2.swiper_id
              ELSE s2.swiper_id || '-' || s1.swiper_id
            END as pair
          FROM swipes s1
          JOIN swipes s2
            ON s1.swiper_id = s2.swiped_id
           AND s1.swiped_id = s2.swiper_id
          WHERE s1.action = 'like' AND s2.action = 'like'
        )
      `)
    ]);

    const statusMap = Object.fromEntries(totals.map(r => [r.status, r.count]));
    const swipeMap = Object.fromEntries(swipeStats.map(r => [r.action, r.count]));

    const now = new Date();
    const filledDaily = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);

      const key = d.toISOString().slice(0, 10);
      const found = daily.find(r => r.day === key);

      filledDaily.push({
        day: key,
        count: found ? found.count : 0
      });
    }

    res.json({
      users: {
        total: (statusMap.pending || 0) + (statusMap.approved || 0) + (statusMap.rejected || 0),
        pending: statusMap.pending || 0,
        approved: statusMap.approved || 0,
        rejected: statusMap.rejected || 0,
      },
      matches: matchCount?.count || 0,
      swipes: {
        total: (swipeMap.like || 0) + (swipeMap.pass || 0),
        likes: swipeMap.like || 0,
        passes: swipeMap.pass || 0,
        likeRate: swipeMap.like && swipeMap.pass
          ? Math.round((swipeMap.like / (swipeMap.like + swipeMap.pass)) * 100)
          : 0
      },
      daily: filledDaily,
      campuses,
      programs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load stats.' });
  }
});

app.get('/api/admin/audit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const rows = await all(
      `SELECT a.id, a.action, a.note, a.created_at,
              admin.display_name as admin_name, admin.email as admin_email,
              target.display_name as target_name, target.email as target_email
       FROM admin_audit a
       LEFT JOIN users admin ON a.admin_id = admin.id
       LEFT JOIN users target ON a.target_user_id = target.id
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({ log: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load audit log.' });
  }
});

app.post('/api/admin/users/:id/decision', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const decision = req.body.decision === 'approve' ? 'approved' : 'rejected';
    const note = str(req.body.note);

    const target = await get('SELECT * FROM users WHERE id = ?', [targetId]);

    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (target.role === 'admin' && decision === 'rejected') {
      return res.status(400).json({
        message: 'Admin accounts cannot be rejected from here.'
      });
    }

    await run(
      `UPDATE users SET status = ?, admin_note = ?,
       approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END
       WHERE id = ?`,
      [decision, note, decision, targetId]
    );

    await run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, note) VALUES (?, ?, ?, ?)`,
      [req.user.id, targetId, decision, note]
    );

    const fresh = await get('SELECT * FROM users WHERE id = ?', [targetId]);

    res.json({ user: publicUser(fresh) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Decision failed.' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    const target = await get('SELECT * FROM users WHERE id = ?', [targetId]);

    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (target.role === 'admin') {
      return res.status(400).json({ message: 'Cannot delete admin accounts.' });
    }

    await run('DELETE FROM swipes WHERE swiper_id = ? OR swiped_id = ?', [targetId, targetId]);
    await run('DELETE FROM users WHERE id = ?', [targetId]);

    await run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, note) VALUES (?, NULL, 'deleted', ?)`,
      [req.user.id, `Deleted user: ${target.email}`]
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Delete failed.' });
  }
});

app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const role = req.body.role === 'admin' ? 'admin' : 'student';

    await run('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);

    await run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, note) VALUES (?, ?, 'role_change', ?)`,
      [req.user.id, targetId, `Role changed to ${role}`]
    );

    const fresh = await get('SELECT * FROM users WHERE id = ?', [targetId]);

    res.json({ user: publicUser(fresh) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Role update failed.' });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('🔥 Server error:', err);

  res.status(err.status || 500).json({
    message: err.message || 'Server error',
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// ── Startup ───────────────────────────────────────────────────────────────────

await initDb();
await seedAdmin();

app.listen(PORT, () => {
  console.log(`🔥 Cundiconnection API running on port ${PORT}`);
  console.log(`🎓 Allowed email domain: ${ALLOWED_DOMAIN}`);
  console.log(`🌐 Client origin: ${CLIENT_ORIGIN}`);
  console.log('✅ Allowed CORS origins:', allowedOrigins);
});