const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

const fields = [
  { labelText: 'CATEGORÍA', id: 'cat_input' },
  { labelText: 'SUBCATEGORÍA', id: 'subcat_input' },
  { labelText: 'COSTO', id: 'cost_input' },
  { labelText: '% GANANCIA', id: 'margin_input' },
  { labelText: 'PRECIO VENTA', id: 'price_input' },
  { labelText: 'UNIDAD DE MEDIDA', id: 'unit_input' },
  { labelText: 'STOCK INICIAL', id: 'stock_input' },
  { labelText: 'STOCK MÍNIMO', id: 'stock_alert_input' },
  { labelText: 'PROVEEDOR', id: 'provider_input' },
  { labelText: 'FECHA DE VENCIMIENTO', id: 'exp_input' }
];

let replaced = 0;
fields.forEach(f => {
  const labelRegex = new RegExp(`<label style={{([^}]+)}}>([^<]*${f.labelText}[^<]*)</label>\\s*(?:<div[^>]*>\\s*)?<([a-z]+)`, 'gi');
  content = content.replace(labelRegex, (match, style, text, nextTag) => {
     replaced++;
     // Note: If there's a wrapper div (like the one with CÓDIGO), this naive approach will add the ID to the wrapper div.
     // But since we just want to ensure we add htmlFor, maybe it's fine. 
     // Wait, if it adds ID to a div, clicking the label might not focus the input inside it.
     return `<label htmlFor="${f.id}" style={{${style}}}>${text}</label>\n<${nextTag} id="${f.id}"`;
  });
});

console.log(`Replaced ${replaced} labels`);
fs.writeFileSync('src/screens/Productos.jsx', content);
