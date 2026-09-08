import { useState, useEffect, useCallback, useMemo } from 'react';

// Llaves para localStorage
const KEYS = {
  PRODUCTS: 'kioscoprox_products',
  SALES: 'kioscoprox_sales',
  PURCHASES: 'kioscoprox_purchases',
  CLIENTS: 'kioscoprox_clients',
  CAJA: 'kioscoprox_caja',
  SHIFTS: 'kioscoprox_shifts',
  USERS: 'kioscoprox_users',
  CATEGORIES: 'kioscoprox_categories',
  SUPPLIERS: 'kioscoprox_suppliers',
  BUSINESS_CONFIG: 'kioscoprox_business_config',
  RESERVATIONS: 'kioscoprox_reservations'
};

import { NICHES } from '../utils/mockData';
import { generate5MonthsDemoData } from '../utils/demoDataGenerator';
import { getInstallationId, calculateLicenseKey, saveCommerceProfile, getCommerceProfile } from '../services/installationService';

export const generateLicenseKey = (installationId) => {
  return calculateLicenseKey(installationId);
};


export const useKiosco = () => {
  // Demo data fallback generator
  const demoFallback = useMemo(() => generate5MonthsDemoData(), []);

  // Inicialización de estados desde localStorage o defaults demo (5 meses)
  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem(KEYS.PRODUCTS);
    return saved ? JSON.parse(saved) : demoFallback.products;
  });

  const [sales, setSales] = useState(() => {
    const saved = localStorage.getItem(KEYS.SALES);
    return saved ? JSON.parse(saved) : demoFallback.sales;
  });

  const [purchases, setPurchases] = useState(() => {
    const saved = localStorage.getItem(KEYS.PURCHASES);
    return saved ? JSON.parse(saved) : demoFallback.purchases;
  });

  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem(KEYS.USERS);
    return saved ? JSON.parse(saved) : [
      { id: 1, name: "Administrador", email: "", role: "Admin", pin: "1234", isActive: true }
    ];
  });

  const [clients, setClients] = useState(() => {
    const saved = localStorage.getItem(KEYS.CLIENTS);
    return saved ? JSON.parse(saved) : demoFallback.clients;
  });

  const [caja, setCaja] = useState(() => {
    const saved = localStorage.getItem(KEYS.CAJA);
    return saved ? JSON.parse(saved) : { isOpen: false, efectivo: 0, openedAt: null };
  });

  const [shifts, setShifts] = useState(() => {
    const saved = localStorage.getItem(KEYS.SHIFTS);
    return saved ? JSON.parse(saved) : demoFallback.shifts;
  });

  const [categoryTree, setCategoryTree] = useState(() => {
    const saved = localStorage.getItem(KEYS.CATEGORIES);
    return saved && Object.keys(JSON.parse(saved)).length > 0 ? JSON.parse(saved) : demoFallback.categoryTree;
  });

  const [suppliers, setSuppliers] = useState(() => {
    const saved = localStorage.getItem(KEYS.SUPPLIERS);
    return saved && JSON.parse(saved).length > 0 ? JSON.parse(saved) : demoFallback.suppliers;
  });

  const [businessConfig, setBusinessConfig] = useState(() => {
    const defaults = {
      isActivated: false,
      isOnboarded: false,
      storeName: '',
      cuit: '20-12345678-9',
      country: 'Argentina',
      businessType: 'kiosco',
      plan: 'Básico',
      expirationWarningDays: 15
    };
    const saved = localStorage.getItem(KEYS.BUSINESS_CONFIG);
    let config = saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    
    // Obtener y preservar de forma estricta el installationId (existente o nuevo seguro)
    config.installationId = getInstallationId();
    localStorage.setItem(KEYS.BUSINESS_CONFIG, JSON.stringify(config));
    
    return config;
  });

  const [reservations, setReservations] = useState(() => {
    const saved = localStorage.getItem(KEYS.RESERVATIONS);
    return saved ? JSON.parse(saved) : [];
  });

  const [checkoutReservation, setCheckoutReservation] = useState(null);

  const completeOnboarding = useCallback((storeName, nicheId, locationData = {}) => {
    const nicheData = NICHES[nicheId] || NICHES['kiosco'];
    
    setBusinessConfig(prev => {
      const updated = {
        ...prev,
        isOnboarded: true,
        storeName,
        businessType: nicheId,
        provinceCode: locationData.provinceCode || prev.provinceCode || 'AR-D',
        provinceName: locationData.provinceName || prev.provinceName || 'San Luis',
        cityCode: locationData.cityCode || prev.cityCode || 'SL-CAPITAL',
        cityName: locationData.cityName || prev.cityName || 'San Luis Capital'
      };
      saveCommerceProfile({
        storeName,
        businessType: nicheId,
        ...locationData
      });
      return updated;
    });
    
    setCategoryTree(nicheData.categories);
    setProducts(nicheData.mockProducts);
    setSuppliers(nicheData.mockSuppliers || []);
    setClients(nicheData.mockClients || [{ id: 1, name: "Consumidor Final", cuit: "00-00000000-0", deuda: 0 }]);

    // Caja permanece cerrada por defecto al instalar
  }, []);

  // Verificación de integridad de licencia
  useEffect(() => {
    if (businessConfig.plan === 'Pro') {
      const expectedKey = generateLicenseKey(businessConfig.installationId);
      if (businessConfig.licenseKey !== expectedKey) {
        console.warn('Licencia inválida o faltante. Revirtiendo a Plan Básico.');
        setBusinessConfig(prev => ({ ...prev, plan: 'Básico' }));
      }
    }
  }, []);

  // Persistencia automática
  useEffect(() => {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(KEYS.SALES, JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem(KEYS.PURCHASES, JSON.stringify(purchases));
  }, [purchases]);

  useEffect(() => {
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem(KEYS.CAJA, JSON.stringify(caja));
  }, [caja]);

  useEffect(() => {
    localStorage.setItem(KEYS.SHIFTS, JSON.stringify(shifts));
  }, [shifts]);

  useEffect(() => {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(categoryTree));
  }, [categoryTree]);

  useEffect(() => {
    localStorage.setItem(KEYS.SUPPLIERS, JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem(KEYS.BUSINESS_CONFIG, JSON.stringify(businessConfig));
  }, [businessConfig]);

  useEffect(() => {
    localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify(reservations));
  }, [reservations]);

  // Acciones
  const addProduct = useCallback((product) => {
    setProducts(prev => [...prev, { ...product, id: Date.now() }]);
  }, []);


  const updateProduct = useCallback((id, data) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);


  const deleteProduct = useCallback((id) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  const deleteProducts = useCallback((ids) => {
    setProducts(prev => prev.filter(p => !ids.includes(p.id)));
  }, []);

  const deleteAllProducts = useCallback(() => {
    setProducts([]);
  }, []);

  const clearAllData = useCallback(() => {
    setProducts([]);
    setClients([]);
    setSuppliers([]);
    setPurchases([]);
    setSales([]);
    setShifts([]);
    setCaja({ isOpen: false, initialAmount: 0, currentAmount: 0, startTime: null, movements: [] });
  }, []);

  const loadDemoData = useCallback((demoData) => {
    if (demoData.categoryTree) setCategoryTree(demoData.categoryTree);
    if (demoData.suppliers) setSuppliers(demoData.suppliers);
    if (demoData.products) setProducts(demoData.products);
    if (demoData.clients) setClients(demoData.clients);
    if (demoData.purchases) setPurchases(demoData.purchases);
    if (demoData.sales) setSales(demoData.sales);
    if (demoData.shifts) setShifts(demoData.shifts);
  }, []);

  const updateGlobalMargin = useCallback((marginPercentage) => {
    setProducts(prev => prev.map(p => {
      if (p.cost > 0) {
        const newPrice = Math.round(p.cost * (1 + marginPercentage / 100) * 100) / 100;
        let newPriceNet = p.priceNet;
        if (p.iva && p.iva > 0) {
          newPriceNet = Math.round((newPrice / (1 + p.iva / 100)) * 100) / 100;
        }
        return {
          ...p,
          margin: marginPercentage,
          price: newPrice,
          priceNet: newPriceNet
        };
      }
      return { ...p, margin: marginPercentage };
    }));
  }, []);

  const batchImportProducts = useCallback((importedProducts) => {
    setProducts(prev => {
      let nextProducts = [...prev];
      let newCount = 0;
      let updateCount = 0;
      
      importedProducts.forEach(ip => {
        // Find match by sku or code
        const matchIndex = nextProducts.findIndex(p => 
          (p.code && p.code === ip.code) || 
          (p.sku && p.sku === ip.code) ||
          (p.code && p.code === ip.sku) ||
          (p.sku && p.sku === ip.sku)
        );

        if (matchIndex !== -1) {
          nextProducts[matchIndex] = { ...nextProducts[matchIndex], ...ip };
          updateCount++;
        } else {
          // It's a new product, assign unique id
          nextProducts.push({ ...ip, id: Date.now() + newCount });
          newCount++;
        }
      });
      return nextProducts;
    });
  }, []);


  const addSale = useCallback((saleData) => {
    const newSale = {
      ...saleData,
      id: Date.now(),
      date: new Date().toISOString()
    };
    setSales(prev => [...prev, newSale]);

    if (saleData.linkedReservationId) {
      setReservations(prev => prev.map(r => r.id === saleData.linkedReservationId ? { ...r, status: 'Completado' } : r));
    }
    
    // Actualizar stock de productos (incluyendo componentes de combos)
    setProducts(prev => {
      const deductions = {};
      
      saleData.items.forEach(saleItem => {
        if (!saleItem.isService) {
          deductions[saleItem.id] = (deductions[saleItem.id] || 0) + saleItem.qty;
        }
        
        // Si el producto vendido es un combo o servicio con insumos, también restamos de sus componentes del inventario real
        if ((saleItem.isCombo || saleItem.isService) && saleItem.components) {
          saleItem.components.forEach(comp => {
            deductions[comp.productId] = (deductions[comp.productId] || 0) + (comp.qty * saleItem.qty);
          });
        }
      });

      return prev.map(p => {
        if (deductions[p.id]) {
          return { ...p, stock: Math.max(0, p.stock - deductions[p.id]) };
        }
        return p;
      });
    });

    // Actualizar efectivo en caja si es efectivo
    if (saleData.method === 'Efectivo') {
      setCaja(prev => ({ ...prev, efectivo: prev.efectivo + saleData.total }));
    }

    // Actualizar deuda si el método es Fiado
    if (saleData.method === 'Fiado' && saleData.clientId) {
      setClients(prev => prev.map(c => 
        c.id === saleData.clientId 
          ? { ...c, deuda: (c.deuda || 0) + saleData.total } 
          : c
      ));
    }
  }, []);


  const addPurchase = useCallback((purchaseData) => {
    const newPurchase = {
      ...purchaseData,
      id: Date.now(),
      date: new Date().toISOString()
    };
    setPurchases(prev => [...prev, newPurchase]);

    // Actualizar stock, costo y precio final de productos (manteniendo el margen)
    setProducts(prev => {
      const addedQty = {};
      const newCosts = {};

      purchaseData.items.forEach(purchaseItem => {
        const itemQty = Number(purchaseItem.qty) || 0;
        addedQty[purchaseItem.id] = (addedQty[purchaseItem.id] || 0) + itemQty;
        const itemCost = purchaseItem.cost !== undefined ? purchaseItem.cost : purchaseItem.unitCost;
        if (itemCost !== undefined && itemCost !== null) {
          newCosts[purchaseItem.id] = Number(itemCost) || 0;
        }
      });

      return prev.map(p => {
        if (addedQty[p.id]) {
          const updatedCost = newCosts[p.id] !== undefined ? newCosts[p.id] : p.cost;
          
          // Buscar el item en la compra para ver si trae precio/margen explícito
          const pItem = purchaseData.items.find(i => i.id === p.id);
          
          let updatedPrice = p.price;
          let updatedMargin = p.margin;

          if (pItem && pItem.price !== undefined) {
             // Si Compras.jsx nos manda un precio explícito, lo usamos
             updatedPrice = pItem.price;
             updatedMargin = pItem.margin !== undefined ? pItem.margin : p.margin;
          } else {
             // Lógica legacy por si no viene de Compras
             if (updatedCost !== p.cost) {
               if (p.margin !== undefined && p.margin > 0) {
                 updatedPrice = Math.round(updatedCost * (1 + p.margin / 100) * 100) / 100;
               } else if (p.cost > 0 && p.price > 0) {
                 const marginRatio = p.price / p.cost;
                 updatedPrice = Math.round(updatedCost * marginRatio * 100) / 100;
               }
             }
          }

          // Mantener actualizado el precio neto si tiene IVA
          let updatedPriceNet = p.priceNet;
          if (p.iva && p.iva > 0) {
            updatedPriceNet = Math.round((updatedPrice / (1 + p.iva / 100)) * 100) / 100;
          }

          const currentStock = Number(p.stock) || 0;
          const qtyToAdd = Number(addedQty[p.id]) || 0;

          return { 
            ...p, 
            stock: currentStock + qtyToAdd, 
            cost: updatedCost,
            price: updatedPrice,
            margin: updatedMargin,
            priceNet: updatedPriceNet
          };
        }
        return p;
      });
    });

    // Restar efectivo de caja si es efectivo
    if (purchaseData.method === 'Efectivo') {
      setCaja(prev => ({ ...prev, efectivo: prev.efectivo - purchaseData.total }));
    }
  }, []);


  const updatePurchase = useCallback((id, newData, modifierName = 'Sistema') => {
    const oldPurchase = purchases.find(p => p.id === id);
    if (!oldPurchase) return;

    const oldQty = oldPurchase.items.reduce((acc, it) => acc + it.qty, 0);
    const newQty = newData.items.reduce((acc, it) => acc + it.qty, 0);
    
    let changes = [];
    if (oldQty !== newQty) changes.push('Cantidad');
    
    const oldCostsMap = oldPurchase.items.reduce((acc, it) => { acc[it.id] = (it.unitCost !== undefined ? it.unitCost : it.cost); return acc; }, {});
    let costChanged = false;
    if (oldPurchase.items.length !== newData.items.length) {
      costChanged = true;
    } else {
      for (let item of newData.items) {
        let currentItemCost = item.unitCost !== undefined ? item.unitCost : item.cost;
        if (oldCostsMap[item.id] !== currentItemCost) {
          costChanged = true;
          break;
        }
      }
    }
    if (costChanged) changes.push('Costo');
    
    if (oldPurchase.total !== newData.total) changes.push('Valor Total');
    if (oldPurchase.method !== newData.method) changes.push('Método de Pago');
    
    if (changes.length === 0) changes.push('Datos generales');

    const editLog = {
      id: Date.now(),
      editDate: new Date().toISOString(),
      modifierName,
      oldTotal: oldPurchase.total,
      newTotal: newData.total,
      oldItemsCount: oldQty,
      newItemsCount: newQty,
      changesSummary: changes.join(', ')
    };

    const updatedPurchase = {
      ...newData,
      id: oldPurchase.id,
      date: oldPurchase.date,
      isEdited: true,
      edits: [...(oldPurchase.edits || []), editLog]
    };

    setPurchases(prev => prev.map(p => p.id === id ? updatedPurchase : p));

    // Consolidar rollback y aplicar nuevos a Productos
    setProducts(prev => {
      const oldQty = {};
      oldPurchase.items.forEach(old => {
        const q = Number(old.qty) || 0;
        oldQty[old.id] = (oldQty[old.id] || 0) + q;
      });

      const newQty = {};
      const newCosts = {};
      updatedPurchase.items.forEach(newItem => {
        const q = Number(newItem.qty) || 0;
        newQty[newItem.id] = (newQty[newItem.id] || 0) + q;
        const itemCost = newItem.cost !== undefined ? newItem.cost : newItem.unitCost;
        if (itemCost !== undefined && itemCost !== null) {
          newCosts[newItem.id] = Number(itemCost) || 0;
        }
      });

      return prev.map(p => {
        if (oldQty[p.id] || newQty[p.id]) {
          let currentStock = Number(p.stock) || 0;
          // Revertir
          if (oldQty[p.id]) currentStock = Math.max(0, currentStock - (Number(oldQty[p.id]) || 0));
          // Aplicar nuevo
          if (newQty[p.id]) currentStock += (Number(newQty[p.id]) || 0);
          
          const updatedCost = newCosts[p.id] !== undefined ? newCosts[p.id] : p.cost;
          
          const pItem = updatedPurchase.items.find(i => i.id === p.id);
          let updatedPrice = p.price;
          let updatedMargin = p.margin;

          if (pItem && pItem.price !== undefined) {
             updatedPrice = pItem.price;
             updatedMargin = pItem.margin !== undefined ? pItem.margin : p.margin;
          } else {
             // Si el costo cambia, recalculamos precio en base al margen
             if (updatedCost !== p.cost) {
               if (p.margin !== undefined && p.margin > 0) {
                 updatedPrice = Math.round(updatedCost * (1 + p.margin / 100) * 100) / 100;
               } else if (p.cost > 0 && p.price > 0) {
                 const marginRatio = p.price / p.cost;
                 updatedPrice = Math.round(updatedCost * marginRatio * 100) / 100;
               }
             }
          }

          let updatedPriceNet = p.priceNet;
          if (p.iva && p.iva > 0) {
            updatedPriceNet = Math.round((updatedPrice / (1 + p.iva / 100)) * 100) / 100;
          }

          return {
            ...p,
            stock: currentStock,
            cost: updatedCost,
            price: updatedPrice,
            margin: updatedMargin,
            priceNet: updatedPriceNet
          };
        }
        return p;
      });
    });

    // Consolidar rollback y aplicar caja
    setCaja(prev => {
      let nuevoEfectivo = prev.efectivo;
      if (oldPurchase.method === 'Efectivo') nuevoEfectivo += oldPurchase.total;
      if (updatedPurchase.method === 'Efectivo') nuevoEfectivo -= updatedPurchase.total;
      return { ...prev, efectivo: nuevoEfectivo };
    });
  }, [purchases]);


  const addClient = useCallback((client) => {
    const newClient = { ...client, id: Date.now(), deuda: 0, createdAt: new Date().toISOString() };
    setClients(prev => [...prev, newClient]);
    return newClient;
  }, []);


  const updateClient = useCallback((id, data) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);


  const deleteClient = useCallback((id) => {
    setClients(prev => prev.filter(c => c.id !== id));
  }, []);


  const payDebt = useCallback((clientId, amount, clientName = 'Desconocido', method = 'Efectivo', userName = 'Sistema') => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, deuda: Math.max(0, (c.deuda || 0) - amount) } : c));
    setCaja(prev => {
      if (!prev.isOpen) return prev;
      const newMovement = {
        id: Date.now(),
        type: 'deposit',
        amount: amount,
        motivo: `Cobro de deuda - Cliente: ${clientName} (${method})`,
        user: userName,
        date: new Date().toISOString()
      };
      
      let nuevoEfectivo = prev.efectivo;
      if (method === 'Efectivo') {
        nuevoEfectivo += amount;
      }
      
      return { 
        ...prev, 
        efectivo: nuevoEfectivo,
        movimientos: [...(prev.movimientos || []), newMovement]
      };
    });
  }, []);


  const addUser = useCallback((userData) => {
    const newUser = { ...userData, id: Date.now() };
    setUsers(prev => [...prev, newUser]);
  }, []);


  const updateUser = useCallback((id, data) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
  }, []);


  const deleteUser = useCallback((id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);


  const updateCaja = useCallback((data) => {
    setCaja(prev => ({ ...prev, ...data }));
  }, []);


  const closeCajaAndSaveShift = useCallback((shiftData) => {
    const newShift = {
      ...shiftData,
      id: Date.now(),
      closedAtDate: new Date().toISOString()
    };
    setShifts(prev => [newShift, ...prev]);
    setCaja({ isOpen: false, efectivo: 0, openedAt: null, openedDate: null, openedTimestamp: null, openedBy: null, openedByName: null, movimientos: [] });
  }, []);

  const addReservation = useCallback((reservation) => {
    const newReservation = { ...reservation, id: Date.now(), createdAt: new Date().toISOString() };
    setReservations(prev => [...prev, newReservation]);
    return newReservation;
  }, []);

  const updateReservation = useCallback((id, data) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
  }, []);

  const deleteReservation = useCallback((id) => {
    setReservations(prev => prev.filter(r => r.id !== id));
  }, []);
  


  
  const contextValue = useMemo(() => ({
    products,
    sales,
    purchases,
    clients,
    caja,
    users,
    addProduct,
    updateProduct,
    deleteProduct, deleteProducts,
    deleteAllProducts,
    clearAllData,
    loadDemoData,
    updateGlobalMargin,
    batchImportProducts,
    addSale,
    addPurchase,
    updatePurchase,
    addClient,
    updateClient,
    deleteClient,
    addUser,
    updateUser,
    deleteUser,
    updateCaja,
    payDebt,
    shifts,
    closeCajaAndSaveShift,
    categoryTree,
    updateCategoryTree: setCategoryTree,
    suppliers,
    setSuppliers,
    businessConfig,
    updateBusinessConfig: setBusinessConfig,
    completeOnboarding,
    reservations,
    addReservation,
    updateReservation,
    deleteReservation,
    checkoutReservation,
    setCheckoutReservation
  }), [
    products, sales, purchases, clients, caja, users, categoryTree, suppliers, businessConfig, shifts, reservations, checkoutReservation,
    addProduct, updateProduct, deleteProduct, deleteProducts, deleteAllProducts, clearAllData, loadDemoData, updateGlobalMargin, batchImportProducts, addSale, addPurchase, updatePurchase, addClient, updateClient, deleteClient, addUser, updateUser, deleteUser, updateCaja, payDebt, closeCajaAndSaveShift, completeOnboarding, addReservation, updateReservation, deleteReservation
  ]);

  return contextValue;
};
