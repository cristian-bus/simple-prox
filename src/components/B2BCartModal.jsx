import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  MessageCircle, 
  ArrowRight,
  Package
} from 'lucide-react';
import { groupB2BCartBySupplier, formatB2BOrderMessage } from '../utils/b2bOrderFormatter';
import { buildWhatsAppUrl } from '../services/adSyncEngine';

export default function B2BCartModal({ 
  isOpen, 
  onClose, 
  cartItems, 
  onUpdateQty, 
  onRemoveItem, 
  onClearCart,
  storeData = {}
}) {
  if (!isOpen) return null;

  // Agrupar items por mayorista
  const supplierGroups = useMemo(() => {
    return groupB2BCartBySupplier(cartItems);
  }, [cartItems]);

  const [activeSupplierIndex, setActiveSupplierIndex] = useState(0);

  // Asegurarse de que el índice seleccionado sea válido
  const validIndex = activeSupplierIndex < supplierGroups.length ? activeSupplierIndex : 0;
  const currentGroup = supplierGroups[validIndex] || null;

  const totalCartUnits = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + (it.qty || 0), 0);
  }, [cartItems]);

  const totalCartMoney = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + ((Number(it.campaign?.price) || 0) * (it.qty || 0)), 0);
  }, [cartItems]);

  const handleSendWhatsApp = (group) => {
    if (!group || !group.whatsappNumber) {
      alert("El distribuidor de esta oferta no tiene configurado un número de WhatsApp oficial.");
      return;
    }

    const message = formatB2BOrderMessage(group, storeData);
    const url = buildWhatsAppUrl(group.whatsappNumber, message, null, null);

    if (url === '#') {
      alert("El número de WhatsApp no es válido.");
      return;
    }

    try {
      if (window.api && window.api.openExternal) {
        window.api.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(3px)',
        padding: '16px'
      }}
    >
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Cabecera del Modal */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#F8FAFC'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                Pedido Mayorista B2B
              </h2>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                {totalCartUnits} {totalCartUnits === 1 ? 'unidad' : 'unidades'} seleccionadas · Total estimado: ${totalCartMoney.toLocaleString('es-AR')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {cartItems.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm("¿Estás seguro de que deseas vaciar el pedido mayorista?")) {
                    onClearCart();
                  }
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#EF4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '6px'
                }}
              >
                <Trash2 size={13} />
                <span>Vaciar</span>
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Pestañas de Mayoristas si hay más de 1 */}
        {supplierGroups.length > 1 && (
          <div style={{
            padding: '8px 24px',
            backgroundColor: '#F1F5F9',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto'
          }}>
            {supplierGroups.map((grp, idx) => {
              const isActive = validIndex === idx;
              return (
                <button
                  key={grp.supplierName}
                  onClick={() => setActiveSupplierIndex(idx)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: isActive ? 700 : 500,
                    backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                    color: isActive ? '#2563EB' : '#475569',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Building2 size={13} />
                  <span>{grp.supplierName}</span>
                  <span style={{
                    backgroundColor: isActive ? '#EFF6FF' : '#E2E8F0',
                    color: isActive ? '#2563EB' : '#64748B',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '11px'
                  }}>
                    {grp.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Cuerpo con lista de items */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {cartItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                color: '#CBD5E1'
              }}>
                <ShoppingCart size={28} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#475569', margin: '0 0 6px 0' }}>
                Tu pedido mayorista está vacío
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                Explora las promociones y haz clic en <strong>"+ Agregar"</strong> para armar tu pedido.
              </p>
            </div>
          ) : currentGroup ? (
            <>
              {/* Resumen del Mayorista y Compra Mínima */}
              <div style={{
                padding: '14px 16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={16} color="#2563EB" />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                      {currentGroup.supplierName}
                    </span>
                  </div>

                  {currentGroup.minPurchase ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <span style={{ color: '#64748B' }}>Compra mínima:</span>
                      <strong style={{ color: currentGroup.subtotal >= currentGroup.minPurchase ? '#16A34A' : '#D97706' }}>
                        ${currentGroup.minPurchase.toLocaleString('es-AR')}
                      </strong>
                    </div>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 600 }}>
                      Sin compra mínima fijada
                    </span>
                  )}
                </div>

                {/* Barra de progreso si tiene compra mínima */}
                {currentGroup.minPurchase && (
                  <div>
                    <div style={{
                      height: '6px',
                      backgroundColor: '#E2E8F0',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, Math.round((currentGroup.subtotal / currentGroup.minPurchase) * 100))}%`,
                        backgroundColor: currentGroup.subtotal >= currentGroup.minPurchase ? '#10B981' : '#F59E0B',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px' }}>
                      <span style={{ color: currentGroup.subtotal >= currentGroup.minPurchase ? '#16A34A' : '#64748B', fontWeight: 500 }}>
                        {currentGroup.subtotal >= currentGroup.minPurchase ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> ¡Alcanzaste el monto mínimo de compra!
                          </span>
                        ) : (
                          `Faltan $${Math.max(0, currentGroup.minPurchase - currentGroup.subtotal).toLocaleString('es-AR')} para el mínimo`
                        )}
                      </span>
                      <span style={{ color: '#94A3B8' }}>
                        {Math.min(100, Math.round((currentGroup.subtotal / currentGroup.minPurchase) * 100))}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de productos del mayorista */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {currentGroup.items.map(it => {
                  const unitPrice = Number(it.campaign.price) || 0;
                  const itemTotal = unitPrice * it.qty;
                  return (
                    <div 
                      key={it.campaign.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        gap: '12px'
                      }}
                    >
                      {/* Imagen o Ícono */}
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '8px',
                        backgroundColor: '#F1F5F9',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {it.campaign.imageUrl ? (
                          <img 
                            src={it.campaign.imageUrl} 
                            alt={it.campaign.title} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        ) : (
                          <Package size={20} color="#94A3B8" />
                        )}
                      </div>

                      {/* Info del producto */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ 
                          fontSize: '13.5px', 
                          fontWeight: 600, 
                          color: '#0F172A', 
                          margin: '0 0 2px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {it.campaign.title}
                        </h4>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          ${unitPrice.toLocaleString('es-AR')} c/u
                        </div>
                      </div>

                      {/* Controles de Cantidad */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(it.campaign.id, it.qty - 1)}
                          style={{
                            padding: '6px 9px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          <Minus size={13} />
                        </button>
                        <span style={{ 
                          padding: '0 8px', 
                          fontSize: '13px', 
                          fontWeight: 700, 
                          color: '#0F172A',
                          minWidth: '24px',
                          textAlign: 'center'
                        }}>
                          {it.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(it.campaign.id, it.qty + 1)}
                          style={{
                            padding: '6px 9px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      {/* Subtotal del item */}
                      <div style={{ textAlign: 'right', minWidth: '90px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          ${itemTotal.toLocaleString('es-AR')}
                        </div>
                      </div>

                      {/* Botón eliminar item */}
                      <button
                        type="button"
                        onClick={() => onRemoveItem(it.campaign.id)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#94A3B8',
                          cursor: 'pointer',
                          padding: '6px'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                        title="Quitar de la lista"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer del Modal con Total y CTA WhatsApp */}
        {currentGroup && (
          <div style={{
            padding: '16px 24px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#64748B', fontWeight: 600, display: 'block' }}>
                Total para {currentGroup.supplierName}:
              </span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>
                ${currentGroup.subtotal.toLocaleString('es-AR')}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Seguir Comprando
              </button>

              <button
                type="button"
                onClick={() => handleSendWhatsApp(currentGroup)}
                style={{
                  padding: '10px 22px',
                  backgroundColor: '#10B981',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#FFFFFF',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                <MessageCircle size={17} />
                <span>Pedir por WhatsApp ({currentGroup.items.length})</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
