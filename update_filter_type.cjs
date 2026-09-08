const fs = require('fs');
let content = fs.readFileSync('src/screens/Productos.jsx', 'utf8');

const target = `              {(kiosco.businessConfig?.plan !== 'Básico' || kiosco.businessConfig?.businessType !== 'kiosco') && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Tipo</label>
                  <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="Todos">Todos</option>
                    <option value="Productos">Solo Productos</option>
                    <option value="Servicios">Solo Servicios</option>
                    {kiosco.businessConfig?.plan !== 'Básico' && <option value="Combos">Solo Combos</option>}
                  </select>
                </div>
              )}`;

const replacement = `              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Tipo</label>
                <select 
                  className="input" 
                  value={filterType} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'Combos' && kiosco.businessConfig?.plan === 'Básico') {
                      setAlertMessage("La función de Combos pertenece al Plan Pro. Por favor actualiza tu plan para utilizar Combos.");
                      setShowAlert(true);
                      return;
                    }
                    setFilterType(val);
                  }}
                >
                  <option value="Todos">Todos</option>
                  <option value="Productos">Solo Productos</option>
                  <option value="Servicios">Solo Servicios</option>
                  <option value="Combos">Solo Combos</option>
                </select>
              </div>`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/screens/Productos.jsx', content);
  console.log('Successfully updated filterType in Productos.jsx');
} else {
  console.log('Target not found in Productos.jsx');
}
