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
      260,
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
  document.querySelector("#patient-qr-manual")?.focus();
  lockPageScroll();
}

function openPatientQrDeviceCamera() {
  stopPatientQrCamera();
  setPatientQrCameraStatus('Abriendo la cámara del dispositivo…');
  document.querySelector('#patient-qr-photo')?.click();
}

async function decodePatientQrPhoto(file) {
  if (!file) return;
  if (!window.jsQR) {
    setPatientQrCameraStatus('No se pudo cargar el lector QR. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }
  setPatientQrCameraStatus('Leyendo el código de la imagen…');
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas_unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' });
    if (!code?.data) {
      setPatientQrCameraStatus('No se detectó un QR. Acerca la tarjeta, enfócala bien y vuelve a intentarlo.');
      return;
    }
    setPatientQrCameraStatus('Código detectado. Abriendo expediente…');
    await resolvePatientQr(code.data);
  } catch (_) {
    setPatientQrCameraStatus('No se pudo leer la imagen. Intenta tomar otra fotografía del QR.');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

document.addEventListener('change', event => {
  if (!event.target.matches('#patient-qr-photo')) return;
  const file = event.target.files?.[0];
  event.target.value = '';
  decodePatientQrPhoto(file);
});

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
function downloadPatientQr() {
  const svg = document.querySelector("#patient-qr-image svg");
  const name =
    document.querySelector("#patient-qr-name")?.textContent || "paciente";
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thera-dent-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

