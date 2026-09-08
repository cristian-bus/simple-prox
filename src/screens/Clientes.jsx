// src/screens/Clientes.jsx
import React, { useState } from 'react';
import { Search, UserPlus, Upload, Download, DollarSign, Users, X, Edit2, Trash2, Filter, MessageCircle } from 'lucide-react';

const formatCur = (num) => `$ ${num.toLocaleString('es-AR')}`;

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const Modal = ({ title, onClose, children }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3 className="modal-title">{title}</h3>
        <button onClick={onClose} className="btn-icon"><X size={20} /></button>
      </div>
      <div className="modal-body">
        {children}
      </div>
    </div>
  </div>
);

const Clientes = ({ kiosco }) => {
  const { clients, addClient, updateClient, deleteClient, payDebt, caja, businessConfig, users, sales = [] } = kiosco;
  const isPro = businessConfig?.plan === 'Pro';
  
  const activeUser = caja.isOpen ? users.find(u => u.id === caja.openedBy) : null;
  let userName = activeUser ? activeUser.name : caja.openedByName;
  if (!userName || userName === 'Sistema') {
     userName = users.find(u => u.role === 'Admin')?.name || 'Admin';
  }

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos'); // 'Todos' | 'Deudor' | 'Al dia'
  const [showFilters, setShowFilters] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // New client state
  const [newClientName, setNewClientName] = useState('');
  const [newClientCuit, setNewClientCuit] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Edit client state
  const [editingClient, setEditingClient] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCuit, setEditCuit] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Delete state
  const [clientToDelete, setClientToDelete] = useState(null);

  // Payment state
  const [selectedClientForPayment, setSelectedClientForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');

  const handleRegisterClient = () => {
    if (!newClientName) return;
    addClient({ name: newClientName, cuit: newClientCuit || 'Consumidor Final', phone: newClientPhone || '' });
    setActiveModal(null);
    setNewClientName('');
    setNewClientCuit('');
    setNewClientPhone('');
  };

  const openEdit = (client) => {
    setEditingClient(client);
    setEditName(client.name);
    setEditCuit(client.cuit || '');
    setEditPhone(client.phone || '');
    setActiveModal('editClient');
  };

  const handleEditClient = () => {
    if (!editName.trim() || !editingClient) return;
    updateClient(editingClient.id, { name: editName.trim(), cuit: editCuit.trim() || 'Consumidor Final', phone: editPhone.trim() || '' });
    setActiveModal(null);
    setEditingClient(null);
  };

  const openDelete = (client) => {
    setClientToDelete(client);
    setActiveModal('deleteClient');
  };

  const handleDeleteClient = () => {
    if (!clientToDelete) return;
    deleteClient(clientToDelete.id);
    setActiveModal(null);
    setClientToDelete(null);
  };

  const handleRegisterPayment = () => {
    if (!selectedClientForPayment) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    payDebt(selectedClientForPayment.id, amount, selectedClientForPayment.name, paymentMethod, userName);
    setActiveModal(null);
    setSelectedClientForPayment(null);
    setPaymentAmount('');
    setPaymentMethod('Efectivo');
  };

  const displayClients = clients.filter(c => c.id !== 1).filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.cuit && c.cuit.includes(search));
    const matchStatus = filterStatus === 'Todos' || 
                       (filterStatus === 'Deudor' && c.deuda > 0) || 
                       (filterStatus === 'Al dia' && (!c.deuda || c.deuda <= 0));
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(displayClients.length / ITEMS_PER_PAGE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const startIdx = (currentPageSafe - 1) * ITEMS_PER_PAGE;
  const paginatedClients = displayClients.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const clientFiadoSales = selectedClientForPayment 
    ? sales.filter(s => s.clientId === selectedClientForPayment.id && s.method === 'Fiado')
    : [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p className="page-subtitle">Gestiona tus clientes y sus cuentas corrientes</p>
        </div>
        <div className="page-actions">
              <button className="btn btn-outline" style={{ display: 'flex', gap: '8px' }}>
                <Upload size={16} /> Importar
              </button>
              <button className="btn btn-outline" style={{ display: 'flex', gap: '8px' }}>
                <Download size={16} /> Exportar
              </button>
          <button className="btn btn-primary" onClick={() => setActiveModal('newClient')}>
            <UserPlus size={16} /> Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="controls-bar" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <Search className="search-icon" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o CUIT..."
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}><X size={16} /></button>}
        </div>
        
        <div style={{ position: 'relative' }}>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Filtros {filterStatus !== 'Todos' && '●'}
          </button>

          {showFilters && (
            <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '8px', width: '250px', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '20px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Estado del cliente</label>
                <select 
                  className="input" 
                  value={filterStatus}
                  onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                >
                  <option value="Todos">Todos los estados</option>
                  <option value="Deudor">Con deuda</option>
                  <option value="Al dia">Al día</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card table-card" style={{ paddingBottom: '40px' }}>
        <div className="card-header">
          <h2 className="card-title">Lista de Clientes</h2>
          <p className="card-subtitle">Lista de todos los clientes registrados</p>
        </div>

        {displayClients.length === 0 ? (
          <div className="empty-state">
            <Users size={48} className="empty-icon" />
            <h3 className="empty-title">No hay clientes</h3>
            <p className="empty-message">No se encontraron clientes que coincidan con la búsqueda.</p>
            {clients.length <= 1 && (
              <button className="btn btn-primary" style={{ padding: '10px 24px', marginTop: '16px' }} onClick={() => setActiveModal('newClient')}>
                <UserPlus size={18} /> Registrar primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>CUIT / DNI</th>
                  <th>Registrado</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Deuda</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedClients.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>{c.cuit}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>{formatDate(c.createdAt)}</td>
                    <td>
                      {c.deuda > 0 ? (
                        <span style={{ backgroundColor: 'rgba(234, 67, 53, 0.1)', color: 'var(--color-danger)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', fontWeight: 600 }}>Deudor</span>
                      ) : (
                        <span style={{ backgroundColor: 'rgba(52, 168, 83, 0.1)', color: 'var(--color-success)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', fontWeight: 600 }}>Al día</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: c.deuda > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
                      {formatCur(c.deuda || 0)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                        {/* WhatsApp */}
                        {c.phone && (
                          <button
                            className="btn-icon"
                            title="Enviar WhatsApp"
                            onClick={() => window.open(`https://api.whatsapp.com/send?phone=${c.phone.replace(/[^0-9]/g, '')}`, '_blank')}
                            style={{ padding: '6px', backgroundColor: 'rgba(37, 211, 102, 0.1)', color: '#25D366', borderRadius: '6px' }}
                          >
                            <MessageCircle size={15} />
                          </button>
                        )}
                        {/* Editar — disponible en todos los planes */}
                        <button
                          className="btn-icon text-primary"
                          title="Editar cliente"
                          onClick={() => openEdit(c)}
                          style={{ padding: '6px', backgroundColor: 'rgba(66, 133, 244, 0.1)', borderRadius: '6px' }}
                        >
                          <Edit2 size={15} />
                        </button>

                        {/* Eliminar — disponible en todos los planes */}
                        <button
                          className="btn-icon text-danger"
                          title="Eliminar cliente"
                          onClick={() => openDelete(c)}
                          style={{ padding: '6px', backgroundColor: 'rgba(234, 67, 53, 0.1)', borderRadius: '6px' }}
                        >
                          <Trash2 size={15} />
                        </button>

                        {/* Saldar — solo plan Pro (fiado es feature Pro) */}
                        {isPro && (
                          <button
                            className="btn btn-outline"
                            style={{ padding: '5px 10px', fontSize: '13px', opacity: c.deuda > 0 ? 1 : 0.4 }}
                            disabled={!c.deuda || c.deuda <= 0}
                            title="Registrar pago de deuda"
                            onClick={() => { setSelectedClientForPayment(c); setActiveModal('payDebt'); }}
                          >
                            <DollarSign size={14} /> Saldar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px', padding: '16px', borderTop: '1px solid var(--color-border)' }}>
                <button className="btn btn-outline" disabled={currentPageSafe === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}>
                   Anterior
                </button>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                  Página {currentPageSafe} de {totalPages}
                </span>
                <button className="btn btn-outline" disabled={currentPageSafe === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}>
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Nuevo cliente */}
      {activeModal === 'newClient' && (
        <Modal title="Nuevo Cliente" onClose={() => setActiveModal(null)}>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Nombre / Razón Social:</div>
            <input
              type="text"
              className="input"
              placeholder="Nombre completo"
              value={newClientName}
              onChange={e => setNewClientName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRegisterClient(); }}
              autoFocus
            />
          </div>
          <div className="input-group" style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>CUIT (Opcional):</div>
            <input
              type="text"
              className="input"
              placeholder="Ej: 20-12345678-9"
              value={newClientCuit}
              onChange={e => setNewClientCuit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRegisterClient(); }}
            />
          </div>
          <div className="input-group" style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>WhatsApp (Opcional):</div>
            <input
              type="text"
              className="input"
              placeholder="Ej: 5491122334455"
              value={newClientPhone}
              onChange={e => setNewClientPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRegisterClient(); }}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleRegisterClient}>
            Registrar Cliente
          </button>
        </Modal>
      )}

      {/* Modal: Editar cliente */}
      {activeModal === 'editClient' && editingClient && (
        <Modal title="Editar Cliente" onClose={() => { setActiveModal(null); setEditingClient(null); }}>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Nombre / Razón Social:</div>
            <input
              type="text"
              className="input"
              placeholder="Nombre completo"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEditClient(); }}
              autoFocus
            />
          </div>
          <div className="input-group" style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>CUIT / DNI:</div>
            <input
              type="text"
              className="input"
              placeholder="Ej: 20-12345678-9"
              value={editCuit}
              onChange={e => setEditCuit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEditClient(); }}
            />
          </div>
          <div className="input-group" style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>WhatsApp (Opcional):</div>
            <input
              type="text"
              className="input"
              placeholder="Ej: 5491122334455"
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEditClient(); }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setActiveModal(null); setEditingClient(null); }}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEditClient}>
              Guardar Cambios
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Confirmar eliminación */}
      {activeModal === 'deleteClient' && clientToDelete && (
        <div className="modal-overlay" onClick={() => { setActiveModal(null); setClientToDelete(null); }} style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '28px', animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(234, 67, 53, 0.1)', marginBottom: '16px' }}>
                <Trash2 size={28} color="var(--color-danger)" />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>¿Eliminar cliente?</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
                Estás a punto de eliminar a <strong>{clientToDelete.name}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-outline" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600 }} onClick={() => { setActiveModal(null); setClientToDelete(null); }}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, backgroundColor: 'var(--color-danger)', border: 'none' }} onClick={handleDeleteClient}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Saldar deuda (solo Pro) */}
      {activeModal === 'payDebt' && selectedClientForPayment && (
        <Modal title="Registrar Cobro de Deuda" onClose={() => { setActiveModal(null); setSelectedClientForPayment(null); setPaymentAmount(''); }}>
          <div style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Cliente</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>{selectedClientForPayment.name}</div>
            <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Deuda Total Activa</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-danger)' }}>{formatCur(selectedClientForPayment.deuda)}</div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: '#1a1f36', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compras al Fiado</h4>
            {clientFiadoSales.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '8px', textAlign: 'center' }}>
                No se registraron compras recientes al fiado.
              </div>
            ) : (
              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 10px', fontWeight: 600 }}>Fecha / Hora</th>
                      <th style={{ padding: '6px 10px', fontWeight: 600 }}>Detalle</th>
                      <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientFiadoSales.map(sale => {
                      const saleDate = new Date(sale.date);
                      const formattedDate = saleDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const formattedTime = saleDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                      const itemsSummary = sale.items?.map(it => `${it.qty}x ${it.name}`).join(', ') || 'Sin productos';

                      return (
                        <tr key={sale.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                            <div>{formattedDate}</div>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{formattedTime} hs</div>
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={itemsSummary}>
                            {itemsSummary}
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right', color: 'var(--color-danger)' }}>
                            {formatCur(sale.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="input-group" style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Monto que abona:</div>
            <input
              type="number"
              className="input"
              placeholder="Ej: 5000"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="input-group" style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Método de Pago:</div>
            <select
              className="input"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Cuenta Corriente">Cuenta Corriente</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Este monto se descontará de la deuda del cliente y <b>{caja.isOpen ? (paymentMethod === 'Efectivo' ? 'se sumará al efectivo en la Caja activa automáticamente' : 'se registrará en los movimientos manuales de la caja') : 'NO se puede sumar a la Caja porque está cerrada'}</b>.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleRegisterPayment}
            disabled={!caja.isOpen || !paymentAmount}
          >
            {caja.isOpen ? 'Registrar Pago' : 'Debes abrir la caja primero'}
          </button>
        </Modal>
      )}

    </div>
  );
};

export default React.memo(Clientes);
