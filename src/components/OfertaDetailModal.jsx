import React, { useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Tag, 
  Building2, 
  CheckCircle2, 
  Sparkles,
  Package,
  Truck,
  Calendar,
  Copy
} from 'lucide-react';
import { calculateDiscount, formatVigenciaText } from '../utils/b2bUtils';
import { ShoppingCart, Plus } from 'lucide-react';

export function OfertaDetailModal({
  isOpen,
  campaign,
  onClose,
  onWhatsAppClick,
  onAddToCart,
  cartQty = 0
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !campaign) return null;

  const handleCopyCode = () => {
    if (campaign.campaignCode) {
      navigator.clipboard.writeText(campaign.campaignCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedPrice = campaign.price ? `$${Number(campaign.price).toLocaleString('es-AR')}` : null;
  const formattedRegular = campaign.regularPrice ? `$${Number(campaign.regularPrice).toLocaleString('es-AR')}` : null;
  const discountInfo = calculateDiscount(campaign.price, campaign.regularPrice);
  const vigenciaClean = formatVigenciaText(campaign.startDate, campaign.endDate);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        width: '100%',
        maxWidth: '520px',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.1), 0 10px 15px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        color: '#0F172A',
        fontFamily: 'Inter, system-ui, sans-serif',
        animation: 'fadeInScale 0.15s ease-out'
      }}>
        
        {/* Cabecera / Banner */}
        <div style={{ position: 'relative', height: '170px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          {campaign.imageUrl ? (
            <img 
              src={campaign.imageUrl} 
              alt={campaign.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#CBD5E1' }}>
              <Tag size={44} />
            </div>
          )}

          {/* Botón Cerrar */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
            }}
          >
            <X size={16} />
          </button>

          {/* Badge Descuento */}
          {discountInfo.isValid && (
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '12px',
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
            }}>
              <Sparkles size={13} />
              <span>{discountInfo.badgeText}</span>
            </div>
          )}
        </div>

        {/* Cuerpo del Modal */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Proveedor & Categoría */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '13px' }}>
              <Building2 size={15} color="#94A3B8" />
              <span style={{ fontWeight: 600, color: '#334155' }}>{campaign.supplierName}</span>
            </div>
            <span style={{ 
              backgroundColor: '#EFF6FF', 
              color: '#2563EB', 
              fontSize: '11px', 
              fontWeight: 700, 
              padding: '3px 8px', 
              borderRadius: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.4px'
            }}>
              {campaign.category || 'Oferta B2B'}
            </span>
          </div>

          {/* Título */}
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.35 }}>
            {campaign.title}
          </h2>

          {/* Precio, Comparativa y Ahorro */}
          {formattedPrice && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '6px', 
              backgroundColor: '#F8FAFC', 
              padding: '14px', 
              borderRadius: '10px', 
              border: '1px solid #E2E8F0' 
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
                  {formattedPrice}
                </span>
                {formattedRegular && (
                  <span style={{ fontSize: '14px', color: '#94A3B8', textDecoration: 'line-through' }}>
                    {formattedRegular}
                  </span>
                )}
                {campaign.unitPrice && (
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#475569', backgroundColor: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontWeight: 500 }}>
                    ${campaign.unitPrice} c/u
                  </span>
                )}
              </div>
              
              {discountInfo.isValid && (
                <div style={{ fontSize: '13px', color: '#16A34A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Tag size={13} />
                  Ahorrás {discountInfo.formattedSavings} en esta compra ({discountInfo.percentage.toLocaleString('es-AR')}% de descuento real)
                </div>
              )}
            </div>
          )}

          {/* Condiciones B2B */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: '#F8FAFC',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            fontSize: '13px'
          }}>
            {campaign.minPurchase && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
                <Package size={16} />
                <span><strong>Compra mínima:</strong> {campaign.minPurchaseType === 'U.' ? '' : '$'}{Number(campaign.minPurchase).toLocaleString('es-AR')}{campaign.minPurchaseType === 'U.' ? ' U.' : ''}</span>
              </div>
            )}
            {campaign.conditions && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                <Truck size={14} color="#2563EB" />
                <span><strong>Condiciones / Envío:</strong> {campaign.conditions}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
              <Calendar size={14} color="#64748B" />
              <span>
                <strong>Vigencia:</strong> {vigenciaClean}
              </span>
            </div>
          </div>

          {/* Descripción */}
          {campaign.description && (
            <div>
              <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#64748B', margin: '0 0 4px 0', fontWeight: 600 }}>
                Detalles de la Oferta
              </h4>
              <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                {campaign.description}
              </p>
            </div>
          )}

          {/* Código de Campaña */}
          {campaign.campaignCode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F1F5F9',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed #CBD5E1',
              marginTop: '4px'
            }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                  Código de Oferta
                </span>
                <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {campaign.campaignCode}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: copied ? '#DCFCE7' : '#FFFFFF',
                  color: copied ? '#16A34A' : '#475569',
                  border: `1px solid ${copied ? '#86EFAC' : '#E2E8F0'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          )}

          {/* Beneficios clave B2B */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CheckCircle2 size={13} color="#16A34A" />
              <span>Compra directa al mayorista</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CheckCircle2 size={13} color="#16A34A" />
              <span>Sin comisiones intermedias</span>
            </div>
          </div>
        </div>

        {/* Footer / CTA WhatsApp */}
        <div style={{
          padding: '14px 20px',
          backgroundColor: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>

          {onAddToCart && (
            <button
              onClick={() => onAddToCart(campaign)}
              style={{
                padding: '10px 16px',
                backgroundColor: cartQty > 0 ? '#EFF6FF' : '#FFFFFF',
                border: `1px solid ${cartQty > 0 ? '#BFDBFE' : '#CBD5E1'}`,
                borderRadius: '8px',
                color: '#2563EB',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <ShoppingCart size={15} />
              <span>{cartQty > 0 ? `En Pedido (${cartQty}) +` : '+ Agregar al Pedido'}</span>
            </button>
          )}

          <button
            onClick={() => onWhatsAppClick(campaign)}
            style={{
              flex: 1,
              padding: '10px 18px',
              backgroundColor: '#10B981',
              border: 'none',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#10B981'}
          >
            <MessageCircle size={16} />
            <span>Consultar Mayorista</span>
          </button>
        </div>

      </div>
    </div>
  );
}

export default OfertaDetailModal;
