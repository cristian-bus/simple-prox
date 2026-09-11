// Utilidades Centralizadas para Ofertas B2B (KioscoProX / Simple ProX)

export const B2B_CATEGORIES = [
  "Todas",
  "Bebidas",
  "Golosinas",
  "Snacks",
  "Almacén",
  "Lácteos",
  "Helados",
  "Congelados",
  "Panificados",
  "Descartables",
  "Limpieza",
  "Higiene Personal",
  "Accesorios",
  "Otros"
];

/**
 * Retorna la fecha local en formato YYYY-MM-DD (sin desfasaje horario UTC)
 */
export const getLocalTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formatea cualquier valor de fecha/timestamp a formato legible DD/MM/YYYY
 */
export const formatHumanDate = (dateVal) => {
  if (!dateVal) return '';
  try {
    if (typeof dateVal === 'string' && dateVal.length === 10 && dateVal.includes('-')) {
      const [y, m, d] = dateVal.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal).slice(0, 10);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return String(dateVal).slice(0, 10);
  }
};

/**
 * Formatea el rango de vigencia de forma limpia y comprensible
 */
export const formatVigenciaText = (startDate, endDate) => {
  if (!startDate && !endDate) return 'Permanente';
  const startFmt = startDate ? formatHumanDate(startDate) : null;
  const endFmt = endDate ? formatHumanDate(endDate) : null;

  if (!startFmt && !endFmt) return 'Permanente';
  if (startFmt && !endFmt) return `Desde ${startFmt}`;
  if (!startFmt && endFmt) return `Hasta ${endFmt}`;
  return `${startFmt} → ${endFmt}`;
};

/**
 * Calcula el porcentaje y detalles de descuento entre precio regular y precio de oferta
 * Fórmula oficial: ((precio_original - precio_oferta) / precio_original) * 100
 */
export const calculateDiscount = (price, regularPrice) => {
  const p = Number(price);
  const r = Number(regularPrice);

  if (r > 0 && p > 0 && p < r) {
    const rawDiscount = ((r - p) / r) * 100;
    const savings = r - p;
    const formattedDesc = rawDiscount % 1 === 0 
      ? rawDiscount.toFixed(0) 
      : rawDiscount.toFixed(1);
    
    return {
      isValid: true,
      percentage: Number(rawDiscount.toFixed(2)),
      badgeText: `${formattedDesc}% OFF`.replace('.', ','),
      savings,
      formattedSavings: `$${savings.toLocaleString('es-AR')}`
    };
  }

  return {
    isValid: false,
    percentage: 0,
    badgeText: null,
    savings: 0,
    formattedSavings: '$0'
  };
};

/**
 * Wrapper de retrocompatibilidad para badge visual
 */
export const calculateDiscountBadge = (price, regularPrice) => {
  const res = calculateDiscount(price, regularPrice);
  return res.isValid ? res.badgeText : null;
};

/**
 * Embebe metadatos B2B extendidos en el campo de descripción para persistencia 100% segura
 */
export const embedB2BMetadata = (rawDescription, meta = {}) => {
  const cleanDesc = (rawDescription || '').replace(/\n?<!--B2B_META:[\s\S]*?-->/g, '').trim();
  const validMeta = {};
  if (meta.minPurchase !== undefined) validMeta.minPurchase = meta.minPurchase ? Number(meta.minPurchase) : null;
  if (meta.minPurchaseType !== undefined) validMeta.minPurchaseType = meta.minPurchaseType ? String(meta.minPurchaseType) : null;
  if (meta.conditions !== undefined) validMeta.conditions = meta.conditions ? String(meta.conditions).trim() : null;
  if (meta.startDate !== undefined) validMeta.startDate = meta.startDate ? String(meta.startDate).trim() : null;
  if (meta.endDate !== undefined) validMeta.endDate = meta.endDate ? String(meta.endDate).trim() : null;
  if (meta.targetProvinces !== undefined) validMeta.targetProvinces = Array.isArray(meta.targetProvinces) ? meta.targetProvinces : null;
  if (meta.targetCities !== undefined) validMeta.targetCities = Array.isArray(meta.targetCities) ? meta.targetCities : null;

  if (Object.keys(validMeta).length === 0) {
    return cleanDesc;
  }

  const metaStr = JSON.stringify(validMeta);
  return cleanDesc ? `${cleanDesc}\n<!--B2B_META:${metaStr}-->` : `<!--B2B_META:${metaStr}-->`;
};

