import jwt from 'jsonwebtoken';
import { get } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-cundiconnection-secret-change-me';

export const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
  campus: user.campus,
  program: user.program,
  semester: user.semester,
  bio: user.bio,
  interests: user.interests,
  avatarGradient: user.avatar_gradient,
  avatarUrl: user.avatar_url || '',
  status: user.status,
  role: user.role,
  adminNote: user.admin_note,
  createdAt: user.created_at,
  approvedAt: user.approved_at,
  lastLoginAt: user.last_login_at
});

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, status: user.status },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing auth token.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(401).json({ message: 'Invalid session.' });
    if (user.status !== 'approved') return res.status(403).json({ message: 'Your account is not approved yet.' });

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}
