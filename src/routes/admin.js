const express = require('express');
const { db } = require('../db');
const { asyncHandler } = require('../middleware');
const { TIME_SLOTS, APPOINTMENT_STATUSES, DOCTOR_STATUSES, WEEK_DAYS } = require('../constants');

const router = express.Router();

const flash = (req, type, msg) => {
  req.session.flash = req.session.flash || { success: [], error: [] };
  (req.session.flash[type] ||= []).push(msg);
};

const notFound = (res, what) =>
  res.status(404).render('error', { title: 'Not found', code: 404, message: `${what} could not be found.` });

const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

/* ---------------------------------- Dashboard ---------------------------------- */

router.get('/dashboard', asyncHandler(async (req, res) => {
  const scalar = (sql, ...params) => db.prepare(sql).get(...params).c;

  const stats = {
    patients: scalar('SELECT COUNT(*) c FROM users'),
    doctors: scalar('SELECT COUNT(*) c FROM doctors'),
    departments: scalar('SELECT COUNT(*) c FROM departments'),
    appointments: scalar('SELECT COUNT(*) c FROM appointments'),
    today: scalar("SELECT COUNT(*) c FROM appointments WHERE appointment_date = date('now')"),
    pending: scalar("SELECT COUNT(*) c FROM appointments WHERE status = 'pending'"),
    unpaidBills: scalar("SELECT COUNT(*) c FROM bills WHERE status = 'unpaid'"),
    revenue: db.prepare("SELECT COALESCE(SUM(amount),0) c FROM bills WHERE status = 'paid'").get().c
  };

  const statusBreakup = db.prepare(`
    SELECT status, COUNT(*) AS total FROM appointments GROUP BY status
  `).all();

  const deptBreakup = db.prepare(`
    SELECT d.name, COUNT(doc.id) AS doctors
    FROM departments d LEFT JOIN doctors doc ON doc.department_id = d.id
    GROUP BY d.id ORDER BY d.name
  `).all();

  const todayAppointments = db.prepare(`
    SELECT a.*, u.name AS patient_name, doc.name AS doctor_name
    FROM appointments a
    JOIN users u ON u.id = a.patient_id
    JOIN doctors doc ON doc.id = a.doctor_id
    WHERE a.appointment_date = date('now')
    ORDER BY a.time_slot
  `).all();

  const recentAppointments = db.prepare(`
    SELECT a.*, u.name AS patient_name, doc.name AS doctor_name
    FROM appointments a
    JOIN users u ON u.id = a.patient_id
    JOIN doctors doc ON doc.id = a.doctor_id
    ORDER BY a.created_at DESC LIMIT 6
  `).all();

  res.render('admin/dashboard', {
    title: 'Admin Dashboard', active: 'dashboard',
    stats, statusBreakup, deptBreakup, todayAppointments, recentAppointments
  });
}));

/* --------------------------------- Departments --------------------------------- */

router.get('/departments', (req, res) => {
  const departments = db.prepare(`
    SELECT d.*, COUNT(doc.id) AS doctor_count,
      (SELECT COUNT(*) FROM appointments a JOIN doctors doc2 ON doc2.id = a.doctor_id
       WHERE doc2.department_id = d.id) AS appointment_count
    FROM departments d LEFT JOIN doctors doc ON doc.department_id = d.id
    GROUP BY d.id ORDER BY d.name
  `).all();
  res.render('admin/departments', { title: 'Departments', active: 'departments', departments, edit: null });
});

router.post('/departments', (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  if (name.length < 2) { flash(req, 'error', 'Department name must be at least 2 characters.'); return res.redirect('/admin/departments'); }
  try {
    db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)').run(name, description || null);
    flash(req, 'success', `Department "${name}" created.`);
  } catch (e) {
    flash(req, 'error', 'A department with this name already exists.');
  }
  res.redirect('/admin/departments');
});

router.put('/departments/:id', (req, res) => {
  const id = Number(req.params.id);
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!dept) return notFound(res, 'Department');
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  if (name.length < 2) { flash(req, 'error', 'Department name must be at least 2 characters.'); return res.redirect('/admin/departments'); }
  try {
    db.prepare('UPDATE departments SET name = ?, description = ? WHERE id = ?').run(name, description || null, id);
    flash(req, 'success', 'Department updated.');
  } catch (e) {
    flash(req, 'error', 'Another department already uses this name.');
  }
  res.redirect('/admin/departments');
});

