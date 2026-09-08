const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

// For Product Modal
content = content.replace(
  /<label style={{([^}]+)}}>CÓDIGO<\/label>\s*<div style={{ display: 'flex', gap: '8px' }}>\s*<input type="text" className="input" placeholder="Ej: P001" value={formData\.sku}/g,
  '<label htmlFor="sku_input_prod" style={{$1}}>CÓDIGO</label>\n              <div style={{ display: \'flex\', gap: \'8px\' }}>\n                <input id="sku_input_prod" type="text" className="input" placeholder="Ej: P001" value={formData.sku}'
);

// For Combo Modal
content = content.replace(
  /<label style={{([^}]+)}}>CÓDIGO<\/label>\s*<div style={{ display: 'flex', gap: '8px' }}>\s*<input type="text" className="input" placeholder="Ej: COMBO-001" value={comboData\.sku}/g,
  '<label htmlFor="sku_input_combo" style={{$1}}>CÓDIGO</label>\n              <div style={{ display: \'flex\', gap: \'8px\' }}>\n                <input id="sku_input_combo" type="text" className="input" placeholder="Ej: COMBO-001" value={comboData.sku}'
);

fs.writeFileSync('src/screens/Productos.jsx', content);
console.log('Fixed CÓDIGO correctly');
