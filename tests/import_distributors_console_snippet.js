// SIMPLE PROX — SNIPPET DE IMPORTACIÓN CONTROLADA PARA CONSOLA DEL NAVEGADOR (F12)
// Copiar y pegar en la consola de http://localhost:5183/index.html con la sesión administrativa abierta.

(async () => {
  const token = await getValidAdminToken();
  if (!token) {
    console.error('❌ No se encontró token administrativo activo. Inicie sesión en el panel.');
    return;
  }
  const { baseUrl, supabaseKey } = getSupabaseConfig();
  const endpoint = `${baseUrl}/rest/v1/distributors`;

  const distributorsToImport = [
    // GRUPO A: 3 DISTRIBUIDORES PERSONALIZADOS (record_type = 'prospect')
    {
      id: 'dist-mic',
      name: 'Mayorista MIC',
      whatsapp_number: '2664805746',
      province_code: 'AR-D',
      city: 'San Luis Capital',
      category: 'Bebidas',
      min_purchase: 0,
      conditions: 'Compra mínima: 20 unidades. Envio sin cargos',
      record_type: 'prospect',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-molto-rc',
      name: 'Molto RC',
      whatsapp_number: '5454654654',
      province_code: 'AR-X',
      city: 'Río Cuarto',
      category: 'Almacén',
      min_purchase: 90000,
      conditions: 'envio sin cargo',
      record_type: 'prospect',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-carrefour',
      name: 'carrefour',
      whatsapp_number: '3534534',
      province_code: 'AR-X',
      city: 'Córdoba Capital',
      category: 'Bebidas',
      min_purchase: 0,
      conditions: null,
      record_type: 'prospect',
      status: 'active',
      deleted: false
    },

    // GRUPO B: 9 DISTRIBUIDORES DEL CATÁLOGO DE REFERENCIA (record_type = 'catalog_example')
    {
      id: 'dist-mac',
      name: 'Distribuidora MAC',
      whatsapp_number: '5491144332211',
      province_code: 'ALL',
      city: 'Nacional',
      category: 'Almacén',
      min_purchase: 0,
      conditions: 'Envío sin cargo en compras superiores a $80.000. Entrega en 24/48hs.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-central-sl',
      name: 'Distribuidora Central San Luis',
      whatsapp_number: '5492664001122',
      province_code: 'AR-D',
      city: 'San Luis Capital',
      category: 'Bebidas',
      min_purchase: 0,
      conditions: 'Reparto de lunes a viernes. Pago contra entrega o transferencia.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-el-triunfo',
      name: 'Mayorista El Triunfo',
      whatsapp_number: '5492664003344',
      province_code: 'AR-D',
      city: 'San Luis Capital',
      category: 'Snacks',
      min_purchase: 0,
      conditions: 'Mínimo 5 bultos cerrados. Envíos en San Luis.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-arcor-oficial',
      name: 'Distribuidora Arcor Oficial',
      whatsapp_number: '5492664005566',
      province_code: 'AR-D',
      city: 'San Luis Capital',
      category: 'Golosinas',
      min_purchase: 0,
      conditions: 'Distribución directa de fábrica con garantía de fecha de vencimiento.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-coca-femsa',
      name: 'Coca-Cola FEMSA B2B',
      whatsapp_number: '5491166554433',
      province_code: 'ALL',
      city: 'Nacional',
      category: 'Bebidas',
      min_purchase: 0,
      conditions: 'Canal oficial para comercios minoristas. Factura A y B.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-quilmes',
      name: 'Quilmes Directo',
      whatsapp_number: '5491155443322',
      province_code: 'ALL',
      city: 'Nacional',
      category: 'Bebidas',
      min_purchase: 0,
      conditions: 'Llegada semanal con preventista asignado.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-golomax',
      name: 'Mayorista Golomax',
      whatsapp_number: '5491177665544',
      province_code: 'ALL',
      city: 'Nacional',
      category: 'Golosinas',
      min_purchase: 0,
      conditions: 'Especialistas en golosinas importadas y nacionales.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-ledesma',
      name: 'Ledesma Papel & Almacén',
      whatsapp_number: '5491188776655',
      province_code: 'ALL',
      city: 'Nacional',
      category: 'Almacén',
      min_purchase: 0,
      conditions: 'Precios por bulto cerrado de resmas y azúcar.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    },
    {
      id: 'dist-limpieza-total',
      name: 'Distribuidora Limpieza Total',
      whatsapp_number: '5491199887766',
      province_code: 'ALL',
      city: 'Nacional',
      category: 'Limpieza',
      min_purchase: 0,
      conditions: 'Productos concentrados y descartables gastronómicos.',
      record_type: 'catalog_example',
      status: 'active',
      deleted: false
    }
  ];

  console.log('🚀 Iniciando importación controlada de 12 distribuidores...');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates,return=representation'
    },
    body: JSON.stringify(distributorsToImport)
  });

  if (res.ok) {
    const data = await res.json();
    console.log('✅ Importación completada con éxito. Registros insertados:', data.length);
    console.table(data.map(d => ({ ID: d.id, Nombre: d.name, Tipo: d.record_type, Categoría: d.category, MinCompra: d.min_purchase, Condiciones: d.conditions })));
    if (typeof fetchDistributorsFromSupabase === 'function') await fetchDistributorsFromSupabase();
    if (typeof renderDistributors === 'function') renderDistributors();
    alert('✅ 12 distribuidores importados exitosamente a Supabase.');
  } else {
    console.error('❌ Error en la importación:', res.status, await res.text());
  }
})();