router.delete('/departments/:id', (req, res) => {
  const id = Number(req.params.id);
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!dept) return notFound(res, 'Department');
  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  flash(req, 'success', `Department "${dept.name}" deleted. Its doctors were moved to "Unassigned".`);
  res.redirect('/admin/departments');
});

/* ----------------------------------- Doctors ----------------------------------- */

router.get('/doctors', (req, res) => {
  const doctors = db.prepare(`
    SELECT doc.*, d.name AS department_name
    FROM doctors doc LEFT JOIN departments d ON d.id = doc.department_id
    ORDER BY doc.name
  `).all();
  const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
  const edit = req.query.edit ? db.prepare('SELECT * FROM doctors WHERE id = ?').get(Number(req.query.edit)) : null;
  res.render('admin/doctors', {
    title: 'Doctors', active: 'doctors',
    doctors, departments, edit,
    weekDays: WEEK_DAYS, doctorStatuses: DOCTOR_STATUSES
  });
});

function readDoctorForm(req) {
  const b = req.body;
  const days = Array.isArray(b.available_days) ? b.available_days : [];
  return {
    name: String(b.name || '').trim(),
    email: String(b.email || '').trim().toLowerCase(),
    phone: String(b.phone || '').trim(),
    department_id: b.department_id ? Number(b.department_id) : null,
    specialization: String(b.specialization || '').trim(),
    experience_years: Number(b.experience_years) || 0,
    fee: Number(b.fee) || 0,
    available_days: days.length ? days.join(',') : 'Mon,Tue,Wed,Thu,Fri',
    available_from: b.available_from || '09:00',
    available_to: b.available_to || '17:00',
    status: DOCTOR_STATUSES.includes(b.status) ? b.status : 'active'
  };
}

