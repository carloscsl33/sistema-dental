const ROLE_LABELS = {
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  doctor: 'Doctor/a'
};

let currentAccess = { id: null, role: null, status: null, fullName: '', email: '' };

function getCurrentRole() { return currentAccess.role; }

function hasRole(...roles) { return roles.includes(currentAccess.role); }

// Estas comprobaciones también se usan dentro de los controladores para que un
// elemento oculto no pueda habilitar una acción desde la consola del navegador.
function canManageAppointments() { return hasRole('admin', 'receptionist'); }

function canManagePayments() { return hasRole('admin', 'receptionist'); }

function canRecordClinicalProgress() { return hasRole('admin', 'doctor'); }

function canAccessPage(page) {
  if (page === 'finanzas') return hasRole('admin', 'receptionist');
  return !['administrar', 'configuracion'].includes(page) || hasRole('admin');
}

function applyRoleAccess() {
  document.documentElement.dataset.role = currentAccess.role || '';
  document.querySelectorAll('[data-roles]').forEach(element => {
    const allowedRoles = element.dataset.roles.split(/\s+/).filter(Boolean);
    element.hidden = !allowedRoles.includes(currentAccess.role);
  });
  renderSessionIdentity();
}

async function getAccessForSession(session) {
  if (!session?.user || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('full_name, status, role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error || !data || data.status !== 'approved' || !ROLE_LABELS[data.role]) return null;
  return { id: session.user.id, role: data.role, status: data.status, fullName: data.full_name || '', email: session.user.email || '' };
}

function setCurrentAccess(access) {
  currentAccess = access;
  applyRoleAccess();
  return currentAccess;
}

async function loadCurrentAccess(session) {
  const access = await getAccessForSession(session);
  if (!access) return null;
  setCurrentAccess(access);
  return currentAccess;
}

function clearCurrentAccess() {
  currentAccess = { id: null, role: null, status: null, fullName: '', email: '' };
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
