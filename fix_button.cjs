const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

content = content.replace(
  /<button className="btn btn-outline" onClick=\{handleDeleteAll\}/g,
  '<button className="btn btn-outline" onClick={handleBulkDelete}'
);

content = content.replace(
  /<Trash2 size=\{16\} \/> Borrar Todo/g,
  '<Trash2 size={16} /> Borrar'
);

fs.writeFileSync('src/screens/Productos.jsx', content);
console.log('Button updated');
