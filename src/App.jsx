import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useTenant } from './hooks/useTenant'
import Login              from './pages/Login'
import Agenda             from './pages/Agenda'
import Pacientes          from './pages/Pacientes'
import Expediente         from './pages/Expediente'
import Cobros             from './pages/Cobros'
import Facturacion        from './pages/Facturacion'
import Recetas            from './pages/Recetas'
import PagoEnLinea        from './pages/PagoEnLinea'
import Reportes           from './pages/Reportes'
import Admin              from './pages/Admin'
import GestionUsuarios    from './pages/GestionUsuarios'
import SitioWeb           from './pages/SitioWeb'
import PortalPaciente     from './pages/PortalPaciente'
import Landing            from './pages/Landing'
import SuscripcionVencida from './pages/SuscripcionVencida'
import Encuesta           from './pages/Encuesta'
import RegistroPaciente   from './pages/RegistroPaciente'

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

const NAV_MAIN = [
  { to: '/agenda',      label: 'Agenda',      icon: '📅' },
  { to: '/pacientes',   label: 'Pacientes',   icon: '👤' },
  { to: '/cobros',      label: 'Cobros',      icon: '💳' },
  { to: '/pagos',       label: 'Pagos',       icon: '💰' },
  { to: '/facturacion', label: 'Facturación', icon: '🧾' },
  { to: '/recetas',     label: 'Recetas',     icon: '📋' },
  { to: '/reportes',    label: 'Reportes',    icon: '📊' },
  { to: '/usuarios',    label: 'Usuarios',    icon: '👥' },
  { to: '/sitio-web',   label: 'Mi sitio',    icon: '🌐' },
  { to: '/encuesta',    label: 'Encuestas',   icon: '⭐' },
]
const NAV_BOTTOM = NAV_MAIN.slice(0, 4)

function Sidebar({ tenant, org, isSuperAdmin, suscripcionActiva, allTenants, allOrgs, orgTenants, switchTenant, switchOrg, onClose }) {
  return (
    <aside className="flex flex-col h-full bg-slate-900 text-white">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold">MediDesk</h1>
          {isSuperAdmin && allOrgs?.length > 1 ? (
            <div className="mt-1 space-y-1">
              <select value={org?.id ?? ''}
                onChange={e => switchOrg(e.target.value)}
                className="w-full text-xs bg-slate-700 text-slate-200 border border-slate-600
                           rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400">
                {allOrgs.map(o => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
              {orgTenants?.length > 1 && (
                <select value={tenant?.id ?? ''}
                  onChange={e => switchTenant(e.target.value)}
                  className="w-full text-xs bg-slate-600 text-slate-300 border border-slate-500
                             rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400">
                  {orgTenants.map(t => (
                    <option key={t.id} value={t.id}>└ {t.nombre}</option>
                  ))}
                </select>
              )}
            </div>
          ) : isSuperAdmin && allTenants?.length > 1 ? (
            <select value={tenant?.id ?? ''}
              onChange={e => switchTenant(e.target.value)}
              className="w-full mt-1 text-xs bg-slate-700 text-slate-200 border border-slate-600
                         rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400">
              {allTenants.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-slate-400 truncate">{tenant?.nombre ?? 'Cargando...'}</p>
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

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_MAIN.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
               ${isActive ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <span style={{ fontSize: 15 }}>{icon}</span>{label}
          </NavLink>
        ))}
        {isSuperAdmin && (
          <NavLink to="/admin" onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
               mt-1 pt-1 border-t border-slate-700
               ${isActive ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <span style={{ fontSize: 15 }}>⚙️</span>Super Admin
          </NavLink>
        )}
      </nav>

      <div className="px-2 py-3 border-t border-slate-700">
        <NavLink to="/portal-paciente"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400
                     hover:bg-slate-800 hover:text-white transition-colors mb-1">
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
      {NAV_BOTTOM.map(({ to, label, icon }) => (
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

function AppLayout({ children }) {
  const { tenant, org, isSuperAdmin, suscripcionActiva, allTenants, allOrgs, orgTenants, switchTenant, switchOrg } = useTenant()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const pageTitle = NAV_MAIN.find(n => location.pathname.startsWith(n.to))?.label ?? 'MediDesk'

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="hidden md:flex md:flex-col md:w-52 flex-shrink-0">
        <Sidebar tenant={tenant} org={org} isSuperAdmin={isSuperAdmin}
          suscripcionActiva={suscripcionActiva}
          allTenants={allTenants} allOrgs={allOrgs} orgTenants={orgTenants}
          switchTenant={switchTenant} switchOrg={switchOrg} />
      </div>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-60 flex flex-col h-full shadow-xl">
            <Sidebar tenant={tenant} org={org} isSuperAdmin={isSuperAdmin}
              suscripcionActiva={suscripcionActiva}
              allTenants={allTenants} allOrgs={allOrgs} orgTenants={orgTenants}
              switchTenant={switchTenant} switchOrg={switchOrg}
              onClose={() => setDrawerOpen(false)} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} />
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between bg-slate-900 text-white px-4 py-3 flex-shrink-0">
          <button onClick={() => setDrawerOpen(true)} className="text-slate-300 text-2xl">☰</button>
          <span className="text-sm font-semibold">{pageTitle}</span>
          <span className="text-xs text-slate-400 truncate max-w-[100px]">{tenant?.nombre ?? ''}</span>
        </header>
        <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
      </div>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const ROUTES = [
    ['/agenda',         <Agenda />],
    ['/pacientes',      <Pacientes />],
    ['/pacientes/:id',  <Expediente />],
    ['/cobros',         <Cobros />],
    ['/pagos',          <PagoEnLinea />],
    ['/facturacion',    <Facturacion />],
    ['/recetas',        <Recetas />],
    ['/reportes',       <Reportes />],
    ['/usuarios',       <GestionUsuarios />],
    ['/sitio-web',      <SitioWeb />],
    ['/encuesta',       <Encuesta />],
    ['/admin',          <Admin />],
  ]
  return (
    <Routes>
      <Route path="/"                element={<Landing />} />
      <Route path="/login"           element={<Login />} />
      <Route path="/portal-paciente" element={<PortalPaciente />} />
      <Route path="/registro" element={<RegistroPaciente />} />
      {ROUTES.map(([path, element]) => (
        <Route key={path} path={path} element={
          <PrivateRoute><AppLayout>{element}</AppLayout></PrivateRoute>
        } />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
