// Generator for 5 Months of Kiosk Demo Data

export function generate5MonthsDemoData() {
  const now = new Date();
  
  // 1. Categories and Subcategories
  const categoryTree = {
    "🥤 Bebidas": ["Gaseosas", "Aguas y Jugos", "Cervezas", "Aperitivos y Vinos", "Energizantes"],
    "🍫 Golosinas": ["Alfajores", "Chocolates", "Caramelos y Chicles", "Galletitas Dulces", "Snacks"],
    "🚬 Cigarrillos": ["Cigarrillos", "Encendedores", "Papel y Filtros"],
    "🌾 Almacén": ["Lácteos", "Yerba y Café", "Galletitas Saladas", "Fideos y Arroz", "Azúcar y Especias"]
  };

  // 2. Suppliers (5 suppliers)
  const suppliers = [
    { id: 1, name: 'Coca Cola Femsa', phone: '0800-888-2622', email: 'ventas@cocacola.com.ar', address: 'Av. Amancio Alcorta 3570' },
    { id: 2, name: 'Quilmes Cervecería', phone: '0800-222-7845', email: 'pedidos@quilmes.com.ar', address: 'Av. 12 de Octubre 100' },
    { id: 3, name: 'Arcor SA', phone: '0800-444-2726', email: 'distribuidora@arcor.com', address: 'Av. Fulvio Salvador Arcor 80' },
    { id: 4, name: 'Massalin Particulares', phone: '0800-555-8736', email: 'ventas@massalin.com', address: 'Av. de Mayo 605' },
    { id: 5, name: 'Distribuidora Don Pedro', phone: '11 4301-9988', email: 'donpedro@distribuidora.com', address: 'Av. Caseros 1420' }
  ];

  // 3. 60 Kiosk Products
  const rawProducts = [
    // Bebidas
    { name: "Coca-Cola 2.25L", sku: "7790001", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 1800, price: 2800, margin: 55.5, stock: 24, alert: 8, brand: "Coca-Cola", supplierId: 1 },
    { name: "Coca-Cola 500ml", sku: "7790002", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 700, price: 1200, margin: 71.4, stock: 36, alert: 10, brand: "Coca-Cola", supplierId: 1 },
    { name: "Coca-Cola Zero 1.5L", sku: "7790003", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 1500, price: 2300, margin: 53.3, stock: 18, alert: 6, brand: "Coca-Cola", supplierId: 1 },
    { name: "Sprite 1.5L", sku: "7790004", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 1450, price: 2200, margin: 51.7, stock: 15, alert: 5, brand: "Sprite", supplierId: 1 },
    { name: "Sprite Zero 500ml", sku: "7790005", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 680, price: 1100, margin: 61.7, stock: 20, alert: 6, brand: "Sprite", supplierId: 1 },
    { name: "Fanta Naranja 1.5L", sku: "7790006", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 1450, price: 2200, margin: 51.7, stock: 12, alert: 5, brand: "Fanta", supplierId: 1 },
    { name: "Fanta 500ml", sku: "7790007", category: "🥤 Bebidas", subcategory: "Gaseosas", cost: 680, price: 1100, margin: 61.7, stock: 14, alert: 5, brand: "Fanta", supplierId: 1 },
    { name: "Agua Villavicencio 500ml", sku: "7790008", category: "🥤 Bebidas", subcategory: "Aguas y Jugos", cost: 450, price: 800, margin: 77.7, stock: 40, alert: 12, brand: "Villavicencio", supplierId: 5 },
    { name: "Agua Villavicencio 1.5L", sku: "7790009", category: "🥤 Bebidas", subcategory: "Aguas y Jugos", cost: 750, price: 1300, margin: 73.3, stock: 25, alert: 8, brand: "Villavicencio", supplierId: 5 },
    { name: "Agua Saborizada Levité Manzana 1.5L", sku: "7790010", category: "🥤 Bebidas", subcategory: "Aguas y Jugos", cost: 950, price: 1600, margin: 68.4, stock: 16, alert: 6, brand: "Levité", supplierId: 5 },
    { name: "Cepita Naranja 1L", sku: "7790011", category: "🥤 Bebidas", subcategory: "Aguas y Jugos", cost: 900, price: 1500, margin: 66.6, stock: 18, alert: 6, brand: "Cepita", supplierId: 1 },
    { name: "Cerveza Quilmes Clásica 1L", sku: "7790012", category: "🥤 Bebidas", subcategory: "Cervezas", cost: 1600, price: 2500, margin: 56.2, stock: 30, alert: 10, brand: "Quilmes", supplierId: 2 },
    { name: "Cerveza Quilmes Stout 473ml", sku: "7790013", category: "🥤 Bebidas", subcategory: "Cervezas", cost: 1100, price: 1800, margin: 63.6, stock: 24, alert: 8, brand: "Quilmes", supplierId: 2 },
    { name: "Cerveza Brahma Lata 473ml", sku: "7790014", category: "🥤 Bebidas", subcategory: "Cervezas", cost: 980, price: 1600, margin: 63.2, stock: 32, alert: 10, brand: "Brahma", supplierId: 2 },
    { name: "Cerveza Stella Artois 730ml", sku: "7790015", category: "🥤 Bebidas", subcategory: "Cervezas", cost: 2200, price: 3400, margin: 54.5, stock: 16, alert: 5, brand: "Stella Artois", supplierId: 2 },
    { name: "Cerveza Corona 330ml Porrón", sku: "7790016", category: "🥤 Bebidas", subcategory: "Cervezas", cost: 1500, price: 2400, margin: 60.0, stock: 20, alert: 6, brand: "Corona", supplierId: 2 },
    { name: "Fernet Branca 750ml", sku: "7790017", category: "🥤 Bebidas", subcategory: "Aperitivos y Vinos", cost: 6500, price: 9500, margin: 46.1, stock: 10, alert: 4, brand: "Branca", supplierId: 5 },
    { name: "Gancia Americano 950ml", sku: "7790018", category: "🥤 Bebidas", subcategory: "Aperitivos y Vinos", cost: 3200, price: 4800, margin: 50.0, stock: 8, alert: 3, brand: "Gancia", supplierId: 5 },
    { name: "Campari 750ml", sku: "7790019", category: "🥤 Bebidas", subcategory: "Aperitivos y Vinos", cost: 5100, price: 7600, margin: 49.0, stock: 6, alert: 2, brand: "Campari", supplierId: 5 },
    { name: "Vino Termidor Tetra 1L", sku: "7790020", category: "🥤 Bebidas", subcategory: "Aperitivos y Vinos", cost: 1200, price: 1900, margin: 58.3, stock: 15, alert: 5, brand: "Termidor", supplierId: 5 },
    { name: "Red Bull 250ml", sku: "7790021", category: "🥤 Bebidas", subcategory: "Energizantes", cost: 1300, price: 2100, margin: 61.5, stock: 22, alert: 8, brand: "Red Bull", supplierId: 5 },
    { name: "Speed Unlimited 250ml", sku: "7790022", category: "🥤 Bebidas", subcategory: "Energizantes", cost: 850, price: 1400, margin: 64.7, stock: 28, alert: 10, brand: "Speed", supplierId: 5 },
    { name: "Monster Energy 473ml", sku: "7790023", category: "🥤 Bebidas", subcategory: "Energizantes", cost: 1400, price: 2300, margin: 64.2, stock: 18, alert: 6, brand: "Monster", supplierId: 5 },

    // Golosinas
    { name: "Alfajor Jorgito Negro", sku: "7790024", category: "🍫 Golosinas", subcategory: "Alfajores", cost: 350, price: 650, margin: 85.7, stock: 45, alert: 15, brand: "Jorgito", supplierId: 3 },
    { name: "Alfajor Jorgito Blanco", sku: "7790025", category: "🍫 Golosinas", subcategory: "Alfajores", cost: 350, price: 650, margin: 85.7, stock: 38, alert: 12, brand: "Jorgito", supplierId: 3 },
    { name: "Alfajor Guaymallén Chocolate", sku: "7790026", category: "🍫 Golosinas", subcategory: "Alfajores", cost: 200, price: 400, margin: 100.0, stock: 60, alert: 20, brand: "Guaymallén", supplierId: 3 },
    { name: "Alfajor Guaymallén Dulce de Leche", sku: "7790027", category: "🍫 Golosinas", subcategory: "Alfajores", cost: 200, price: 400, margin: 100.0, stock: 55, alert: 20, brand: "Guaymallén", supplierId: 3 },
    { name: "Alfajor Havanna Mixto (Caja 6u)", sku: "7790028", category: "🍫 Golosinas", subcategory: "Alfajores", cost: 4500, price: 6900, margin: 53.3, stock: 8, alert: 3, brand: "Havanna", supplierId: 3 },
    { name: "Chocolate Milka Leche 100g", sku: "7790029", category: "🍫 Golosinas", subcategory: "Chocolates", cost: 1200, price: 1950, margin: 62.5, stock: 25, alert: 8, brand: "Milka", supplierId: 3 },
    { name: "Chocolate Milka Oreo 100g", sku: "7790030", category: "🍫 Golosinas", subcategory: "Chocolates", cost: 1300, price: 2100, margin: 61.5, stock: 20, alert: 6, brand: "Milka", supplierId: 3 },
    { name: "Chocolate Marroc 14g", sku: "7790031", category: "🍫 Golosinas", subcategory: "Chocolates", cost: 180, price: 350, margin: 94.4, stock: 50, alert: 15, brand: "Felfort", supplierId: 3 },
    { name: "Bon o Bon Leche", sku: "7790032", category: "🍫 Golosinas", subcategory: "Chocolates", cost: 150, price: 300, margin: 100.0, stock: 70, alert: 25, brand: "Arcor", supplierId: 3 },
    { name: "Chocolate Tita", sku: "7790033", category: "🍫 Golosinas", subcategory: "Chocolates", cost: 220, price: 450, margin: 104.5, stock: 40, alert: 15, brand: "Terrabusi", supplierId: 3 },
    { name: "Chocolate Rhodesia", sku: "7790034", category: "🍫 Golosinas", subcategory: "Chocolates", cost: 250, price: 500, margin: 100.0, stock: 35, alert: 12, brand: "Terrabusi", supplierId: 3 },
    { name: "Caramelos Flynn Paff Masticables", sku: "7790035", category: "🍫 Golosinas", subcategory: "Caramelos y Chicles", cost: 80, price: 150, margin: 87.5, stock: 90, alert: 30, brand: "Georgalos", supplierId: 3 },
    { name: "Caramelos Sugus Confitados", sku: "7790036", category: "🍫 Golosinas", subcategory: "Caramelos y Chicles", cost: 300, price: 550, margin: 83.3, stock: 30, alert: 10, brand: "Arcor", supplierId: 3 },
    { name: "Chicles Beldent Menta Fuerte", sku: "7790037", category: "🍫 Golosinas", subcategory: "Caramelos y Chicles", cost: 350, price: 650, margin: 85.7, stock: 45, alert: 15, brand: "Beldent", supplierId: 3 },
    { name: "Chicles Topline Menta Mentol", sku: "7790038", category: "🍫 Golosinas", subcategory: "Caramelos y Chicles", cost: 320, price: 600, margin: 87.5, stock: 40, alert: 12, brand: "Topline", supplierId: 3 },
    { name: "Galletitas Oreo 118g", sku: "7790039", category: "🍫 Golosinas", subcategory: "Galletitas Dulces", cost: 850, price: 1400, margin: 64.7, stock: 30, alert: 10, brand: "Oreo", supplierId: 3 },
    { name: "Galletitas Chocolinas 170g", sku: "7790040", category: "🍫 Golosinas", subcategory: "Galletitas Dulces", cost: 900, price: 1500, margin: 66.6, stock: 24, alert: 8, brand: "Bagley", supplierId: 3 },
    { name: "Galletitas Sonrisas 108g", sku: "7790041", category: "🍫 Golosinas", subcategory: "Galletitas Dulces", cost: 650, price: 1100, margin: 69.2, stock: 28, alert: 8, brand: "Bagley", supplierId: 3 },
    { name: "Papas Lays Clásicas 85g", sku: "7790042", category: "🍫 Golosinas", subcategory: "Snacks", cost: 1100, price: 1850, margin: 68.1, stock: 22, alert: 8, brand: "Lays", supplierId: 5 },
    { name: "Doritos Queso 90g", sku: "7790043", category: "🍫 Golosinas", subcategory: "Snacks", cost: 1200, price: 2000, margin: 66.6, stock: 18, alert: 6, brand: "Doritos", supplierId: 5 },
    { name: "Cheetos Queso 80g", sku: "7790044", category: "🍫 Golosinas", subcategory: "Snacks", cost: 950, price: 1600, margin: 68.4, stock: 15, alert: 5, brand: "Cheetos", supplierId: 5 },
    { name: "Maní Salado Pehuamar 100g", sku: "7790045", category: "🍫 Golosinas", subcategory: "Snacks", cost: 600, price: 1000, margin: 66.6, stock: 25, alert: 8, brand: "Pehuamar", supplierId: 5 },

    // Cigarrillos
    { name: "Marlboro Red Box 20", sku: "7790046", category: "🚬 Cigarrillos", subcategory: "Cigarrillos", cost: 2400, price: 2900, margin: 20.8, stock: 35, alert: 10, brand: "Marlboro", supplierId: 4 },
    { name: "Marlboro Gold Box 20", sku: "7790047", category: "🚬 Cigarrillos", subcategory: "Cigarrillos", cost: 2400, price: 2900, margin: 20.8, stock: 28, alert: 10, brand: "Marlboro", supplierId: 4 },
    { name: "Philip Morris Box 20", sku: "7790048", category: "🚬 Cigarrillos", subcategory: "Cigarrillos", cost: 2100, price: 2600, margin: 23.8, stock: 40, alert: 12, brand: "Philip Morris", supplierId: 4 },
    { name: "Philip Morris Caps Box 20", sku: "7790049", category: "🚬 Cigarrillos", subcategory: "Cigarrillos", cost: 2100, price: 2600, margin: 23.8, stock: 32, alert: 10, brand: "Philip Morris", supplierId: 4 },
    { name: "Chesterfield Red Box 20", sku: "7790050", category: "🚬 Cigarrillos", subcategory: "Cigarrillos", cost: 1800, price: 2200, margin: 22.2, stock: 25, alert: 8, brand: "Chesterfield", supplierId: 4 },
    { name: "Camel Box 20", sku: "7790051", category: "🚬 Cigarrillos", subcategory: "Cigarrillos", cost: 2300, price: 2800, margin: 21.7, stock: 20, alert: 6, brand: "Camel", supplierId: 4 },
    { name: "Encendedor Bic Grande", sku: "7790052", category: "🚬 Cigarrillos", subcategory: "Encendedores", cost: 600, price: 1100, margin: 83.3, stock: 30, alert: 10, brand: "Bic", supplierId: 5 },
    { name: "Encendedor Bic Mini", sku: "7790053", category: "🚬 Cigarrillos", subcategory: "Encendedores", cost: 450, price: 850, margin: 88.8, stock: 25, alert: 8, brand: "Bic", supplierId: 5 },
    { name: "Papelillos OCB Negro 1 1/4", sku: "7790054", category: "🚬 Cigarrillos", subcategory: "Papel y Filtros", cost: 500, price: 950, margin: 90.0, stock: 40, alert: 12, brand: "OCB", supplierId: 5 },

    // Almacén
    { name: "Leche Serenísima Entera 1L", sku: "7790055", category: "🌾 Almacén", subcategory: "Lácteos", cost: 1100, price: 1650, margin: 50.0, stock: 20, alert: 6, brand: "La Serenísima", supplierId: 5 },
    { name: "Mermelada La Campagnola Frutilla 390g", sku: "7790056", category: "🌾 Almacén", subcategory: "Lácteos", cost: 1400, price: 2200, margin: 57.1, stock: 12, alert: 4, brand: "La Campagnola", supplierId: 5 },
    { name: "Yerba Mate Playadito 500g", sku: "7790057", category: "🌾 Almacén", subcategory: "Yerba y Café", cost: 1900, price: 2900, margin: 52.6, stock: 35, alert: 10, brand: "Playadito", supplierId: 5 },
    { name: "Yerba Mate Taragüí 500g", sku: "7790058", category: "🌾 Almacén", subcategory: "Yerba y Café", cost: 1750, price: 2700, margin: 54.2, stock: 28, alert: 8, brand: "Taragüí", supplierId: 5 },
    { name: "Café La Virginia Molido 250g", sku: "7790059", category: "🌾 Almacén", subcategory: "Yerba y Café", cost: 2400, price: 3700, margin: 54.1, stock: 15, alert: 5, brand: "La Virginia", supplierId: 5 },
    { name: "Bizcochos Don Saturno Salados", sku: "7790060", category: "🌾 Almacén", subcategory: "Galletitas Saladas", cost: 550, price: 950, margin: 72.7, stock: 40, alert: 12, brand: "Don Saturno", supplierId: 5 }
  ];

  const products = rawProducts.map((p, index) => ({
    id: index + 101,
    name: p.name,
    code: p.sku,
    sku: p.sku,
    category: p.category,
    subcategory: p.subcategory,
    cost: p.cost,
    price: p.price,
    margin: p.margin,
    stock: p.stock,
    stockAlert: p.alert,
    unitType: 'Unitario',
    isActive: true,
    brand: p.brand,
    supplierId: p.supplierId,
    dismissExpirationAlert: false
  }));

  // Expiration date for testing alerts
  const expDateSoon = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  products[5].expirationDate = expDateSoon; 
  products[55].expirationDate = expDateSoon; 

  // 4. 30 Clientes
  const rawClients = [
    { name: "Consumidor Final", cuit: "00-00000000-0", debt: 0 },
    { name: "Juan Carlos Gómez", cuit: "20-28491823-4", phone: "11 4589-1234", debt: 3500 },
    { name: "Mariana López", cuit: "27-33910245-8", phone: "11 5918-2345", debt: 0 },
    { name: "Gonzalo Rossi", cuit: "20-31294819-2", phone: "11 3412-9876", debt: 12000 },
    { name: "Lucía Fernández", cuit: "27-36192847-1", phone: "11 6789-3412", debt: 0 },
    { name: "Esteban Martínez", cuit: "20-35819203-9", phone: "11 4123-5678", debt: 4500 },
    { name: "Valentina Torres", cuit: "27-38192039-4", phone: "11 5123-9876", debt: 0 },
    { name: "Roberto Sánchez", cuit: "20-22918239-5", phone: "11 3918-4712", debt: 8200 },
    { name: "Camila Benítez", cuit: "27-39182039-2", phone: "11 6123-4567", debt: 0 },
    { name: "Diego Peralta", cuit: "20-34918203-6", phone: "11 4987-1234", debt: 1500 },
    { name: "Florencia Díaz", cuit: "27-37192834-0", phone: "11 5432-8765", debt: 0 },
    { name: "Agustín Romero", cuit: "20-36918203-1", phone: "11 3876-5432", debt: 6700 },
    { name: "Sofía Álvarez", cuit: "27-40192834-7", phone: "11 6543-2198", debt: 0 },
    { name: "Matías Acosta", cuit: "20-33819203-3", phone: "11 4321-9876", debt: 2800 },
    { name: "Natalia Castro", cuit: "27-35918203-5", phone: "11 5876-1234", debt: 0 },
    { name: "Franco Navarro", cuit: "20-38918203-8", phone: "11 3219-8765", debt: 9400 },
    { name: "Paola Quiroga", cuit: "27-32918203-3", phone: "11 6987-5432", debt: 0 },
    { name: "Nicolás Giménez", cuit: "20-37819203-2", phone: "11 4876-2345", debt: 3100 },
    { name: "Patricia Medina", cuit: "27-29918203-6", phone: "11 5234-9876", debt: 0 },
    { name: "Gabriel Silva", cuit: "20-32819203-7", phone: "11 3765-4321", debt: 5200 },
    { name: "Lorena Roldán", cuit: "27-34819203-9", phone: "11 6432-1987", debt: 0 },
    { name: "Sebastián Molina", cuit: "20-30918203-4", phone: "11 4765-9812", debt: 1800 },
    { name: "Julieta Ríos", cuit: "27-39918203-1", phone: "11 5198-2736", debt: 0 },
    { name: "Hernán Cabrera", cuit: "20-29819203-0", phone: "11 3654-9812", debt: 7300 },
    { name: "Andrea Luna", cuit: "27-31819203-4", phone: "11 6273-9814", debt: 0 },
    { name: "Maximiliano Soria", cuit: "20-35192834-6", phone: "11 4198-2736", debt: 4200 },
    { name: "Victoria Ibáñez", cuit: "27-37819203-2", phone: "11 5827-3914", debt: 0 },
    { name: "Leandro Vega", cuit: "20-36192834-9", phone: "11 3914-8273", debt: 2100 },
    { name: "Griselda Ponce", cuit: "27-30819203-8", phone: "11 6391-4827", debt: 0 },
    { name: "Facundo Carrizo", cuit: "20-39192834-5", phone: "11 4827-3914", debt: 5900 }
  ];

  const clients = rawClients.map((c, idx) => ({
    id: idx === 0 ? 1 : idx + 10,
    name: c.name,
    cuit: c.cuit,
    phone: c.phone || '',
    deuda: c.debt || 0
  }));

  // 5. 25 Compras over 5 months
  const purchases = [];
  const fiveMonthsAgoMs = now.getTime() - 150 * 24 * 60 * 60 * 1000;
  
  for (let i = 1; i <= 25; i++) {
    const pTimeMs = fiveMonthsAgoMs + (i * 6 * 24 * 60 * 60 * 1000);
    const pDate = new Date(pTimeMs).toISOString();
    const sup = suppliers[(i % suppliers.length)];
    
    const item1 = products[(i * 2) % products.length];
    const item2 = products[(i * 3) % products.length];
    const item3 = products[(i * 5) % products.length];
    
    const qty1 = 10 + (i % 5) * 5;
    const qty2 = 12 + (i % 4) * 6;
    const qty3 = 8 + (i % 3) * 4;

    const total = (qty1 * item1.cost) + (qty2 * item2.cost) + (qty3 * item3.cost);

    purchases.push({
      id: 2000 + i,
      date: pDate,
      supplierTerm: sup.name,
      method: i % 3 === 0 ? 'Transferencia' : 'Efectivo',
      total: total,
      items: [
        { id: item1.id, name: item1.name, qty: qty1, cost: item1.cost, price: item1.price, margin: item1.margin },
        { id: item2.id, name: item2.name, qty: qty2, cost: item2.cost, price: item2.price, margin: item2.margin },
        { id: item3.id, name: item3.name, qty: qty3, cost: item3.cost, price: item3.price, margin: item3.margin }
      ]
    });
  }

  // 6. Sales history & Shifts over 5 months (~150 sales, ~100 shifts)
  const sales = [];
  const shifts = [];
  const paymentMethodsList = ['Efectivo', 'Mercado Pago', 'Tarjeta Débito', 'Tarjeta Crédito', 'Fiado'];

  let saleCounter = 5000;
  let shiftCounter = 8000;

  for (let day = 150; day >= 1; day -= 1.5) {
    const shiftDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    const shiftDateStr = shiftDate.toISOString().split('T')[0];
    const openTimeMs = shiftDate.getTime();
    const closeTimeMs = openTimeMs + 8 * 60 * 60 * 1000;

    const shiftSalesCount = 2 + Math.floor(Math.random() * 3);
    let shiftTotalSales = 0;
    let shiftTotalEfectivo = 0;
    let shiftTotalDigital = 0;
    let shiftTotalFiado = 0;

    for (let s = 0; s < shiftSalesCount; s++) {
      saleCounter++;
      const saleTimeMs = openTimeMs + (s + 1) * 1.5 * 60 * 60 * 1000;
      const method = paymentMethodsList[Math.floor(Math.random() * paymentMethodsList.length)];
      
      const p1 = products[Math.floor(Math.random() * products.length)];
      const p2 = products[Math.floor(Math.random() * products.length)];
      const q1 = Math.floor(Math.random() * 3) + 1;
      const q2 = Math.floor(Math.random() * 2) + 1;

      const saleTotal = (p1.price * q1) + (p2.price * q2);
      shiftTotalSales += saleTotal;

      let clientObj = null;
      if (method === 'Fiado') {
        const indebtedClients = clients.filter(c => c.id !== 1);
        clientObj = indebtedClients[Math.floor(Math.random() * indebtedClients.length)];
        shiftTotalFiado += saleTotal;
      } else if (method === 'Efectivo') {
        shiftTotalEfectivo += saleTotal;
      } else {
        shiftTotalDigital += saleTotal;
      }

      sales.push({
        id: saleCounter,
        date: new Date(saleTimeMs).toISOString(),
        total: saleTotal,
        method: method,
        client: clientObj ? clientObj.name : 'Consumidor Final',
        clientId: clientObj ? clientObj.id : null,
        sellerId: 1,
        sellerName: 'Administrador',
        items: [
          { id: p1.id, name: p1.name, price: p1.price, cost: p1.cost, qty: q1, lineTotal: p1.price * q1 },
          { id: p2.id, name: p2.name, price: p2.price, cost: p2.cost, qty: q2, lineTotal: p2.price * q2 }
        ]
      });
    }

    const movements = [];
    if (Math.floor(day) % 10 === 0) {
      movements.push({
        id: Date.now() + Math.random(),
        type: 'withdraw',
        amount: 5000,
        motivo: 'Retiro para pago de reposición',
        user: 'Administrador',
        date: new Date(openTimeMs + 2 * 3600000).toISOString()
      });
    }
    if (Math.floor(day) % 15 === 0) {
      movements.push({
        id: Date.now() + Math.random(),
        type: 'deposit',
        amount: 3000,
        motivo: 'Ingreso para cambio de caja chico',
        user: 'Administrador',
        date: new Date(openTimeMs + 1 * 3600000).toISOString()
      });
    }

    const initialEfectivo = 10000;
    const expectedEfectivo = initialEfectivo + shiftTotalEfectivo;
    const reportedEfectivo = expectedEfectivo;

    shiftCounter++;
    shifts.push({
      id: shiftCounter,
      openedBy: 1,
      openedByName: 'Administrador',
      openedDate: shiftDateStr,
      openedAt: '09:00',
      openedTimestamp: openTimeMs,
      closedAtDate: new Date(closeTimeMs).toISOString(),
      salesCount: shiftSalesCount,
      initialEfectivo: initialEfectivo,
      expectedEfectivo: expectedEfectivo,
      reportedEfectivo: reportedEfectivo,
      difference: 0,
      totalSalesRevenue: shiftTotalSales,
      totalDigital: shiftTotalDigital,
      totalFiado: shiftTotalFiado,
      movimientos: movements
    });
  }

  return {
    categoryTree,
    suppliers,
    products,
    clients,
    purchases,
    sales,
    shifts
  };
}
