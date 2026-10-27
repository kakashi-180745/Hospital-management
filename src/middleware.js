// Auth guards, flash messages and template helpers
const { db } = require('./db');

// Wrap async route handlers so thrown errors reach the error middleware
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    req.session.redirectTo = req.originalUrl;
    req.session.flash = req.session.flash || {};
    (req.session.flash.error ||= []).push('Please log in to continue.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Access denied',
        code: 403,
        message: 'You do not have permission to access this page.'
      });
    }
    next();
  };
}

// Attach current user record + flash messages + view helpers to every render
function injectLocals(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.user) {
    const { role, id } = req.session.user;
    const table = role === 'admin' ? 'admins' : 'users';
    res.locals.currentUser = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (res.locals.currentUser) res.locals.currentUser.role = role;
  }

  const flash = req.session.flash || {};
  res.locals.flash = {
    success: flash.success || [],
    error: flash.error || []
  };
  req.session.flash = { success: [], error: [] };

  res.locals.formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value + (value.length === 10 ? 'T00:00:00' : 'Z'));
    if (isNaN(d)) return value;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  res.locals.formatDateTime = (value) => {
    if (!value) return '—';
    const d = new Date(value.replace(' ', 'T') + 'Z');
    if (isNaN(d)) return value;
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };
  res.locals.timeLabel = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  res.locals.statusBadge = (status) => {
    const map = {
      pending: 'badge-warning',
      confirmed: 'badge-info',
      completed: 'badge-success',
      cancelled: 'badge-danger',
      paid: 'badge-success',
      unpaid: 'badge-danger',
      active: 'badge-success',
      inactive: 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
  };
  res.locals.inr = (n) =>
    '₹' + Number(n || 0).toLocaleString('en-IN');

  next();
}

module.exports = {
  asyncHandler,
  requireAuth,
  requireRole,
  injectLocals
};
