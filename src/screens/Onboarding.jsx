import React, { useState, useEffect, useRef } from 'react';
import { NICHES } from '../utils/mockData';
import { Store, ShoppingBag, Scissors, Heart, CheckCircle2, ChevronRight, ArrowRight, MapPin, Building } from 'lucide-react';
import { registerMerchantRemotely } from '../services/adSyncEngine';
import { ARGENTINA_PROVINCES, getCitiesForProvince } from '../utils/argentinaGeo';
import { getCommerceProfile, saveCommerceProfile } from '../services/installationService';
import { APP_VERSION } from '../constants/version';

const ICONS = {
  kiosco: <Store size={32} />,
  petshop: <Heart size={32} />,
  libreria: <ShoppingBag size={32} />,
  barberia: <Scissors size={32} />
};

export default function Onboarding({ kiosco }) {
  const initialProfile = getCommerceProfile();

  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState(() => kiosco.businessConfig?.storeName || kiosco.businessConfig?.name || initialProfile.storeName || '');
  const [provinceCode, setProvinceCode] = useState(() => initialProfile.provinceCode || 'AR-D');
  const [cityCode, setCityCode] = useState(() => initialProfile.cityCode || 'SL-CAPITAL');
  const [nicheId, setNicheId] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  const availableCities = getCitiesForProvince(provinceCode);

  useEffect(() => {
    if (step === 1) {
      const focusInput = () => {
        if (inputRef.current) {
          window.focus();
          inputRef.current.focus();
        }
      };
      const t1 = setTimeout(focusInput, 100);
      const t2 = setTimeout(focusInput, 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [step]);

  const handleProvinceChange = (newCode) => {
    setProvinceCode(newCode);
    const cities = getCitiesForProvince(newCode);
    if (cities.length > 0) {
      setCityCode(cities[0].code);
    }
  };

  const handleNext = () => {
    if (step === 1 && storeName.trim()) setStep(2);
    else if (step === 2 && provinceCode && cityCode) setStep(3);
    else if (step === 3 && nicheId) setStep(4);
  };

  const handleComplete = () => {
    setLoading(true);
    let start = Date.now();
    const duration = 2500;

    const currentProv = ARGENTINA_PROVINCES.find(p => p.code === provinceCode) || { name: 'San Luis', code: 'AR-D' };
    const currentCity = availableCities.find(c => c.code === cityCode) || availableCities[0] || { name: 'San Luis Capital', code: 'SL-CAPITAL' };

    const locationData = {
      provinceCode: currentProv.code,
      provinceName: currentProv.name,
      cityCode: currentCity.code,
      cityName: currentCity.name
    };

    const timer = setInterval(() => {
      const passed = Date.now() - start;
      const currentProgress = Math.min(100, (passed / duration) * 100);
      setProgress(currentProgress);

      if (passed >= duration) {
        clearInterval(timer);

        // Guardar perfil formal
        saveCommerceProfile({
          storeName: storeName.trim(),
          businessType: nicheId,
          ...locationData
        });

        kiosco.completeOnboarding(storeName.trim(), nicheId, locationData);

        // Registro cloud en background (no bloqueante)
        registerMerchantRemotely({
          installationId: kiosco.businessConfig?.installationId || initialProfile.installationId,
          commerceId: initialProfile.commerceId,
          storeName: storeName.trim(),
          plan: kiosco.businessConfig?.plan || 'Básico',
          provinceCode: locationData.provinceCode,
          provinceName: locationData.provinceName,
          cityCode: locationData.cityCode,
          cityName: locationData.cityName,
          city: locationData.cityName,
          address: kiosco.businessConfig?.address || initialProfile.address || '',
          phone: kiosco.businessConfig?.phone || initialProfile.phone || '',
          installer: initialProfile.installer || '',
          appVersion: APP_VERSION
        }).catch(() => {});
      }
    }, 16);
  };

  // Paso 4: Loading de inicialización
  if (step === 4) {
    if (!loading) handleComplete();

    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div className="onboarding-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #1a1f36 0%, #2b3252 100%)', color: 'white' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '24px' }}>
          <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="40" cy="40" r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" />
            <circle cx="40" cy="40" r={radius} stroke="var(--color-primary)" strokeWidth="6" fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700 }}>
            {Math.round(progress)}%
          </div>
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: 800 }}>Configurando tu sistema...</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '12px' }}>Preparando el catálogo para {storeName}</p>
      </div>
    );
  }

  const stepProgress = (step / 3) * 100;

  return (
    <div className="onboarding-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', padding: '24px' }}>
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .niche-card {
          background: white; border: 2px solid transparent; border-radius: 16px; padding: 24px; text-align: center;
          cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.05); position: relative;
        }
        .niche-card:hover { transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        .niche-card.selected { border-color: var(--color-primary); background: rgba(66,133,244,0.05); }
      `}</style>

      <div style={{ background: 'white', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '48px', width: '100%', maxWidth: '800px' }}>
        
        {/* Barra de Progreso */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {step}
          </div>
          <div style={{ flex: 1, height: '4px', background: '#f0f0f0', borderRadius: '2px' }}>
            <div style={{ width: `${stepProgress}%`, height: '100%', background: 'var(--color-primary)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Paso {step} de 3</span>
        </div>

        {/* PASO 1: NOMBRE */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <img src="/logo.jpg" alt="Simple ProX Logo" style={{ width: '80px', height: '80px', borderRadius: '16px', marginBottom: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
            <h1 style={{ fontSize: '34px', fontWeight: 800, color: '#1a1f36', marginBottom: '16px' }}>
              ¡Bienvenido a Simple ProX! 👋
            </h1>
            <p style={{ fontSize: '17px', color: 'var(--color-text-muted)', marginBottom: '36px' }}>
              Para empezar a gestionar tu comercio, ingresa el nombre de tu negocio.
            </p>
            
            <div className="input-group">
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>Nombre del Negocio</label>
              <input 
                ref={inputRef}
                type="text" 
                placeholder="Ej. Despensa Los Amigos" 
                value={storeName} 
                onChange={e => setStoreName(e.target.value)}
                style={{ fontSize: '19px', padding: '16px 20px', width: '100%', borderRadius: '12px', border: '1px solid #cbd5e1' }}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleNext} 
                disabled={!storeName.trim()}
                style={{ padding: '16px 32px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                Siguiente <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 2: UBICACIÓN NORMALIZADA */}
        {step === 2 && (
          <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(37, 99, 235, 0.1)', borderRadius: '16px', color: 'var(--color-primary)', marginBottom: '16px' }}>
              <MapPin size={32} />
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1a1f36', marginBottom: '12px' }}>
              ¿Dónde se encuentra tu local? 📍
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--color-text-muted)', marginBottom: '32px' }}>
              Esta información permite conectarte con las ofertas comerciales y distribuidores mayoristas de tu zona.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '36px' }}>
              <div className="input-group">
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
                  Provincia
                </label>
                <select
                  value={provinceCode}
                  onChange={e => handleProvinceChange(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '16px', background: 'white' }}
                >
                  {ARGENTINA_PROVINCES.map(prov => (
                    <option key={prov.code} value={prov.code}>
                      {prov.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
                  Ciudad / Localidad
                </label>
                <select
                  value={cityCode}
                  onChange={e => setCityCode(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '16px', background: 'white' }}
                >
                  {availableCities.map(city => (
                    <option key={city.code} value={city.code}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setStep(1)} 
                style={{ padding: '16px 32px', fontSize: '16px' }}
              >
                Volver
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleNext} 
                style={{ padding: '16px 32px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                Siguiente <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: RUBRO / NICHO */}
        {step === 3 && (
          <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1a1f36', marginBottom: '14px' }}>
              ¿Cuál es tu rubro principal? 🏪
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--color-text-muted)', marginBottom: '32px' }}>
              Configuraremos el inventario inicial y categorías recomendadas para tu actividad.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
              {Object.values(NICHES).map(niche => (
                <div 
                  key={niche.id} 
                  className={`niche-card ${nicheId === niche.id ? 'selected' : ''}`}
                  onClick={() => setNicheId(niche.id)}
                >
                  <div style={{ color: nicheId === niche.id ? 'var(--color-primary)' : '#666', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                    {ICONS[niche.id] || <Store size={32} />}
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#1a1f36' }}>
                    {niche.name}
                  </h3>
                  {nicheId === niche.id && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', color: 'var(--color-primary)' }}>
                      <CheckCircle2 size={20} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setStep(2)} 
                style={{ padding: '16px 32px', fontSize: '16px' }}
              >
                Volver
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleNext} 
                disabled={!nicheId}
                style={{ padding: '16px 32px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                Comenzar <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