/**
 * Extrae metadatos B2B extendidos de la descripción si existen
 */
export const extractB2BMetadata = (rawDescription) => {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return { cleanDescription: '', meta: {} };
  }

  const match = rawDescription.match(/<!--B2B_META:([\s\S]*?)-->/);
  if (match && match[1]) {
    try {
      const meta = JSON.parse(match[1]);
      const cleanDescription = rawDescription.replace(/\n?<!--B2B_META:[\s\S]*?-->/g, '').trim();
      return { cleanDescription, meta: meta || {} };
    } catch (e) {}
  }

  return { cleanDescription: rawDescription.trim(), meta: {} };
};

/**
 * Normaliza cadenas geográficas para comparaciones robustas (sin tildes, minúsculas y sin espacios extra)
 */
const normalizeGeoStr = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
};

/**
 * Determina si una campaña B2B corresponde a un comercio según su provincia y ciudad
 */
export const isCampaignEligibleForCommerce = (campaign, commerceProfile) => {
  if (!campaign || !commerceProfile) return true;

  const descToParse = campaign.rawDescription || campaign.description || '';
  const { meta } = extractB2BMetadata(descToParse);
  let targetProvinces = campaign.targetProvinces || meta.targetProvinces;
  const targetCities = campaign.targetCities || meta.targetCities;

  // Inferencia inteligente para campañas históricas sin provincia asignada explícitamente:
  // Si el distribuidor, texto o teléfono corresponden a una plaza local específica (ej. San Luis o Córdoba),
  // se asume esa provincia para no filtrar erróneamente ofertas locales como nacionales.
  if (!targetProvinces || (Array.isArray(targetProvinces) && targetProvinces.length === 0)) {
    const sup = (campaign.supplierName || '').toLowerCase();
    const desc = descToParse.toLowerCase();
    const phone = String(campaign.whatsappNumber || '').replace(/\D/g, '');

    if (sup.includes('san luis') || desc.includes('san luis') || phone.startsWith('549266') || phone.startsWith('266')) {
      targetProvinces = ['AR-D'];
    } else if (sup.includes('córdoba') || sup.includes('cordoba') || desc.includes('córdoba') || desc.includes('cordoba') || phone.startsWith('549351') || phone.startsWith('351') || phone.startsWith('549358')) {
      targetProvinces = ['AR-X'];
    }
  }

  // Si no hay targeting geográfico o está configurado explícitamente como Nacional ('ALL' o vacío), aplica a todos
  if (!targetProvinces || !Array.isArray(targetProvinces) || targetProvinces.length === 0 || targetProvinces.includes('ALL')) {
    return true;
  }

  const provCode = normalizeGeoStr(commerceProfile.provinceCode || 'AR-D');
  const provName = normalizeGeoStr(commerceProfile.provinceName || '');

  // Verificar concordancia de provincia (por código ISO o por nombre)
  const matchesProvince = targetProvinces.some(tp => {
    const normTp = normalizeGeoStr(tp);
    if (normTp === 'all') return true;
    return normTp === provCode || normTp === provName;
  });

  if (!matchesProvince) {
    return false;
  }

  // Si la provincia coincide y además hay ciudades específicas configuradas
  if (targetCities && Array.isArray(targetCities) && targetCities.length > 0 && !targetCities.includes('ALL')) {
    const cityCode = normalizeGeoStr(commerceProfile.cityCode || '');
    const cityName = normalizeGeoStr(commerceProfile.cityName || '');

    const matchesCity = targetCities.some(tc => {
      const normTc = normalizeGeoStr(tc);
      if (!normTc || normTc === 'all') return true;
      return normTc === cityCode || normTc === cityName;
    });

    if (!matchesCity) {
      return false;
    }
  }

  return true;
};

