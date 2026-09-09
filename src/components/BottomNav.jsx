import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Package, 
  Layers, 
  ShoppingBag, 
  Users, 
  UserCircle, 
  BarChart2, 
  Settings, 
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Tag
} from 'lucide-react';
import { subscribeUpdate, UPDATE_STATUS } from '../services/updateService';

const BottomNav = ({ currentScreen, setCurrentScreen, activeUser, navCollapsed, setNavCollapsed, kiosco }) => {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeUpdate((state) => {
      setUpdateReady(state.status === UPDATE_STATUS.READY_TO_INSTALL);
    });
    return () => unsub();
  }, []);
  const allNavItems = [
    { id: 'punto-venta', label: 'Venta', icon: ShoppingCart, roles: ['Admin', 'Vendedor'] },
    { id: 'turnos', label: 'Turnos', icon: Calendar, roles: ['Admin', 'Vendedor'] },
    { id: 'ofertas', label: 'Ofertas B2B', icon: Tag, roles: ['Admin', 'Vendedor'] },
    { id: 'productos', label: 'Productos', icon: Package, roles: ['Admin'] },
    { id: 'inventario', label: 'Inventario', icon: Layers, roles: ['Admin'] },
    { id: 'compras', label: 'Compras', icon: ShoppingBag, roles: ['Admin', 'Vendedor'] },
    { id: 'usuarios', label: 'Usuarios', icon: Users, roles: ['Admin'] },
    { id: 'clientes', label: 'Clientes', icon: UserCircle, roles: ['Admin', 'Vendedor'] },
    { id: 'reportes', label: 'Reportes', icon: BarChart2, roles: ['Admin'] },
    { id: 'configuracion', label: 'Config', icon: Settings, roles: ['Admin'] },
    { id: 'soporte', label: 'Soporte', icon: HelpCircle, roles: ['Admin', 'Vendedor'] }
  ];

  const currentUserRole = activeUser ? activeUser.role : 'Admin';
  const navItems = allNavItems.filter(item => {
    if (!item.roles.includes(currentUserRole)) return false;
    if (item.id === 'turnos' && kiosco?.businessConfig?.businessType?.toLowerCase() !== 'barberia') return false;
    if (item.id === 'ofertas' && kiosco?.businessConfig?.businessType !== 'kiosco') return false;
    return true;
  });

  return (
    <div className="bottom-nav">
      <div className="nav-container">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="icon-wrapper" style={{ position: 'relative' }}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {item.id === 'configuracion' && updateReady && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '8px',
                      height: '8px',
                      backgroundColor: '#10b981',
                      borderRadius: '50%',
                      boxShadow: '0 0 6px #10b981',
                      border: '1.5px solid var(--color-surface, #ffffff)'
                    }}
                    title="Actualización del sistema lista"
                  />
                )}
              </div>
              <span className="nav-label">{item.label}</span>
              {isActive && <div className="active-indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
