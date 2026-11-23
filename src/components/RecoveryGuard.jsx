import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getPendingRecoveryJournal,
  performIdempotentRollback,
  clearRecoveryJournal,
  saveRecoveryJournal,
  verifySnapshotIntegrity,
  JOURNAL_STATUS
} from '../services/recoveryService.js';

/**
 * Componente Guardia de Recuperación de Nivel Raíz para Simple ProX
 * Se monta antes que cualquier componente comercial (Punto de Venta, useKiosco, etc.).
 * Si detecta una restauración interrumpida, bloquea el montaje de App para evitar que
 * React sobrescriba localStorage con estados antiguos o corruptos.
 */
export default function RecoveryGuard({ children }) {
  const [checking, setChecking] = useState(true);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [pendingJournal, setPendingJournal] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function checkSystemIntegrity() {
      try {
        const journal = await getPendingRecoveryJournal();
        if (isMounted) {
          if (journal && journal.status && journal.status !== JOURNAL_STATUS.IDLE && journal.status !== JOURNAL_STATUS.COMMITTED) {
            setPendingJournal(journal);
            setRecoveryRequired(true);
          } else {
            setRecoveryRequired(false);
          }
          setChecking(false);
        }
      } catch (err) {
        console.error('[RecoveryGuard] Error comprobando estado de recuperación:', err);
        if (isMounted) {
          setChecking(false);
        }
      }
    }

    checkSystemIntegrity();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleExecuteRollback = async () => {
    setRecovering(true);
    setErrorMsg(null);

    try {
      if (!pendingJournal) {
        throw new Error('No se encontró información del journal de restauración.');
      }

      // Marcar estado en progreso de rollback
      const updatedJournal = {
        ...pendingJournal,
        status: JOURNAL_STATUS.RECOVERING,
        recoveryAttemptAt: new Date().toISOString()
      };
      await saveRecoveryJournal(updatedJournal);

      // Obtener snapshot: desde Electron o datos locales adjuntos
      let snapshot = pendingJournal.snapshotData || null;

      if (!snapshot && pendingJournal.snapshotPath && typeof window !== 'undefined' && window.api && typeof window.api.recoveryReadSnapshot === 'function') {
        const readResult = await window.api.recoveryReadSnapshot(pendingJournal.snapshotPath);
        if (readResult && readResult.success && readResult.snapshot) {
          snapshot = readResult.snapshot;
        } else {
          throw new Error(readResult?.error || 'No se pudo leer el archivo físico del snapshot de emergencia.');
        }
      }

      if (!snapshot) {
        throw new Error('Snapshot de emergencia no disponible o inaccesible. No se puede garantizar la integridad.');
      }

      // Validar integridad antes de tocar localStorage
      const verifyRes = await verifySnapshotIntegrity(snapshot);
      if (!verifyRes.valid) {
        throw new Error(`Snapshot dañado: ${verifyRes.error}. El sistema permanece bloqueado para prevenir corrupción.`);
      }

      // Ejecutar rollback idempotente
      const rollbackRes = await performIdempotentRollback(snapshot, localStorage);
      if (!rollbackRes.success) {
        throw new Error(rollbackRes.error || 'Falló la aplicación del rollback en almacenamiento.');
      }

      // Rollback exitoso: marcar COMMITTED y limpiar journal
      const committedJournal = {
        ...updatedJournal,
        status: JOURNAL_STATUS.COMMITTED,
        completedAt: new Date().toISOString()
      };
      await saveRecoveryJournal(committedJournal);
      await clearRecoveryJournal();

      setRecovered(true);
      setRecovering(false);
    } catch (err) {
      console.error('[RecoveryGuard] Error ejecutando rollback:', err);
      setErrorMsg(err.message || 'Error inesperado durante la recuperación.');
      setRecovering(false);
    }
  };

  const handleReloadApp = () => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  // 1. Estado de verificación inicial breve
  if (checking) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ fontSize: '15px', color: '#94a3b8' }}>Verificando integridad del sistema...</div>
      </div>
    );
  }

  // 2. Pantalla de bloqueo si se detectó restauración interrumpida
  if (recoveryRequired && !recovered) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '560px',
          width: '100%',
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              padding: '12px',
              borderRadius: '12px',
              color: '#ef4444',
              display: 'flex'
            }}>
              <ShieldAlert size={36} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
                Restauración Interrumpida Detectada
              </h2>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                Simple ProX — Protección de Integridad Comercial
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#cbd5e1',
            border: '1px solid #334155'
          }}>
            <p style={{ margin: '0 0 12px 0' }}>
              Se detectó un corte de energía o interrupción inesperada mientras se restauraban los datos del sistema.
            </p>
            <p style={{ margin: 0, color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} />
              El Punto de Venta permanece bloqueado para evitar ventas o pérdidas con datos inconsistentes.
            </p>
          </div>

          {errorMsg && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              padding: '14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              <strong>No se pudo completar el rollback:</strong> {errorMsg}
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                El sistema continuará bloqueado hasta restaurar un estado íntegro y verificado.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleExecuteRollback}
              disabled={recovering}
              style={{
                flex: 1,
                padding: '14px 20px',
                backgroundColor: recovering ? '#475569' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: recovering ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background-color 0.2s'
              }}
            >
              {recovering ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Recuperando datos anteriores...
                </>
              ) : (
                'Recuperar Estado Seguro Anterior'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Pantalla de confirmación tras rollback exitoso
  if (recovered) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '520px',
          width: '100%',
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            color: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto'
          }}>
            <CheckCircle2 size={40} />
          </div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: 700 }}>
            Estado Anterior Recuperado con Éxito
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', margin: '0 0 24px 0' }}>
            Se ha restaurado el 100% de los datos comerciales y credenciales previas al intento interrumpido.
            La integridad ha sido verificada criptográficamente.
          </p>
          <button
            onClick={handleReloadApp}
            style={{
              width: '100%',
              padding: '14px 20px',
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Iniciar Simple ProX
          </button>
        </div>
      </div>
    );
  }

  // 4. Operación Normal: Renderizar App y componentes comerciales intactos
  return children;
}