router.post('/doctors', (req, res) => {
  const f = readDoctorForm(req);
  if (f.name.length < 3) { flash(req, 'error', 'Doctor name must be at least 3 characters.'); return res.redirect('/admin/doctors'); }
  if (db.prepare('SELECT 1 FROM doctors WHERE email = ?').get(f.email)) {
    flash(req, 'error', 'A doctor with this email already exists.'); return res.redirect('/admin/doctors');
  }
  db.prepare(`
    INSERT INTO doctors (name, email, phone, department_id, specialization, experience_years,
      fee, available_days, available_from, available_to, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(f.name, f.email, f.phone || null, f.department_id, f.specialization || null,
    f.experience_years, f.fee, f.available_days, f.available_from, f.available_to, f.status);
  flash(req, 'success', `Doctor "${f.name}" added.`);
  res.redirect('/admin/doctors');
});

router.put('/doctors/:id', (req, res) => {
  const id = Number(req.params.id);
  const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
  if (!doctor) return notFound(res, 'Doctor');
  const f = readDoctorForm(req);
  if (f.name.length < 3) { flash(req, 'error', 'Doctor name must be at least 3 characters.'); return res.redirect('/admin/doctors'); }
  const clash = db.prepare('SELECT 1 FROM doctors WHERE email = ? AND id != ?').get(f.email, id);
  if (clash) { flash(req, 'error', 'Another doctor already uses this email.'); return res.redirect(`/admin/doctors?edit=${id}`); }
  db.prepare(`
    UPDATE doctors SET name=?, email=?, phone=?, department_id=?, specialization=?,
      experience_years=?, fee=?, available_days=?, available_from=?, available_to=?, status=?
    WHERE id=?
  `).run(f.name, f.email, f.phone || null, f.department_id, f.specialization || null,
    f.experience_years, f.fee, f.available_days, f.available_from, f.available_to, f.status, id);
  flash(req, 'success', 'Doctor details updated.');
  res.redirect('/admin/doctors');
});

router.delete('/doctors/:id', (req, res) => {
  const id = Number(req.params.id);
  const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
  if (!doctor) return notFound(res, 'Doctor');
  const appts = db.prepare('SELECT COUNT(*) c FROM appointments WHERE doctor_id = ?').get(id).c;
  if (appts > 0) {
    flash(req, 'error', `Cannot delete: ${appts} appointment(s) are linked. Set the doctor to "Inactive" instead.`);
    return res.redirect('/admin/doctors');
  }
  db.prepare('DELETE FROM doctors WHERE id = ?').run(id);
  flash(req, 'success', `Doctor "${doctor.name}" deleted.`);
  res.redirect('/admin/doctors');
});

/* ----------------------------------- Patients ---------------------------------- */

router.get('/patients', (req, res) => {
  const q = String(req.query.q || '').trim();
  let patients;
  if (q) {
    const like = `%${q}%`;
    patients = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = u.id) AS appt_count,
        (SELECT COALESCE(SUM(amount),0) FROM bills b WHERE b.patient_id = u.id AND b.status='unpaid') AS due_amount
      FROM users u
      WHERE u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?
      ORDER BY u.name
    `).all(like, like, like);
  } else {
    patients = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = u.id) AS appt_count,
        (SELECT COALESCE(SUM(amount),0) FROM bills b WHERE b.patient_id = u.id AND b.status='unpaid') AS due_amount
      FROM users u ORDER BY u.created_at DESC
    `).all();
  }
  res.render('admin/patients', { title: 'Patients', active: 'patients', patients, q });
});

router.get('/patients/:id', (req, res) => {
  const id = Number(req.params.id);
  const patient = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!patient) return notFound(res, 'Patient');
  const appointments = db.prepare(`
    SELECT a.*, doc.name AS doctor_name, d.name AS department_name
    FROM appointments a
    JOIN doctors doc ON doc.id = a.doctor_id
    LEFT JOIN departments d ON d.id = doc.department_id
    WHERE a.patient_id = ? ORDER BY a.appointment_date DESC, a.time_slot DESC
  `).all(id);
  const prescriptions = db.prepare(`
    SELECT p.*, doc.name AS doctor_name FROM prescriptions p
    LEFT JOIN doctors doc ON doc.id = p.doctor_id
    WHERE p.patient_id = ? ORDER BY p.created_at DESC
  `).all(id);
  const bills = db.prepare('SELECT * FROM bills WHERE patient_id = ? ORDER BY created_at DESC').all(id);
  const due = bills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.amount, 0);
  res.render('admin/patient-detail', {
    title: `Patient: ${patient.name}`, active: 'patients',
    patient, appointments, prescriptions, bills, due
  });
});

router.delete('/patients/:id', (req, res) => {
  const id = Number(req.params.id);
  const patient = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!patient) return notFound(res, 'Patient');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  flash(req, 'success', `Patient "${patient.name}" and all linked records removed.`);
  res.redirect('/admin/patients');
});

/* --------------------------------- Appointments -------------------------------- */

router.get('/appointments', (req, res) => {
  const { status, date, q } = req.query;
  const where = [];
  const params = [];
  if (APPOINTMENT_STATUSES.includes(status)) { where.push('a.status = ?'); params.push(status); }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { where.push('a.appointment_date = ?'); params.push(date); }
  if (q) { where.push('(u.name LIKE ? OR doc.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const sql = `
    SELECT a.*, u.name AS patient_name, u.phone AS patient_phone,
      doc.name AS doctor_name, d.name AS department_name
    FROM appointments a
    JOIN users u ON u.id = a.patient_id
    JOIN doctors doc ON doc.id = a.doctor_id
    LEFT JOIN departments d ON d.id = doc.department_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.appointment_date DESC, a.time_slot ASC
  `;
  const appointments = db.prepare(sql).all(...params);
  res.render('admin/appointments', {
    title: 'Appointments', active: 'appointments',
    appointments, filters: { status: status || '', date: date || '', q: q || '' },
    statuses: APPOINTMENT_STATUSES
  });
});

router.get('/appointments/new', (req, res) => {
  const patients = db.prepare('SELECT id, name, email FROM users ORDER BY name').all();
  const doctors = db.prepare(`
    SELECT doc.*, d.name AS department_name FROM doctors doc
    LEFT JOIN departments d ON d.id = doc.department_id
    WHERE doc.status = 'active' ORDER BY doc.name
  `).all();
  res.render('admin/appointment-new', {
    title: 'New Appointment', active: 'appointments',
    patients, doctors, timeSlots: TIME_SLOTS, errors: {},
    form: { patient_id: req.query.patient_id || '' }
  });
});

function bookSlot(req, res, patientId, viewContext) {
  const doctor_id = Number(req.body.doctor_id);
  const appointment_date = String(req.body.appointment_date || '');
  const time_slot = String(req.body.time_slot || '');
  const reason = String(req.body.reason || '').trim();

  const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(doctor_id);
  if (!doctor) { flash(req, 'error', 'Please choose a valid doctor.'); return res.redirect(viewContext.backUrl); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) { flash(req, 'error', 'Please pick a valid appointment date.'); return res.redirect(viewContext.backUrl); }
  if (!TIME_SLOTS.includes(time_slot)) { flash(req, 'error', 'Please pick a valid time slot.'); return res.redirect(viewContext.backUrl); }
  if (appointment_date < new Date().toISOString().slice(0, 10)) {
    flash(req, 'error', 'Appointment date cannot be in the past.'); return res.redirect(viewContext.backUrl);
  }

  const clash = db.prepare(`
    SELECT 1 FROM appointments
    WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND status != 'cancelled'
  `).get(doctor_id, appointment_date, time_slot);
  if (clash) {
    flash(req, 'error', `Slot ${time_slot} on ${appointment_date} is already booked for ${doctor.name}. Choose another slot.`);
    return res.redirect(viewContext.backUrl);
  }

  const info = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, appointment_date, time_slot, reason, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(patientId, doctor_id, appointment_date, time_slot, reason || null);
  return Number(info.lastInsertRowid);
}

router.post('/appointments', (req, res) => {
  const patientId = Number(req.body.patient_id);
  const patient = db.prepare('SELECT * FROM users WHERE id = ?').get(patientId);
  if (!patient) { flash(req, 'error', 'Please choose a valid patient.'); return res.redirect('/admin/appointments/new'); }
  const id = bookSlot(req, res, patientId, { backUrl: '/admin/appointments/new' });
  if (id) {
    flash(req, 'success', `Appointment #${id} booked for ${patient.name}. It is now pending confirmation.`);
    res.redirect('/admin/appointments');
  }
});

