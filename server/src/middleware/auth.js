import jwt from 'jsonwebtoken';
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });
  next();
}
