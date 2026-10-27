// Database connection, schema and seed data (Node built-in SQLite)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { WEEK_DAYS } = require('./constants');

const DATA_DIR = path.join(__dirname, '..', 'data');
// Vercel's function filesystem is read-only (only /tmp is writable), so the
// local data directory must only be created when running outside Vercel.
if (!process.env.VERCEL && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Vercel's filesystem is read-only except the ephemeral /tmp directory.
// The database re-seeds automatically on every cold start (demo-friendly).
const DB_PATH = process.env.VERCEL
  ? '/tmp/hospital.db'
  : path.join(DATA_DIR, 'hospital.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      dob TEXT,
      blood_group TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      specialization TEXT,
      experience_years INTEGER NOT NULL DEFAULT 0,
      fee INTEGER NOT NULL DEFAULT 0,
      available_days TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
      available_from TEXT NOT NULL DEFAULT '09:00',
      available_to TEXT NOT NULL DEFAULT '17:00',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      appointment_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
      diagnosis TEXT NOT NULL,
      medicines TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_unique_slot
      ON appointments(doctor_id, appointment_date, time_slot)
      WHERE status != 'cancelled';
  `);
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM admins').get();
  if (count.c > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // ---- Admin ----
  db.prepare(
    'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)'
  ).run('System Administrator', 'admin@hospital.com', hash('admin123'));

  // ---- Demo patient ----
  db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, gender, dob, blood_group, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Rahul Sharma', 'patient@demo.com', hash('patient123'),
    '9876543210', 'Male', '1992-06-15', 'O+', '12, Gandhi Street, Coimbatore'
  );

  // ---- Departments ----
  const departments = [
    ['Cardiology', 'Diagnosis and treatment of heart and blood vessel disorders'],
    ['Neurology', 'Care of the brain, spinal cord and nervous system'],
    ['Orthopedics', 'Treatment of bones, joints, muscles and fractures'],
    ['Pediatrics', 'Medical care of infants, children and adolescents'],
    ['Dermatology', 'Treatment of skin, hair and nail conditions'],
    ['General Medicine', 'Primary care and general health consultations']
  ];
  const deptStmt = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
  const deptIds = {};
  departments.forEach(([name, desc]) => {
    const info = deptStmt.run(name, desc);
    deptIds[name] = Number(info.lastInsertRowid);
  });

  // ---- Doctors ----
  const doctors = [
    ['Dr. Anitha Rao', 'anitha.rao@hospital.com', '9840011111', 'Cardiology', 'Interventional Cardiologist', 14, 600],
    ['Dr. Vikram Iyer', 'vikram.iyer@hospital.com', '9840022222', 'Neurology', 'Stroke & Epilepsy Specialist', 11, 700],
    ['Dr. Meena Krishnan', 'meena.krishnan@hospital.com', '9840033333', 'Orthopedics', 'Joint Replacement Surgeon', 16, 650],
    ['Dr. Arjun Nair', 'arjun.nair@hospital.com', '9840044444', 'Pediatrics', 'Pediatrician & Neonatologist', 9, 450],
    ['Dr. Priya Menon', 'priya.menon@hospital.com', '9840055555', 'Dermatology', 'Cosmetic & Clinical Dermatologist', 8, 500],
    ['Dr. Karthik Subbu', 'karthik.subbu@hospital.com', '9840066666', 'General Medicine', 'General Physician & Diabetologist', 12, 350]
  ];
  const docStmt = db.prepare(`
    INSERT INTO doctors
      (name, email, phone, department_id, specialization, experience_years, fee, available_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  doctors.forEach(([name, email, phone, dept, spec, exp, fee]) => {
    docStmt.run(name, email, phone, deptIds[dept], spec, exp, fee, WEEK_DAYS.slice(0, 5).join(','));
  });

  // ---- Sample appointments (one completed + one upcoming for the demo patient) ----
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const past = new Date(today); past.setDate(past.getDate() - 7);
  const future = new Date(today); future.setDate(future.getDate() + 2);

  const apptStmt = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, appointment_date, time_slot, reason, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const pastAppt = apptStmt.run(1, 1, fmt(past), '10:00', 'Chest discomfort and routine cardiac check-up', 'completed');
  apptStmt.run(1, 6, fmt(future), '11:00', 'Follow-up for blood sugar management', 'confirmed');

  // ---- Prescription for completed appointment ----
  db.prepare(`
    INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, diagnosis, medicines, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(pastAppt.lastInsertRowid), 1, 1,
    'Mild hypertension; ECG within normal limits',
    'Telmisartan 40mg - once daily after breakfast\nAtorvastatin 10mg - once daily at night',
    'Reduce salt intake, walk 30 minutes daily, review after 2 weeks.'
  );

  // ---- Sample bill ----
  db.prepare(`
    INSERT INTO bills (patient_id, appointment_id, description, amount, status, paid_at)
    VALUES (?, ?, ?, ?, 'paid', datetime('now'))
  `).run(1, Number(pastAppt.lastInsertRowid), 'Cardiology consultation + ECG', 900);
  db.prepare(`
    INSERT INTO bills (patient_id, description, amount)
    VALUES (?, ?, ?)
  `).run(1, 'Annual health check-up package', 1500);

  console.log('Database seeded with demo data.');
}

function initDb() {
  createSchema();
  seed();
}

module.exports = { db, initDb };
