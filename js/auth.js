// Inicio de sesión con Supabase (supabaseClient viene de js/supabase-client.js)

function applyAuthState(session) {
  document.querySelector('#auth-overlay')?.toggleAttribute('hidden', Boolean(session));
  document.body.classList.toggle('auth-locked', !session);
  document.querySelector('#logout-button')?.toggleAttribute('hidden', !session);
}

let cloudSessionReady = false;

async function handleSession(session) {
  if (session) {
    if (!cloudSessionReady) {
      cloudSessionReady = true;
      const message = document.querySelector('#auth-message');
      if (message) message.textContent = 'Cargando tus datos…';
      await connectToCloud();
    }
    applyAuthState(session);
  } else {
    if (cloudSessionReady) {
      cloudSessionReady = false;
      disconnectFromCloud();
    }
    applyAuthState(session);
  }
}

async function initializeAuth() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  await handleSession(data.session);
  supabaseClient.auth.onAuthStateChange((event, session) => handleSession(session));
}

document.addEventListener('submit', async event => {
  if (!event.target.matches('#auth-form') || !supabaseClient) return;
  event.preventDefault();
  const message = document.querySelector('#auth-message');
  const submitButton = event.target.querySelector('button[type=\"submit\"]');
  if (submitButton) submitButton.disabled = true;
  if (message) message.textContent = '';
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: document.querySelector('#auth-email').value.trim(),
    password: document.querySelector('#auth-password').value
  });
  if (error && message) message.textContent = 'Correo o contraseña incorrectos.';
  if (submitButton) submitButton.disabled = false;
});

document.addEventListener('click', event => {
  if (event.target.closest('#logout-button') && supabaseClient) supabaseClient.auth.signOut();
});

initializeAuth();
