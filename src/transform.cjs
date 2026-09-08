const fs = require('fs');

const path = 'c:\\Users\\Pininas\\KioscoProX\\src\\hooks\\useKiosco.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Update imports
content = content.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect, useCallback, useMemo } from 'react';");

// 2. Add useCallback
function wrapFunc(content, funcName, deps) {
    const pattern = new RegExp(`const ${funcName} = (\\([^)]*\\)) => \\{`);
    const match = content.match(pattern);
    if (!match) return content;
    
    const startIdx = match.index;
    const replacement = `const ${funcName} = useCallback(${match[1]} => {`;
    
    let newContent = content.substring(0, startIdx) + replacement + content.substring(startIdx + match[0].length);
    
    let braceCount = 1;
    let idx = startIdx + replacement.length;
    
    while (idx < newContent.length && braceCount > 0) {
        if (newContent[idx] === '{') braceCount++;
        else if (newContent[idx] === '}') braceCount--;
        idx++;
    }
    
    if (braceCount === 0) {
        let endIdx = idx;
        if (endIdx < newContent.length && newContent[endIdx] === ';') {
            endIdx++;
        }
        newContent = newContent.substring(0, idx) + `, [${deps}]);\n` + newContent.substring(endIdx);
    }
    return newContent;
}

const funcsNoDeps = ['addProduct', 'updateProduct', 'deleteProduct', 'applyGlobalIva', 'addSale', 'addPurchase', 'addClient', 'updateClient', 'deleteClient', 'payDebt', 'addUser', 'updateUser', 'deleteUser', 'updateCaja', 'closeCajaAndSaveShift'];

for (const fn of funcsNoDeps) {
    content = wrapFunc(content, fn, "");
}

content = wrapFunc(content, 'updatePurchase', "purchases");

// 3. Replace the return statement with useMemo
const returnPattern = /return \{\s*products,[\s\S]*applyGlobalIva\s*\};\s*\}\;/;
const match = content.match(returnPattern);
if (match) {
    const retStart = match.index;
    const useMemoStr = `
  const contextValue = useMemo(() => ({
    products,
    sales,
    purchases,
    clients,
    caja,
    users,
    addProduct,
    updateProduct,
    deleteProduct,
    addSale,
    addPurchase,
    updatePurchase,
    addClient,
    updateClient,
    deleteClient,
    addUser,
    updateUser,
    deleteUser,
    updateCaja,
    payDebt,
    shifts,
    closeCajaAndSaveShift,
    categoryTree,
    updateCategoryTree: setCategoryTree,
    suppliers,
    setSuppliers,
    businessConfig,
    updateBusinessConfig: setBusinessConfig,
    applyGlobalIva
  }), [
    products, sales, purchases, clients, caja, users, categoryTree, suppliers, businessConfig, shifts,
    addProduct, updateProduct, deleteProduct, addSale, addPurchase, updatePurchase, addClient, updateClient, deleteClient, addUser, updateUser, deleteUser, updateCaja, payDebt, closeCajaAndSaveShift, applyGlobalIva
  ]);

  return contextValue;
};
`;
    content = content.substring(0, retStart) + useMemoStr;
} else {
    console.log("Could not find return statement");
}

fs.writeFileSync(path, content, 'utf8');
console.log("Transformation complete.");
