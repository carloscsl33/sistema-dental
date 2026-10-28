function createQrToken() {
  const values = new Uint32Array(8); crypto.getRandomValues(values);
  return `TD-${Array.from(values, value => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[value % 36]).join('')}`;
}
async function getOrCreatePatientQr(patientId) {
  const { data, error } = await supabaseClient.functions.invoke('system-maintenance', { body: { action: 'qr_get', patient_id: patientId } });
  if (error || !data?.token) throw error || new Error('No se pudo generar un código.');
  return data.token;
}
async function openPatientQr(patientId) {
  if (!supabaseClient || !hasRole('admin', 'receptionist')) return showToast('No tienes permiso para generar tarjetas QR.');
  const patient = findPatientById(patientId); if (!patient) return;
  try {
    showToast('Generando código QR…');
    const token = await getOrCreatePatientQr(patientId);
    document.querySelector('#patient-qr-name').textContent = getPatientFullName(patient);
    document.querySelector('#patient-qr-image').innerHTML = renderPatientQrSvg(token, 260);
    document.querySelector('#patient-qr-token').textContent = token;
    const modal = document.querySelector('#patient-qr-modal'); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); lockPageScroll();
  } catch (error) { console.error(error); showToast('No se pudo generar la tarjeta QR.'); }
}
async function resolvePatientQr(value) {
  const token = String(value || '').trim().toUpperCase();
  if (!/^TD-[A-Z0-9]{8}$/.test(token)) return showToast('El código no tiene un formato válido.');
  const { data, error } = await supabaseClient.functions.invoke('system-maintenance', { body: { action: 'qr_resolve', token } });
  if (error || !data?.patient_id) return showToast('No se encontró un paciente para este código.');
  goToPage('pacientes'); showPatientDetails(`id:${data.patient_id}`); closePatientQrScanner();
}
let qrCameraStream = null, qrCameraTimer = null;
function stopPatientQrCamera() { clearInterval(qrCameraTimer); qrCameraTimer = null; qrCameraStream?.getTracks().forEach(track => track.stop()); qrCameraStream = null; const video = document.querySelector('#patient-qr-video'); if (video) { video.srcObject = null; video.hidden = true; } }
function closePatientQrScanner() { stopPatientQrCamera(); const modal=document.querySelector('#patient-qr-scanner'); modal?.classList.remove('open'); modal?.setAttribute('aria-hidden','true'); updatePageScrollLock(); }
function openPatientQrScanner() { const modal=document.querySelector('#patient-qr-scanner'); modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.querySelector('#patient-qr-manual')?.focus(); lockPageScroll(); }
async function startPatientQrCamera() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return showToast('Este navegador no admite lectura por cámara. Usa el lector USB o escribe el código.');
  try {
    const video = document.querySelector('#patient-qr-video');
    qrCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = qrCameraStream; video.hidden = false; await video.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    qrCameraTimer = setInterval(async () => { try { const found = await detector.detect(video); if (found[0]?.rawValue) { stopPatientQrCamera(); resolvePatientQr(found[0].rawValue); } } catch (_) {} }, 350);
  } catch (_) { showToast('No se pudo abrir la cámara. Revisa el permiso del navegador.'); }
}
function downloadPatientQr() { const svg=document.querySelector('#patient-qr-image svg'); const name=document.querySelector('#patient-qr-name')?.textContent || 'paciente'; if(!svg)return; const blob=new Blob([svg.outerHTML],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`thera-dent-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.svg`; a.click(); URL.revokeObjectURL(url); }
