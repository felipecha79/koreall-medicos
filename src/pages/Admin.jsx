import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, Timestamp, getDocs, deleteDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const TABS_ADMIN = [
  'Consultorios', 'Usuarios', 'Configuración', 'Suscripciones', 'Soporte', 'Sistema'
]

const FORM_TENANT_INICIAL = {
  nombre: '', nombreDoctor: '', especialidad: '', email: '',
  telefono: '', rfc: '', cedula: '', direccion: '',
  plan: 'pro', permitirTraslape: true, activo: true,
}

const ROLES_LABEL = {
  admin:      { label: 'Admin',        color: 'bg-blue-100 text-blue-700 border-blue-200' },
  doctor:     { label: 'Doctor',       color: 'bg-teal-100 text-teal-700 border-teal-200' },
  recepcion:  { label: 'Recepción',    color: 'bg-green-100 text-green-700 border-green-200' },
  paciente:   { label: 'Paciente',     color: 'bg-purple-100 text-purple-700 border-purple-200' },
  superAdmin: { label: 'Super Admin',  color: 'bg-red-100 text-red-700 border-red-200' },
}

export default function Admin() {
  const { isSuperAdmin, user } = useTenant()
  const [tab, setTab] = useState('Consultorios')

  // Estado global
  const [tenants,  setTenants]  = useState([])
  const [modalTenant, setModalTenant] = useState(null) // null | 'nuevo' | tenant
  const [formTenant,  setFormTenant]  = useState(FORM_TENANT_INICIAL)
  const [saving, setSaving] = useState(false)

  // Usuarios de un tenant seleccionado
  const [tenantSeleccionado, setTenantSeleccionado] = useState(null)
  const [usuariosTenant, setUsuariosTenant] = useState([])

  // Config global
  const [config, setConfig] = useState({
    mantenimiento: false,
    versionApp: '1.0.0',
    maxPacientesPorTenant: 500,
    maxDocsMBPorPaciente: 50,
    avisoGlobal: '',
  })

  useEffect(() => {
    if (!isSuperAdmin) return
    const q = query(collection(db, 'tenants'), orderBy('nombre'))
    return onSnapshot(q, snap =>
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [isSuperAdmin])

  // Cargar usuarios cuando se selecciona un tenant
  useEffect(() => {
    if (!tenantSeleccionado) return
    const q = query(collection(db, `tenants/${tenantSeleccionado}/usuarios`))
    return onSnapshot(q, snap =>
      setUsuariosTenant(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantSeleccionado])

  if (!isSuperAdmin) return (
    <div className="p-6 text-center text-gray-400 pt-20">
      <p className="text-5xl mb-3">🔒</p>
      <p className="text-lg font-medium text-gray-600">Acceso restringido</p>
      <p className="text-sm mt-1">Solo el Super Admin puede ver esta sección.</p>
    </div>
  )

  // ── Métricas globales ─────────────────────────────────
  const totalActivos  = tenants.filter(t => t.activo).length
  const totalPro      = tenants.filter(t => t.plan === 'pro').length
  const totalBasico   = tenants.filter(t => t.plan === 'basico').length
  const mrr           = totalPro * 1200 + totalBasico * 800

  // ── Guardar tenant ────────────────────────────────────
  const guardarTenant = async () => {
    if (!formTenant.nombre || !formTenant.email) {
      toast.error('Nombre y email son obligatorios'); return
    }
    setSaving(true)
    try {
      if (modalTenant === 'nuevo') {
        await addDoc(collection(db, 'tenants'), {
          ...formTenant, creadoEn: Timestamp.now(),
          horarios: {
            lun: { inicio:'09:00', fin:'19:00' },
            mar: { inicio:'09:00', fin:'19:00' },
            mie: { inicio:'09:00', fin:'19:00' },
            jue: { inicio:'09:00', fin:'19:00' },
            vie: { inicio:'09:00', fin:'19:00' },
          }
        })
        toast.success('Consultorio creado ✓')
      } else {
        await updateDoc(doc(db, `tenants/${modalTenant.id}`), formTenant)
        toast.success('Consultorio actualizado ✓')
      }
      setModalTenant(null)
      setFormTenant(FORM_TENANT_INICIAL)
    } catch(e) {
      console.error(e); toast.error('Error al guardar')
    } finally { setSaving(false) }
  }

  const toggleActivo = async (tenant) => {
    await updateDoc(doc(db, `tenants/${tenant.id}`), { activo: !tenant.activo })
    toast.success(tenant.activo ? 'Consultorio desactivado' : 'Consultorio activado')
  }

  const toggleTraslape = async (tenant) => {
    await updateDoc(doc(db, `tenants/${tenant.id}`), {
      permitirTraslape: !(tenant.permitirTraslape ?? true)
    })
    toast.success('Configuración de traslapes actualizada')
  }

  // ── Abrior modal edición ──────────────────────────────
  const abrirEditar = (tenant) => {
    setFormTenant({
      nombre:          tenant.nombre ?? '',
      nombreDoctor:    tenant.nombreDoctor ?? '',
      especialidad:    tenant.especialidad ?? '',
      email:           tenant.email ?? '',
      telefono:        tenant.telefono ?? '',
      rfc:             tenant.rfc ?? '',
      cedula:          tenant.cedula ?? '',
      direccion:       tenant.direccion ?? '',
      plan:            tenant.plan ?? 'pro',
      permitirTraslape: tenant.permitirTraslape ?? true,
      activo:          tenant.activo ?? true,
    })
    setModalTenant(tenant)
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="bg-slate-800 text-white px-6 py-4 flex-shrink-0">
        <h2 className="text-lg font-bold">Panel de Administración</h2>
        <p className="text-xs text-slate-400">Super Admin · {user?.email}</p>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-900 flex-shrink-0">
        {[
          { label: 'Consultorios activos', value: totalActivos,  color: 'text-teal-400' },
          { label: 'Plan Pro',             value: totalPro,      color: 'text-blue-400' },
          { label: 'Plan Básico',          value: totalBasico,   color: 'text-gray-400' },
          { label: 'MRR estimado',         value: `$${mrr.toLocaleString('es-MX')}`, color: 'text-green-400' },
          { label: 'Total consultorios',   value: tenants.length, color: 'text-purple-400' },
        ].map((kpi, i) => (
          <div key={i} className="bg-slate-800 rounded-xl p-3">
            <p className="text-xs text-slate-400">{kpi.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 bg-white flex-shrink-0 overflow-x-auto">
        {TABS_ADMIN.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${tab === t
                ? 'border-teal-500 text-teal-600 bg-teal-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto p-4 md:p-6 bg-gray-50">

        {/* ── Tab: Consultorios ─────────────────────────── */}
        {tab === 'Consultorios' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">
                Todos los consultorios ({tenants.length})
              </h3>
              <button onClick={() => { setFormTenant(FORM_TENANT_INICIAL); setModalTenant('nuevo') }}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                           rounded-lg hover:bg-teal-700 transition-colors">
                + Nuevo consultorio
              </button>
            </div>

            <div className="space-y-3">
              {tenants.map(t => (
                <div key={t.id}
                  className={`bg-white rounded-xl border p-4 transition-all
                    ${t.activo ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-gray-800">{t.nombre}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                          ${t.plan === 'pro'
                            ? 'bg-blue-100 text-blue-700 border-blue-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {t.plan}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border
                          ${t.activo
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-red-100 text-red-600 border-red-200'}`}>
                          {t.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2">
                        <p className="text-xs text-gray-500">👨‍⚕️ {t.nombreDoctor}</p>
                        <p className="text-xs text-gray-500">🏥 {t.especialidad}</p>
                        <p className="text-xs text-gray-500">📱 {t.telefono}</p>
                        <p className="text-xs text-gray-500 font-mono">RFC: {t.rfc}</p>
                        <p className="text-xs text-gray-500">✉️ {t.email}</p>
                        <p className="text-xs text-gray-500">🏠 {t.direccion}</p>
                        <p className="text-xs text-gray-500">🪪 Cédula: {t.cedula}</p>
                        <p className="text-xs text-gray-500">
                          🔀 Traslapes: {t.permitirTraslape !== false ? 'Permitidos' : 'Bloqueados'}
                        </p>
                      </div>

                      <p className="text-xs text-gray-300 mt-1 font-mono">ID: {t.id}</p>
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => abrirEditar(t)}
                        className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg
                                   hover:bg-blue-100 transition-colors border border-blue-200">
                        ✏️ Editar
                      </button>
                      <button onClick={() => toggleTraslape(t)}
                        className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg
                                   hover:bg-gray-100 transition-colors border border-gray-200">
                        🔀 Traslapes
                      </button>
                      <button onClick={() => toggleActivo(t)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors border
                          ${t.activo
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`}>
                        {t.activo ? '⏸ Desactivar' : '▶ Activar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Usuarios ─────────────────────────────── */}
        {tab === 'Usuarios' && (
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Gestión de usuarios por consultorio</h3>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Selecciona un consultorio</label>
              <select value={tenantSeleccionado ?? ''}
                onChange={e => setTenantSeleccionado(e.target.value || null)}
                className="w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">-- Selecciona consultorio --</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.id})</option>
                ))}
              </select>
            </div>

            {tenantSeleccionado && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    Usuarios de: {tenants.find(t=>t.id===tenantSeleccionado)?.nombre}
                  </p>
                </div>

                <div className="p-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-xs font-medium text-amber-800">
                      ⚠️ Para crear usuarios usa los scripts en la carpeta /scripts
                    </p>
                    <p className="text-xs text-amber-700 mt-1 font-mono">
                      node scripts/set-tenant-user.cjs email@doctor.com {tenantSeleccionado} admin<br/>
                      node scripts/set-paciente.cjs email@paciente.com {tenantSeleccionado}
                    </p>
                  </div>

                  {usuariosTenant.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      Sin usuarios registrados en Firestore para este consultorio
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Email','Nombre','Rol','Acciones'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {usuariosTenant.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-600">{u.email}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{u.nombre}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded border
                                ${ROLES_LABEL[u.rol]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                                {ROLES_LABEL[u.rol]?.label ?? u.rol}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                className="text-xs text-red-400 hover:text-red-600">
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Configuración ────────────────────────── */}
        {tab === 'Configuración' && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-semibold text-gray-800">Configuración global del sistema</h3>

            {/* Config por consultorio */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">
                Configuración por consultorio
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Consultorio','Traslapes','Plan','Activo'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenants.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{t.nombre}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => toggleTraslape(t)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full
                                        transition-colors focus:outline-none
                                        ${t.permitirTraslape !== false ? 'bg-teal-500' : 'bg-gray-300'}`}>
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white
                                              transition-transform
                                              ${t.permitirTraslape !== false ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <select value={t.plan}
                            onChange={async e => {
                              await updateDoc(doc(db, `tenants/${t.id}`), { plan: e.target.value })
                              toast.success('Plan actualizado')
                            }}
                            className="border border-gray-200 rounded px-2 py-1 text-xs
                                       focus:outline-none focus:ring-1 focus:ring-teal-400">
                            <option value="basico">Básico $800</option>
                            <option value="pro">Pro $1,200</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => toggleActivo(t)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full
                                        transition-colors ${t.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white
                                              transition-transform
                                              ${t.activo ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Aviso global */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Aviso global para todos los consultorios
              </h4>
              <textarea
                value={config.avisoGlobal}
                onChange={e => setConfig(c => ({ ...c, avisoGlobal: e.target.value }))}
                rows={3}
                placeholder="Escribe un aviso que aparecerá en todos los sistemas..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none mb-3" />
              <button
                onClick={() => toast.success('Aviso guardado (pendiente: guardar en Firestore _admin/config)')}
                className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700">
                Publicar aviso
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Suscripciones ────────────────────────── */}
        {tab === 'Suscripciones' && (
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Estado de suscripciones</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">MRR por plan</h4>
                <div className="space-y-3">
                  {[
                    { plan: 'Pro', count: totalPro, precio: 1200, color: 'bg-blue-500' },
                    { plan: 'Básico', count: totalBasico, precio: 800, color: 'bg-gray-400' },
                  ].map(item => (
                    <div key={item.plan}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{item.plan} ({item.count} consultorios)</span>
                        <span className="font-semibold">${(item.count * item.precio).toLocaleString('es-MX')}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`h-2 rounded-full ${item.color}`}
                          style={{ width: `${tenants.length > 0 ? item.count/tenants.length*100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-gray-200 flex justify-between font-bold">
                    <span>MRR Total</span>
                    <span className="text-green-600">${mrr.toLocaleString('es-MX')} MXN</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Proyección anual</h4>
                {[
                  ['MRR actual', `$${mrr.toLocaleString('es-MX')}`],
                  ['ARR estimado', `$${(mrr*12).toLocaleString('es-MX')}`],
                  ['Con 10 consultorios Pro', `$${(10*1200).toLocaleString('es-MX')}/mes`],
                  ['Con 20 consultorios Pro', `$${(20*1200).toLocaleString('es-MX')}/mes`],
                  ['Con 50 consultorios Pro', `$${(50*1200).toLocaleString('es-MX')}/mes`],
                ].map(([label, val], i) => (
                  <div key={i} className={`flex justify-between py-2 text-sm
                    ${i < 2 ? 'border-b border-gray-100 font-semibold' : 'text-gray-500'}`}>
                    <span>{label}</span>
                    <span className={i < 2 ? 'text-teal-600' : ''}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla de consultorios con plan */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Consultorio','Doctor','Plan','MRR','Estado'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{t.nombre}</td>
                      <td className="px-4 py-3 text-gray-600">{t.nombreDoctor}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium
                          ${t.plan === 'pro'
                            ? 'bg-blue-100 text-blue-700 border-blue-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {t.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-teal-600">
                        ${(t.plan === 'pro' ? 1200 : 800).toLocaleString('es-MX')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded border
                          ${t.activo
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-red-100 text-red-600 border-red-200'}`}>
                          {t.activo ? 'Al corriente' : 'Suspendido'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Soporte ──────────────────────────────── */}
        {tab === 'Soporte' && (
          <div className="max-w-2xl">
            <h3 className="font-semibold text-gray-800 mb-4">Herramientas de soporte</h3>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Acceso rápido a consultorio
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  Selecciona un consultorio para ver su información de contacto y configuración.
                </p>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-teal-400 mb-3"
                  onChange={e => {
                    const t = tenants.find(x => x.id === e.target.value)
                    if (t) setTenantSeleccionado(t.id)
                  }}>
                  <option value="">-- Selecciona consultorio --</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>

                {tenantSeleccionado && (() => {
                  const t = tenants.find(x => x.id === tenantSeleccionado)
                  if (!t) return null
                  return (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Nombre</span><span className="font-medium">{t.nombre}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Doctor</span><span>{t.nombreDoctor}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-teal-600">{t.email}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Teléfono</span><span>{t.telefono}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Plan</span><span>{t.plan}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">ID tenant</span><span className="font-mono text-xs">{t.id}</span></div>
                    </div>
                  )
                })()}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Scripts de administración
                </h4>
                <div className="space-y-2">
                  {[
                    ['Crear usuario admin',     'node scripts/set-tenant-user.cjs email@doc.com TENANT_ID admin'],
                    ['Crear usuario doctor',    'node scripts/set-tenant-user.cjs email@doc.com TENANT_ID doctor'],
                    ['Crear usuario recepción', 'node scripts/set-tenant-user.cjs email@rec.com TENANT_ID recepcion'],
                    ['Crear acceso paciente',   'node scripts/set-paciente.cjs email@pac.com TENANT_ID'],
                    ['Dar acceso superAdmin',   'node scripts/set-admin.cjs email@juan.com'],
                  ].map(([label, cmd]) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
                      <code className="text-xs text-teal-700 bg-teal-50 px-2 py-1 rounded block break-all">
                        {cmd}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Sistema ──────────────────────────────── */}
        {tab === 'Sistema' && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-semibold text-gray-800">Información del sistema</h3>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Stack tecnológico</h4>
              {[
                ['Frontend', 'React 18 + Vite + Tailwind CSS', 'text-blue-600'],
                ['Base de datos', 'Firebase Firestore (NoSQL)', 'text-orange-500'],
                ['Autenticación', 'Firebase Auth + Custom Claims', 'text-orange-500'],
                ['Almacenamiento', 'Firebase Storage (Blaze)', 'text-orange-500'],
                ['Hosting', 'Netlify (CDN global)', 'text-teal-600'],
                ['Pagos', 'Conekta (tarjeta, SPEI, OXXO)', 'text-purple-600'],
                ['Facturación', 'Facturapi CFDI 4.0', 'text-green-600'],
                ['WhatsApp', 'Twilio WABA', 'text-green-500'],
                ['Automatizaciones', 'N8N (Railway)', 'text-red-500'],
              ].map(([comp, tech, color]) => (
                <div key={comp} className="flex justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
                  <span className="text-gray-500">{comp}</span>
                  <span className={`font-medium ${color}`}>{tech}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Variables de entorno requeridas</h4>
              <div className="space-y-1.5">
                {[
                  'VITE_FIREBASE_API_KEY',
                  'VITE_FIREBASE_AUTH_DOMAIN',
                  'VITE_FIREBASE_PROJECT_ID',
                  'VITE_FIREBASE_STORAGE_BUCKET',
                  'VITE_FIREBASE_MESSAGING_SENDER_ID',
                  'VITE_FIREBASE_APP_ID',
                  'VITE_FACTURAPI_KEY',
                  'VITE_CONEKTA_PUBLIC_KEY',
                  'VITE_TWILIO_ACCOUNT_SID',
                  'VITE_TWILIO_AUTH_TOKEN',
                  'VITE_TWILIO_WA_NUMBER',
                ].map(v => (
                  <div key={v} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
                    <code className="text-xs text-gray-700">{v}</code>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium
                      ${v.includes('FIREBASE') ? 'bg-orange-100 text-orange-600' :
                        v.includes('FACTURAPI') ? 'bg-green-100 text-green-600' :
                        v.includes('CONEKTA') ? 'bg-purple-100 text-purple-600' :
                        'bg-blue-100 text-blue-600'}`}>
                      {v.includes('FIREBASE') ? 'Firebase' :
                       v.includes('FACTURAPI') ? 'Facturapi' :
                       v.includes('CONEKTA') ? 'Conekta' : 'Twilio'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear/editar consultorio */}
      {modalTenant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalTenant(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl
                          max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">
              {modalTenant === 'nuevo' ? 'Nuevo consultorio' : `Editar: ${modalTenant.nombre}`}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['nombre',       'Nombre del consultorio *', 'text', 'col-span-2'],
                ['nombreDoctor', 'Nombre del doctor *',      'text', 'col-span-1'],
                ['especialidad', 'Especialidad',             'text', 'col-span-1'],
                ['email',        'Email de acceso *',        'email','col-span-1'],
                ['telefono',     'Teléfono',                 'tel',  'col-span-1'],
                ['rfc',          'RFC',                      'text', 'col-span-1'],
                ['cedula',       'Cédula profesional',       'text', 'col-span-1'],
                ['direccion',    'Dirección del consultorio','text', 'col-span-2'],
              ].map(([field, label, type, span]) => (
                <div key={field} className={span}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type={type} value={formTenant[field]}
                    onChange={e => setFormTenant(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Plan</label>
                <select value={formTenant.plan}
                  onChange={e => setFormTenant(f => ({ ...f, plan: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="basico">Básico — $800/mes</option>
                  <option value="pro">Pro + CFDI — $1,200/mes</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <label className="text-xs text-gray-600">Permitir traslape de citas</label>
                <button type="button"
                  onClick={() => setFormTenant(f => ({ ...f, permitirTraslape: !f.permitirTraslape }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                              ${formTenant.permitirTraslape ? 'bg-teal-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                    ${formTenant.permitirTraslape ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={guardarTenant} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : modalTenant === 'nuevo' ? 'Crear consultorio' : 'Guardar cambios'}
              </button>
              <button onClick={() => setModalTenant(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm
                           hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
