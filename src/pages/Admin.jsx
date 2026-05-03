import { useState, useEffect } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc,
  doc, Timestamp, query, where, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import toast from 'react-hot-toast'

// ── Tipos de organización ─────────────────────────────────
const TIPOS_ORG = [
  { value: 'consultorio',   label: 'Consultorio independiente', icon: '🩺', desc: 'Doctor con su propio consultorio' },
  { value: 'clinica',       label: 'Clínica',                   icon: '🏥', desc: 'Varios doctores / especialidades' },
  { value: 'hospital',      label: 'Hospital',                  icon: '🏨', desc: 'Hospital con múltiples áreas' },
  { value: 'franquicia',    label: 'Franquicia médica',         icon: '🔗', desc: 'Varias sucursales del mismo dueño' },
]

const PLANES = [
  { value: 'basico',     label: 'Básico',     precio: 1200 },
  { value: 'pro',        label: 'Pro',        precio: 1800 },
  { value: 'clinica',    label: 'Clínica',    precio: 2800 },
  { value: 'enterprise', label: 'Enterprise', precio: 6000 },
]

const TIPO_COLOR = {
  consultorio: 'bg-teal-50 text-teal-700 border-teal-200',
  clinica:     'bg-blue-50 text-blue-700 border-blue-200',
  hospital:    'bg-purple-50 text-purple-700 border-purple-200',
  franquicia:  'bg-amber-50 text-amber-700 border-amber-200',
}

// ── Tabs del panel ────────────────────────────────────────
const TABS = ['Organizaciones', 'Consultorios', 'Usuarios', 'Suscripciones', 'Sistema']

