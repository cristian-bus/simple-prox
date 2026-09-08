// Motor de Vinculación Inteligente entre Stock Bajo y Ofertas Mayoristas B2B
// Permite detectar necesidades de reposición y sugerir promociones de proveedores

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'en', 'con', 'por', 'para', 'y', 'o', 'al', 'del',
  'pack', 'packs', 'caja', 'cajon', 'combo', 'x', 'u', 'u.', 'unidades'
]);

function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Limpiar caracteres especiales y números aislados de puntuación
  const cleaned = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  return cleaned
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Encuentra la mejor oferta mayorista para un producto determinado.
 * @param {Object} product - Producto del kiosco (name, category, etc.)
 * @param {Array} campaigns - Lista de campañas B2B activas
 * @returns {Object|null} Campaña coincidente con score y datos de ahorro, o null si no hay match
 */
export function findMatchingOfferForProduct(product, campaigns) {
  if (!product || !Array.isArray(campaigns) || campaigns.length === 0) {
    return null;
  }

  const prodKeywords = extractKeywords(product.name);
  if (prodKeywords.length === 0) return null;

  let bestMatch = null;
  let highestScore = 0;

  for (const campaign of campaigns) {
    if ((campaign.status || '').toLowerCase() === 'finished' || (campaign.status || '').toLowerCase() === 'deleted') {
      continue;
    }

    const campKeywords = extractKeywords(campaign.title);
    if (campKeywords.length === 0) continue;

    // Calcular coincidencias de palabras clave
    let matchCount = 0;
    for (const pWord of prodKeywords) {
      for (const cWord of campKeywords) {
        if (pWord === cWord) {
          matchCount += 2; // Coincidencia exacta
        } else if (pWord.length >= 4 && cWord.length >= 4 && (pWord.includes(cWord) || cWord.includes(pWord))) {
          matchCount += 1; // Coincidencia parcial (ej. "fideo" y "fideos")
        }
      }
    }

    // Bono si coincide la categoría (ej. Bebidas con Bebidas)
    const prodCat = (product.category || '').toLowerCase().trim();
    const campCat = (campaign.category || '').toLowerCase().trim();
    if (prodCat && campCat && prodCat === campCat && matchCount > 0) {
      matchCount += 1;
    }

    // Se requiere al menos un score significativo de 2 (coincidencia de palabra clave fuerte)
    if (matchCount >= 2 && matchCount > highestScore) {
      highestScore = matchCount;
      bestMatch = {
        campaign,
        score: matchCount,
        product
      };
    }
  }

  return bestMatch;
}

/**
 * Obtiene todas las oportunidades de reposición cruzando productos con bajo stock y ofertas activas.
 * @param {Array} products - Productos de la tienda
 * @param {Array} campaigns - Campañas B2B activas
 * @returns {Array} Lista de oportunidades con producto, stock actual y oferta sugerida
 */
export function getLowStockReplenishmentOpportunities(products, campaigns) {
  if (!Array.isArray(products) || !Array.isArray(campaigns) || campaigns.length === 0) {
    return [];
  }

  // Filtrar productos con bajo stock (excluyendo combos y servicios)
  const lowStockProducts = products.filter(p => {
    if (!p.isActive || p.isCombo || p.isService) return false;
    const currentStock = Number(p.stock) || 0;
    const alertStock = p.stockAlert !== undefined && p.stockAlert !== '' ? Number(p.stockAlert) : 5;
    return currentStock <= alertStock;
  });

  const opportunities = [];

  for (const prod of lowStockProducts) {
    const match = findMatchingOfferForProduct(prod, campaigns);
    if (match) {
      opportunities.push({
        product: prod,
        campaign: match.campaign,
        score: match.score,
        currentStock: Number(prod.stock) || 0,
        alertStock: prod.stockAlert !== undefined && prod.stockAlert !== '' ? Number(prod.stockAlert) : 5
      });
    }
  }

  // Ordenar primero los que están agotados (stock 0) y luego por score de coincidencia
  return opportunities.sort((a, b) => {
    if (a.currentStock === 0 && b.currentStock > 0) return -1;
    if (b.currentStock === 0 && a.currentStock > 0) return 1;
    return b.score - a.score;
  });
}
