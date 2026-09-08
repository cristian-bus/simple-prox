import re

path = r'c:\Users\Pininas\KioscoProX\src\hooks\useKiosco.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect, useCallback, useMemo } from 'react';")

# 2. Add useCallback
def wrap_func(content, func_name, deps):
    # Find the start of the function
    pattern = rf'const {func_name} = (\([^)]*\)) => {{'
    match = re.search(pattern, content)
    if not match:
        return content
    
    start_idx = match.start()
    
    # Replace the signature
    replacement = f'const {func_name} = useCallback({match.group(1)} => {{'
    content = content[:start_idx] + replacement + content[match.end():]
    
    # We need to find the matching closing brace.
    # Start looking from the end of the replaced signature.
    brace_count = 1
    idx = start_idx + len(replacement)
    
    while idx < len(content) and brace_count > 0:
        if content[idx] == '{':
            brace_count += 1
        elif content[idx] == '}':
            brace_count -= 1
        idx += 1
    
    if brace_count == 0:
        # We found the end of the function body (idx is right after '}')
        # We need to insert `}, deps);` instead of just `};`
        # Let's check if the next character is a semicolon and remove it if so
        end_idx = idx
        if end_idx < len(content) and content[end_idx] == ';':
            end_idx += 1
        
        content = content[:idx] + f", [{deps}]);\n" + content[end_idx:]
    
    return content

funcs_no_deps = ['addProduct', 'updateProduct', 'deleteProduct', 'applyGlobalIva', 'addSale', 'addPurchase', 'addClient', 'updateClient', 'deleteClient', 'payDebt', 'addUser', 'updateUser', 'deleteUser', 'updateCaja', 'closeCajaAndSaveShift']

for fn in funcs_no_deps:
    content = wrap_func(content, fn, "")

# updatePurchase has dependency on purchases
content = wrap_func(content, 'updatePurchase', "purchases")

# 3. Replace the return statement with useMemo
return_pattern = r'return \{\s*products,[\s\S]*applyGlobalIva\s*\};\s*\}\;'
match = re.search(return_pattern, content)
if match:
    ret_start = match.start()
    use_memo_str = """
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
"""
    content = content[:ret_start] + use_memo_str
else:
    print("Could not find return statement")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Transformation complete.")
