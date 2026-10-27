const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');

const { db, initDb } = require('./src/db');
const { injectLocals, requireAuth, requireRole, asyncHandler } = require('./src/middleware');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const patientRoutes = require('./src/routes/patient');

const app = express();
const PORT = process.env.PORT || 3000;

initDb();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
// Support _method override from both the form body and the URL query string
app.use(methodOverride((req) => {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
  if (req.url.includes('?_method=') || req.url.includes('&_method=')) {
    try {
      return new URL(req.url, 'http://localhost').searchParams.get('_method');
    } catch {
      return undefined;
    }
  }
  return undefined;
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'hospital-management-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));

app.use(injectLocals);

// Real-time slot availability (used by booking forms in both portals)
app.get('/availability', requireAuth, (req, res) => {
  const doctorId = Number(req.query.doctor_id);
  const date = String(req.query.date || '');
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid doctor or date', booked: [] });
  }
  const rows = db.prepare(`
    SELECT time_slot FROM appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'
  `).all(doctorId, date);
  res.json({ booked: rows.map((r) => r.time_slot) });
});

app.use('/', authRoutes);

app.use('/admin', requireAuth, requireRole('admin'), adminRoutes);
app.use('/patient', requireAuth, requireRole('patient'), patientRoutes);

// Public landing page
app.get('/', (req, res) => {
  res.render('landing', { title: 'MediCare Hospital Management' });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found', code: 404,
    message: 'The page you are looking for does not exist or has moved.'
  });
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    title: 'Something went wrong', code: 500,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again.'
      : err.message
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MediCare HMS running at http://localhost:${PORT}`);
});
