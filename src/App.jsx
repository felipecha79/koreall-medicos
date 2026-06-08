import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase'
import { useTenant } from './hooks/useTenant'
import { puedeVer, MODULO_RUTA } from './services/permisos'
import Login              from './pages/Login'
import Agenda             from './pages/Agenda'
import Pacientes          from './pages/Pacientes'
import Expediente         from './pages/Expediente'
import Cobros             from './pages/Cobros'
import Facturacion        from './pages/Facturacion'
import Recetas            from './pages/Recetas'
import Reportes           from './pages/Reportes'
import Admin              from './pages/Admin'
import GestionUsuarios    from './pages/GestionUsuarios'
import MiCuenta           from './pages/MiCuenta'
import SitioWeb           from './pages/SitioWeb'
import PortalPaciente     from './pages/PortalPaciente'
import Landing            from './pages/Landing'
import SuscripcionVencida from './pages/SuscripcionVencida'
import Suscripciones      from './pages/Suscripciones'
import Encuesta           from './pages/Encuesta'
import RegistroPaciente   from './pages/RegistroPaciente'
import ImportarPacientes  from './pages/ImportarPacientes'
import Telemedicina       from './pages/Telemedicina'
import ValidarReceta      from './pages/ValidarReceta'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading, role, suscripcionActiva, tenant, isSuperAdmin } = useTenant()
  if (loading) return <Spinner />
  if (!user)   return <Navigate to="/login" replace />
  if (role === 'paciente') return <Navigate to="/portal-paciente" replace />
  // Bloquear si suscripción inactiva (excepto superAdmin)
  if (!suscripcionActiva && !isSuperAdmin) return <SuscripcionVencida tenant={tenant} />
  return children
}

// Todos los items de navegación posibles
const NAV_TODOS = [
  { to: '/agenda',       label: 'Agenda',          icon: '📅', modulo: 'agenda'       },
  { to: '/pacientes',    label: 'Pacientes',        icon: '👤', modulo: 'pacientes'    },
  { to: '/cobros',       label: 'Cobros y Pagos',   icon: '💳', modulo: 'cobros'       },
  { to: '/recetas',      label: 'Recetas',          icon: '💊', modulo: 'recetas'      },
  { to: '/facturacion',  label: 'Facturación',      icon: '🧾', modulo: 'facturacion'  },
  { to: '/reportes',     label: 'Reportes',         icon: '📊', modulo: 'reportes'     },
  { to: '/telemedicina', label: 'Telemedicina',     icon: '📹', modulo: 'telemedicina' },
  { to: '/mi-cuenta',    label: 'Mi cuenta',         icon: '👤', modulo: 'suscripcion'  },
  { to: '/sitio-web',    label: 'Mi sitio',         icon: '🌐', modulo: 'sitio'        },
  { to: '/encuesta',     label: 'Encuestas',        icon: '⭐', modulo: 'encuesta'     },
]

function navDeRol(rol, isSuperAdmin, tenant) {
  let items = (isSuperAdmin || rol === 'admin' || rol === 'superadmin')
    ? NAV_TODOS
    : NAV_TODOS.filter(n => puedeVer(rol ?? 'recepcion', n.modulo))

  // Punto 3: ocultar módulos según toggles del tenant
  if (tenant?.facturacionActiva === false) {
    items = items.filter(n => n.modulo !== 'facturacion')
  }
  return items
}

