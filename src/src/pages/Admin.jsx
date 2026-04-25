import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import toast from 'react-hot-toast'

const FORM_INICIAL = {
  nombre: '', nombreDoctor: '', especialidad: '',
  telefono: '', email: '', plan: 'pro', rfc: '',
  permitirTraslape: true,
}

export default function Admin() {
  const { isSuperAdmin } = useTenant()
  const [tenants, setTenants] = useState([])
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(FORM_INICIAL)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'tenants'), orderBy('nombre'))
    return onSnapshot(q, snap =>
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [])

  if (!isSuperAdmin) return (
    <div className="p-6 text-center text-gray-400">
      <p className="text-4xl mb-2">🔒</p>
      <p>Acceso solo para administradores</p>
    </div>
  )

  const guardar = async () => {
    if (!form.nombre || !form.email) {
      toast.error('Nombre y email son obligatorios'); return
    }
    setSaving(true)
    try {
      await addDoc(collection(db, 'tenants'), {
        ...form, activo: true, creadoEn: Timestamp.now(),
        horarios: {
          lun: { inicio: '09:00', fin: '17:00' },
          mar: { inicio: '09:00', fin: '17:00' },
          mie: { inicio: '09:00', fin: '17:00' },
          jue: { inicio: '09:00', fin: '17:00' },
          vie: { inicio: '09:00', fin: '17:00' },
        }
      })
      toast.success('Consultorio creado ✓')
      setModal(false); setForm(FORM_INICIAL)
    } catch (e) {
      console.error(e); toast.error('Error al crear consultorio')
    } finally { setSaving(false) }
  }

  const toggleTraslape = async (tenantId, valorActual) => {
    await updateDoc(doc(db, `tenants/${tenantId}`), {
      permitirTraslape: !valorActual
    })
    toast.success(!valorActual
      ? 'Traslapes permitidos en este consultorio'
      : 'Traslapes bloqueados — no se permiten citas a la misma hora'
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Super Admin</h2>
          <p className="text-sm text-gray-400">{tenants.length} consultorios</p>
        </div>
        <button onClick={() => { setForm(FORM_INICIAL); setModal(true) }}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium
                     rounded-lg hover:bg-purple-700 transition-colors">
          + Nuevo consultorio
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Total consultorios</p>
          <p className="text-2xl font-bold text-gray-800">{tenants.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Plan Pro</p>
          <p className="text-2xl font-bold text-purple-600">
            {tenants.filter(t => t.plan === 'pro').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">MRR estimado</p>
          <p className="text-2xl font-bold text-teal-600">
            ${(
              tenants.filter(t => t.plan === 'pro').length * 1200 +
              tenants.filter(t => t.plan === 'basico').length * 800
            ).toLocaleString('es-MX')}
          </p>
        </div>
      </div>

      {/* Tabla consultorios */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Consultorio','Doctor','Plan','Traslapes','Estado'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                       text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{t.nombre}</td>
                <td className="px-4 py-3 text-gray-600">{t.nombreDoctor}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium
                    ${t.plan === 'pro'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-600'}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {/* Toggle de traslapes */}
                  <button onClick={() => toggleTraslape(t.id, t.permitirTraslape ?? true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full
                                transition-colors focus:outline-none
                                ${t.permitirTraslape !== false ? 'bg-teal-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white
                                      transition-transform
                                      ${t.permitirTraslape !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-xs text-gray-400 ml-2">
                    {t.permitirTraslape !== false ? 'Permitidos' : 'Bloqueados'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium
                    ${t.activo
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-600'}`}>
                    {t.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo consultorio */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nuevo consultorio</h3>
            <div className="space-y-3">
              {[
                ['nombre',       'Nombre del consultorio *','text'],
                ['nombreDoctor', 'Nombre del doctor *',     'text'],
                ['especialidad', 'Especialidad',            'text'],
                ['email',        'Email de acceso *',       'email'],
                ['telefono',     'Teléfono',                'tel'],
                ['rfc',          'RFC del consultorio',     'text'],
              ].map(([field, label, type]) => (
                <div key={field}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type={type} value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plan</label>
                <select value={form.plan}
                  onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-purple-400">
                  <option value="basico">Básico — $800/mes</option>
                  <option value="pro">Pro + CFDI — $1,200/mes</option>
                </select>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100 pt-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Permitir traslape de citas</p>
                  <p className="text-xs text-gray-400">Si se desactiva, el sistema bloquea citas a la misma hora</p>
                </div>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, permitirTraslape: !f.permitirTraslape }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full
                              transition-colors focus:outline-none
                              ${form.permitirTraslape ? 'bg-teal-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white
                                    transition-transform
                                    ${form.permitirTraslape ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={guardar} disabled={saving}
                className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {saving ? 'Creando...' : 'Crear consultorio'}
              </button>
              <button onClick={() => setModal(false)}
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
