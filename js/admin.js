let managedUsers = [];
let editingManagedUserId = null;

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function statusLabel(status) {
  return status === 'approved' ? 'Activa' : 'Suspendida';
}

function formatAdminDate(value) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin registro' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderManagedUsers() {
  const body = document.querySelector('#admin-users-body');
  const empty = document.querySelector('#admin-users-empty');
  if (!body || !empty) return;
  body.innerHTML = managedUsers.map(user => `
    <tr>
      <td><strong>${escapeHTML(user.email)}</strong>${user.fullName ? `<small>${escapeHTML(user.fullName)}</small>` : ''}</td>
      <td><span class="role-chip role-${escapeHTML(user.role)}">${escapeHTML(roleLabel(user.role))}</span></td>
      <td><span class="status-chip ${user.status === 'approved' ? 'is-active' : 'is-blocked'}">${escapeHTML(statusLabel(user.status))}</span></td>
      <td>${escapeHTML(formatAdminDate(user.lastSignInAt))}</td>
      <td class="admin-table-actions">
        <button class="admin-action-button" type="button" data-admin-edit="${escapeHTML(user.id)}">Editar</button>
        <button class="admin-action-button" type="button" data-admin-reset="${escapeHTML(user.id)}">Restablecer</button>
        <button class="admin-action-button is-danger" type="button" data-admin-delete="${escapeHTML(user.id)}" ${user.isCurrentUser ? 'disabled' : ''}>Eliminar</button>
      </td>
    </tr>`).join('');
  empty.hidden = managedUsers.length > 0;
}

async function loadManagedUsers() {
  if (!hasRole('admin')) return;
  const loading = document.querySelector('#admin-users-loading');
  if (loading) loading.hidden = false;
  try {
    const result = await invokeUserManagement('list');
    managedUsers = Array.isArray(result.users) ? result.users : [];
    renderManagedUsers();
  } catch (error) {
    showToast(error.message || 'No se pudieron cargar los usuarios.');
  } finally {
    if (loading) loading.hidden = true;
  }
}

function openManagedUserModal(user = null) {
  const modal = document.querySelector('#admin-user-modal');
  const title = document.querySelector('#admin-user-title');
  const email = document.querySelector('#admin-user-email');
  const name = document.querySelector('#admin-user-name');
  const role = document.querySelector('#admin-user-role');
  const status = document.querySelector('#admin-user-status');
  const description = document.querySelector('#admin-user-copy');
  if (!modal || !title || !email || !name || !role || !status || !description) return;
  editingManagedUserId = user?.id || null;
  title.textContent = user ? 'Editar usuario' : 'Agregar usuario';
  description.textContent = user
    ? 'Cambia el rol o suspende temporalmente el acceso.'
    : 'El usuario recibirá un correo seguro para crear su contraseña.';
  email.value = user?.email || '';
  email.disabled = Boolean(user);
  name.value = user?.fullName || '';
  name.disabled = Boolean(user);
  role.value = user?.role || 'receptionist';
  status.value = user?.status || 'approved';
  status.closest('label').hidden = !user;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
  setTimeout(() => (user ? role : email).focus(), 0);
}

function closeManagedUserModal() {
  const modal = document.querySelector('#admin-user-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  editingManagedUserId = null;
  updatePageScrollLock();
}

async function requestManagedUserDelete(user) {
  const { confirmed, value } = await showConfirmationDialog({
    title: 'Eliminar usuario',
    message: 'Se eliminará el acceso de esta cuenta. Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar usuario',
    input: {
      type: 'text',
      label: `Escribe ${user.email} para confirmar`,
      match: user.email,
      value: ''
    }
  });
  if (!confirmed) return;
  try {
    await invokeUserManagement('delete', { userId: user.id, confirmEmail: value });
    showToast('Usuario eliminado.');
    await loadManagedUsers();
  } catch (error) {
    showToast(error.message || 'No se pudo eliminar el usuario.');
  }
}

document.addEventListener('click', async event => {
  if (event.target.closest('#admin-add-user')) {
    openManagedUserModal();
    return;
  }
  if (event.target.closest('#admin-user-close') || event.target.closest('#admin-user-cancel')) {
    closeManagedUserModal();
    return;
  }
  const edit = event.target.closest('[data-admin-edit]');
  if (edit) {
    const user = managedUsers.find(item => item.id === edit.dataset.adminEdit);
    if (user) openManagedUserModal(user);
    return;
  }
  const reset = event.target.closest('[data-admin-reset]');
  if (reset) {
    const user = managedUsers.find(item => item.id === reset.dataset.adminReset);
    if (!user || !window.confirm(`¿Enviar un enlace de restablecimiento a ${user.email}?`)) return;
    try {
      await invokeUserManagement('reset_password', { userId: user.id });
      showToast('Enlace de restablecimiento enviado.');
    } catch (error) {
      showToast(error.message || 'No se pudo enviar el enlace.');
    }
    return;
  }
  const remove = event.target.closest('[data-admin-delete]');
  if (remove) {
    const user = managedUsers.find(item => item.id === remove.dataset.adminDelete);
    if (user) await requestManagedUserDelete(user);
  }
});

document.addEventListener('submit', async event => {
  if (!event.target.matches('#admin-user-form')) return;
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');
  const payload = {
    role: document.querySelector('#admin-user-role').value,
    status: document.querySelector('#admin-user-status').value
  };
  submit.disabled = true;
  try {
    if (editingManagedUserId) {
      await invokeUserManagement('update', { userId: editingManagedUserId, ...payload });
      showToast('Usuario actualizado.');
    } else {
      await invokeUserManagement('invite', {
        email: document.querySelector('#admin-user-email').value,
        fullName: document.querySelector('#admin-user-name').value,
        role: payload.role
      });
      showToast('Invitación enviada.');
    }
    closeManagedUserModal();
    await loadManagedUsers();
  } catch (error) {
    showToast(error.message || 'No se pudo guardar el usuario.');
  } finally {
    submit.disabled = false;
  }
});
