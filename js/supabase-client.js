// Cliente de Supabase. Si js/config.js está vacío, queda en null y la app funciona 100% local.
const supabaseClient = (() => {
  const config = window.SUPABASE_CONFIG || {};
  if (!config.url || !config.anonKey || !window.supabase) return null;
  return window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})();

function isCloudConnected() {
  return Boolean(supabaseClient);
}
