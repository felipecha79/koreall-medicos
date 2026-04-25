import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, Timestamp, getDocs
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import toast from 'react-hot-toast'

const FORM_INICIAL = {
  nombre: '', apellidos: '', telefono: '', email: '',
  rfc: '', fechaNacimiento: '', sexo: 'M',
  grupoSanguineo: '', alergias: '', notas: '',
}

async function generarPacienteId(tenantId) {
  const snap = await getDocs(collection(db, `tenants/${tenantId}/pacientes`))
  const num = snap.size + 1
  return `PAC-${String(num).padStart(5, '0')}`
}

export default function Pacientes() {
  const { tenantId } = useTenant()
  const navigate = useNavigate()
  const [pacientes, setPacientes] = useState([])
  const [busqueda, setBusqueda]   = useState('')
  const [modal,  setModal]        = useState(false)
  const [form,   setForm]         = useState(FORM_INICIAL)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    if (!tenantId) return
    const q = query(
      collection(db, `tenants/${tenantId}/pacientes`),
      orderBy('apellidos')
    )
    return onSnapshot(q, snap =>
      setPacientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  const filtrados = pacientes.filter(p =>
    `${p.nombre} ${p.apellidos} ${p.telefono} ${p.pacienteId ?? ''}`
      .toLowerCase().includes(busqueda.toLowerCase())
  )

  const guardar = async () => {
    if (!form.nombre || !form.apellidos) {
      toast.error('Nombre y apellidos son obligatorios'); return
    }
    setSaving(true)
    try {
      const pacienteId = await generarPacienteId(tenantId)
      await addDoc(collection(db, `tenants/${tenantId}/pacientes`), {
        ...form, pacienteId, tenantId, creadoEn: Timestamp.now(),
      })
      toast.success(`Paciente registrado — ID: ${pacienteId}`)
      setModal(false); setForm(FORM_INICIAL)
    } catch (e) {
      console.error(e); toast.error('Error al guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Pacientes</h2>
          <p className="text-sm text-gray-400">{pacientes.length} registrados</p>
        </div>
        <button onClick={() => { setForm(FORM_INICIAL); setModal(true) }}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Nuevo paciente
        </button>
      </div>

      <input type="text" placeholder="Buscar por nombre, apellido o ID (PAC-XXXXX)..."
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2.5
                   text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400" />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">👤</p>
            <p className="text-sm">No hay pacientes registrados aún</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['ID', 'Nombre', 'Teléfono', 'RFC', 'Expediente'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                         text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/pacientes/${p.id}`)}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-teal-50 text-teal-700
                                     px-2 py-0.5 rounded border border-teal-100">
                      {p.pacienteId ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {p.apellidos}, {p.nombre}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.telefono}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.rfc}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-teal-600 hover:underline">Ver →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl
                          max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1 text-gray-800">Nuevo paciente</h3>
            <p className="text-xs text-gray-400 mb-5">El ID (PAC-XXXXX) se asigna automáticamente.</p>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['nombre','Nombre *','text','col-span-1'],
                ['apellidos','Apellidos *','text','col-span-1'],
                ['telefono','Teléfono','tel','col-span-1'],
                ['email','Email','email','col-span-1'],
                ['rfc','RFC (para CFDI)','text','col-span-1'],
                ['fechaNacimiento','Fecha nacimiento','date','col-span-1'],
                ['grupoSanguineo','Grupo sanguíneo','text','col-span-1'],
              ].map(([field, label, type, span]) => (
                <div key={field} className={span}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type={type} value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sexo</label>
                <select value={form.sexo}
                  onChange={e => setForm(f => ({ ...f, sexo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Alergias</label>
                <input type="text" value={form.alergias}
                  onChange={e => setForm(f => ({ ...f, alergias: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notas</label>
                <textarea value={form.notas} rows={2}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={guardar} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Guardar paciente'}
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
