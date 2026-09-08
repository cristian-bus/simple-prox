import React from 'react';
import { Tag, ChevronRight, Sparkles } from 'lucide-react';

export default function OfertasBannerWidget({ ofertas }) {
  const { showAds, activeCampaign, openCampaignDetail, campaigns, currentAdIndex } = ofertas;

  if (!showAds || !activeCampaign) {
    return null;
  }

  const formattedPrice = activeCampaign.price 
    ? `$${Number(activeCampaign.price).toLocaleString('es-AR')}` 
    : null;

  return (
    <div 
      onClick={() => openCampaignDetail(activeCampaign)}
      style={{
        width: '100%',
        height: '48px', // Barra compacta de ~48px
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        cursor: 'pointer',
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#25344d';
        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#1e293b';
        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
        <Sparkles size={16} color="#60a5fa" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Oferta para tu negocio · <span style={{ color: '#ffffff', fontWeight: 700 }}>{activeCampaign.title}</span>
          {formattedPrice && <span style={{ color: '#4ade80', marginLeft: '6px' }}>{formattedPrice}</span>}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {campaigns.length > 1 && (
          <div style={{ display: 'flex', gap: '4px', marginRight: '4px' }}>
            {campaigns.map((c, idx) => (
              <div
                key={c.id || idx}
                style={{
                  width: idx === currentAdIndex ? '12px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: idx === currentAdIndex ? '#3b82f6' : '#475569',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </div>
        )}
        <ChevronRight size={18} color="#94a3b8" />
      </div>
    </div>
  );
}