export default function Admin() {
  const { allOrgs, allTenants, isSuperAdmin } = useTenant()
  const [tab, setTab]         = useState('Organizaciones')
  const [orgs, setOrgs]       = useState([])
  const [tenants, setTenants] = useState([])
  const [modalOrg,    setModalOrg]    = useState(false)
  const [modalTenant, setModalTenant] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [filtroOrg, setFiltroOrg] = useState('')

  const [formOrg, setFormOrg] = useState({
    nombre: '', tipo: 'consultorio', plan: 'pro',
    contactoNombre: '', contactoEmail: '', contactoTel: '',
    ciudad: 'Tampico', estado: 'Tamaulipas',
    notas: '', activo: true, suscripcionActiva: true,
  })

  const [formTenant, setFormTenant] = useState({
    nombre: '', orgId: '', especialidad: '',
    nombreDoctor: '', cedula: '', telefono: '', email: '',
    rfc: '', direccion: '', activo: true, suscripcionActiva: true,
  })

  useEffect(() => {
    const unsubOrgs = onSnapshot(
      collection(db, 'organizaciones'),
      snap => setOrgs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubTenants = onSnapshot(
      collection(db, 'tenants'),
      snap => setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => { unsubOrgs(); unsubTenants() }
  }, [])

  const crearOrg = async () => {
    if (!formOrg.nombre) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const orgId = formOrg.nombre
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const orgRef = await addDoc(collection(db, 'organizaciones'), {
        ...formOrg,
        orgId,
        mrr:        PLANES.find(p => p.value === formOrg.plan)?.precio ?? 0,
        tenantIds:  [],
        creadoEn:   Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      })
      toast.success(`Organización creada: ${orgId}`)
      setModalOrg(false)
      setFormOrg({ nombre:'', tipo:'consultorio', plan:'pro',
        contactoNombre:'', contactoEmail:'', contactoTel:'',
        ciudad:'Tampico', estado:'Tamaulipas', notas:'', activo:true, suscripcionActiva:true })
    } catch(e) { toast.error('Error al crear organización') }
    finally { setSaving(false) }
  }

  const crearTenant = async () => {
    if (!formTenant.nombre) { toast.error('El nombre es obligatorio'); return }
    if (!formTenant.orgId)  { toast.error('Selecciona una organización'); return }
    setSaving(true)
    try {
      const tenantId = formTenant.nombre
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      await addDoc(collection(db, 'tenants'), {
        ...formTenant,
        tenantId,
        activo: true, suscripcionActiva: true,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      })
      toast.success(`Consultorio creado: ${tenantId}`)
      toast('Recuerda asignar los claims con el script: node scripts/set-tenant-user.cjs', { duration: 6000 })
      setModalTenant(false)
      setFormTenant({ nombre:'', orgId:'', especialidad:'', nombreDoctor:'',
        cedula:'', telefono:'', email:'', rfc:'', direccion:'', activo:true, suscripcionActiva:true })
    } catch(e) { toast.error('Error al crear consultorio') }
    finally { setSaving(false) }
  }

  const toggleSuscripcion = async (tipo, id, actual) => {
    const coleccion = tipo === 'org' ? 'organizaciones' : 'tenants'
    await updateDoc(doc(db, `${coleccion}/${id}`), { suscripcionActiva: !actual })
    toast.success(!actual ? '✅ Acceso reactivado' : '🔒 Acceso bloqueado')
  }

  // MRR total
  const mrrTotal = orgs.filter(o => o.suscripcionActiva !== false)
    .reduce((s, o) => s + (o.mrr ?? 0), 0)

  const orgsFiltradas = orgs.filter(o =>
    !filtroOrg ||
    o.nombre?.toLowerCase().includes(filtroOrg.toLowerCase()) ||
    o.tipo?.includes(filtroOrg)
  )

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Super Admin</h2>
          <p className="text-sm text-gray-400">
            {orgs.length} organizaciones · {tenants.length} consultorios ·{' '}
            <span className="text-teal-600 font-semibold">
              MRR ${mrrTotal.toLocaleString('es-MX')} MXN
            </span>
          </p>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { l: 'Organizaciones', v: orgs.length,                                  c: 'text-teal-600',  bg: 'bg-teal-50'  },
          { l: 'Consultorios',   v: tenants.length,                               c: 'text-blue-600',  bg: 'bg-blue-50'  },
          { l: 'Activos',        v: tenants.filter(t=>t.suscripcionActiva!==false).length, c: 'text-green-600', bg: 'bg-green-50' },
          { l: 'MRR',            v: `$${mrrTotal.toLocaleString('es-MX')}`,       c: 'text-purple-600',bg: 'bg-purple-50' },
        ].map((k,i) => (
          <div key={i} className={`${k.bg} rounded-xl p-4`}>
            <p className="text-xs text-gray-500 mb-1">{k.l}</p>
            <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab===t ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ══ Tab: Organizaciones ═══════════════════════════ */}
      {tab === 'Organizaciones' && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input type="text" placeholder="Buscar organización..."
              value={filtroOrg} onChange={e => setFiltroOrg(e.target.value)}
              className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-teal-400" />
            <button onClick={() => setModalOrg(true)}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
              + Nueva organización
            </button>
          </div>

          {/* Árbol de orgs → tenants */}
          <div className="space-y-3">
            {orgsFiltradas.map(org => {
              const orgTenants = tenants.filter(t => t.orgId === org.id || t.id === org.id)
              return (
                <div key={org.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Cabecera de la org */}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {TIPOS_ORG.find(t=>t.value===org.tipo)?.icon ?? '🏥'}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{org.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded border ${TIPO_COLOR[org.tipo] ?? ''}`}>
                            {TIPOS_ORG.find(t=>t.value===org.tipo)?.label ?? org.tipo}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">{org.id}</span>
                          <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
                            {org.plan?.toUpperCase()} · ${(org.mrr??0).toLocaleString('es-MX')}/mes
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${org.suscripcionActiva!==false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {org.suscripcionActiva!==false ? 'Activa' : 'Suspendida'}
                      </span>
                      <button
                        onClick={() => toggleSuscripcion('org', org.id, org.suscripcionActiva!==false)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                          ${org.suscripcionActiva!==false
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`}>
                        {org.suscripcionActiva!==false ? '🔒 Bloquear' : '✅ Reactivar'}
                      </button>
                    </div>
                  </div>

                  {/* Tenants de la org */}
                  {orgTenants.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {orgTenants.map(t => (
                        <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className="w-1 h-8 bg-teal-200 rounded-full flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                              <div className="flex gap-2 mt-0.5">
                                <span className="text-xs text-gray-400 font-mono">{t.id}</span>
                                {t.especialidad && (
                                  <span className="text-xs text-gray-500">{t.especialidad}</span>
                                )}
                                {t.nombreDoctor && (
                                  <span className="text-xs text-gray-500">{t.nombreDoctor}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full
                              ${t.suscripcionActiva!==false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {t.suscripcionActiva!==false ? 'Activo' : 'Suspendido'}
                            </span>
                            <button
                              onClick={() => toggleSuscripcion('tenant', t.id, t.suscripcionActiva!==false)}
                              className={`text-xs px-2 py-1 rounded border transition-colors
                                ${t.suscripcionActiva!==false
                                  ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                                  : 'bg-green-50 text-green-500 border-green-200 hover:bg-green-100'}`}>
                              {t.suscripcionActiva!==false ? '🔒' : '✅'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-3 text-xs text-gray-400 flex items-center justify-between">
                      <span>Sin consultorios registrados</span>
                      <button
                        onClick={() => { setFormTenant(f => ({ ...f, orgId: org.id })); setModalTenant(true) }}
                        className="text-teal-600 hover:underline">
                        + Agregar consultorio
                      </button>
                    </div>
                  )}

                  {/* Footer con acción */}
                  {orgTenants.length > 0 && (
                    <div className="px-5 py-2 bg-gray-50 border-t border-gray-100">
                      <button
                        onClick={() => { setFormTenant(f => ({ ...f, orgId: org.id })); setModalTenant(true) }}
                        className="text-xs text-teal-600 hover:underline">
                        + Agregar consultorio a esta organización
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {orgsFiltradas.length === 0 && (
              <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                <p className="text-3xl mb-2">🏥</p>
                <p className="text-sm">Sin organizaciones registradas</p>
                <button onClick={() => setModalOrg(true)} className="mt-3 text-teal-600 text-sm hover:underline">
                  Crear la primera organización →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Tab: Consultorios ════════════════════════════ */}
      {tab === 'Consultorios' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">{tenants.length} consultorios registrados</p>
            <button onClick={() => setModalTenant(true)}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
              + Nuevo consultorio
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['ID','Nombre','Organización','Especialidad','Doctor','Estado','Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenants.map(t => {
                    const org = orgs.find(o => o.id === t.orgId)
                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs text-teal-700">{t.id}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{t.nombre}</td>
                        <td className="px-4 py-2.5">
                          {org ? (
                            <span className={`text-xs px-2 py-0.5 rounded border ${TIPO_COLOR[org.tipo] ?? ''}`}>
                              {org.nombre}
                            </span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{t.especialidad || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{t.nombreDoctor || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${t.suscripcionActiva!==false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {t.suscripcionActiva!==false ? 'Activo' : 'Suspendido'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => toggleSuscripcion('tenant', t.id, t.suscripcionActiva!==false)}
                            className={`text-xs px-2 py-1 rounded border transition-colors
                              ${t.suscripcionActiva!==false
                                ? 'bg-red-50 text-red-500 border-red-200'
                                : 'bg-green-50 text-green-500 border-green-200'}`}>
                            {t.suscripcionActiva!==false ? '🔒 Bloquear' : '✅ Activar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: Suscripciones ══════════════════════════ */}
      {tab === 'Suscripciones' && (
        <div className="space-y-3">
          {orgs.map(org => (
            <div key={org.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{org.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {TIPOS_ORG.find(t=>t.value===org.tipo)?.label} · Plan {org.plan?.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-teal-600">${(org.mrr??0).toLocaleString('es-MX')} MXN/mes</p>
                  <p className="text-xs text-gray-400">
                    {tenants.filter(t=>t.orgId===org.id||t.id===org.id).length} consultorios
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <select
                  value={org.plan ?? 'pro'}
                  onChange={async (e) => {
                    const plan = e.target.value
                    const mrr  = PLANES.find(p => p.value === plan)?.precio ?? 0
                    await updateDoc(doc(db, `organizaciones/${org.id}`), { plan, mrr })
                    toast.success(`Plan actualizado: ${plan.toUpperCase()}`)
                  }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {PLANES.map(p => (
                    <option key={p.value} value={p.value}>
                      {p.label} — ${p.precio.toLocaleString('es-MX')}/mes
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => toggleSuscripcion('org', org.id, org.suscripcionActiva!==false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
                    ${org.suscripcionActiva!==false
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : 'bg-green-50 text-green-600 border-green-200'}`}>
                  {org.suscripcionActiva!==false ? '🔒 Suspender' : '✅ Reactivar'}
                </button>
              </div>
            </div>
          ))}
          <div className="bg-teal-50 rounded-xl border border-teal-200 p-4 mt-4">
            <p className="text-sm font-semibold text-teal-800">
              MRR Total: ${mrrTotal.toLocaleString('es-MX')} MXN/mes
            </p>
            <p className="text-xs text-teal-600 mt-0.5">
              ARR proyectado: ${(mrrTotal*12).toLocaleString('es-MX')} MXN/año
            </p>
          </div>
        </div>
      )}

      {/* ══ Tab: Sistema ════════════════════════════════ */}
      {tab === 'Sistema' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Estructura de datos (Firestore)</p>
            <div className="font-mono text-xs bg-gray-50 rounded-xl p-4 leading-6 text-gray-700">
              <p><span className="text-purple-600">organizaciones/</span><span className="text-gray-400">{'{orgId}'}</span></p>
              <p className="pl-4 text-gray-500">tipo: consultorio | clinica | hospital</p>
              <p className="pl-4 text-gray-500">plan: basico | pro | clinica | enterprise</p>
              <p className="pl-4 text-gray-500">mrr: número (MXN/mes)</p>
              <br/>
              <p><span className="text-teal-600">tenants/</span><span className="text-gray-400">{'{tenantId}'}</span></p>
              <p className="pl-4 text-gray-500">orgId: → referencia a organizaciones/</p>
              <p className="pl-4 text-gray-500">especialidad, nombreDoctor, cedula...</p>
              <p className="pl-4 text-teal-600">  pacientes/, citas/, consultas/</p>
              <p className="pl-4 text-teal-600">  cobros/, facturas/, recetas/</p>
            </div>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Scripts para asignar claims</p>
            <div className="space-y-1 font-mono text-xs text-amber-700">
              <p>node scripts/set-tenant-user.cjs email@dr.com TENANT_ID admin</p>
              <p>node scripts/set-tenant-user.cjs email@rec.com TENANT_ID recepcion</p>
              <p>node scripts/set-paciente.cjs email@p.com TENANT_ID</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Usuarios — placeholder */}
      {tab === 'Usuarios' && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">👥</p>
          <p className="text-sm">Gestión de usuarios por consultorio disponible en el módulo "Usuarios" del sidebar</p>
        </div>
      )}

      {/* Modal: Nueva organización */}
      {modalOrg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOrg(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nueva organización</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                <input type="text" value={formOrg.nombre}
                  onChange={e => setFormOrg(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Tipo de organización *</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_ORG.map(t => (
                    <button key={t.value}
                      onClick={() => setFormOrg(f => ({ ...f, tipo: t.value }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all
                        ${formOrg.tipo===t.value ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className="text-base">{t.icon}</p>
                      <p className="text-xs font-medium text-gray-800 mt-1">{t.label}</p>
                      <p className="text-xs text-gray-400">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plan</label>
                <select value={formOrg.plan}
                  onChange={e => setFormOrg(f => ({ ...f, plan: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {PLANES.map(p => (
                    <option key={p.value} value={p.value}>
                      {p.label} — ${p.precio.toLocaleString('es-MX')}/mes
                    </option>
                  ))}
                </select>
              </div>
              {[
                ['contactoNombre','Nombre del contacto principal'],
                ['contactoEmail','Email de contacto'],
                ['contactoTel','Teléfono de contacto'],
              ].map(([f, l]) => (
                <div key={f}>
                  <label className="block text-xs text-gray-500 mb-1">{l}</label>
                  <input type="text" value={formOrg[f]}
                    onChange={e => setFormOrg(fo => ({ ...fo, [f]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notas internas</label>
                <textarea value={formOrg.notas} rows={2}
                  onChange={e => setFormOrg(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={crearOrg} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium
                           hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Creando...' : 'Crear organización'}
              </button>
              <button onClick={() => setModalOrg(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo consultorio */}
      {modalTenant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalTenant(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nuevo consultorio</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Organización *</label>
                <select value={formTenant.orgId}
                  onChange={e => setFormTenant(f => ({ ...f, orgId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="">Seleccionar organización...</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.nombre} ({o.tipo})</option>
                  ))}
                </select>
              </div>
              {[
                ['nombre','Nombre del consultorio *'],
                ['especialidad','Especialidad'],
                ['nombreDoctor','Nombre del doctor'],
                ['cedula','Cédula profesional'],
                ['telefono','Teléfono'],
                ['email','Email del doctor'],
                ['rfc','RFC'],
                ['direccion','Dirección completa'],
              ].map(([f, l]) => (
                <div key={f}>
                  <label className="block text-xs text-gray-500 mb-1">{l}</label>
                  <input type="text" value={formTenant[f]}
                    onChange={e => setFormTenant(fo => ({ ...fo, [f]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={crearTenant} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium
                           hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Creando...' : 'Crear consultorio'}
              </button>
              <button onClick={() => setModalTenant(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
