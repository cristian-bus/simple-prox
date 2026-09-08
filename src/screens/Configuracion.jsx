import React, { useState, useEffect } from 'react';
import { Crown, Copy, Percent, Save, Check, Calendar, Send, Bell, RefreshCw, Key, DownloadCloud, Wifi, WifiOff } from 'lucide-react';
import { generateLicenseKey } from '../hooks/useKiosco';
import { testTelegramNotification, fetchRemoteMasterKey } from '../services/activationService';
import { generate5MonthsDemoData } from '../utils/demoDataGenerator';
import { registerMerchantRemotely } from '../services/adSyncEngine';
import { ARGENTINA_PROVINCES, getCitiesForProvince } from '../utils/argentinaGeo';
import { getCommerceProfile, saveCommerceProfile } from '../services/installationService';
import { subscribeUpdate, checkForUpdatesManual, applyUpdateSafe, UPDATE_STATUS } from '../services/updateService';
import { subscribeConnectivity, CONNECTIVITY_STATUS } from '../services/connectivityService';
import { APP_VERSION } from '../constants/version';

const Configuracion = ({ kiosco }) => {
  const profile = getCommerceProfile();

  const [connStatus, setConnStatus] = useState(CONNECTIVITY_STATUS.CHECKING);
  const [updateState, setUpdateState] = useState({ status: UPDATE_STATUS.IDLE });

  useEffect(() => {
    const unsubConn = subscribeConnectivity(setConnStatus);
    const unsubUpd = subscribeUpdate(setUpdateState);
    return () => {
      unsubConn();
      unsubUpd();
    };
  }, []);

  const [businessData, setBusinessData] = useState({
    storeName: kiosco.businessConfig?.storeName || kiosco.businessConfig?.name || profile.storeName || '',
    address: kiosco.businessConfig?.address || kiosco.businessConfig?.activationData?.direccion || profile.address || '',
    phone: kiosco.businessConfig?.phone || kiosco.businessConfig?.activationData?.telefono || profile.phone || '',
    cuit: kiosco.businessConfig?.cuit || '',
    country: kiosco.businessConfig?.country || 'Argentina',
    businessType: kiosco.businessConfig?.businessType || profile.businessType || 'Almacén',
    provinceCode: kiosco.businessConfig?.provinceCode || profile.provinceCode || 'AR-D',
    provinceName: kiosco.businessConfig?.provinceName || profile.provinceName || 'San Luis',
    cityCode: kiosco.businessConfig?.cityCode || profile.cityCode || 'SL-CAPITAL',
    cityName: kiosco.businessConfig?.cityName || profile.cityName || 'San Luis Capital',
    expirationWarningDays: kiosco.businessConfig?.expirationWarningDays || 15
  });
  const [showBusinessSuccess, setShowBusinessSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [generatorInput, setGeneratorInput] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');

  const [globalMargin, setGlobalMargin] = useState('');
  
  // Telegram Settings State
  const [telegramToken, setTelegramToken] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.telegramBotToken || '';
  });
  const [telegramChatId, setTelegramChatId] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.telegramChatId || '';
  });
  const [telegramMasterKey, setTelegramMasterKey] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.masterKey || 'ProX2026MasterKey';
  });
  const [telegramTestLoading, setTelegramTestLoading] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState(null);
  const [showTelegramSuccess, setShowTelegramSuccess] = useState(false);
  const [activeRemoteKey, setActiveRemoteKey] = useState('');
  const [loadingRemoteKey, setLoadingRemoteKey] = useState(false);

  const refreshLiveRemoteKey = async () => {
    setLoadingRemoteKey(true);
    const key = await fetchRemoteMasterKey();
    setActiveRemoteKey(key);
    setLoadingRemoteKey(false);
  };

  useEffect(() => {
    refreshLiveRemoteKey();
  }, []);
  
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert',
    onConfirm: null
  });

  const showAlertModal = (title, message) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type: 'alert',
      onConfirm: null
    });
  };

  const showConfirmModal = (title, message, onConfirm) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm
    });
  };
  
  const handleApplyGlobalMargin = () => {
    const marginNum = parseFloat(globalMargin);
    if (isNaN(marginNum) || marginNum < 0) {
      showAlertModal('Atención', 'Por favor, ingresa un margen válido.');
      return;
    }
    showConfirmModal(
      'Confirmar Margen Global',
      `¿Estás seguro de aplicar un margen del ${marginNum}% a todos los productos? Esto sobrescribirá sus precios actuales.`,
      () => {
        kiosco.updateGlobalMargin(marginNum);
        showAlertModal('Éxito', 'Margen aplicado a todos los productos exitosamente.');
        setGlobalMargin('');
      }
    );
  };

  const handleActivateLicense = () => {
    const expected = generateLicenseKey(kiosco.businessConfig?.installationId);
    if (licenseKeyInput.trim().toUpperCase() === expected) {
      kiosco.updateBusinessConfig({
        ...kiosco.businessConfig,
        plan: 'Pro',
        licenseKey: expected
      });

      // Sincronizar inmediatamente a Supabase para reflejar Plan Pro en el panel admin
      registerMerchantRemotely({
        installationId: kiosco.businessConfig?.installationId,
        storeName: kiosco.businessConfig?.storeName || kiosco.businessConfig?.name,
        plan: 'Pro',
        address: kiosco.businessConfig?.address || kiosco.businessConfig?.activationData?.direccion || '',
        phone: kiosco.businessConfig?.phone || kiosco.businessConfig?.activationData?.telefono || '',
        installer: kiosco.businessConfig?.activationData?.instalador || '',
        appVersion: APP_VERSION
      }).catch(err => console.warn('Error actualizando plan Pro en Supabase:', err));

      setLicenseKeyInput('');
      setLicenseError('');
      showAlertModal('Licencia Activada', '¡Licencia Pro activada exitosamente!');
    } else {
      setLicenseError('La clave ingresada no es válida para este equipo.');
    }
  };

  const handleCopyInstallationId = () => {
    const id = kiosco.businessConfig?.installationId;
    if (id) {
      navigator.clipboard.writeText(id).then(() => {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      });
    }
  };

  const handleSaveBusinessInfo = () => {
    const updated = { 
      ...kiosco.businessConfig, 
      ...businessData,
      storeName: (businessData.storeName || '').trim(),
      name: (businessData.storeName || '').trim(),
      address: (businessData.address || '').trim(),
      phone: (businessData.phone || '').trim()
    };
    kiosco.updateBusinessConfig(updated);
    try {
      localStorage.setItem('kioscoprox_business_config', JSON.stringify(updated));
    } catch(e) {}

    // Persistir CommerceProfile formal
    saveCommerceProfile({
      storeName: (businessData.storeName || '').trim(),
      address: (businessData.address || '').trim(),
      phone: (businessData.phone || '').trim(),
      businessType: businessData.businessType,
      provinceCode: businessData.provinceCode,
      provinceName: businessData.provinceName,
      cityCode: businessData.cityCode,
      cityName: businessData.cityName
    });
    
    // Sincronizar al panel de Supabase
    registerMerchantRemotely({
      installationId: kiosco.businessConfig?.installationId,
      storeName: (businessData.storeName || '').trim(),
      address: (businessData.address || '').trim(),
      phone: (businessData.phone || '').trim(),
      provinceCode: businessData.provinceCode,
      provinceName: businessData.provinceName,
      cityCode: businessData.cityCode,
      cityName: businessData.cityName,
      city: businessData.cityName,
      plan: kiosco.businessConfig?.plan || 'Básico',
      installer: kiosco.businessConfig?.activationData?.instalador || '',
      appVersion: '1.3.1'
    }).catch(() => {});

    setShowBusinessSuccess(true);
    setTimeout(() => setShowBusinessSuccess(false), 3000);
  };

  const handleSaveTelegramSettings = () => {
    const existing = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    const newConfig = {
      ...existing,
      telegramBotToken: telegramToken.trim(),
      telegramChatId: telegramChatId.trim(),
      masterKey: telegramMasterKey.trim()
    };
    localStorage.setItem('kioscoprox_remote_config', JSON.stringify(newConfig));
    setShowTelegramSuccess(true);
    setTimeout(() => setShowTelegramSuccess(false), 3000);
  };

  const handleTestTelegramInConfig = async () => {
    setTelegramTestLoading(true);
    setTelegramTestResult(null);
    const res = await testTelegramNotification(telegramToken.trim(), telegramChatId.trim());
    setTelegramTestResult(res);
    setTelegramTestLoading(false);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p className="page-subtitle">Configura las opciones de tu negocio</p>
        </div>
      </div>

      <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Plan Card */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Crown size={20} color={kiosco.businessConfig?.plan === 'Pro' ? '#f59f00' : 'var(--color-text)'} />
              <h2 className="card-title" style={{ margin: 0, fontSize: '18px' }}>Plan Actual: Plan {kiosco.businessConfig?.plan}</h2>
            </div>
            <p className="card-subtitle">Funcionalidades incluidas en tu suscripción</p>
            
            {kiosco.businessConfig?.plan === 'Básico' && (
              <div style={{ margin: '20px 0' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Activar Plan Pro</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="XXXX-XXXX" 
                    value={licenseKeyInput}
                    onChange={e => setLicenseKeyInput(e.target.value.toUpperCase())}
                    style={{ padding: '8px 12px', width: '150px' }}
                  />
                  <button className="btn btn-primary" onClick={handleActivateLicense} style={{ padding: '8px 16px' }}>Activar</button>
                </div>
                {licenseError && <p style={{ color: 'var(--color-danger)', fontSize: '12px', marginTop: '8px' }}>{licenseError}</p>}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--color-secondary)', fontSize: '14px', marginTop: '16px' }}>
              <p>Facturación Electrónica: No</p>
              <p>Límite de Productos: {kiosco.businessConfig?.plan === 'Pro' ? '2500' : '1000'}</p>
              <p>Límite de Usuarios: {kiosco.businessConfig?.plan === 'Pro' ? 'Ilimitado' : '2'}</p>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
              {kiosco.businessConfig?.plan === 'Pro' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, display: 'block', color: 'var(--color-text)' }}>
                      Mostrar Ofertas y Banners en Caja
                    </span>
                    <small style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                      ⭐ Beneficio Pro: Puedes desactivar los anuncios comerciales en caja.
                    </small>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                    <input 
                      type="checkbox" 
                      checked={!kiosco.businessConfig?.hideAds}
                      onChange={e => kiosco.updateBusinessConfig({
                        ...kiosco.businessConfig,
                        hideAds: !e.target.checked
                      })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: !kiosco.businessConfig?.hideAds ? 'var(--color-primary)' : '#94a3b8',
                      borderRadius: '24px',
                      transition: '.2s'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '18px', width: '18px',
                        left: !kiosco.businessConfig?.hideAds ? '23px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: '.2s'
                      }} />
                    </span>
                  </label>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--color-secondary)', fontSize: '13px' }}>
                  <span>Publicidad / Ofertas B2B en Caja:</span>
                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600, fontSize: '11.5px' }}>
                    Incluida (Ocultable en Plan Pro ⭐)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Business Info Card */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: '16px' }}>Información del Negocio</h2>
              <button 
                onClick={handleCopyInstallationId}
                title="Copiar ID de Instalación para licencias"
                className="badge" 
                style={{ 
                  background: copiedId ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-background)', 
                  color: copiedId ? '#10b981' : 'var(--color-text-muted)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px'
                }}
              >
                ID: {kiosco.businessConfig?.installationId} <Copy size={12} />
                {copiedId && <span style={{ fontWeight: 700, fontSize: '11px' }}>¡Copiado!</span>}
              </button>
            </div>
            <p className="card-subtitle">Datos generales y ubicación geográfica de tu negocio</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Nombre del Negocio</label>
                <input 
                  type="text" 
                  className="input" 
                  value={businessData.storeName} 
                  onChange={e => setBusinessData({ ...businessData, storeName: e.target.value })}
                  style={{ padding: '8px 12px' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Dirección del Comercio</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="ej. Av. San Martín 1234"
                  value={businessData.address} 
                  onChange={e => setBusinessData({ ...businessData, address: e.target.value })}
                  style={{ padding: '8px 12px' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Provincia</label>
                <select 
                  className="input" 
                  value={businessData.provinceCode}
                  onChange={e => {
                    const newProvCode = e.target.value;
                    const provObj = ARGENTINA_PROVINCES.find(p => p.code === newProvCode);
                    const cities = getCitiesForProvince(newProvCode);
                    const defaultCity = cities[0] || { code: `${newProvCode}-CAPITAL`, name: 'Capital' };
                    setBusinessData({
                      ...businessData,
                      provinceCode: newProvCode,
                      provinceName: provObj ? provObj.name : 'San Luis',
                      cityCode: defaultCity.code,
                      cityName: defaultCity.name
                    });
                  }}
                  style={{ padding: '8px 12px', appearance: 'auto' }}
                >
                  {ARGENTINA_PROVINCES.map(prov => (
                    <option key={prov.code} value={prov.code}>
                      {prov.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Ciudad / Localidad</label>
                <select 
                  className="input" 
                  value={businessData.cityCode}
                  onChange={e => {
                    const newCityCode = e.target.value;
                    const cities = getCitiesForProvince(businessData.provinceCode);
                    const cityObj = cities.find(c => c.code === newCityCode);
                    setBusinessData({
                      ...businessData,
                      cityCode: newCityCode,
                      cityName: cityObj ? cityObj.name : newCityCode
                    });
                  }}
                  style={{ padding: '8px 12px', appearance: 'auto' }}
                >
                  {getCitiesForProvince(businessData.provinceCode).map(city => (
                    <option key={city.code} value={city.code}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Teléfono / WhatsApp</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="ej. 2664805745"
                  value={businessData.phone} 
                  onChange={e => setBusinessData({ ...businessData, phone: e.target.value })}
                  style={{ padding: '8px 12px' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>CUIT del Negocio</label>
                <input 
                  type="text" 
                  className="input" 
                  value={businessData.cuit} 
                  onChange={e => setBusinessData({ ...businessData, cuit: e.target.value })}
                  style={{ padding: '8px 12px' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>País</label>
                <select 
                  className="input" 
                  value={businessData.country}
                  onChange={e => setBusinessData({ ...businessData, country: e.target.value })}
                  style={{ padding: '8px 12px', appearance: 'auto' }}
                >
                  <option>Argentina</option>
                  <option>Chile</option>
                  <option>Uruguay</option>
                  <option>Colombia</option>
                  <option>México</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Tipo de negocio</label>
                <select 
                  className="input" 
                  value={businessData.businessType}
                  onChange={e => setBusinessData({ ...businessData, businessType: e.target.value })}
                  style={{ padding: '8px 12px', appearance: 'auto' }}
                >
                  <option value="Almacén">Almacén</option>
                  <option value="Kiosco">Kiosco</option>
                  <option value="Supermercado">Supermercado</option>
                  <option value="Ferretería">Ferretería</option>
                  <option value="Indumentaria">Indumentaria</option>
                  <option value="Servicios">Servicios</option>
                  <option value="barberia">Barbería</option>
                  <option value="petshop">Petshop</option>
                  <option value="libreria">Librería</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveBusinessInfo}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
              >
                <Save size={16} /> Guardar Datos
              </button>
              {showBusinessSuccess && (
                <div style={{ color: '#137333', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={16} /> Datos guardados exitosamente
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0, border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: '16px' }}>Base de Datos y Pruebas</h2>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '16px' }}>Gestión de datos de prueba (5 meses de uso) o limpieza total del sistema.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  const demoData = generate5MonthsDemoData();
                  kiosco.loadDemoData(demoData);
                  showAlertModal('¡Datos Demo Cargados!', 'Se han cargado exitosamente 60 productos, 30 clientes, 25 compras y operaciones de ventas/turnos para 5 meses.');
                }}
                style={{ padding: '10px 16px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <RefreshCw size={18} /> Cargar Datos Demo (5 Meses de Uso)
              </button>

              <button 
                className="btn btn-outline" 
                onClick={() => showConfirmModal(
                  'Limpiar Todos los Datos',
                  '¿Estás seguro de que deseas eliminar TODOS los productos, clientes, proveedores, compras y reportes? Esta acción dejará el sistema completamente en blanco y no se puede deshacer.',
                  () => {
                    kiosco.clearAllData();
                    showAlertModal('Éxito', 'Todos los datos han sido borrados con éxito.');
                  }
                )}
                style={{ padding: '8px 16px', borderColor: '#ea4335', color: '#ea4335', width: '100%' }}
              >
                Limpiar todos los datos y empezar de cero
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card: Versión y Actualizaciones */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <DownloadCloud size={20} color="var(--color-primary)" />
                <h2 className="card-title" style={{ margin: 0, fontSize: '16px' }}>Versión y Cloud</h2>
              </div>
              <span className="badge" style={{
                background: connStatus === CONNECTIVITY_STATUS.ONLINE ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: connStatus === CONNECTIVITY_STATUS.ONLINE ? '#10b981' : '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 600,
                fontSize: '12px'
              }}>
                {connStatus === CONNECTIVITY_STATUS.ONLINE ? <Wifi size={13} /> : <WifiOff size={13} />}
                {connStatus === CONNECTIVITY_STATUS.ONLINE ? 'En línea' : 'Modo Offline'}
              </span>
            </div>
            
            <p className="card-subtitle" style={{ marginBottom: '16px' }}>
              Versión instalada: <strong>v{profile.appVersion || '1.3.1'}</strong> (Canal Estable)
            </p>

            {updateState.status === UPDATE_STATUS.READY_TO_INSTALL && (
              <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, color: '#047857', marginBottom: '4px' }}>
                  🎉 Nueva versión {updateState.updateInfo?.version || ''} descargada
                </div>
                <div style={{ fontSize: '12.5px', color: '#065f46', marginBottom: '12px' }}>
                  La actualización está lista para ser aplicada de forma segura.
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (kiosco.caja?.isOpen) {
                      showAlertModal('Atención: Caja Abierta', 'Por seguridad operativa, cierra la caja antes de aplicar la actualización.');
                      return;
                    }
                    applyUpdateSafe(true);
                  }}
                  style={{ background: '#059669', borderColor: '#059669', padding: '8px 16px', fontSize: '13px' }}
                >
                  Reiniciar y Aplicar Actualización
                </button>
              </div>
            )}

            {updateState.status === UPDATE_STATUS.AVAILABLE && (
              <div style={{ fontSize: '13px', color: 'var(--color-primary)', marginBottom: '14px' }}>
                ⏳ Descargando nueva versión en segundo plano...
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button 
                className="btn btn-outline"
                onClick={checkForUpdatesManual}
                disabled={updateState.status === UPDATE_STATUS.CHECKING}
                style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={updateState.status === UPDATE_STATUS.CHECKING ? 'spin' : ''} />
                {updateState.status === UPDATE_STATUS.CHECKING ? 'Comprobando...' : 'Buscar Actualizaciones'}
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: '16px' }}>Facturación Electrónica</h2>
              <span className="badge badge-warning" style={{ background: '#fff5f5', color: '#e03131' }}>No disponible</span>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '24px' }}>
              La facturación electrónica está deshabilitada en esta versión.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>Habilitar facturación electrónica</p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Función no disponible temporalmente</p>
              </div>
              <div className="toggle-switch" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                <div className="toggle-thumb"></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Percent size={20} color="var(--color-primary)" />
              <h2 className="card-title" style={{ margin: 0, fontSize: '16px' }}>Margen de Ganancia Global</h2>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '24px' }}>Aplica un mismo margen de ganancia a todos los productos de tu inventario. Luego podrás editar productos individuales si lo deseas.</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '150px' }}>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ej: 30" 
                  value={globalMargin}
                  onChange={e => setGlobalMargin(e.target.value.replace(/[^0-9.]/g, ''))}
                  onFocus={e => e.target.select()}
                  style={{ padding: '8px 12px', width: '100%' }}
                />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '14px' }}>%</span>
              </div>
              <button 
                className="btn btn-primary" 
                onClick={handleApplyGlobalMargin}
                disabled={!globalMargin}
                style={{ padding: '8px 16px' }}
              >
                Aplicar a todos
              </button>
            </div>
          </div>

          <div className="card" style={{ opacity: kiosco.businessConfig?.plan === 'Pro' ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Calendar size={20} color={kiosco.businessConfig?.plan === 'Pro' ? "var(--color-primary)" : "var(--color-text-muted)"} />
              <h2 className="card-title" style={{ margin: 0, fontSize: '16px' }}>Alerta de Vencimientos</h2>
              {kiosco.businessConfig?.plan !== 'Pro' && (
                <span className="badge badge-warning" style={{ background: '#fff5f5', color: '#e03131', fontSize: '11px', padding: '2px 6px', whiteSpace: 'nowrap' }}>Solo Plan Pro</span>
              )}
            </div>
            <p className="card-subtitle" style={{ marginBottom: '24px' }}>Establece con cuántos días de anticipación comenzará a mostrarse el aviso de vencimiento de productos en la pestaña Ventas.</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '180px' }}>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ej: 15" 
                  value={businessData.expirationWarningDays}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setBusinessData({ ...businessData, expirationWarningDays: val ? parseInt(val, 10) : '' });
                  }}
                  onFocus={e => e.target.select()}
                  style={{ padding: '8px 12px', width: '100%', cursor: kiosco.businessConfig?.plan !== 'Pro' ? 'not-allowed' : 'text' }}
                  disabled={kiosco.businessConfig?.plan !== 'Pro'}
                />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '14px' }}>días antes</span>
              </div>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveBusinessInfo}
                style={{ padding: '8px 16px', cursor: kiosco.businessConfig?.plan !== 'Pro' ? 'not-allowed' : 'pointer' }}
                disabled={kiosco.businessConfig?.plan !== 'Pro'}
              >
                Guardar
              </button>
            </div>
          </div>

        </div>

        {/* Panel de Desarrollador - Solo visible en desarrollo, oculto en instalador cliente */}
        {import.meta.env.DEV && (
          <div className="card" style={{ border: '2px dashed #34a853', gridColumn: '1 / -1', margin: 0 }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#34a853', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛠️ Panel de Desarrollador
            </h3>
            <p style={{ fontSize: '13px', margin: '4px 0 12px 0', color: 'var(--color-text-muted)' }}>
              Permite alternar el plan para verificar las limitaciones del sistema de inmediato.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button 
                className={`btn ${kiosco.businessConfig?.plan === 'Básico' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => kiosco.updateBusinessConfig({ ...kiosco.businessConfig, plan: 'Básico' })}
                style={{ padding: '8px 16px' }}
              >
                Simular Plan Básico
              </button>
              <button 
                className={`btn ${kiosco.businessConfig?.plan === 'Pro' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => kiosco.updateBusinessConfig({ ...kiosco.businessConfig, plan: 'Pro', licenseKey: generateLicenseKey(kiosco.businessConfig?.installationId) })}
                style={{ padding: '8px 16px' }}
              >
                Simular Plan Pro
              </button>
              <button 
                className="btn btn-outline"
                onClick={() => {
                  showConfirmModal(
                    'Resetear Sistema',
                    'Esto reiniciará el flujo de onboarding (Bienvenida) y te permitirá elegir el rubro nuevamente. ¿Continuar?',
                    () => {
                      kiosco.updateBusinessConfig({ ...kiosco.businessConfig, isOnboarded: false });
                      kiosco.deleteAllProducts(); 
                    }
                  );
                }}
                style={{ padding: '8px 16px', borderColor: '#34a853', color: '#137333' }}
              >
                Resetear Onboarding
              </button>
            </div>

            {/* Generador de Claves */}
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(52, 168, 83, 0.1)', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#137333' }}>Generador de Licencias (Solo Dev)</h4>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="ID del cliente" 
                  value={generatorInput}
                  onChange={e => setGeneratorInput(e.target.value.toUpperCase())}
                  style={{ padding: '6px 12px', fontSize: '13px', width: '120px' }}
                />
                <button 
                  className="btn btn-outline" 
                  onClick={() => setGeneratedKey(generateLicenseKey(generatorInput))}
                  style={{ padding: '6px 12px', fontSize: '13px', borderColor: '#34a853', color: '#137333' }}
                >
                  Generar
                </button>
                {generatedKey && (
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1a1f36' }}>{generatedKey}</span>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {modalConfig.isOpen && (
        <div className="modal-overlay" onClick={() => setModalConfig({ ...modalConfig, isOpen: false })} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26, 31, 54, 0.6)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#1a1f36' }}>{modalConfig.title}</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
                {modalConfig.message}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {modalConfig.type === 'confirm' ? (
                <>
                  <button className="btn btn-outline" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}>
                    Cancelar
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600 }} onClick={() => {
                    modalConfig.onConfirm?.();
                    setModalConfig({ ...modalConfig, isOpen: false });
                  }}>
                    Confirmar
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" style={{ padding: '10px 32px', borderRadius: '8px', fontWeight: 600 }} onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}>
                  Aceptar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Configuracion);
