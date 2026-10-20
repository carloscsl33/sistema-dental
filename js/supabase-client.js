// Cliente de Supabase. Si js/config.js está vacío, queda en null y la app funciona 100% local.
const supabaseClient = (() => {
  const config = window.SUPABASE_CONFIG || {};
  const publicKey = config.publishableKey || config.anonKey;
  if (!config.url || !publicKey || !window.supabase) return null;
  return window.supabase.createClient(config.url, publicKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();

function isCloudConnected() {
  return Boolean(supabaseClient);
}
