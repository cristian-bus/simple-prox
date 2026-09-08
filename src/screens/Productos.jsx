import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, Download, Upload, Package, MoreHorizontal, ArrowLeft, Shuffle, Settings, Save, X, Edit2, Trash2, Plus, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle, Bell, Eye } from 'lucide-react';
import { NICHES } from '../utils/mockData';
import * as xlsx from 'xlsx';

const formatCur = (num) => `$ ${num.toLocaleString('es-AR')}`;

const ProductSearchDropdown = ({ value, onChange, products }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const getServiceStock = (prod) => {
    if (!prod.components || prod.components.length === 0) return 'N/A';
    let minServiceStock = Infinity;
    let hasValidComponent = false;
    prod.components.forEach(comp => {
      if (!comp.productId) return;
      const compProduct = products.find(pr => pr.id === comp.productId || pr.id === Number(comp.productId));
      if (compProduct) {
        hasValidComponent = true;
        const possibleStock = Math.floor(compProduct.stock / (comp.qty || 1));
        if (possibleStock < minServiceStock) {
          minServiceStock = possibleStock;
        }
      }
    });
    return hasValidComponent ? `${minServiceStock === Infinity ? 0 : minServiceStock} u` : 'N/A';
  };

  const selectedProduct = products.find(p => p.id === value?.toString() || p.id === value);
  const displayValue = open ? search : (selectedProduct ? `${selectedProduct.name} (${formatCur(selectedProduct.price || 0)})` : '');

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input 
           type="text" 
           className="input" 
           placeholder="Buscar producto por nombre o código..." 
           value={displayValue}
           onChange={e => { setSearch(e.target.value); setOpen(true); if(value) onChange(''); }}
           onFocus={() => { setOpen(true); setSearch(''); }}
           onBlur={() => setTimeout(() => setOpen(false), 200)}
           style={{ padding: '10px 12px 10px 36px', backgroundColor: 'var(--color-surface)', width: '100%' }}
        />
        {displayValue && <button className="search-clear" onMouseDown={(e) => { e.preventDefault(); setSearch(''); onChange(''); }}><X size={16} /></button>}
      </div>
      {open && search.trim().length > 0 && (
         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, backgroundColor: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px' }}>
            {products.filter(p => !p.isCombo && (p.name.toLowerCase().startsWith(search.toLowerCase()) || (p.code && p.code.startsWith(search)))).slice(0, 20).map(p => (
               <div 
                 key={p.id} 
                 style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f3f5' }} 
                 onMouseDown={() => { onChange(p.id); setOpen(false); }}
                 onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                 onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
               >
                 <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1f36' }}>{p.name} ({formatCur(p.price || 0)})</div>
                 <div style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Cód: {p.code || p.sku} • Stock: {p.isService ? getServiceStock(p) : p.stock}</div>
               </div>
            ))}
            {products.filter(p => !p.isCombo && (p.name.toLowerCase().startsWith(search.toLowerCase()) || (p.code && p.code.startsWith(search)))).length === 0 && (
               <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                 No se encontraron productos
               </div>
            )}
         </div>
      )}
    </div>
  );
};

const Modal = ({ title, onClose, children, minWidth }) => (
  <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26, 31, 54, 0.6)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: minWidth || 'auto', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', animation: 'scaleIn 0.2s ease-out' }}>
      <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <h3 className="modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1a1f36' }}>{title}</h3>
        <button onClick={onClose} className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="var(--color-text-muted)" /></button>
      </div>
      <div className="modal-body" style={{ padding: '24px' }}>
        {children}
      </div>
    </div>
  </div>
);

