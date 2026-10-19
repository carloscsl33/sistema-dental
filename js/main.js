// Arranque

function initializeApp() {
  initializeStorage();
  createPaymentReceiptModal();
  renderLists();
  renderDashboardCalendar();
  updateAttendedCount();
  updateDashboardIncome();
  initializeAppointmentPatientSearch();
  unlockPageScroll();
  
  const patientModal = document.querySelector('#patient-modal');
  const appointmentModal = document.querySelector('#appointment-modal');
  
  if (patientModal) {
    patientModal.classList.remove('open');
    patientModal.setAttribute('aria-hidden', 'true');
  }
  if (appointmentModal) {
    appointmentModal.classList.remove('open');
    appointmentModal.setAttribute('aria-hidden', 'true');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
