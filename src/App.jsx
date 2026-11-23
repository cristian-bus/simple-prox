import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import BottomNav from './components/BottomNav';
import PuntoDeVenta from './screens/PuntoDeVenta';
import Productos from './screens/Productos';
import Inventario from './screens/Inventario';
import Compras from './screens/Compras';
import Usuarios from './screens/Usuarios';
import Clientes from './screens/Clientes';
import Reportes from './screens/Reportes';
import Configuracion from './screens/Configuracion';
import Soporte from './screens/Soporte';
import Onboarding from './screens/Onboarding';
import Turnos from './screens/Turnos';
import ActivationGuard from './components/ActivationGuard';
import { useKiosco } from './hooks/useKiosco';
import Ofertas from './screens/Ofertas';
import { useOfertas } from './hooks/useOfertas';

function App() {
  const [currentScreen, setCurrentScreen] = useState('punto-venta');
  const [globalAdminAuthed, setGlobalAdminAuthed] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  
  // License States
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [licenseValid, setLicenseValid] = useState(true);
  const [legacyMode, setLegacyMode] = useState(false);

  const kiosco = useKiosco();
  const ofertas = useOfertas(kiosco, currentScreen === 'punto-venta');

  const activeUser = kiosco.caja.isOpen ? kiosco.users.find(u => u.id === (kiosco.caja.activeUserId || kiosco.caja.openedBy)) : null;
  const isProtectedTab = ['productos', 'inventario', 'usuarios', 'reportes', 'configuracion'].includes(currentScreen);
  
  // Si la caja la tiene abierta un Admin, tiene permisos. O si entró el PIn global
  const hasAdminRights = (activeUser && activeUser.role === 'Admin') || globalAdminAuthed;

  // Lógica del Guard
  const [guardPin, setGuardPin] = useState('');
  const [guardError, setGuardError] = useState(false);

  const handleGuardSubmit = () => {
    // Buscar un admin que tenga este PIN
    const adminMatch = kiosco.users.find(u => u.role === 'Admin' && u.pin === guardPin && u.isActive);
    if(adminMatch) {
       setGlobalAdminAuthed(true);
       setGuardError(false);
       setGuardPin('');
    } else {
       setGuardError(true);
       setGuardPin('');
    }
  };

  // Si abren u operan la caja o cambia el operador activo, resetear el authed global para mantener candado
  React.useEffect(() => {
     if(kiosco.caja.isOpen) {
        setGlobalAdminAuthed(false);
     }
  }, [kiosco.caja.isOpen, kiosco.caja.activeUserId]);

  // Disable scroll to change value on all number inputs globally
  useEffect(() => {
    const handleWheel = (e) => {
      if (document.activeElement && document.activeElement.type === 'number') {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    if (window.api && window.api.onAppCloseRequested) {
      const handleCloseRequested = () => {
        if (kiosco.caja?.isOpen) {
          setShowCloseModal(true);
        } else {
          window.api.confirmClose();
        }
      };

      window.api.onAppCloseRequested(handleCloseRequested);
      return () => {
        window.api.removeAppCloseListener();
      };
    }
  }, [kiosco.caja?.isOpen]);

  const confirmAppClose = () => {
    if (window.api && window.api.confirmClose) {
      window.api.confirmClose();
    }
  };

  const [licensePendingLock, setLicensePendingLock] = useState(false);

  useEffect(() => {
    let intervalId;
    let lockCheckInterval;
    
    async function checkLicense() {
      if (import.meta.env.DEV) {
        const { isLocalDemoActive } = await import('./utils/devDemoMode.js');
        if (isLocalDemoActive()) {
          setLicenseValid(true);
          setLegacyMode(false);
          setLicenseChecked(true);
          return;
        }
      }

      if (!kiosco.businessConfig?.isActivated) {
        setLicenseChecked(true);
        setLicenseValid(false);
        return;
      }
      
      const token = localStorage.getItem('kioscoprox_license_token');
      if (token) {
        try {
          const { verifyBasicActivationCertificate, verifyEd25519License } = await import('./utils/licenseCrypto.js');
          const instId = kiosco.businessConfig?.installationId || '';
          
          // Intentar validar como certificado Básico
          let result = await verifyBasicActivationCertificate(token, instId);
          
          // Si no es un certificado básico, intentar con verifyEd25519License para tokens anteriores
          if (!result.valid && verifyEd25519License) {
            const legacyRes = await verifyEd25519License(token, instId);
            if (legacyRes.valid) {
              result = legacyRes;
            }
          }

          if (result.valid) {
            setLicenseValid(true);
            setLegacyMode(false);
            setLicensePendingLock(false);
          } else {
            // Expired or invalid
            setLegacyMode(false);
            if (window.__ACTIVE_SALE__) {
              setLicensePendingLock(true);
            } else {
              setLicenseValid(false);
            }
          }
        } catch(e) {
          if (window.__ACTIVE_SALE__) {
            setLicensePendingLock(true);
          } else {
            setLicenseValid(false);
          }
        }
      } else {
        setLicenseValid(false);
        setLegacyMode(false);
      }
      setLicenseChecked(true);
    }

    
    checkLicense();
    
    // Check expiration every hour, independently of cash register
    intervalId = setInterval(() => {
       checkLicense();
    }, 60 * 60 * 1000);
    
    // Check if we need to lock after the sale finishes
    lockCheckInterval = setInterval(() => {
       if (licensePendingLock && !window.__ACTIVE_SALE__) {
         setLicenseValid(false);
         setLicensePendingLock(false);
       }
    }, 5000);
    
    return () => {
      clearInterval(intervalId);
      clearInterval(lockCheckInterval);
    };
  }, [kiosco.businessConfig?.isActivated, kiosco.businessConfig?.installationId, licensePendingLock]);

  if (!licenseChecked) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: 'white' }}>Verificando licencia...</div>;
  }

  if (!licenseValid) {
    return <ActivationGuard kiosco={kiosco} />;
  }

  if (!kiosco.businessConfig?.isOnboarded) {
    return <Onboarding kiosco={kiosco} />;
  }

  return (
    <div className={`app-container ${navCollapsed ? 'nav-collapsed' : ''}`}>
      {import.meta.env.DEV && <DevDemoBanner />}
      <main className="main-content">

        <div style={{ display: currentScreen === 'punto-venta' ? 'block' : 'none', height: '100%' }}>
          <PuntoDeVenta kiosco={kiosco} ofertas={ofertas} setGlobalAdminAuthed={setGlobalAdminAuthed} />
        </div>
        <div style={{ display: currentScreen === 'ofertas' ? 'block' : 'none', height: '100%' }}>
          <Ofertas ofertas={ofertas} kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'productos' ? 'block' : 'none', height: '100%' }}>
          <Productos kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'turnos' ? 'block' : 'none', height: '100%' }}>
          <Turnos kiosco={kiosco} activeUser={activeUser} setCurrentScreen={setCurrentScreen} />
        </div>
        <div style={{ display: currentScreen === 'inventario' ? 'block' : 'none', height: '100%' }}>
          <Inventario kiosco={kiosco} ofertas={ofertas} />
        </div>
        <div style={{ display: currentScreen === 'compras' ? 'block' : 'none', height: '100%' }}>
          <Compras kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'usuarios' ? 'block' : 'none', height: '100%' }}>
          <Usuarios kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'clientes' ? 'block' : 'none', height: '100%' }}>
          <Clientes kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'reportes' ? 'block' : 'none', height: '100%' }}>
          <Reportes kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'configuracion' ? 'block' : 'none', height: '100%' }}>
          <Configuracion kiosco={kiosco} />
        </div>
        <div style={{ display: currentScreen === 'soporte' ? 'block' : 'none', height: '100%' }}>
          <Soporte kiosco={kiosco} setCurrentScreen={setCurrentScreen} />
        </div>

        {/* Global Admin Guard Overlay */}
        {isProtectedTab && !hasAdminRights && (
           <div className="guard-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, backgroundColor: 'rgba(26, 31, 54, 0.98)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '400px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '32px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
               <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-danger-bg)', marginBottom: '16px' }}>
                  <Lock size={32} color="#ea4335" />
                </div>
               <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-text)' }}>Acceso Restringido</h2>
               <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', margin: '0 0 24px 0' }}>Esta es una zona administrativa. Ingresa el PIN Maestro para continuar.</p>
                
                <input 
                   type="password" 
                   value={guardPin} 
                   onChange={e => {
                     const val = e.target.value.replace(/\D/g, '');
                     if(val.length <= 4) setGuardPin(val);
                   }}
                   onKeyDown={e => {
                     if (e.key === 'Enter' && guardPin.length === 4) handleGuardSubmit();
                   }}
                  style={{ width: '200px', fontSize: '32px', letterSpacing: '12px', textAlign: 'center', padding: '12px', borderRadius: 'var(--radius-md)', border: guardError ? '2px solid var(--color-danger)' : '2px solid var(--color-border)', backgroundColor: 'var(--color-background)', color: guardError ? 'var(--color-danger)' : 'var(--color-text)' }}
                   autoFocus
                />
                {guardError && <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginTop: '8px', fontWeight: 600 }}>PIN de Administrador inválido</div>}
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                   <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setCurrentScreen('punto-venta'); setGuardPin(''); setGuardError(false); }}>
                     Volver a Caja
                   </button>
                   <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleGuardSubmit} disabled={guardPin.length < 4}>
                     Desbloquear
                   </button>
                </div>
             </div>
           </div>
        )}

      </main>
      
      <BottomNav currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} activeUser={activeUser} navCollapsed={navCollapsed} setNavCollapsed={setNavCollapsed} kiosco={kiosco} />

      {showCloseModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '32px' }}>
            <h3 style={{ color: '#e03131', marginTop: 0, fontSize: '20px', fontWeight: 'bold' }}>Hay un turno abierto</h3>
            <p style={{ color: '#495057', fontSize: '15px', lineHeight: '1.5' }}>
              Estás intentando cerrar el sistema pero el turno actual sigue abierto.
              <br/><br/>
              Si cierras ahora, el turno permanecerá activo la próxima vez que inicies el sistema.
              <br/><br/>
              ¿Estás seguro de que deseas salir?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
              <button className="btn btn-outline" onClick={() => setShowCloseModal(false)} style={{ flex: 1 }}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmAppClose} style={{ flex: 1, backgroundColor: '#e03131', border: 'none' }}>Sí, salir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DevDemoBanner() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let isMounted = true;
    import('./utils/devDemoMode.js').then(m => {
      if (isMounted) setActive(m.isLocalDemoActive());
    });
    return () => { isMounted = false; };
  }, []);

  if (!active) return null;

  return (
    <div style={{
      backgroundColor: '#7c3aed',
      color: '#ffffff',
      padding: '8px 16px',
      fontSize: '12px',
      fontWeight: 600,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 99999,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      <span>🧪 MODO DEMOSTRACIÓN LOCAL (DEV) — Entorno de pruebas 100% aislado. Sin peticiones remotas ni impacto en Supabase.</span>
      <button
        onClick={async () => {
          const { stopLocalDemo } = await import('./utils/devDemoMode.js');
          stopLocalDemo();
        }}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#ffffff',
          padding: '4px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 700
        }}
      >
        Salir del Modo Demo
      </button>
    </div>
  );
}

export default App;
