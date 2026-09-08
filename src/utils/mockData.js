export const NICHES = {
  kiosco: {
    id: 'kiosco',
    name: 'Kiosco / Despensa',
    defaultUnit: 'Unitario',
    categories: {
      "🍞 Alimentos": ["Panificados", "Galletitas", "Snacks", "Lácteos", "Fiambres"],
      "🥤 Bebidas": ["Gaseosas", "Jugos", "Aguas", "Cervezas", "Vinos", "Aperitivos", "Combos"],
      "🧼 Limpieza": ["Detergentes", "Lavandina", "Limpiadores"],
      "🧴 Higiene": ["Shampoo", "Jabón", "Papel higiénico"]
    },
    mockProducts: [
      { id: 101, name: "Gaseosa Cola 2.25L", price: 3800, cost: 2400, category: "🥤 Bebidas", subcategory: "Gaseosas", stock: 24, code: "7790001", sku: "K001", isActive: true, unitType: "Unitario" },
      { id: 102, name: "Galletitas de Chocolate 119g", price: 1200, cost: 750, category: "🍞 Alimentos", subcategory: "Galletitas", stock: 15, code: "7790002", sku: "K002", isActive: true, unitType: "Unitario" },
      { id: 103, name: "Yerba Mate 500g", price: 2900, cost: 1800, category: "🥤 Bebidas", subcategory: "Yerba mate", stock: 40, code: "7790003", sku: "K003", isActive: true, unitType: "Unitario" },
      { id: 104, name: "Pan Francés", price: 1800, cost: 800, category: "🍞 Alimentos", subcategory: "Panificados", stock: 15, code: "7790004", sku: "K004", isActive: true, unitType: "Peso (Kg)" },
      { id: 105, name: "Fernet Branca 750ml", price: 9500, cost: 7100, category: "🥤 Bebidas", subcategory: "Aperitivos", stock: 24, code: "7790005", sku: "K005", isActive: true, unitType: "Unitario" },
      { id: 106, name: "Combo Viajero (Fernet + Coca Cola)", price: 12500, cost: 9500, category: "🥤 Bebidas", subcategory: "Combos", stock: 12, code: "COMBO-FERNET", sku: "K006", isActive: true, unitType: "Unitario", isCombo: true, components: [ { productId: 105, qty: 1 }, { productId: 101, qty: 1 } ] }
    ],
    mockSuppliers: [
      { id: 1, name: 'Coca Cola Femsa' },
      { id: 2, name: 'Quilmes' },
      { id: 3, name: 'Arcor' }
    ],
    mockClients: [
      { id: 1, name: 'Consumidor Final', cuit: '00-00000000-0', deuda: 0 },
      { id: 2, name: 'Juan Pérez', cuit: '20-12345678-9', deuda: 0 },
      { id: 3, name: 'María Gómez', cuit: '27-87654321-0', deuda: 0 }
    ]
  },
  petshop: {
    id: 'petshop',
    name: 'Pet Shop / Forrajería',
    defaultUnit: 'Peso (Kg)',
    categories: {
      "🥩 Alimentos": ["Alimentos para perros", "Alimentos para gatos", "Alimentos para aves", "Alimentos para peces", "Alimentos para roedores"],
      "🦴 Snacks": ["Snacks para perros", "Snacks para gatos", "Huesos", "Premios"],
      "🧴 Higiene": ["Shampoo", "Perfumes", "Antipulgas", "Higiene dental", "Pañales"],
      "🦮 Accesorios": ["Collares", "Correas", "Pretales", "Bozales", "Chapitas", "Ropa"],
      "🧸 Juguetes": ["Pelotas", "Mordillos", "Juguetes interactivos", "Juguetes para gatos"],
      "🛏️ Descanso": ["Camas", "Mantas", "Casas", "Transportadoras"],
      "🐱 Otros": ["Comederos", "Bebederos", "Piedras sanitarias", "Arenas para gatos", "Bandejas sanitarias"],
      "🧪 Productos químicos": ["Venta por litro", "Venta fraccionada", "Envases"]
    },
    mockProducts: [
      { id: 201, name: "Alimento Perro Adulto Carne 15kg", price: 25000, cost: 18000, category: "🥩 Alimentos", subcategory: "Alimentos para perros", stock: 10, code: "7791001", sku: "P001", isActive: true, unitType: "Unitario" },
      { id: 202, name: "Alimento Perro Suelto (Por Kg)", price: 2000, cost: 1200, category: "🥩 Alimentos", subcategory: "Alimentos para perros", stock: 50, code: "7791002", sku: "P002", isActive: true, unitType: "Peso (Kg)" },
      { id: 203, name: "Pipeta Antipulgas 10-20kg", price: 4500, cost: 3000, category: "🧴 Higiene", subcategory: "Antipulgas", stock: 25, code: "7791003", sku: "P003", isActive: true, unitType: "Unitario" },
      { id: 204, name: "Hueso de Cuero Mediano", price: 1200, cost: 600, category: "🦴 Snacks", subcategory: "Huesos", stock: 40, code: "7791004", sku: "P004", isActive: true, unitType: "Unitario" },
      { id: 205, name: "Baño y Peluquería Canina", price: 12000, cost: 0, category: "🧴 Higiene", subcategory: "Baño", stock: 9999, code: "SERV-P01", sku: "P005", isActive: true, unitType: "Unitario", isService: true },
      { id: 206, name: "Consulta Veterinaria Básica", price: 15000, cost: 0, category: "🐱 Otros", subcategory: "Veterinaria", stock: 9999, code: "SERV-P02", sku: "P006", isActive: true, unitType: "Unitario", isService: true }
    ],
    mockSuppliers: [
      { id: 1, name: 'Royal Canin' },
      { id: 2, name: 'Purina' },
      { id: 3, name: 'Zoetis' }
    ],
    mockClients: [
      { id: 1, name: 'Consumidor Final', cuit: '00-00000000-0', deuda: 0 },
      { id: 2, name: 'Veterinaria San Roque', cuit: '30-11223344-5', deuda: 0 },
      { id: 3, name: 'Refugio Patitas', cuit: '33-55667788-9', deuda: 0 }
    ]
  },
  libreria: {
    id: 'libreria',
    name: 'Librería / Papelería',
    defaultUnit: 'Unitario',
    categories: {
      "✏️ 1. ESCRITURA": ["Lapiceras", "Lápices", "Portaminas", "Minas", "Correctores", "Marcadores", "Fibras", "Resaltadores", "Microfibras", "Plumas"],
      "📓 2. CUADERNOS Y CARPETAS": ["Cuadernos", "Cuadernos universitarios", "Cuadernos escolares", "Libretas", "Agendas", "Anotadores", "Carpetas", "Biblioratos", "Fichas", "Repuestos de hojas"],
      "📄 3. PAPEL Y CARTULINAS": ["Hojas A4", "Hojas A3", "Papel color", "Cartulina", "Cartulina escolar", "Papel afiche", "Papel glasé", "Papel barrilete", "Papel crepé", "Papel madera", "Papel fotográfico", "Papel autoadhesivo"],
      "📁 4. ARCHIVO Y ORGANIZACIÓN": ["Folios", "Carpetas", "Biblioratos", "Sobres", "Separadores", "Cajas archivadoras", "Fichas", "Portadocumentos"],
      "✂️ 5. ÚTILES ESCOLARES": ["Tijeras", "Reglas", "Escuadras", "Transportadores", "Compases", "Sacapuntas", "Gomas", "Cartucheras", "Sets escolares"],
      "🖍️ 6. DIBUJO Y ARTE": ["Lápices de colores", "Crayones", "Fibras", "Témperas", "Acuarelas", "Pinceles", "Pinturas", "Marcadores", "Pasteles", "Carbonillas", "Bastidores"],
      "🎨 7. MANUALIDADES": ["Goma EVA", "Fieltro", "Telgopor", "Palitos de helado", "Pompones", "Lentejuelas", "Brillantina", "Mostacillas", "Hilos", "Cintas", "Materiales decorativos"],
      "🧴 8. ADHESIVOS": ["Plasticola", "Pegamento en barra", "Adhesivo vinílico", "La gotita", "Cinta adhesiva", "Cinta doble faz", "Cinta de papel", "Cinta de embalar"],
      "📎 9. ACCESORIOS DE OFICINA": ["Clips", "Broches", "Abrochadoras", "Broches para abrochadora", "Perforadoras", "Ganchos", "Bandas elásticas", "Cutter", "Cuchillas", "Porta lápices"],
      "🖨️ 10. IMPRESIÓN Y TECNOLOGÍA": ["Tintas", "Toners", "Pendrives", "Memorias", "Cables", "Adaptadores", "Mouse", "Teclados", "Accesorios PC"],
      "🎁 11. REGALERÍA": ["Tarjetas", "Envoltorios", "Bolsas de regalo", "Moños", "Peluches", "Llaveros", "Regalos", "Decoración"],
      "🎒 12. MOCHILAS Y CARTUCHERAS": ["Mochilas", "Cartucheras", "Bolsos", "Loncheras", "Organizadores"],
      "📅 13. AGENDAS Y CALENDARIOS": ["Agendas", "Calendarios", "Planificadores", "Organizadores"],
      "🧾 14. PRODUCTOS DE OFICINA": ["Resmas", "Formularios", "Talonarios", "Libros contables", "Cuadernos administrativos", "Sobres", "Papel membretado"]
    },
    mockProducts: [
      { id: 401, name: "Cuaderno Tapa Dura Rayado 84h", price: 4500, cost: 2800, category: "📓 2. CUADERNOS Y CARPETAS", subcategory: "Cuadernos", stock: 40, code: "7793001", sku: "L001", isActive: true, unitType: "Unitario" },
      { id: 402, name: "Bolígrafo Trazo Fino Azul", price: 800, cost: 400, category: "✏️ 1. ESCRITURA", subcategory: "Lapiceras", stock: 120, code: "7793002", sku: "L002", isActive: true, unitType: "Unitario" },
      { id: 403, name: "Resma A4 80g 500 Hojas", price: 6500, cost: 4800, category: "🧾 14. PRODUCTOS DE OFICINA", subcategory: "Resmas", stock: 25, code: "7793003", sku: "L003", isActive: true, unitType: "Unitario" },
      { id: 404, name: "Pintura Acrílica Decorativa 50ml", price: 1200, cost: 700, category: "🖍️ 6. DIBUJO Y ARTE", subcategory: "Pinturas", stock: 60, code: "7793004", sku: "L004", isActive: true, unitType: "Unitario" },
      { id: 405, name: "Fotocopias B/N (por carilla)", price: 50, cost: 0, category: "🖨️ 10. IMPRESIÓN Y TECNOLOGÍA", subcategory: "Fotocopias", stock: 9999, code: "SERV-L01", sku: "L005", isActive: true, unitType: "Unitario", isService: true },
      { id: 406, name: "Anillado hasta 50 hojas", price: 2500, cost: 0, category: "🖨️ 10. IMPRESIÓN Y TECNOLOGÍA", subcategory: "Anillados", stock: 9999, code: "SERV-L02", sku: "L006", isActive: true, unitType: "Unitario", isService: true }
    ],
    mockSuppliers: [
      { id: 1, name: 'Ledesma' },
      { id: 2, name: 'Faber-Castell' },
      { id: 3, name: 'Bic' }
    ],
    mockClients: [
      { id: 1, name: 'Consumidor Final', cuit: '00-00000000-0', deuda: 0 },
      { id: 2, name: 'Colegio San José', cuit: '30-88776655-4', deuda: 0 },
      { id: 3, name: 'Instituto Técnico', cuit: '30-44332211-0', deuda: 0 }
    ]
  },
  barberia: {
    id: 'barberia',
    name: 'Barbería / Salón',
    defaultUnit: 'Unitario',
    categories: {
      "✂️ Peluquería": ["Cortes", "Barba", "Coloración"],
      "🧴 Productos": ["Ceras", "Shampoos", "Aceites para Barba"]
    },
    mockProducts: [
      { id: 501, name: "Corte de Pelo Clásico", price: 6000, cost: 0, category: "✂️ Peluquería", subcategory: "Cortes", stock: 9999, code: "SERV-001", sku: "B001", isActive: true, unitType: "Unitario", isService: true },
      { id: 502, name: "Corte + Perfilado de Barba", price: 8500, cost: 0, category: "✂️ Peluquería", subcategory: "Barba", stock: 9999, code: "SERV-002", sku: "B002", isActive: true, unitType: "Unitario", isService: true },
      { id: 503, name: "Cera Modeladora Efecto Mate 100g", price: 5500, cost: 3200, category: "🧴 Productos", subcategory: "Ceras", stock: 15, code: "7794001", sku: "B003", isActive: true, unitType: "Unitario" },
      { id: 504, name: "Aceite Hidratante para Barba 30ml", price: 4800, cost: 2500, category: "🧴 Productos", subcategory: "Aceites para Barba", stock: 12, code: "7794002", sku: "B004", isActive: true, unitType: "Unitario" }
    ],
    mockSuppliers: [
      { id: 1, name: 'Sir Fausto' },
      { id: 2, name: 'Wahl' },
      { id: 3, name: 'Navajas Cuchillería' }
    ],
    mockClients: [
      { id: 1, name: 'Consumidor Final', cuit: '00-00000000-0', deuda: 0 },
      { id: 2, name: 'Carlos Rodríguez', cuit: '20-99887766-5', deuda: 0 },
      { id: 3, name: 'Martín Silva', cuit: '23-55443322-1', deuda: 0 }
    ]
  }
};
