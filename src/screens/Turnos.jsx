import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Clock, User, Scissors, Plus, Trash2, Check, X, CalendarDays, Search, UserCircle, DollarSign, History, List } from 'lucide-react';

const Turnos = ({ kiosco, activeUser, setCurrentScreen }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [conflictData, setConflictData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pendientes'); // 'pendientes' o 'historial'
  const [alertMsg, setAlertMsg] = useState('');

  // Form states
  const [clientName, setClientName] = useState('');
  const [time, setTime] = useState('');
  const [serviceName, setServiceName] = useState('');
  // Por defecto selecciona al usuario activo si es posible, o al primer usuario
  const [selectedUserId, setSelectedUserId] = useState(activeUser ? activeUser.id : (kiosco.users[0]?.id || ''));

  const pendingReservations = useMemo(() => {
    return kiosco.reservations.filter(r => {
      const matchDate = r.date === selectedDate;
      const matchSearch = r.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.serviceName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchDate && matchSearch && r.status === 'Pendiente';
    }).sort((a, b) => a.time.localeCompare(b.time));
  }, [kiosco.reservations, selectedDate, searchTerm]);

  const historyReservations = useMemo(() => {
    return kiosco.reservations.filter(r => {
      const matchDate = r.date === selectedDate;
      const matchSearch = r.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.serviceName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchDate && matchSearch && r.status !== 'Pendiente';
    }).sort((a, b) => b.time.localeCompare(a.time));
  }, [kiosco.reservations, selectedDate, searchTerm]);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let h = 9; h <= 19; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      slots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    slots.push("20:00");
    return slots.map(slotTime => {
      const occupiedBy = kiosco.reservations.find(r => r.date === selectedDate && r.time === slotTime && r.status !== 'Cancelado');
      return { time: slotTime, isOccupied: !!occupiedBy, reservation: occupiedBy };
    });
  }, [kiosco.reservations, selectedDate]);

  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clientSearchMatches, setClientSearchMatches] = useState([]);

  useEffect(() => {
    if (clientName && showClientDropdown) {
      const matches = (kiosco.clients || []).filter(c => c.id !== 1 && c.name.toLowerCase().includes(clientName.toLowerCase())).slice(0, 5);
      setClientSearchMatches(matches);
    } else {
      setClientSearchMatches([]);
    }
  }, [clientName, kiosco.clients, showClientDropdown]);

  const handleAddReservation = (e) => {
    e.preventDefault();
    if (!clientName || !time || !serviceName || !selectedUserId) {
      setAlertMsg("Por favor completa todos los campos.");
      return;
    }

    const hasConflict = kiosco.reservations.some(r => r.date === selectedDate && r.time === time && r.status !== 'Cancelado');

    const newRes = {
      clientName,
      date: selectedDate,
      time,
      serviceName,
      userId: Number(selectedUserId),
      status: 'Pendiente'
    };

    if (hasConflict) {
      setConflictData(newRes);
      return;
    }

    saveReservation(newRes);
  };

  const saveReservation = (resData) => {
    kiosco.addReservation(resData);
    setClientName('');
    setTime('');
    setServiceName('');
    setShowNewForm(false);
    setConflictData(null);
  };

  const handleUpdateStatus = (id, newStatus) => {
    kiosco.updateReservation(id, { status: newStatus });
  };

  const handleDelete = (id) => {
    if (window.confirm('¿Seguro que deseas eliminar este turno?')) {
      kiosco.deleteReservation(id);
    }
  };

  const handleCobrar = (res) => {
    kiosco.setCheckoutReservation(res);
    setCurrentScreen('punto-venta');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Pendiente':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fff3cd', color: '#856404' }}>Pendiente</span>;
      case 'Completado':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#d4edda', color: '#155724' }}>Completado</span>;
      case 'Cancelado':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#f8d7da', color: '#721c24' }}>Cancelado</span>;
      default:
        return null;
    }
  };

  const renderReservationList = (reservationsList, emptyMessage) => {
    if (reservationsList.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', minHeight: '200px' }}>
          <Calendar size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '8px', flex: 1, minHeight: 0 }}>
        {reservationsList.map(res => {
          const barbero = kiosco.users.find(u => u.id === res.userId);
          return (
            <div key={res.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', opacity: res.status === 'Cancelado' ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ textAlign: 'center', minWidth: '60px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>{res.time}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Horario</div>
                </div>
                <div style={{ width: '1px', height: '40px', backgroundColor: 'var(--color-border)' }} />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserCircle size={16} /> {res.clientName}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <Scissors size={14} /> {res.serviceName} • <User size={14} style={{ marginLeft: '8px' }} /> {barbero ? barbero.name : 'Desconocido'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {getStatusBadge(res.status)}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {res.status === 'Pendiente' && (
                    <>
                      <button className="btn btn-primary" onClick={() => handleCobrar(res)} title="Cobrar y Completar" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <DollarSign size={16} /> Cobrar
                      </button>
                      <button className="btn btn-icon" onClick={() => handleUpdateStatus(res.id, 'Cancelado')} title="Cancelar Turno" style={{ color: '#721c24', backgroundColor: '#f8d7da', borderColor: '#f5c6cb' }}>
                        <X size={16} />
                      </button>
                    </>
                  )}
                  {(!activeUser || activeUser.role === 'Admin') && (
                    <button className="btn btn-icon" onClick={() => handleDelete(res.id)} title="Eliminar" style={{ color: 'var(--color-danger)' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const totalDelDia = pendingReservations.length + historyReservations.length;
  const completados = historyReservations.filter(r => r.status === 'Completado').length;

  return (
    <div className="screen-container">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Agenda de Turnos</h1>
          <p className="screen-subtitle">Gestiona las reservas y horarios de los barberos</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" onClick={() => setShowAvailabilityModal(true)}>
            <CalendarDays size={20} />
            Ver Disponibilidad
          </button>
          <button className="btn btn-outline" onClick={() => setShowAllModal(true)}>
            <List size={20} />
            Ver Todos
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewForm(true)}>
            <Plus size={20} />
            Nuevo Turno
          </button>
        </div>
      </header>

      <div className="screen-content" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', height: 'calc(100vh - 140px)' }}>
        {/* Panel Izquierdo - Calendario y Filtros */}
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)', height: 'fit-content' }}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Fecha de Agenda</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="date" 
                className="input" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ width: '100%', paddingLeft: '40px' }}
              />
              <CalendarDays size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Buscar Cliente/Servicio</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="input" 
                placeholder="Ej. Juan o Corte..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '40px' }}
              />
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            </div>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
             <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '12px' }}>Resumen del Día</h3>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Total Turnos:</span>
                <span style={{ fontWeight: 600 }}>{totalDelDia}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Pendientes:</span>
                <span style={{ fontWeight: 600, color: '#856404' }}>{pendingReservations.length}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Completados:</span>
                <span style={{ fontWeight: 600, color: '#155724' }}>{completados}</span>
             </div>
          </div>
        </div>

        {/* Panel Derecho - Lista de Turnos con Pestañas */}
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
              Turnos para el {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>

            {/* Pestañas (Tabs) */}
            <div style={{ display: 'flex', backgroundColor: 'var(--color-background)', borderRadius: 'var(--radius-md)', padding: '4px', border: '1px solid var(--color-border)' }}>
              <button 
                onClick={() => setActiveTab('pendientes')}
                style={{ 
                  padding: '8px 16px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: 'none', 
                  background: activeTab === 'pendientes' ? 'var(--color-surface)' : 'transparent',
                  color: activeTab === 'pendientes' ? 'var(--color-text)' : 'var(--color-text-muted)',
                  fontWeight: activeTab === 'pendientes' ? 600 : 500,
                  boxShadow: activeTab === 'pendientes' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Pendientes
                {pendingReservations.length > 0 && (
                  <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 6px', borderRadius: '10px', fontSize: '12px' }}>{pendingReservations.length}</span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('historial')}
                style={{ 
                  padding: '8px 16px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: 'none', 
                  background: activeTab === 'historial' ? 'var(--color-surface)' : 'transparent',
                  color: activeTab === 'historial' ? 'var(--color-text)' : 'var(--color-text-muted)',
                  fontWeight: activeTab === 'historial' ? 600 : 500,
                  boxShadow: activeTab === 'historial' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Historial
              </button>
            </div>
          </div>

          {activeTab === 'pendientes' 
            ? renderReservationList(pendingReservations, 'No hay turnos pendientes') 
            : renderReservationList(historyReservations, 'No hay historial de turnos para esta fecha')}

        </div>
      </div>

      {/* Modal Nuevo Turno */}
      {showNewForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>Nuevo Turno</h2>
              <button className="btn btn-icon" onClick={() => setShowNewForm(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <form onSubmit={handleAddReservation} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Cliente</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      className="input" 
                      value={clientName}
                      onChange={e => {
                        setClientName(e.target.value);
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (showClientDropdown && clientSearchMatches.length > 0) {
                            setClientName(clientSearchMatches[0].name);
                            setShowClientDropdown(false);
                          } else {
                            handleAddReservation(e);
                          }
                        }
                      }}
                      placeholder="Nombre del cliente"
                      required
                      style={{ paddingLeft: '40px', width: '100%' }}
                    />
                    <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    
                    {showClientDropdown && (clientSearchMatches.length > 0 || clientName.trim() !== '') && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', marginTop: '4px', overflow: 'hidden' }}>
                        {clientSearchMatches.map(c => (
                          <div 
                            key={c.id} 
                            style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
                            onMouseDown={() => {
                              setClientName(c.name);
                              setShowClientDropdown(false);
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            {c.phone && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{c.phone}</div>}
                          </div>
                        ))}
                        {clientName.trim() !== '' && !clientSearchMatches.some(c => c.name.toLowerCase() === clientName.trim().toLowerCase()) && (
                          <div 
                            style={{ padding: '12px', cursor: 'pointer', backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseDown={() => {
                              if (kiosco.addClient) {
                                kiosco.addClient({ name: clientName.trim(), cuit: 'Consumidor Final', phone: '' });
                              }
                              setShowClientDropdown(false);
                            }}
                          >
                            <Plus size={16} /> Crear cliente "{clientName.trim()}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Hora</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="time" 
                        className="input" 
                        value={time}
                        onChange={e => setTime(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddReservation(e); }}
                        required
                        style={{ paddingLeft: '40px', width: '100%' }}
                      />
                      <Clock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Barbero / Usuario</label>
                    <select 
                      className="input" 
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      required
                      style={{ width: '100%' }}
                    >
                      <option value="">Seleccionar...</option>
                      {kiosco.users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Servicio</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      className="input" 
                      value={serviceName}
                      onChange={e => setServiceName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddReservation(e); }}
                      placeholder="Ej. Corte clásico, Barba..."
                      required
                      style={{ paddingLeft: '40px', width: '100%' }}
                    />
                    <Scissors size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  </div>
                </div>

                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowNewForm(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">Guardar Turno</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Todos los Turnos */}
      {showAllModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>Listado General de Turnos</h2>
              <button className="btn btn-icon" onClick={() => setShowAllModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px', maxHeight: '65vh', overflowY: 'auto' }}>
              {kiosco.reservations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                  No hay turnos registrados en el sistema.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                      <th style={{ padding: '12px 8px', fontWeight: 600 }}>Fecha</th>
                      <th style={{ padding: '12px 8px', fontWeight: 600 }}>Hora</th>
                      <th style={{ padding: '12px 8px', fontWeight: 600 }}>Cliente</th>
                      <th style={{ padding: '12px 8px', fontWeight: 600 }}>Servicio</th>
                      <th style={{ padding: '12px 8px', fontWeight: 600 }}>Barbero</th>
                      <th style={{ padding: '12px 8px', fontWeight: 600 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kiosco.reservations.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`)).map(r => {
                      const barbero = kiosco.users.find(u => u.id === r.userId);
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: r.status === 'Cancelado' ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px 8px', fontWeight: 500 }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                          <td style={{ padding: '12px 8px', fontWeight: 600 }}>{r.time}</td>
                          <td style={{ padding: '12px 8px' }}>{r.clientName}</td>
                          <td style={{ padding: '12px 8px' }}>{r.serviceName}</td>
                          <td style={{ padding: '12px 8px' }}>{barbero ? barbero.name : 'Desconocido'}</td>
                          <td style={{ padding: '12px 8px' }}>{getStatusBadge(r.status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Disponibilidad (Huecos) */}
      {showAvailabilityModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>Disponibilidad: {selectedDate}</h2>
              <button className="btn btn-icon" onClick={() => setShowAvailabilityModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px', fontSize: '14px' }}>
                Franjas horarias (09:00 - 20:00). Haz clic en un hueco libre para agendar un turno.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {timeSlots.map((slot, idx) => (
                  <button 
                    key={idx} 
                    className="btn"
                    style={{ 
                      padding: '12px', 
                      justifyContent: 'center',
                      backgroundColor: slot.isOccupied ? 'var(--color-surface)' : 'var(--color-background)',
                      border: `1px solid ${slot.isOccupied ? 'var(--color-border)' : 'var(--color-primary)'}`,
                      color: slot.isOccupied ? 'var(--color-text-muted)' : 'var(--color-primary)',
                      cursor: slot.isOccupied ? 'default' : 'pointer',
                      opacity: slot.isOccupied ? 0.7 : 1
                    }}
                    onClick={() => {
                      if (!slot.isOccupied) {
                        setTime(slot.time);
                        setShowAvailabilityModal(false);
                        setShowNewForm(true);
                      }
                    }}
                  >
                    <Clock size={16} style={{ marginRight: '8px' }} />
                    <span style={{ fontWeight: 600 }}>{slot.time}</span>
                    <span style={{ fontSize: '12px', marginLeft: '8px' }}>
                      {slot.isOccupied ? '(Ocupado)' : 'Libre'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conflicto */}
      {conflictData && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#721c24' }}>¡Atención! Horario Ocupado</h2>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '20px', lineHeight: '1.5', color: 'var(--color-text)' }}>
                Ya existe al menos un turno agendado para esta fecha a las <strong>{conflictData.time}</strong> hrs.
                <br /><br />
                ¿Deseas guardar este nuevo turno de todos modos?
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button className="btn btn-outline" onClick={() => setConflictData(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => saveReservation(conflictData)}>Sí, guardar igual</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMsg && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-danger)' }}>Aviso</h2>
              <button className="btn btn-icon" onClick={() => setAlertMsg('')}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <p style={{ fontSize: '16px', color: 'var(--color-text)', marginBottom: '24px' }}>{alertMsg}</p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setAlertMsg('')}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default React.memo(Turnos);
