// Rol y permisos de interfaz. La autorización real vive en Supabase/RLS y Edge Functions.
const ROLE_LABELS = {
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  doctor: 'Doctor/a'
};

let currentAccess = { role: null, status: null, fullName: '' };

function getCurrentRole() {
  return currentAccess.role;
}

function hasRole(...roles) {
  return roles.includes(currentAccess.role);
}

function canAccessPage(page) {
  if (page === 'administrar' || page === 'configuracion') return hasRole('admin');
  if (page === 'cobros') return hasRole('admin', 'receptionist');
  return true;
}

function applyRoleAccess() {
  document.documentElement.dataset.role = currentAccess.role || '';
  document.querySelectorAll('[data-roles]').forEach(element => {
    const allowedRoles = element.dataset.roles.split(/\s+/).filter(Boolean);
    element.hidden = !allowedRoles.includes(currentAccess.role);
  });
  document.querySelectorAll('[data-requires-role]').forEach(element => {
    const allowedRoles = element.dataset.requiresRole.split(/\s+/).filter(Boolean);
    element.hidden = !allowedRoles.includes(currentAccess.role);
  });
  document.querySelectorAll('.session-status').forEach(status => {
    status.textContent = currentAccess.role ? `Sesión activa · ${ROLE_LABELS[currentAccess.role]}` : 'Sesión activa';
  });
}

async function loadCurrentAccess(session) {
  if (!session?.user || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('full_name, status, role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error || !data || data.status !== 'approved') return null;
  currentAccess = { role: data.role, status: data.status, fullName: data.full_name || '' };
  applyRoleAccess();
  return currentAccess;
}

function clearCurrentAccess() {
  currentAccess = { role: null, status: null, fullName: '' };
  document.documentElement.dataset.role = '';
}

async function invokeUserManagement(action, payload = {}) {
  const { data, error } = await supabaseClient.functions.invoke('manage-users', {
    body: { action, ...payload }
  });
  if (error) throw new Error(error.message || 'No se pudo completar la operación.');
  if (data?.error) throw new Error(data.error);
  return data;
}
