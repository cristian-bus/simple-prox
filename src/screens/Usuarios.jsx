import React, { useState } from 'react';
import { Search, UserPlus, Shield, X, Edit2, Trash2, KeyRound } from 'lucide-react';

const Usuarios = ({ kiosco }) => {
  const { users, addUser, updateUser, deleteUser } = kiosco;
  
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [pendingUserUpdate, setPendingUserUpdate] = useState(null);

  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'Vendedor',
    pin: '',
    isActive: true
  });

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const getRoleColor = (role) => {
    return role === 'Admin' ? '#4285f4' : '#34a853';
  };

  const handleStartCreate = () => {
    if (kiosco.businessConfig?.plan === 'Básico' && users.length >= 2) {
      alert("Has alcanzado el límite de 2 usuarios de tu Plan Básico. Por favor, mejora al Plan Pro para agregar más usuarios.");
      return;
    }
    if (kiosco.businessConfig?.plan === 'Pro' && users.length >= 5) {
      alert("Has alcanzado el límite máximo de 5 usuarios permitidos en el Plan Pro.");
      return;
    }
    setEditingId(null);
    setFormData({ name: '', email: '', role: 'Vendedor', pin: '', isActive: true });
    setShowModal(true);
  };

  const handleStartEdit = (user) => {
    setEditingId(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      pin: user.pin,
      isActive: user.isActive
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.pin) return; // Validación básica
    
    if (editingId) {
      const originalUser = users.find(u => u.id === editingId);
      if (originalUser && originalUser.pin !== formData.pin) {
        setPendingUserUpdate({ id: editingId, data: formData });
        return; // wait for confirmation
      }
      updateUser(editingId, formData);
    } else {
      addUser(formData);
    }
    setShowModal(false);
  };

  const confirmPinChange = () => {
    if (pendingUserUpdate) {
      updateUser(pendingUserUpdate.id, pendingUserUpdate.data);
      setPendingUserUpdate(null);
      setShowModal(false);
    }
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteUser(userToDelete.id);
      setUserToDelete(null);
    }
  };

  const renderUserModal = () => {
    if (!showModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 1000 }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
            <button onClick={() => setShowModal(false)} className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={20} color="var(--color-text-muted)" />
            </button>
          </div>
          
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Nombre completo</label>
                <input type="text" className="input" autoFocus value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej: Juan Pérez" />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Correo electrónico (Opcional)</label>
                <input type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="juan@kiosco.com" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Rol</label>
                  <select className="input" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} disabled={editingId && users.find(u => u.id === editingId)?.role === 'Admin' && users.filter(u => u.role === 'Admin').length === 1}>
                    <option value="Vendedor">Vendedor</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>PIN de acceso (4 dígitos)</label>
                  <div style={{ position: 'relative' }}>
                    <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="password" maxLength="4" className="input" value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} style={{ paddingLeft: '36px', letterSpacing: '4px', fontWeight: 700 }} placeholder="1234" />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '8px' }}>
                 <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Acceso al sistema</label>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--color-background)', borderRadius: 'var(--radius-md)' }}>
                   <div className={`toggle-switch ${formData.isActive ? 'active' : ''}`} onClick={() => setFormData({...formData, isActive: !formData.isActive})}>
                     <div className="toggle-thumb"></div>
                   </div>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                     <span style={{ fontSize: '14px', fontWeight: 600 }}>{formData.isActive ? 'Cuenta Activa' : 'Cuenta Suspendida'}</span>
                     <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{formData.isActive ? 'El usuario puede operar el sistema' : 'El acceso está bloqueado temporalmente'}</span>
                   </div>
                 </div>
              </div>
            </div>
          </div>
          
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: 'var(--color-background)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
            <button className="btn btn-outline" onClick={() => setShowModal(false)} style={{ borderRadius: 'var(--radius-md)' }}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!formData.name || formData.pin.length < 4} style={{ borderRadius: 'var(--radius-md)', padding: '10px 24px' }}>Guardar Usuario</button>
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteOverlay = () => {
    if (!userToDelete) return null;
    return (
      <div className="modal-overlay" onClick={() => setUserToDelete(null)} style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--color-danger-bg)', marginBottom: '16px' }}>
              <Trash2 size={28} color="var(--color-danger)" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-text)' }}>¿Eliminar colaborador?</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              Estás eliminando a <strong>{userToDelete.name}</strong> del sistema. Sus operaciones pasadas quedarán registradas, pero perderá acceso inmediatamente.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setUserToDelete(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: 600, backgroundColor: 'var(--color-danger)', border: 'none' }} onClick={confirmDelete}>
              Sí, eliminar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPinChangeConfirm = () => {
    if (!pendingUserUpdate) return null;
    return (
      <div className="modal-overlay" onClick={() => setPendingUserUpdate(null)} style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(245, 159, 0, 0.1)', marginBottom: '16px' }}>
              <Shield size={28} color="var(--color-warning)" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-text)' }}>¿Cambiar clave de acceso?</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              Estás a punto de cambiar el PIN de seguridad. La próxima vez que inicie sesión, deberá usar el nuevo PIN.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setPendingUserUpdate(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: 600 }} onClick={confirmPinChange}>
              Sí, cambiar
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Gestión de Personal</h1>
          <p className="page-subtitle">Administra los roles, pines de seguridad y accesos de tu equipo</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleStartCreate} style={{ padding: '12px 24px', borderRadius: '8px', fontSize: '15px' }}>
            <UserPlus size={18} /> Nuevo Colaborador
          </button>
        </div>
      </div>

      <div className="card table-card">
        <div className="card-header">
          <h2 className="card-title">Equipo Activo</h2>
          <p className="card-subtitle">Personal autorizado para operar en Simple ProX</p>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Rol de Seguridad</th>
                <th>Estado de Acceso</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isAdmin = user.role === 'Admin';
                const isOnlyAdmin = isAdmin && users.filter(u => u.role === 'Admin').length === 1;
                
                return (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          backgroundColor: `${getRoleColor(user.role)}20`,
                          color: getRoleColor(user.role),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {getInitials(user.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1a1f36', fontSize: '15px' }}>{user.name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{user.email || 'Sin correo asociado'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ backgroundColor: `${getRoleColor(user.role)}15`, color: getRoleColor(user.role), fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {isAdmin ? <Shield size={14} /> : null} {user.role}
                      </span>
                    </td>
                    <td>
                      <div className={`toggle-switch ${user.isActive ? 'active' : ''}`} style={{ opacity: isOnlyAdmin ? 0.5 : 1, cursor: isOnlyAdmin ? 'not-allowed' : 'pointer' }} onClick={() => { if(!isOnlyAdmin) updateUser(user.id, { isActive: !user.isActive }) }}>
                        <div className="toggle-thumb"></div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          className="btn-icon text-primary" 
                          onClick={() => handleStartEdit(user)}
                          style={{ padding: '8px', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)' }}
                          title="Editar permisos"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className="btn-icon text-danger" 
                          onClick={() => setUserToDelete(user)}
                          disabled={isOnlyAdmin}
                          style={{ padding: '8px', backgroundColor: isOnlyAdmin ? 'var(--color-background)' : 'var(--color-danger-bg)', color: isOnlyAdmin ? 'var(--color-text-muted)' : 'var(--color-danger)', borderRadius: 'var(--radius-md)', cursor: isOnlyAdmin ? 'not-allowed' : 'pointer' }}
                          title={isOnlyAdmin ? 'El sistema requiere al menos 1 administrador principal' : 'Eliminar colaborador'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {renderUserModal()}
      {renderDeleteOverlay()}
      {renderPinChangeConfirm()}
    </div>
  );
};

export default React.memo(Usuarios);
