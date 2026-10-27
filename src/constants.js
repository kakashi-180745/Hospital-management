// Shared application constants

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30'
];

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const GENDERS = ['Male', 'Female', 'Other'];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

const BILL_STATUSES = ['unpaid', 'paid'];

const DOCTOR_STATUSES = ['active', 'inactive'];

module.exports = {
  TIME_SLOTS,
  WEEK_DAYS,
  GENDERS,
  BLOOD_GROUPS,
  APPOINTMENT_STATUSES,
  BILL_STATUSES,
  DOCTOR_STATUSES
};
