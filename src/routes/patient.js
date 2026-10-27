const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { asyncHandler } = require('../middleware');
const { TIME_SLOTS, GENDERS, BLOOD_GROUPS } = require('../constants');

const router = express.Router();

const flash = (req, type, msg) => {
  req.session.flash = req.session.flash || { success: [], error: [] };
  (req.session.flash[type] ||= []).push(msg);
};

const notFound = (res, what) =>
  res.status(404).render('error', { title: 'Not found', code: 404, message: `${what} could not be found.` });

/* ---------------------------------- Dashboard ---------------------------------- */

router.get('/dashboard', (req, res) => {
  const pid = req.session.user.id;
  const stats = {
    upcoming: db.prepare(
      "SELECT COUNT(*) c FROM appointments WHERE patient_id = ? AND status IN ('pending','confirmed') AND appointment_date >= date('now')"
    ).get(pid).c,
    completed: db.prepare(
      "SELECT COUNT(*) c FROM appointments WHERE patient_id = ? AND status = 'completed'"
    ).get(pid).c,
    prescriptions: db.prepare(
      'SELECT COUNT(*) c FROM prescriptions WHERE patient_id = ?'
    ).get(pid).c,
    due: db.prepare(
      "SELECT COALESCE(SUM(amount),0) c FROM bills WHERE patient_id = ? AND status = 'unpaid'"
    ).get(pid).c
  };
  const upcoming = db.prepare(`
    SELECT a.*, doc.name AS doctor_name, d.name AS department_name
    FROM appointments a
    JOIN doctors doc ON doc.id = a.doctor_id
    LEFT JOIN departments d ON d.id = doc.department_id
    WHERE a.patient_id = ? AND a.status IN ('pending','confirmed')
    ORDER BY a.appointment_date, a.time_slot LIMIT 5
  `).all(pid);
  const recentRx = db.prepare(`
    SELECT p.*, doc.name AS doctor_name FROM prescriptions p
    LEFT JOIN doctors doc ON doc.id = p.doctor_id
    WHERE p.patient_id = ? ORDER BY p.created_at DESC LIMIT 3
  `).all(pid);
  const unpaidBills = db.prepare(`
    SELECT * FROM bills WHERE patient_id = ? AND status = 'unpaid'
    ORDER BY created_at DESC LIMIT 3
  `).all(pid);
  res.render('patient/dashboard', {
    title: 'My Dashboard', active: 'dashboard',
    stats, upcoming, recentRx, unpaidBills
  });
});

/* --------------------------------- Appointments -------------------------------- */

router.get('/appointments', (req, res) => {
  const pid = req.session.user.id;
  const appointments = db.prepare(`
    SELECT a.*, doc.name AS doctor_name, doc.fee, d.name AS department_name
    FROM appointments a
    JOIN doctors doc ON doc.id = a.doctor_id
    LEFT JOIN departments d ON d.id = doc.department_id
    WHERE a.patient_id = ?
    ORDER BY a.appointment_date DESC, a.time_slot DESC
  `).all(pid);
  res.render('patient/appointments', { title: 'My Appointments', active: 'appointments', appointments });
});

router.get('/appointments/book', (req, res) => {
  const doctors = db.prepare(`
    SELECT doc.*, d.name AS department_name FROM doctors doc
    LEFT JOIN departments d ON d.id = doc.department_id
    WHERE doc.status = 'active' ORDER BY d.name, doc.name
  `).all();
  const today = new Date().toISOString().slice(0, 10);
  res.render('patient/book', {
    title: 'Book Appointment', active: 'appointments',
    doctors, timeSlots: TIME_SLOTS, today, form: {}, errors: {}
  });
});

router.post('/appointments', (req, res) => {
  const pid = req.session.user.id;
  const doctor_id = Number(req.body.doctor_id);
  const appointment_date = String(req.body.appointment_date || '');
  const time_slot = String(req.body.time_slot || '');
  const reason = String(req.body.reason || '').trim();
  const errors = {};

  const doctor = db.prepare("SELECT * FROM doctors WHERE id = ? AND status = 'active'").get(doctor_id);
  if (!doctor) errors.doctor_id = 'Choose a valid doctor.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) errors.appointment_date = 'Pick a valid date.';
  else if (appointment_date < new Date().toISOString().slice(0, 10)) errors.appointment_date = 'Date cannot be in the past.';
  if (!TIME_SLOTS.includes(time_slot)) errors.time_slot = 'Pick a valid time slot.';

  if (doctor && !errors.appointment_date && !errors.time_slot) {
    const clash = db.prepare(`
      SELECT 1 FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND status != 'cancelled'
    `).get(doctor_id, appointment_date, time_slot);
    if (clash) errors.time_slot = 'This slot is already booked. Please pick another.';
  }

  if (Object.keys(errors).length) {
    const doctors = db.prepare(`
      SELECT doc.*, d.name AS department_name FROM doctors doc
      LEFT JOIN departments d ON d.id = doc.department_id
      WHERE doc.status = 'active' ORDER BY d.name, doc.name
    `).all();
    return res.status(400).render('patient/book', {
      title: 'Book Appointment', active: 'appointments',
      doctors, timeSlots: TIME_SLOTS, today: new Date().toISOString().slice(0, 10),
      form: req.body, errors
    });
  }

  const info = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, appointment_date, time_slot, reason, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(pid, doctor_id, appointment_date, time_slot, reason || null);
  flash(req, 'success', `Appointment #${Number(info.lastInsertRowid)} booked! It will be confirmed by the hospital shortly.`);
  res.redirect('/patient/appointments');
});

