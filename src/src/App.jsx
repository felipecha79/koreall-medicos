import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useTenant } from './hooks/useTenant'
import Login         from './pages/Login'
import Agenda        from './pages/Agenda'
import Pacientes     from './pages/Pacientes'
import Expediente    from './pages/Expediente'
import Cobros        from './pages/Cobros'
import Facturacion   from './pages/Facturacion'
import Recetas       from './pages/Recetas'
import PagoEnLinea   from './pages/PagoEnLinea'
import Reportes      from './pages/Reportes'
import Admin         from './pages/Admin'
import PortalPaciente from './pages/PortalPaciente'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading, role } = useTenant()
  if (loading) return <Spinner />
  if (!user)   return <Navigate to="/login" replace />
  // Si el usuario tiene rol 'paciente', redirigir al portal
  if (role === 'paciente') return <Navigate to="/portal-paciente" replace />
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
]

const NAV_BOTTOM = NAV_MAIN.slice(0, 4) // Solo primeros 4 en bottom nav móvil

function Sidebar({ tenant, isSuperAdmin, onClose }) {
  const navigate = useNavigate()
  return (
    <aside className="flex flex-col h-full bg-slate-900 text-white">
      <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">MediDesk</h1>
          <p className="text-xs text-slate-400 truncate max-w-[160px]">
            {tenant?.nombre ?? 'Cargando...'}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl ml-4">✕</button>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
               mt-2 pt-2 border-t border-slate-700
               ${isActive ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <span style={{ fontSize: 15 }}>⚙️</span>Super Admin
          </NavLink>
        )}
      </nav>
      <div className="px-3 py-3 border-t border-slate-700">
        <NavLink to="/portal-paciente"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400
                     hover:bg-slate-800 hover:text-white transition-colors mb-1">
          <span style={{ fontSize: 15 }}>👤</span>Vista paciente
        </NavLink>
        <button onClick={async () => { await signOut(auth); window.location.href='/login' }}
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
  const { tenant, isSuperAdmin } = useTenant()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const pageTitle = NAV_MAIN.find(n => location.pathname.startsWith(n.to))?.label ?? 'MediDesk'

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="hidden md:flex md:flex-col md:w-56 flex-shrink-0">
        <Sidebar tenant={tenant} isSuperAdmin={isSuperAdmin} />
      </div>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64 flex flex-col h-full shadow-xl">
            <Sidebar tenant={tenant} isSuperAdmin={isSuperAdmin} onClose={() => setDrawerOpen(false)} />
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
    ['/admin',          <Admin />],
  ]
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal-paciente" element={<PortalPaciente />} />
      <Route path="/" element={<PrivateRoute><Navigate to="/agenda" replace /></PrivateRoute>} />
      {ROUTES.map(([path, element]) => (
        <Route key={path} path={path} element={
          <PrivateRoute><AppLayout>{element}</AppLayout></PrivateRoute>
        } />
      ))}
      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  )
}
