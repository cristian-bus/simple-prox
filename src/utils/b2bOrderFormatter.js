// Formateador y Agrupador de Pedidos Multiproducto B2B para Mayoristas
// KioscoProX / Simple ProX

/**
 * Agrupa los items del carrito B2B por mayorista/proveedor.
 * @param {Array} items - [{ campaign, qty }]
 * @returns {Array} [{ supplierName, whatsappNumber, minPurchase, minPurchaseType, items, subtotal }]
 */
export function groupB2BCartBySupplier(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const supplierMap = new Map();

  items.forEach(item => {
    const { campaign, qty } = item;
    if (!campaign || !qty || qty <= 0) return;

    const supName = (campaign.supplierName || 'Mayorista General').trim();
    const supKey = supName.toLowerCase();

    if (!supplierMap.has(supKey)) {
      supplierMap.set(supKey, {
        supplierName: supName,
        whatsappNumber: campaign.whatsappNumber || '',
        minPurchase: campaign.minPurchase ? Number(campaign.minPurchase) : null,
        minPurchaseType: campaign.minPurchaseType || '$',
        conditions: campaign.conditions || '',
        items: [],
        subtotal: 0,
        totalUnits: 0
      });
    }

    const group = supplierMap.get(supKey);
    const itemSubtotal = (Number(campaign.price) || 0) * qty;
    group.items.push({
      ...item,
      itemSubtotal
    });
    group.subtotal += itemSubtotal;
    group.totalUnits += qty;

    // Tomar número de WhatsApp si no estaba definido
    if (!group.whatsappNumber && campaign.whatsappNumber) {
      group.whatsappNumber = campaign.whatsappNumber;
    }
  });

  return Array.from(supplierMap.values());
}

/**
 * Genera el mensaje de WhatsApp formateado para el pedido mayorista consolidado.
 * @param {Object} supplierGroup - Grupo de items del mayorista
 * @param {Object} storeData - Datos del comercio emisor
 * @returns {string} Mensaje preformateado para WhatsApp
 */
export function formatB2BOrderMessage(supplierGroup, storeData = {}) {
  const { supplierName, items, subtotal, totalUnits } = supplierGroup;
  
  const storeName = storeData.storeName || storeData.name || 'Comercio Minorista';
  const address = storeData.address ? `\n📍 Dirección: ${storeData.address}` : '';
  const city = storeData.city ? ` (${storeData.city})` : '';
  const phone = storeData.phone ? `\n📞 Tel: ${storeData.phone}` : '';

  let text = `📦 *NUEVO PEDIDO MAYORISTA*\n`;
  text += `───────────────────────\n`;
  text += `🏢 *Para:* ${supplierName}\n`;
  text += `🏪 *De:* ${storeName}${city}${address}${phone}\n`;
  text += `───────────────────────\n\n`;
  text += `*DETALLE DE PRODUCTOS:*\n`;

  items.forEach((item, index) => {
    const title = item.campaign.title || 'Producto en Oferta';
    const priceUnit = Number(item.campaign.price) || 0;
    const itemTotal = priceUnit * item.qty;
    const code = item.campaign.campaignCode ? ` (Cod: ${item.campaign.campaignCode})` : '';

    text += `${index + 1}. *${title}*${code}\n`;
    text += `   ↳ Cantidad: *${item.qty} u.* x $${priceUnit.toLocaleString('es-AR')} = *$${itemTotal.toLocaleString('es-AR')}*\n`;
  });

  text += `\n───────────────────────\n`;
  text += `📊 *Total de Items:* ${totalUnits} unidades\n`;
  text += `💰 *TOTAL ESTIMADO:* *$${subtotal.toLocaleString('es-AR')}*\n`;
  text += `───────────────────────\n\n`;
  text += `Solicito confirmación de stock, plazos de entrega y forma de pago. ¡Muchas gracias!`;

  return text;
}
