// Módulo de Geografía Normalizada de Argentina para Simple ProX
// Permite selección ágil y matching B2B sin depender de servicios externos

export const ARGENTINA_PROVINCES = [
  { code: 'AR-C', name: 'Ciudad Autónoma de Buenos Aires' },
  { code: 'AR-B', name: 'Buenos Aires' },
  { code: 'AR-K', name: 'Catamarca' },
  { code: 'AR-H', name: 'Chaco' },
  { code: 'AR-U', name: 'Chubut' },
  { code: 'AR-X', name: 'Córdoba' },
  { code: 'AR-W', name: 'Corrientes' },
  { code: 'AR-E', name: 'Entre Ríos' },
  { code: 'AR-P', name: 'Formosa' },
  { code: 'AR-Y', name: 'Jujuy' },
  { code: 'AR-L', name: 'La Pampa' },
  { code: 'AR-F', name: 'La Rioja' },
  { code: 'AR-M', name: 'Mendoza' },
  { code: 'AR-N', name: 'Misiones' },
  { code: 'AR-Q', name: 'Neuquén' },
  { code: 'AR-R', name: 'Río Negro' },
  { code: 'AR-A', name: 'Salta' },
  { code: 'AR-J', name: 'San Juan' },
  { code: 'AR-D', name: 'San Luis' },
  { code: 'AR-Z', name: 'Santa Cruz' },
  { code: 'AR-S', name: 'Santa Fe' },
  { code: 'AR-G', name: 'Santiago del Estero' },
  { code: 'AR-V', name: 'Tierra del Fuego' },
  { code: 'AR-T', name: 'Tucumán' }
];

