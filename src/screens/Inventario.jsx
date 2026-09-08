import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Filter, MoreHorizontal, Edit2, Trash2, X, ArrowLeft, Shuffle, Package, ChevronLeft, ChevronRight, AlertTriangle, Tag } from 'lucide-react';
import { findMatchingOfferForProduct } from '../utils/stockOfferMatcher';
import OfertaDetailModal from '../components/OfertaDetailModal';

const Modal = ({ title, onClose, minWidth, children }) => (
  <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26, 31, 54, 0.6)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: minWidth || '600px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', animation: 'scaleIn 0.2s ease-out' }}>
      <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#1a1f36' }}>{title}</h3>
        <button onClick={onClose} className="btn-icon" style={{ padding: '8px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.05)' }}>
          <X size={20} color="var(--color-text-muted)" />
        </button>
      </div>
      <div style={{ padding: '24px' }}>
        {children}
      </div>
    </div>
  </div>
);

const Inventario = ({ kiosco, ofertas }) => {
  const { products, updateProduct, deleteProduct, addProduct: saveProduct, categoryTree } = kiosco;
  
  const [view, setView] = useState('list'); // 'list' | 'edit'
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [filterSubcategory, setFilterSubcategory] = useState('Todas');
  const [filterSupplier, setFilterSupplier] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [stockLevelFilter, setStockLevelFilter] = useState('Todas'); // 'Todas' | 'low' | 'out'
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  
  const filtersRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setShowFilters(false);
      }
    }
    if (showFilters) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilters]);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '🍞 Alimentos',
    subcategory: 'Panificados',
    isActive: true,
    stock: 0,
    stockAlert: 5,
    iva: 21,
    cost: 0,
    priceNet: 0,
    priceFinal: 0,
    unitType: 'Unidad',
  });

  // Categorías fijas provistas por CATEGORY_TREE
  const suppliers = [...new Set(products.filter(p => !p.isCombo).map(p => p.supplierId || 'Sin proveedor'))];

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      if (field === 'priceNet' || field === 'iva') {
        const net = parseFloat(newData.priceNet) || 0;
        const iva = parseFloat(newData.iva) || 0;
        newData.priceFinal = (net * (1 + iva / 100)).toFixed(2);
      } else if (field === 'priceFinal') {
        const final = parseFloat(newData.priceFinal) || 0;
        const iva = parseFloat(newData.iva) || 0;
        newData.priceNet = (final / (1 + iva / 100)).toFixed(2);
      }
      return newData;
    });
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      sku: product.code || product.sku,
      description: product.description || '',
      category: product.category || '🍞 Alimentos',
      subcategory: product.subcategory || 'Panificados',
      isActive: product.isActive !== undefined ? product.isActive : true,
      stock: product.stock !== undefined ? parseFloat(Number(product.stock).toFixed(3)) : 0,
      stockAlert: product.stockAlert !== undefined ? parseFloat(Number(product.stockAlert).toFixed(3)) : 5,
      iva: product.iva || 21,
      cost: product.cost || 0,
      priceNet: product.priceNet || (product.price / 1.21).toFixed(2),
      priceFinal: product.price || 0,
      unitType: product.unitType || 'Unidad',
    });
    setView('edit');
  };

  const handleSaveProduct = () => {
    const productData = {
      ...formData,
      stock: parseFloat(Number(formData.stock).toFixed(3)) || 0,
      stockAlert: parseFloat(Number(formData.stockAlert).toFixed(3)) || 0,
      price: parseFloat(formData.priceFinal) || 0,
      code: formData.sku,
    };
    updateProduct(editingId, productData);
    setView('list');
    setEditingId(null);
  };

  const lowStockCount = products.filter(p => p.isActive && !p.isCombo && p.stock <= (p.stockAlert || 5) && p.stock > 0).length;
  const outOfStockCount = products.filter(p => p.isActive && !p.isCombo && p.stock === 0).length;
  const totalInvestment = products.filter(p => !p.isCombo).reduce((acc, p) => acc + ((parseFloat(p.cost) || parseFloat(p.priceNet) * 0.7 || 0) * (p.stock || 0)), 0);
  const productsWithStock = products.filter(p => !p.isCombo && (p.stock || 0) > 0).length;

  const today = new Date();
  const warningDays = kiosco.businessConfig?.expirationWarningDays || 15;
  const expiringCount = kiosco.businessConfig?.plan === 'Pro' ? products.filter(p => {
    if (!p.expirationDate || p.stock <= 0 || p.isCombo) return false;
    const diffDays = Math.ceil((new Date(p.expirationDate) - today) / (1000 * 60 * 60 * 24));
    return diffDays <= warningDays;
  }).length : 0;

  // FASE 11: Matching de ofertas para productos con bajo stock
  const activeCampaigns = ofertas?.campaigns || [];
  const productMatchesMap = useMemo(() => {
    if (!activeCampaigns || activeCampaigns.length === 0) return new Map();
    const map = new Map();
    products.forEach(p => {
      if (!p.isActive || p.isCombo || p.isService) return;
      const currentStock = Number(p.stock) || 0;
      const alertStock = p.stockAlert !== undefined && p.stockAlert !== '' ? Number(p.stockAlert) : 5;
      if (currentStock <= alertStock) {
        const match = findMatchingOfferForProduct(p, activeCampaigns);
        if (match) {
          map.set(p.id, match);
        }
      }
    });
    return map;
  }, [products, activeCampaigns]);

  const replenishableCount = productMatchesMap.size;

  const filteredProducts = products.filter(p => {
    if (p.isCombo) return false; // El stock del inventario suele gestionarse para productos individuales, los combos se arman a demanda
    if (p.isService) return false; // Los servicios no tienen stock fisico que contar en inventario
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.code && p.code.includes(searchTerm)) || 
                          (p.sku && p.sku.includes(searchTerm));
    const matchesCategory = filterCategory === 'Todas' || p.category === filterCategory;
    const matchesSubcategory = filterSubcategory === 'Todas' || p.subcategory === filterSubcategory;
    const matchesSupplier = filterSupplier === 'Todos' || (p.supplierId || 'Sin proveedor') === filterSupplier;
    const matchesStatus = filterStatus === 'Todos' || 
                          (filterStatus === 'Activo' && p.isActive) || 
                          (filterStatus === 'Inactivo' && !p.isActive);
    const matchesStockLevel = stockLevelFilter === 'Todas' || 
                              (stockLevelFilter === 'low' && p.stock <= (p.stockAlert || 5) && p.stock > 0 && !p.isService) || 
                              (stockLevelFilter === 'out' && p.stock <= 0 && !p.isService) ||
                              (stockLevelFilter === 'replenish' && productMatchesMap.has(p.id)) ||
                              (stockLevelFilter === 'expiring' && p.expirationDate && p.stock > 0 && Math.ceil((new Date(p.expirationDate) - today) / (1000 * 60 * 60 * 24)) <= warningDays && !p.isService);
    
    return matchesSearch && matchesCategory && matchesSubcategory && matchesSupplier && matchesStatus && matchesStockLevel;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const currentPageSafe = Math.min(currentPage, totalPages > 0 ? totalPages : 1);
  const paginatedProducts = filteredProducts.slice((currentPageSafe - 1) * ITEMS_PER_PAGE, currentPageSafe * ITEMS_PER_PAGE);

  const renderProductDeleteOverlay = () => {
    if (!productToDelete) return null;
    return (
      <div className="modal-overlay" onClick={() => setProductToDelete(null)} style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(234, 67, 53, 0.1)', marginBottom: '16px' }}>
              <Trash2 size={28} color="#ea4335" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>¿Eliminar producto?</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              Estás a punto de eliminar <strong>{productToDelete.name}</strong>. Esta acción no se puede deshacer.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setProductToDelete(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, backgroundColor: '#ea4335', border: 'none' }} onClick={() => { deleteProduct(productToDelete.id); setProductToDelete(null); }}>
              Sí, eliminar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // The modal is moved to the bottom of the main render

  return (
    <div className="page-container" style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <div>
          <h1>Control de Inventario</h1>
          <p className="page-subtitle">Monitoreo de stock y reposición de {kiosco.businessConfig?.storeName || 'tu negocio'}</p>
        </div>
      </div>

      {/* Widgets de resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        
        <div className="card" style={{ padding: '16px 18px', borderRadius: '16px', border: '1px solid var(--color-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
           <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
              <Package size={80} />
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', position: 'relative' }}>
             <div style={{ padding: '8px', borderRadius: '10px', background: 'linear-gradient(135deg, #4285f4 0%, #2b6cb0 100%)', color: 'white', boxShadow: '0 3px 8px rgba(66, 133, 244, 0.3)' }}>
               <Package size={18} />
             </div>
             <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a1f36', whiteSpace: 'nowrap' }}>Inversión Stock</span>
           </div>
           <div style={{ fontSize: '24px', fontWeight: 800, color: '#1a1f36', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>$ {totalInvestment.toLocaleString('es-AR')}</div>
           <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
             <span style={{ background: 'rgba(66, 133, 244, 0.1)', color: 'var(--color-primary)', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, fontSize: '11px' }}>
               {productsWithStock} con stock
             </span>
           </div>
        </div>

        <div 
          className="card" 
          style={{ 
            padding: '16px 18px', borderRadius: '16px', 
            border: stockLevelFilter === 'low' ? '2px solid #f2994a' : '1px solid var(--color-border)', 
            boxShadow: stockLevelFilter === 'low' ? '0 4px 20px rgba(242, 153, 74, 0.15)' : '0 4px 20px rgba(0,0,0,0.04)', 
            position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.25s', marginBottom: 0
          }}
          onClick={() => setStockLevelFilter(stockLevelFilter === 'low' ? 'Todas' : 'low')}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
           <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
              <Filter size={80} color="#f2994a" />
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', position: 'relative' }}>
             <div style={{ padding: '8px', borderRadius: '10px', background: 'linear-gradient(135deg, #f2994a 0%, #e67e22 100%)', color: 'white', boxShadow: '0 3px 8px rgba(242, 153, 74, 0.3)' }}>
               <Filter size={18} />
             </div>
             <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a1f36', whiteSpace: 'nowrap' }}>Stock Bajo</span>
           </div>
           <div style={{ fontSize: '24px', fontWeight: 800, color: '#f2994a', letterSpacing: '-0.5px' }}>{lowStockCount}</div>
           <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
             <span style={{ background: 'rgba(242, 153, 74, 0.1)', color: '#d35400', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, fontSize: '11px' }}>
               Al límite
             </span>
             <span style={{ fontSize: '11px' }}>· Filtrar</span>
           </div>
        </div>

        <div 
          className="card" 
          style={{ 
            padding: '16px 18px', borderRadius: '16px', 
            border: stockLevelFilter === 'out' ? '2px solid #ea4335' : '1px solid var(--color-border)', 
            boxShadow: stockLevelFilter === 'out' ? '0 4px 20px rgba(234, 67, 53, 0.15)' : '0 4px 20px rgba(0,0,0,0.04)', 
            position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.25s', marginBottom: 0
          }}
          onClick={() => setStockLevelFilter(stockLevelFilter === 'out' ? 'Todas' : 'out')}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
           <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
              <X size={80} color="#ea4335" />
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', position: 'relative' }}>
             <div style={{ padding: '8px', borderRadius: '10px', background: 'linear-gradient(135deg, #ea4335 0%, #c0392b 100%)', color: 'white', boxShadow: '0 3px 8px rgba(234, 67, 53, 0.3)' }}>
               <X size={18} />
             </div>
             <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a1f36', whiteSpace: 'nowrap' }}>Sin Stock</span>
           </div>
           <div style={{ fontSize: '24px', fontWeight: 800, color: '#ea4335', letterSpacing: '-0.5px' }}>{outOfStockCount}</div>
           <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
             <span style={{ background: 'rgba(234, 67, 53, 0.1)', color: '#c0392b', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, fontSize: '11px' }}>
               Agotados
             </span>
             <span style={{ fontSize: '11px' }}>· Filtrar</span>
           </div>
        </div>

        <div 
            className="card" 
            style={{ 
              padding: '16px 18px', borderRadius: '16px', 
              border: stockLevelFilter === 'expiring' ? '2px solid #f59f00' : '1px solid var(--color-border)', 
              boxShadow: stockLevelFilter === 'expiring' ? '0 4px 20px rgba(245, 159, 0, 0.15)' : '0 4px 20px rgba(0,0,0,0.04)', 
              position: 'relative', overflow: 'hidden', cursor: kiosco.businessConfig?.plan === 'Pro' ? 'pointer' : 'default', transition: 'all 0.25s', marginBottom: 0
            }}
            onClick={() => {
              if (kiosco.businessConfig?.plan !== 'Pro') {
                setAlertMessage("La alerta de vencimientos es una función exclusiva del Plan Pro.");
                setActiveModal('alert');
                return;
              }
              setStockLevelFilter(stockLevelFilter === 'expiring' ? 'Todas' : 'expiring');
            }}
            onMouseEnter={(e) => { if(kiosco.businessConfig?.plan === 'Pro') e.currentTarget.style.transform = 'translateY(-3px)'}}
            onMouseLeave={(e) => { if(kiosco.businessConfig?.plan === 'Pro') e.currentTarget.style.transform = 'translateY(0)'}}
          >
             <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
                <AlertTriangle size={80} color="#f59f00" />
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', position: 'relative' }}>
               <div style={{ padding: '8px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59f00 0%, #d97706 100%)', color: 'white', boxShadow: '0 3px 8px rgba(245, 159, 0, 0.3)' }}>
                 <AlertTriangle size={18} />
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                 <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a1f36', whiteSpace: 'nowrap' }}>Por Vencer</span>
                 {kiosco.businessConfig?.plan !== 'Pro' && (
                   <span style={{ fontSize: '9px', color: '#ff4d4f', background: '#fff1f0', padding: '1px 4px', borderRadius: '6px', fontWeight: 600 }}>Pro</span>
                 )}
               </div>
             </div>
             <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59f00', letterSpacing: '-0.5px' }}>{expiringCount}</div>
             <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
               <span style={{ background: 'rgba(245, 159, 0, 0.1)', color: '#d97706', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, fontSize: '11px' }}>
                 Activos
               </span>
               <span style={{ fontSize: '11px' }}>· Filtrar</span>
             </div>
          </div>

        {/* FASE 11: Widget de Reposición Mayorista B2B */}
        <div 
          className="card" 
          style={{ 
            padding: '16px 18px', borderRadius: '16px', 
            border: stockLevelFilter === 'replenish' ? '2px solid #2563EB' : '1px solid var(--color-border)', 
            boxShadow: stockLevelFilter === 'replenish' ? '0 4px 20px rgba(37, 99, 235, 0.15)' : '0 4px 20px rgba(0,0,0,0.04)', 
            position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.25s', marginBottom: 0
          }}
          onClick={() => setStockLevelFilter(stockLevelFilter === 'replenish' ? 'Todas' : 'replenish')}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
           <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.04, transform: 'rotate(-15deg)' }}>
              <Tag size={80} color="#2563EB" />
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', position: 'relative' }}>
             <div style={{ padding: '8px', borderRadius: '10px', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', color: 'white', boxShadow: '0 3px 8px rgba(37, 99, 235, 0.3)' }}>
               <Tag size={18} />
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
               <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a1f36', whiteSpace: 'nowrap' }}>Con Oferta B2B</span>
               <span style={{ fontSize: '9px', color: '#16A34A', background: '#DCFCE7', padding: '1px 4px', borderRadius: '6px', fontWeight: 600 }}>B2B</span>
             </div>
           </div>
           <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB', letterSpacing: '-0.5px' }}>{replenishableCount}</div>
           <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
             <span style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#1D4ED8', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, fontSize: '11px' }}>
               Faltantes
             </span>
             <span style={{ fontSize: '11px' }}>· Filtrar</span>
           </div>
        </div>

      </div>

      <div className="controls-bar" style={{ position: 'relative' }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o código..." 
            className="input"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '40px' }}
          />
          {searchTerm && <button className="search-clear" onClick={() => setSearchTerm('')}><X size={16} /></button>}
        </div>
        <div ref={filtersRef} style={{ position: 'relative', display: 'flex', gap: '8px' }}>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Filtros {(filterCategory !== 'Todas' || filterSubcategory !== 'Todas' || filterSupplier !== 'Todos' || filterStatus !== 'Todos') && '•'}
          </button>
          {(filterCategory !== 'Todas' || filterSubcategory !== 'Todas' || filterSupplier !== 'Todos' || filterStatus !== 'Todos') && (
            <button className="btn btn-outline" style={{ padding: '10px 12px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)', display: 'flex', alignItems: 'center' }} onClick={() => { setFilterCategory('Todas'); setFilterSubcategory('Todas'); setFilterSupplier('Todos'); setFilterStatus('Todos'); }} title="Limpiar filtros">
              <X size={16} />
            </button>
          )}

          {showFilters && (
            <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '8px', width: '250px', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Categoría</label>
                <select className="input" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFilterSubcategory('Todas'); }}>
                  <option value="Todas">Todas las categorías</option>
                  {Object.keys(categoryTree).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              {filterCategory !== 'Todas' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subcategoría</label>
                  <select className="input" value={filterSubcategory} onChange={e => setFilterSubcategory(e.target.value)}>
                    <option value="Todas">Todas las subcategorías</option>
                    {(Array.isArray(categoryTree[filterCategory]) ? categoryTree[filterCategory] : []).map(sub => <option key={sub} value={sub}>{sub}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Proveedor</label>
                <select className="input" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
                  <option value="Todos">Todos los proveedores</option>
                  {suppliers.map(sup => <option key={sup} value={sup}>{sup}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Estado</label>
                <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="Todos">Todos los estados</option>
                  <option value="Activo">Activos</option>
                  <option value="Inactivo">Inactivos</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card table-card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Producto ↑↓</th>
                <th>Categoría</th>
                <th>Proveedor</th>
                <th>Estado</th>
                <th>Stock ↑↓</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map(p => (
                <tr key={p.id} style={{ backgroundColor: p.stock === 0 ? 'rgba(234, 67, 53, 0.06)' : (p.stock <= (p.stockAlert || 5) && p.stock > 0 ? 'rgba(242, 153, 74, 0.06)' : 'inherit') }}>
                  <td>
                    <div className="product-cell">
                      <span className="product-name" style={{ fontSize: '13px' }}>{p.name}</span>
                      <span className="product-code" style={{ fontSize: '11px' }}>{p.code || p.sku}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{ backgroundColor: 'rgba(66, 133, 244, 0.1)', color: '#4285f4', fontSize: '11px', padding: '2px 6px', display: 'inline-block', marginBottom: '4px' }}>{p.category}</span>
                    <br />
                    <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#eef2f6', color: '#495057', display: 'inline-block' }}>{p.subcategory || 'General'}</span>
                  </td>
                  <td>
                    <span className="badge" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '11px', padding: '2px 6px' }}>{p.supplierId || 'Sin proveedor'}</span>
                  </td>
                  <td>
                    <div className={`toggle-switch ${p.isActive ? 'active' : ''}`} onClick={() => updateProduct(p.id, { isActive: !p.isActive })} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                      <div className="toggle-thumb"></div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: p.stock <= (p.stockAlert || 5) ? 'var(--color-danger)' : 'inherit', fontSize: '13px' }}>
                    {p.unitType === 'Peso (Kg)' ? `${Number(p.stock).toFixed(3)} Kg` : `${p.stock} u`}
                  </td>
                  <td style={{ textAlign: 'center', padding: '4px' }}>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                      {productMatchesMap.has(p.id) && (
                        <button
                          className="btn btn-outline"
                          onClick={() => ofertas?.openCampaignDetail && ofertas.openCampaignDetail(productMatchesMap.get(p.id).campaign)}
                          title={`Ver oferta mayorista de ${productMatchesMap.get(p.id).campaign.supplierName}`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderColor: '#93C5FD',
                            color: '#1D4ED8',
                            backgroundColor: '#EFF6FF',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Tag size={12} />
                          <span>Reponer B2B</span>
                        </button>
                      )}
                      <button className="btn-icon text-primary" onClick={() => startEdit(p)} title="Editar" style={{ padding: '6px', backgroundColor: 'rgba(66, 133, 244, 0.1)', borderRadius: '6px' }}>
                        <Edit2 size={16} />
                      </button>
                      <button className="btn-icon text-danger" onClick={() => setProductToDelete(p)} title="Eliminar" style={{ padding: '6px', backgroundColor: 'rgba(234, 67, 53, 0.1)', borderRadius: '6px' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedProducts.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                    No se encontraron productos en el inventario
                  </td>
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
      {renderProductDeleteOverlay()}

      {view === 'edit' && (
        <Modal title="Editar Stock" onClose={() => setView('list')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
             <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Nombre</label>
              <input type="text" className="input" value={formData.name} onChange={e => handleInputChange('name', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Código/SKU</label>
              <input type="text" className="input" value={formData.sku} onChange={e => handleInputChange('sku', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Stock Actual {formData.unitType === 'Peso (Kg)' ? <span style={{ color: 'var(--color-primary)' }}>(Kg)</span> : ''}</label>
              <input type="text" inputMode="decimal" className="input" value={formData.stock} onChange={e => handleInputChange('stock', e.target.value)} style={{ fontWeight: 700, color: 'var(--color-primary)' }}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Alerta de Stock {formData.unitType === 'Peso (Kg)' ? <span style={{ color: 'var(--color-primary)' }}>(Kg)</span> : ''}</label>
              <input type="text" inputMode="decimal" className="input" value={formData.stockAlert} onChange={e => handleInputChange('stockAlert', e.target.value)} />
            </div>
             <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Precio Final</label>
              <input type="number" className="input" value={formData.priceFinal} onChange={e => handleInputChange('priceFinal', e.target.value)} />
            </div>
            <div>
               <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Estado</label>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <div className={`toggle-switch ${formData.isActive ? 'active' : ''}`} onClick={() => handleInputChange('isActive', !formData.isActive)}>
                   <div className="toggle-thumb"></div>
                 </div>
                 <span style={{ fontSize: '14px', fontWeight: 500 }}>{formData.isActive ? 'Activo' : 'Inactivo'}</span>
               </div>
            </div>
          </div>
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '24px' }}>
            <button className="btn btn-outline" onClick={() => setView('list')}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSaveProduct} style={{ padding: '10px 32px' }}>Guardar Cambios</button>
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

      {/* FASE 11: Detalle de Oferta B2B para reposición */}
      {ofertas && (
        <OfertaDetailModal
          campaign={ofertas.selectedCampaign}
          isOpen={ofertas.isModalOpen}
          onClose={ofertas.closeCampaignDetail}
          onWhatsAppClick={ofertas.handleWhatsAppClick}
        />
      )}
    </div>
  );
};

export default React.memo(Inventario);
