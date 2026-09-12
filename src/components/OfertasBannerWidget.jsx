import React, { useState, useEffect } from 'react';
import { Tag, ChevronLeft, ChevronRight, Sparkles, ShoppingBag } from 'lucide-react';

export default function OfertasBannerWidget({ ofertas }) {
  const { 
    showAds, 
    activeCampaign, 
    openCampaignDetail, 
    campaigns, 
    currentAdIndex,
    nextAd,
    prevAd,
    goToAd,
    setIsHovered
  } = ofertas;

  const [fadeAnim, setFadeAnim] = useState(true);

  // Efecto suave de transición al cambiar de anuncio
  useEffect(() => {
    setFadeAnim(false);
    const t = setTimeout(() => setFadeAnim(true), 50);
    return () => clearTimeout(t);
  }, [activeCampaign?.id, currentAdIndex]);

  if (!showAds || !activeCampaign) {
    return null;
  }

  const formattedPrice = activeCampaign.price 
    ? `$${Number(activeCampaign.price).toLocaleString('es-AR')}` 
    : null;

  return (
    <div 
      onClick={() => openCampaignDetail(activeCampaign)}
      onMouseEnter={() => setIsHovered && setIsHovered(true)}
      onMouseLeave={() => setIsHovered && setIsHovered(false)}
      style={{
        width: '100%',
        minHeight: '48px',
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid rgba(59, 130, 246, 0.45)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 16px',
        cursor: 'pointer',
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
        userSelect: 'none'
      }}
      title="Clic para ver detalle de la oferta y pedir por WhatsApp"
    >
      {/* Contenido principal animado */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          overflow: 'hidden', 
          flex: 1,
          opacity: fadeAnim ? 1 : 0.3,
          transform: fadeAnim ? 'translateX(0)' : 'translateX(6px)',
          transition: 'opacity 0.25s ease, transform 0.25s ease'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          flexShrink: 0
        }}>
          <Sparkles size={16} color="#60a5fa" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flexWrap: 'nowrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>
            Oferta B2B:
          </span>

          <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '340px' }}>
            {activeCampaign.title}
          </span>

          {activeCampaign.badge_text && (
            <span style={{
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              {activeCampaign.badge_text}
            </span>
          )}

          {activeCampaign.supplier_name && (
            <span style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}>
              {activeCampaign.supplier_name}
            </span>
          )}

          {formattedPrice && (
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '14px', marginLeft: '4px', whiteSpace: 'nowrap' }}>
              {formattedPrice}
            </span>
          )}
        </div>
      </div>

      {/* Controles de navegación y estado */}
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {campaigns.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Botón Anterior */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (prevAd) prevAd();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#cbd5e1',
                transition: 'all 0.15s ease'
              }}
              title="Oferta anterior"
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Puntos indicadores interactivos */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '0 4px' }}>
              {campaigns.map((c, idx) => (
                <div
                  key={c.id || idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (goToAd) goToAd(idx);
                  }}
                  title={`Ir a oferta ${idx + 1}: ${c.title}`}
                  style={{
                    width: idx === (currentAdIndex % campaigns.length) ? '16px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    backgroundColor: idx === (currentAdIndex % campaigns.length) ? '#3b82f6' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease'
                  }}
                />
              ))}
            </div>

            {/* Botón Siguiente */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (nextAd) nextAd();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#cbd5e1',
                transition: 'all 0.15s ease'
              }}
              title="Siguiente oferta"
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
            >
              <ChevronRight size={16} />
            </button>

            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, paddingLeft: '2px' }}>
              {(currentAdIndex % campaigns.length) + 1}/{campaigns.length}
            </span>
          </div>
        )}

        {/* Botón "Ver Oferta" */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openCampaignDetail(activeCampaign);
          }}
          style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
            transition: 'transform 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span>Ver</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