export const ARGENTINA_CITIES = {
  'AR-C': [
    { code: 'CABA-CENTRO', name: 'Centro / Microcentro' },
    { code: 'CABA-PALERMO', name: 'Palermo' },
    { code: 'CABA-BELGRANO', name: 'Belgrano / Núñez' },
    { code: 'CABA-CABALLITO', name: 'Caballito / Almagro' },
    { code: 'CABA-FLORES', name: 'Flores / Floresta' },
    { code: 'CABA-SUR', name: 'Barracas / La Boca' },
    { code: 'CABA-VILLA-URQUIZA', name: 'Villa Urquiza / Devoto' },
    { code: 'CABA-OTRA', name: 'Otros Barrios CABA' }
  ],
  'AR-B': [
    { code: 'BA-LA-PLATA', name: 'La Plata' },
    { code: 'BA-MAR-DEL-PLATA', name: 'Mar del Plata' },
    { code: 'BA-BAHIA-BLANCA', name: 'Bahía Blanca' },
    { code: 'BA-TANDIL', name: 'Tandil' },
    { code: 'BA-SAN-ISIDRO', name: 'San Isidro / V. López' },
    { code: 'BA-VICENTE-LOPEZ', name: 'Vicente López' },
    { code: 'BA-SAN-MARTIN', name: 'General San Martín' },
    { code: 'BA-TIGRE', name: 'Tigre' },
    { code: 'BA-PILAR', name: 'Pilar' },
    { code: 'BA-QUILMES', name: 'Quilmes' },
    { code: 'BA-LANUS', name: 'Lanús' },
    { code: 'BA-LOMAS', name: 'Lomas de Zamora' },
    { code: 'BA-AVELLANEDA', name: 'Avellaneda' },
    { code: 'BA-MORON', name: 'Morón' },
    { code: 'BA-LA-MATANZA', name: 'La Matanza' },
    { code: 'BA-SAN-MIGUEL', name: 'San Miguel' },
    { code: 'BA-MERLO', name: 'Merlo' },
    { code: 'BA-MORENO', name: 'Moreno' },
    { code: 'BA-PERGAMINO', name: 'Pergamino' },
    { code: 'BA-OLAVARRIA', name: 'Olavarría' },
    { code: 'BA-JUNIN', name: 'Junín' },
    { code: 'BA-OTRA', name: 'Otra localidad de Buenos Aires' }
  ],
  'AR-D': [
    { code: 'SL-CAPITAL', name: 'San Luis Capital' },
    { code: 'SL-VILLA-MERCEDES', name: 'Villa Mercedes' },
    { code: 'SL-MERLO', name: 'Villa de Merlo' },
    { code: 'SL-LA-PUNTA', name: 'La Punta' },
    { code: 'SL-JUANA-KOSLAY', name: 'Juana Koslay' },
    { code: 'SL-POTRERO', name: 'Potrero de los Funes' },
    { code: 'SL-QUINES', name: 'Quines' },
    { code: 'SL-SANTA-ROSA', name: 'Santa Rosa del Conlara' },
    { code: 'SL-OTRA', name: 'Otra localidad de San Luis' }
  ],
  'AR-X': [
    { code: 'CBA-CAPITAL', name: 'Córdoba Capital' },
    { code: 'CBA-RIO-CUARTO', name: 'Río Cuarto' },
    { code: 'CBA-VILLA-MARIA', name: 'Villa María' },
    { code: 'CBA-CARLOS-PAZ', name: 'Villa Carlos Paz' },
    { code: 'CBA-SAN-FRANCISCO', name: 'San Francisco' },
    { code: 'CBA-ALTA-GRACIA', name: 'Alta Gracia' },
    { code: 'CBA-RIO-TERCERO', name: 'Río Tercero' },
    { code: 'CBA-BELL-VILLE', name: 'Bell Ville' },
    { code: 'CBA-VILLA-ALLENDE', name: 'Villa Allende' },
    { code: 'CBA-OTRA', name: 'Otra localidad de Córdoba' }
  ],
  'AR-S': [
    { code: 'SF-ROSARIO', name: 'Rosario' },
    { code: 'SF-SANTA-FE', name: 'Santa Fe Capital' },
    { code: 'SF-RAFAELA', name: 'Rafaela' },
    { code: 'SF-VENADO-TUERTO', name: 'Venado Tuerto' },
    { code: 'SF-RECONQUISTA', name: 'Reconquista' },
    { code: 'SF-SANTO-TOME', name: 'Santo Tomé' },
    { code: 'SF-VILLA-GOB-GALVEZ', name: 'Villa Gobernador Gálvez' },
    { code: 'SF-ESPERANZA', name: 'Esperanza' },
    { code: 'SF-OTRA', name: 'Otra localidad de Santa Fe' }
  ],
  'AR-M': [
    { code: 'MDZ-CAPITAL', name: 'Mendoza Capital' },
    { code: 'MDZ-GUAYMALLEN', name: 'Guaymallén' },
    { code: 'MDZ-GODOY-CRUZ', name: 'Godoy Cruz' },
    { code: 'MDZ-LAS-HERAS', name: 'Las Heras' },
    { code: 'MDZ-SAN-RAFAEL', name: 'San Rafael' },
    { code: 'MDZ-MAIPU', name: 'Maipú' },
    { code: 'MDZ-LUJAN', name: 'Luján de Cuyo' },
    { code: 'MDZ-SAN-MARTIN', name: 'San Martín' },
    { code: 'MDZ-OTRA', name: 'Otra localidad de Mendoza' }
  ],
  'AR-J': [
    { code: 'SJ-CAPITAL', name: 'San Juan Capital' },
    { code: 'SJ-RAWSON', name: 'Rawson' },
    { code: 'SJ-RIVADAVIA', name: 'Rivadavia' },
    { code: 'SJ-CHIMBAS', name: 'Chimbas' },
    { code: 'SJ-SANTA-LUCIA', name: 'Santa Lucía' },
    { code: 'SJ-CAUCETE', name: 'Caucete' },
    { code: 'SJ-POCITO', name: 'Pocito' },
    { code: 'SJ-JACHAL', name: 'Jáchal' },
    { code: 'SJ-OTRA', name: 'Otra localidad de San Juan' }
  ],
  'AR-T': [
    { code: 'TUC-CAPITAL', name: 'San Miguel de Tucumán' },
    { code: 'TUC-BANDA-RIO-SALI', name: 'Banda del Río Salí' },
    { code: 'TUC-YERBA-BUENA', name: 'Yerba Buena' },
    { code: 'TUC-CONCEPCION', name: 'Concepción' },
    { code: 'TUC-TAFI-VIEJO', name: 'Tafí Viejo' },
    { code: 'TUC-AGUILARES', name: 'Aguilares' },
    { code: 'TUC-OTRA', name: 'Otra localidad de Tucumán' }
  ],
  'AR-E': [
    { code: 'ER-PARANA', name: 'Paraná' },
    { code: 'ER-CONCORDIA', name: 'Concordia' },
    { code: 'ER-GUALEGUAYCHU', name: 'Gualeguaychú' },
    { code: 'ER-CONCEPCION-URUGUAY', name: 'Concepción del Uruguay' },
    { code: 'ER-GUALEGUAY', name: 'Gualeguay' },
    { code: 'ER-VILLAGUAY', name: 'Villaguay' },
    { code: 'ER-CHAJARI', name: 'Chajarí' },
    { code: 'ER-OTRA', name: 'Otra localidad de Entre Ríos' }
  ],
  'AR-A': [
    { code: 'SLA-CAPITAL', name: 'Salta Capital' },
    { code: 'SLA-ORAN', name: 'San Ramón de la Nueva Orán' },
    { code: 'SLA-TARTAGAL', name: 'Tartagal' },
    { code: 'SLA-GRAL-GUEMES', name: 'General Güemes' },
    { code: 'SLA-METAN', name: 'San José de Metán' },
    { code: 'SLA-ROSARIO-LERMA', name: 'Rosario de Lerma' },
    { code: 'SLA-OTRA', name: 'Otra localidad de Salta' }
  ]
};

