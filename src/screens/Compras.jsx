import React, { useState, useRef, useEffect } from 'react';
import { Search, Package, ArrowLeft, Plus, X, Box, DollarSign, Wallet, Eye, Edit2, Save, Trash2, Settings } from 'lucide-react';

const Modal = ({ title, onClose, minWidth, children }) => (
  <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26, 31, 54, 0.6)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: minWidth || '600px', maxWidth: '95vw', maxHeight: '95vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', animation: 'scaleIn 0.2s ease-out', display: 'flex', flexDirection: 'column' }}>
      <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#1a1f36' }}>{title}</h3>
        <button onClick={onClose} className="btn-icon" style={{ padding: '8px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.05)' }}>
          <X size={20} color="var(--color-text-muted)" />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  </div>
);

const ProductSearchDropdown = ({ onSelect, products }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', flex: 1, zIndex: 50 }}>
      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-primary)' }} />
        <input 
           type="text" 
           className="input" 
           placeholder="Buscar producto por nombre o código para ingresar..." 
           value={search}
           onChange={e => { setSearch(e.target.value); setOpen(true); }}
           onFocus={() => setOpen(true)}
           style={{ padding: '16px 16px 16px 44px', backgroundColor: '#fff', width: '100%', fontSize: '16px', borderRadius: '12px', border: '2px solid transparent', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        />
        {search && <button className="search-clear" onMouseDown={(e) => { e.preventDefault(); setSearch(''); }}><X size={16} /></button>}
      </div>
      {open && search && (
         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: '#fff', border: '1px solid var(--color-border)', borderRadius: '12px', maxHeight: '300px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', marginTop: '8px' }}>
            {products.filter(p => !p.isCombo && (p.name.toLowerCase().startsWith(search.toLowerCase()) || (p.code && p.code.startsWith(search)))).slice(0, 20).map(p => (
               <div 
                 key={p.id} 
                 style={{ padding: '16px', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} 
                 onMouseDown={() => { onSelect(p); setSearch(''); setOpen(false); }}
                 onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                 onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
               >
                 <div>
                   <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a1f36' }}>{p.name}</div>
                   <div style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '4px' }}>Cód: {p.code || p.sku} • Stock actual: {p.stock} • Proveedor: {p.supplierId || 'Sin asign'}</div>
                 </div>
                 <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                   Costo ant: $ {p.cost ? p.cost.toLocaleString('es-AR') : '0'}
                 </div>
               </div>
            ))}
            {products.filter(p => !p.isCombo && (p.name.toLowerCase().startsWith(search.toLowerCase()) || (p.code && p.code.startsWith(search)))).length === 0 && (
               <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                 No se encontraron resultados
               </div>
            )}
         </div>
      )}
    </div>
  );
};

