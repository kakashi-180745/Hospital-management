const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { asyncHandler } = require('../middleware');
const { GENDERS, BLOOD_GROUPS } = require('../constants');

const router = express.Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin/dashboard' : '/patient/dashboard');
  }
  res.render('auth/login', {
    title: 'Login',
    role: req.query.role === 'admin' ? 'admin' : 'patient',
    email: '',
    errors: {}
  });
});

router.post('/login', asyncHandler(async (req, res) => {
  const role = req.body.role === 'admin' ? 'admin' : 'patient';
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const errors = {};

  if (!emailRe.test(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';

  const renderBack = () =>
    res.status(400).render('auth/login', { title: 'Login', role, email, errors });

  if (Object.keys(errors).length) return renderBack();

  const table = role === 'admin' ? 'admins' : 'users';
  const account = db.prepare(`SELECT * FROM ${table} WHERE email = ?`).get(email);

  if (!account || !bcrypt.compareSync(password, account.password_hash)) {
    errors.password = 'Invalid email or password.';
    return renderBack();
  }

  req.session.user = { id: account.id, role, name: account.name };
  const target = req.session.redirectTo;
  delete req.session.redirectTo;
  req.session.flash = req.session.flash || {};
  (req.session.flash.success ||= []).push(`Welcome back, ${account.name}!`);
  res.redirect(target || (role === 'admin' ? '/admin/dashboard' : '/patient/dashboard'));
}));

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/patient/dashboard');
  res.render('auth/register', {
    title: 'Patient Registration',
    form: {},
    genders: GENDERS,
    bloodGroups: BLOOD_GROUPS,
    errors: {}
  });
});

router.post('/register', asyncHandler(async (req, res) => {
  const b = req.body;
  const form = {
    name: String(b.name || '').trim(),
    email: String(b.email || '').trim().toLowerCase(),
    phone: String(b.phone || '').trim(),
    gender: b.gender || '',
    dob: b.dob || '',
    blood_group: b.blood_group || '',
    address: String(b.address || '').trim()
  };
  const password = String(b.password || '');
  const confirm = String(b.confirm_password || '');
  const errors = {};

  if (form.name.length < 3) errors.name = 'Full name must be at least 3 characters.';
  if (!emailRe.test(form.email)) errors.email = 'Enter a valid email address.';
  if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
    errors.phone = 'Phone number must be 10 digits.';
  }
  if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
  if (password !== confirm) errors.confirm_password = 'Passwords do not match.';
  if (form.dob && new Date(form.dob) > new Date()) errors.dob = 'Date of birth cannot be in the future.';

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(form.email)) {
    errors.email = 'An account with this email already exists.';
  }
  if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(form.email)) {
    errors.email = 'This email is reserved. Please choose another.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('auth/register', {
      title: 'Patient Registration', form, genders: GENDERS,
      bloodGroups: BLOOD_GROUPS, errors
    });
  }

  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, gender, dob, blood_group, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    form.name, form.email, bcrypt.hashSync(password, 10),
    form.phone || null, form.gender || null, form.dob || null,
    form.blood_group || null, form.address || null
  );

  req.session.user = { id: Number(info.lastInsertRowid), role: 'patient', name: form.name };
  req.session.flash = { success: ['Registration successful! Your patient account is ready.'], error: [] };
  res.redirect('/patient/dashboard');
}));

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
