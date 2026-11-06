function createQrToken() {
  const values = new Uint32Array(8);
  crypto.getRandomValues(values);
  return `TD-${Array.from(values, (value) => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[value % 36]).join("")}`;
}
async function getOrCreatePatientQr(patientId) {
  const { data, error } = await supabaseClient.functions.invoke(
    "system-maintenance",
    { body: { action: "qr_get", patient_id: patientId } },
  );
  if (error || !data?.token)
    throw error || new Error("No se pudo generar un código.");
  return data.token;
}
async function openPatientQr(patientId) {
  if (!supabaseClient || !hasRole('admin', 'receptionist'))
    return showToast("No tienes permiso para generar tarjetas QR.");
  const patient = findPatientById(patientId);
  if (!patient) return;
  try {
    showToast("Generando código QR…");
    const token = await getOrCreatePatientQr(patientId);
    document.querySelector("#patient-qr-name").textContent =
      getPatientFullName(patient);
    document.querySelector("#patient-qr-image").innerHTML = renderPatientQrSvg(
      token,
      220,
    );
    document.querySelector("#patient-qr-token").textContent = token;
    const modal = document.querySelector("#patient-qr-modal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    lockPageScroll();
  } catch (error) {
    console.error(error);
    showToast("No se pudo generar la tarjeta QR.");
  }
}
async function resolvePatientQr(value) {
  const token = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^TD-[A-Z0-9]{8}$/.test(token))
    return showToast("El código no tiene un formato válido.");
  const { data, error } = await supabaseClient.functions.invoke(
    "system-maintenance",
    { body: { action: "qr_resolve", token } },
  );
  if (error || !data?.patient_id)
    return showToast("No se encontró un paciente para este código.");
  changePage('pacientes');
  showPatientDetails(`id:${data.patient_id}`);
  closePatientQrScanner();
}
let qrCameraStream = null,
  qrCameraTimer = null;
let qrCameraReading = false;

function setPatientQrCameraStatus(message = '') {
  const status = document.querySelector('#patient-qr-camera-status');
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}

function stopPatientQrCamera() {
  clearInterval(qrCameraTimer);
  qrCameraTimer = null;
  qrCameraReading = false;
  qrCameraStream?.getTracks().forEach((track) => track.stop());
  qrCameraStream = null;
  const video = document.querySelector("#patient-qr-video");
  if (video) {
    video.srcObject = null;
    video.hidden = true;
  }
}
function closePatientQrScanner() {
  stopPatientQrCamera();
  setPatientQrCameraStatus();
  const modal = document.querySelector("#patient-qr-scanner");
  modal?.classList.remove("open");
  modal?.setAttribute("aria-hidden", "true");
  updatePageScrollLock();
}
function openPatientQrScanner() {
  const modal = document.querySelector("#patient-qr-scanner");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

async function startPatientQrCamera() {
  if (!navigator.mediaDevices?.getUserMedia)
    return showToast(
      "Este navegador no permite usar la cámara. Usa el lector USB o escribe el código.",
    );

  stopPatientQrCamera();
  setPatientQrCameraStatus('Solicitando permiso para usar la cámara…');
  try {
    const video = document.querySelector("#patient-qr-video");
    if (!video) return;
    qrCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = qrCameraStream;
    video.hidden = false;
    await video.play();
    let detector = null;
    if ("BarcodeDetector" in window) {
      try {
        detector = new BarcodeDetector({ formats: ["qr_code"] });
      } catch (_) {
        // Algunos navegadores exponen la API, pero no el formato QR.
      }
    }
    const fallbackCanvas = detector ? null : document.createElement('canvas');
    const fallbackContext = fallbackCanvas?.getContext('2d', { willReadFrequently: true });
    if (!detector && (!window.jsQR || !fallbackContext)) {
      stopPatientQrCamera();
      setPatientQrCameraStatus('No se pudo cargar el lector QR. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    setPatientQrCameraStatus('Cámara activa. Coloca el código QR dentro del recuadro.');
    qrCameraTimer = setInterval(async () => {
      if (qrCameraReading || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      qrCameraReading = true;
      try {
        let rawValue = '';
        if (detector) {
          const found = await detector.detect(video);
          rawValue = found[0]?.rawValue || '';
        } else if (fallbackCanvas && fallbackContext) {
          fallbackCanvas.width = video.videoWidth;
          fallbackCanvas.height = video.videoHeight;
          if (fallbackCanvas.width && fallbackCanvas.height) {
            fallbackContext.drawImage(video, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
            const frame = fallbackContext.getImageData(0, 0, fallbackCanvas.width, fallbackCanvas.height);
            rawValue = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data || '';
          }
        }
        if (rawValue) {
          stopPatientQrCamera();
          setPatientQrCameraStatus('Código detectado. Abriendo expediente…');
          resolvePatientQr(rawValue);
        }
      } catch (_) {
        // Un cuadro de video inválido no debe detener el escáner; se intenta de nuevo.
      } finally {
        qrCameraReading = false;
      }
    }, 250);
  } catch (error) {
    const message = error?.name === 'NotAllowedError'
      ? 'El navegador bloqueó la cámara. Autoriza la cámara para este sitio y vuelve a intentarlo.'
      : error?.name === 'NotFoundError'
        ? 'No se encontró una cámara disponible en este dispositivo.'
        : 'No se pudo abrir la cámara. Revisa el permiso del navegador.';
    setPatientQrCameraStatus(message);
    showToast(message);
  }
}
function escapePatientQrSvgText(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function downloadPatientQr() {
  const svg = document.querySelector("#patient-qr-image svg");
  const name =
    document.querySelector("#patient-qr-name")?.textContent || "paciente";
  const token = document.querySelector("#patient-qr-token")?.textContent?.trim();
  if (!svg || !token) return;

  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/\s+/)
    .map(Number);
  const sourceSize = viewBox?.[2] || 1;
  const cardWidth = 230;
  const qrSize = 180;
  const qrX = (cardWidth - qrSize) / 2;
  const qrY = 16;
  const nameY = qrY + qrSize + 24;
  const tokenY = nameY + 20;
  const cardHeight = tokenY + 19;
  const visibleName = name.length > 31 ? `${name.slice(0, 30)}…` : name;
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" role="img" aria-label="Tarjeta QR de ${escapePatientQrSvgText(name)}"><rect width="100%" height="100%" fill="#ffffff"/><g transform="translate(${qrX} ${qrY}) scale(${qrSize / sourceSize})">${svg.innerHTML}</g><text x="${cardWidth / 2}" y="${nameY}" text-anchor="middle" fill="#122039" font-family="Arial, sans-serif" font-size="13" font-weight="700">${escapePatientQrSvgText(visibleName)}</text><text x="${cardWidth / 2}" y="${tokenY}" text-anchor="middle" fill="#617088" font-family="monospace" font-size="10" letter-spacing="1">${escapePatientQrSvgText(token)}</text></svg>`;
  const blob = new Blob([card], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thera-dent-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

