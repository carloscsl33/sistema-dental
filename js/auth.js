// Autenticación con Supabase. Nunca guarda ni registra contraseñas en la app.
const authViews = {
  login: document.querySelector('#auth-form'),
  recovery: document.querySelector('#recovery-request-form'),
  reset: document.querySelector('#reset-password-form')
};

let passwordRecoveryActive = false;

function setAuthMessage(id, text = '', success = false) {
  const message = document.querySelector(id);
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-success', Boolean(success && text));
}

function setSubmitState(form, loading, label) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.label;
}

function showAuthView(view, focusSelector) {
  Object.entries(authViews).forEach(([name, form]) => form?.toggleAttribute('hidden', name !== view));
  ['#auth-message', '#recovery-message', '#reset-message'].forEach(id => setAuthMessage(id));
  window.setTimeout(() => document.querySelector(focusSelector || ({ login: '#auth-email', recovery: '#recovery-email', reset: '#new-password' }[view]))?.focus(), 0);
}

function applyAuthState(session) {
  const showOverlay = !session || passwordRecoveryActive;
  document.querySelector('#auth-overlay')?.toggleAttribute('hidden', !showOverlay);
  document.body.classList.toggle('auth-locked', showOverlay);
  document.querySelector('#logout-button')?.toggleAttribute('hidden', !session);
}

let cloudSessionReady = false;

async function handleSession(session) {
  if (passwordRecoveryActive) return applyAuthState(null);
  if (session) {
    if (!cloudSessionReady) {
      cloudSessionReady = true;
      setAuthMessage('#auth-message', 'Cargando tus datos…', true);
      await connectToCloud();
    }
    applyAuthState(session);
  } else {
    if (cloudSessionReady) {
      cloudSessionReady = false;
      disconnectFromCloud();
    }
    applyAuthState(null);
  }
}

function recoveryRedirectUrl() {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('recovery', '1');
  return url.toString();
}

function isRecoveryLink() {
  return window.location.hash.includes('type=recovery');
}

function passwordIsStrong(password) {
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter(rule => rule.test(password)).length;
  return password.length >= 12 && groups >= 3;
}

async function initializeAuth() {
  if (!supabaseClient) {
    applyAuthState(null);
    setAuthMessage('#auth-message', 'No se pudo iniciar el acceso seguro. Recarga la página e inténtalo de nuevo.');
    return;
  }

  if (isRecoveryLink()) {
    passwordRecoveryActive = true;
    showAuthView('reset');
    applyAuthState(null);
  }

  const { data } = await supabaseClient.auth.getSession();
  if (!passwordRecoveryActive) await handleSession(data.session);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecoveryActive = true;
      showAuthView('reset');
      applyAuthState(null);
      return;
    }
    if (!passwordRecoveryActive) handleSession(session);
  });
}

document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-password-toggle], #auth-password-toggle');
  if (toggle) {
    const inputId = toggle.dataset.passwordToggle || 'auth-password';
    const input = document.querySelector('#' + inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    toggle.setAttribute('aria-pressed', String(show));
    input.focus();
    return;
  }

  if (event.target.closest('#show-recovery')) return showAuthView('recovery');
  if (event.target.closest('[data-auth-back]')) return showAuthView('login');
  if (event.target.closest('#logout-button') && supabaseClient) supabaseClient.auth.signOut();
});

document.addEventListener('submit', async event => {
  if (event.target.matches('#auth-form')) {
    event.preventDefault();
    if (!supabaseClient) return;
    const form = event.target;
    setSubmitState(form, true, 'Verificando…');
    setAuthMessage('#auth-message');
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.querySelector('#auth-email').value.trim(),
      password: document.querySelector('#auth-password').value
    });
    if (error) setAuthMessage('#auth-message', 'No pudimos iniciar sesión. Revisa tus datos o restablece tu contraseña.');
    setSubmitState(form, false);
    return;
  }

  if (event.target.matches('#recovery-request-form')) {
    event.preventDefault();
    if (!supabaseClient) return;
    const form = event.target;
    setSubmitState(form, true, 'Enviando…');
    setAuthMessage('#recovery-message');
    await supabaseClient.auth.resetPasswordForEmail(document.querySelector('#recovery-email').value.trim(), {
      redirectTo: recoveryRedirectUrl()
    });
    // Mensaje deliberadamente genérico: evita revelar si el correo tiene una cuenta.
    setAuthMessage('#recovery-message', 'Si el correo está registrado, recibirás un enlace seguro. Revisa tu bandeja de entrada y correo no deseado.', true);
    setSubmitState(form, false);
    return;
  }

  if (event.target.matches('#reset-password-form')) {
    event.preventDefault();
    if (!supabaseClient) return;
    const form = event.target;
    const password = document.querySelector('#new-password').value;
    const confirmation = document.querySelector('#confirm-password').value;
    setAuthMessage('#reset-message');

    if (!passwordIsStrong(password)) {
      setAuthMessage('#reset-message', 'Usa al menos 12 caracteres y combina al menos tres tipos: mayúsculas, minúsculas, números o símbolos.');
      return;
    }
    if (password !== confirmation) {
      setAuthMessage('#reset-message', 'Las contraseñas no coinciden.');
      return;
    }

    setSubmitState(form, true, 'Guardando…');
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
      setAuthMessage('#reset-message', 'El enlace no es válido o expiró. Solicita uno nuevo para continuar.');
      setSubmitState(form, false);
      return;
    }

    document.querySelector('#new-password').value = '';
    document.querySelector('#confirm-password').value = '';
    passwordRecoveryActive = false;
    window.history.replaceState({}, document.title, window.location.pathname);
    await supabaseClient.auth.signOut();
    showAuthView('login');
    setAuthMessage('#auth-message', 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.', true);
    setSubmitState(form, false);
  }
});

initializeAuth();
