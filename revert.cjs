const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

// Remove htmlFor="something"
content = content.replace(/ htmlFor="[^"]+"/g, '');
// Remove id="something"
content = content.replace(/ id="(?:cat_input|subcat_input|cost_input|margin_input|price_input|unit_input|stock_input|stock_alert_input|provider_input|exp_input|sku_input|combo_sku_input|name_input)"/g, '');

fs.writeFileSync('src/screens/Productos.jsx', content);
console.log('Reverted');
