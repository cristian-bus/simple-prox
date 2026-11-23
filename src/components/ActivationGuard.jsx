import React, { useState, useRef } from 'react';
import { Shield, KeyRound, Building2, MapPin, Phone, UserCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { registerMerchantRemotely } from '../services/adSyncEngine';
import { verifyBasicActivationCertificate } from '../utils/licenseCrypto';
import { processActivation } from '../services/activationService';
import { getInstallationId } from '../services/installationService';
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
      setErrorMsg('Ingresa la Clave Maestra de activación.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);

    try {
      // Obtener o preservar el installationId exacto
      const effectiveId = kiosco?.businessConfig?.installationId || getInstallationId();

      // Solicitar activación remota con Clave Maestra a la Edge Function
      const activationRes = await processActivation({
        negocio: negocio.trim(),
        direccion: direccion.trim(),
        telefono: telefono.trim(),
        instalador: instalador.trim(),
        masterKeyInput: masterKeyInput.trim(),
        installationId: effectiveId,
        version: APP_VERSION
      });

      if (!activationRes.success) {
        isSubmittingRef.current = false;
        setErrorMsg(activationRes.error || 'Error al autorizar la activación del equipo.');
        setLoading(false);
        return;
      }

      const receivedToken = activationRes.token;

      // Verificar local y criptográficamente el certificado básico recibido antes de guardar
      const verifyRes = await verifyBasicActivationCertificate(receivedToken, effectiveId);

      if (!verifyRes.valid) {
        isSubmittingRef.current = false;
        setErrorMsg(verifyRes.error || 'El certificado digital recibido del servidor no es válido.');
        setLoading(false);
        return;
      }

      // Preparar payload de activación sin guardar la clave maestra
      const activationPayload = {
        isActivated: true,
        activatedAt: new Date().toISOString(),
        negocio: negocio.trim(),
        direccion: direccion.trim(),
        telefono: telefono.trim(),
        instalador: instalador.trim(),
        hardwareId: verifyRes.payload?.installationData?.hardwareId || ('PC-' + Math.random().toString(36).substring(2, 9).toUpperCase())
      };

      const updatedConfig = {
        ...kiosco.businessConfig,
        installationId: effectiveId,
        name: negocio.trim(),
        storeName: negocio.trim(),
        address: direccion.trim(),
        phone: telefono.trim(),
        isActivated: true,
        plan: 'Básico', // Siempre inicia en Plan Básico garantizado
        activationData: activationPayload
      };

      // Guardar el token firmado digitalmente en localStorage para verificaciones offline futuras
      localStorage.setItem('kioscoprox_license_token', receivedToken);

      // Si el servidor aprovisionó credencial de terminal para telemetría, guardarla de forma segura
      if (activationRes.terminalToken) {
        try {
          const { storeTerminalToken } = await import('../services/terminalIdentityService');
          await storeTerminalToken(activationRes.terminalToken);
        } catch (tokenErr) {
          console.warn('[ActivationGuard] Advertencia al guardar credencial de terminal:', tokenErr);
        }
      }

      // Guardar síncronamente en localStorage de inmediato
      try {
        localStorage.setItem('kioscoprox_business_config', JSON.stringify(updatedConfig));
        localStorage.setItem('kioscoprox_merchant_registration', JSON.stringify({
          installationId: effectiveId,
          storeName: negocio.trim(),
          plan: 'Básico',
          address: direccion.trim(),
          phone: telefono.trim(),
          installer: instalador.trim(),
          city: verifyRes.payload?.installationData?.geo?.city || '',
          ip: verifyRes.payload?.installationData?.geo?.ip || '',
          appVersion: APP_VERSION,
          lastActive: new Date().toISOString()
        }));
      } catch(e) {}

      kiosco.updateBusinessConfig(updatedConfig);

      // Registrar asíncronamente en Supabase para el panel admin
      try {
        await registerMerchantRemotely({
          installationId: effectiveId,
          storeName: negocio.trim(),
          plan: 'Básico',
          address: direccion.trim(),
          phone: telefono.trim(),
          installer: instalador.trim(),
          city: verifyRes.payload?.installationData?.geo?.city || '',
          ip: verifyRes.payload?.installationData?.geo?.ip || '',
          appVersion: APP_VERSION
        });
      } catch(err) {
        console.warn('[ActivationGuard] Advertencia al sincronizar con Supabase:', err);
      }

      // Limpiar input de clave maestra de la memoria del componente
      setMasterKeyInput('');
      setSuccessMsg('¡Equipo activado con éxito en Plan Básico! Iniciando sistema...');

      setTimeout(() => {
        if (onActivated) onActivated();
      }, 700);

    } catch (err) {
      isSubmittingRef.current = false;
      setErrorMsg('Error durante el proceso de activación. Verifique su conexión.');
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
            Para habilitar Simple ProX en este equipo, ingresa los datos del comercio y la Clave Maestra de Administrador.
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
                placeholder="Ingresa la clave maestra del administrador..."
                value={masterKeyInput}
                onChange={e => setMasterKeyInput(e.target.value)}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #3b82f6',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '15px',
                  letterSpacing: '1px',
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
                <span>Activando en el servidor...</span>
              </>
            ) : (
              <span>Activar Terminal en Plan Básico</span>
            )}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px dashed rgba(255, 255, 255, 0.15)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
              🛠️ Entorno de Desarrollo Aislado (Solo Dev)
            </div>
            <button
              type="button"
              onClick={async () => {
                const { startLocalDemo } = await import('../utils/devDemoMode.js');
                startLocalDemo();
              }}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'rgba(124, 58, 237, 0.15)',
                border: '1px solid #7c3aed',
                borderRadius: '12px',
                color: '#c4b5fd',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <span>🧪 Probar Demo Local (Sin Licencia ni Supabase)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