router.get('/appointments/:id', (req, res) => {
  const id = Number(req.params.id);
  const appt = db.prepare(`
    SELECT a.*, u.name AS patient_name, u.phone AS patient_phone, u.email AS patient_email,
      doc.name AS doctor_name, doc.phone AS doctor_phone, d.name AS department_name, doc.fee
    FROM appointments a
    JOIN users u ON u.id = a.patient_id
    JOIN doctors doc ON doc.id = a.doctor_id
    LEFT JOIN departments d ON d.id = doc.department_id
    WHERE a.id = ?
  `).get(id);
  if (!appt) return notFound(res, 'Appointment');
  const prescription = db.prepare(`
    SELECT p.*, doc.name AS doctor_name FROM prescriptions p
    LEFT JOIN doctors doc ON doc.id = p.doctor_id WHERE p.appointment_id = ?
  `).get(id);
  res.render('admin/appointment-detail', {
    title: `Appointment #${id}`, active: 'appointments',
    appt, prescription, transitions: ALLOWED_TRANSITIONS[appt.status] || []
  });
});

router.post('/appointments/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return notFound(res, 'Appointment');
  const next = String(req.body.status || '');
  if (!ALLOWED_TRANSITIONS[appt.status].includes(next)) {
    flash(req, 'error', `Cannot change a ${appt.status} appointment to ${next}.`);
    return res.redirect(`/admin/appointments/${id}`);
  }
  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(next, id);
  flash(req, 'success', `Appointment #${id} marked as ${next}.`);
  res.redirect(`/admin/appointments/${id}`);
});

router.delete('/appointments/:id', (req, res) => {
  const id = Number(req.params.id);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return notFound(res, 'Appointment');
  db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  flash(req, 'success', `Appointment #${id} deleted.`);
  res.redirect('/admin/appointments');
});

/* -------------------------------- Prescriptions -------------------------------- */

router.get('/prescriptions', (req, res) => {
  const prescriptions = db.prepare(`
    SELECT p.*, u.name AS patient_name, doc.name AS doctor_name,
      a.appointment_date, a.time_slot
    FROM prescriptions p
    JOIN users u ON u.id = p.patient_id
    LEFT JOIN doctors doc ON doc.id = p.doctor_id
    JOIN appointments a ON a.id = p.appointment_id
    ORDER BY p.created_at DESC
  `).all();
  // Completed appointments still missing a prescription (quick-add candidates)
  const pendingRx = db.prepare(`
    SELECT a.id, a.appointment_date, a.time_slot, u.name AS patient_name, doc.name AS doctor_name
    FROM appointments a
    JOIN users u ON u.id = a.patient_id
    JOIN doctors doc ON doc.id = a.doctor_id
    WHERE a.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM prescriptions p WHERE p.appointment_id = a.id)
    ORDER BY a.appointment_date DESC
  `).all();
  res.render('admin/prescriptions', {
    title: 'Prescriptions', active: 'prescriptions',
    prescriptions, pendingRx
  });
});

