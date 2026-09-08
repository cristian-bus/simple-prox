// src/screens/Reportes.jsx
import React, { useState } from 'react';
import { DollarSign, ShoppingBag, Package, X, FileText, ChevronLeft, ChevronRight, Archive, Calendar, AlertTriangle } from 'lucide-react';

const formatCur = (num) => `$ ${num.toLocaleString('es-AR')}`;

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

const Reportes = ({ kiosco }) => {
  const { sales, products, caja, shifts = [] } = kiosco;
  
  const [reportView, setReportView] = useState('sales'); // 'sales' | 'shifts'
  const [activeList, setActiveList] = useState('ventas'); // 'ventas' | 'movimientos'
  const [shiftsPage, setShiftsPage] = useState(1);
  const [showProfitModal, setShowProfitModal] = useState(false);
  const [profitStartDate, setProfitStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [profitEndDate, setProfitEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterPeriod, setFilterPeriod] = useState(caja.isOpen ? 'current_shift' : 'all_time');
  const [filterMethod, setFilterMethod] = useState('Todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState(null);
  
  const [selectedShift, setSelectedShift] = useState(null);
  
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [currentMovPage, setCurrentMovPage] = useState(1);
  const [activeModal, setActiveModal] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');

  const ITEMS_PER_PAGE = 20;

  // Filtrar Ventas
  let filteredSales = sales.slice().reverse(); 
  
  if (filterPeriod === 'current_shift' && caja.isOpen && caja.openedTimestamp) {
    filteredSales = filteredSales.filter(s => new Date(s.date).getTime() >= caja.openedTimestamp);
  }

  if (filterMethod !== 'Todos') {
    filteredSales = filteredSales.filter(s => s.method === filterMethod);
  }

  // Cálculos dinámicos
  const totalVentas = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const totalOperaciones = filteredSales.length;
  const productosBajos = products.filter(p => p.isActive && !p.isCombo && p.stock <= (p.stockAlert || 5) && p.stock > 0).length;

  // Paginación Ventas
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / ITEMS_PER_PAGE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  
  const startIdx = (currentPageSafe - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedSales = filteredSales.slice(startIdx, endIdx);

  // Filtrar Movimientos Manuales
  let filteredMovimientos = [];
  if (filterPeriod === 'current_shift') {
    filteredMovimientos = (caja.movimientos || []).slice().reverse();
  } else {
    filteredMovimientos = [
      ...(caja.movimientos || []),
      ...shifts.flatMap(s => s.movimientos || [])
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // Paginación Movimientos
  const totalMovPages = Math.max(1, Math.ceil(filteredMovimientos.length / ITEMS_PER_PAGE));
  const currentMovPageSafe = Math.min(currentMovPage, totalMovPages);
  const startMovIdx = (currentMovPageSafe - 1) * ITEMS_PER_PAGE;
  const paginatedMovimientos = filteredMovimientos.slice(startMovIdx, startMovIdx + ITEMS_PER_PAGE);

  // Paginación Turnos
  const SHIFTS_PER_PAGE = 20;
  const totalShiftsPages = Math.max(1, Math.ceil(shifts.length / SHIFTS_PER_PAGE));
  const currentShiftsPageSafe = Math.min(shiftsPage, totalShiftsPages);
  const startShiftIdx = (currentShiftsPageSafe - 1) * SHIFTS_PER_PAGE;
  const paginatedShifts = shifts.slice(startShiftIdx, startShiftIdx + SHIFTS_PER_PAGE);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Reportes y Rendición</h1>
          <p className="page-subtitle">Analiza el rendimiento de tu negocio y audita tus cierres de turno</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn ${reportView === 'sales' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setReportView('sales')}>
            <DollarSign size={16} /> Panel de Ventas
          </button>
          <button className={`btn ${reportView === 'shifts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setReportView('shifts')}>
            <Archive size={16} /> Cierres de Turno
          </button>
        </div>
      </div>

      {reportView === 'sales' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '8px' }}>
              <select 
                 className="input" 
                 style={{ padding: '8px 12px', minWidth: '150px' }}
                 value={filterMethod}
                 onChange={e => { 
                   setFilterMethod(e.target.value); 
                   setCurrentPage(1); 
                 }}
              >
                <option value="Todos">Todos los Medios</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Transferencia">Transferencia</option>
                <option value="QR">QR</option>
                <option value="Fiado">Fiado</option>
              </select>
              <button className="btn btn-primary" onClick={() => {
                if (kiosco.businessConfig?.plan !== 'Pro') {
                  setAlertMessage("La Rentabilidad Neta es una función exclusiva del Plan Pro. Ve a Configuración para actualizar tu plan.");
                  setActiveModal('alert');
                } else {
                  setShowProfitModal(true);
                }
              }} style={{ backgroundColor: '#10b981', borderColor: '#10b981', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                 <DollarSign size={16} /> Rentabilidad Neta (Pro)
              </button>
            <select 
               className="input" 
               style={{ padding: '8px 12px', minWidth: '150px' }}
               value={filterPeriod}
               onChange={e => { setFilterPeriod(e.target.value); setCurrentPage(1); }}
            >
              <option value="all_time">Operación Histórica Total</option>
              {caja.isOpen && <option value="current_shift">Turno en Curso (Actual)</option>}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            
            {/* Ventas Totales */}
            <div className="card" style={{ padding: '24px', borderRadius: '20px', border: '1px solid var(--color-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
                <DollarSign size={100} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', position: 'relative' }}>
                <div style={{ padding: '10px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)' }}>
                  <DollarSign size={22} />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a1f36' }}>Ventas Totales</span>
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#1a1f36', letterSpacing: '-0.5px' }}>{formatCur(totalVentas)}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '12px' }}>
                  Ingresos
                </span>
                del período seleccionado
              </div>
            </div>

            {/* Operaciones */}
            <div className="card" style={{ padding: '24px', borderRadius: '20px', border: '1px solid var(--color-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
                <ShoppingBag size={100} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', position: 'relative' }}>
                <div style={{ padding: '10px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white', boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)' }}>
                  <ShoppingBag size={22} />
                </div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a1f36' }}>Operaciones</span>
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#1a1f36', letterSpacing: '-0.5px' }}>{totalOperaciones}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '12px' }}>
                  Tickets
                </span>
                emitidos
              </div>
            </div>


          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button 
              className={`btn ${activeList === 'ventas' ? 'btn-primary' : 'btn-outline'}`} 
              onClick={() => setActiveList('ventas')}
              style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 600 }}
            >
              <FileText size={18} style={{ marginRight: '8px' }} /> Ver Listado de Ventas
            </button>
            <button 
              className={`btn ${activeList === 'movimientos' ? 'btn-primary' : 'btn-outline'}`} 
              onClick={() => setActiveList('movimientos')}
              style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 600 }}
            >
              <DollarSign size={18} style={{ marginRight: '8px' }} /> Ver Ingresos y Retiros Manuales
            </button>
          </div>

          {activeList === 'ventas' && (
          <div className="card">
            <h2 className="card-title">Listado de Ventas</h2>
            <p className="card-subtitle">{filterPeriod === 'current_shift' ? 'Ventas operadas en el turno actual' : 'Registro de todas las ventas históricas'}</p>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Fecha/Hora</th>
                    <th>Cliente</th>
                    <th>Método</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right', width: '120px' }}>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSales.map(s => {
                    const isFiado = s.method === 'Fiado';
                    return (
                     <tr key={s.id}>
                       <td>
                         <div style={{ fontWeight: 500 }}>{new Date(s.date).toLocaleDateString()}</div>
                         <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{new Date(s.date).toLocaleTimeString()}</div>
                       </td>
                       <td>
                         <div style={{ fontWeight: 500 }}>{s.client}</div>
                       </td>
                       <td>
                         <span style={{ 
                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                            backgroundColor: isFiado ? 'rgba(66, 133, 244, 0.1)' : 'var(--color-surface)',
                            color: isFiado ? 'var(--color-primary)' : 'var(--color-text)'
                         }}>
                            {s.method}
                         </span>
                       </td>
                       <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCur(s.total)}</td>
                       <td style={{ textAlign: 'right' }}>
                         <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setSelectedSale(s)}>
                           <FileText size={14} style={{ marginRight: '4px' }} /> Ver
                         </button>
                       </td>
                     </tr>
                    );
                  })}
                  {paginatedSales.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px' }}>No hay ventas registradas en este período</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginador */}
            {totalPages > 1 && (
               <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px', padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
                 <button 
                    className="btn btn-outline" 
                    disabled={currentPageSafe === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                 >
                    <ChevronLeft size={18} /> Anterior
                 </button>
                 <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                    Página {currentPageSafe} de {totalPages}
                 </span>
                 <button 
                    className="btn btn-outline" 
                    disabled={currentPageSafe === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                 >
                    Siguiente <ChevronRight size={18} />
                 </button>
               </div>
            )}
          </div>
          )}

          {activeList === 'movimientos' && filteredMovimientos.length >= 0 && (
            <div className="card">
              <h2 className="card-title">Ingresos y Retiros Manuales {filterPeriod === 'current_shift' ? '(Turno Actual)' : '(Histórico)'}</h2>
              <p className="card-subtitle">Movimientos de dinero en caja que no corresponden a ventas</p>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha/Hora</th>
                      <th>Tipo</th>
                      <th>Motivo</th>
                      <th>Usuario</th>
                      <th style={{ textAlign: 'right' }}>Monto</th>
                      <th style={{ textAlign: 'right', width: '120px' }}>Detalles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMovimientos.map(mov => (
                      <tr key={mov.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{new Date(mov.date).toLocaleDateString()}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{new Date(mov.date).toLocaleTimeString()}</div>
                        </td>
                        <td>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                            backgroundColor: mov.type === 'deposit' ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                            color: mov.type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)'
                          }}>
                            {mov.type === 'deposit' ? 'INGRESO' : 'RETIRO'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{mov.motivo}</td>
                        <td>{mov.user}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: mov.type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {mov.type === 'deposit' ? '+' : '-'}{formatCur(mov.amount)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setSelectedMovimiento(mov)}>
                            <FileText size={14} style={{ marginRight: '4px' }} /> Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Paginador Movimientos */}
              {totalMovPages > 1 && (
                 <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px', padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
                   <button 
                      className="btn btn-outline" 
                      disabled={currentMovPageSafe === 1}
                      onClick={() => setCurrentMovPage(prev => Math.max(1, prev - 1))}
                   >
                      <ChevronLeft size={18} /> Anterior
                   </button>
                   <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                      Página {currentMovPageSafe} de {totalMovPages}
                   </span>
                   <button 
                      className="btn btn-outline" 
                      disabled={currentMovPageSafe === totalMovPages}
                      onClick={() => setCurrentMovPage(prev => Math.min(totalMovPages, prev + 1))}
                   >
                      Siguiente <ChevronRight size={18} />
                   </button>
                 </div>
              )}
            </div>
          )}
        </>
      )}

      {reportView === 'shifts' && (
        <div className="card">
           <h2 className="card-title">Auditoría de Turnos Cerrados</h2>
           <p className="card-subtitle">Listado de todos los arqueos físicos realizados por tus empleados</p>

           <div className="table-container">
             <table>
                <thead>
                   <tr>
                      <th style={{ padding: '6px 12px' }}>Apertura</th>
                      <th style={{ padding: '6px 12px' }}>Cierre</th>
                      <th style={{ padding: '6px 12px' }}>Cajero</th>
                      <th style={{ textAlign: 'right', padding: '6px 12px' }}>Dif. Caja</th>
                      <th style={{ textAlign: 'right', width: '140px', padding: '6px 12px' }}>Arqueo COMPLETO</th>
                   </tr>
                </thead>
                <tbody>
                   {paginatedShifts.map(shift => (
                      <tr key={shift.id}>
                         <td style={{ padding: '4px 12px' }}>
                            <div style={{ fontWeight: 500 }}>{shift.openedDate}</div>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{shift.openedAt}</div>
                         </td>
                         <td style={{ padding: '4px 12px' }}>
                            <div style={{ fontWeight: 500 }}>{new Date(shift.closedAtDate).toLocaleDateString()}</div>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{new Date(shift.closedAtDate).toLocaleTimeString()}</div>
                         </td>
                         <td style={{ padding: '4px 12px' }}>
                            <span style={{ backgroundColor: 'var(--color-surface)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{shift.openedByName}</span>
                         </td>
                         <td style={{ textAlign: 'right', padding: '4px 12px' }}>
                            <span style={{ 
                               fontWeight: 600, 
                               color: shift.difference === 0 ? 'var(--color-success)' : (shift.difference > 0 ? 'var(--color-primary)' : 'var(--color-danger)') 
                            }}>
                               {shift.difference > 0 ? '+' : ''}{formatCur(shift.difference)}
                            </span>
                         </td>
                         <td style={{ textAlign: 'right', padding: '4px 12px' }}>
                            <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setSelectedShift(shift)}>
                               <Calendar size={14} style={{ marginRight: '4px' }} /> Ver Resumen
                            </button>
                         </td>
                      </tr>
                   ))}
                   {shifts.length === 0 && (
                      <tr>
                         <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                            No hay cierres de caja registrados aún.
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
             {/* Paginador Turnos */}
             {totalShiftsPages > 1 && (
               <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px', padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
                 <button className="btn btn-outline" disabled={currentShiftsPageSafe === 1} onClick={() => setShiftsPage(prev => Math.max(1, prev - 1))}>
                   <ChevronLeft size={18} /> Anterior
                 </button>
                 <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                   Página {currentShiftsPageSafe} de {totalShiftsPages}
                 </span>
                 <button className="btn btn-outline" disabled={currentShiftsPageSafe === totalShiftsPages} onClick={() => setShiftsPage(prev => Math.min(totalShiftsPages, prev + 1))}>
                   Siguiente <ChevronRight size={18} />
                 </button>
               </div>
             )}
           </div>
        </div>
      )}

      {/* Ticket Modal Ventas */}
      {selectedSale && (
        <Modal title="Comprobante de Venta" onClose={() => setSelectedSale(null)}>
           <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', border: '1px dashed var(--color-border)' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
                 <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>{kiosco.businessConfig?.storeName || 'Simple ProX'}</h2>
                 <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Ticket Nº {selectedSale.id}</div>
                 <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Fecha: {new Date(selectedSale.date).toLocaleString()}</div>
              </div>

              <div style={{ marginBottom: '16px', fontSize: '14px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Cajero:</span>
                    <span style={{ fontWeight: 600 }}>{selectedSale.sellerName || 'Admin'}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Cliente:</span>
                    <span style={{ fontWeight: 600 }}>{selectedSale.client}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Pago:</span>
                    <span style={{ fontWeight: 600 }}>{selectedSale.method}</span>
                 </div>
              </div>

              <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '16px', marginBottom: '16px' }}>
                 <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>PRODUCTOS</div>
                 <div tabIndex={0} autoFocus style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '4px', outline: 'none' }}>
                   {selectedSale.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                         <div style={{ flex: 1 }}>
                            <div>{item.name}</div>
                             <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                               {item.isService ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                    <span>Base del servicio: {formatCur(item.price)}</span>
                                    {item.components && item.components.length > 0 && item.components.map((comp, i) => {
                                      const compProduct = products.find(p => p.id === comp.productId || p.id === Number(comp.productId));
                                      const compPrice = compProduct ? compProduct.price : 0;
                                      const compName = compProduct ? compProduct.name : 'Insumo';
                                      return <span key={i}>{compName}: {item.qty} u x {formatCur(compPrice)}</span>;
                                    })}
                                  </div>
                               ) : (
                                  `${item.unitType === 'Peso (Kg)' ? `${Number(item.qty).toFixed(3)} Kg` : `${item.qty} u`} x ${formatCur(item.price)}`
                               )}
                             </div>
                         </div>
                         <div style={{ fontWeight: 600, paddingTop: '2px' }}>
                            {formatCur(item.lineTotal !== undefined ? item.lineTotal : (item.qty * item.price))}
                         </div>
                      </div>
                   ))}
                 </div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
                    <span>{formatCur(selectedSale.subtotal || selectedSale.total)}</span>
                 </div>
                 {selectedSale.modifier && selectedSale.modifier.type !== 'none' && selectedSale.subtotal && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: selectedSale.modifier.type.includes('desc') ? 'var(--color-success)' : 'var(--color-danger)' }}>
                       <span>{selectedSale.modifier.type.includes('desc') ? 'Descuento' : 'Recargo'}</span>
                       <span>{formatCur(Math.abs((selectedSale.subtotal || selectedSale.total) - selectedSale.total))}</span>
                    </div>
                 )}
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '2px dashed var(--color-border)', fontSize: '20px', fontWeight: 800 }}>
                    <span>TOTAL</span>
                    <span>{formatCur(selectedSale.total)}</span>
                 </div>
              </div>
           </div>
        </Modal>
      )}

      {/* Ticket Modal Turnos */}
      {selectedShift && (
        <Modal title="Resumen Cierre de Turno" onClose={() => setSelectedShift(null)}>
           <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '24px', border: '1px dashed var(--color-border)', maxHeight: '70vh', overflowY: 'auto' }}>
              
              <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
                 <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800 }}>{kiosco.businessConfig?.storeName || 'Simple ProX'}</h2>
                 <div style={{ fontSize: '14px', fontWeight: 600 }}>TICKET CIERRE DE CAJA X</div>
                 <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Nº Auditoría: {selectedShift.id}</div>
              </div>

              <div style={{ marginBottom: '24px', fontSize: '14px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Cajero en Turno:</span>
                    <span style={{ fontWeight: 600 }}>{selectedShift.openedByName}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Apertura:</span>
                    <span style={{ fontWeight: 600 }}>{selectedShift.openedDate} {selectedShift.openedAt}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Cierre:</span>
                    <span style={{ fontWeight: 600 }}>{new Date(selectedShift.closedAtDate).toLocaleString()}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Operaciones en Caja:</span>
                    <span style={{ fontWeight: 600 }}>{selectedShift.salesCount || 0} ventas</span>
                 </div>
              </div>

              <div style={{ borderTop: '2px dashed var(--color-border)', paddingTop: '16px', marginBottom: '16px' }}>
                 <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Ingresos por Ventas</div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(66, 133, 244, 0.05)', borderRadius: '8px' }}>
                    <span style={{ fontWeight: 700, color: '#1a1f36', fontSize: '14px' }}>Ventas Totales Brutas:</span>
                    <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-primary)' }}>
                       {formatCur(
                          selectedShift.totalSalesRevenue !== undefined 
                             ? selectedShift.totalSalesRevenue 
                             : (() => {
                                 const shiftEnd = new Date(selectedShift.closedAtDate).getTime();
                                 return sales.filter(s => new Date(s.date).getTime() >= selectedShift.openedTimestamp && new Date(s.date).getTime() <= shiftEnd).reduce((acc, s) => acc + s.total, 0);
                               })()
                       )}
                    </span>
                 </div>

                 {kiosco.businessConfig?.plan === 'Pro' && (
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(52, 168, 83, 0.05)', borderRadius: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#1a1f36', fontSize: '14px' }}>Rentabilidad (Ganancia Neta):</span>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-success)' }}>
                         {formatCur(
                            (() => {
                               const shiftEnd = new Date(selectedShift.closedAtDate).getTime();
                               const shiftSales = sales.filter(s => new Date(s.date).getTime() >= selectedShift.openedTimestamp && new Date(s.date).getTime() <= shiftEnd);
                               return shiftSales.reduce((acc, s) => acc + (s.total - s.items.reduce((sum, item) => sum + ((item.cost || 0) * item.qty), 0)), 0);
                             })()
                         )}
                      </span>
                   </div>
                 )}

                 <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>Otras Modalidades</div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Medios Digitales (Tarj/TF/QR):</span>
                    <span style={{ fontWeight: 600 }}>{formatCur(selectedShift.totalDigital || 0)}</span>
                 </div>
                 {kiosco.businessConfig?.plan === 'Pro' && (
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Fiado (Al fiado emitido):</span>
                      <span style={{ fontWeight: 600 }}>{formatCur(selectedShift.totalFiado || 0)}</span>
                   </div>
                 )}
              </div>

              <div style={{ borderTop: '2px dashed var(--color-border)', paddingTop: '16px', backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px' }}>
                 <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>ARQUEO DE EFECTIVO MESA</div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Fondo Inicial de Caja:</span>
                    <span style={{ fontWeight: 600 }}>{formatCur(selectedShift.initialEfectivo || 0)}</span>
                 </div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '15px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Físico Esperado (Cálculo Final):</span>
                    <span style={{ fontWeight: 700 }}>{formatCur(selectedShift.expectedEfectivo)}</span>
                 </div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '15px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Físico Rendido (Declarado):</span>
                    <span style={{ fontWeight: 700 }}>{formatCur(selectedShift.reportedEfectivo)}</span>
                 </div>

                 <div style={{ 
                    display: 'flex', justifyContent: 'space-between', 
                    paddingTop: '12px', borderTop: '1px solid var(--color-border)', 
                    fontSize: '16px', fontWeight: 800,
                    color: selectedShift.difference === 0 ? 'var(--color-success)' : (selectedShift.difference > 0 ? 'var(--color-primary)' : 'var(--color-danger)')
                 }}>
                    <span>DIFERENCIA (NETO):</span>
                    <span>
                       {selectedShift.difference > 0 ? '+' : ''}{formatCur(selectedShift.difference)} 
                       <span style={{ fontSize: '12px', marginLeft: '4px' }}>
                          ({selectedShift.difference === 0 ? 'PERFECTO' : (selectedShift.difference > 0 ? 'SOBRANTE' : 'FALTANTE')})
                       </span>
                    </span>
                 </div>
              </div>

              {selectedShift.movimientos && selectedShift.movimientos.length > 0 && (
                 <div style={{ marginTop: '24px', backgroundColor: '#fff', borderRadius: '8px', padding: '16px', border: '1px dashed var(--color-border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1f36', marginBottom: '12px', textTransform: 'uppercase' }}>Historial de Movimientos Manuales</div>
                    {selectedShift.movimientos.map(mov => (
                       <div key={mov.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f5', fontSize: '13px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                             <span style={{ fontWeight: 600, color: mov.type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {mov.type === 'deposit' ? 'Ingreso: ' : 'Retiro: '} 
                                <span style={{ color: '#1a1f36' }}>{mov.motivo}</span>
                             </span>
                             <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                                Hora: {new Date(mov.date).toLocaleTimeString()} • Por: {mov.user}
                             </span>
                          </div>
                          <span style={{ fontWeight: 700, color: mov.type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                             {mov.type === 'deposit' ? '+' : '-'}{formatCur(mov.amount)}
                          </span>
                       </div>
                    ))}
                 </div>
              )}
           </div>
        </Modal>
      )}

      {/* Ticket Modal Movimiento */}
      {selectedMovimiento && (
        <Modal title="Comprobante de Movimiento" onClose={() => setSelectedMovimiento(null)}>
           <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', border: '1px dashed var(--color-border)' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
                 <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>{kiosco.businessConfig?.storeName || 'Simple ProX'}</h2>
                 <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Ticket Nº {selectedMovimiento.id}</div>
                 <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Fecha: {new Date(selectedMovimiento.date).toLocaleString()}</div>
              </div>

              <div style={{ marginBottom: '16px', fontSize: '14px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Usuario:</span>
                    <span style={{ fontWeight: 600 }}>{selectedMovimiento.user}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Tipo de Mov.:</span>
                    <span style={{ fontWeight: 600, color: selectedMovimiento.type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                       {selectedMovimiento.type === 'deposit' ? 'INGRESO DE CAJA' : 'RETIRO DE CAJA'}
                    </span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Concepto/Motivo:</span>
                    <span style={{ fontWeight: 600 }}>{selectedMovimiento.motivo}</span>
                 </div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '2px dashed var(--color-border)', fontSize: '20px', fontWeight: 800 }}>
                    <span>MONTO TOTAL</span>
                    <span style={{ color: selectedMovimiento.type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                       {formatCur(selectedMovimiento.amount)}
                    </span>
                 </div>
              </div>
           </div>
        </Modal>
      )}

      {/* Rentabilidad Neta Modal */}
      {showProfitModal && (
        <Modal title="Rentabilidad Neta (Pro)" onClose={() => setShowProfitModal(false)}>
          <div style={{ minWidth: '400px', marginBottom: '16px' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              Calcula la rentabilidad neta en un rango de fechas seleccionado.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>DESDE</label>
                <input type="date" className="input" value={profitStartDate} onChange={e => setProfitStartDate(e.target.value)} style={{ padding: '8px 12px', width: '100%', borderRadius: '8px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>HASTA</label>
                <input type="date" className="input" value={profitEndDate} onChange={e => setProfitEndDate(e.target.value)} style={{ padding: '8px 12px', width: '100%', borderRadius: '8px' }} />
              </div>
            </div>
            
            {(() => {
              const [startYear, startMonth, startDay] = profitStartDate.split('-');
              const start = new Date(startYear, startMonth - 1, startDay);
              start.setHours(0, 0, 0, 0);
              
              const [endYear, endMonth, endDay] = profitEndDate.split('-');
              const end = new Date(endYear, endMonth - 1, endDay);
              end.setHours(23, 59, 59, 999);
              
              const relevantSales = sales.filter(s => {
                const saleDate = new Date(s.date).getTime();
                return saleDate >= start.getTime() && saleDate <= end.getTime();
              });
              
              let totalRevenue = 0;
              let totalCost = 0;
              
              relevantSales.forEach(s => {
                totalRevenue += s.total;
                s.items?.forEach(item => {
                  let itemCost = parseFloat(item.cost);
                  // Si el costo histórico no está en la venta, o es 0/inválido, buscar en el catálogo actual
                  if (isNaN(itemCost) || itemCost <= 0) {
                     const currentProd = products.find(p => p.id === item.id);
                     itemCost = currentProd ? (parseFloat(currentProd.cost) || 0) : 0;
                  }
                  totalCost += (itemCost * item.qty);
                });
              });
              
              const netProfit = totalRevenue - totalCost;
              const marginPercent = totalCost > 0 ? ((netProfit / totalCost) * 100) : (netProfit > 0 ? 100 : 0);
              
              return (
                <div style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed var(--color-border)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Ventas Totales:</span>
                    <span style={{ fontWeight: 600 }}>{formatCur(totalRevenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed var(--color-border)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Costo Total de Ventas:</span>
                    <span style={{ fontWeight: 600 }}>{formatCur(totalCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#1a1f36' }}>Ganancia Neta:</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{formatCur(netProfit)}</span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Margen Promedio: {marginPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
             <button className="btn btn-primary" onClick={() => setShowProfitModal(false)}>Cerrar</button>
          </div>
        </Modal>
      )}

      {/* Alert Modal */}
      {activeModal === 'alert' && (
        <Modal title="Atención" onClose={() => { setActiveModal(null); setAlertMessage(''); }}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <AlertTriangle size={48} color="var(--color-warning)" />
            </div>
            <p style={{ fontSize: '18px', fontWeight: 600, color: '#1a1f36', marginBottom: '32px' }}>{alertMessage}</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setActiveModal(null); setAlertMessage(''); }}>
              Entendido
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
};

export default React.memo(Reportes);
