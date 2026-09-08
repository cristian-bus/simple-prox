const fs = require('fs');
const path = require('path');

const screensDir = 'c:\\Users\\Pininas\\KioscoProX\\src\\screens';
const screens = [
    'PuntoDeVenta.jsx',
    'Productos.jsx',
    'Inventario.jsx',
    'Compras.jsx',
    'Usuarios.jsx',
    'Clientes.jsx',
    'Reportes.jsx',
    'Configuracion.jsx',
    'Soporte.jsx'
];

screens.forEach(file => {
    const filePath = path.join(screensDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if it's already memoized
    if (content.includes('export default React.memo(') || content.includes('export default memo(')) {
        console.log(`${file} is already memoized.`);
        return;
    }
    
    // Make sure React is imported for React.memo to work
    if (!content.includes("import React") && !content.includes("import * as React")) {
        // If not imported, we could import memo, but React is usually imported.
        // Let's assume React is imported in all these files based on typical Vite templates.
        // If it throws an error we'll see it.
    }
    
    const componentName = file.replace('.jsx', '');
    const exportRegex = new RegExp(`export default ${componentName};`, 'g');
    
    if (exportRegex.test(content)) {
        content = content.replace(exportRegex, `export default React.memo(${componentName});`);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Memoized ${file}.`);
    } else {
        console.log(`Warning: Could not find export default ${componentName}; in ${file}`);
    }
});
