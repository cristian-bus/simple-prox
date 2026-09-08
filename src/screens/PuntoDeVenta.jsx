import React, { useState, useEffect, useRef } from 'react';
import { Search, Scan, UserPlus, CreditCard, Banknote, HelpCircle, Trash2, Plus, Minus, X, Tag, Percent, CheckCircle2, SearchCode, DollarSign, Unlock, Lock, SlidersHorizontal, QrCode, ArrowRightLeft, BookOpen, AlertTriangle, ArrowLeft, Package, Pencil, Bell, Eye, EyeOff } from 'lucide-react';
import { useWindowSize } from '../hooks/useWindowSize';
import OfertasBannerWidget from '../components/OfertasBannerWidget';
import OfertaDetailModal from '../components/OfertaDetailModal';
import { getLowStockReplenishmentOpportunities } from '../utils/stockOfferMatcher';

const MOCK_PRODUCTS = [
  { id: 1, name: "Coca Cola 1.5L", price: 3500, category: "Bebidas", stock: 24, img: "CC", code: "1001" },
  { id: 2, name: "Galletas Oreo 117g", price: 1200, category: "Almacén", stock: 15, img: "OR", code: "1002" },
  { id: 3, name: "Cerveza Quilmes 1L", price: 2800, category: "Bebidas", stock: 10, img: "CQ", code: "1003" },
  { id: 4, name: "Papas Lays 149g", price: 2500, category: "Kiosco", stock: 8, img: "PL", code: "1004" },
  { id: 5, name: "Lavandina Ayudin 1L", price: 1800, category: "Limpieza", stock: 20, img: "LA", code: "1005" },
  { id: 6, name: "Alfajor Jorgito", price: 800, category: "Kiosco", stock: 35, img: "AJ", code: "1006" },
  { id: 7, name: "Yerba Playadito 1Kg", price: 4500, category: "Almacén", stock: 5, img: "YP", code: "1007" },
  { id: 8, name: "Jabón Rexona", price: 1100, category: "Limpieza", stock: 12, img: "JR", code: "1008" }
];

// import { CATEGORY_TREE } from '../hooks/useKiosco'; // Removed static import

const INITIAL_CLIENTS = [
  { id: 1, name: "Juan Pérez", cuit: "20-12345678-9" },
  { id: 2, name: "María Gómez", cuit: "27-87654321-0" }
];

const formatCur = (num) => `$ ${num.toLocaleString('es-AR')}`;

