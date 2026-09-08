import React, { useState } from 'react';
import { HelpCircle, MessageCircle, Keyboard, BookOpen, ChevronDown, ChevronUp, FileText, Package, Users, UserCircle, Layers, BarChart2, DollarSign, Calendar, Upload } from 'lucide-react';

const Soporte = ({ kiosco, setCurrentScreen }) => {
  const [activeTab, setActiveTab] = useState('atajos');
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (index) => {
    if (openFaq === index) setOpenFaq(null);
    else setOpenFaq(index);
  };

  const whatsappNumber = "5492664805745"; // Reemplaza aquí con tu número real
  const whatsappMessage = encodeURIComponent("Hola! Necesito soporte con el sistema Simple ProX.");

  const atajos = [
    { key: "F2", desc: "Buscar producto por nombre o código (Va directo a la barra de búsqueda)" },
    { key: "F3", desc: "Abrir ventana para seleccionar o registrar Cliente" },
    { key: "F4", desc: "Agregar un ítem Extra rápido sin registrar producto" },
    { key: "F6", desc: "Aplicar Descuento o Recargo (Usa flechas Izq/Der para cambiar el tipo)" },
    { key: "F7", desc: "Abrir o cerrar la Consulta de Precio" },
    ...(kiosco?.businessConfig?.plan === 'Pro' ? [{ key: "F8", desc: "Abrir o cerrar el panel de Notificaciones (productos vencidos y deudas)" }] : []),
    { key: "F12", desc: "Mostrar u ocultar rápidamente los métodos de pago" },
    { key: "Flechas ⬅️➡️", desc: "Cambiar el método de pago (cuando están visibles las opciones)" },
    { key: "Esc", desc: "Cerrar cualquier ventana abierta o cancelar búsqueda" },
    { key: "Doble Enter", desc: "Cobrar rápidamente usando el método de pago seleccionado" }
  ];

  const faqs = [
    { q: "¿Cómo agrego dinero o retiro efectivo de la caja?", a: "En la pestaña 'Ventas', haz clic en el ícono de controles (engranaje) que está en el recuadro de 'Mi Caja'. Ahí podrás registrar ingresos y retiros de efectivo." },
    { q: "¿Qué pasa si me equivoco al cobrar?", a: "Actualmente las ventas no se pueden anular directamente desde el sistema para mantener la seguridad. Deberás ajustar el inventario manualmente y registrar un retiro de caja si hubo devolución de dinero." },
    { q: "¿Cómo funciona el 'Fiado'?", a: "Para usar 'Fiado' (solo en plan Pro), primero debes registrar un Cliente y seleccionarlo en la venta. Luego eliges 'Fiado' como método de pago. La deuda se sumará al cliente automáticamente." },
    { q: "¿Cómo cierro mi turno?", a: "En 'Ventas', ve a gestionar caja (ícono de controles) y selecciona 'Cerrar Turno y Caja'. Te pedirá que cuentes el efectivo real (Arqueo) y el sistema guardará el reporte para el administrador." },
    { q: "¿Cómo busco un producto rápidamente al vender?", a: "Puedes usar un lector de código de barras, o presionar la tecla F2 y escribir parte del nombre o código del producto. Presionando 'Enter' lo agregarás al carrito." },
    { q: "¿Es necesario cerrar la caja todos los días?", a: "Es muy recomendable para llevar un control exacto de tus ingresos y posibles diferencias o faltantes. El sistema guardará un reporte por cada turno que se cierra." },
    { q: "¿Qué hago si llega mercadería nueva (Compras)?", a: "Ve a la pestaña 'Compras' y carga un nuevo remito. Al ingresar los productos, se sumarán al stock automáticamente y podrás actualizar sus precios de costo si cambiaron." },
    { q: "¿Puedo tener varios usuarios o cajeros?", a: "Sí, en la pestaña 'Usuarios' puedes crear cuentas para cada empleado con su propio PIN. Así sabrás quién realizó cada venta y quién abrió o cerró la caja." },
    { q: "¿Qué pasa si me quedo sin internet?", a: "Simple ProX está diseñado para funcionar de manera local. Si pierdes la conexión a internet de forma temporal, podrás seguir vendiendo y usando el sistema sin ningún problema." },
    { q: "¿Cómo hago para ver cuánto gané en el mes?", a: "En la pestaña 'Reportes' podrás filtrar por fechas y ver tus ventas totales, los métodos de pago utilizados y la ganancia neta estimada (Solo en Plan Pro)." }
  ];

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
        <div style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '16px', borderRadius: '50%' }}>
          <HelpCircle size={40} />
        </div>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px' }}>Centro de Ayuda y Soporte</h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '15px' }}>
            Aprende a usar el sistema al máximo y contacta con soporte si lo necesitas.
          </p>
        </div>
      </div>

      {/* Promoción de Plan Pro para incentivar a usuarios con plan Básico */}
      {kiosco?.businessConfig?.plan === 'Básico' && (
        <div className="card" style={{ 
          background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #4c1d95 100%)', 
          color: '#ffffff', 
          padding: '28px', 
          borderRadius: '16px', 
          marginBottom: '28px',
          boxShadow: '0 10px 25px -5px rgba(76, 29, 149, 0.4), 0 8px 10px -6px rgba(76, 29, 149, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Círculo decorativo difuminado */}
          <div style={{
            position: 'absolute',
            right: '-40px',
            top: '-40px',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, rgba(139, 92, 246, 0) 70%)',
            pointerEvents: 'none',
            filter: 'blur(10px)'
          }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ 
                background: 'linear-gradient(90deg, #f59f00 0%, #d97706 100%)', 
                color: '#ffffff',
                padding: '4px 10px', 
                borderRadius: '20px', 
                fontSize: '11px', 
                fontWeight: 800, 
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
              }}>
                Recomendado
              </span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                👑 Potencia tu Comercio con el Plan Pro
              </h2>
            </div>
            
            <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.9)', fontSize: '14.5px', lineHeight: '1.6', maxWidth: '850px' }}>
              Desbloquea herramientas de gestión avanzadas diseñadas para maximizar tus ventas, agilizar tu facturación y automatizar tu negocio al 100%.
            </p>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
              gap: '16px',
              marginTop: '8px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '20px'
            }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Hasta 2.500 Productos</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Más capacidad de inventario (el básico incluye 1000).</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCircle size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Venta al Fiado (Cuenta Corriente)</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Gestiona saldos, deudas y cobros parciales a clientes.</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Combos y Packs de Productos</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Crea promociones con actualización automática de stock.</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Hasta 5 Usuarios Administrativos</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Registra a tus cajeros (el plan básico permite 2).</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart2 size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Reportes por Métodos de Pago</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Analiza en detalle las ventas por tipo de cobro.</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DollarSign size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Análisis de Rentabilidad Neta</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Calcula exactamente cuánto dinero ganaste en un rango de fechas.</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '8px', borderRadius: '8px', color: '#f59f00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>Alerta de Vencimientos</strong>
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>Anticípate a la caducidad de tu mercadería.</span>
                </div>
              </div>

            </div>
            
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setCurrentScreen && setCurrentScreen('configuracion')}
                style={{ 
                  background: 'linear-gradient(90deg, #f59f00 0%, #d97706 100%)', 
                  color: '#ffffff', 
                  border: 'none', 
                  padding: '12px 24px', 
                  borderRadius: '8px', 
                  fontWeight: 700, 
                  fontSize: '14px', 
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 14px rgba(217, 119, 6, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(217, 119, 6, 0.3)';
                }}
              >
                Activar Plan Pro Ahora 🚀
              </button>
              <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
                Si ya posees una clave de activación, ve a <strong>Configuración</strong> para ingresarla.
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '24px' }}>
        {/* Sidebar Nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('atajos')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: activeTab === 'atajos' ? 'var(--color-primary-light)' : 'transparent', color: activeTab === 'atajos' ? 'var(--color-primary)' : 'var(--color-text)', border: 'none', textAlign: 'left', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <Keyboard size={20} /> Atajos de Teclado
          </button>
          <button
            onClick={() => setActiveTab('guia')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: activeTab === 'guia' ? 'var(--color-primary-light)' : 'transparent', color: activeTab === 'guia' ? 'var(--color-primary)' : 'var(--color-text)', border: 'none', textAlign: 'left', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <BookOpen size={20} /> Guía de Uso Rápido
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: activeTab === 'faq' ? 'var(--color-primary-light)' : 'transparent', color: activeTab === 'faq' ? 'var(--color-primary)' : 'var(--color-text)', border: 'none', textAlign: 'left', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <FileText size={20} /> Preguntas Frecuentes
          </button>
          <button
            onClick={() => setActiveTab('contacto')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: activeTab === 'contacto' ? '#e8f5e9' : 'transparent', color: activeTab === 'contacto' ? '#2e7d32' : 'var(--color-text)', border: 'none', textAlign: 'left', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <MessageCircle size={20} /> Contactar a Soporte
          </button>
        </div>

        {/* Content Area */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '32px', borderRadius: '16px', border: '1px solid var(--color-border)', minHeight: '500px' }}>

          {activeTab === 'atajos' && (
            <div className="fade-in">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 0, marginBottom: '24px', color: 'var(--color-text)' }}>
                <Keyboard size={24} color="var(--color-primary)" /> Atajos de Teclado
              </h2>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>
                Trabaja más rápido sin usar el mouse. Aprende estos accesos rápidos para dominar el Punto de Venta.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {atajos.map((atajo, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderBottom: '1px solid var(--color-border)' }}>
                    <kbd style={{ backgroundColor: '#f1f3f4', border: '1px solid #dadce0', borderBottom: '2px solid #dadce0', borderRadius: '6px', padding: '6px 12px', fontSize: '14px', fontWeight: 700, minWidth: '80px', textAlign: 'center', color: '#3c4043' }}>
                      {atajo.key}
                    </kbd>
                    <span style={{ fontSize: '15px', color: 'var(--color-text)' }}>{atajo.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'guia' && (
            <div className="fade-in">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 0, marginBottom: '24px', color: 'var(--color-text)' }}>
                <BookOpen size={24} color="var(--color-primary)" /> Guía de Uso Rápido
              </h2>

              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', color: 'var(--color-primary)', marginBottom: '12px' }}>1. ¿Cómo realizar una venta básica?</h3>
                <ul style={{ paddingLeft: '20px', color: 'var(--color-text)', lineHeight: '1.6' }}>
                  <li>Ve a la pestaña <b>Ventas</b>.</li>
                  <li>Usa el lector de código de barras o presiona <kbd>F2</kbd> y escribe el nombre del producto.</li>
                  <li>Presiona <kbd>Enter</kbd> para agregarlo al carrito.</li>
                  <li>Asegúrate de que el método de pago esté correcto (por defecto Efectivo).</li>
                  <li>Presiona <kbd>Enter</kbd> dos veces rápidamente para cobrar y finalizar.</li>
                </ul>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', color: 'var(--color-primary)', marginBottom: '12px' }}>2. ¿Cómo registrar el stock y precios?</h3>
                <ul style={{ paddingLeft: '20px', color: 'var(--color-text)', lineHeight: '1.6' }}>
                  <li>Ve a la pestaña <b>Productos</b>.</li>
                  <li>Haz clic en "Nuevo Producto".</li>
                  <li>Completa el nombre, precio de venta, categoría y stock inicial. Si tienes lector, escanea el código en el campo "Cód. Barras".</li>
                  <li>Para actualizar muchos precios a la vez, usa la herramienta "Aumento Global" (Solo Plan Pro).</li>
                </ul>
              </div>

              <div>
                <h3 style={{ fontSize: '18px', color: 'var(--color-primary)', marginBottom: '12px' }}>3. Empezar y terminar el día (Caja)</h3>
                <ul style={{ paddingLeft: '20px', color: 'var(--color-text)', lineHeight: '1.6' }}>
                  <li>Al iniciar el día, el sistema te pedirá tu PIN para abrir la caja e ingresar el monto inicial.</li>
                  <li>Durante el día todas las ventas se sumarán a esa caja.</li>
                  <li>Al terminar, ve al ícono de controles en "Mi Caja" y selecciona <b>Cerrar Turno</b>. Ingresa cuánto dinero físico hay realmente para generar el reporte de diferencias.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="fade-in">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 0, marginBottom: '24px', color: 'var(--color-text)' }}>
                <FileText size={24} color="var(--color-primary)" /> Preguntas Frecuentes
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {faqs.map((faq, i) => (
                  <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleFaq(i)}
                      style={{ padding: '16px 20px', backgroundColor: openFaq === i ? 'var(--color-primary-light)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, color: openFaq === i ? 'var(--color-primary)' : 'var(--color-text)' }}
                    >
                      {faq.q}
                      {openFaq === i ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                    {openFaq === i && (
                      <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'contacto' && (
            <div className="fade-in" style={{ textAlign: 'center', paddingTop: '40px' }}>
              <div style={{ display: 'inline-flex', padding: '24px', backgroundColor: '#e8f5e9', borderRadius: '50%', marginBottom: '24px' }}>
                <MessageCircle size={64} color="#2e7d32" />
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '16px', color: '#2e7d32' }}>Soporte Técnico Directo</h2>
              <p style={{ color: 'var(--color-text-muted)', maxWidth: '500px', margin: '0 auto 32px auto', lineHeight: '1.6' }}>
                ¿Tienes algún problema o necesitas ayuda con el sistema? Escríbenos y te responderemos a la brevedad.
              </p>
              
              {kiosco?.businessConfig?.plan === 'Básico' ? (
                <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '24px', borderRadius: '12px', border: '1px solid #ffeeba', maxWidth: '550px', margin: '0 auto', textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <MessageCircle size={20} /> Soporte por WhatsApp
                  </h3>
                  <p style={{ margin: 0, fontSize: '14.5px', lineHeight: '1.6' }}>
                    ¡Hola! Queremos brindarte la mejor atención. Actualmente, la asistencia personalizada y prioritaria a través de WhatsApp es un beneficio exclusivo diseñado para los usuarios de nuestro <strong>Plan Pro</strong>.
                    <br /><br />
                    Te invitamos a actualizar tu plan para acceder a este canal directo. Mientras tanto, puedes revisar nuestra sección de <strong>"Preguntas Frecuentes"</strong> y <strong>"Guía de Uso"</strong> donde encontrarás la respuesta a casi todas tus dudas sobre el uso del sistema.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
                    <a
                      href={`https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodeURIComponent("Hola! Quisiera solicitar la versión Pro de Simple ProX.")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{ backgroundColor: '#25D366', color: 'white', border: 'none', textDecoration: 'none', fontWeight: 700, padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      <MessageCircle size={18} /> Solicitar Plan Pro
                    </a>
                    <p style={{ margin: 0, fontSize: '13px', color: '#856404', fontWeight: 600 }}>
                      O escríbenos al: +{whatsappNumber}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <a
                    href={`https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${whatsappMessage}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', backgroundColor: '#25D366', color: 'white', padding: '16px 32px', borderRadius: '12px', textDecoration: 'none', fontWeight: 700, fontSize: '18px', boxShadow: '0 8px 16px rgba(37, 211, 102, 0.2)' }}
                  >
                    <MessageCircle size={24} /> Contactar por WhatsApp
                  </a>
                  <p style={{ marginTop: '24px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    Número de contacto: +{whatsappNumber}
                  </p>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default React.memo(Soporte);
