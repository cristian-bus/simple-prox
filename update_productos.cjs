const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

// 1. Add selectedIds state and deleteProducts from kiosco
content = content.replace(
  /const { products, addProduct: saveProduct, updateProduct, deleteProduct, /g,
  'const { products, addProduct: saveProduct, updateProduct, deleteProduct, deleteProducts, '
);

content = content.replace(
  /const \[productToDelete, setProductToDelete\] = useState\(null\);/g,
  'const [productToDelete, setProductToDelete] = useState(null);\n  const [selectedIds, setSelectedIds] = useState([]);'
);

// 2. Add handleBulkDelete
content = content.replace(
  /const handleDeleteAll = \(\) => {/g,
  `const handleBulkDelete = () => {
    if (selectedIds.length > 0) {
      if (window.confirm(\`¿Estás seguro que deseas eliminar los \${selectedIds.length} productos seleccionados?\`)) {
        deleteProducts(selectedIds);
        setSelectedIds([]);
      }
    } else {
      if (window.confirm("¿Estás seguro que deseas eliminar TODOS los productos del inventario? Esta acción no se puede deshacer y dejará tu base de datos en 0.")) {
        kiosco.deleteAllProducts();
      }
    }
  };

  const handleDeleteAll = () => {`
);

// 3. Update 'Borrar Todo' button
content = content.replace(
  /<button className="btn btn-outline" onClick={handleDeleteAll} style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>\s*<Trash2 size={16} \/> Borrar Todo\s*<\/button>/g,
  `<button className="btn btn-outline" onClick={handleBulkDelete} style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={16} /> Borrar
          </button>`
);

// 4. Update the th checkbox
content = content.replace(
  /<th style={{ width: '40px' }}><input type="checkbox" \/><\/th>/g,
  `<th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={paginatedProducts.length > 0 && selectedIds.length === paginatedProducts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(paginatedProducts.map(p => p.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>`
);

// 5. Update the td checkbox
content = content.replace(
  /<td><input type="checkbox" \/><\/td>/g,
  `<td>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => [...prev, p.id]);
                        } else {
                          setSelectedIds(prev => prev.filter(id => id !== p.id));
                        }
                      }}
                    />
                  </td>`
);

fs.writeFileSync('src/screens/Productos.jsx', content);
console.log('Productos.jsx updated');
