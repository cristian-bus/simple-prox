import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShoppingBag, 
  Sparkles, 
  MessageCircle, 
  Building2, 
  Search, 
  Tag, 
  RefreshCw, 
  ShieldCheck, 
  SlidersHorizontal,
  Bookmark,
  ChevronDown,
  Package,
  TrendingDown,
  Info,
  ArrowLeft,
  Truck,
  ExternalLink,
  ShoppingCart,
  Plus,
  Minus
} from 'lucide-react';
import OfertaDetailModal from '../components/OfertaDetailModal';
import B2BCartModal from '../components/B2BCartModal';
import { calculateDiscount, B2B_CATEGORIES, formatVigenciaText } from '../utils/b2bUtils';
import { buildWhatsAppUrl } from '../services/adSyncEngine';
import { getLowStockReplenishmentOpportunities } from '../utils/stockOfferMatcher';

export default function Ofertas({ ofertas, kiosco }) {
  const { 
    campaigns, 
    loading, 
    selectedCampaign, 
    isModalOpen, 
    openCampaignDetail, 
    closeCampaignDetail, 
    handleWhatsAppClick 
  } = ofertas;

  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSupplier, setSelectedSupplier] = useState('Todos');
  const [sortOrder, setSortOrder] = useState('recent'); // recent, discount, price
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState(B2B_CATEGORIES);
  const [viewMode, setViewMode] = useState('offers'); // 'offers' | 'distributors'
  const [distributors, setDistributors] = useState([]);

  // Ofertas guardadas por el usuario
  const [savedOffers, setSavedOffers] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('kioscoprox_saved_offers'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const toggleSavedOffer = (e, id) => {
    e.stopPropagation();
    setSavedOffers(prev => {
      const isSaved = prev.includes(id);
      const next = isSaved ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('kioscoprox_saved_offers', JSON.stringify(next));
      return next;
    });
  };

  // FASE 11 Paso C: Carrito B2B multiproducto para pedidos a mayoristas
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [b2bCart, setB2bCart] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('kioscoprox_b2b_cart'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const saveB2BCart = (nextCart) => {
    setB2bCart(nextCart);
    try {
      localStorage.setItem('kioscoprox_b2b_cart', JSON.stringify(nextCart));
    } catch (e) {
      console.warn('Error saving B2B cart', e);
    }
  };

  const addToB2BCart = (campaign, qtyDelta = 1) => {
    if (!campaign) return;
    const existingIndex = b2bCart.findIndex(item => item.campaign.id === campaign.id);
    let updated;
    if (existingIndex >= 0) {
      updated = b2bCart.map((item, idx) => {
        if (idx === existingIndex) {
          return { ...item, qty: Math.max(1, item.qty + qtyDelta) };
        }
        return item;
      });
    } else {
      updated = [...b2bCart, { campaign, qty: Math.max(1, qtyDelta) }];
    }
    saveB2BCart(updated);
  };

  const updateB2BCartQty = (campaignId, newQty) => {
    if (newQty <= 0) {
      removeB2BCartItem(campaignId);
      return;
    }
    const updated = b2bCart.map(item => {
      if (item.campaign.id === campaignId) {
        return { ...item, qty: newQty };
      }
      return item;
    });
    saveB2BCart(updated);
  };

  const removeB2BCartItem = (campaignId) => {
    const updated = b2bCart.filter(item => item.campaign.id !== campaignId);
    saveB2BCart(updated);
  };

  const clearB2BCart = () => {
    saveB2BCart([]);
  };

  const totalCartUnits = useMemo(() => {
    return b2bCart.reduce((acc, it) => acc + (it.qty || 0), 0);
  }, [b2bCart]);

  // Cargar categorías centralizadas desde b2b_categories.json
  useEffect(() => {
    fetch('/b2b_categories.json')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch(err => console.warn('Usando categorías B2B por defecto', err));
  }, []);

  // Cargar directorio de distribuidores centralizado
  useEffect(() => {
    fetch('/b2b_distributors.json')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDistributors(data);
        }
      })
      .catch(err => console.warn('Usando distribuidores B2B por defecto', err));
  }, []);

  // Función de normalización de mayoristas (resuelve variaciones, mayúsculas o siglas como MAC -> Distribuidora MAC)
  const normalizeSupplierName = (name, knownDistributors = []) => {
    if (!name) return 'Mayorista';
    const clean = name.trim();
    const lower = clean.toLowerCase();

    if (lower === 'mac' || lower === 'distribuidora mac' || lower === 'mayorista mac') {
      return 'Distribuidora MAC';
    }

    if (Array.isArray(knownDistributors) && knownDistributors.length > 0) {
      const match = knownDistributors.find(d => {
        const dLower = (d.name || '').toLowerCase().trim();
        return dLower === lower || dLower.includes(lower) || lower.includes(dLower);
      });
      if (match) return match.name;
    }

    return clean;
  };

  // Catálogo unificado de Distribuidores con conteo de ofertas activas
  const distributorList = useMemo(() => {
    const map = new Map();

    distributors.forEach(d => {
      const canonName = normalizeSupplierName(d.name, distributors);
      map.set(canonName.toLowerCase(), {
        id: d.id,
        name: canonName,
        category: d.category || 'General',
        whatsappNumber: d.whatsappNumber || '',
        minPurchase: d.minPurchase || null,
        conditions: d.conditions || '',
        campaigns: []
      });
    });

    campaigns.forEach(c => {
      const canonName = normalizeSupplierName(c.supplierName, distributors);
      const key = canonName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: `dist-${key.replace(/\s+/g, '-')}`,
          name: canonName,
          category: c.category || 'General',
          whatsappNumber: c.whatsappNumber || '',
          minPurchase: c.minPurchase || null,
          conditions: c.conditions || '',
          campaigns: []
        });
      }
      map.get(key).campaigns.push(c);
    });

    let list = Array.from(map.values());

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d => 
        d.name.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        (d.conditions && d.conditions.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => b.campaigns.length - a.campaigns.length);
    return list;
  }, [distributors, campaigns, searchQuery]);

  const handleOpenDistributorCatalog = (distName) => {
    const canonName = normalizeSupplierName(distName, distributors);
    setSelectedSupplier(canonName);
    setSelectedCategory('Todas');
    setViewMode('offers');
  };

  const handleContactDistributor = (dist) => {
    if (!dist.whatsappNumber) {
      alert("Este distribuidor no tiene configurado un número de WhatsApp en la base de datos.");
      return;
    }
    const storeName = kiosco?.businessConfig?.storeName || kiosco?.businessConfig?.name || 'Kiosco';
    const message = `Hola ${dist.name}, te contacto desde el comercio "${storeName}" a través de KioscoProX para consultar sobre sus ofertas y catálogo mayorista.`;
    const url = buildWhatsAppUrl(dist.whatsappNumber, message, null, null);
    try {
      if (window.api && window.api.openExternal) {
        window.api.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    }
  };

  // Proveedores únicos extraídos de las campañas
  const suppliers = useMemo(() => {
    const set = new Set(['Todos']);
    campaigns.forEach(c => {
      if (c.supplierName) set.add(normalizeSupplierName(c.supplierName, distributors));
    });
    return Array.from(set);
  }, [campaigns, distributors]);

  // FASE 11: Detectar campañas que coinciden con productos que tienen bajo stock
  const replenishmentOpportunities = useMemo(() => {
    if (!kiosco?.products || !campaigns || campaigns.length === 0) return [];
    return getLowStockReplenishmentOpportunities(kiosco.products, campaigns);
  }, [kiosco?.products, campaigns]);

  const replenishmentCampaignIds = useMemo(() => {
    return replenishmentOpportunities.map(o => o.campaign.id);
  }, [replenishmentOpportunities]);

  // Filtrado de ofertas
  const filteredCampaigns = useMemo(() => {
    let filtered = campaigns.filter(c => {
      if (selectedCategory === 'Guardadas') {
        return savedOffers.includes(c.id);
      }
      if (selectedCategory === 'Reposicion') {
        return replenishmentCampaignIds.includes(c.id);
      }
      const matchCat = selectedCategory === 'Todas' || c.category === selectedCategory;
      
      const canonCampSup = normalizeSupplierName(c.supplierName, distributors).toLowerCase();
      const canonSelectedSup = normalizeSupplierName(selectedSupplier, distributors).toLowerCase();
      const matchSup = selectedSupplier === 'Todos' || 
        canonCampSup === canonSelectedSup ||
        (c.supplierName && c.supplierName.toLowerCase().trim() === selectedSupplier.toLowerCase().trim());

      const matchQuery = !searchQuery.trim() || 
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSup && matchQuery;
    });

    // Ordenamiento
    if (sortOrder === 'price') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortOrder === 'discount') {
      filtered.sort((a, b) => {
        const descA = a.regularPrice > 0 ? ((a.regularPrice - a.price) / a.regularPrice) : 0;
        const descB = b.regularPrice > 0 ? ((b.regularPrice - b.price) / b.regularPrice) : 0;
        return descB - descA;
      });
    }
    return filtered;
  }, [campaigns, selectedCategory, selectedSupplier, searchQuery, sortOrder, savedOffers, replenishmentCampaignIds]);

  // Categorías principales y secundarias para el menú "Más ▾"
  const mainCategories = useMemo(() => {
    return ['Todas', 'Bebidas', 'Golosinas', 'Snacks', 'Almacén'];
  }, []);

  const extraCategories = useMemo(() => {
    return categories.filter(c => !mainCategories.includes(c) && c !== 'Guardadas');
  }, [categories, mainCategories]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#F8FAFC',
      color: '#0F172A',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Header Superior Minimalista */}
      <div style={{
        padding: '16px 28px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShoppingBag size={18} />
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
              Ofertas para tu Negocio
            </h1>
            <span style={{
              padding: '3px 8px',
              backgroundColor: '#DCFCE7',
              color: '#16A34A',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <ShieldCheck size={13} />
              Canal Mayorista Directo
            </span>
          </div>
          <p style={{ color: '#64748B', fontSize: '13px', margin: 0 }}>
            Precios y promociones mayoristas exclusivas sin comisiones.
          </p>
        </div>

        {/* Selector de Modo: Ofertas vs Mayoristas */}
        <div style={{
          display: 'flex',
          backgroundColor: '#F1F5F9',
          padding: '3px',
          borderRadius: '8px',
          gap: '3px'
        }}>
          <button
            onClick={() => setViewMode('offers')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: viewMode === 'offers' ? 600 : 500,
              backgroundColor: viewMode === 'offers' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'offers' ? '#0F172A' : '#64748B',
              boxShadow: viewMode === 'offers' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Tag size={14} color={viewMode === 'offers' ? '#2563EB' : '#64748B'} />
            <span>Promociones ({campaigns.length})</span>
          </button>

          <button
            onClick={() => setViewMode('distributors')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: viewMode === 'distributors' ? 600 : 500,
              backgroundColor: viewMode === 'distributors' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'distributors' ? '#0F172A' : '#64748B',
              boxShadow: viewMode === 'distributors' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Building2 size={14} color={viewMode === 'distributors' ? '#2563EB' : '#64748B'} />
            <span>Mayoristas y Catálogos ({distributorList.length})</span>
          </button>
        </div>

        {/* Buscador & Recarga */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Buscar producto o distribuidor..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                color: '#0F172A',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={e => e.target.style.borderColor = '#94A3B8'}
              onBlur={e => e.target.style.borderColor = '#E2E8F0'}
            />
          </div>

          <button
            onClick={() => ofertas.refetch && ofertas.refetch()}
            disabled={loading}
            title="Recargar Ofertas"
            style={{
              padding: '8px 12px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Cargando...' : 'Recargar'}</span>
          </button>

          {/* Botón Carrito B2B Pedido Mayorista */}
          <button
            onClick={() => setIsCartOpen(true)}
            style={{
              padding: '8px 14px',
              backgroundColor: totalCartUnits > 0 ? '#2563EB' : '#FFFFFF',
              border: `1px solid ${totalCartUnits > 0 ? '#2563EB' : '#CBD5E1'}`,
              borderRadius: '8px',
              color: totalCartUnits > 0 ? '#FFFFFF' : '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: totalCartUnits > 0 ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <ShoppingCart size={15} />
            <span>Pedido Mayorista</span>
            {totalCartUnits > 0 && (
              <span style={{
                backgroundColor: '#FFFFFF',
                color: '#2563EB',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {totalCartUnits}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Barra de Categorías / Filtros (solo visible en modo ofertas) */}
      {viewMode === 'offers' && (
        <div style={{
          padding: '10px 28px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto'
        }}>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '4px' }}>
            <SlidersHorizontal size={13} />
            Filtrar:
          </span>

          {/* Categorías Principales */}
          {mainCategories.map(cat => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? '#0F172A' : '#F8FAFC',
                  color: isActive ? '#FFFFFF' : '#475569',
                  border: `1px solid ${isActive ? '#0F172A' : '#E2E8F0'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cat}
              </button>
            );
          })}

          {/* FASE 11: Chip de Ofertas para Reposición de Stock Bajo */}
          {replenishmentCampaignIds.length > 0 && (
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'Reposicion' ? 'Todas' : 'Reposicion')}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: selectedCategory === 'Reposicion' ? '#DC2626' : '#FEF2F2',
                color: selectedCategory === 'Reposicion' ? '#FFFFFF' : '#DC2626',
                border: `1px solid ${selectedCategory === 'Reposicion' ? '#DC2626' : '#FECACA'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
            >
              <Package size={13} />
              <span>Reposición Stock ({replenishmentCampaignIds.length})</span>
            </button>
          )}

          {/* Dropdown "Más ▾" para categorías secundarias */}
          {extraCategories.length > 0 && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={extraCategories.includes(selectedCategory) ? selectedCategory : ''}
                onChange={e => {
                  if (e.target.value) setSelectedCategory(e.target.value);
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: extraCategories.includes(selectedCategory) ? 600 : 500,
                  backgroundColor: extraCategories.includes(selectedCategory) ? '#0F172A' : '#F8FAFC',
                  color: extraCategories.includes(selectedCategory) ? '#FFFFFF' : '#475569',
                  border: `1px solid ${extraCategories.includes(selectedCategory) ? '#0F172A' : '#E2E8F0'}`,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="" disabled>
                  {extraCategories.includes(selectedCategory) ? `Más: ${selectedCategory}` : 'Más ▾'}
                </option>
                {extraCategories.map(cat => (
                  <option key={cat} value={cat} style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Guardadas */}
          <button
            onClick={() => setSelectedCategory(selectedCategory === 'Guardadas' ? 'Todas' : 'Guardadas')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: selectedCategory === 'Guardadas' ? 600 : 500,
              backgroundColor: selectedCategory === 'Guardadas' ? '#FEF3C7' : '#F8FAFC',
              color: selectedCategory === 'Guardadas' ? '#B45309' : '#475569',
              border: `1px solid ${selectedCategory === 'Guardadas' ? '#FCD34D' : '#E2E8F0'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginLeft: 'auto'
            }}
          >
            <Bookmark size={13} fill={selectedCategory === 'Guardadas' ? '#B45309' : 'none'} />
            <span>Guardadas ({savedOffers.length})</span>
          </button>

          {/* Selector de Proveedor */}
          <select
            value={selectedSupplier}
            onChange={e => setSelectedSupplier(e.target.value)}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              backgroundColor: '#F8FAFC',
              color: '#475569',
              border: '1px solid #E2E8F0',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="Todos">Todos los Proveedores</option>
            {suppliers.filter(s => s !== 'Todos').map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Ordenar */}
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              backgroundColor: '#F8FAFC',
              color: '#475569',
              border: '1px solid #E2E8F0',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="recent">Más Recientes</option>
            <option value="discount">Mayor Descuento %</option>
            <option value="price">Menor Precio $</option>
          </select>
        </div>
      )}

      {/* Área de Contenido Principal */}
      <div style={{
        flex: 1,
        padding: '24px 28px',
        overflowY: 'auto'
      }}>
        {/* VISTA 1: DIRECTORIO DE MAYORISTAS Y CATÁLOGOS */}
        {viewMode === 'distributors' ? (
          distributorList.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              textAlign: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '40px 20px'
            }}>
              <Building2 size={32} color="#94A3B8" style={{ marginBottom: '10px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0' }}>
                No se encontraron mayoristas
              </h3>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Prueba ajustando el término de búsqueda.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '18px'
            }}>
              {distributorList.map(dist => (
                <div
                  key={dist.id || dist.name}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.15s ease-out'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          backgroundColor: '#EFF6FF',
                          color: '#2563EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Building2 size={20} />
                        </div>
                        <div>
                          <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                            {dist.name}
                          </h3>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            Rubro: <strong style={{ color: '#2563EB' }}>{dist.category}</strong>
                          </span>
                        </div>
                      </div>

                      {dist.campaigns.length > 0 ? (
                        <span style={{
                          padding: '3px 8px',
                          backgroundColor: '#DCFCE7',
                          color: '#16A34A',
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '6px',
                          whiteSpace: 'nowrap'
                        }}>
                          {dist.campaigns.length} {dist.campaigns.length === 1 ? 'oferta' : 'ofertas'}
                        </span>
                      ) : (
                        <span style={{
                          padding: '3px 8px',
                          backgroundColor: '#F1F5F9',
                          color: '#94A3B8',
                          fontSize: '11px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap'
                        }}>
                          Directorio
                        </span>
                      )}
                    </div>

                    {dist.minPurchase && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', margin: '8px 0 4px 0' }}>
                        <Package size={13} color="#64748B" />
                        <span>Compra Mínima: <strong>${Number(dist.minPurchase).toLocaleString('es-AR')}</strong></span>
                      </div>
                    )}

                    {dist.conditions && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11.5px', color: '#64748B', marginTop: '6px', lineHeight: 1.4 }}>
                        <Truck size={13} color="#94A3B8" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span>{dist.conditions}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
                    <button
                      onClick={() => handleOpenDistributorCatalog(dist.name)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        backgroundColor: dist.campaigns.length > 0 ? '#0F172A' : '#F8FAFC',
                        color: dist.campaigns.length > 0 ? '#FFFFFF' : '#475569',
                        border: `1px solid ${dist.campaigns.length > 0 ? '#0F172A' : '#E2E8F0'}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Tag size={13} />
                      <span>{dist.campaigns.length > 0 ? `Ver Ofertas (${dist.campaigns.length})` : 'Ver Catálogo'}</span>
                    </button>

                    <button
                      onClick={() => handleContactDistributor(dist)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#10B981',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#059669'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#10B981'}
                      title="Contactar directamente por WhatsApp"
                    >
                      <MessageCircle size={14} />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* VISTA 2: GRID DE TODAS LAS OFERTAS */
          <>
            {/* Banner contextual de filtro si viene de un mayorista */}
            {selectedSupplier !== 'Todos' && (
              <div style={{
                marginBottom: '18px',
                padding: '12px 18px',
                backgroundColor: '#EFF6FF',
                borderRadius: '10px',
                border: '1px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D4ED8' }}>
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1E3A8A' }}>
                      Catálogo Exclusivo: {selectedSupplier}
                    </h4>
                    <span style={{ fontSize: '12px', color: '#2563EB' }}>
                      Mostrando {filteredCampaigns.length} ofertas activas de este mayorista
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedSupplier('Todos');
                    setViewMode('distributors');
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '6px',
                    color: '#1D4ED8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <ArrowLeft size={13} />
                  <span>Volver a Todos los Mayoristas</span>
                </button>
              </div>
            )}
        {filteredCampaigns.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60%',
            textAlign: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '40px 20px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8',
              marginBottom: '12px'
            }}>
              <Tag size={24} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0' }}>
              No hay ofertas disponibles
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '380px', margin: 0 }}>
              {selectedCategory === 'Guardadas' 
                ? 'No tienes ofertas guardadas en este momento.' 
                : 'No se encontraron promociones con los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '18px'
          }}>
            {filteredCampaigns.map(campaign => {
              const formattedPrice = campaign.price ? `$${Number(campaign.price).toLocaleString('es-AR')}` : null;
              const formattedRegular = campaign.regularPrice ? `$${Number(campaign.regularPrice).toLocaleString('es-AR')}` : null;
              const discountInfo = calculateDiscount(campaign.price, campaign.regularPrice);
              const isSaved = savedOffers.includes(campaign.id);
              const vigencia = formatVigenciaText(campaign.startDate, campaign.endDate);

              return (
                <div
                  key={campaign.id}
                  onClick={() => openCampaignDetail(campaign)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-out',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                  }}
                >
                  {/* Banner / Imagen de la Oferta */}
                  <div style={{ position: 'relative', height: '140px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                    {campaign.imageUrl ? (
                      <img 
                        src={campaign.imageUrl} 
                        alt={campaign.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#CBD5E1' }}>
                        <Tag size={32} />
                      </div>
                    )}

                    {/* Insignia / Badge de Descuento */}
                    {discountInfo.isValid && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        boxShadow: '0 2px 6px rgba(239, 68, 68, 0.25)'
                      }}>
                        <Sparkles size={11} />
                        <span>{discountInfo.badgeText}</span>
                      </div>
                    )}

                    {/* Botón Guardar */}
                    <button
                      onClick={(e) => toggleSavedOffer(e, campaign.id)}
                      title={isSaved ? "Quitar de guardadas" : "Guardar oferta"}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        color: isSaved ? '#F59E0B' : '#94A3B8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 2,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                      }}
                    >
                      <Bookmark size={14} fill={isSaved ? '#F59E0B' : 'none'} />
                    </button>
                  </div>

                  {/* Contenido de la Tarjeta */}
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                    <div>
                      {/* Categoría */}
                      <span style={{ fontSize: '10px', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        {campaign.category || 'General'}
                      </span>

                      {/* Título de la Oferta */}
                      <h3 style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#0F172A',
                        margin: '3px 0 5px 0',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {campaign.title}
                      </h3>

                      {/* Distribuidor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B', fontSize: '12px', marginBottom: '8px' }}>
                        <Building2 size={13} color="#94A3B8" />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{campaign.supplierName}</span>
                      </div>

                      {/* Compra mínima si existe */}
                      {campaign.minPurchase && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', color: '#475569', fontSize: '11px', fontWeight: 500, marginBottom: '8px' }}>
                          <Package size={11} color="#64748B" />
                          <span>Mín: {campaign.minPurchaseType === 'U.' ? '' : '$'}{Number(campaign.minPurchase).toLocaleString('es-AR')}{campaign.minPurchaseType === 'U.' ? ' U.' : ''}</span>
                        </div>
                      )}
                    </div>

                    {/* Precios, Ahorro y Acciones */}
                    <div style={{ marginTop: '8px' }}>
                      {formattedPrice && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
                              {formattedPrice}
                            </span>
                            {formattedRegular && (
                              <span style={{ fontSize: '12px', color: '#94A3B8', textDecoration: 'line-through' }}>
                                {formattedRegular}
                              </span>
                            )}
                          </div>
                          {discountInfo.isValid && (
                            <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
                              Ahorrás {discountInfo.formattedSavings}
                            </span>
                          )}
                        </div>
                      )}

                      {/* FASE 11 Paso C: Acciones de tarjeta con Carrito Multiproducto */}
                      {(() => {
                        const cartItem = b2bCart.find(it => it.campaign.id === campaign.id);
                        const inCartQty = cartItem ? cartItem.qty : 0;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCampaignDetail(campaign);
                                }}
                                style={{
                                  padding: '7px 10px',
                                  backgroundColor: '#FFFFFF',
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '6px',
                                  color: '#475569',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  transition: 'background-color 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                              >
                                Detalles
                              </button>

                              {inCartQty === 0 ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToB2BCart(campaign, 1);
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '7px 10px',
                                    backgroundColor: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    borderRadius: '6px',
                                    color: '#2563EB',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                >
                                  <ShoppingCart size={13} />
                                  <span>+ Agregar Pedido</span>
                                </button>
                              ) : (
                                <div style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  backgroundColor: '#EFF6FF',
                                  border: '1px solid #93C5FD',
                                  borderRadius: '6px',
                                  padding: '2px 6px'
                                }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateB2BCartQty(campaign.id, inCartQty - 1);
                                    }}
                                    style={{
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      color: '#1D4ED8',
                                      cursor: 'pointer',
                                      padding: '4px'
                                    }}
                                  >
                                    <Minus size={13} />
                                  </button>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A' }}>
                                    {inCartQty} u. en pedido
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateB2BCartQty(campaign.id, inCartQty + 1);
                                    }}
                                    style={{
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      color: '#1D4ED8',
                                      cursor: 'pointer',
                                      padding: '4px'
                                    }}
                                  >
                                    <Plus size={13} />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* WhatsApp Directo Rápido */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWhatsAppClick(campaign);
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                backgroundColor: '#10B981',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#FFFFFF',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#059669'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#10B981'}
                            >
                              <MessageCircle size={13} />
                              <span>Pedir solo este producto</span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
      )}
      </div>

      {/* Modal de Detalle de Oferta con soporte para Agregar al Pedido */}
      <OfertaDetailModal
        isOpen={isModalOpen}
        campaign={selectedCampaign}
        onClose={closeCampaignDetail}
        onWhatsAppClick={handleWhatsAppClick}
        onAddToCart={addToB2BCart}
        cartQty={selectedCampaign ? (b2bCart.find(it => it.campaign.id === selectedCampaign.id)?.qty || 0) : 0}
      />

      {/* FASE 11 Paso C: Modal de Carrito B2B Pedido Mayorista */}
      <B2BCartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={b2bCart}
        onUpdateQty={updateB2BCartQty}
        onRemoveItem={removeB2BCartItem}
        onClearCart={clearB2BCart}
        storeData={kiosco?.businessConfig || {}}
      />
    </div>
  );
}
