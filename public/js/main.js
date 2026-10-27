// MediCare HMS — client interactions
(function () {
  'use strict';

  /* ---------------- Mobile sidebar ---------------- */
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const menuToggle = document.getElementById('menuToggle');

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
  }
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('show', sidebar.classList.contains('open'));
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  /* ---------------- Toasts ---------------- */
  document.querySelectorAll('.toast').forEach((toast) => {
    const remove = () => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 260);
    };
    toast.querySelector('.t-close')?.addEventListener('click', remove);
    setTimeout(remove, 5500);
  });

  /* ---------------- Modals ---------------- */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }
  function closeModal(modal) {
    if (modal) modal.classList.remove('open');
  }
  document.querySelectorAll('[data-modal-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(btn.getAttribute('data-modal-open'));
    });
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop') ||
          e.target.hasAttribute('data-modal-close')) {
        closeModal(modal);
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(closeModal);
  });
  // Expose for inline use if needed
  window.MediCare = { openModal, closeModal };

  /* ---------------- Confirm before destructive actions ---------------- */
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });
  document.querySelectorAll('a[data-confirm]').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (!window.confirm(link.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  /* ---------------- Live appointment-slot availability ---------------- */
  const doctorSelect = document.querySelector('[data-availability="doctor"]');
  const dateInput = document.querySelector('[data-availability="date"]');
  const slotSelect = document.querySelector('[data-availability="slot"]');

  async function refreshSlots() {
    if (!doctorSelect || !dateInput || !slotSelect) return;
    const doctorId = doctorSelect.value;
    const date = dateInput.value;
    const allSlots = Array.from(slotSelect.options);
    allSlots.forEach((o) => { o.disabled = false; o.hidden = false; });

    if (!doctorId || !date) return;
    try {
      const res = await fetch(`/availability?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`);
      if (!res.ok) return;
      const { booked } = await res.json();
      let firstEnabled = null;
      allSlots.forEach((o) => {
        if (o.value && booked.includes(o.value)) {
          o.disabled = true;
          if (slotSelect.value === o.value) slotSelect.value = '';
        } else if (o.value && !firstEnabled) {
          firstEnabled = o.value;
        }
      });
      if (!slotSelect.value && firstEnabled) slotSelect.value = firstEnabled;
      const hint = document.querySelector('[data-availability="hint"]');
      if (hint) {
        hint.textContent = booked.length
          ? `${booked.length} slot(s) already booked on this date — unavailable slots are disabled.`
          : 'All slots are available on this date.';
      }
    } catch (err) {
      /* silent: fall back to full slot list */
    }
  }
  if (doctorSelect && dateInput) {
    doctorSelect.addEventListener('change', refreshSlots);
    dateInput.addEventListener('change', refreshSlots);
    refreshSlots();
  }

  /* ---------------- Auto-dismiss alert helpers in forms ---------------- */
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.min) input.min = new Date().toISOString().slice(0, 10);
  });
})();
