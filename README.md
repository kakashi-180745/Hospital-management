# MediCare — Hospital Management System

A full-stack Hospital Management System with separate, session-protected **Admin** and
**Patient** portals covering the entire patient journey — registration, appointment
booking, doctor & department management, digital prescriptions, and billing.

Built with **Node.js + Express + EJS** and the built-in **SQLite** engine
(`node:sqlite`) — no native compilation or external database server required.

---

## ✨ Features

### 🔐 Authentication & security
- Role-based login (**Admin** / **Patient**) with separate portal experiences
- Patient self-registration with validation (unique email, phone, DOB, password rules)
- Passwords hashed with **bcryptjs**; sessions via signed HttpOnly cookies
- Route guards on every protected page, including cross-role access blocks (HTTP 403)
- Patients can change their password after verifying the current one

### 🛠️ Admin portal — controls the entire hospital
| Module | Capabilities |
| --- | --- |
| **Dashboard** | Live counts (patients, doctors, departments, appointments), revenue & dues, status and department bar charts, today's schedule, recent activity |
| **Departments** | Create, edit and delete specialties (doctors safely become "Unassigned") |
| **Doctors** | Full CRUD — department, specialization, experience, fee, working days/hours, active/inactive status; delete blocked when appointments exist |
| **Patients** | Searchable registry, 360° patient profile with visit history, prescriptions and bills; safe cascade delete |
| **Appointments** | Filter by status/date/name, walk-in booking, workflow `pending → confirmed → completed` (or `cancelled`) with legal-transition enforcement, double-booking prevention |
| **Prescriptions** | Issue diagnosis, medicines and advice against completed visits; alerts for completed visits missing a prescription |
| **Billing** | Create invoices, mark paid / re-open, paid vs outstanding totals and filters |

### 🧑‍🦱 Patient portal — self-service
- Register / log in and maintain a personal & medical profile (blood group, DOB, address…)
- **Book appointments** with any active doctor — time slots disable in real time as they fill
- Track appointment status and cancel upcoming visits (frees the slot for others)
- View all digital prescriptions with medicines and doctor's advice
- See invoices and **pay outstanding bills** online, with full payment history
- Personal dashboard: upcoming visits, completed visits, prescriptions, outstanding dues

---

## 🧰 Tech stack

- **Runtime:** Node.js (uses the built-in `node:sqlite` database via `--experimental-sqlite`)
- **Backend:** Express 4, express-session, method-override, bcryptjs
- **Frontend:** Server-rendered EJS templates, hand-written responsive CSS, vanilla JavaScript
- **Database:** SQLite file at `data/hospital.db` (auto-created and seeded on first run)

## 📁 Project structure

```
Hospital-management/
├── server.js                # Express app, middleware, route mounting, error handlers
├── package.json
├── data/                    # SQLite database (auto-created, git-ignored)
├── src/
│   ├── db.js                # Schema creation + demo seed data
│   ├── constants.js         # Time slots, genders, blood groups, statuses
│   ├── middleware.js        # Auth guards, flash messages, view helpers
│   └── routes/
│       ├── auth.js          # Login, registration, logout
│       ├── admin.js         # All admin management endpoints
│       └── patient.js       # Patient self-service endpoints
├── views/
│   ├── partials/            # Sidebar, topbar, toasts, shared panels
│   ├── auth/                # Login & registration
│   ├── admin/               # Admin portal screens
│   ├── patient/             # Patient portal screens
│   ├── landing.ejs          # Public marketing landing page
│   └── error.ejs            # 403 / 404 / 500 page
└── public/
    ├── css/style.css        # Complete design system
    └── js/main.js           # Sidebar, modals, toasts, live slot availability
```

## 🚀 Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the server (auto-creates & seeds data/hospital.db on first run)
npm start

# Or use auto-restart during development
npm run dev
```

Open **http://localhost:3000** in your browser.

> Node 22.5+ is required because the app uses Node's built-in SQLite module.
> Set `PORT` and `SESSION_SECRET` environment variables to override defaults.

## 🔑 Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@hospital.com` | `admin123` |
| Patient | `patient@demo.com` | `patient123` |

The seed also creates 6 departments, 6 doctors, sample appointments, a prescription
and bills so every screen has data to explore. New patients can register from the
login page. To reset the demo, stop the server and delete the `data/` folder.

## 🔄 Typical end-to-end workflow

1. **Patient** registers (or logs in) and books an appointment — the slot is instantly
   reserved and unavailable to others.
2. **Admin** reviews the booking, marks it **confirmed**, then **completed** after the visit.
3. **Admin** issues a **prescription** (diagnosis, medicines, advice) against the completed visit.
4. **Admin** raises a **bill**; the patient sees it in their portal and marks it **paid**.
5. All records remain linked in the patient's 360° profile and the admin dashboards.

## 🗺️ Route map (high level)

- Public: `/`, `/login`, `/register`, `/logout`
- Admin (role=admin): `/admin/dashboard`, `/admin/departments`, `/admin/doctors`,
  `/admin/patients`, `/admin/appointments`, `/admin/prescriptions`, `/admin/bills`
- Patient (role=patient): `/patient/dashboard`, `/patient/appointments`,
  `/patient/prescriptions`, `/patient/bills`, `/patient/profile`
- Shared JSON helper: `GET /availability?doctor_id=&date=` (live booked slots)