router.post('/appointments/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND patient_id = ?')
    .get(id, req.session.user.id);
  if (!appt) return notFound(res, 'Appointment');
  if (!['pending', 'confirmed'].includes(appt.status)) {
    flash(req, 'error', `A ${appt.status} appointment cannot be cancelled.`);
    return res.redirect('/patient/appointments');
  }
  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(id);
  flash(req, 'success', `Appointment #${id} cancelled. The slot is now open for others.`);
  res.redirect('/patient/appointments');
});

/* -------------------------------- Prescriptions -------------------------------- */

router.get('/prescriptions', (req, res) => {
  const prescriptions = db.prepare(`
    SELECT p.*, doc.name AS doctor_name, a.appointment_date, a.time_slot
    FROM prescriptions p
    LEFT JOIN doctors doc ON doc.id = p.doctor_id
    JOIN appointments a ON a.id = p.appointment_id
    WHERE p.patient_id = ? ORDER BY p.created_at DESC
  `).all(req.session.user.id);
  res.render('patient/prescriptions', { title: 'My Prescriptions', active: 'prescriptions', prescriptions });
});

/* ------------------------------------- Bills ------------------------------------ */

router.get('/bills', (req, res) => {
  const bills = db.prepare(`
    SELECT * FROM bills WHERE patient_id = ? ORDER BY created_at DESC
  `).all(req.session.user.id);
  const totals = {
    paid: bills.filter((b) => b.status === 'paid').reduce((s, b) => s + b.amount, 0),
    unpaid: bills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.amount, 0)
  };
  res.render('patient/bills', { title: 'My Bills', active: 'bills', bills, totals });
});

router.post('/bills/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND patient_id = ?')
    .get(id, req.session.user.id);
  if (!bill) return notFound(res, 'Bill');
  if (bill.status === 'paid') {
    flash(req, 'error', 'This bill is already paid.');
  } else {
    db.prepare("UPDATE bills SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(id);
    flash(req, 'success', `Payment of ₹${bill.amount} for bill #${id} was successful.`);
  }
  res.redirect('/patient/bills');
});

/* ------------------------------------ Profile ----------------------------------- */

router.get('/profile', (req, res) => {
  const patient = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.render('patient/profile', {
    title: 'My Profile', active: 'profile',
    patient, genders: GENDERS, bloodGroups: BLOOD_GROUPS, errors: {}
  });
});

router.put('/profile', (req, res) => {
  const pid = req.session.user.id;
  const b = req.body;
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  const errors = {};
  if (name.length < 3) errors.name = 'Name must be at least 3 characters.';
  if (phone && !/^\d{10}$/.test(phone.replace(/\s/g, ''))) errors.phone = 'Phone must be 10 digits.';
  if (b.dob && new Date(b.dob) > new Date()) errors.dob = 'Date of birth cannot be in the future.';

  if (Object.keys(errors).length) {
    const patient = { ...db.prepare('SELECT * FROM users WHERE id = ?').get(pid), ...b, name, phone };
    return res.status(400).render('patient/profile', {
      title: 'My Profile', active: 'profile',
      patient, genders: GENDERS, bloodGroups: BLOOD_GROUPS, errors
    });
  }
  db.prepare(`
    UPDATE users SET name = ?, phone = ?, gender = ?, dob = ?, blood_group = ?, address = ?
    WHERE id = ?
  `).run(name, phone || null, b.gender || null, b.dob || null, b.blood_group || null,
    String(b.address || '').trim() || null, pid);
  req.session.user.name = name;
  flash(req, 'success', 'Profile updated successfully.');
  res.redirect('/patient/profile');
});

router.post('/profile/password', (req, res) => {
  const pid = req.session.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(pid);
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  const confirm = String(req.body.confirm_password || '');

  if (!bcrypt.compareSync(current, user.password_hash)) {
    flash(req, 'error', 'Your current password is incorrect.');
  } else if (next.length < 6) {
    flash(req, 'error', 'New password must be at least 6 characters.');
  } else if (next !== confirm) {
    flash(req, 'error', 'New password and confirmation do not match.');
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), pid);
    flash(req, 'success', 'Password changed successfully.');
  }
  res.redirect('/patient/profile');
});

module.exports = router;
