import React, { useState, useRef } from 'react';
import { Shield, KeyRound, Building2, MapPin, Phone, UserCheck, AlertCircle, CheckCircle2, Loader2, Settings, Send } from 'lucide-react';
import { processActivation, testTelegramNotification } from '../services/activationService';
import { registerMerchantRemotely } from '../services/adSyncEngine';
import { APP_VERSION } from '../constants/version';

export default function ActivationGuard({ kiosco, onActivated }) {
  const [negocio, setNegocio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [instalador, setInstalador] = useState('');
  const [masterKeyInput, setMasterKeyInput] = useState('');

  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal para configurar Telegram Bot / Clave Maestra
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [remoteUrl, setRemoteUrl] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.remoteConfigUrl || '';
  });
  const [botToken, setBotToken] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.telegramBotToken || '';
  });
  const [chatId, setChatId] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.telegramChatId || '';
  });
  const [localMasterKey, setLocalMasterKey] = useState(() => {
    const config = JSON.parse(localStorage.getItem('kioscoprox_remote_config') || '{}');
    return config.masterKey || 'ProX2026MasterKey';
  });

  const handleTestTelegram = async () => {
    setTestLoading(true);
    setTestResult(null);
    const res = await testTelegramNotification(botToken.trim(), chatId.trim());
    setTestResult(res);
    setTestLoading(false);
  };

  const handleSaveConfig = () => {
    const newConfig = {
      remoteConfigUrl: remoteUrl.trim(),
      telegramBotToken: botToken.trim(),
      telegramChatId: chatId.trim(),
      masterKey: localMasterKey.trim()
    };
    localStorage.setItem('kioscoprox_remote_config', JSON.stringify(newConfig));
    setShowConfigModal(false);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return;

    setErrorMsg('');
    setSuccessMsg('');

    if (!negocio.trim()) {
      setErrorMsg('Por favor ingresa el nombre del kiosco o negocio.');
      return;
    }
    if (!direccion.trim()) {
      setErrorMsg('Por favor ingresa la dirección del comercio.');
      return;
    }
    if (!instalador.trim()) {
      setErrorMsg('Por favor ingresa el nombre de quien está realizando la instalación.');
      return;
    }
    if (!masterKeyInput.trim()) {
      setErrorMsg('Ingresa la Clave Maestra de Activación.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const res = await processActivation({
        negocio: negocio.trim(),
        direccion: direccion.trim(),
        telefono: telefono.trim(),
        instalador: instalador.trim(),
        masterKeyInput: masterKeyInput.trim(),
        version: APP_VERSION
      });

      if (!res.success) {
        isSubmittingRef.current = false;
        setErrorMsg(res.error || 'La Clave Maestra es incorrecta.');
        setLoading(false);
        return;
      }

      const effectiveId = kiosco.businessConfig?.installationId || Math.random().toString(36).substring(2, 10).toUpperCase();

      const activationPayload = {
        isActivated: true,
        activatedAt: new Date().toISOString(),
        negocio: negocio.trim(),
        direccion: direccion.trim(),
        telefono: telefono.trim(),
        instalador: instalador.trim(),
        hardwareId: res.installationData.hardwareId
      };

      const updatedConfig = {
        ...kiosco.businessConfig,
        installationId: effectiveId,
        name: negocio.trim(),
        storeName: negocio.trim(),
        address: direccion.trim(),
        phone: telefono.trim(),
        isActivated: true,
        plan: kiosco.businessConfig?.plan || 'Básico',
        activationData: activationPayload
      };

      // Guardar síncronamente en localStorage de inmediato
      try {
        localStorage.setItem('kioscoprox_business_config', JSON.stringify(updatedConfig));
        localStorage.setItem('kioscoprox_merchant_registration', JSON.stringify({
          installationId: effectiveId,
          storeName: negocio.trim(),
          plan: kiosco.businessConfig?.plan || 'Básico',
          address: direccion.trim(),
          phone: telefono.trim(),
          installer: instalador.trim(),
          city: res.installationData.geo?.city || '',
          ip: res.installationData.geo?.ip || '',
          appVersion: APP_VERSION,
          lastActive: new Date().toISOString()
        }));
      } catch(e) {}

      kiosco.updateBusinessConfig(updatedConfig);

      // Registrar inmediatamente en Supabase con todos los datos recibidos (esperando para garantizar envío)
      try {
        await registerMerchantRemotely({
          installationId: effectiveId,
          storeName: negocio.trim(),
          plan: kiosco.businessConfig?.plan || 'Básico',
          address: direccion.trim(),
          phone: telefono.trim(),
          installer: instalador.trim(),
          city: res.installationData.geo?.city || '',
          ip: res.installationData.geo?.ip || '',
          appVersion: APP_VERSION
        });
      } catch(err) {
        console.warn('[ActivationGuard] Advertencia al sincronizar con Supabase:', err);
      }

      setSuccessMsg('¡Licencia activada con éxito! Notificación enviada.');

      setTimeout(() => {
        if (onActivated) onActivated();
      }, 700);

    } catch (err) {
      isSubmittingRef.current = false;
      setErrorMsg('Error al conectar con el servicio de verificación. Verifica tu conexión a internet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f172a',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: '#1e293b',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        padding: '36px',
        color: '#f8fafc',
        position: 'relative'
      }}>
        {/* Formulario de Activación */}

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#3b82f6',
            marginBottom: '16px'
          }}>
            <Shield size={36} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
            Activación del Sistema
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, lineHeight: 1.4 }}>
            Para habilitar KioscoProX en este equipo, ingresa los datos del comercio y la Clave Maestra de Administrador.
          </p>
        </div>

        {errorMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            color: '#fca5a5',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            color: '#86efac',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleActivate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Nombre del Kiosco / Comercio *
            </label>
            <div style={{ position: 'relative' }}>
              <Building2 size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="ej. Kiosco El Paso"
                value={negocio}
                onChange={e => setNegocio(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Dirección del Local *
            </label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="ej. Av. Corrientes 2450, CABA"
                value={direccion}
                onChange={e => setDireccion(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Teléfono del Cliente
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="ej. 11-1234-5678"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Instalado por *
              </label>
              <div style={{ position: 'relative' }}>
                <UserCheck size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Nombre de técnico"
                  value={instalador}
                  onChange={e => setInstalador(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Clave Maestra de Activación *
            </label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#3b82f6' }} />
              <input
                type="password"
                placeholder="••••••••••••"
                value={masterKeyInput}
                onChange={e => setMasterKeyInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #3b82f6',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '15px',
                  letterSpacing: '2px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '14px',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Verificando Clave en Nube...</span>
              </>
            ) : (
              <span>Activar Licencia del Sistema</span>
            )}
          </button>
        </form>
      </div>

      {/* Modal de Configuración de Telegram y Servidor Nube */}
      {showConfigModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '28px',
            color: '#f8fafc'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0', color: '#ffffff' }}>
              Configuración de Notificaciones y Clave
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px', color: '#cbd5e1' }}>
                  Telegram Bot Token:
                </label>
                <input
                  type="text"
                  placeholder="ej. 123456789:ABCdefGHIjklMNOpqrs"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px', color: '#cbd5e1' }}>
                  Telegram Chat ID (Tu Celular):
                </label>
                <input
                  type="text"
                  placeholder="ej. 987654321"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px', color: '#cbd5e1' }}>
                  URL de Clave Maestra Remota (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="https://api.jsonbin.io/v3/b/... o Supabase"
                  value={remoteUrl}
                  onChange={e => setRemoteUrl(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px', color: '#cbd5e1' }}>
                  Clave Maestra Local de Respaldo:
                </label>
                <input
                  type="text"
                  value={localMasterKey}
                  onChange={e => setLocalMasterKey(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                />
              </div>
            </div>

            {testResult && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                backgroundColor: testResult.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: testResult.success ? '#86efac' : '#fca5a5',
                border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {testResult.success ? testResult.message : testResult.error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={testLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 14px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  borderRadius: '8px',
                  color: '#60a5fa',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: testLoading ? 'wait' : 'pointer'
                }}
              >
                <Send size={15} />
                {testLoading ? 'Enviando...' : 'Probar Notificación'}
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowConfigModal(false)}
                  style={{ padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #475569', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer', fontSize: '13px' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveConfig}
                  style={{ padding: '9px 16px', backgroundColor: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