router.post('/appointments/:id/prescription', (req, res) => {
  const id = Number(req.params.id);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return notFound(res, 'Appointment');
  if (appt.status !== 'completed') {
    flash(req, 'error', 'Prescriptions can only be added to completed appointments. Mark the appointment completed first.');
    return res.redirect(`/admin/appointments/${id}`);
  }
  if (db.prepare('SELECT 1 FROM prescriptions WHERE appointment_id = ?').get(id)) {
    flash(req, 'error', 'A prescription already exists for this appointment.');
    return res.redirect(`/admin/appointments/${id}`);
  }
  const diagnosis = String(req.body.diagnosis || '').trim();
  const medicines = String(req.body.medicines || '').trim();
  const notes = String(req.body.notes || '').trim();
  if (diagnosis.length < 2 || medicines.length < 2) {
    flash(req, 'error', 'Diagnosis and medicines are required.');
    return res.redirect(`/admin/appointments/${id}`);
  }
  db.prepare(`
    INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, diagnosis, medicines, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, appt.patient_id, appt.doctor_id, diagnosis, medicines, notes || null);
  flash(req, 'success', `Prescription added to appointment #${id}.`);
  res.redirect(`/admin/appointments/${id}`);
});

router.delete('/prescriptions/:id', (req, res) => {
  const id = Number(req.params.id);
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id);
  if (!rx) return notFound(res, 'Prescription');
  db.prepare('DELETE FROM prescriptions WHERE id = ?').run(id);
  flash(req, 'success', 'Prescription deleted.');
  res.redirect('/admin/prescriptions');
});

/* ------------------------------------ Billing ----------------------------------- */

router.get('/bills', (req, res) => {
  const status = req.query.status === 'paid' || req.query.status === 'unpaid' ? req.query.status : '';
  const params = [];
  let sql = `
    SELECT b.*, u.name AS patient_name, u.email AS patient_email
    FROM bills b JOIN users u ON u.id = b.patient_id
  `;
  if (status) { sql += ' WHERE b.status = ?'; params.push(status); }
  sql += ' ORDER BY b.created_at DESC';
  const bills = db.prepare(sql).all(...params);
  const patients = db.prepare('SELECT id, name FROM users ORDER BY name').all();
  const totals = {
    paid: db.prepare("SELECT COALESCE(SUM(amount),0) c FROM bills WHERE status='paid'").get().c,
    unpaid: db.prepare("SELECT COALESCE(SUM(amount),0) c FROM bills WHERE status='unpaid'").get().c
  };
  res.render('admin/bills', {
    title: 'Billing', active: 'bills',
    bills, patients, totals, filterStatus: status
  });
});

router.post('/bills', (req, res) => {
  const patient_id = Number(req.body.patient_id);
  const description = String(req.body.description || '').trim();
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const appointment_id = req.body.appointment_id ? Number(req.body.appointment_id) : null;
  const patient = db.prepare('SELECT * FROM users WHERE id = ?').get(patient_id);
  if (!patient) { flash(req, 'error', 'Choose a valid patient.'); return res.redirect('/admin/bills'); }
  if (description.length < 2 || !(amount > 0)) {
    flash(req, 'error', 'Provide a description and an amount greater than zero.');
    return res.redirect('/admin/bills');
  }
  db.prepare(`
    INSERT INTO bills (patient_id, appointment_id, description, amount)
    VALUES (?, ?, ?, ?)
  `).run(patient_id, appointment_id, description, amount);
  flash(req, 'success', `Bill of ₹${amount} created for ${patient.name}.`);
  res.redirect('/admin/bills');
});

router.post('/bills/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) return notFound(res, 'Bill');
  if (bill.status === 'unpaid') {
    db.prepare("UPDATE bills SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(id);
    flash(req, 'success', `Bill #${id} marked as paid.`);
  } else {
    db.prepare("UPDATE bills SET status = 'unpaid', paid_at = NULL WHERE id = ?").run(id);
    flash(req, 'success', `Bill #${id} re-opened as unpaid.`);
  }
  res.redirect(req.get('referer') || '/admin/bills');
});

router.delete('/bills/:id', (req, res) => {
  const id = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) return notFound(res, 'Bill');
  db.prepare('DELETE FROM bills WHERE id = ?').run(id);
  flash(req, 'success', `Bill #${id} deleted.`);
  res.redirect('/admin/bills');
});

module.exports = router;