const Compras = ({ kiosco }) => {
  const { products, purchases, addPurchase, updatePurchase, caja, users, suppliers, setSuppliers, updateProduct } = kiosco;
  
  const activeUser = caja.isOpen ? users.find(u => u.id === caja.openedBy) : null;
  const activeRole = activeUser ? activeUser.role : 'Admin'; 
  
  const [view, setView] = useState('list'); 
  const [cart, setCart] = useState([]);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [supplierTerm, setSupplierTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [filterEdited, setFilterEdited] = useState('Todos');
  const [currentPageEdits, setCurrentPageEdits] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', email: '', address: '' });
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [editSupplier, setEditSupplier] = useState({ name: '', phone: '', email: '', address: '' });
  const [supplierToDelete, setSupplierToDelete] = useState(null);

  const handleAddSupplier = () => {
    if (newSupplier.name.trim() === '') return;
    const newName = newSupplier.name.trim();
    setSuppliers([...suppliers, { id: Date.now(), ...newSupplier, name: newName }]);
    setSupplierTerm(newName);
    setNewSupplier({ name: '', phone: '', email: '', address: '' });
    setShowSupplierModal(false);
  };

  const handleUpdateSupplier = (id) => {
    if (editSupplier.name.trim() === '') return;
    const oldSup = suppliers.find(s => s.id === id);
    if (!oldSup) return;
    if (oldSup.name !== editSupplier.name.trim()) {
      const affectedProducts = products.filter(p => p.supplierId === oldSup.name);
      affectedProducts.forEach(p => {
        updateProduct(p.id, { supplierId: editSupplier.name.trim() });
      });
    }
    setSuppliers(suppliers.map(s => s.id === id ? { ...s, ...editSupplier, name: editSupplier.name.trim() } : s));
    setEditingSupplierId(null);
  };

  const handleDeleteSupplier = (id) => {
    const supToDelete = suppliers.find(s => s.id === id);
    if (supToDelete) {
      const affectedProducts = products.filter(p => p.supplierId === supToDelete.name);
      affectedProducts.forEach(p => {
        updateProduct(p.id, { supplierId: 'Sin proveedor' });
      });
    }
    setSuppliers(suppliers.filter(s => s.id !== id));
  };

  const confirmDeleteSupplier = () => {
    if (!supplierToDelete) return;
    handleDeleteSupplier(supplierToDelete.id);
    setSupplierToDelete(null);
  };

  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) {
        setShowSupplierDropdown(false);
      }
    }
    if (showSupplierDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSupplierDropdown]);

  const filteredSuppliersList = [...suppliers]
    .filter(s => s.name.toLowerCase().includes((supplierTerm || '').toLowerCase()))
    .sort((a, b) => {
      const freqA = purchases.filter(p => p.supplierTerm === a.name).length;
      const freqB = purchases.filter(p => p.supplierTerm === b.name).length;
      return freqB - freqA;
    });

  const handleSelectProduct = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1, cost: product.cost || 0, price: product.price || 0, margin: product.margin || 0 }];
    });
  };

  const updateCartItem = (id, key, val) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [key]: val };
        
        // Recalculate price if cost changes, keeping the same configured margin
        if (key === 'cost' && val !== '') {
          const newCost = parseFloat(val);
          if (!isNaN(newCost)) {
             if (updated.margin !== undefined && updated.margin > 0) {
                updated.price = Math.round(newCost * (1 + updated.margin / 100) * 100) / 100;
             } else if (item.cost > 0 && updated.price > 0) {
                // If there's no margin explicitly set but there's a price
                const marginRatio = updated.price / item.cost;
                updated.price = Math.round(newCost * marginRatio * 100) / 100;
             }
          }
        }
        
        // Recalculate margin if user manually changes price in Compras
        if (key === 'price' && val !== '') {
           const newPrice = parseFloat(val);
           const cost = parseFloat(updated.cost);
           if (!isNaN(newPrice) && !isNaN(cost) && cost > 0) {
              updated.margin = Math.round(((newPrice - cost) / cost) * 10000) / 100;
           }
        }
        
        return updated;
      }
      return item;
    }));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = cart.reduce((acc, item) => acc + ((parseInt(item.qty) || 0) * (parseFloat(item.cost) || 0)), 0);
  const totalItems = cart.reduce((acc, item) => acc + (parseInt(item.qty) || 0), 0);

  const handleConfirmPurchase = () => {
    const sanitizedCart = cart.map(item => ({
      ...item,
      qty: Number(item.qty) || 1,
      cost: Number(item.cost) || 0,
      price: Number(item.price) || 0,
      margin: Number(item.margin) || 0
    }));

    const purchaseData = {
      items: sanitizedCart,
      total: cartTotal,
      method: paymentMethod,
      supplierTerm: supplierTerm || 'Varios/General',
    };
    
    if (editingPurchaseId) {
      const modifierName = activeUser ? activeUser.name : 'Administrador';
      updatePurchase(editingPurchaseId, purchaseData, modifierName);
    } else {
      addPurchase(purchaseData);
    }
    
    setCart([]);
    setShowCheckoutModal(false);
    setView('list');
    setEditingPurchaseId(null);
  };

  const formatShortDate = (isoString) => {
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(isoString));
  };

  const startEdit = (purch) => {
    setEditingPurchaseId(purch.id);
    setCart(purch.items.map(i => ({...i, cost: i.unitCost || i.cost})));
    setPaymentMethod(purch.method);
    setSupplierTerm(purch.supplierTerm);
    setView('new');
  };

  const renderCheckoutModal = () => {
    if (!showCheckoutModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowCheckoutModal(false)} style={{ zIndex: 2000 }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px', backgroundColor: '#fff', borderRadius: '16px', padding: '24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(66, 133, 244, 0.1)', marginBottom: '16px' }}>
              <Package size={32} color="var(--color-primary)" />
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>Confirmar Recepción</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', margin: 0 }}>
              Ingresarán <strong>{totalItems} unidades</strong> al inventario de {cart.length} productos diferentes.
            </p>
          </div>
          
          <div style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total de Compra (Costo)</div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a1f36', marginTop: '4px' }}>$ {cartTotal.toLocaleString('es-AR')}</div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: '14px', borderRadius: '12px', fontWeight: 600 }} onClick={() => setShowCheckoutModal(false)}>
              Revisar Carrito
            </button>
            <button className="btn btn-primary" style={{ flex: 1, padding: '14px', borderRadius: '12px', fontWeight: 600, backgroundColor: '#34a853', border: 'none' }} onClick={handleConfirmPurchase}>
              Aceptar e Ingresar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPurchaseDetailsModal = () => {
    if (!selectedPurchase) return null;
    return (
      <div className="modal-overlay" onClick={() => setSelectedPurchase(null)} style={{ zIndex: 1100 }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '500px', backgroundColor: '#fff', borderRadius: '16px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#1a1f36' }}>Detalle de Remito #{selectedPurchase.id.toString().slice(-6)}</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{formatShortDate(selectedPurchase.date)} • {selectedPurchase.supplierTerm}</p>
            </div>
            <button onClick={() => setSelectedPurchase(null)} className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={20} color="var(--color-text-muted)" />
            </button>
          </div>
          
          <div style={{ padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedPurchase.items.map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) 1fr 1fr', gap: '12px', padding: '12px', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1f36' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Cto. un: $ {(item.cost ?? item.unitCost ?? 0).toLocaleString('es-AR')}</div>
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 600, color: '#1a1f36' }}>{item.qty} u.</div>
                  <div style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>$ {(item.qty * (item.cost ?? item.unitCost ?? 0)).toLocaleString('es-AR')}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '20px 24px', borderTop: '1px solid var(--color-border)', backgroundColor: '#f8f9fa', borderRadius: '0 0 16px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <span style={{ fontWeight: 600, fontSize: '16px', color: '#1a1f36' }}>Costo Total Efectuado</span>
              <span style={{ fontWeight: 800, fontSize: '24px', color: 'var(--color-primary)' }}>$ {selectedPurchase.total.toLocaleString('es-AR')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSupplierModal = () => {
    if (!showSupplierModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowSupplierModal(false)} style={{ zIndex: 1200 }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Gestionar Proveedores</h3>
            <button onClick={() => setShowSupplierModal(false)} className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={20} color="var(--color-text-muted)" />
            </button>
          </div>
          
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#1a1f36' }}>Nuevo proveedor</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <input 
                  type="text" autoFocus className="input" placeholder="Nombre (Obligatorio)" 
                  value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
                  style={{ padding: '10px 14px', border: '1px solid var(--color-primary)', borderRadius: '8px', gridColumn: 'span 2' }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSupplier() }}
                />
                <input 
                  type="text" className="input" placeholder="Teléfono" 
                  value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
                  style={{ padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                />
                <input 
                  type="email" className="input" placeholder="Email" 
                  value={newSupplier.email} onChange={e => setNewSupplier({...newSupplier, email: e.target.value})}
                  style={{ padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                />
                <input 
                  type="text" className="input" placeholder="Dirección" 
                  value={newSupplier.address} onChange={e => setNewSupplier({...newSupplier, address: e.target.value})}
                  style={{ padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: '8px', gridColumn: 'span 2' }}
                />
              </div>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 600, display: 'flex', justifyContent: 'center', gap: '8px', backgroundColor: '#809aff', border: 'none' }}
                onClick={handleAddSupplier}
              >
                <Plus size={18} /> Crear
              </button>
            </div>

            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1a1f36', marginBottom: '16px' }}>Proveedores existentes</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                {suppliers.map(sup => (
                  <div key={sup.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '12px', backgroundColor: '#fff' }}>
                    {editingSupplierId === sup.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, marginRight: '16px' }}>
                        <input type="text" className="input" placeholder="Nombre" value={editSupplier.name} onChange={e => setEditSupplier({...editSupplier, name: e.target.value})} style={{ padding: '8px', border: '1px solid var(--color-primary)', borderRadius: '8px' }} autoFocus />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input type="text" className="input" placeholder="Teléfono" value={editSupplier.phone} onChange={e => setEditSupplier({...editSupplier, phone: e.target.value})} style={{ flex: 1, padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px' }} />
                          <input type="email" className="input" placeholder="Email" value={editSupplier.email} onChange={e => setEditSupplier({...editSupplier, email: e.target.value})} style={{ flex: 1, padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px' }} />
                        </div>
                        <input type="text" className="input" placeholder="Dirección" value={editSupplier.address} onChange={e => setEditSupplier({...editSupplier, address: e.target.value})} style={{ padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px' }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a1f36' }}>{sup.name}</div>
                          {(sup.phone || sup.email) && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sup.phone} {sup.phone && sup.email ? '•' : ''} {sup.email}</div>}
                          {sup.address && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sup.address}</div>}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {editingSupplierId === sup.id ? (
                        <>
                          <button className="btn" onClick={() => handleUpdateSupplier(sup.id)} style={{ padding: '8px', backgroundColor: '#34a853', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
                            <Save size={16} />
                          </button>
                          <button className="btn" onClick={() => setEditingSupplierId(null)} style={{ padding: '8px', backgroundColor: '#eef2f6', border: 'none', borderRadius: '8px', color: '#1a1f36', cursor: 'pointer' }}>
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn" onClick={() => { setEditingSupplierId(sup.id); setEditSupplier({ name: sup.name, phone: sup.phone || '', email: sup.email || '', address: sup.address || '' }); }} style={{ padding: '8px', backgroundColor: '#f1f3f5', border: 'none', borderRadius: '8px', color: '#1a1f36', cursor: 'pointer' }}>
                            <Edit2 size={16} />
                          </button>
                          <button className="btn" onClick={() => setSupplierToDelete(sup)} style={{ padding: '8px', backgroundColor: '#ff6b6b', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <div>
          <h1>Control de Compras</h1>
          <p className="page-subtitle">Gestiona el ingreso de mercadería directa al inventario y actualización de costos de {kiosco.businessConfig?.storeName || 'tu negocio'}.</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" style={{ padding: '12px 24px', borderRadius: '8px', fontWeight: 600, fontSize: '15px' }} onClick={() => setShowSupplierModal(true)}>
            <Settings size={18} /> Proveedores
          </button>
          <button className="btn btn-primary" style={{ padding: '12px 24px', borderRadius: '8px', fontWeight: 600, fontSize: '15px' }} onClick={() => setView('new')}>
            <Plus size={18} /> Cargar Nueva Remito/Compra
          </button>
        </div>
      </div>

      {(() => {
        const filteredPurchases = purchases.filter(p => filterEdited === 'Todos' || p.isEdited).slice().reverse();
        const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / ITEMS_PER_PAGE));
        const currentPageSafe = Math.min(currentPage, totalPages > 0 ? totalPages : 1);
        const startIdx = (currentPageSafe - 1) * ITEMS_PER_PAGE;
        const paginatedPurchases = filteredPurchases.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        return (
          <div className="card table-card" style={{ marginBottom: '32px' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="card-title">Historial de compras ingresadas</h2>
                <p className="card-subtitle">Consulta los remitos de stock añadidos previamente.</p>
              </div>
              <div>
                <select className="input" value={filterEdited} onChange={e => { setFilterEdited(e.target.value); setCurrentPage(1); }} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: '#fff' }}>
                  <option value="Todos">Todos los remitos</option>
                  <option value="Editados">Solo Editados</option>
                </select>
              </div>
            </div>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID Remito</th>
                    <th>Fecha Ingreso</th>
                    <th>Origen / Proveedor</th>
                    <th>Artículos (Cant.)</th>
                    <th>Método de Pago</th>
                    <th style={{ textAlign: 'right' }}>Total (Costo)</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPurchases.map(purch => (
                    <tr key={purch.id}>
                      <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>#{purch.id.toString().slice(-6)}</td>
                      <td>{formatShortDate(purch.date)}</td>
                      <td>
                        <span className="badge" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                          {purch.supplierTerm}
                        </span>
                      </td>
                      <td>{purch.items.reduce((acc, it) => acc + it.qty, 0)} u. ({purch.items.length} prod.)</td>
                      <td>{purch.method}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#1a1f36' }}>$ {purch.total.toLocaleString('es-AR')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button 
                            className="btn-icon" 
                            onClick={() => setSelectedPurchase(purch)}
                            style={{ padding: '6px', backgroundColor: 'rgba(66, 133, 244, 0.1)', color: '#4285f4', borderRadius: '6px' }}
                            title="Ver detalle"
                          >
                            <Eye size={18} />
                          </button>
                          {activeRole === 'Admin' && (
                             <button 
                               className="btn-icon text-primary" 
                               onClick={() => startEdit(purch)}
                               style={{ padding: '6px', backgroundColor: 'rgba(66, 133, 244, 0.1)', borderRadius: '6px' }}
                               title="Editar"
                             >
                               <Edit2 size={18} />
                             </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>
                        <Package size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <div>No hay compras registradas en el historial.</div>
                        <div style={{ marginTop: '8px', fontSize: '13px' }}>Hacé clic en "Cargar remito" para ingresar mercadería.</div>
                      </td>
                    </tr>
                  )}
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
          </div>
        );
      })()}

      {(() => {
        const allEdits = purchases.reduce((acc, purch) => {
          if (purch.edits) {
            purch.edits.forEach(edit => {
              acc.push({
                ...edit,
                purchaseId: purch.id,
                supplierTerm: purch.supplierTerm
              });
            });
          }
          return acc;
        }, []).sort((a, b) => new Date(b.editDate) - new Date(a.editDate));

        if (allEdits.length === 0) return null;

        const totalPagesEdits = Math.max(1, Math.ceil(allEdits.length / ITEMS_PER_PAGE));
        const currentSafe = Math.min(currentPageEdits, totalPagesEdits > 0 ? totalPagesEdits : 1);
        const startIdxEdits = (currentSafe - 1) * ITEMS_PER_PAGE;
        const paginatedEdits = allEdits.slice(startIdxEdits, startIdxEdits + ITEMS_PER_PAGE);

        return (
          <div className="card table-card" style={{ marginBottom: '32px' }}>
            <div className="card-header">
              <h2 className="card-title">Registro de Ediciones</h2>
              <p className="card-subtitle">Historial de modificaciones realizadas a los remitos.</p>
            </div>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Fecha de Edición</th>
                    <th>N° Remito</th>
                    <th>Proveedor</th>
                    <th>Modificado Por</th>
                    <th>Modificaciones</th>
                    <th style={{ textAlign: 'right' }}>Total Anterior</th>
                    <th style={{ textAlign: 'right' }}>Nuevo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEdits.map(edit => (
                    <tr key={edit.id}>
                      <td>{formatShortDate(edit.editDate)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>#{edit.purchaseId.toString().slice(-6)}</td>
                      <td>{edit.supplierTerm}</td>
                      <td>
                        <span className="badge" style={{ backgroundColor: 'rgba(66, 133, 244, 0.1)', color: '#4285f4' }}>
                          {edit.modifierName}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{edit.changesSummary || 'Datos generales'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>$ {edit.oldTotal.toLocaleString('es-AR')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>$ {edit.newTotal.toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPagesEdits > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px', padding: '16px', borderTop: '1px solid var(--color-border)' }}>
                  <button className="btn btn-outline" disabled={currentSafe === 1} onClick={() => setCurrentPageEdits(prev => Math.max(1, prev - 1))}>
                     Anterior
                  </button>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                    Página {currentSafe} de {totalPagesEdits}
                  </span>
                  <button className="btn btn-outline" disabled={currentSafe === totalPagesEdits} onClick={() => setCurrentPageEdits(prev => Math.min(totalPagesEdits, prev + 1))}>
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {renderPurchaseDetailsModal()}

      {view === 'new' && (
        <Modal 
          title={editingPurchaseId ? 'Editando Remito' : 'Recepción de Mercadería'} 
          minWidth="1200px"
          onClose={() => { setView('list'); setCart([]); setEditingPurchaseId(null); }}
        >
          <div style={{ padding: '16px 24px', backgroundColor: '#f8f9fa', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>Buscá los productos que compraste y ajustá los costos unitarios actuales.</p>
            </div>
            <div style={{ width: '400px' }}>
              <ProductSearchDropdown onSelect={handleSelectProduct} products={products} />
            </div>
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', backgroundColor: '#f4f6f8', minHeight: '60vh' }}>
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
              {cart.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                  <Box size={64} style={{ opacity: 0.2, marginBottom: '24px' }} />
                  <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1a1f36', marginBottom: '8px' }}>Tu lista de recepción está vacía</h3>
                  <p style={{ fontSize: '15px' }}>Buscá productos arriba para empezar a cargarlos al stock.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr 1fr 1fr 50px', gap: '16px', padding: '0 16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <div>Producto</div>
                    <div>Cant. a ingresar</div>
                    <div>Costo Unitario ($)</div>
                    <div>Precio Venta ($)</div>
                    <div style={{ textAlign: 'right' }}>Subtotal Costo</div>
                    <div></div>
                  </div>
                  {cart.map(item => (
                    <div key={item.id} className="card" style={{ marginBottom: 0, padding: '16px', display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr 1fr 1fr 50px', gap: '16px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a1f36', marginBottom: '4px' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.code || item.sku}</div>
                      </div>
                      <div>
                        <input 
                          type="text" 
                          className="input" 
                          value={item.qty} 
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            updateCartItem(item.id, 'qty', val === '' ? '' : parseInt(val, 10));
                          }}
                          onBlur={e => { if(e.target.value === '' || parseInt(e.target.value) < 1) updateCartItem(item.id, 'qty', 1) }}
                          style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '100%' }}
                        />
                      </div>
                      <div>
                        <input 
                          type="text" 
                          className="input" 
                          value={item.cost} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            updateCartItem(item.id, 'cost', val);
                          }}
                          onBlur={e => { if(e.target.value === '') updateCartItem(item.id, 'cost', 0); else updateCartItem(item.id, 'cost', parseFloat(e.target.value)); }}
                          style={{ padding: '8px 12px', textAlign: 'center', width: '100%' }}
                        />
                      </div>
                      <div>
                        <input 
                          type="text" 
                          className="input" 
                          value={item.price} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            updateCartItem(item.id, 'price', val);
                          }}
                          onBlur={e => { if(e.target.value === '') updateCartItem(item.id, 'price', 0); else updateCartItem(item.id, 'price', parseFloat(e.target.value)); }}
                          style={{ padding: '8px 12px', textAlign: 'center', width: '100%' }}
                          title={`Margen actual: ${item.margin}%`}
                        />
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '16px', color: '#1a1f36' }}>
                        $ {(item.cost * item.qty).toLocaleString('es-AR')}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button className="btn-icon" onClick={() => removeFromCart(item.id)} style={{ padding: '8px', color: '#ea4335', backgroundColor: 'rgba(234, 67, 53, 0.1)', borderRadius: '8px' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ width: '380px', backgroundColor: '#fff', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
              <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1f36', margin: '0 0 24px 0' }}>Detalles de Operación</h3>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-muted)' }}>MÉTODO DE PAGO</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['Efectivo', 'Transferencia', 'Cuenta Corriente', 'Tarjeta', 'Cheque'].map(m => (
                      <button 
                        key={m}
                        className={`btn ${paymentMethod === m ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '12px', justifyContent: 'flex-start', border: paymentMethod !== m ? '1px solid var(--color-border)' : 'none' }}
                        onClick={() => setPaymentMethod(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '24px', position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-muted)' }}>PROVEEDOR / ORIGEN</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Escribí para buscar o crear..."
                    value={supplierTerm}
                    onChange={e => setSupplierTerm(e.target.value)}
                    onFocus={() => setShowSupplierDropdown(true)}
                  />
                  
                  {showSupplierDropdown && supplierTerm.trim().length > 0 && (
                     <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '200px', overflowY: 'auto' }}>
                        {filteredSuppliersList.length > 0 ? filteredSuppliersList.map(sup => (
                          <div 
                            key={sup.id} 
                            style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
                            onMouseDown={() => {
                              setSupplierTerm(sup.name);
                              setShowSupplierDropdown(false);
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1f36' }}>{sup.name}</div>
                          </div>
                        )) : (
                          <div style={{ padding: '10px 16px', color: 'var(--color-text-muted)', fontSize: '14px', fontStyle: 'italic' }}>
                            No hay proveedores con ese nombre.
                          </div>
                        )}
                     </div>
                  )}
                </div>

                <div style={{ margin: 'auto 0 0 0', backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: 'var(--color-text-muted)' }}>
                    <span>Unidades totales</span>
                    <span style={{ fontWeight: 600, color: '#1a1f36' }}>{totalItems}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: 'var(--color-text-muted)' }}>
                    <span>Artículos diferentes</span>
                    <span style={{ fontWeight: 600, color: '#1a1f36' }}>{cart.length}</span>
                  </div>
                  <div style={{ height: '1px', backgroundColor: 'var(--color-border)', margin: '12px 0' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <span style={{ fontWeight: 600, fontSize: '16px', color: '#1a1f36' }}>Total Estimado</span>
                    <span style={{ fontWeight: 800, fontSize: '32px', color: 'var(--color-primary)' }}>$ {cartTotal.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '16px', fontSize: '18px', borderRadius: '12px', fontWeight: 700 }}
                  disabled={cart.length === 0}
                  onClick={() => setShowCheckoutModal(true)}
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
          {renderCheckoutModal()}
        </Modal>
      )}
      {renderSupplierModal()}

      {/* Modal Confirmar Eliminar Proveedor */}
      {supplierToDelete && (
        <div className="modal-overlay" onClick={() => setSupplierToDelete(null)} style={{ zIndex: 1500 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '28px', animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(234, 67, 53, 0.1)', marginBottom: '16px' }}>
                <Trash2 size={28} color="var(--color-danger)" />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>¿Eliminar proveedor?</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
                Estás a punto de eliminar a <strong>{supplierToDelete.name}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-outline" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setSupplierToDelete(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, backgroundColor: 'var(--color-danger)', border: 'none' }} onClick={confirmDeleteSupplier}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Compras);
