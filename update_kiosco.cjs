const fs = require('fs');
let content = fs.readFileSync('src/hooks/useKiosco.js', 'utf8');

content = content.replace(
  /const deleteProduct = useCallback\(\(id\) => \{\s*setProducts\(prev => prev\.filter\(p => p\.id !== id\)\);\s*\}, \[\]\);/g,
  `const deleteProduct = useCallback((id) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  const deleteProducts = useCallback((ids) => {
    setProducts(prev => prev.filter(p => !ids.includes(p.id)));
  }, []);`
);

content = content.replace(
  /deleteProduct,/g,
  `deleteProduct, deleteProducts,`
);

fs.writeFileSync('src/hooks/useKiosco.js', content);
console.log('useKiosco updated');