function Sidebar({ tenant, org, isSuperAdmin, suscripcionActiva, allTenants, allOrgs, orgTenants, switchTenant, switchOrg, onClose, role }) {
  const navItems = navDeRol(role, isSuperAdmin, tenant)

  // T-01: Monitor créditos IA
  const [iaStatus, setIaStatus] = useState(null)
  useEffect(() => {
    const ref = doc(db, 'configuracion', 'ia_status')
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setIaStatus(snap.data())
    }, () => {})
    return unsub
  }, [])
  const iaPct = iaStatus
    ? Math.round((iaStatus.creditosUsadosMes / (iaStatus.creditosLimiteMes || 500000)) * 100)
    : 0

  // Colores del tema del doctor — leídos de tenant.sitioWeb
  const colorPrimario = tenant?.sitioWeb?.colorPrimario ?? '#0D9488'  // Novaryk.Med Teal
  const colorFondo    = tenant?.sitioWeb?.colorFondo    ?? '#F4F9FB'
  // Sidebar: fondo derivado del colorPrimario en tono muy claro
  // Para SuperAdmin: gris azulado claro
  const sidebarBg    = isSuperAdmin ? '#F0F4F8' : colorFondo
  const sidebarBorde = isSuperAdmin ? '#D1DCE8' : (colorPrimario + '40') // 25% opacidad
  const textoColor   = isSuperAdmin ? '#1A2E42' : '#1a2e42'
  const textoSub     = isSuperAdmin ? '#64748B' : '#6B7280'
  const activoBg     = colorPrimario
  const hoverBg      = isSuperAdmin ? '#E2EAF4' : (colorPrimario + '18')

  return (
    <aside className="flex flex-col h-full" style={{ background: sidebarBg, borderRight: '1px solid ' + sidebarBorde }}>
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid ' + sidebarBorde }}>
        <div className="flex-1 min-w-0">
          {/* Logo Novaryk.Med */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg width="28" height="26" viewBox="0 0 56 52" fill="none" style={{flexShrink:0}}>
              <path d="M6 46 Q28 6 50 46" stroke={colorPrimario} strokeWidth="4.5" strokeLinecap="round"/>
              <path d="M16 46 Q28 18 40 46" stroke={colorPrimario} strokeWidth="2.8" strokeLinecap="round"/>
              <circle cx="28" cy="13" r="5.5" fill="#0D9488"/>
            </svg>
            <div>
              <h1 className="text-sm font-semibold" style={{ color: textoColor, letterSpacing:'-0.3px', lineHeight:1.1 }}>Novaryk</h1>
              <p style={{ color:'#0D9488', fontSize:9, fontWeight:600, letterSpacing:'2.5px', lineHeight:1 }}>MED</p>
            </div>
          </div>
          {isSuperAdmin && allOrgs?.length > 1 ? (
            <div className="mt-2 space-y-1.5">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{color: textoSub}}>Organización</p>
                <select value={org?.id ?? ''}
                  onChange={e => switchOrg(e.target.value)}
                  className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2"
                  style={{ background: '#fff', color: textoColor, borderColor: sidebarBorde }}>
                  {allOrgs.map(o => (
                    <option key={o.id} value={o.id}>{o.nombre}</option>
                  ))}
                </select>
              </div>
              {orgTenants?.length > 1 && (
                <div>
                  <p className="text-xs font-medium mb-0.5" style={{color: textoSub}}>Consultorio</p>
                  <select value={tenant?.id ?? ''}
                    onChange={e => switchTenant(e.target.value)}
                    className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2"
                    style={{ background: '#fff', color: textoColor, borderColor: colorPrimario + '60' }}>
                    {orgTenants.map(t => (
                      <option key={t.id} value={t.id}>└ {t.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : isSuperAdmin && allTenants?.length > 1 ? (
            <div className="mt-2">
              <p className="text-xs font-medium mb-0.5" style={{color: textoSub}}>Consultorio activo</p>
              <select value={tenant?.id ?? ''}
                onChange={e => switchTenant(e.target.value)}
                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2"
                style={{ background: '#fff', color: textoColor, borderColor: sidebarBorde }}>
                {allTenants.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs truncate font-medium" style={{color: textoColor}}>
                {tenant?.nombre ?? 'Cargando...'}
              </p>
              {!suscripcionActiva && !isSuperAdmin && (
                <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                  Inactivo
                </span>
              )}
            </div>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl ml-2">✕</button>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto min-h-0">
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} onClick={onClose}>
            {({ isActive }) => (
              <span
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background:  isActive ? activoBg : 'transparent',
                  color:       isActive ? '#ffffff' : textoColor,
                  boxShadow:   isActive ? '0 2px 8px ' + activoBg + '55' : 'none',
                }}>
                <span style={{ fontSize: 15 }}>{icon}</span>{label}
              </span>
            )}
          </NavLink>
        ))}
        {isSuperAdmin && (
          <>
            <div className="mt-1 pt-1" style={{ borderTop: '1px solid ' + sidebarBorde }} />
            <NavLink to="/admin" onClick={onClose}>
              {({ isActive }) => (
                <span
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: isActive ? '#7C3AED' : 'transparent',
                    color:      isActive ? '#ffffff' : textoSub,
                  }}>
                  <span style={{ fontSize: 15 }}>⚙️</span>Super Admin
                </span>
              )}
            </NavLink>
          </>
        )}
      </nav>

      {/* T-01: Banner créditos IA */}
      {iaPct >= 80 && (
        <div className="mx-2 mb-2 rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{
            background: iaPct >= 100 ? '#FEE2E2' : '#FEF3C7',
            border: `1px solid ${iaPct >= 100 ? '#FECACA' : '#FDE68A'}`,
            color: iaPct >= 100 ? '#991B1B' : '#92400E',
          }}>
          <span style={{flexShrink:0}}>{iaPct >= 100 ? '⚠️' : '🔋'}</span>
          <span>
            {iaPct >= 100
              ? <><strong>IA sin créditos.</strong> Contacta al admin.</>
              : <><strong>Créditos IA: {iaPct}%</strong> del límite mensual.</>
            }
          </span>
        </div>
      )}

      <div className="px-2 py-3 flex-shrink-0" style={{ borderTop: '1px solid ' + sidebarBorde }}>
        <NavLink to="/portal-paciente"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-1
             ${isActive ? 'bg-teal-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
          <span style={{ fontSize: 15 }}>👤</span>Vista paciente
        </NavLink>
        <button onClick={async () => { await signOut(auth); window.location.href = '/' }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                     text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
          <span style={{ fontSize: 15 }}>🚪</span>Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 flex z-40 md:hidden">
      {NAV_TODOS.slice(0, 4).map(({ to, label, icon }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs transition-colors
             ${isActive ? 'text-teal-400' : 'text-slate-400'}`}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span className="text-[10px] mt-0.5">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// BottomNav dinámico: muestra los módulos del rol actual (primeros 4)
function BottomNavDynamic() {
  const { role, isSuperAdmin, tenant } = useTenant()
  const navItems = navDeRol(role, isSuperAdmin, tenant).slice(0, 4)
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700
                    flex z-40 md:hidden safe-area-inset-bottom">
      {navItems.map(({ to, label, icon }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2.5 text-xs transition-colors
             ${isActive ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'}`}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span className="text-[9px] mt-0.5 leading-none">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function AppLayout({ children }) {
  const { tenant, tenantId, org, isSuperAdmin, suscripcionActiva, allTenants, allOrgs, orgTenants, switchTenant, switchOrg, role } = useTenant()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const pageTitle = NAV_TODOS.find(n => location.pathname.startsWith(n.to))?.label ?? 'Novaryk.Med'

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="hidden md:flex md:flex-col md:w-52 flex-shrink-0">
        <Sidebar tenant={tenant} org={org} isSuperAdmin={isSuperAdmin}
          suscripcionActiva={suscripcionActiva} role={role}
          allTenants={allTenants} allOrgs={allOrgs} orgTenants={orgTenants}
          switchTenant={switchTenant} switchOrg={switchOrg} />
      </div>
      {/* Drawer móvil con overlay y swipe-to-close */}
      <div className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200
                       ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        {/* Overlay oscuro */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)} />
        {/* Panel lateral */}
        <div className={`absolute left-0 top-0 h-full w-64 shadow-2xl
                         transition-transform duration-250 ease-out
                         ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar tenant={tenant} org={org} isSuperAdmin={isSuperAdmin}
            suscripcionActiva={suscripcionActiva} role={role}
            allTenants={allTenants} allOrgs={allOrgs} orgTenants={orgTenants}
            switchTenant={switchTenant} switchOrg={switchOrg}
            onClose={() => setDrawerOpen(false)} />
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center gap-3 bg-slate-900 text-white px-3 py-2.5 flex-shrink-0 shadow-lg">
          {/* Botón hamburguesa — más visible en móvil */}
          <button onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center w-10 h-10 rounded-xl
                       bg-slate-700 hover:bg-slate-600 active:bg-teal-700
                       transition-colors flex-shrink-0 gap-1.5">
            <span className="block w-5 h-0.5 bg-white rounded-full" />
            <span className="block w-5 h-0.5 bg-white rounded-full" />
            <span className="block w-3.5 h-0.5 bg-white rounded-full self-start ml-0.5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{pageTitle}</p>
            <p className="text-[10px] text-slate-400 truncate">{tenant?.nombre ?? ''}</p>
          </div>
          {/* Logo compacto */}
          <svg width="22" height="20" viewBox="0 0 56 52" fill="none" className="flex-shrink-0 opacity-70">
            <path d="M6 46 Q28 6 50 46" stroke="#0D9488" strokeWidth="4.5" strokeLinecap="round"/>
            <path d="M16 46 Q28 18 40 46" stroke="#0D9488" strokeWidth="2.8" strokeLinecap="round"/>
            <circle cx="28" cy="13" r="5.5" fill="#0D9488"/>
          </svg>
        </header>
        <main key={String(tenantId ?? 'default')} className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
      </div>
      <BottomNavDynamic />
    </div>
  )
}

export default function App() {
  const ROUTES = [
    ['/agenda',         <Agenda />],
    ['/pacientes',      <Pacientes />],
    ['/pacientes/:id',  <Expediente />],
    ['/importar',        <ImportarPacientes />],
    ['/cobros',         <Cobros />],
    ['/facturacion',    <Facturacion />],
    ['/recetas',        <Recetas />],
    ['/reportes',       <Reportes />],
    ['/usuarios',       <GestionUsuarios />],
    ['/mi-cuenta',      <MiCuenta />],
    ['/sitio-web',      <SitioWeb />],
    ['/encuesta',       <Encuesta />],
    ['/telemedicina',   <Telemedicina />],
    ['/admin',          <Admin />],
  ]
  return (
    <Routes>
      <Route path="/"                element={<Landing />} />
      <Route path="/login"           element={<Login />} />
      <Route path="/portal-paciente" element={<PortalPaciente />} />
      <Route path="/registro" element={<RegistroPaciente />} />
      <Route path="/api/validar-receta/:recetaId" element={<ValidarReceta />} />
      {ROUTES.map(([path, element]) => (
        <Route key={path} path={path} element={
          <PrivateRoute><AppLayout>{element}</AppLayout></PrivateRoute>
        } />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