/**
 * Calcula el estado dinámico de una campaña según sus fechas y banderas de forma robusta
 * Estados posibles: 'active', 'scheduled', 'paused', 'finished', 'draft', 'deleted'
 */
export const getCampaignStatus = (campaign) => {
  if (!campaign) return 'draft';
  if (campaign.deleted || campaign.status === 'deleted') return 'finished';
  if (campaign.status === 'draft') return 'draft';
  if (campaign.status === 'paused') return 'paused';

  const nowTime = Date.now();
  const start = campaign.startDate || campaign.start_date;
  const end = campaign.endDate || campaign.end_date;

  if (start) {
    let startTime;
    if (typeof start === 'string' && start.length === 10 && start.includes('-')) {
      const [y, m, d] = start.split('-').map(Number);
      startTime = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    } else {
      startTime = new Date(start).getTime();
    }

    // Solo si el inicio es estrictamente en el futuro (más de 1 minuto)
    if (!isNaN(startTime) && startTime > nowTime + 60000) {
      return 'scheduled';
    }
  }

  if (end) {
    let endTime;
    if (typeof end === 'string' && end.length === 10 && end.includes('-')) {
      const [y, m, d] = end.split('-').map(Number);
      endTime = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    } else {
      endTime = new Date(end).getTime();
    }

    if (!isNaN(endTime) && endTime < nowTime) {
      return 'finished';
    }
  }

  if (campaign.status === 'finished') {
    if (end) {
      const endTime = new Date(end).getTime();
      if (!isNaN(endTime) && endTime > nowTime) {
        return 'active';
      }
    }
    return 'finished';
  }

  return 'active';
};

/**
 * Retorna la etiqueta visual y clase para el estado
 */
export const getStatusLabel = (status) => {
  switch (status) {
    case 'active':
      return { label: 'Activa', badgeClass: 'badge-success', icon: '🟢' };
    case 'scheduled':
      return { label: 'Programada', badgeClass: 'badge-warning', icon: '🟡' };
    case 'paused':
      return { label: 'Pausada', badgeClass: 'badge-danger', icon: '⏸' };
    case 'finished':
      return { label: 'Finalizada', badgeClass: 'badge-muted', icon: '🔴' };
    case 'draft':
      return { label: 'Borrador', badgeClass: 'badge-muted', icon: '📝' };
    case 'deleted':
      return { label: 'Eliminada', badgeClass: 'badge-danger', icon: '⚫' };
    default:
      return { label: 'Activa', badgeClass: 'badge-success', icon: '🟢' };
  }
};

/**
 * Genera un código de campaña determinista basado en su ID
 */
export const generateCampaignCode = (campaignId) => {
  if (!campaignId) return `SPX-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  
  const idStr = String(campaignId).replace(/[^a-zA-Z0-9]/g, '');
  if (idStr.length < 4) return `SPX-${idStr.padStart(4, '0').toUpperCase()}`;
  
  // Usar una parte del ID (e.g. uuid) para generar un código corto de 4-5 caracteres
  // Si es un UUID, tomar el primer segmento
  return `SPX-${idStr.substring(0, 5).toUpperCase()}`;
};

/**
 * Genera el mensaje de WhatsApp dinámico para la consulta de ofertas
 */
export const generateWhatsAppMessage = (productTitle, customMessage, campaignCode) => {
  if (customMessage && customMessage.trim()) {
    return customMessage.trim();
  }
  
  const title = productTitle || 'este producto';
  let msg = `Hola, vi la oferta de ${title} en Simple ProX y quisiera consultar disponibilidad y condiciones.`;
  
  if (campaignCode) {
    msg += `\n\nCódigo de oferta: ${campaignCode}`;
  }
  
  return msg;
};
