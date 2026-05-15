import { useState, useEffect } from 'react'
import { crearOrganizacionFP, obtenerApiKeyOrg, consultarOrganizacionFP } from '../services/facturapi'
import {
  collection, onSnapshot, addDoc, updateDoc, setDoc,
  doc, getDoc, Timestamp, query, where, getDocs
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
  { value: 'starter',    label: 'Starter',    precio:  649,  limite:   50 },
  { value: 'basico',     label: 'Básico',     precio:  999,  limite:  150 },
  { value: 'pro',        label: 'Pro',        precio: 1899,  limite:  350 },
  { value: 'clinica',    label: 'Clínica',    precio: 2800,  limite:  800 },
  { value: 'enterprise', label: 'Enterprise', precio: 6500,  limite: 9999 },
]

// Componente medidor de pacientes con semáforo
function MedidorPacientes({ tenantId, plan }) {
  const [conteo, setConteo] = useState(null)
  const limite = PLANES.find(p => p.value === plan)?.limite ?? 350

  useEffect(() => {
    if (!tenantId) return
    // Contar pacientes con cita en el mes actual
    const inicio = new Date()
    inicio.setDate(1); inicio.setHours(0,0,0,0)
    getDocs(query(
      collection(db, 'tenants', String(tenantId), 'citas'),
      where('fecha', '>=', Timestamp.fromDate(inicio))
    )).then(snap => {
      // Contar pacientes únicos (no citas)
      const ids = new Set(snap.docs.map(d => d.data().pacienteId).filter(Boolean))
      setConteo(ids.size)
    }).catch(() => setConteo(0))
  }, [tenantId, plan])

  if (conteo === null) return <span className="text-xs text-gray-300">...</span>

  const pct = Math.min(100, Math.round((conteo / limite) * 100))
  const color = pct >= 100 ? 'bg-red-500'
    : pct >= 80  ? 'bg-amber-400'
    : 'bg-green-400'
  const textColor = pct >= 100 ? 'text-red-600'
    : pct >= 80  ? 'text-amber-600'
    : 'text-green-600'
  const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢'

  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-xs font-semibold ${textColor}`}>
          {emoji} {conteo}/{limite === 9999 ? '∞' : limite}
        </span>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }} />
      </div>
      {pct >= 80 && (
        <p className={`text-xs mt-0.5 ${pct >= 100 ? 'text-red-500 font-semibold' : 'text-amber-500'}`}>
          {pct >= 100 ? '⚠️ Excedido — upgrade requerido' : '↑ Cerca del límite'}
        </p>
      )}
    </div>
  )
}

const TIPO_COLOR = {
  consultorio: 'bg-teal-50 text-teal-700 border-teal-200',
  clinica:     'bg-blue-50 text-blue-700 border-blue-200',
  hospital:    'bg-purple-50 text-purple-700 border-purple-200',
  franquicia:  'bg-amber-50 text-amber-700 border-amber-200',
}

// ── Tabs del panel ────────────────────────────────────────
const TABS = ['Organizaciones', 'Consultorios', 'Usuarios', 'Suscripciones', 'Sistema']

// ── Usuarios por consultorio (SuperAdmin) ──────────────────
function UsuariosPorConsultorio({ tenants }) {
  const [usuariosPorTenant, setUsuariosPorTenant] = useState({})
  const [expandido,  setExpandido]  = useState(null)
  const [modalTid,   setModalTid]   = useState(null)  // tenantId del modal crear usuario
  const [formUser,   setFormUser]   = useState({ nombre:'', apellidos:'', email:'', rol:'recepcion' })
  const [savingUser, setSavingUser] = useState(false)

  const crearUsuarioDirecto = async () => {
    if (!formUser.nombre || !formUser.email) { toast.error('Nombre y email son obligatorios'); return }
    setSavingUser(true)
    try {
      const tenant = tenants.find(t => t.id === modalTid)
      const res = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:        formUser.email.trim().toLowerCase(),
          nombre:       formUser.nombre.trim(),
          apellidos:    formUser.apellidos.trim(),
          rol:          formUser.rol,
          tenantId:     String(modalTid),
          tenantNombre: tenant?.nombre ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear usuario')
      toast.success(`✅ Usuario creado. Email enviado a ${formUser.email}`)
      setModalTid(null)
      setFormUser({ nombre:'', apellidos:'', email:'', rol:'recepcion' })
    } catch(e) { toast.error(e.message) }
    finally { setSavingUser(false) }
  }

  useEffect(() => {
    if (!tenants.length) return
    const unsubs = tenants.map(t => {
      return onSnapshot(
        collection(db, `tenants/${t.id}/usuarios`),
        snap => setUsuariosPorTenant(prev => ({
          ...prev,
          [t.id]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
        }))
      )
    })
    return () => unsubs.forEach(u => u())
  }, [tenants])

  const ROL_COLOR = {
    admin:      'bg-blue-100 text-blue-700',
    doctor:     'bg-teal-100 text-teal-700',
    recepcion:  'bg-green-100 text-green-700',
    superAdmin: 'bg-purple-100 text-purple-700',
  }

  const totalUsuarios = Object.values(usuariosPorTenant).reduce((s, u) => s + u.length, 0)

  return (
    <div>
      {/* Resumen general */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Total usuarios</p>
          <p className="text-2xl font-bold text-gray-800">{totalUsuarios}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Consultorios activos</p>
          <p className="text-2xl font-bold text-teal-600">{tenants.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Promedio usuarios/consultorio</p>
          <p className="text-2xl font-bold text-gray-600">
            {tenants.length ? (totalUsuarios / tenants.length).toFixed(1) : 0}
          </p>
        </div>
      </div>

      {/* Lista por consultorio */}
      <div className="space-y-3">
        {tenants.map(t => {
          const usuarios = usuariosPorTenant[t.id] ?? []
          const activos = usuarios.filter(u => u.activo !== false)
          const isOpen = expandido === t.id
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header del consultorio */}
              <button
                onClick={() => setExpandido(isOpen ? null : t.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center
                                  text-teal-700 font-bold text-sm flex-shrink-0">
                    {(t.nombre ?? 'C')[0].toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                    <p className="text-xs text-gray-400 font-mono">{t.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {Object.entries(
                      usuarios.reduce((acc, u) => {
                        acc[u.rol] = (acc[u.rol] ?? 0) + 1; return acc
                      }, {})
                    ).map(([rol, cnt]) => (
                      <span key={`${t.id}-rol-${rol}`} className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROL_COLOR[rol] ?? 'bg-gray-100 text-gray-500'}`}>
                        {cnt} {rol}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">{activos.length}/{usuarios.length} activos</span>
                  <span className="text-gray-400 text-lg">{isOpen ? '▾' : '▸'}</span>
                </div>
              </button>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-gray-100">
                  {usuarios.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                      Sin usuarios registrados en este consultorio
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Nombre','Email','Rol','Estado'].map(h => (
                            <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {usuarios.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-800">{u.nombre}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{u.email}</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROL_COLOR[u.rol] ?? 'bg-gray-100 text-gray-500'}`}>
                                {u.rol}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                {u.activo !== false ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <p className="text-xs text-gray-400">
                      Selecciona el consultorio en el menú superior para ver su contexto completo
                    </p>
                    <button
                      onClick={() => {
                        setModalTid(t.id)
                        setFormUser({ nombre:'', apellidos:'', email:'', rol:'recepcion' })
                      }}
                      className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg
                                 hover:bg-teal-700 transition-colors flex items-center gap-1">
                      + Agregar usuario
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {modalTid && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalTid(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1 text-gray-800">Nuevo usuario</h3>
            <p className="text-xs text-gray-400 mb-4">
              Consultorio: <strong>{tenants.find(t => t.id === modalTid)?.nombre}</strong>
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[['nombre','Nombre *','Juan'],['apellidos','Apellidos','García']].map(([f,l,p]) => (
                  <div key={f}>
                    <label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type="text" value={formUser[f]}
                      onChange={e => setFormUser(x => ({ ...x, [f]: e.target.value }))}
                      placeholder={p}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email *</label>
                <input type="email" value={formUser.email}
                  onChange={e => setFormUser(x => ({ ...x, email: e.target.value }))}
                  placeholder="usuario@consultorio.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rol *</label>
                <select value={formUser.rol}
                  onChange={e => setFormUser(x => ({ ...x, rol: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {[
                    ['doctor','Doctor'],['recepcion','Recepcionista'],
                    ['enfermeria','Enfermería'],['contador','Contador'],
                    ['farmacia','Farmacia'],['reportes','Solo Reportes'],
                    ['dueno','Dueño de clínica'],
                  ].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 mt-3">
              <p className="text-xs text-blue-700">
                📧 Se enviará email automático con instrucciones para configurar contraseña.
              </p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={crearUsuarioDirecto} disabled={savingUser}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium
                           hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {savingUser ? 'Creando...' : 'Crear usuario'}
              </button>
              <button onClick={() => setModalTid(null)}
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

// ── Plantillas de receta controladas ───────────────────────
function PlantillasReceta({ tenants }) {
  const CAMPOS = [
    ['especialidad',       'Especialidad',              'Ej: Medicina General, Pediatría...'],
    ['cedulaProfesional',  'Cédula profesional',        'Número de cédula CONAMED'],
    ['universidadEgreso',  'Universidad de egreso',     'Ej: UAT, UNAM, UVM...'],
    ['direccionConsultorio','Dirección del consultorio', 'Calle, número, colonia, ciudad'],
    ['telefonoConsultorio','Teléfono',                  'Número para la receta'],
    ['pieReceta',          'Leyenda pie de receta',     'Texto personalizado al pie'],
  ]

  // Estado local para cada tenant × campo
  const [vals, setVals] = useState(() => {
    const init = {}
    tenants.forEach(t => {
      init[t.id] = { ...(t.plantillaReceta ?? {}) }
    })
    return init
  })

  // Sync when tenants prop changes
  useEffect(() => {
    setVals(prev => {
      const next = { ...prev }
      tenants.forEach(t => {
        if (!next[t.id]) next[t.id] = {}
        Object.keys(t.plantillaReceta ?? {}).forEach(k => {
          if (next[t.id][k] === undefined) next[t.id][k] = t.plantillaReceta[k]
        })
      })
      return next
    })
  }, [tenants])

  const guardarCampo = async (tenantId, field, value) => {
    try {
      await updateDoc(doc(db, 'tenants', tenantId), {
        [`plantillaReceta.${field}`]: value
      })
      toast.success(`✓ Guardado`)
    } catch(e) {
      toast.error('Error al guardar: ' + e.message)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm font-semibold text-gray-700 mb-1">
        📋 Plantillas de receta por consultorio
      </p>
      <p className="text-xs text-gray-400 mb-4">
        Configura los datos que aparecerán en la receta de cada consultorio.
        Los cambios se guardan al presionar el botón Guardar.
      </p>
      <div className="space-y-5">
        {tenants.map(t => (
          <div key={t.id} className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                <p className="text-xs text-gray-400 font-mono">{t.id}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {CAMPOS.map(([field, label, placeholder]) => (
                <div key={field} className={field === 'pieReceta' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  {field === 'pieReceta' ? (
                    <textarea
                      rows={2}
                      value={vals[t.id]?.[field] ?? ''}
                      onChange={e => setVals(v => ({
                        ...v, [t.id]: { ...v[t.id], [field]: e.target.value }
                      }))}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={vals[t.id]?.[field] ?? ''}
                      onChange={e => setVals(v => ({
                        ...v, [t.id]: { ...v[t.id], [field]: e.target.value }
                      }))}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                const data = vals[t.id] ?? {}
                for (const [field] of CAMPOS) {
                  if (data[field] !== undefined) {
                    await guardarCampo(t.id, field, data[field] ?? '')
                  }
                }
                toast.success(`Plantilla guardada para ${t.nombre} ✓`)
              }}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg
                         hover:bg-teal-700 transition-colors">
              💾 Guardar plantilla
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Configuración de Planes y Precios ───────────────────
function ConfigPlanes() {
  const PLANES_DEFAULT = [
    { id: 'starter',    label: 'Starter',    precio: 649,  alta: 1500, activo: true,
      descripcion: 'Hasta 50 pacientes/mes. Sin CFDI ni IA.' },
    { id: 'basico',     label: 'Básico',     precio: 999,  alta: 2000, activo: true,
      descripcion: '51–150 pacientes. Con telemedicina y sitio web.' },
    { id: 'pro',        label: 'Pro',        precio: 1899, alta: 2500, activo: true,
      descripcion: '151–350 pacientes. CFDI, IA, OCR, Reportes.' },
    { id: 'clinica',    label: 'Clínica',    precio: 2800, alta: 3500, activo: true,
      descripcion: '351–800 pacientes. Multi-tenant hasta 3.' },
    { id: 'enterprise', label: 'Enterprise', precio: 6500, alta: 5000, activo: true,
      descripcion: '800+ pacientes. Tenants ilimitados + SLA 4h.' },
  ]
  const [planes, setPlanes]   = useState(PLANES_DEFAULT)
  const [saving, setSaving]   = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'configuracion', 'planes')).then(snap => {
      if (snap.exists() && snap.data().lista) setPlanes(snap.data().lista)
    }).catch(() => {})
  }, [])

  const guardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'configuracion', 'planes'), {
        lista: planes, actualizadoEn: Timestamp.now()
      })
      toast.success('Precios actualizados')
    } catch(e) { toast.error('Error: ' + e.message) }
    finally { setSaving(false) }
  }

  const actualizar = (id, campo, valor) =>
    setPlanes(ps => ps.map(p => p.id === id ? { ...p, [campo]: valor } : p))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left">
        <div>
          <p className="text-sm font-semibold text-gray-700">💰 Planes y Precios</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Administra los precios de suscripción. Los cambios aplican a nuevos contratos.
          </p>
        </div>
        <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Plan','Descripción','Precio/mes (MXN)','Alta inicial (MXN)','Activo'].map(h => (
                    <th key={h} className="text-left px-2 py-2 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {planes.map(p => (
                  <tr key={p.id}>
                    <td className="px-2 py-2">
                      <span className="font-semibold text-gray-800">{p.label}</span>
                    </td>
                    <td className="px-2 py-2">
                      <input type="text" value={p.descripcion}
                        onChange={e => actualizar(p.id, 'descripcion', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs
                                   focus:outline-none focus:ring-1 focus:ring-teal-400" />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">$</span>
                        <input type="number" value={p.precio} min="0"
                          onChange={e => actualizar(p.id, 'precio', Number(e.target.value))}
                          className="w-24 border border-gray-200 rounded px-2 py-1 text-sm font-semibold
                                     focus:outline-none focus:ring-1 focus:ring-teal-400" />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">$</span>
                        <input type="number" value={p.alta} min="0"
                          onChange={e => actualizar(p.id, 'alta', Number(e.target.value))}
                          className="w-24 border border-gray-200 rounded px-2 py-1 text-sm
                                     focus:outline-none focus:ring-1 focus:ring-teal-400" />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={p.activo}
                        onChange={e => actualizar(p.id, 'activo', e.target.checked)}
                        className="rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={guardar} disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg
                         hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : '💾 Guardar precios'}
            </button>
            <p className="text-xs text-gray-400">
              Los cambios aplican a nuevas suscripciones. Las activas no se afectan.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Configuración fiscal y comercial de DocVia ─────────
function ConfigDocVias() {
  const FORM_VACIO = {
    rfc:'', nombreLegal:'', cp:'', regimen:'612', email:'',
    telefono:'', stripePaymentLinkDocVias:'',
    stripePriceIdBasico:'', stripePriceIdPro:'',
    stripePriceIdClinica:'', stripePriceIdEnterprise:'',
    diasGraciaDefault: 10,
    precioPlanes: { basico:1200, pro:1800, clinica:2800, enterprise:6000 },
  }
  const [form, setForm]       = useState(FORM_VACIO)
  const [saving, setSaving]   = useState(false)
  const [cargado, setCargado] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'configuracion', 'docvias')).then(snap => {
      if (snap.exists()) setForm(f => ({ ...f, ...snap.data() }))
      setCargado(true)
    }).catch(() => setCargado(true))
  }, [])

  const guardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'configuracion', 'docvias'), {
        ...form,
        actualizadoEn: Timestamp.now(),
      }, { merge: true })
      toast.success('Configuración DocVia guardada')
    } catch(e) { toast.error('Error: ' + e.message) }
    finally { setSaving(false) }
  }

  const campo = (field, label, placeholder, type='text') => (
    <div key={field}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} value={form[field] ?? ''}
        onChange={e => setForm(f => ({ ...f, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-400" />
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            🏢 Configuración Fiscal DocVia
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Tu RFC, datos fiscales, precios de planes y claves de Stripe para facturar a los doctores
          </p>
        </div>
        <span className="text-gray-400 text-lg">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && cargado && (
        <div className="mt-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos fiscales</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campo('rfc', 'Tu RFC *', 'BEZJ790128XX0')}
            {campo('nombreLegal', 'Nombre legal (como en SAT) *', 'JUAN FELIPE CHAVEZ BEZARES')}
            {campo('cp', 'Código Postal fiscal *', '89000')}
            {campo('email', 'Email para facturas', 'docvias@email.com', 'email')}
            {campo('telefono', 'WhatsApp soporte', '8331234567')}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Régimen fiscal</label>
            <select value={form.regimen}
              onChange={e => setForm(f => ({ ...f, regimen: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="612">612 — Personas Físicas Act. Empresariales</option>
              <option value="616">616 — Sin obligaciones fiscales (RESICO)</option>
              <option value="621">621 — Incorporación Fiscal</option>
              <option value="601">601 — General de Ley Personas Morales</option>
            </select>
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">
            Stripe — cobro de suscripciones
          </p>
          <div className="grid grid-cols-1 gap-3">
            {campo('stripePaymentLinkDocVias', 'Payment Link para pago manual (buy.stripe.com/...)',
              'https://buy.stripe.com/...')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campo('stripePriceIdBasico',     'Price ID Plan Básico',     'price_xxx')}
            {campo('stripePriceIdPro',        'Price ID Plan Pro',        'price_xxx')}
            {campo('stripePriceIdClinica',    'Price ID Plan Clínica',    'price_xxx')}
            {campo('stripePriceIdEnterprise', 'Price ID Plan Enterprise', 'price_xxx')}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">
            Parámetros globales
          </p>
          <div className="grid grid-cols-2 gap-3">
            {campo('diasGraciaDefault', 'Días de gracia (default)', '10', 'number')}
            <div>
              <label className="block text-xs text-gray-500 mb-1">MRR actual (informativo)</label>
              <p className="text-sm font-bold text-gray-700 py-2">
                Se calcula desde Admin → Org
              </p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>Price IDs de Stripe:</strong> Ve a Stripe Dashboard → Products → Crea un producto
              "DocVia Plan Pro" con precio $1,800 MXN/mes recurrente → copia el Price ID (empieza con price_).
              Uno por cada plan que uses.
            </p>
          </div>

          <button onClick={guardar} disabled={saving}
            className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium
                       hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando...' : '💾 Guardar configuración DocVia'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Componente fila Stripe por tenant ────────────────────
function StripeRow({ tenant }) {
  const [editando, setEditando] = useState(false)
  const [link,     setLink]     = useState(tenant.stripePaymentLink ?? '')
  const [saving,   setSaving]   = useState(false)

  const guardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'tenants', String(tenant._docId ?? tenant.id)), {
        stripePaymentLink: link.trim() || null,
        actualizadoEn: Timestamp.now(),
      }, { merge: true })
      toast.success('Payment Link guardado')
      setEditando(false)
    } catch(e) {
      toast.error('Error: ' + e.message)
    } finally { setSaving(false) }
  }

  const tieneLink = !!tenant.stripePaymentLink

  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-sm font-medium text-gray-800">{tenant.nombre}</p>
          <p className="text-xs text-gray-400 font-mono">{tenant._docId ?? tenant.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {tieneLink ? (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
              ✅ Configurado
            </span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              Sin configurar
            </span>
          )}
          <button onClick={() => setEditando(!editando)}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            {editando ? 'Cancelar' : tieneLink ? '✏️ Editar' : '⚙️ Configurar'}
          </button>
        </div>
      </div>
      {editando && (
        <div className="flex gap-2 mt-2">
          <input type="url" value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="https://buy.stripe.com/..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono" />
          <button onClick={guardar} disabled={saving}
            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg
                       hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap">
            {saving ? '...' : '💾 Guardar'}
          </button>
        </div>
      )}
      {tieneLink && !editando && (
        <p className="text-xs text-gray-400 font-mono truncate mt-1">
          {tenant.stripePaymentLink}
        </p>
      )}
    </div>
  )
}

export default function Admin() {
  const { allOrgs, allTenants, isSuperAdmin } = useTenant()
  const [tab, setTab]         = useState('Organizaciones')
  const [orgs, setOrgs]       = useState([])
  const [tenants, setTenants] = useState([])
  const [modalOrg,    setModalOrg]    = useState(false)
  const [modalTenant, setModalTenant] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [filtroOrg, setFiltroOrg] = useState('')
  const [fpModal, setFpModal]     = useState(null)   // tenant seleccionado para config FP
  const [fpForm, setFpForm]       = useState({ rfc:'', nombreLegal:'', cp:'', regimen:'612', apiKeyManual:'' })
  const [fpLoading, setFpLoading] = useState(false)
  const [fpStatus, setFpStatus]   = useState({})     // { tenantId: 'ok'|'error'|'loading' }

  const [formOrg, setFormOrg] = useState({
    nombre: '', tipo: 'consultorio', plan: 'pro',
    contactoNombre: '', contactoEmail: '', contactoTel: '',
    ciudad: 'Tampico', estado: 'Tamaulipas',
    notas: '', activo: true, suscripcionActiva: true,
  })

  const [formTenant, setFormTenant] = useState({
    nombre: '', orgId: '', especialidad: '',
    nombreDoctor: '', cedula: '', telefono: '', email: '',
    rfc: '', cp: '', regimen: '612',
    direccion: '', activo: true, suscripcionActiva: true,
  })

  useEffect(() => {
    const unsubOrgs = onSnapshot(
      collection(db, 'organizaciones'),
      snap => setOrgs(snap.docs.map(d => ({ ...d.data(), id: d.id, _docId: d.id })))
    )
    const unsubTenants = onSnapshot(
      collection(db, 'tenants'),
      snap => setTenants(snap.docs.map(d => ({ ...d.data(), id: d.id, _docId: d.id })))
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
      setModalTenant(false)
      setFormTenant({ nombre:'', orgId:'', especialidad:'', nombreDoctor:'',
        cedula:'', telefono:'', email:'', rfc:'', cp:'', regimen:'612', direccion:'', activo:true, suscripcionActiva:true })
    } catch(e) { toast.error('Error al crear consultorio') }
    finally { setSaving(false) }
  }

  // ── Configurar Facturapi para un tenant ─────────────────
  // Opción A: crear automáticamente la organización en Facturapi
  // Opción B: pegar la API key manualmente (org ya existente en Facturapi)
  const configurarFacturapi = async (tenant) => {
    setFpLoading(true)
    setFpStatus(s => ({ ...s, [tenant._docId ?? tenant.id]: 'loading' }))
    try {
      let apiKey = fpForm.apiKeyManual?.trim()

      if (!apiKey) {
        // Crear organización en Facturapi automáticamente
        if (!fpForm.rfc)         throw new Error('El RFC es obligatorio')
        if (!fpForm.nombreLegal) throw new Error('El nombre legal es obligatorio')

        toast('Creando organización en Facturapi...', { icon: '🧾' })
        const org = await crearOrganizacionFP({
          rfc:         fpForm.rfc.toUpperCase().trim(),
          nombreLegal: fpForm.nombreLegal.toUpperCase().trim(),
          cp:          fpForm.cp || tenant.cp || '89000',
          regimen:     fpForm.regimen,
        })

        // Obtener la API key de la org recién creada
        const keys = await obtenerApiKeyOrg(org.id)
        apiKey = keys.live ?? keys.test ?? null

        if (!apiKey) throw new Error('Facturapi no devolvió una API key. Revisa el dashboard de Facturapi.')

        // Guardar también el ID de la org en Facturapi para referencia
        await setDoc(doc(db, 'tenants', String(tenant._docId ?? tenant.id)), {
          facturapiOrgId:  org.id,
          facturapiApiKey: apiKey,
          rfc:             fpForm.rfc.toUpperCase().trim(),
          actualizadoEn:   Timestamp.now(),
        }, { merge: true })
        toast.success(`✅ Organización creada en Facturapi y API key guardada para ${tenant.nombre}`)
      } else {
        // Modo manual: solo guardar la key que pegó el SuperAdmin
        await setDoc(doc(db, 'tenants', String(tenant._docId ?? tenant.id)), {
          facturapiApiKey: apiKey,
          actualizadoEn:   Timestamp.now(),
        }, { merge: true })
        toast.success(`✅ API key guardada para ${tenant.nombre}`)
      }

      setFpStatus(s => ({ ...s, [tenant._docId ?? tenant.id]: 'ok' }))
      setFpModal(null)
      setFpForm({ rfc:'', nombreLegal:'', cp:'', regimen:'612', apiKeyManual:'' })
    } catch(e) {
      console.error('[Facturapi config]', e)
      toast.error(`Error: ${e.message}`)
      setFpStatus(s => ({ ...s, [tenant._docId ?? tenant.id]: 'error' }))
    } finally { setFpLoading(false) }
  }

  const limpiarFacturapi = async (tenant) => {
    if (!window.confirm(`¿Quitar la configuración de Facturapi de "${tenant.nombre}"? El consultorio dejará de poder timbrar con su propio RFC.`)) return
    await setDoc(doc(db, 'tenants', String(tenant._docId ?? tenant.id)), {
      facturapiApiKey: null,
      facturapiOrgId:  null,
      actualizadoEn:   Timestamp.now(),
    }, { merge: true })
    toast.success('Configuración de Facturapi eliminada')
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
                        <div key={`${org.id}-${t.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
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
                    {['ID','Nombre','Organización','Especialidad','Doctor','Pac./mes','Estado','Acciones'].map(h => (
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
                          <MedidorPacientes tenantId={t.id} plan={t.plan ?? 'pro'} />
                        </td>
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
          {/* Un card por TENANT (no por org) — cada consultorio tiene su plan */}
          {tenants.map(t => {
            const planInfo = PLANES.find(p => p.value === (t.plan ?? 'pro')) ?? PLANES[2]
            const activo   = t.suscripcionActiva !== false
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{t.nombre}</p>
                    <p className="text-xs text-gray-400 font-mono">{t.id}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.especialidad ?? 'Consultorio'} · Dr. {t.nombreDoctor ?? '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-teal-600">
                      ${planInfo.precio.toLocaleString('es-MX')} MXN/mes
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {activo ? '● Activo' : '● Suspendido'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <select
                    value={t.plan ?? 'pro'}
                    onChange={async (e) => {
                      const plan = e.target.value
                      const mrr  = PLANES.find(p => p.value === plan)?.precio ?? 0
                      await updateDoc(doc(db, 'tenants', String(t._docId ?? t.id)), { plan })
                      // Actualizar también la org si existe
                      if (t.orgId) {
                        await updateDoc(doc(db, 'organizaciones', String(t.orgId)), { plan, mrr })
                          .catch(() => {})
                      }
                      toast.success(`Plan de ${t.nombre} → ${plan.toUpperCase()}`)
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
                    onClick={() => toggleSuscripcion('tenant', t._docId ?? t.id, activo)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
                      ${activo
                        ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                        : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`}>
                    {activo ? '🔒 Suspender' : '✅ Reactivar'}
                  </button>
                </div>

                {/* Medidor de pacientes */}
                <div className="mt-2">
                  <MedidorPacientes tenantId={String(t._docId ?? t.id)} plan={t.plan ?? 'pro'} />
                </div>
              </div>
            )
          })}

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

          {/* ── 1. Parámetros globales — ARRIBA ── */}
          <ConfigPlanes />
          <ConfigDocVias />

          {/* ── 2. Configuración IA por consultorio ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              🤖 Funciones de Inteligencia Artificial por consultorio
            </p>
            <div className="space-y-3">
              {tenants.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                    <p className="text-xs text-gray-400 font-mono">{t.id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">IA pre-consulta:</span>
                    <button
                      onClick={async () => {
                        const actual = t.iaPreConsultaActivo !== false
                        await updateDoc(doc(db, `tenants/${t.id}`), {
                          iaPreConsultaActivo: !actual
                        })
                        toast.success(`IA ${!actual ? 'activada' : 'desactivada'} para ${t.nombre}`)
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${t.iaPreConsultaActivo !== false ? 'bg-teal-600' : 'bg-gray-200'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                        ${t.iaPreConsultaActivo !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className={`text-xs font-medium ${t.iaPreConsultaActivo !== false ? 'text-teal-600' : 'text-gray-400'}`}>
                      {t.iaPreConsultaActivo !== false ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Cuando está activa, el doctor ve sugerencias de diagnóstico IA al abrir una cita.
              El análisis se guarda en la cita para no repetir consultas.
              Costo aproximado: $0.01 USD por cita analizada.
            </p>
          </div>

          {/* ── Facturapi por consultorio ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">🧾 Facturapi — Configuración por consultorio</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Cada consultorio timbra CFDI 4.0 con su propio RFC y CSD.
                  Crea la organización automáticamente o pega una API key existente.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {tenants.map(t => {
                const tieneKey = !!t.facturapiApiKey
                const estado   = fpStatus[t.id]
                return (
                  <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400 font-mono">{t.id}</span>
                        {t.rfc && <span className="text-xs text-gray-500">RFC: {t.rfc}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tieneKey ? (
                        <>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            ✅ Configurado
                          </span>
                          {t.facturapiOrgId && (
                            <span className="text-xs text-gray-400 font-mono hidden md:block">
                              {t.facturapiOrgId.slice(0,8)}…
                            </span>
                          )}
                          <button
                            onClick={() => limpiarFacturapi(t)}
                            className="text-xs text-red-400 hover:text-red-600 hover:underline">
                            Quitar
                          </button>
                        </>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          Sin configurar
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setFpModal(t)
                          setFpForm({
                            rfc:          t.rfc ?? '',
                            nombreLegal:  t.nombreDoctor ?? t.nombre ?? '',
                            cp:           t.cp ?? '',
                            regimen:      '612',
                            apiKeyManual: '',
                          })
                        }}
                        className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
                        {tieneKey ? '✏️ Editar' : '⚙️ Configurar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                <strong>¿Cómo funciona?</strong> Al configurar, DocVia crea una organización en tu cuenta
                de Facturapi vinculada al RFC del doctor. Cada CFDI se timbra usando esa organización,
                por lo que el XML lleva el RFC del consultorio (no el tuyo). El doctor no ve su API key.
              </p>
            </div>
          </div>

          {/* ── Stripe Connect por consultorio ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-700">💳 Stripe Connect — Pagos en línea</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Los pagos llegan directo a la cuenta del doctor. Configura el Payment Link
                de Stripe de cada consultorio.
              </p>
            </div>
            <div className="space-y-3">
              {tenants.map(t => (
                <StripeRow key={t._docId ?? t.id} tenant={t} />
              ))}
            </div>
            <div className="mt-3 bg-indigo-50 rounded-lg p-3">
              <p className="text-xs text-indigo-700">
                <strong>¿Cómo obtener el Payment Link?</strong> El doctor entra a
                stripe.com → Payment Links → Crea un link con precio variable →
                Copia la URL (empieza con buy.stripe.com/...) y la pegas aquí.
                Los cobros aparecerán directo en su cuenta de Stripe.
              </p>
            </div>
          </div>

          {/* Plantillas de receta por consultorio */}
          <PlantillasReceta tenants={tenants} />

          {/* ── Importar pacientes CSV (parte del onboarding) ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">📥 Importar pacientes CSV</p>
            <p className="text-xs text-gray-400 mb-3">
              Sube el padrón de pacientes durante la configuración inicial del consultorio.
              Asegúrate de tener seleccionado el consultorio correcto en el menú superior.
            </p>
            <a href="/importar"
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white
                         text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors">
              📥 Ir al módulo de importación
            </a>
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Formato CSV requerido:</p>
              <p className="text-xs text-gray-400 font-mono">
                nombre, apellidos, telefono, email, fechaNacimiento, sexo, rfc, cp
              </p>
            </div>
          </div>

          {/* ── Mapa del sistema — ABAJO ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="w-full flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">🗺️ Arquitectura del sistema</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Mapa completo: BD, hosting, servicios satélite y flujo de datos
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {/* Stack principal */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { icon:'🔥', label:'Firebase (Google Cloud)', sub:'Firestore · Auth · Storage', color:'bg-orange-50 border-orange-200', txt:'text-orange-800' },
                  { icon:'▲', label:'Vercel (Hosting + API)', sub:'React SPA · Serverless Functions · Cron Jobs', color:'bg-gray-50 border-gray-200', txt:'text-gray-800' },
                  { icon:'🐙', label:'GitHub (CI/CD)', sub:'felipecha79/koreall-medicos · branch main → auto-deploy', color:'bg-slate-50 border-slate-200', txt:'text-slate-800' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
                    <p className={`text-sm font-semibold ${s.txt}`}>{s.icon} {s.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Servicios satélite */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Servicios satélite</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { icon:'🧾', label:'Facturapi', sub:'CFDI 4.0 · Multi-org', color:'bg-teal-50' },
                  { icon:'💳', label:'Stripe Connect', sub:'Pagos paciente → doctor', color:'bg-indigo-50' },
                  { icon:'💬', label:'Twilio', sub:'WhatsApp · 10 notif.', color:'bg-red-50' },
                  { icon:'📧', label:'SendGrid', sub:'Emails automáticos', color:'bg-blue-50' },
                  { icon:'🤖', label:'Anthropic', sub:'Claude Haiku · IA pre-consulta', color:'bg-purple-50' },
                  { icon:'📹', label:'Whereby / Jitsi', sub:'Telemedicina gratuita', color:'bg-green-50' },
                  { icon:'📹', label:'Daily.co', sub:'Telemedicina premium', color:'bg-cyan-50' },
                  { icon:'🌐', label:'SAT México', sub:'Timbrado vía Facturapi', color:'bg-amber-50' },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg p-2.5 ${s.color}`}>
                    <p className="text-xs font-semibold text-gray-700">{s.icon} {s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Estructura Firestore */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estructura de datos (Firestore)</p>
              <div className="font-mono text-xs bg-gray-50 rounded-xl p-4 leading-6 text-gray-700 overflow-x-auto">
                <p><span className="text-purple-600 font-bold">organizaciones/</span><span className="text-gray-400">{'{'+'orgId'+'}'}</span></p>
                <p className="pl-4 text-gray-500">tipo: consultorio | clinica | hospital | franquicia</p>
                <p className="pl-4 text-gray-500">plan: starter | basico | pro | clinica | enterprise</p>
                <p className="pl-4 text-gray-500">mrr, tenantIds[], activo, suscripcionActiva</p>
                <br/>
                <p><span className="text-teal-600 font-bold">tenants/</span><span className="text-gray-400">{'{'+'tenantId'+'}'}</span></p>
                <p className="pl-4 text-gray-500">orgId → org padre · nombreDoctor · rfc · plan</p>
                <p className="pl-4 text-gray-500">facturapiApiKey · stripePaymentLink · wherebyRoomUrl</p>
                <p className="pl-4 text-gray-500">suscripcionActiva · fechaProximoPago · diasGracia</p>
                <p className="pl-4 text-teal-500 font-bold">  ├── pacientes/ · citas/ · consultas/</p>
                <p className="pl-4 text-teal-500 font-bold">  ├── cobros/ · facturas/ · recetas/</p>
                <p className="pl-4 text-teal-500 font-bold">  ├── usuarios/ · facturas_docvias/</p>
                <p className="pl-4 text-teal-500 font-bold">  └── encuestas/ · documentos/</p>
                <br/>
                <p><span className="text-blue-600 font-bold">configuracion/</span></p>
                <p className="pl-4 text-gray-500">docvias → RFC, datos fiscales, Stripe, precios</p>
                <p className="pl-4 text-gray-500">planes → precios editables por plan</p>
                <br/>
                <p><span className="text-amber-600 font-bold">claims_pendientes/</span><span className="text-gray-400">{'{'+'uid'+'}'}</span></p>
                <p className="pl-4 text-gray-500">rol · tenantId · procesado · ts</p>
              </div>

              {/* Flujo de datos */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Flujo principal de datos</p>
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1.5">
                <p>1. <strong>Paciente agenda cita</strong> → Portal paciente → Firestore citas/</p>
                <p>2. <strong>WhatsApp automático</strong> → Twilio → Paciente confirma</p>
                <p>3. <strong>Doctor atiende</strong> → Expediente SOAP NOM-004 → Firestore consultas/</p>
                <p>4. <strong>Cobro generado</strong> → Doctor marca pagado o Paciente paga con Stripe</p>
                <p>5. <strong>Factura CFDI</strong> → Facturapi → SAT → PDF/XML en portal paciente</p>
                <p>6. <strong>Día 1 c/mes</strong> → Cron Vercel → CFDI suscripción DocVia → WA al doctor</p>
                <p>7. <strong>Pago suscripción</strong> → Stripe → Webhook → suscripcionActiva = true</p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-700">
                <strong>Regla de aislamiento multi-tenant:</strong> Las Firestore Security Rules garantizan que
                cada consultorio solo accede a sus propios datos. El SuperAdmin tiene acceso global.
                Un consultorio independiente tiene orgId === tenantId.
              </div>
            </div>
          </div>

          {/* ── Usuarios — sin scripts requeridos ── */}
          <div className="bg-green-50 rounded-xl border border-green-200 p-4">
            <p className="text-sm font-semibold text-green-800">✅ Usuarios — Gestión desde la app</p>
            <p className="text-xs text-green-700 mt-1">
              Los usuarios se crean desde <strong>Admin → Usuarios</strong> o desde el módulo
              <strong> Usuarios</strong> en el sidebar del consultorio. El sistema asigna los claims
              automáticamente y envía el email de bienvenida. No se requieren scripts.
            </p>
          </div>

        </div>
      )}

      {/* Tab: Usuarios — vista por consultorio para SuperAdmin */}
      {tab === 'Usuarios' && (
        <UsuariosPorConsultorio tenants={tenants} />
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

      {/* Modal: Configurar Facturapi */}
      {fpModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setFpModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1 text-gray-800">
              Configurar Facturapi
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-teal-700">{fpModal.nombre}</span>
              {' '}— el CFDI se timbrará con el RFC de este consultorio.
            </p>

            {/* Opción A: crear automáticamente */}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-teal-800 mb-3">
                Opción A — Crear organización automáticamente en Facturapi
              </p>
              <div className="space-y-3">
                {[
                  ['rfc',         'RFC del doctor/empresa *', 'XAXX010101000'],
                  ['nombreLegal', 'Nombre legal (como en el SAT) *', 'JUAN CHAVEZ LOPEZ'],
                  ['cp',          'Código Postal fiscal *', '89000'],
                ].map(([field, label, ph]) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="text" value={fpForm[field]}
                      onChange={e => setFpForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={ph}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono uppercase" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Régimen fiscal</label>
                  <select value={fpForm.regimen}
                    onChange={e => setFpForm(f => ({ ...f, regimen: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400">
                    <option value="612">612 — Personas Físicas Act. Empresariales</option>
                    <option value="616">616 — Sin obligaciones fiscales (RESICO)</option>
                    <option value="625">625 — Régimen de las Act. Empresariales (RIF)</option>
                    <option value="621">621 — Incorporación Fiscal</option>
                    <option value="601">601 — General de Ley Personas Morales</option>
                  </select>
                </div>
                <button
                  onClick={() => configurarFacturapi(fpModal)}
                  disabled={fpLoading || !!fpForm.apiKeyManual}
                  className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium
                             hover:bg-teal-700 disabled:opacity-50 transition-colors">
                  {fpLoading ? '⏳ Creando en Facturapi...' : '🧾 Crear organización y guardar key'}
                </button>
              </div>
            </div>

            {/* Divisor */}
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs text-gray-400">o bien</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Opción B: pegar key manualmente */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">
                Opción B — Pegar API key de organización ya existente en Facturapi
              </p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  API Key de la organización (sk_live_… o sk_test_…)
                </label>
                <input type="password" value={fpForm.apiKeyManual}
                  onChange={e => setFpForm(f => ({ ...f, apiKeyManual: e.target.value }))}
                  placeholder="sk_live_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <p className="text-xs text-gray-400 mt-1">
                  Encuéntrala en Facturapi Dashboard → Organizaciones → tu org → API Keys
                </p>
              </div>
              <button
                onClick={() => configurarFacturapi(fpModal)}
                disabled={fpLoading || !fpForm.apiKeyManual}
                className="w-full mt-3 bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium
                           hover:bg-gray-800 disabled:opacity-50 transition-colors">
                {fpLoading ? '⏳ Guardando...' : '💾 Guardar API key manual'}
              </button>
            </div>

            <button onClick={() => setFpModal(null)}
              className="w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200 transition-colors">
              Cancelar
            </button>
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
                ['rfc','RFC del doctor (para facturación)'],
                ['cp','Código Postal fiscal'],
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
