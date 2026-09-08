const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

// Replace handleBulkDelete
content = content.replace(
  /const handleBulkDelete = \(\) => \{[\s\S]*?const handleDeleteAll = \(\) => \{/m,
  `const handleBulkDelete = () => {
    if (selectedIds.length === 0) {
      setAlertMessage("No se ha seleccionado ningún producto.");
      setShowAlert(true);
      return;
    }
    
    if (window.confirm(\`¿Estás seguro que deseas eliminar los \${selectedIds.length} productos seleccionados?\`)) {
      deleteProducts(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleDeleteAll = () => {`
);

fs.writeFileSync('src/screens/Productos.jsx', content);
console.log('handleBulkDelete updated');
