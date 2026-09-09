import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { subscribeUpdate, applyUpdateSafe, UPDATE_STATUS } from '../services/updateService';

/**
 * Componente no invasivo para notificar actualizaciones descargadas
 * en la pantalla de Ventas (PuntoDeVenta).
 */
export default function UpdateNotificationPill({ kiosco }) {
  const [updateState, setUpdateState] = useState({
    status: UPDATE_STATUS.IDLE,
    updateInfo: null,
    progress: null
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeUpdate(setUpdateState);
    return () => unsubscribe();
  }, []);

  const isDownloading = updateState.status === UPDATE_STATUS.DOWNLOADING;
  const isReady = updateState.status === UPDATE_STATUS.READY_TO_INSTALL;
  const version = updateState.updateInfo?.version || '';

  if (!isDownloading && !isReady) {
    return null;
  }

  const handlePillClick = () => {
    if (isReady) {
      setShowConfirmModal(true);
    }
  };

  const handleApplyNow = () => {
    setShowConfirmModal(false);
    applyUpdateSafe(true);
  };

  const isCajaOpen = !!kiosco?.caja?.isOpen;

  return (
    <>
      {/* Pill en la barra superior */}
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        {isDownloading && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: '12px',
              fontWeight: 600
            }}
            title="Descargando actualización en segundo plano"
          >
            <RefreshCw size={13} className="spin" style={{ animation: 'spin 2s linear infinite' }} />
            <span>Descargando v{version} {updateState.progress?.percent ? `(${Math.round(updateState.progress.percent)}%)` : ''}</span>
          </div>
        )}

        {isReady && (
          <button
            type="button"
            onClick={handlePillClick}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px',
              borderRadius: '20px',
              backgroundColor: '#ecfdf5',
              border: '1.5px solid #10b981',
              color: '#065f46',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
              transition: 'all 0.2s ease',
              outline: 'none'
            }}
            title="Haz clic para aplicar la nueva versión"
          >
            <Sparkles size={14} color="#10b981" />
            <span>v{version} lista</span>
            <span
              style={{
                backgroundColor: '#10b981',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              Reiniciar <ArrowRight size={11} />
            </span>
          </button>
        )}
      </div>

      {/* Modal explicativo y seguro si el usuario hace clic */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }} onClick={() => setShowConfirmModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '440px', padding: '28px', textAlign: 'center', borderRadius: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#d1fae5',
                color: '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}
            >
              <Sparkles size={28} />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#111827' }}>
              Simple ProX v{version} Lista
            </h3>
            <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              La actualización se descargó en segundo plano y está lista para instalarse.
            </p>

            {isCajaOpen ? (
              <div
                style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fef3c7',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                  textAlign: 'left',
                  display: 'flex',
                  gap: '10px'
                }}
              >
                <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: '#92400e', lineHeight: 1.4 }}>
                  <strong>Tienes un turno de caja abierto.</strong>
                  <br />
                  Se instalará automáticamente cuando cierres el sistema al finalizar tu turno. O puedes reiniciar ahora si no estás cobrando.
                </div>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #dcfce7',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  color: '#166534'
                }}
              >
                No hay turno de caja abierto. La aplicación se reiniciará en 5 segundos con todas las mejoras aplicadas.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setShowConfirmModal(false)}
              >
                {isCajaOpen ? 'Instalar al cerrar caja' : 'Más tarde'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#059669',
                  borderColor: '#059669',
                  color: '#ffffff',
                  fontWeight: 700
                }}
                onClick={handleApplyNow}
              >
                Reiniciar ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
