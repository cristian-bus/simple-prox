const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

content = content.replace(
  /<label style={{([^}]+)}}>CÓDIGO<\/label>\s*<div style={{ display: 'flex', gap: '8px' }}>\s*<input type="text" className="input" placeholder="Ej: P001" value={formData\.sku}/g,
  '<label htmlFor="sku_input" style={{$1}}>CÓDIGO</label>\n              <div style={{ display: \'flex\', gap: \'8px\' }}>\n                <input id="sku_input" type="text" className="input" placeholder="Ej: P001" value={formData.sku}'
);

content = content.replace(
  /<label style={{([^}]+)}}>CÓDIGO<\/label>\s*<div style={{ display: 'flex', gap: '8px' }}>\s*<input type="text" className="input" placeholder="Ej: COMBO-001" value={comboData\.sku}/g,
  '<label htmlFor="combo_sku_input" style={{$1}}>CÓDIGO</label>\n              <div style={{ display: \'flex\', gap: \'8px\' }}>\n                <input id="combo_sku_input" type="text" className="input" placeholder="Ej: COMBO-001" value={comboData.sku}'
);

content = content.replace(
  /<label style={{([^}]+)}}>{formData\.isService \? 'TIPO DE SERVICIO \\(Nombre\\)' : 'NOMBRE'}<\/label>\s*<input type="text" className="input" placeholder={formData\.isService/g,
  '<label htmlFor="name_input" style={{$1}}>{formData.isService ? \'TIPO DE SERVICIO (Nombre)\' : \'NOMBRE\'}</label>\n              <input id="name_input" type="text" className="input" placeholder={formData.isService'
);

fs.writeFileSync('src/screens/Productos.jsx', content);
console.log('Done');