const Productos = ({ kiosco }) => {
  const { products, addProduct: saveProduct, updateProduct, deleteProduct, deleteProducts, batchImportProducts, categoryTree, updateCategoryTree, suppliers, setSuppliers, sales = [] } = kiosco;
  
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit'
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [showAlert, setShowAlert] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(null);
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState(null);
  const [importRawData, setImportRawData] = useState({ headers: [], data: [] });
  const [importMapping, setImportMapping] = useState({
    code: '', name: '', cost: '', margin: '', priceFinal: '', stock: '', stockAlert: '', category: '', subcategory: '', supplierId: '', unitType: ''
  });
  const [importOptions, setImportOptions] = useState({
    updateExisting: false,
    updateStock: true
  });
  const fileInputRef = useRef(null);

  const [showTopSellersModal, setShowTopSellersModal] = useState(false);
  const [topSellersTab, setTopSellersTab] = useState('Productos'); // 'Productos' | 'Servicios'
  const [topSellersFilter, setTopSellersFilter] = useState('all'); // 'all', '7days', '30days'
  const hasServices = products.some(p => p.isService);
  const topSellers = React.useMemo(() => {
    if (!showTopSellersModal) return [];
    const counts = {};
    const now = Date.now();
    let cutoff = 0;
    if (topSellersFilter === '7days') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (topSellersFilter === '30days') cutoff = now - 30 * 24 * 60 * 60 * 1000;

    sales.forEach(sale => {
      // sale.date is likely YYYY-MM-DD or ISO string, checking its timestamp
      const saleDate = new Date(sale.date || sale.createdAt).getTime();
      if (!cutoff || saleDate >= cutoff) {
        sale.items?.forEach(item => {
          counts[item.id] = (counts[item.id] || 0) + item.qty;
        });
      }
    });
    return products
      .slice()
      .map(p => ({ ...p, totalSold: counts[p.id] || 0 }))
      .filter(p => p.totalSold > 0)
      .sort((a, b) => b.totalSold - a.totalSold);
  }, [sales, products, showTopSellersModal, topSellersFilter]);

  const displayedTopSellers = React.useMemo(() => {
    if (!hasServices) return topSellers.slice(0, 20);
    return topSellers
      .filter(p => topSellersTab === 'Servicios' ? p.isService : !p.isService)
      .slice(0, 20);
  }, [topSellers, topSellersTab, hasServices]);

  const handleExportExcel = () => {
    const exportData = products.map(p => ({
      'Nombre': p.name || '',
      'Código/SKU': p.code || p.sku || '',
      'Costo': p.cost || 0,
      'Margen (%)': p.margin || 0,
      'Precio Final': p.price || p.priceFinal || 0,
      'Stock': p.stock || 0,
      'Stock Alerta': p.stockAlert || 0,
      'Categoría': (p.isCombo ? 'Combos - ' : '') + (p.category || ''),
      'Subcategoría': p.subcategory || '',
      'Proveedor': p.supplierId || '',
      'Tipo de Unidad': p.unitType || 'Unitario'
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Productos");
    
    xlsx.writeFile(workbook, "Inventario_Simple_ProX.xls", { bookType: 'biff8' });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = xlsx.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = xlsx.utils.sheet_to_json(ws, { defval: '' });

        if (data.length === 0) throw new Error("El archivo está vacío");
        
        // Extract unique headers
        const headers = Array.from(new Set(data.flatMap(row => Object.keys(row))));
        
        setImportRawData({ headers, data });
        
        const autoMap = (possibleNames) => {
          return headers.find(h => possibleNames.some(p => h.toLowerCase().includes(p.toLowerCase()))) || '';
        };
        
        setImportMapping({
          code: autoMap(['código', 'codigo', 'sku']),
          name: autoMap(['nombre', 'descrip']),
          cost: autoMap(['costo']),
          margin: autoMap(['margen', 'ganancia']),
          priceFinal: autoMap(['precio final', 'venta']),
          stock: autoMap(['stock', 'cantidad', 'inventario']),
          stockAlert: autoMap(['alerta', 'mínimo', 'minimo']),
          category: autoMap(['categoría', 'categoria', 'departamento']),
          subcategory: autoMap(['subcategoría', 'subcategoria', 'rubro']),
          supplierId: autoMap(['proveedor']),
          unitType: autoMap(['unidad', 'tipo'])
        });

        setShowMappingModal(true);
      } catch (error) {
        setAlertMessage("Error al leer el archivo Excel. Asegúrate de que el formato sea correcto.");
        setShowAlert(true);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const processMapping = () => {
    let nuevos = 0;
    let actualizados = 0;
    let procesados = [];

    importRawData.data.forEach(row => {
      const sku = (importMapping.code ? row[importMapping.code] : '').toString().trim();
      const nombre = (importMapping.name ? row[importMapping.name] : '').toString().trim();
      
      if (!nombre) return;

      const isExisting = sku && products.some(p => 
        (p.code && p.code === sku) || 
        (p.sku && p.sku === sku)
      );

      if (isExisting) {
        if (!importOptions.updateExisting) return; // Skip if user chose not to update
        actualizados++;
      } else {
        nuevos++;
      }

      let newProd = {
        name: nombre,
        code: sku,
        sku: sku,
        isActive: true,
        isCombo: false,
        isExisting // tag to use it in confirmImport
      };

      const parseNum = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        let str = val.toString().trim().replace(/[^\d.,-]/g, '');
        const hasComma = str.includes(',');
        const hasDot = str.includes('.');
        
        if (hasComma && hasDot) {
          const lastComma = str.lastIndexOf(',');
          const lastDot = str.lastIndexOf('.');
          if (lastComma > lastDot) {
            str = str.replace(/\./g, '').replace(',', '.');
          } else {
            str = str.replace(/,/g, '');
          }
        } else if (hasComma) {
          const commaCount = (str.match(/,/g) || []).length;
          if (commaCount > 1) {
            str = str.replace(/,/g, '');
          } else {
            str = str.replace(',', '.');
          }
        } else if (hasDot) {
          const dotCount = (str.match(/\./g) || []).length;
          if (dotCount > 1) {
            str = str.replace(/\./g, '');
          }
        }
        
        const parsed = parseFloat(str);
        return isNaN(parsed) ? 0 : parsed;
      };

      if (importMapping.cost) newProd.cost = parseNum(row[importMapping.cost]);
      else if (!isExisting) newProd.cost = 0;

      if (importMapping.margin) newProd.margin = parseNum(row[importMapping.margin]);
      else if (!isExisting) newProd.margin = 0;

      if (importMapping.priceFinal) newProd.price = parseNum(row[importMapping.priceFinal]);
      else if (!isExisting) newProd.price = 0;

      if (newProd.cost > 0 && newProd.price > 0 && (!importMapping.margin || newProd.margin === 0)) {
        newProd.margin = parseFloat((((newProd.price - newProd.cost) / newProd.cost) * 100).toFixed(2));
      }

      if (importMapping.stockAlert) newProd.stockAlert = parseNum(row[importMapping.stockAlert]);
      else if (!isExisting) newProd.stockAlert = 0;

      if (importMapping.category) newProd.category = row[importMapping.category] || '📦 Alimentos';
      else if (!isExisting) newProd.category = '📦 Alimentos';

      if (importMapping.subcategory) newProd.subcategory = row[importMapping.subcategory] || 'Sin categorizar';
      else if (!isExisting) newProd.subcategory = 'Sin categorizar';

      if (importMapping.supplierId) newProd.supplierId = row[importMapping.supplierId] || 'Sin proveedor';
      else if (!isExisting) newProd.supplierId = 'Sin proveedor';

      if (importMapping.unitType) newProd.unitType = row[importMapping.unitType] || 'Unitario';
      else if (!isExisting) newProd.unitType = 'Unitario';

      if (importOptions.updateStock) {
        if (importMapping.stock) newProd.stock = parseNum(row[importMapping.stock]);
        else if (!isExisting) newProd.stock = 0;
      } else if (!isExisting) {
        newProd.stock = 0; // Default to 0 for new products if stock update is off
      }

      procesados.push(newProd);
    });

    setImportPreviewData({
      total: importRawData.data.length,
      validos: procesados.length,
      nuevos,
      actualizados,
      productos: procesados,
      updateExisting: importOptions.updateExisting,
      updateStock: importOptions.updateStock
    });
    
    setShowMappingModal(false);
    setShowImportModal(true);
  };

  const confirmImport = () => {
    if (!importPreviewData) return;

    const limit = kiosco.businessConfig?.plan === 'Básico' ? 1000 : 2500;
    if (products.length + importPreviewData.nuevos > limit) {
      setAlertMessage(`No puedes importar. Excedes el límite de ${limit} productos de tu plan actual.`);
      setShowAlert(true);
      setShowImportModal(false);
      return;
    }

    const cleanProducts = importPreviewData.productos.map(p => {
      const { isExisting, ...rest } = p;
      return rest;
    });

    batchImportProducts(cleanProducts);
    setShowImportModal(false);
    setImportPreviewData(null);
  };

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
  
  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [filterSubcategory, setFilterSubcategory] = useState('Todas');
  const [filterStatus, setFilterStatus] = useState('Todos'); // 'Todos' | 'Activo' | 'Inactivo'
  const [filterType, setFilterType] = useState('Todos'); // 'Todos' | 'Productos' | 'Combos'
  const [filterMarca, setFilterMarca] = useState('Todas');
  const [productToDelete, setProductToDelete] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', email: '', address: '' });
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [editSupplier, setEditSupplier] = useState({ name: '', phone: '', email: '', address: '' });

  // Category management states
  const [newCatName, setNewCatName] = useState('');
  const [editingCatName, setEditingCatName] = useState(null);
  const [catEditValue, setCatEditValue] = useState('');
  const [selectedCatForSubs, setSelectedCatForSubs] = useState(null);
  const [newSubName, setNewSubName] = useState('');

  const [comboData, setComboData] = useState({
    name: '',
    sku: '',
    category: '🍞 Alimentos',
    subcategory: 'Panificados',
    isActive: true,
    margin: '',
    cost: '',
    priceFinal: '',
    stock: '',
    stockAlert: '',
    components: [{ id: Date.now(), productId: '', qty: 1 }]
  });

  const handleComboInputChange = (field, value) => {
    setComboData(prev => {
      const newData = { ...prev, [field]: value };
      if (field === 'margin' || field === 'cost') {
        const cost = parseFloat(newData.cost);
        const margin = parseFloat(newData.margin) || 0;
        newData.priceFinal = isNaN(cost) ? '' : (cost * (1 + margin / 100)).toFixed(2);
      } else if (field === 'priceFinal') {
        const final = parseFloat(newData.priceFinal);
        const cost = parseFloat(newData.cost);
        if (!isNaN(final) && !isNaN(cost) && cost > 0) {
           newData.margin = (((final / cost) - 1) * 100).toFixed(2);
        } else {
           newData.margin = '';
        }
      }
      return newData;
    });
  };

  useEffect(() => {
    const hasValidComponent = comboData.components.some(c => c.productId);
    if (!hasValidComponent) return;

    const newCost = comboData.components.reduce((acc, comp) => {
      if (!comp.productId) return acc;
      const prod = products.find(p => p.id === comp.productId || p.id === comp.productId.toString());
      if (!prod || !prod.cost) return acc;
      return acc + (parseFloat(prod.cost) * parseFloat(comp.qty || 1));
    }, 0);
    
    // Evitar loop infinito comparando con 2 decimales
    const currentCost = parseFloat(comboData.cost || 0).toFixed(2);
    const calculatedCost = newCost.toFixed(2);
    
    if (calculatedCost !== currentCost && newCost > 0) {
      handleComboInputChange('cost', calculatedCost);
    }
  }, [comboData.components, products]);

  const generateComboSKU = () => {
    handleComboInputChange('sku', 'COMBO-' + Math.floor(100 + Math.random() * 900).toString());
  };

  const addComboComponent = () => {
    setComboData(prev => ({
      ...prev,
      components: [...prev.components, { id: Date.now(), productId: '', qty: 1 }]
    }));
  };

  const updateComboComponent = (id, field, value) => {
    setComboData(prev => ({
      ...prev,
      components: prev.components.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  const removeComboComponent = (id) => {
    setComboData(prev => ({
      ...prev,
      components: prev.components.filter(c => c.id !== id)
    }));
  };

  const handleSaveCombo = () => {
    if (!comboData.name || !comboData.sku || comboData.components.length === 0) {
      setAlertMessage("Por favor completa el nombre, el código/SKU y selecciona al menos un producto.");
      setShowAlert(true);
      return;
    }

    if (kiosco.businessConfig?.plan === 'Básico' && products.length >= 500) {
      setAlertMessage("Has alcanzado el límite de 500 productos de tu Plan Básico. Por favor, mejora al Plan Pro para agregar más productos.");
      setShowAlert(true);
      return;
    }

    if (kiosco.businessConfig?.plan === 'Pro' && products.length >= 2500) {
      setAlertMessage("Has alcanzado el límite de 2500 productos de tu Plan Pro.");
      setShowAlert(true);
      return;
    }
    
    const isDuplicate = products.some(p => 
      (p.code === comboData.sku || p.sku === comboData.sku) && 
      p.id !== editingId
    );
    if (isDuplicate) {
      setAlertMessage("Ese código/SKU ya está en uso. Por favor ingresa uno nuevo para evitar repetidos.");
      setShowAlert(true);
      return;
    }

    const isDuplicateName = products.some(p => 
      p.name?.trim().toLowerCase() === comboData.name.trim().toLowerCase() && 
      p.id !== editingId
    );
    if (isDuplicateName) {
      setAlertMessage("Ya existe un producto o combo con ese mismo nombre. Por favor elige otro para evitar duplicados.");
      setShowAlert(true);
      return;
    }
    
    const newCombo = {
      ...comboData,
      price: parseFloat(comboData.priceFinal) || 0,
      code: comboData.sku,
      category: comboData.category,
      subcategory: comboData.subcategory,
      isCombo: true,
      stock: parseFloat(comboData.stock) || 0,
      stockAlert: parseFloat(comboData.stockAlert) || 5

    };

    if (editingId) {
      updateProduct(editingId, newCombo);
    } else {
      saveProduct(newCombo);
    }
    
    setEditingId(null);
    setComboData({
      name: '',
      sku: '',
      category: '🍞 Alimentos',
      subcategory: 'Panificados',
      isActive: true,
      margin: '',
      cost: '',
      priceFinal: '',
      stock: '',
      stockAlert: '',
      components: [{ id: Date.now(), productId: '', qty: 1 }]
    });
    
    setView('list');
  };

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '🍞 Alimentos',
    subcategory: 'Panificados',
    supplierId: 'Sin proveedor',
    unitType: 'Unitario',
    isActive: true,
    stock: '',
    stockAlert: '',
    expirationDate: '',
    margin: '',
    cost: '',
    priceFinal: '',
    isService: false,
    components: []
  });

  const addServiceComponent = () => {
    setFormData(prev => ({
      ...prev,
      components: [...(prev.components || []), { id: Date.now(), productId: '', qty: 1 }]
    }));
  };

  const updateServiceComponent = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      components: (prev.components || []).map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  const removeServiceComponent = (id) => {
    setFormData(prev => ({
      ...prev,
      components: (prev.components || []).filter(c => c.id !== id)
    }));
  };

  const [editingId, setEditingId] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto logic for pricing
      if (field === 'margin' || field === 'cost') {
        const cost = parseFloat(String(newData.cost).replace(',', '.'));
        
        if (field === 'cost' && newData.margin === '' && newData.priceFinal !== '') {
          const final = parseFloat(String(newData.priceFinal).replace(',', '.'));
          if (!isNaN(final) && !isNaN(cost) && cost > 0) {
            newData.margin = (((final / cost) - 1) * 100).toFixed(2);
          }
        } else {
          const margin = parseFloat(String(newData.margin).replace(',', '.')) || 0;
          newData.margin = margin;
          newData.priceFinal = isNaN(cost) ? '' : (cost * (1 + margin / 100)).toFixed(2);
        }
      } else if (field === 'priceFinal') {
        const final = parseFloat(String(newData.priceFinal).replace(',', '.'));
        const cost = parseFloat(String(newData.cost).replace(',', '.'));
        if (!isNaN(final) && !isNaN(cost) && cost > 0) {
           newData.margin = (((final / cost) - 1) * 100).toFixed(2);
        } else {
           newData.margin = '';
        }
      }
      return newData;
    });
  };

  const generateSKU = () => {
    handleInputChange('sku', Math.floor(100000 + Math.random() * 900000).toString());
  };

  const handleAddSupplier = () => {
    if (newSupplier.name.trim() === '') return;
    const newName = newSupplier.name.trim();
    setSuppliers([...suppliers, { id: Date.now(), ...newSupplier, name: newName }]);
    handleInputChange('supplierId', newName);
    setNewSupplier({ name: '', phone: '', email: '', address: '' });
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
      const affected = products.filter(p => p.supplierId === supToDelete.name);
      affected.forEach(p => updateProduct(p.id, { supplierId: 'Sin proveedor' }));
    }
    setSuppliers(suppliers.filter(s => s.id !== id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) {
      setAlertMessage("No se ha seleccionado ningún producto.");
      setShowAlert(true);
      return;
    }
    
    if (window.confirm(`¿Estás seguro que deseas eliminar los ${selectedIds.length} productos seleccionados?`)) {
      deleteProducts(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm("¿Estás seguro que deseas eliminar TODOS los productos del inventario? Esta acción no se puede deshacer y dejará tu base de datos en 0.")) {
      kiosco.deleteAllProducts();
    }
  };

  const handleSaveProduct = () => {
    if (!formData.name || !formData.sku) return;

    if (!editingId && kiosco.businessConfig?.plan === 'Básico' && products.length >= 500) {
      setAlertMessage("Has alcanzado el límite de 500 productos de tu Plan Básico. Por favor, mejora al Plan Pro para agregar más productos.");
      setShowAlert(true);
      return;
    }

    if (!editingId && kiosco.businessConfig?.plan === 'Pro' && products.length >= 2500) {
      setAlertMessage("Has alcanzado el límite de 2500 productos de tu Plan Pro.");
      setShowAlert(true);
      return;
    }
    
    const isDuplicate = products.some(p => 
      (p.code === formData.sku || p.sku === formData.sku) && 
      p.id !== editingId
    );
    
    if (isDuplicate) {
      setAlertMessage("Ese código/SKU ya está en uso por otro producto. Por favor genera o ingresa uno único.");
      setShowAlert(true);
      return;
    }

    const isDuplicateName = products.some(p => 
      p.name?.trim().toLowerCase() === formData.name.trim().toLowerCase() && 
      p.id?.toString() !== editingId?.toString()
    );
    
    if (isDuplicateName) {
      setAlertMessage("Ya existe un producto o combo con ese mismo nombre. Por favor elige otro para evitar duplicados.");
      setShowAlert(true);
      return;
    }

    const originalProduct = editingId ? products.find(p => p.id === editingId) : null;
    const isNewDate = originalProduct ? (formData.expirationDate !== (originalProduct.expirationDate || '')) : true;

    const productData = {
      ...formData,
      price: parseFloat(formData.priceFinal) || 0,
      code: formData.sku,
      category: formData.category,
      subcategory: formData.subcategory,
      dismissExpirationAlert: isNewDate ? false : (formData.dismissExpirationAlert || false)
    };

    if (editingId) {
      updateProduct(editingId, productData);
    } else {
      saveProduct(productData);
    }

    resetForm();
    setView('list');
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: '🍞 Alimentos',
      subcategory: 'Panificados',
      brand: '',
      presentation: 'Unidad',
      supplierId: 'Sin proveedor',
      unitType: 'Unitario',
      isActive: true,
      stock: '',
      stockAlert: '',
      expirationDate: '',
      margin: '',
      cost: '',
      priceFinal: '',
      dismissExpirationAlert: false,
      isService: false,
      components: []
    });
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    
    // Calcular el margen si existe el costo y el precio final
    let calcMargin = '';
    if (product.price && product.cost && product.cost > 0) {
       calcMargin = (((product.price / product.cost) - 1) * 100).toFixed(2);
    }

    if (product.isCombo) {
      setComboData({
        name: product.name,
        sku: product.code || product.sku,
        category: product.category || '🍞 Alimentos',
        subcategory: product.subcategory || 'Panificados',
        isActive: product.isActive !== undefined ? product.isActive : true,
        margin: calcMargin,
        cost: product.cost !== undefined ? product.cost : '',
        priceFinal: product.price !== undefined ? product.price : '',
        stock: product.stock !== undefined ? parseFloat(Number(product.stock).toFixed(3)) : '',
        stockAlert: product.stockAlert !== undefined ? parseFloat(Number(product.stockAlert).toFixed(3)) : '',
        components: product.components || [{ id: Date.now(), productId: '', qty: 1 }]
      });
      setView('createCombo');
      return;
    }

    setFormData({
      name: product.name,
      sku: product.code || product.sku,
      description: product.description || '',
      category: product.category || '🍞 Alimentos',
      subcategory: product.subcategory || 'Panificados',
      brand: product.brand || '',
      presentation: product.presentation || 'Unidad',
      supplierId: product.supplierId || 'Sin proveedor',
      unitType: product.unitType || 'Unitario',
      isActive: product.isActive !== undefined ? product.isActive : true,
      stock: product.stock !== undefined ? parseFloat(Number(product.stock).toFixed(3)) : '',
      stockAlert: product.stockAlert !== undefined ? parseFloat(Number(product.stockAlert).toFixed(3)) : '',
      expirationDate: product.expirationDate || '',
      margin: calcMargin,
      cost: product.cost !== undefined ? product.cost : '',
      priceFinal: product.price !== undefined ? product.price : '',
      dismissExpirationAlert: product.dismissExpirationAlert || false,
      isService: product.isService || false,
      components: product.components || []
    });
    setView('create');
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.code && p.code.includes(searchTerm)) || 
                          (p.sku && p.sku.includes(searchTerm));
    const matchesCategory = filterCategory === 'Todas' || p.category === filterCategory;
    const matchesSubcategory = filterSubcategory === 'Todas' || p.subcategory === filterSubcategory;
    const matchesStatus = filterStatus === 'Todos' || 
                          (filterStatus === 'Activo' && p.isActive) || 
                          (filterStatus === 'Inactivo' && !p.isActive);
    const matchesType = filterType === 'Todos' || 
                        (filterType === 'Combos' && p.isCombo) || 
                        (filterType === 'Servicios' && p.isService) ||
                        (filterType === 'Productos' && !p.isCombo && !p.isService);
    const matchesMarca = filterMarca === 'Todas' || (p.brand && p.brand === filterMarca);
    
    return matchesSearch && matchesCategory && matchesSubcategory && matchesStatus && matchesType && matchesMarca;
  });

  const marcasDisponibles = Array.from(new Set(products.filter(p => p.brand).map(p => p.brand))).sort();

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const currentPageSafe = Math.min(currentPage, totalPages > 0 ? totalPages : 1);
  const paginatedProducts = filteredProducts.slice((currentPageSafe - 1) * ITEMS_PER_PAGE, currentPageSafe * ITEMS_PER_PAGE);


  const renderAlertOverlay = () => {
    if (!showAlert) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowAlert(false)} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(250, 187, 5, 0.1)', marginBottom: '16px' }}>
              <AlertTriangle size={28} color="#fabb05" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>Atención</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              {alertMessage}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn btn-primary" style={{ padding: '12px 32px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setShowAlert(false)}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSupplierModal = () => {
    if (!showSupplierModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowSupplierModal(false)} style={{ zIndex: 2000 }}>
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
                          <button className="btn" onClick={() => handleDeleteSupplier(sup.id)} style={{ padding: '8px', backgroundColor: '#ff6b6b', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
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

  const renderCategoryModal = () => {
    if (!showCategoryModal) return null;
    
    const categories = Object.keys(categoryTree);
    
    return (
      <div className="modal-overlay" onClick={() => setShowCategoryModal(false)} style={{ zIndex: 1000 }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '500px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 10 }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Gestionar Categorías</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                onClick={() => {
                  if (window.confirm("¿Restaurar las categorías por defecto de tu rubro? Se perderán las creadas manualmente.")) {
                    const defaultCats = NICHES[kiosco.businessConfig?.businessType || 'kiosco']?.categories || NICHES['kiosco'].categories;
                    updateCategoryTree(defaultCats);
                  }
                }} 
                className="btn btn-link" 
                style={{ fontSize: '13px', color: '#ff6b6b', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Restaurar categorías de fábrica"
              >
                <RotateCcw size={14} /> Restaurar
              </button>
              <button onClick={() => setShowCategoryModal(false)} className="btn-icon">
                <X size={20} color="var(--color-text-muted)" />
              </button>
            </div>
          </div>
          
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Nueva Categoría Principal</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="input" 
                  placeholder={kiosco.businessConfig?.businessType === 'petshop' ? "Ej: 🧸 Juguetes" : (kiosco.businessConfig?.businessType === 'libreria' ? "Ej: ✂️ Útiles Escolares" : (kiosco.businessConfig?.businessType === 'barberia' ? "Ej: 🧴 Cosmética Capilar" : "Ej: 🥐 Panadería"))} 
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCatName.trim()) {
                      updateCategoryTree({ ...categoryTree, [newCatName.trim()]: [] });
                      setNewCatName('');
                    }
                  }}
                />
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    if (newCatName.trim()) {
                      updateCategoryTree({ ...categoryTree, [newCatName.trim()]: [] });
                      setNewCatName('');
                    }
                  }}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categories.map(cat => (
                <div key={cat} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {editingCatName === cat ? (
                      <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                        <input 
                          autoFocus
                          className="input" 
                          value={catEditValue} 
                          onChange={e => setCatEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const newName = catEditValue.trim();
                              if (newName && newName !== cat) {
                                const newTree = { ...categoryTree };
                                newTree[newName] = newTree[cat];
                                delete newTree[cat];
                                updateCategoryTree(newTree);
                              }
                              setEditingCatName(null);
                            }
                          }}
                        />
                        <button className="btn btn-primary" style={{ backgroundColor: '#28a745', padding: '0 8px' }} onClick={() => {
                          const newName = catEditValue.trim();
                          if (newName && newName !== cat) {
                            const newTree = { ...categoryTree };
                            newTree[newName] = newTree[cat];
                            delete newTree[cat];
                            updateCategoryTree(newTree);
                          }
                          setEditingCatName(null);
                        }}><Save size={16} /></button>
                      </div>
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>{cat}</div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon" onClick={() => {
                        setEditingCatName(cat);
                        setCatEditValue(cat);
                      }}><Edit2 size={14} /></button>
                      <button className="btn-icon" style={{ color: '#dc3545' }} onClick={() => {
                        const newTree = { ...categoryTree };
                        delete newTree[cat];
                        updateCategoryTree(newTree);
                      }}><Trash2 size={14} /></button>
                      <button className="btn-icon" onClick={() => setSelectedCatForSubs(selectedCatForSubs === cat ? null : cat)}>
                        {selectedCatForSubs === cat ? <ChevronLeft size={16} /> : <Plus size={16} />}
                      </button>
                    </div>
                  </div>
                  
                  {selectedCatForSubs === cat && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-muted)' }}>Subcategorías</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {(Array.isArray(categoryTree[cat]) ? categoryTree[cat] : []).map((sub, idx) => (
                          <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: '#eef2f6', borderRadius: '4px', fontSize: '12px' }}>
                            {sub}
                            <X size={10} style={{ cursor: 'pointer' }} onClick={() => {
                              const newTree = { ...categoryTree };
                              newTree[cat] = newTree[cat].filter(s => s !== sub);
                              updateCategoryTree(newTree);
                            }} />
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          className="input" 
                          placeholder="Nueva subcategoría" 
                          style={{ padding: '6px 10px', fontSize: '13px' }}
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newSubName.trim()) {
                              const newTree = { ...categoryTree };
                              newTree[cat] = [...newTree[cat], newSubName.trim()];
                              updateCategoryTree(newTree);
                              setNewSubName('');
                            }
                          }}
                        />
                        <button className="btn btn-outline" style={{ padding: '0 8px' }} onClick={() => {
                           if (newSubName.trim()) {
                            const newTree = { ...categoryTree };
                            newTree[cat] = [...newTree[cat], newSubName.trim()];
                            updateCategoryTree(newTree);
                            setNewSubName('');
                          }
                        }}><Plus size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

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

  const renderMappingModal = () => {
    if (!showMappingModal || !importRawData.data.length) return null;

    const fields = [
      { key: 'code', label: 'Código de Producto / SKU' },
      { key: 'name', label: 'Nombre o Descripción' },
      { key: 'cost', label: 'Precio Costo' },
      { key: 'priceFinal', label: 'Precio Venta (Final)' },
      { key: 'margin', label: 'Margen de Ganancia (%)' },
      { key: 'category', label: 'Categoría' },
      { key: 'subcategory', label: 'Subcategoría' },
      { key: 'stock', label: 'Cantidad en Inventario' },
      { key: 'stockAlert', label: 'Stock Alerta (Mínimo)' },
      { key: 'unitType', label: 'Tipo de Unidad' },
      { key: 'supplierId', label: 'Proveedor' }
    ];

    const previewData = importRawData.data.slice(0, 5);

    return (
      <Modal title="IMPORTAR PRODUCTOS DESDE EXCEL" onClose={() => setShowMappingModal(false)} minWidth="90vw">
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 4px 0', color: '#1a1f36', fontSize: '16px' }}>Especificar valores de columnas</h4>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '13px' }}>
            Por favor define en qué columna se encuentra cada valor para ingresarlo al sistema.
          </p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Columna Izquierda: Selectores */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderBottom: '1px solid #e9ecef', paddingBottom: '8px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', textAlign: 'right', paddingRight: '8px' }}>Campo del Sistema</span>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>Columna en Archivo</span>
            </div>
            
            {fields.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ flex: '1', textAlign: 'right', fontSize: '13px', color: '#495057' }}>{f.label}</span>
                <select 
                  className="input" 
                  style={{ flex: '1.2', padding: '6px 8px', fontSize: '13px' }}
                  value={importMapping[f.key]}
                  onChange={e => setImportMapping({ ...importMapping, [f.key]: e.target.value })}
                >
                  <option value="">-- No Importar --</option>
                  {importRawData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}

            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={importOptions.updateExisting}
                  onChange={e => setImportOptions({ ...importOptions, updateExisting: e.target.checked })}
                />
                Actualizar productos cuyo código ya exista
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={importOptions.updateStock}
                  onChange={e => setImportOptions({ ...importOptions, updateStock: e.target.checked })}
                />
                Actualizar el inventario del producto
              </label>
            </div>
          </div>

          {/* Columna Derecha: Vista previa */}
          <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', padding: '12px' }}>
            <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: '#1a1f36' }}>
              Contenido del Archivo (Vista previa de {previewData.length} filas)
            </div>
            <table className="table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  {importRawData.headers.map(h => (
                    <th key={h} style={{ padding: '8px', whiteSpace: 'nowrap', backgroundColor: '#f1f3f5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, idx) => (
                  <tr key={idx}>
                    {importRawData.headers.map(h => (
                      <td key={h} style={{ padding: '8px', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f3f5' }}>{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e9ecef' }}>
          <button className="btn btn-outline" onClick={() => setShowMappingModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={processMapping}>Siguiente &gt;</button>
        </div>
      </Modal>
    );
  };

  const renderImportModal = () => {
    if (!showImportModal || !importPreviewData) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowImportModal(false)} style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(59, 91, 219, 0.1)', marginBottom: '16px' }}>
              <Upload size={28} color="#3b5bdb" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>Importar Productos</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
              Revisá el resumen antes de importar.
            </p>
          </div>
          
          <div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, color: '#1a1f36', fontSize: '14px' }}>Productos Nuevos:</span>
              <span style={{ fontWeight: 700, color: '#34a853', fontSize: '14px' }}>{importPreviewData.nuevos}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#1a1f36', fontSize: '14px' }}>Productos a Actualizar:</span>
              <span style={{ fontWeight: 700, color: '#fabb05', fontSize: '14px' }}>{importPreviewData.actualizados}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px solid #e9ecef', paddingTop: '8px' }}>
              <span style={{ fontWeight: 600, color: '#1a1f36', fontSize: '14px' }}>Total Válidos:</span>
              <span style={{ fontWeight: 700, color: '#1a1f36', fontSize: '14px' }}>{importPreviewData.validos}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setShowImportModal(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, border: 'none' }} onClick={confirmImport}>
              Confirmar Importación
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCreateComboModal = () => {
    if (view !== 'createCombo') return null;
    return (
      <Modal title="Agregar combo" onClose={() => setView('list')} minWidth="700px">
        <div style={{ padding: '0 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>NOMBRE</label>
              <input type="text" className="input" placeholder={kiosco.businessConfig?.businessType === 'libreria' ? "Ej: Kit escolar inicial" : (kiosco.businessConfig?.businessType === 'petshop' ? "Ej: Combo baño + corte" : (kiosco.businessConfig?.businessType === 'barberia' ? "Ej: Promo Corte + Barba" : "Ej: Combo fernet + coca"))} value={comboData.name} onChange={e => handleComboInputChange('name', e.target.value)} style={{ padding: '12px', borderRadius: '8px' }} />
            </div>
            <div>
              <label htmlFor="sku_input_combo" style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>CÓDIGO</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input id="sku_input_combo" type="text" className="input" placeholder="Ej: COMBO-001" value={comboData.sku} onChange={e => handleComboInputChange('sku', e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', borderColor: (comboData.sku && products.some(p => p.code === comboData.sku || p.sku === comboData.sku)) ? '#ea4335' : '' }}/>
                {!editingId && <button className="btn btn-outline" style={{ padding: '0 12px', borderRadius: '8px' }} onClick={generateComboSKU} type="button" title="Generar código aleatorio"><Shuffle size={16} /></button>}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>CATEGORÍA</label>
<select className="input" value={comboData.category} onChange={e => {
                const newCat = e.target.value;
                handleComboInputChange('category', newCat);
                handleComboInputChange('subcategory', categoryTree[newCat]?.[0] || 'Sin categorizar');
              }} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                 {Object.keys(categoryTree).map(cat => (
                   <option key={cat} value={cat}>{cat}</option>
                 ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>SUBCATEGORÍA</label>
<select className="input" value={comboData.subcategory} onChange={e => handleComboInputChange('subcategory', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                 {(categoryTree[comboData.category] || []).map(sub => (
                   <option key={sub} value={sub}>{sub}</option>
                 ))}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>COSTO ($)</label>
<input type="text" className="input" placeholder="Automático" value={comboData.cost} disabled title="El costo se suma automáticamente al agregar componentes" style={{ padding: '12px', borderRadius: '8px', width: '100%', backgroundColor: '#f1f3f5', color: '#6c757d', cursor: 'not-allowed' }} />
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px' }}>Se reflejará al agregar los productos</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>% GANANCIA</label>
<input type="text" inputMode="decimal" className="input" placeholder="Margen" value={comboData.margin} onChange={e => handleComboInputChange('margin', e.target.value)} step="0.01" onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px', width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>PRECIO VENTA ($)</label>
<input type="text" inputMode="decimal" className="input" placeholder="Lo que cobrás" value={comboData.priceFinal} onChange={e => handleComboInputChange('priceFinal', e.target.value)} step="0.01" onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px', width: '100%' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>STOCK INICIAL</label>
<input type="text" inputMode="decimal" className="input" placeholder="Cuánto tenés" value={comboData.stock} onChange={e => handleComboInputChange('stock', e.target.value)} onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>STOCK MÍNIMO</label>
<input type="number" className="input" placeholder="Aviso de reponer" value={comboData.stockAlert} onChange={e => handleComboInputChange('stockAlert', e.target.value)} onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px' }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', paddingBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color: '#1a1f36', textTransform: 'uppercase' }}>COMPONENTES DEL COMBO</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
               {comboData.components.map((comp, index) => (
                  <div key={comp.id} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <ProductSearchDropdown 
                        value={comp.productId} 
                        onChange={(newId) => updateComboComponent(comp.id, 'productId', newId)}
                        products={products}
                      />
                    </div>
                    <div style={{ width: '120px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="number" className="input" value={comp.qty} onChange={e => updateComboComponent(comp.id, 'qty', e.target.value)} style={{ padding: '12px', borderRadius: '8px' }} />
                        <button className="btn btn-outline" style={{ padding: '0 12px', borderRadius: '8px' }} onClick={() => removeComboComponent(comp.id)}>
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
               ))}
            </div>
            
            <button className="btn" style={{ backgroundColor: '#f1f5f9', border: 'none', fontWeight: 600, color: '#334155', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px' }} onClick={addComboComponent} type="button">
              <Plus size={16} /> Agregar componente
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-outline" style={{ padding: '12px 24px', fontWeight: 600, borderRadius: '8px' }} onClick={() => setView('list')}>Cancelar</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px', fontWeight: 600, borderRadius: '8px', backgroundColor: '#f97316', borderColor: '#f97316' }} onClick={handleSaveCombo}>
               Guardar
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  const renderCreateProductModal = () => {
    if (view !== 'create') return null;
    return (
      <Modal title={editingId ? (formData.isService ? "Editar Servicio" : "Editar Producto") : (formData.isService ? "Agregar Servicio" : "Agregar Producto")} onClose={() => { setView('list'); resetForm(); }} minWidth="700px">
        <div style={{ padding: '0 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label htmlFor="sku_input_prod" style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>CÓDIGO</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input id="sku_input_prod" type="text" className="input" placeholder="Ej: P001" value={formData.sku} onChange={e => handleInputChange('sku', e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', borderColor: (formData.sku && products.some(p => (p.code === formData.sku || p.sku === formData.sku) && p.id !== editingId)) ? '#ea4335' : '' }}/>
                {!editingId && <button className="btn btn-outline" style={{ padding: '0 12px', borderRadius: '8px' }} onClick={generateSKU} type="button" title="Generar código aleatorio"><Shuffle size={16} /></button>}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{formData.isService ? 'TIPO DE SERVICIO (Nombre)' : 'NOMBRE'}</label>
              <input type="text" className="input" placeholder={formData.isService ? (kiosco.businessConfig?.businessType === 'petshop' ? "Ej: Baño y Peluquería" : (kiosco.businessConfig?.businessType === 'barberia' ? "Ej: Corte Clásico" : "Ej: Fotocopia B/N")) : (kiosco.businessConfig?.businessType === 'libreria' ? "Ej: Cuaderno Tapa Dura A4" : (kiosco.businessConfig?.businessType === 'petshop' ? "Ej: Alimento Perro 15kg" : (kiosco.businessConfig?.businessType === 'barberia' ? "Ej: Cera Modeladora" : "Ej: Coca-Cola 1.5L")))} value={formData.name} onChange={e => handleInputChange('name', e.target.value)} style={{ padding: '12px', borderRadius: '8px' }} />
            </div>

            {!formData.isService && (
              <>


            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>CATEGORÍA</label>
<select className="input" value={formData.category} onChange={e => {
                const newCat = e.target.value;
                handleInputChange('category', newCat);
                handleInputChange('subcategory', categoryTree[newCat][0]);
              }} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                 {Object.keys(categoryTree).map(cat => (
                   <option key={cat} value={cat}>{cat}</option>
                 ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>SUBCATEGORÍA</label>
<select className="input" value={formData.subcategory} onChange={e => handleInputChange('subcategory', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                 {categoryTree[formData.category]?.map(sub => (
                   <option key={sub} value={sub}>{sub}</option>
                 ))}
              </select>
            </div>
            
            {(kiosco.businessConfig?.businessType === 'petshop' || kiosco.businessConfig?.businessType === 'libreria') && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>MARCA</label>
                  <input type="text" className="input" placeholder={kiosco.businessConfig?.businessType === 'petshop' ? "Ej: Royal Canin" : "Ej: Faber-Castell"} value={formData.brand || ''} onChange={e => handleInputChange('brand', e.target.value)} style={{ padding: '12px', borderRadius: '8px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>PRESENTACIÓN</label>
                  <select className="input" value={formData.presentation || 'Unidad'} onChange={e => handleInputChange('presentation', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                    {(kiosco.businessConfig?.businessType === 'petshop' ? 
                      ['Unidad', 'Bolsa', 'Lata', 'Pack', 'Caja', 'Blister', 'Frasco', 'Botella', 'Sobre'] :
                      ['Unidad', 'Pack x 3', 'Pack x 6', 'Pack x 12', 'Caja x 12', 'Caja x 50', 'Blíster', 'Resma', 'Paquete']
                    ).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {kiosco.businessConfig?.businessType === 'libreria' && formData.category === '📓 2. CUADERNOS Y CARPETAS' && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>TAMAÑO (Opcional)</label>
                  <select className="input" value={formData.size || ''} onChange={e => handleInputChange('size', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff', width: '100%' }}>
                    <option value="">- Ninguno -</option>
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="A6">A6</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>TIPO (Opcional)</label>
                  <select className="input" value={formData.bookType || ''} onChange={e => handleInputChange('bookType', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff', width: '100%' }}>
                    <option value="">- Ninguno -</option>
                    <option value="Rivadavia">Rivadavia</option>
                    <option value="Espiral">Espiral</option>
                    <option value="Tapa dura">Tapa dura</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>HOJAS (Opcional)</label>
                  <select className="input" value={formData.pages || ''} onChange={e => handleInputChange('pages', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff', width: '100%' }}>
                    <option value="">- Ninguno -</option>
                    <option value="48">48</option>
                    <option value="84">84</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                  </select>
                </div>
              </div>
            )}
            </>
            )}

            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: formData.isService ? '1fr' : '1fr 1fr 1fr', gap: '20px' }}>
              {!formData.isService && (
              <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>COSTO ($)</label>
<input type="text" inputMode="decimal" className="input" placeholder="Lo que te sale" value={formData.cost} onChange={e => handleInputChange('cost', e.target.value)} step="0.01" onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px', width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>% GANANCIA</label>
<input type="text" inputMode="decimal" className="input" placeholder="Margen" value={formData.margin} onChange={e => handleInputChange('margin', e.target.value)} step="0.01" onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px', width: '100%' }} />
              </div>
              </>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>PRECIO VENTA ($)</label>
<input type="text" inputMode="decimal" className="input" placeholder="Lo que cobrás" value={formData.priceFinal} onChange={e => handleInputChange('priceFinal', e.target.value)} step="0.01" onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px', width: '100%' }} />
              </div>
            </div>

            {!formData.isService && (
            <>
            <div>
               <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>UNIDAD DE MEDIDA</label>
<select className="input" value={formData.unitType} onChange={e => handleInputChange('unitType', e.target.value)} style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                 <option value="Unitario">Unidad (u)</option>
                 <option value="Peso (Kg)">Peso (Kg)</option>
                 <option value="Gramos (g)">Gramos (g)</option>
                 <option value="Litro (L)">Litro (L)</option>
               </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>STOCK INICIAL</label>
<input type="number" className="input" placeholder="Cuánto tenés" value={formData.stock} onChange={e => handleInputChange('stock', e.target.value)} onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>STOCK MÍNIMO</label>
<input type="number" className="input" placeholder="Aviso de reponer" value={formData.stockAlert} onChange={e => handleInputChange('stockAlert', e.target.value)} onFocus={e => e.target.select()} style={{ padding: '12px', borderRadius: '8px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>PROVEEDOR</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="input" value={formData.supplierId} onChange={e => handleInputChange('supplierId', e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', backgroundColor: '#fff' }}>
                   <option value="Sin proveedor">Sin proveedor</option>
                   {suppliers.map(sup => (
                     <option key={sup.id} value={sup.name}>{sup.name}</option>
                   ))}
                </select>
                <button className="btn btn-outline" style={{ padding: '0 12px', borderRadius: '8px' }} onClick={() => setShowSupplierModal(true)} type="button" title="Gestionar proveedores">
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>FECHA DE VENCIMIENTO</label>
<input 
                type="date" 
                className="input" 
                value={formData.expirationDate || ''} 
                onChange={e => handleInputChange('expirationDate', e.target.value)} 
                style={{ padding: '12px', borderRadius: '8px', width: '100%', backgroundColor: '#fff' }} 
              />
              {formData.dismissExpirationAlert && (
                <button 
                  className="btn btn-outline" 
                  style={{ marginTop: '12px', fontSize: '13px', width: '100%', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => handleInputChange('dismissExpirationAlert', false)}
                  title="Al hacer clic se volverán a mostrar las notificaciones cuando este producto esté por vencer."
                  type="button"
                >
                  <Bell size={14} />
                  Reactivar Notificación de Vencimiento
                </button>
              )}
            </div>
            </>
            )}
          </div>
          
          {formData.isService && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', paddingBottom: '20px', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color: '#1a1f36', textTransform: 'uppercase' }}>PRODUCTOS E INSUMOS UTILIZADOS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
               {(formData.components || []).map((comp) => {
                  const selectedProd = products.find(p => p.id === comp.productId || p.id === comp.productId?.toString());

                  return (
                    <div key={comp.id} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <ProductSearchDropdown 
                          value={comp.productId} 
                          onChange={(newId) => updateServiceComponent(comp.id, 'productId', newId)}
                          products={products}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {selectedProd && (
                          <button 
                            className="btn btn-outline" 
                            style={{ padding: '0 12px', borderRadius: '8px', height: '42px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} 
                            onClick={() => setViewingProduct(selectedProd)}
                            title="Ver información del producto"
                            type="button"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                        <input type="number" className="input" value={comp.qty} onChange={e => updateServiceComponent(comp.id, 'qty', e.target.value)} style={{ padding: '12px', borderRadius: '8px', width: '80px' }} />
                        <button className="btn btn-outline" style={{ padding: '0 12px', borderRadius: '8px', height: '42px' }} onClick={() => removeServiceComponent(comp.id)} type="button">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
               })}
            </div>
            <button className="btn btn-outline" style={{ width: '100%', padding: '12px', borderRadius: '8px', borderStyle: 'dashed', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }} onClick={addServiceComponent} type="button">
              <Plus size={16} /> Añadir producto / insumo
            </button>
          </div>
          )}

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-outline" style={{ padding: '12px 24px', fontWeight: 600, borderRadius: '8px' }} onClick={() => { setView('list'); resetForm(); }}>Cancelar</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px', fontWeight: 600, borderRadius: '8px', backgroundColor: '#f97316', borderColor: '#f97316' }} onClick={handleSaveProduct}>
               Guardar
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Productos</h1>
          <p className="page-subtitle">Gestiona el inventario de {kiosco.businessConfig?.storeName || 'tu negocio'}</p>
        </div>
        <div className="page-actions">
              <button className="btn btn-outline" onClick={() => setShowTopSellersModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={16} /> Más Vendidos
              </button>
              <button className="btn btn-outline" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={16} /> Exportar
              </button>
              <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={16} /> Importar
              </button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleFileUpload} />
          <button className="btn btn-outline" onClick={() => setShowCategoryModal(true)}>
            <Package size={16} /> Categorías
          </button>
            <button className="btn btn-outline" onClick={() => {
              if (kiosco.businessConfig?.plan !== 'Pro') {
                setAlertMessage("La creación de Combos y Packs es una función exclusiva del Plan Pro. Ve a Configuración para actualizar tu plan.");
                setShowAlert(true);
              } else {
                setView('createCombo');
              }
            }}>
              Combos
            </button>
          <button className="btn btn-primary" onClick={() => { resetForm(); setView('chooseType'); }}>
            + Nuevo
          </button>
          <button className="btn btn-outline" onClick={handleBulkDelete} style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={16} /> Borrar
          </button>
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
          />
          {searchTerm && <button className="search-clear" onClick={() => setSearchTerm('')}><X size={16} /></button>}
        </div>
        <div ref={filtersRef} style={{ position: 'relative', display: 'flex', gap: '8px' }}>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Filtros {(filterCategory !== 'Todas' || filterSubcategory !== 'Todas' || filterStatus !== 'Todos' || filterType !== 'Todos' || filterMarca !== 'Todas') && '•'}
          </button>
          {(filterCategory !== 'Todas' || filterSubcategory !== 'Todas' || filterStatus !== 'Todos' || filterType !== 'Todos' || filterMarca !== 'Todas') && (
            <button className="btn btn-outline" style={{ padding: '10px 12px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)', display: 'flex', alignItems: 'center' }} onClick={() => { setFilterCategory('Todas'); setFilterSubcategory('Todas'); setFilterStatus('Todos'); setFilterType('Todos'); setFilterMarca('Todas'); }} title="Limpiar filtros">
              <X size={16} />
            </button>
          )}

          {showFilters && (
            <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: '8px', width: '250px', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Categoría</label>
<select className="input" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFilterSubcategory('Todas'); }}>
                  <option value="Todas">Todas las categorías</option>
                  <option value="Sin categoría">Sin categoría</option>
                  {Object.keys(categoryTree).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              {filterCategory !== 'Todas' && filterCategory !== 'Sin categoría' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subcategoría</label>
<select className="input" value={filterSubcategory} onChange={e => setFilterSubcategory(e.target.value)}>
                    <option value="Todas">Todas las subcategorías</option>
                    {categoryTree[filterCategory]?.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Estado</label>
                <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="Todos">Todos los estados</option>
                  <option value="Activo">Activos</option>
                  <option value="Inactivo">Inactivos</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Tipo</label>
                <select 
                  className="input" 
                  value={filterType} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'Combos' && kiosco.businessConfig?.plan === 'Básico') {
                      setAlertMessage("La función de Combos pertenece al Plan Pro. Por favor actualiza tu plan para utilizar Combos.");
                      setShowAlert(true);
                      return;
                    }
                    setFilterType(val);
                  }}
                >
                  <option value="Todos">Todos</option>
                  <option value="Productos">Solo Productos</option>
                  <option value="Servicios">Solo Servicios</option>
                  <option value="Combos">Solo Combos</option>
                </select>
              </div>
              {(kiosco.businessConfig?.businessType === 'petshop' || kiosco.businessConfig?.businessType === 'libreria') && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Marca</label>
                  <select className="input" value={filterMarca} onChange={e => setFilterMarca(e.target.value)}>
                    <option value="Todas">Todas las marcas</option>
                    {marcasDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card table-card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={paginatedProducts.length > 0 && selectedIds.length === paginatedProducts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(paginatedProducts.map(p => p.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th>Producto ↑↓</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Stock ↑↓</th>
                <th>Precio ↑↓</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map(p => (
                <tr key={p.id}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => [...prev, p.id]);
                        } else {
                          setSelectedIds(prev => prev.filter(id => id !== p.id));
                        }
                      }}
                    />
                  </td>
                  <td>
                    <div className="product-cell">
                      <span className="product-name" style={{ fontSize: '13px' }}>{p.name}</span>
                      <span className="product-code" style={{ fontSize: '11px' }}>{p.code || p.sku}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-primary" style={{ fontSize: '11px', padding: '2px 6px', display: 'inline-block', marginBottom: '4px' }}>
                      {p.isCombo && <span style={{ marginRight: '4px', backgroundColor: '#ffc107', color: '#000', padding: '2px 4px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>COMBO</span>}
                      {p.category}
                    </span>
                    <br />
                    <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#eef2f6', color: '#495057', display: 'inline-block' }}>{p.subcategory || 'General'}</span>
                  </td>
                  <td>
                    <div className={`toggle-switch ${p.isActive ? 'active' : ''}`} onClick={() => updateProduct(p.id, { isActive: !p.isActive })} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                      <div className="toggle-thumb"></div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500, fontSize: '13px' }}>
                    {p.isService ? (
                      (() => {
                        if (!p.components || p.components.length === 0) return 'Servicio (N/A)';
                        let minServiceStock = Infinity;
                        let hasValidComponent = false;
                        p.components.forEach(comp => {
                          if (!comp.productId) return;
                          const compProduct = products.find(prod => prod.id === comp.productId || prod.id === Number(comp.productId));
                          if (compProduct) {
                            hasValidComponent = true;
                            const possibleStock = Math.floor(compProduct.stock / (comp.qty || 1));
                            if (possibleStock < minServiceStock) {
                              minServiceStock = possibleStock;
                            }
                          }
                        });
                        return hasValidComponent ? `Servicio (${minServiceStock === Infinity ? 0 : minServiceStock} u)` : 'Servicio (N/A)';
                      })()
                    ) : (
                      p.unitType === 'Peso (Kg)' ? `${Number(p.stock).toFixed(3)} Kg` : `${p.stock} u`
                    )}
                  </td>
                  <td>
                    <div className="price-cell">
                      <span className="price-main" style={{ fontSize: '13px' }}>$ {p.price.toLocaleString('es-AR')}</span>
                      <span className="price-neto" style={{ fontSize: '11px' }}>Neto: $ {p.priceNet ? parseFloat(p.priceNet).toLocaleString('es-AR') : '0'}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '4px' }}>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
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
                   <td colSpan="7" style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-muted)' }}>No se encontraron productos</td>
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
      {view === 'chooseType' && (
        <Modal title="¿Qué deseas agregar?" onClose={() => setView('list')} minWidth="400px">
          <div style={{ padding: '24px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button className="btn btn-outline" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', borderRadius: '12px' }} onClick={() => { resetForm(); setFormData(prev => ({ ...prev, isService: false })); setView('create'); }}>
              <Package size={32} />
              <span style={{ fontSize: '16px', fontWeight: 600 }}>Producto</span>
            </button>
            <button className="btn btn-outline" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', borderRadius: '12px' }} onClick={() => { resetForm(); setFormData(prev => ({ ...prev, isService: true, category: 'Servicios', subcategory: 'General', unitType: 'Unitario' })); setView('create'); }}>
              <Settings size={32} />
              <span style={{ fontSize: '16px', fontWeight: 600 }}>Servicio</span>
            </button>
          </div>
        </Modal>
      )}
      {renderProductDeleteOverlay()}
      {renderCategoryModal()}
      {renderMappingModal()}
      {renderImportModal()}
      {renderCreateProductModal()}
      {renderCreateComboModal()}
      {showSupplierModal && renderSupplierModal()}

      {showTopSellersModal && (
        <Modal title="Productos Más Vendidos" onClose={() => setShowTopSellersModal(false)} minWidth="500px">
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>
                Ranking de los 20 más vendidos.
              </p>
              <select
                className="input"
                style={{ width: '150px', padding: '6px 12px' }}
                value={topSellersFilter}
                onChange={e => setTopSellersFilter(e.target.value)}
              >
                <option value="all">Históricamente</option>
                <option value="30days">Últimos 30 días</option>
                <option value="7days">Últimos 7 días</option>
              </select>
            </div>
            {hasServices && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button 
                  className={`btn ${topSellersTab === 'Productos' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTopSellersTab('Productos')}
                  style={{ flex: 1 }}
                >
                  Productos
                </button>
                <button 
                  className={`btn ${topSellersTab === 'Servicios' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTopSellersTab('Servicios')}
                  style={{ flex: 1 }}
                >
                  Servicios
                </button>
              </div>
            )}
          </div>
          <div className="table-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'center' }}>Vendidos</th>
                </tr>
              </thead>
              <tbody>
                {displayedTopSellers.map((item, idx) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {idx + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Cód: {item.code || item.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td>{item.category}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {item.totalSold} u
                    </td>
                  </tr>
                ))}
                {displayedTopSellers.length === 0 && (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      No hay ventas registradas en esta categoría aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {renderAlertOverlay()}
      {viewingProduct && (
        <Modal title="Información del Producto" onClose={() => setViewingProduct(null)} minWidth="400px">
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
               <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', color: '#1a1f36' }}>{viewingProduct.name}</h3>
               <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Cód: {viewingProduct.code || viewingProduct.sku}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
               <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Categoría</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>{viewingProduct.category}</div>
               </div>
               <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Subcategoría</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>{viewingProduct.subcategory}</div>
               </div>
               <div>
                   <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{viewingProduct.isService ? 'Stock Efectivo (Insumos)' : 'Stock Actual'}</div>
                   <div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>
                     {viewingProduct.isService ? (
                       (() => {
                         if (!viewingProduct.components || viewingProduct.components.length === 0) return 'Servicio (N/A)';
                         let minServiceStock = Infinity;
                         let hasValidComponent = false;
                         viewingProduct.components.forEach(comp => {
                           if (!comp.productId) return;
                           const compProduct = products.find(prod => prod.id === comp.productId || prod.id === Number(comp.productId));
                           if (compProduct) {
                             hasValidComponent = true;
                             const possibleStock = Math.floor(compProduct.stock / (comp.qty || 1));
                             if (possibleStock < minServiceStock) {
                               minServiceStock = possibleStock;
                             }
                           }
                         });
                         return hasValidComponent ? `${minServiceStock === Infinity ? 0 : minServiceStock} u` : 'Servicio (N/A)';
                       })()
                     ) : (
                       `${viewingProduct.stock} ${viewingProduct.unitType === 'Peso (Kg)' ? 'Kg' : (viewingProduct.unitType === 'Gramos (g)' ? 'g' : (viewingProduct.unitType === 'Litro (L)' ? 'L' : 'u'))}`
                     )}
                   </div>
                </div>
               <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Precio Venta</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{formatCur(viewingProduct.price || 0)}</div>
               </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
               <button className="btn btn-primary" onClick={() => setViewingProduct(null)} style={{ padding: '10px 24px', borderRadius: '8px' }}>Cerrar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default React.memo(Productos);