const Modal = ({ title, onClose, children, minWidth }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" onClick={e => e.stopPropagation()} style={minWidth ? { minWidth } : {}}>
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

const PuntoDeVenta = ({ kiosco, ofertas, setGlobalAdminAuthed }) => {
  const { products, clients, caja, users, addSale, addClient, updateCaja, sales, closeCajaAndSaveShift, categoryTree, updateProduct, reservations, checkoutReservation, setCheckoutReservation } = kiosco;
  const { width } = useWindowSize();

  const warningDays = kiosco.businessConfig?.expirationWarningDays || 15;

  const expiringProducts = React.useMemo(() => {
    if (kiosco.businessConfig?.plan !== 'Pro') return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return products.filter(p => {
      if (!p.isActive || p.isCombo || !p.expirationDate || p.dismissExpirationAlert) {
        return false;
      }
      const expDate = new Date(p.expirationDate + 'T00:00:00');
      if (isNaN(expDate.getTime())) return false;
      const diffTime = expDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= warningDays;
    }).map(p => {
      const expDate = new Date(p.expirationDate + 'T00:00:00');
      const diffTime = expDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        ...p,
        daysToExpire: diffDays
      };
    }).sort((a, b) => a.daysToExpire - b.daysToExpire);
  }, [products, warningDays]);

  const lowStockProducts = React.useMemo(() => {
    if (kiosco.businessConfig?.plan !== 'Pro') return [];
    
    return products.filter(p => {
      if (!p.isActive || p.isCombo || p.isService) return false;
      
      const currentStock = p.stock || 0;
      const alertStock = p.stockAlert || 0;
      
      return currentStock <= alertStock;
    }).sort((a, b) => (a.stock || 0) - (b.stock || 0));
  }, [products, kiosco.businessConfig?.plan]);

  // FASE 11: Oportunidades de reposición cruzando stock bajo con ofertas activas de mayoristas
  const [dismissedReplenishmentIds, setDismissedReplenishmentIds] = useState([]);
  const replenishmentOpportunities = React.useMemo(() => {
    if (!ofertas || !ofertas.campaigns || ofertas.campaigns.length === 0) return [];
    const opps = getLowStockReplenishmentOpportunities(products, ofertas.campaigns);
    return opps.filter(o => !dismissedReplenishmentIds.includes(o.product.id));
  }, [products, ofertas?.campaigns, dismissedReplenishmentIds]);

  const activeReplenishment = replenishmentOpportunities.length > 0 ? replenishmentOpportunities[0] : null;

  const handleDismissWarning = (product) => {
    if (window.confirm(`¿Quieres detener el aviso de vencimiento para "${product.name}"?\nNo se volverá a mostrar la alerta.`)) {
      updateProduct(product.id, { dismissExpirationAlert: true });
    }
  };
  
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');
  const [subcategory, setSubcategory] = useState('Todas');
  
  const upcomingReservation = React.useMemo(() => {
    if (!caja.isOpen || !caja.openedBy || !reservations) return null;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    // Find reservations for the active user today that are pending
    const userRes = reservations.filter(r => 
      r.userId === caja.openedBy && 
      r.date === todayStr && 
      r.status === 'Pendiente'
    );
    
    if (userRes.length === 0) return null;
    
    // Find the closest one in the future (within next 60 minutes)
    let closest = null;
    let minDiff = Infinity;
    
    userRes.forEach(r => {
      const [rHour, rMin] = r.time.split(':').map(Number);
      const rMins = rHour * 60 + rMin;
      const diff = rMins - currentMins;
      
      // Allow up to 10 mins late, or up to 60 mins in the future
      if (diff >= -10 && diff <= 60 && diff < minDiff) {
        minDiff = diff;
        closest = { ...r, minsTo: diff };
      }
    });
    
    return closest;
  }, [reservations, caja.openedBy, caja.isOpen]);
  
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  
  const [client, setClient] = useState(null);
  
  // discount state: { type: 'none' | 'desc_perc' | 'desc_fixed' | 'rec_perc' | 'rec_fixed', value: 0 }
  const [modifier, setModifier] = useState({ type: 'none', value: 0 });
  const [modInput, setModInput] = useState('');
  const [modType, setModType] = useState('desc_perc');
  
  const [activeModal, setActiveModal] = useState(null); // 'client', 'discount', 'priceCheck', 'success', 'customItem', 'confirmPayment'
  const [alertMessage, setAlertMessage] = useState('');
  
  // modal states
  const [editingItemId, setEditingItemId] = useState(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCuit, setNewClientCuit] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientSelectedIndex, setClientSelectedIndex] = useState(0);
  
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  
  const [weightProduct, setWeightProduct] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [priceInput, setPriceInput] = useState('');

  const [priceCheckSearch, setPriceCheckSearch] = useState('');

  const [tenderedAmount, setTenderedAmount] = useState('');
  const [lastSale, setLastSale] = useState(null);
  const [shiftSummaryText, setShiftSummaryText] = useState('');

  useEffect(() => {
    if (checkoutReservation && checkoutReservation.clientName) {
      const match = clients.find(c => c.id !== 1 && c.name.toLowerCase() === checkoutReservation.clientName.toLowerCase());
      if (match) {
        setClient(match);
      }
    }
  }, [checkoutReservation, clients]);

  const [cajaAmount, setCajaAmount] = useState('');
  const [cajaMotivo, setCajaMotivo] = useState('');
  const [cajaOperationType, setCajaOperationType] = useState('open'); // 'open', 'deposit', 'withdraw'

  // Shift login states
  const [selectedUserForLogin, setSelectedUserForLogin] = useState(null);
  const [loginPin, setLoginPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [arqueoEfectivo, setArqueoEfectivo] = useState('');
  const [cajaConfirmMsg, setCajaConfirmMsg] = useState('');
  const [cajaDifference, setCajaDifference] = useState(0);

  const pinInputRef = useRef(null);

  useEffect(() => {
    if (selectedUserForLogin && pinInputRef.current) {
      setTimeout(() => {
        pinInputRef.current.focus();
      }, 100);
    }
  }, [selectedUserForLogin]);

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const getRoleColor = (role) => {
    return role === 'Admin' ? '#4285f4' : '#34a853';
  };

  const handleCajaOperation = () => {
    const amount = parseFloat(cajaAmount);
    if(isNaN(amount) || amount <= 0) return;
    
    const activeUser = caja.isOpen ? users.find(u => u.id === caja.openedBy) : null;
    let userName = activeUser ? activeUser.name : caja.openedByName;
    if (!userName || userName === 'Sistema') {
       userName = users.find(u => u.role === 'Admin')?.name || 'Admin';
    }
    
    if(cajaOperationType === 'open') {
       const now = new Date();
       const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
       const dateStr = now.toLocaleDateString('es-AR');
       updateCaja({ 
         isOpen: true, 
         efectivo: amount, 
         initialEfectivo: amount,
         openedAt: timeStr, 
         openedDate: dateStr,
         openedTimestamp: now.getTime(),
         openedBy: selectedUserForLogin?.id,
         openedByName: selectedUserForLogin?.name
       });
       setIsLocked(false);
       setSelectedUserForLogin(null);
       setLoginPin('');
       setPinError(false);
    } else if (cajaOperationType === 'deposit') {
       const movement = { id: Date.now(), type: 'deposit', amount, motivo: cajaMotivo || 'Sin motivo', date: new Date().toISOString(), user: userName };
       updateCaja({ efectivo: caja.efectivo + amount, movimientos: [...(caja.movimientos || []), movement] });
    } else if (cajaOperationType === 'withdraw') {
       const movement = { id: Date.now(), type: 'withdraw', amount, motivo: cajaMotivo || 'Sin motivo', date: new Date().toISOString(), user: userName };
       updateCaja({ efectivo: Math.max(0, caja.efectivo - amount), movimientos: [...(caja.movimientos || []), movement] });
    }
    setActiveModal(null);
    setCajaAmount('');
    setCajaMotivo('');
  };

  const handleLoginSubmit = () => {
    if (selectedUserForLogin && selectedUserForLogin.pin === loginPin) {
      setPinError(false);
      
      if (selectedUserForLogin.role === 'Admin' && typeof setGlobalAdminAuthed === 'function') {
        setGlobalAdminAuthed(true);
      }

      // Si la caja ya está abierta, solo desbloqueamos el turno
      if (caja.isOpen) {
         updateCaja({
           openedBy: selectedUserForLogin.id,
           openedByName: selectedUserForLogin.name
         });
         setIsLocked(false);
         setLoginPin('');
         setSelectedUserForLogin(null);
      } else {
         // Si está cerrada, le pedimos plata inicial
         setIsLocked(false);
         setActiveModal('cajaOperation');
         setCajaOperationType('open');
         setCajaAmount('');
      }
    } else {
      setPinError(true);
      setLoginPin('');
    }
  };

  const handleCloseCaja = () => {
      const shiftSales = sales.filter(s => new Date(s.date).getTime() >= caja.openedTimestamp);
      const totalDigital = shiftSales.filter(s => ['Tarjeta', 'Transferencia', 'QR'].includes(s.method)).reduce((sum, s) => sum + s.total, 0);
      const totalFiado = shiftSales.filter(s => s.method === 'Fiado').reduce((sum, s) => sum + s.total, 0);
      const expectedEfectivo = caja.efectivo;
      const reportedEfectivo = parseFloat(arqueoEfectivo);
      const finalReportedEfectivo = isNaN(reportedEfectivo) ? expectedEfectivo : reportedEfectivo;
      const difference = finalReportedEfectivo - expectedEfectivo;

      let confirmMsg = '';
      if (difference < 0) {
          confirmMsg = `Hay un FALTANTE de ${formatCur(Math.abs(difference))} en caja.\n¿Desea cerrar el turno de todas formas?`;
      } else if (difference > 0) {
          confirmMsg = `Hay un SOBRANTE de ${formatCur(difference)} en caja.\n¿Desea cerrar el turno de todas formas?`;
      } else {
          confirmMsg = `La caja cuadra perfectamente.\n¿Desea confirmar el cierre de turno?`;
      }

      setCajaConfirmMsg(confirmMsg);
      setCajaDifference(difference);
      setActiveModal('confirmCloseCaja');
  };

  const executeCloseCaja = () => {
      const shiftSales = sales.filter(s => new Date(s.date).getTime() >= caja.openedTimestamp);
      const totalDigital = shiftSales.filter(s => ['Tarjeta', 'Transferencia', 'QR'].includes(s.method)).reduce((sum, s) => sum + s.total, 0);
      const totalFiado = shiftSales.filter(s => s.method === 'Fiado').reduce((sum, s) => sum + s.total, 0);
      const expectedEfectivo = caja.efectivo;
      const reportedEfectivo = parseFloat(arqueoEfectivo);
      const finalReportedEfectivo = isNaN(reportedEfectivo) ? expectedEfectivo : reportedEfectivo;

      const shiftData = {
         openedAt: caja.openedAt,
         openedDate: caja.openedDate,
         openedTimestamp: caja.openedTimestamp,
         openedBy: caja.openedBy,
         openedByName: caja.openedByName,
         initialEfectivo: caja.initialEfectivo || 0,
         expectedEfectivo: expectedEfectivo,
         reportedEfectivo: finalReportedEfectivo,
         difference: cajaDifference,
         totalDigital,
         totalFiado,
         totalSalesRevenue: shiftSales.reduce((sum, s) => sum + s.total, 0),
         salesCount: shiftSales.length,
         movimientos: caja.movimientos || []
      };

      // Calculate shift summary
      const totalFacturado = shiftSales.reduce((sum, s) => sum + s.total, 0);
      const uniqueClientsInShift = new Set();
      let nuevos = 0;
      let recurrentes = 0;
      
      shiftSales.forEach(s => {
        if (s.clientId) {
          if (!uniqueClientsInShift.has(s.clientId)) {
            uniqueClientsInShift.add(s.clientId);
            const hadSalesBefore = sales.some(old => old.clientId === s.clientId && new Date(old.date).getTime() < caja.openedTimestamp);
            if (hadSalesBefore) recurrentes++;
            else nuevos++;
          }
        }
      });
      const anonymousSales = shiftSales.filter(s => !s.clientId).length;
      const totalClientes = uniqueClientsInShift.size + anonymousSales;
      
      const todayIso = new Date().toISOString().split('T')[0];
      const turnosHoy = (reservations || []).filter(r => r.date === todayIso);
      const turnosTotales = turnosHoy.length;
      const turnosAusencias = turnosHoy.filter(r => r.status === 'Cancelado').length;
      
      const isBarberia = kiosco.businessConfig?.businessType === 'barberia';
      const summaryText = `resumen del dia\n💰 ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalFacturado)} facturados\n${isBarberia ? '✂️' : '👥'} ${totalClientes} clientes` + 
      (isBarberia ? `\n📅 ${turnosTotales} turnos\n❌ ${turnosAusencias} ausencias` : '') + 
      `\n🌟 ${nuevos} clientes nuevos\n🔄 ${recurrentes + anonymousSales} clientes recurrentes`;
      
      setShiftSummaryText(summaryText);

      closeCajaAndSaveShift(shiftData);
      setArqueoEfectivo('');
      setCajaConfirmMsg('');
      setActiveModal('shiftSummary');
  };

  // Doble enter logic
  const lastEnterRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (activeModal) setActiveModal(null);
        document.getElementById('pos-search-input')?.focus();
        return;
      }
      if (e.key === 'F8') {
        if (kiosco.businessConfig?.plan === 'Pro') {
          e.preventDefault();
          if (activeModal === 'alertsModal') {
            setActiveModal(null);
          } else {
            setActiveModal('alertsModal');
          }
        }
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (activeModal === 'client') {
          setActiveModal(null);
        } else {
          setActiveModal('client');
          setClientSearch('');
        }
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        if (activeModal === 'customItem') {
          setActiveModal(null);
        } else {
          setActiveModal('customItem');
          setCustomItemName('');
          setCustomItemPrice('');
        }
        return;
      }
      if (e.key === 'F6') {
        if (kiosco.businessConfig?.plan === 'Pro') {
          e.preventDefault();
          if (activeModal === 'discount') {
            setActiveModal(null);
          } else {
            setActiveModal('discount');
          }
        }
        return;
      }
      if (e.key === 'F7') {
        e.preventDefault();
        if (activeModal === 'priceCheck') {
          setActiveModal(null);
        } else {
          setActiveModal('priceCheck');
          setPriceCheckSearch('');
        }
        return;
      }
      if (e.key === 'Escape') {
        if (activeModal) {
          e.preventDefault();
          setActiveModal(null);
          return;
        }
      }

      if (e.key === 'F9') {
        e.preventDefault();
        if (activeModal === 'cartPreview') {
          setActiveModal(null);
        } else if (!activeModal && cart.length > 0) {
          setActiveModal('cartPreview');
        }
        return;
      }

      if (e.key === 'F12') {
        e.preventDefault();
        setShowPaymentOptions(prev => !prev);
        return;
      }

      if (e.key === 'ArrowRight' && showPaymentOptions && !activeModal) {
         e.preventDefault();
         setPaymentMethod(prev => {
            const methods = ['Efectivo', 'Tarjeta', 'Transferencia', 'QR'];
            if (kiosco.businessConfig?.plan === 'Pro') methods.push('Fiado');
            const idx = methods.indexOf(prev);
            return methods[(idx + 1) % methods.length];
         });
         return;
      }

      if (e.key === 'ArrowLeft' && showPaymentOptions && !activeModal) {
         e.preventDefault();
         setPaymentMethod(prev => {
            const methods = ['Efectivo', 'Tarjeta', 'Transferencia', 'QR'];
            if (kiosco.businessConfig?.plan === 'Pro') methods.push('Fiado');
            const idx = methods.indexOf(prev);
            return methods[(idx - 1 + methods.length) % methods.length];
         });
         return;
      }

      if (e.key === 'Enter') {
        if (activeModal === 'success') {
          e.preventDefault();
          setActiveModal(null);
          setLastSale(null);
          return;
        }
        if (activeModal === 'confirmPayment') {
          e.preventDefault();
          completeSale(paymentMethod);
          return;
        }
        if (activeModal) return; 
        
        if (showPaymentOptions) {
          if (cart.length > 0) {
            processSale();
            lastEnterRef.current = 0;
          }
          return;
        }

        const now = Date.now();
        if (now - lastEnterRef.current < 400) {
          if (cart.length > 0) {
            processSale();
            lastEnterRef.current = 0;
          }
        } else {
          lastEnterRef.current = now;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, activeModal, kiosco.businessConfig?.plan, showPaymentOptions, paymentMethod]);

  const getDisplayStock = (item) => {
    if (item.isService) {
      if (!item.components || item.components.length === 0) return 'Servicio';
      let minServiceStock = Infinity;
      let hasValidComponent = false;
      item.components.forEach(comp => {
        if (!comp.productId) return;
        const compProduct = products.find(p => p.id === comp.productId || p.id === Number(comp.productId));
        if (compProduct) {
          hasValidComponent = true;
          const possibleStock = Math.floor(compProduct.stock / (comp.qty || 1));
          if (possibleStock < minServiceStock) {
            minServiceStock = possibleStock;
          }
        }
      });
      return hasValidComponent ? `${minServiceStock === Infinity ? 0 : minServiceStock} u` : 'Servicio';
    }
    
    return item.unitType === 'Peso (Kg)' ? `${Number(item.stock).toFixed(3)} Kg` : (item.unitType === 'Gramos (g)' ? `${item.stock} g` : (['Caja', 'Pack', 'Bolsa', 'Litro (L)'].includes(item.unitType) ? `${item.stock} ${item.unitType.split(' ')[0]}` : `${item.stock} u`));
  };

  const checkStockAvailability = (product, requestedQty) => {
    if (!product || product.isCustom) return { available: true };
    
    if (product.isService) {
      if (!product.components || product.components.length === 0) {
        return { available: true };
      }
      
      for (const comp of product.components) {
        if (!comp.productId) continue;
        const compProduct = products.find(p => p.id === comp.productId || p.id === Number(comp.productId));
        if (!compProduct) continue;
        
        let usedInOtherItems = 0;
        cart.forEach(item => {
          if (item.id === product.id && !item.isCustom) return;
          
          if (item.id === compProduct.id && !item.isCustom) {
            usedInOtherItems += item.qty;
          }
          if ((item.isCombo || item.isService) && item.components) {
            item.components.forEach(c => {
              if (c.productId === comp.productId || c.productId === Number(comp.productId)) {
                usedInOtherItems += c.qty * item.qty;
              }
            });
          }
        });
        
        const neededQty = comp.qty * requestedQty;
        if (usedInOtherItems + neededQty > compProduct.stock) {
          return {
            available: false,
            message: `No hay stock suficiente de ${compProduct.name} (insumo de ${product.name}). Stock actual: ${compProduct.stock}`
          };
        }
      }
      return { available: true };
    }
    
    if (requestedQty > product.stock) {
      return {
        available: false,
        message: `No hay stock suficiente de ${product.name}. Stock actual: ${product.stock}`
      };
    }
    
    return { available: true };
  };

  const addToCart = (product) => {
    if (product.unitType === 'Peso (Kg)' || product.unitType === 'Gramos (g)' || product.unitType === 'Litro (L)') {
      setWeightProduct(product);
      setWeightInput('');
      setPriceInput('');
      setActiveModal('weightSelector');
      return;
    }
    
    const existing = cart.find(p => p.id === product.id && !p.isCustom);
    const currentQty = existing ? existing.qty : 0;
    const stockCheck = checkStockAvailability(product, currentQty + 1);
    if (!stockCheck.available) {
      setAlertMessage(stockCheck.message);
      setActiveModal('alert');
      return;
    }

    setCart(prev => {
      const pExisting = prev.find(p => p.id === product.id && !p.isCustom);
      if (pExisting) {
        return prev.map(p => p.id === product.id && !p.isCustom ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...product, qty: 1, isCustom: false }];
    });
  };

  const handleWeightSubmit = () => {
    const weight = parseFloat(weightInput);
    if (!isNaN(weight) && weight > 0 && weightProduct) {
      
      const currentQty = editingItemId 
        ? 0 
        : (cart.find(p => p.id === weightProduct.id && !p.isCustom)?.qty || 0);
      
      const newTotalQty = editingItemId ? weight : currentQty + weight;
      
      const stockCheck = checkStockAvailability(weightProduct, newTotalQty);
      if (!stockCheck.available) {
          setAlertMessage(stockCheck.message);
          setActiveModal('alert');
          return;
      }

      setCart(prev => {
        if (editingItemId) {
          return prev.map(p => p.id === editingItemId ? { ...p, qty: weight } : p);
        }
        const existing = prev.find(p => p.id === weightProduct.id && !p.isCustom);
        if (existing) {
          return prev.map(p => p.id === weightProduct.id && !p.isCustom ? { ...p, qty: p.qty + weight } : p);
        }
        return [...prev, { ...weightProduct, qty: weight, isCustom: false }];
      });
      setActiveModal(null);
      setWeightProduct(null);
      setWeightInput('');
      setPriceInput('');
      setEditingItemId(null);
    }
  };

  const editCartItem = (item) => {
    setEditingItemId(item.id);
    if (item.unitType === 'Peso (Kg)' || item.unitType === 'Gramos (g)' || item.unitType === 'Litro (L)') {
      setWeightProduct(item);
      setWeightInput(item.qty.toString());
      setPriceInput((item.price * item.qty).toFixed(2));
      setActiveModal('weightSelector');
    } else if (item.isCustom) {
      setCustomItemName(item.name);
      setCustomItemPrice(item.price.toString());
      setActiveModal('customItem');
    }
  };

  const addCustomItem = () => {
    const amount = parseFloat(customItemPrice);
    if (!isNaN(amount) && amount > 0) {
      if (editingItemId) {
        setCart(prev => prev.map(p => p.id === editingItemId ? { ...p, name: customItemName || 'Ítem Extra', price: amount } : p));
      } else {
        setCart(prev => [{ 
          id: `custom_${Date.now()}`, 
          name: customItemName || 'Ítem Extra', 
          price: amount, 
          qty: 1, 
          isCustom: true 
        }, ...prev]);
      }
      setActiveModal(null);
      setCustomItemName('');
      setCustomItemPrice('');
      setEditingItemId(null);
    }
  };

  const updateQty = (id, delta) => {
    const item = cart.find(p => p.id === id);
    if (item && delta > 0) {
       const addition = item.unitType === 'Peso (Kg)' ? 0.1 : (item.unitType === 'Gramos (g)' ? 10 : (item.unitType === 'Litro (L)' ? 0.1 : 1));
       const stockCheck = checkStockAvailability(item, item.qty + addition);
       if (!stockCheck.available) {
           setAlertMessage(stockCheck.message);
           setActiveModal('alert');
           return;
       }
    }

    setCart(prev => prev.map(p => {
      if (p.id === id) {
        if (p.unitType === 'Peso (Kg)' || p.unitType === 'Litro (L)') {
          const newQty = Math.max(0.001, p.qty + (delta > 0 ? 0.1 : -0.1));
          return { ...p, qty: newQty };
        }
        if (p.unitType === 'Gramos (g)') {
          const newQty = Math.max(1, p.qty + (delta > 0 ? 10 : -10));
          return { ...p, qty: newQty };
        }
        const newQty = Math.max(1, p.qty + delta);
        return { ...p, qty: newQty };
      }
      return p;
    }));
  };

  const removeItem = (id) => {
    setCart(prev => prev.filter(p => p.id !== id));
  };

  const processSale = (overrideMethod) => {
    if(cart.length === 0 || !caja.isOpen) return;
    const method = typeof overrideMethod === 'string' ? overrideMethod : paymentMethod;
    
    if (method === 'Fiado' && kiosco.businessConfig?.plan !== 'Pro') {
        setAlertMessage("La Venta al Fiado (Cuenta Corriente) es una función exclusiva del Plan Pro. Ve a Configuración para actualizar tu plan.");
        setActiveModal('alert');
        return;
    }

    if (method === 'Fiado' && (!client || client.id === 1)) {
        setAlertMessage("¡Para FIAR debes seleccionar un Cliente registrado!");
        setActiveModal('alert');
        return;
    }

    if (method === 'Efectivo') {
      setActiveModal('checkoutEfectivo');
      setTenderedAmount('');
    } else {
      setActiveModal('confirmPayment');
    }
  };

  const completeSale = (method) => {
    const finalMethod = typeof method === 'string' ? method : paymentMethod;
    const saleInfo = {
      total: total,
      subtotal: subtotal,
      modifier: modifier,
      items: cart.map(item => ({ ...item, lineTotal: getCartItemTotal(item) })),
      method: finalMethod,
      client: client ? client.name : 'Consumidor Final',
      clientId: client ? client.id : null,
      sellerId: caja.openedBy || null,
      sellerName: caja.openedByName || 'Admin Default',
      linkedReservationId: checkoutReservation ? checkoutReservation.id : null
    };

    setLastSale({
      total: total,
      tendered: finalMethod === 'Efectivo' ? (parseFloat(tenderedAmount) || total) : total,
      change: finalMethod === 'Efectivo' ? Math.max(0, (parseFloat(tenderedAmount) || total) - total) : 0,
      method: finalMethod
    });

    addSale(saleInfo);

    setActiveModal('success');
    setCart([]);
    setClient(null);
    setModifier({ type: 'none', value: 0 });
    setCategory('Todos');
    setSearch('');
    setTenderedAmount('');
    if (checkoutReservation) {
      setCheckoutReservation(null);
    }
  };

  const registerClient = () => {
    if (!newClientName) return;
    const nc = addClient({ name: newClientName, cuit: newClientCuit || 'Consumidor Final', phone: newClientPhone });
    setClient(nc);
    setActiveModal(null);
    setNewClientName('');
    setNewClientCuit('');
    setNewClientPhone('');
  };

  const applyModifier = () => {
    const val = parseFloat(modInput);
    if (!isNaN(val) && val > 0) {
      setModifier({ type: modType, value: val });
    } else {
      setModifier({ type: 'none', value: 0 });
    }
    setActiveModal(null);
  };

  const getCartItemTotal = (item) => {
    if (item.isService) {
      let insumosCost = 0;
      if (item.components && item.components.length > 0) {
         item.components.forEach(comp => {
            const compProduct = products.find(p => p.id === comp.productId || p.id === Number(comp.productId));
            if (compProduct) {
               insumosCost += (compProduct.price * (comp.qty || 1));
            }
         });
      }
      return item.price + (insumosCost * item.qty);
    }
    return item.price * item.qty;
  };

  const subtotal = Math.round(cart.reduce((acc, item) => acc + getCartItemTotal(item), 0) * 100) / 100;
  
  let modAmount = 0;
  if (modifier.type === 'desc_perc') modAmount = -(subtotal * (modifier.value / 100));
  if (modifier.type === 'desc_fixed') modAmount = -modifier.value;
  if (modifier.type === 'rec_perc') modAmount = (subtotal * (modifier.value / 100));
  if (modifier.type === 'rec_fixed') modAmount = modifier.value;

  const total = Math.max(0, Math.round((subtotal + modAmount) * 100) / 100);

  const productSalesCount = React.useMemo(() => {
    const counts = {};
    sales.forEach(sale => {
      sale.items?.forEach(item => {
        counts[item.id] = (counts[item.id] || 0) + item.qty;
      });
    });
    return counts;
  }, [sales]);

  let filteredProducts = products.filter(p => {
    const matchCat = category === 'Todos' || p.category === category;
    const matchSub = subcategory === 'Todas' || p.subcategory === subcategory;
    const matchSearch = !search || p.name.toLowerCase().startsWith(search.toLowerCase()) || (p.code && p.code.startsWith(search));
    return matchCat && matchSub && matchSearch && p.isActive;
  });

  filteredProducts = filteredProducts.sort((a, b) => {
    const countA = productSalesCount[a.id] || 0;
    const countB = productSalesCount[b.id] || 0;
    return countB - countA;
  }).slice(0, 15);

  const searchedPriceItems = products.filter(p => 
    priceCheckSearch && (p.name.toLowerCase().startsWith(priceCheckSearch.toLowerCase()) || (p.code && p.code.startsWith(priceCheckSearch)))
  );

  const consumidorFinalObj = { id: 'cf', name: 'Consumidor Final', cuit: '00-00000000-0', isConsumidorFinal: true };
  const sortedClients = [...clients]
    .filter(c => c.id !== 1 && (c.name || '').toLowerCase().trim() !== 'consumidor final')
    .sort((a, b) => 
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    );

  let filteredClients = [];
  if (!clientSearch) {
    filteredClients = [consumidorFinalObj, ...sortedClients];
  } else {
    const searchLower = clientSearch.toLowerCase();
    const matchesCF = 'consumidor final'.includes(searchLower);
    const matchingClients = sortedClients.filter(c => 
      c.name.toLowerCase().includes(searchLower) || (c.cuit && c.cuit.includes(clientSearch))
    );
    filteredClients = matchesCF ? [consumidorFinalObj, ...matchingClients] : matchingClients;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 94px)', overflow: 'hidden', gap: '16px' }}>
      {/* ALERTA PROXIMO TURNO */}
      {upcomingReservation && (
        <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ffeeba' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bell size={20} color="#856404" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>
                Próximo turno {upcomingReservation.minsTo <= 0 ? 'AHORA' : `en ${upcomingReservation.minsTo} min`}
              </div>
              <div style={{ fontSize: '13px' }}>
                {upcomingReservation.clientName} - {upcomingReservation.serviceName} ({upcomingReservation.time})
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL POS HEADER */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative', minHeight: '60px' }}>
        {/* MI CAJA */}
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)', minWidth: '220px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {caja.isOpen ? <Unlock size={18} color="var(--color-success)" /> : <Lock size={18} color="var(--color-danger)" />}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Mi Caja ({caja.isOpen ? 'Abierta' : 'Cerrada'})</span>
                {caja.isOpen && caja.openedByName && (
                  <span style={{ fontSize: '11px', backgroundColor: 'rgba(66, 133, 244, 0.1)', color: 'var(--color-primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    {caja.openedByName}
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 700, fontSize: '15px', color: caja.isOpen ? 'var(--color-text)' : 'var(--color-danger)' }}>{caja.isOpen ? formatCur(caja.efectivo) : '--'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
             {caja.isOpen ? (
               <>
                 <button className="btn-icon" onClick={() => setIsLocked(true)} title="Bloquear pantalla" style={{ backgroundColor: 'rgba(234, 67, 53, 0.1)', color: '#ea4335', padding: '6px', borderRadius: '8px' }}>
                   <Lock size={14} />
                 </button>
                 <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setActiveModal('manageCaja')} title="Gestionar Caja">
                   <SlidersHorizontal size={14} />
                 </button>
               </>
             ) : (
               <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setIsLocked(true)} title="Abrir Caja">
                 Abrir Caja
               </button>
             )}
          </div>
        </div>

        {/* STORE NAME & ALERTS */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'var(--color-surface)',
            padding: '8px 24px',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            position: 'relative'
          }}>
            <div style={{
               width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff'
            }}>
               <Package size={18} />
            </div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '22px', 
              fontWeight: 800, 
              fontFamily: "'Inter', sans-serif", 
              color: 'var(--color-text)', 
              letterSpacing: '-0.5px' 
            }}>
              {kiosco.businessConfig?.storeName || 'Mi Negocio'}
            </h1>
          </div>
        </div>

        {/* CLIENTE & EXTRA */}
        <div style={{ display: 'flex', gap: '8px', flex: 1, justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
          {(expiringProducts.length > 0 || lowStockProducts.length > 0 || (client && client.deuda > 0)) && (
            <button 
              className={`btn-icon ${(expiringProducts.length > 0 || lowStockProducts.length > 0) ? 'blink-alert' : ''}`} 
              onClick={() => setActiveModal('alertsModal')}
              style={{ padding: '8px', position: 'relative', color: 'var(--color-warning)', backgroundColor: 'rgba(245, 159, 0, 0.1)', borderRadius: '50%' }}
              title="Notificaciones"
            >
              <Bell size={20} />
              {(expiringProducts.length > 0 || lowStockProducts.length > 0 || (client && client.deuda > 0)) && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', backgroundColor: 'var(--color-danger)', borderRadius: '50%' }}></span>
              )}
            </button>
          )}
          <div className={`cart-client ${client && client.deuda > 0 ? 'blink-alert' : ''}`} style={{ padding: '8px 12px', margin: 0, minWidth: '180px', flexShrink: 0 }} onClick={() => { setActiveModal('client'); setClientSearch(''); }}>
            <div className="client-info">
              <span className="client-label">Cliente</span>
              <span className="client-desc" style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>{client ? client.name : 'Consumidor Final'}</span>
            </div>
            <button className="btn-icon text-primary" style={{ marginLeft: '12px', flexShrink: 0 }}><UserPlus size={18} /></button>
          </div>
          <button className="btn btn-outline" style={{ padding: '8px 16px', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', height: '100%' }} onClick={() => { setActiveModal('customItem'); setCustomItemName(''); setCustomItemPrice(''); }} title="Agregar Ítem Extra">
            <Plus size={18} /> Extra
          </button>
        </div>
      </div>

      {ofertas && <OfertasBannerWidget ofertas={ofertas} />}

      {/* FASE 11: Banner de sugerencia de reposición inteligente */}
      {activeReplenishment && (
        <div style={{
          margin: '0 0 10px 0',
          padding: '8px 14px',
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{
              backgroundColor: '#DBEAFE',
              color: '#1D4ED8',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap'
            }}>
              💡 Sugerencia de Reposición
            </span>
            <span style={{ fontSize: '13px', color: '#1E3A8A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Quedan <strong>{activeReplenishment.product.stock || 0}u</strong> de <strong>{activeReplenishment.product.name}</strong> · Oferta: <strong>{activeReplenishment.campaign.title}</strong> (${activeReplenishment.campaign.price?.toLocaleString('es-AR')}) con <strong>{activeReplenishment.campaign.supplierName}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => ofertas.openCampaignDetail && ofertas.openCampaignDetail(activeReplenishment.campaign)}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#1D4ED8',
                borderColor: '#93C5FD',
                backgroundColor: '#FFFFFF',
                borderRadius: '6px'
              }}
            >
              Ver Oferta
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => ofertas.handleWhatsAppClick && ofertas.handleWhatsAppClick(activeReplenishment.campaign)}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: '#16A34A',
                borderColor: '#16A34A',
                color: '#FFFFFF',
                borderRadius: '6px'
              }}
            >
              Pedir WhatsApp
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setDismissedReplenishmentIds(prev => [...prev, activeReplenishment.product.id])}
              title="Descartar sugerencia"
              style={{ padding: '4px', color: '#64748B' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {ofertas && (
        <OfertaDetailModal
          campaign={ofertas.selectedCampaign}
          isOpen={ofertas.isModalOpen}
          onClose={ofertas.closeCampaignDetail}
          onWhatsAppClick={ofertas.handleWhatsAppClick}
        />
      )}

      <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden' }}>
           {/* MAIN CART AREA (70%) */}
           <div style={{ flex: '7', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              {/* Search Bar at the top */}
              <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', position: 'relative' }}>
                  <div className="search-bar" style={{ margin: 0 }}>
                      <input 
                         id="pos-search-input"
                         type="text" 
                         placeholder="Escanea el código o busca por nombre..." 
                         className="pos-input" 
                         value={search}
                         style={{ paddingLeft: '12px' }}
                         onChange={(e) => {
                           const val = e.target.value;
                           setSearch(val);
                           // Agregar al carrito inmediatamente si hay coincidencia exacta del código
                           if (val.trim() !== '') {
                             const exactMatch = products.find(p => (p.code === val.trim() || p.sku === val.trim()) && p.isActive);
                             if (exactMatch) {
                               addToCart(exactMatch);
                               setSearch('');
                             }
                           }
                         }}
                         onKeyDown={(e) => {
                           if(e.key === 'Enter') {
                             const val = e.target.value.trim();
                             if(val) {
                               const match = products.find(p => (p.code === val || p.sku === val || p.name.toLowerCase() === val.toLowerCase()) && p.isActive);
                               if(match) {
                                 addToCart(match);
                                 setSearch('');
                               }
                               e.stopPropagation();
                             }
                           }
                         }}
                      />
                      {search && (
                        <button className="btn-icon" style={{ padding: '4px', marginRight: '8px' }} onClick={() => setSearch('')}>
                          <X size={18} />
                        </button>
                      )}
                      <button className="btn-icon" style={{ padding: '4px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }} onClick={() => { setActiveModal('priceCheck'); setPriceCheckSearch(''); }}>
                        <SearchCode size={18} style={{ marginRight: '4px' }}/> Precio
                      </button>
                  </div>
                  {search && filteredProducts.length > 0 && !products.find(p => (p.code === search || p.sku === search) && p.isActive) && (
                     <div style={{ position: 'absolute', top: '100%', left: '16px', right: '16px', zIndex: 10, backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', maxHeight: '300px', overflowY: 'auto', marginTop: '4px' }}>
                        {filteredProducts.map(item => (
                           <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => { addToCart(item); setSearch(''); document.getElementById('pos-search-input')?.focus(); }}>
                              <div>
                                 <div style={{ fontWeight: 600 }}>{item.code || item.sku} - {item.name}</div>
                                 <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Stock: {getDisplayStock(item)} en {item.category}</div>
                              </div>
                              <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '16px' }}>{formatCur(item.price)}</div>
                           </div>
                        ))}
                     </div>
                  )}
              </div>

              {/* Cart Items List */}
              <div className="cart-items" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {cart.length === 0 && (
                   <div className="empty-state" style={{ padding: '40px 0', textAlign: 'center' }}>
                     <p className="empty-message">El carrito está vacío</p>
                     <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Utiliza el buscador de arriba o escanea un código para agregar productos.</p>
                   </div>
                )}
                {cart.map((item) => (
                  <div key={item.id} className="cart-item" style={{ padding: '12px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="item-details" style={{ flex: 1 }}>
                      <div className="item-name" style={{ fontWeight: 600, fontSize: '15px' }} title={item.name}>{item.name}</div>
                      <div className="item-price" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                        {formatCur(getCartItemTotal(item))} 
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                          ({formatCur(item.price)} {item.unitType === 'Peso (Kg)' ? 'c/Kg' : (item.unitType === 'Gramos (g)' ? 'c/g' : (['Caja', 'Pack', 'Bolsa', 'Litro (L)'].includes(item.unitType) ? `c/${item.unitType.split(' ')[0]}` : 'c/u'))})
                        </span>
                      </div>
                    </div>
                    <div className="item-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div className="qty-controls" style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f3f5', borderRadius: '20px', padding: '4px' }}>
                        <button className="qty-btn" onClick={() => updateQty(item.id, -1)} style={{ width: '30px', height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'white', borderRadius: '50%', border: 'none', boxShadow: 'var(--shadow-sm)' }}><Minus size={16} /></button>
                        <span className="qty" style={{ width: 'auto', minWidth: '40px', padding: '0 4px', textAlign: 'center', fontWeight: 600, fontSize: '16px' }}>{item.unitType === 'Peso (Kg)' ? `${Number(item.qty).toFixed(3)} Kg` : (item.unitType === 'Gramos (g)' ? `${item.qty} g` : (['Caja', 'Pack', 'Bolsa', 'Litro (L)'].includes(item.unitType) ? `${item.qty} ${item.unitType.split(' ')[0]}` : item.qty))}</span>
                        <button className="qty-btn" onClick={() => updateQty(item.id, 1)} style={{ width: '30px', height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'white', borderRadius: '50%', border: 'none', boxShadow: 'var(--shadow-sm)' }}><Plus size={16} /></button>
                      </div>
                      {(item.unitType === 'Peso (Kg)' || item.unitType === 'Gramos (g)' || item.unitType === 'Litro (L)' || item.isCustom) && (
                        <button className="btn-icon text-primary" onClick={() => editCartItem(item)} style={{ padding: '8px', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)' }} title="Editar ítem">
                          <Pencil size={18} />
                        </button>
                      )}
                      <button className="btn-icon text-danger" onClick={() => removeItem(item.id)} style={{ padding: '8px' }}><Trash2 size={20} /></button>
                    </div>
                  </div>
                ))}
              </div>
           </div>

           {/* SIDEBAR TOTALS & PAYMENT (30%) */}
           <div style={{ flex: '3', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="cart-summary" style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflowY: 'auto' }}>
                {kiosco.businessConfig?.plan === 'Pro' && (
                  <button className="btn-descuento" style={{ marginBottom: '8px', padding: '8px', fontSize: '13px' }} onClick={() => setActiveModal('discount')}>
                    {modifier.type !== 'none' ? 'Editar Modificador' : '% Aplicar Descuento o Recargo'}
                  </button>
                )}
                
                <div className="summary-row" style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <span>Subtotal</span>
                  <span>{formatCur(subtotal)}</span>
                </div>

                {modifier.type !== 'none' && (
                   <div className="summary-row" style={{ color: modAmount < 0 ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '14px', marginBottom: '4px' }}>
                      <span>{modAmount < 0 ? 'Descuento' : 'Recargo'}</span>
                      <span>{modAmount < 0 ? '-' : '+'}{formatCur(Math.abs(modAmount))}</span>
                   </div>
                )}

                <div className="summary-row total" style={{ fontSize: '20px', fontWeight: 800, borderTop: '2px dashed var(--color-border)', paddingTop: '8px', marginTop: 'auto', marginBottom: '12px' }}>
                  <span>Total</span>
                  <span>{formatCur(total)}</span>
                </div>

                <div style={{ position: 'relative', padding: showPaymentOptions ? '12px' : '0', margin: showPaymentOptions ? '-12px -12px 12px -12px' : '0 0 12px 0', border: showPaymentOptions ? '2px solid var(--color-primary)' : 'none', borderRadius: showPaymentOptions ? 'var(--radius-lg)' : '0', backgroundColor: showPaymentOptions ? 'rgba(66, 133, 244, 0.05)' : 'transparent', transition: 'all 0.2s' }}>
                   {showPaymentOptions && (
                     <div style={{ position: 'absolute', top: '-10px', left: '12px', backgroundColor: 'white', padding: '0 8px', fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', borderRadius: '4px', border: '1px solid var(--color-primary)' }}>MODO COBRO ACTIVO</div>
                   )}
                   <div className="payment-methods" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', width: '100%' }}>
                     <button 
                       className={`payment-btn ${paymentMethod === 'Efectivo' ? 'active' : ''}`} 
                       style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                       onClick={() => setPaymentMethod('Efectivo')}
                       onDoubleClick={() => { setPaymentMethod('Efectivo'); processSale('Efectivo'); }}
                     >
                       <Banknote size={16} />
                       <span style={{ fontSize: '11px', fontWeight: 600 }}>Efectivo</span>
                     </button>
                     <button 
                       className={`payment-btn ${paymentMethod === 'Tarjeta' ? 'active' : ''}`} 
                       style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                       onClick={() => setPaymentMethod('Tarjeta')}
                       onDoubleClick={() => { setPaymentMethod('Tarjeta'); processSale('Tarjeta'); }}
                     >
                       <CreditCard size={16} />
                       <span style={{ fontSize: '11px', fontWeight: 600 }}>Tarjeta</span>
                     </button>
                     <button 
                       className={`payment-btn ${paymentMethod === 'Transferencia' ? 'active' : ''}`} 
                       style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                       onClick={() => setPaymentMethod('Transferencia')}
                       onDoubleClick={() => { setPaymentMethod('Transferencia'); processSale('Transferencia'); }}
                     >
                       <ArrowRightLeft size={16} />
                       <span style={{ fontSize: '11px', fontWeight: 600 }}>Transf.</span>
                     </button>
                     <button 
                       className={`payment-btn ${paymentMethod === 'QR' ? 'active' : ''}`} 
                       style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                       onClick={() => setPaymentMethod('QR')}
                       onDoubleClick={() => { setPaymentMethod('QR'); processSale('QR'); }}
                     >
                       <QrCode size={16} />
                       <span style={{ fontSize: '11px', fontWeight: 600 }}>QR</span>
                     </button>
                     <button 
                       className={`payment-btn ${paymentMethod === 'Fiado' ? 'active' : ''}`} 
                       style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '4px', ...(paymentMethod === 'Fiado' ? { backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}) }}
                       onClick={() => setPaymentMethod('Fiado')}
                       onDoubleClick={() => { setPaymentMethod('Fiado'); processSale('Fiado'); }}
                     >
                       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                         <BookOpen size={16} />
                         <span style={{ fontSize: '11px' }}>Fiado</span>
                         {kiosco.businessConfig?.plan !== 'Pro' && (
                           <span style={{ fontSize: '8px', color: '#ff4d4f', background: '#fff1f0', padding: '1px 4px', borderRadius: '4px' }}>PRO</span>
                         )}
                       </div>
                     </button>
                   </div>
                </div>

                <button className="btn-cobrar" style={{ padding: '12px', fontSize: '16px' }} onClick={() => {
                  if (!caja.isOpen) {
                    setActiveModal('cajaClosed');
                    return;
                  }
                  processSale(paymentMethod);
                }} disabled={cart.length === 0} title={!caja.isOpen ? "Abre la caja primero" : "Puedes hacer doble clic en el método de pago para cobrar rápido"}>
                  Cobrar {formatCur(total)}
                  <div style={{ fontSize: '11px', fontWeight: 500, opacity: 0.8, marginTop: '2px' }}>Cobro en {paymentMethod}</div>
                </button>
              </div>
           </div>
        </div>
      

      {/* MODALS */}

      {/* Select / Register Client Modal */}
      {activeModal === 'client' && (
        <Modal title="Seleccionar o Registrar Cliente" onClose={() => setActiveModal(null)}>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              className="input" 
              placeholder="Buscar cliente por nombre o CUIT..." 
              value={clientSearch} 
              onChange={e => { setClientSearch(e.target.value); setClientSelectedIndex(0); }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setClientSelectedIndex(prev => {
                    const next = Math.min(prev + 1, filteredClients.length - 1);
                    document.getElementById(`client-item-${next}`)?.scrollIntoView({ block: 'nearest' });
                    return next;
                  });
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setClientSelectedIndex(prev => {
                    const next = Math.max(prev - 1, 0);
                    document.getElementById(`client-item-${next}`)?.scrollIntoView({ block: 'nearest' });
                    return next;
                  });
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredClients.length > 0 && filteredClients[clientSelectedIndex]) {
                    const sel = filteredClients[clientSelectedIndex];
                    setClient(sel.isConsumidorFinal ? null : sel);
                    setActiveModal(null);
                  }
                }
              }}
              autoFocus
            />
            {clientSearch && <button className="search-clear" onClick={() => setClientSearch('')}><X size={16} /></button>}
          </div>
          <div className="client-list" style={{ maxHeight: '180px' }}>
            {filteredClients.map((c, idx) => (
              <div 
                 id={`client-item-${idx}`}
                 key={c.id} 
                 className="client-list-item" 
                 style={{ backgroundColor: idx === clientSelectedIndex ? 'var(--color-primary)' : '', color: idx === clientSelectedIndex ? 'white' : '' }}
                 onClick={() => { setClient(c.isConsumidorFinal ? null : c); setActiveModal(null); }}
              >
                <div>
                    <div style={{ fontWeight: 600, color: idx === clientSelectedIndex ? 'white' : 'var(--color-text)' }}>{c.name}</div>
                    <div style={{ fontSize: '13px', color: idx === clientSelectedIndex ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' }}>CUIT: {c.cuit}</div>
                </div>
                {c.deuda > 0 && <div style={{ fontSize: '13px', fontWeight: 600, color: idx === clientSelectedIndex ? 'white' : 'var(--color-danger)' }}>Adeuda {formatCur(c.deuda)}</div>}
              </div>
            ))}
            {filteredClients.length === 0 && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--color-text-muted)' }}>No se encontraron clientes</div>}
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>Registrar nuevo:</h4>
            <div className="input-group" style={{ marginBottom: '12px' }}>
              <input 
                type="text" 
                className="input" 
                placeholder="Nombre completo" 
                value={newClientName} 
                onChange={e => setNewClientName(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); registerClient(); } }}
                style={{ paddingLeft: '12px' }}
              />
            </div>
            <div className="input-group" style={{ marginBottom: '16px' }}>
              <input 
                type="text" 
                className="input" 
                placeholder="CUIT (Opcional)" 
                value={newClientCuit} 
                onChange={e => setNewClientCuit(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); registerClient(); } }}
                style={{ paddingLeft: '12px' }}
              />
            </div>
            <div className="input-group" style={{ marginBottom: '16px' }}>
              <input 
                type="text" 
                className="input" 
                placeholder="WhatsApp (Opcional)" 
                value={newClientPhone} 
                onChange={e => setNewClientPhone(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); registerClient(); } }}
                style={{ paddingLeft: '12px' }}
              />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={registerClient}>Registrar y Seleccionar</button>
          </div>
        </Modal>
      )}

      {/* Price Check Modal */}
      {activeModal === 'priceCheck' && (
        <Modal title="Consultar Precio" onClose={() => setActiveModal(null)}>
          <div className="input-group">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              className="input" 
              placeholder="Escribe el nombre o código..." 
              value={priceCheckSearch} 
              onChange={e => setPriceCheckSearch(e.target.value)}
              autoFocus
            />
            {priceCheckSearch && <button className="search-clear" onClick={() => setPriceCheckSearch('')}><X size={16} /></button>}
          </div>
          <div style={{ minHeight: '150px' }}>
            {priceCheckSearch ? (
               searchedPriceItems.length > 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                   {searchedPriceItems.map(item => (
                     <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                       <div>
                         <div style={{ fontWeight: 600 }}>{item.name}</div>
                         <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Stock: {item.stock} u</div>
                       </div>
                       <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {formatCur(item.price)}
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '40px' }}>No se encontró el producto</div>
               )
            ) : (
               <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '40px' }}>Busca un producto para ver su precio</div>
            )}
          </div>
        </Modal>
      )}

      {/* Discount / Surcharge Modal */}
      {activeModal === 'discount' && (
        <Modal title="Aplicar Modificador" onClose={() => setActiveModal(null)}>
          <div className="discount-grid">
             <button className={`discount-btn ${modType === 'desc_perc' ? 'active' : ''}`} onClick={() => setModType('desc_perc')}><Percent size={20}/> Desc. %</button>
             <button className={`discount-btn ${modType === 'desc_fixed' ? 'active' : ''}`} onClick={() => setModType('desc_fixed')}><DollarSign size={20}/> Desc. Fijo</button>
             <button className={`discount-btn ${modType === 'rec_perc' ? 'active' : ''}`} onClick={() => setModType('rec_perc')}><Percent size={20}/> Recargo %</button>
             <button className={`discount-btn ${modType === 'rec_fixed' ? 'active' : ''}`} onClick={() => setModType('rec_fixed')}><DollarSign size={20}/> Recargo Fijo</button>
          </div>
          <div className="input-group" style={{ marginBottom: '20px' }}>
            <input 
              type="number" 
              className="input" 
              placeholder="Valor..." 
              value={modInput} 
              onChange={e => setModInput(e.target.value)}
              style={{ paddingLeft: '12px', fontSize: '16px', fontWeight: 600 }}
              dir="rtl"
              autoFocus
              onKeyDown={e => {
                const types = ['desc_perc', 'desc_fixed', 'rec_perc', 'rec_fixed'];
                const idx = types.indexOf(modType);
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setModType(types[(idx + 1) % types.length]);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setModType(types[(idx - 1 + types.length) % types.length]);
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  applyModifier();
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setModifier({ type: 'none', value: 0 }); setActiveModal(null); }}>Quitar</button>
             <button className="btn btn-primary" style={{ flex: 1 }} onClick={applyModifier}>Aplicar</button>
          </div>
        </Modal>
      )}

      {/* Custom Item Modal */}
      {activeModal === 'customItem' && (
        <Modal title={editingItemId ? "Editar Ítem Extra" : "Agregar Ítem Extra"} onClose={() => { setActiveModal(null); setEditingItemId(null); }}>
          <div className="input-group" style={{ marginBottom: '16px' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Descripción del ítem..." 
              value={customItemName} 
              onChange={e => setCustomItemName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  document.getElementById('customItemPriceInput')?.focus();
                }
              }}
              style={{ paddingLeft: '12px' }}
              autoFocus
            />
          </div>
          <div className="input-group" style={{ marginBottom: '24px' }}>
            <input 
              id="customItemPriceInput"
              type="number" 
              className="input" 
              placeholder="Precio..." 
              value={customItemPrice} 
              onChange={e => setCustomItemPrice(e.target.value)}
              style={{ paddingLeft: '12px', fontSize: '16px', fontWeight: 600 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  addCustomItem();
                }
              }}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={addCustomItem} disabled={!customItemPrice}>
             {editingItemId ? "Guardar Cambios" : "Agregar al Carrito"}
          </button>
        </Modal>
      )}

      {/* Manage Caja Modal */}
      {activeModal === 'manageCaja' && (
        <Modal title="Gestionar Caja" onClose={() => setActiveModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }} onClick={() => { setActiveModal('cajaOperation'); setCajaOperationType('deposit'); setCajaAmount(''); }}>
               <Plus size={18} /> Ingresar Efectivo
            </button>
            <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }} onClick={() => { setActiveModal('cajaOperation'); setCajaOperationType('withdraw'); setCajaAmount(''); }}>
               <Minus size={18} /> Retirar Efectivo
            </button>
            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)', color: 'white' }} onClick={() => { setActiveModal('closeCaja'); setArqueoEfectivo(''); }}>
               <Lock size={18} /> Cerrar Turno y Caja
            </button>
          </div>
        </Modal>
      )}

      {/* Cierre Modal */}
      {activeModal === 'closeCaja' && (
        <Modal title="Cierre de Turno y Arqueo" onClose={() => setActiveModal(null)}>
          <div style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--color-border)' }}>
             <h4 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Resumen del Turno</h4>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Cajero:</span>
                <span style={{ fontWeight: 600 }}>{caja.openedByName || 'Admin'}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Inicio:</span>
                <span style={{ fontWeight: 600 }}>{caja.openedDate} a las {caja.openedAt}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Ventas Digitales:</span>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{formatCur(sales.filter(s => new Date(s.date).getTime() >= caja.openedTimestamp && ['Tarjeta','QR','Transferencia'].includes(s.method)).reduce((acc, s) => acc + s.total, 0))}</span>
             </div>
             {kiosco.businessConfig?.plan === 'Pro' && (
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Fiados (Adeudado):</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{formatCur(sales.filter(s => new Date(s.date).getTime() >= caja.openedTimestamp && s.method === 'Fiado').reduce((acc, s) => acc + s.total, 0))}</span>
               </div>
             )}
          </div>

          <div style={{ marginBottom: '24px' }}>
             <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Efectivo Físico Esperado:</span>
                <span>{formatCur(caja.efectivo)}</span>
             </div>
             <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '0 0 16px 0' }}>Suma del ingreso inicial más todas las ventas cobradas en efectivo, menos los retiros registrados.</p>

             <div className="input-group" style={{ marginBottom: '8px' }}>
               <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Efectivo Contado (Arqueo):</div>
               <input 
                  type="number" 
                  className="input" 
                  placeholder={"Ej: " + caja.efectivo}
                  value={arqueoEfectivo} 
                  onChange={e => setArqueoEfectivo(e.target.value)} 
                  autoFocus
               />
             </div>
             
             {arqueoEfectivo !== '' && !isNaN(parseFloat(arqueoEfectivo)) && (
                <div style={{ padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', backgroundColor: (parseFloat(arqueoEfectivo) - caja.efectivo) >= 0 ? ((parseFloat(arqueoEfectivo) - caja.efectivo) === 0 ? 'rgba(52, 168, 83, 0.1)' : 'rgba(66, 133, 244, 0.1)') : 'rgba(234, 67, 53, 0.1)', color: (parseFloat(arqueoEfectivo) - caja.efectivo) >= 0 ? ((parseFloat(arqueoEfectivo) - caja.efectivo) === 0 ? 'var(--color-success)' : 'var(--color-primary)') : 'var(--color-danger)' }}>
                   <span>Diferencia de Arqueo:</span>
                   <span>
                      {(parseFloat(arqueoEfectivo) - caja.efectivo) > 0 ? '+ ' : ''}{formatCur(parseFloat(arqueoEfectivo) - caja.efectivo)}
                      {(parseFloat(arqueoEfectivo) - caja.efectivo) === 0 ? ' (Perfecto)' : ((parseFloat(arqueoEfectivo) - caja.efectivo) > 0 ? ' (Sobrante)' : ' (Faltante)')}
                   </span>
                </div>
             )}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: '14px', backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={handleCloseCaja} disabled={arqueoEfectivo === ''}>
             Confirmar y Cerrar Arqueo
          </button>
        </Modal>
      )}

      {/* Confirm Close Caja Modal */}
      {activeModal === 'confirmCloseCaja' && (
        <Modal title="Confirmar Cierre" onClose={() => setActiveModal('closeCaja')}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <AlertTriangle size={48} color={cajaDifference === 0 ? 'var(--color-success)' : 'var(--color-warning)'} />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#1a1f36', marginBottom: '32px', whiteSpace: 'pre-line' }}>{cajaConfirmMsg}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setActiveModal('closeCaja')}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-danger)', border: 'none' }} onClick={executeCloseCaja}>
                Sí, Cerrar Turno
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Caja Closed Warning Modal */}
      {activeModal === 'cajaClosed' && (
        <Modal title="¡Atención!" onClose={() => setActiveModal(null)}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <AlertTriangle size={40} color="var(--color-warning)" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-text)' }}>La Caja está Cerrada</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>Es necesario abrir la caja antes de registrar ventas y realizar cobros.</p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Volver</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Shift Summary Modal */}
      {activeModal === 'shiftSummary' && (
        <Modal title="Resumen del Turno" onClose={() => setActiveModal(null)} minWidth="400px">
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '65vh', overflowY: 'auto' }}>
            <div style={{ backgroundColor: 'var(--color-background)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', whiteSpace: 'pre-line', fontSize: '16px', lineHeight: '1.8' }}>
              {shiftSummaryText}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-outline" 
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  navigator.clipboard.writeText(shiftSummaryText);
                  setAlertMessage('¡Resumen copiado al portapapeles!');
                }}
              >
                Copiar
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#25D366', borderColor: '#25D366' }}
                onClick={() => {
                  const encoded = encodeURIComponent(shiftSummaryText);
                  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
                  setActiveModal(null);
                }}
              >
                Enviar por WhatsApp
              </button>
            </div>
            <button className="btn btn-outline" onClick={() => setActiveModal(null)} style={{ width: '100%' }}>Cerrar</button>
          </div>
        </Modal>
      )}

      {/* Identify & Pin Lock Screen Overlay (Only shows if explicitly locked) */}
      {isLocked && (
        <div className="modal-overlay" style={{ zIndex: 90, backgroundColor: 'rgba(26, 31, 54, 0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          <div style={{ position: 'relative', width: '550px', maxWidth: '95vw', backgroundColor: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            
            {caja.isOpen && (
               <button 
                 className="btn-icon"
                 onClick={() => { setIsLocked(false); setSelectedUserForLogin(null); setLoginPin(''); setPinError(false); }}
                 style={{ position: 'absolute', top: '24px', right: '24px', backgroundColor: '#f1f3f5', borderRadius: '50%', padding: '8px' }}
                 title="Cancelar y volver a la caja"
               >
                 <X size={20} />
               </button>
            )}

            {!selectedUserForLogin ? (
               // Pantalla 1: Selección de Usuario
               <>
                 <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                   <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(66, 133, 244, 0.1)', marginBottom: '16px' }}>
                     <Lock size={28} color="var(--color-primary)" />
                   </div>
                   <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>{caja.isOpen ? 'Desbloquear Turno' : 'Apertura de Caja'}</h2>
                   <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', margin: 0 }}>Selecciona tu perfil para operar en este local</p>
                 </div>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '16px', maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
                   {users.filter(u => u.isActive).map(user => (
                      <div 
                         key={user.id} 
                         onClick={() => { setSelectedUserForLogin(user); setPinError(false); }}
                         style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: '#f8f9fa' }}
                         onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(66, 133, 244, 0.05)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                         onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f8f9fa'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                      >
                         <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: `${getRoleColor(user.role)}20`, color: getRoleColor(user.role), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '18px', marginBottom: '12px' }}>
                            {getInitials(user.name)}
                         </div>
                         <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1f36', textAlign: 'center' }}>{user.name}</div>
                         <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{user.role}</div>
                      </div>
                   ))}
                 </div>
               </>
            ) : (
               // Pantalla 2: Ingreso de PIN
               <>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                   <button className="btn-icon" onClick={() => { setSelectedUserForLogin(null); setLoginPin(''); setPinError(false); }} style={{ padding: '8px', backgroundColor: '#f1f3f5', borderRadius: '50%' }}>
                     <ArrowLeft size={20} />
                   </button>
                   <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                     <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: `${getRoleColor(selectedUserForLogin.role)}20`, color: getRoleColor(selectedUserForLogin.role), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '18px', marginBottom: '8px' }}>
                        {getInitials(selectedUserForLogin.name)}
                     </div>
                     <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#1a1f36' }}>{selectedUserForLogin.name}</h3>
                   </div>
                   <div style={{ width: '36px' }}></div>
                 </div>

                 <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                   <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: '0 0 16px 0' }}>Ingresa tu PIN de 4 dígitos</p>
                   <input 
                      ref={pinInputRef}
                      type="password" 
                      inputMode="numeric"
                      autoComplete="new-password"
                      autoFocus
                      value={loginPin} 
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val.length <= 4) setLoginPin(val);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && loginPin.length === 4) handleLoginSubmit();
                      }}
                      style={{ width: '200px', fontSize: '32px', letterSpacing: '12px', textAlign: 'center', padding: '12px', borderRadius: '12px', border: pinError ? '2px solid var(--color-danger)' : '2px solid var(--color-border)', backgroundColor: '#f8f9fa', color: pinError ? 'var(--color-danger)' : '#1a1f36' }}
                   />
                   {pinError && <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginTop: '8px', fontWeight: 600 }}>PIN incorrecto</div>}
                 </div>

                 <button 
                   className="btn btn-primary" 
                   style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, borderRadius: '12px' }} 
                   onClick={handleLoginSubmit} 
                   disabled={loginPin.length < 4}
                 >
                   Desbloquear
                 </button>
               </>
            )}

          </div>
        </div>
      )}

      {/* Confirm Payment Modal (For Card/QR/Transf) */}
      {activeModal === 'confirmPayment' && (
        <Modal title="Confirmar Operación" onClose={() => setActiveModal(null)}>
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }}>¿Deseas realmente procesar la operación?</p>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)' }}>Método: <span style={{ color: 'var(--color-primary)' }}>{paymentMethod}</span></div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '12px' }}>{formatCur(total)}</div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => completeSale(paymentMethod)}>Confirmar y Procesar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Caja Operations (Deposit, Withdraw, Open) */}
      {activeModal === 'cajaOperation' && (
        <Modal title={cajaOperationType === 'open' ? 'Abrir Caja' : cajaOperationType === 'deposit' ? 'Ingresar Efectivo' : 'Retirar Efectivo'} onClose={() => setActiveModal(null)}>
          <div className="input-group" style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Monto:</div>
            <input 
               type="text" 
               inputMode="numeric"
               className="input" 
               placeholder="Ej: 5000" 
               value={cajaAmount} 
               onChange={e => setCajaAmount(e.target.value.replace(/[^0-9.]/g, ''))}
               style={{ paddingLeft: '12px', fontSize: '18px', fontWeight: 600, textAlign: 'center' }}
               autoFocus
               onKeyDown={(e) => {
                 if(e.key === 'Enter') {
                    e.stopPropagation();
                    handleCajaOperation();
                 }
               }}
            />
          </div>
          {cajaOperationType !== 'open' && (
            <div className="input-group" style={{ marginBottom: '24px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Motivo (Obligatorio):</div>
              <input 
                 type="text" 
                 className="input" 
                 placeholder="Ej: Pago proveedor, Cambio, Retiro dueño..." 
                 value={cajaMotivo} 
                 onChange={e => setCajaMotivo(e.target.value)}
                 style={{ paddingLeft: '12px', fontSize: '15px' }}
                 onKeyDown={(e) => {
                   if(e.key === 'Enter') {
                      e.stopPropagation();
                      if(cajaAmount && cajaMotivo) handleCajaOperation();
                   }
                 }}
              />
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCajaOperation} disabled={!cajaAmount || (cajaOperationType !== 'open' && !cajaMotivo.trim())}>
             Confirmar
          </button>
        </Modal>
      )}



      {/* Checkout Efectivo Modal */}
      {activeModal === 'checkoutEfectivo' && (
        <Modal title="Cobro en Efectivo" onClose={() => setActiveModal(null)}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
             <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Total a Pagar</div>
             <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--color-primary)' }}>{formatCur(total)}</div>
          </div>
          <div className="input-group" style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Monto entregado por el cliente:</div>
            <input 
              type="text" 
              inputMode="numeric"
              className="input" 
              placeholder="Ej: 5000" 
              value={tenderedAmount} 
              onChange={e => setTenderedAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              style={{ paddingLeft: '12px', fontSize: '24px', fontWeight: 600, textAlign: 'center' }}
              autoFocus
              onKeyDown={(e) => {
                if(e.key === 'Enter') {
                   e.stopPropagation();
                   if (parseFloat(tenderedAmount) >= total || tenderedAmount === '') {
                      completeSale('Efectivo');
                   }
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
             <button className="btn btn-outline" style={{ flex: 1, padding: '8px' }} onClick={() => setTenderedAmount(total.toString())}>Monto Exacto</button>
             <button className="btn btn-outline" style={{ flex: 1, padding: '8px' }} onClick={() => setTenderedAmount((Math.ceil(total / 1000) * 1000).toString())}>Redondear Mil</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
             <span style={{ fontSize: '18px', fontWeight: 600 }}>Vuelto:</span>
             <span style={{ fontSize: '24px', fontWeight: 700, color: (parseFloat(tenderedAmount) >= total ? 'var(--color-success)' : 'var(--color-danger)') }}>
                {tenderedAmount ? formatCur(Math.max(0, parseFloat(tenderedAmount) - total)) : '$ 0'}
             </span>
          </div>
          <button 
             className="btn btn-primary" 
             style={{ width: '100%', padding: '16px', fontSize: '18px' }} 
             onClick={() => completeSale('Efectivo')}
             disabled={tenderedAmount !== '' && parseFloat(tenderedAmount) < total}
          >
             Confirmar Pago
          </button>
        </Modal>
      )}

      {/* Success Modal */}
      {activeModal === 'success' && (
        <Modal title="" onClose={() => setActiveModal(null)}>
          <div style={{ textAlign: 'center' }}>
            <div className="success-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><CheckCircle2 size={40} color="var(--color-success)" /></div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--color-text)' }}>¡Venta Registrada!</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>El pago se procesó y la venta finalizó con éxito.</p>
            
            {lastSale && lastSale.method === 'Efectivo' && (
              <div style={{ backgroundColor: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--color-border)', textAlign: 'left' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Total pagado:</span>
                    <span style={{ fontWeight: 600 }}>{formatCur(lastSale.total)}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Abonó con:</span>
                    <span style={{ fontWeight: 600 }}>{formatCur(lastSale.tendered)}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '18px', fontWeight: 600 }}>Vuelto a entregar:</span>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)' }}>{formatCur(lastSale.change)}</span>
                 </div>
              </div>
            )}
            
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={() => { setActiveModal(null); setLastSale(null); }}>
              Nueva Venta
            </button>
          </div>
        </Modal>
      )}

      {/* Weight/Price Modal */}
      {activeModal === 'weightSelector' && (
        <Modal title={weightProduct ? (editingItemId ? `Editar: ${weightProduct.name}` : `Venta: ${weightProduct.name}`) : 'Venta por Cantidad'} onClose={() => { setActiveModal(null); setWeightProduct(null); setEditingItemId(null); }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Precio por {weightProduct?.unitType === 'Gramos (g)' ? 'Gramo' : (weightProduct?.unitType === 'Litro (L)' ? 'Litro' : 'Kg')}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)' }}>{weightProduct ? formatCur(weightProduct.price) : ''}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>Importe ($)</label>
              <input 
                type="text" 
                inputMode="numeric"
                className="input" 
                placeholder="Ej: 1500" 
                value={priceInput} 
                onChange={e => {
                  const p = e.target.value.replace(/[^0-9.]/g, '');
                  setPriceInput(p);
                  const price = parseFloat(p);
                  if (!isNaN(price) && weightProduct && weightProduct.price > 0) {
                    setWeightInput((price / weightProduct.price).toFixed(3));
                  } else {
                    setWeightInput('');
                  }
                }}
                style={{ fontSize: '18px', fontWeight: 600, textAlign: 'center' }}
                autoFocus
                onKeyDown={(e) => {
                  if(e.key === 'Enter') {
                    e.stopPropagation();
                    handleWeightSubmit();
                  }
                }}
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>{weightProduct?.unitType === 'Gramos (g)' ? 'Peso (g)' : (weightProduct?.unitType === 'Litro (L)' ? 'Volumen (L)' : 'Peso (Kg)')}</label>
              <input 
                type="text" 
                inputMode="numeric"
                className="input" 
                placeholder="Ej: 0.500" 
                value={weightInput} 
                onChange={e => {
                  const w = e.target.value.replace(/[^0-9.]/g, '');
                  setWeightInput(w);
                  const weight = parseFloat(w);
                  if (!isNaN(weight) && weightProduct) {
                    setPriceInput((weight * weightProduct.price).toFixed(2));
                  } else {
                    setPriceInput('');
                  }
                }}
                style={{ fontSize: '18px', fontWeight: 600, textAlign: 'center' }}
                onKeyDown={(e) => {
                  if(e.key === 'Enter') {
                    e.stopPropagation();
                    handleWeightSubmit();
                  }
                }}
              />
            </div>
          </div>
          <button 
             className="btn btn-primary" 
             style={{ width: '100%', padding: '16px', fontSize: '18px' }} 
             onClick={handleWeightSubmit}
             disabled={!weightInput || parseFloat(weightInput) <= 0}
          >
             {editingItemId ? "Guardar Cambios" : "Confirmar y Agregar"}
          </button>
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

      {/* Alerts / Notifications Modal */}
      {activeModal === 'alertsModal' && (
        <Modal title="Notificaciones" onClose={() => setActiveModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }}>
            {client && client.deuda > 0 && (
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(234, 67, 53, 0.1)', border: '1px solid rgba(234, 67, 53, 0.2)' }}>
                <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={18} /> Deuda de Cliente
                </h4>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                  {client.name} adeuda {formatCur(client.deuda)}
                </p>
              </div>
            )}
            
            {expiringProducts.length > 0 && (
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(245, 159, 0, 0.1)', border: '1px solid rgba(245, 159, 0, 0.2)' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bell size={18} /> Productos por vencer
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {expiringProducts.map(p => {
                    const isExpired = p.daysToExpire <= 0;
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{isExpired ? 'Vencido' : `Vence en ${p.daysToExpire} días`}</div>
                        </div>
                        <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handleDismissWarning(p)}>Silenciar</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {lowStockProducts.length > 0 && (
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(234, 67, 53, 0.1)', border: '1px solid rgba(234, 67, 53, 0.2)' }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={18} /> Alertas de Stock
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lowStockProducts.map(p => {
                    const isOut = (p.stock || 0) <= 0;
                    const matchOpp = replenishmentOpportunities.find(o => o.product.id === p.id);
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid var(--color-border)', gap: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: isOut ? 'var(--color-danger)' : 'var(--color-warning)', fontWeight: isOut ? 700 : 500 }}>
                            {isOut ? 'Sin stock' : `Stock bajo: ${p.stock} u`}
                          </div>
                          {matchOpp && (
                            <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '2px', fontWeight: 500 }}>
                              💡 Oferta disponible: {matchOpp.campaign.supplierName} (${matchOpp.campaign.price?.toLocaleString('es-AR')})
                            </div>
                          )}
                        </div>
                        {matchOpp && (
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                setActiveModal(null);
                                ofertas.openCampaignDetail && ofertas.openCampaignDetail(matchOpp.campaign);
                              }}
                              style={{ padding: '4px 8px', fontSize: '11px', borderColor: '#93C5FD', color: '#1D4ED8' }}
                            >
                              Ver Oferta
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => ofertas.handleWhatsAppClick && ofertas.handleWhatsAppClick(matchOpp.campaign)}
                              style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#16A34A', borderColor: '#16A34A', color: '#fff' }}
                            >
                              Pedir
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {expiringProducts.length === 0 && lowStockProducts.length === 0 && (!client || client.deuda <= 0) && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                No tienes notificaciones pendientes.
              </div>
            )}
          </div>
          <div style={{ marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setActiveModal(null)}>Cerrar</button>
          </div>
        </Modal>
      )}

      {/* Cart Preview Modal */}
      {activeModal === 'cartPreview' && (
        <Modal title="Vista Preliminar de Compra" onClose={() => setActiveModal(null)} minWidth="480px">
          <div tabIndex={0} autoFocus style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px', marginBottom: '16px', outline: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '110px' }} />
                <col />
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--color-border)' }}>Cant.</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--color-border)' }}>Producto</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '2px solid var(--color-border)', whiteSpace: 'nowrap' }}>Precio U.</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '2px solid var(--color-border)', whiteSpace: 'nowrap' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{item.unitType === 'Peso (Kg)' ? `${Number(item.qty).toFixed(3)} Kg` : (item.unitType === 'Gramos (g)' ? `${item.qty} g` : (['Caja', 'Pack', 'Bolsa', 'Litro (L)'].includes(item.unitType) ? `${item.qty} ${item.unitType.split(' ')[0]}` : `${item.qty}x`))}</td>
                    <td style={{ padding: '8px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{formatCur(item.price)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCur(getCartItemTotal(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ backgroundColor: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
              <span>Subtotal:</span>
              <span style={{ whiteSpace: 'nowrap' }}>{formatCur(subtotal)}</span>
            </div>
            {modifier.type !== 'none' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: modAmount < 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                <span>{modAmount < 0 ? 'Descuento:' : 'Recargo:'}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{modAmount < 0 ? '-' : '+'}{formatCur(Math.abs(modAmount))}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--color-border)', fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)' }}>
              <span>Total:</span>
              <span style={{ whiteSpace: 'nowrap' }}>{formatCur(total)}</span>
            </div>
          </div>
          
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '24px', padding: '12px' }} onClick={() => setActiveModal(null)}>
            Volver al Carrito
          </button>
        </Modal>
      )}

    </div>
  );
};

export default React.memo(PuntoDeVenta);