// Fallback genérico para provincias con menos de 5 ciudades precargadas
export function getCitiesForProvince(provCode) {
  if (ARGENTINA_CITIES[provCode]) {
    return ARGENTINA_CITIES[provCode];
  }
  const prov = ARGENTINA_PROVINCES.find(p => p.code === provCode);
  const provName = prov ? prov.name : 'Provincia';
  return [
    { code: `${provCode}-CAPITAL`, name: `${provName} Capital` },
    { code: `${provCode}-OTRA`, name: `Otra localidad de ${provName}` }
  ];
}

// Buscar o inferir provincia y ciudad a partir de textos libres anteriores
export function matchProvinceAndCity(provText = '', cityText = '') {
  const normP = String(provText).toLowerCase().trim();
  const normC = String(cityText).toLowerCase().trim();

  let matchedProv = ARGENTINA_PROVINCES.find(p => normP && (p.name.toLowerCase().includes(normP) || normP.includes(p.name.toLowerCase())));
  if (!matchedProv) {
    if (normC.includes('san luis') || normC.includes('mercedes')) matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-D');
    else if (normC.includes('rosario') || normC.includes('santa fe')) matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-S');
    else if (normC.includes('cordoba') || normC.includes('córdoba')) matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-X');
    else if (normC.includes('mendoza')) matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-M');
    else if (normC.includes('la plata') || normC.includes('mar del plata') || normC.includes('quilmes')) matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-B');
    else if (normC.includes('caba') || normC.includes('buenos aires') || normC.includes('palermo')) matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-C');
    else matchedProv = ARGENTINA_PROVINCES.find(p => p.code === 'AR-D'); // Default amigable
  }

  const cities = getCitiesForProvince(matchedProv.code);
  let matchedCity = cities.find(c => normC && (c.name.toLowerCase().includes(normC) || normC.includes(c.name.toLowerCase())));
  if (!matchedCity) {
    matchedCity = cities[0];
  }

  return {
    provinceCode: matchedProv.code,
    provinceName: matchedProv.name,
    cityCode: matchedCity.code,
    cityName: matchedCity.name
  };
}
