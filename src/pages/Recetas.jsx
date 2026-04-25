import { useState, useEffect, useRef } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, Timestamp, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// Buscador de pacientes
function BuscadorPaciente({ tenantId, onSelect }) {
  const [texto,     setTexto]   = useState('')
  const [resultados, setRes]    = useState([])
  const [abierto,   setAbierto] = useState(false)

  const buscar = async val => {
    setTexto(val)
    if (val.length < 2) { setRes([]); return }
    const snap = await getDocs(collection(db, `tenants/${tenantId}/pacientes`))
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    setRes(todos.filter(p =>
      `${p.nombre} ${p.apellidos} ${p.pacienteId ?? ''}`
        .toLowerCase().includes(val.toLowerCase())
    ).slice(0, 6))
    setAbierto(true)
  }

  const seleccionar = p => {
    setTexto(`${p.nombre} ${p.apellidos}`)
    setAbierto(false)
    onSelect(p)
  }

  return (
    <div className="relative">
      <input type="text" value={texto}
        placeholder="Buscar paciente por nombre o ID..."
        onChange={e => buscar(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-400" />
      {abierto && resultados.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border
                        border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {resultados.map(p => (
            <button key={p.id} onClick={() => seleccionar(p)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50
                         border-b border-gray-100 last:border-0">
              <span className="font-mono text-xs bg-teal-50 text-teal-700
                               px-1.5 py-0.5 rounded mr-2">{p.pacienteId}</span>
              <span className="text-sm">{p.nombre} {p.apellidos}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Línea de medicamento
function LineaMedicamento({ index, data, onChange, onRemove }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-teal-700">
          Medicamento {index + 1}
        </span>
        <button onClick={onRemove}
          className="text-xs text-red-400 hover:text-red-600">✕ Eliminar</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          ['medicamento', 'Medicamento *',           'text'],
          ['dosis',       'Dosis (ej: 500 mg)',       'text'],
          ['via',         'Vía (oral/IM/IV/tópica)',  'text'],
          ['frecuencia',  'Frecuencia (ej: c/8h)',    'text'],
          ['duracion',    'Duración (ej: 7 días)',    'text'],
          ['cantidad',    'Cantidad a dispensar',     'text'],
        ].map(([field, label]) => (
          <div key={field}>
            <label className="block text-xs text-gray-400 mb-0.5">{label}</label>
            <input type="text" value={data[field] ?? ''}
              onChange={e => onChange(field, e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm
                         focus:outline-none focus:ring-1 focus:ring-teal-400" />
          </div>
        ))}
        <div className="col-span-full">
          <label className="block text-xs text-gray-400 mb-0.5">Indicaciones adicionales</label>
          <input type="text" value={data.indicaciones ?? ''}
            onChange={e => onChange('indicaciones', e.target.value)}
            placeholder="Tomar con alimentos, no suspender..."
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm
                       focus:outline-none focus:ring-1 focus:ring-teal-400" />
        </div>
      </div>
    </div>
  )
}

// Vista previa imprimible de la receta
function RecetaPreview({ receta, tenant }) {
  const fecha = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })

  return (
    <div id="receta-print"
      style={{
        fontFamily: 'Arial, sans-serif',
        maxWidth: 700,
        margin: '0 auto',
        padding: '24px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
        fontSize: 13,
        color: '#1f2937',
      }}>

      {/* Encabezado */}
      <div style={{ borderBottom: '2px solid #028090', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0D2240' }}>
              {tenant?.nombreDoctor ?? 'Dr. '}
            </h2>
            <p style={{ margin: '2px 0', color: '#028090', fontWeight: 500 }}>
              {tenant?.especialidad ?? 'Médico General'}
            </p>
            <p style={{ margin: '2px 0', color: '#6b7280', fontSize: 11 }}>
              Cédula Profesional: {tenant?.cedula ?? '________'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '2px 0', color: '#6b7280', fontSize: 11 }}>
              {tenant?.direccion ?? 'Dirección del consultorio'}
            </p>
            <p style={{ margin: '2px 0', color: '#6b7280', fontSize: 11 }}>
              Tel: {tenant?.telefono ?? ''}
            </p>
            <p style={{ margin: '4px 0', fontSize: 11, color: '#9ca3af' }}>
              No. Receta: {receta.numero}
            </p>
          </div>
        </div>
      </div>

      {/* Datos del paciente */}
      <div style={{
        background: '#f8fafc', borderRadius: 6, padding: '10px 14px',
        marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8
      }}>
        <div>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>PACIENTE</span>
          <p style={{ margin: 0, fontWeight: 600 }}>{receta.pacienteNombre}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
            ID: {receta.pacienteIdLegible}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>FECHA</span>
          <p style={{ margin: 0, fontWeight: 500 }}>{fecha}</p>
          {receta.diagnostico && (
            <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
              Dx: {receta.diagnostico}
            </p>
          )}
        </div>
      </div>

      {/* Medicamentos */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                    letterSpacing: '0.08em', marginBottom: 8 }}>
          PRESCRIPCIÓN
        </p>
        {receta.medicamentos.map((med, i) => (
          <div key={i} style={{
            borderLeft: '3px solid #028090', paddingLeft: 12,
            marginBottom: 12
          }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
              {i + 1}. {med.medicamento}
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 3 }}>
              {med.dosis      && <span style={{ fontSize: 12, color: '#374151' }}>Dosis: <b>{med.dosis}</b></span>}
              {med.via        && <span style={{ fontSize: 12, color: '#374151' }}>Vía: <b>{med.via}</b></span>}
              {med.frecuencia && <span style={{ fontSize: 12, color: '#374151' }}>Cada: <b>{med.frecuencia}</b></span>}
              {med.duracion   && <span style={{ fontSize: 12, color: '#374151' }}>Por: <b>{med.duracion}</b></span>}
              {med.cantidad   && <span style={{ fontSize: 12, color: '#374151' }}>Cantidad: <b>{med.cantidad}</b></span>}
            </div>
            {med.indicaciones && (
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                {med.indicaciones}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Indicaciones generales */}
      {receta.indicacionesGenerales && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 6, padding: '8px 12px', marginBottom: 16
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>
            INDICACIONES GENERALES
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#78350f' }}>
            {receta.indicacionesGenerales}
          </p>
        </div>
      )}

      {/* Próxima cita */}
      {receta.proximaCita && (
        <p style={{ fontSize: 12, color: '#374151', marginBottom: 16 }}>
          📅 <b>Próxima cita:</b> {receta.proximaCita}
        </p>
      )}

      {/* Firma */}
      <div style={{
        borderTop: '1px solid #e5e7eb', paddingTop: 16,
        display: 'flex', justifyContent: 'flex-end'
      }}>
        <div style={{ textAlign: 'center', width: 200 }}>
          <div style={{
            borderTop: '1px solid #374151', paddingTop: 6, marginTop: 40
          }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
              {tenant?.nombreDoctor}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
              Cédula: {tenant?.cedula ?? '________'}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
              {tenant?.especialidad}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 8,
        textAlign: 'center', fontSize: 10, color: '#9ca3af'
      }}>
        Receta generada por MediDesk · {tenant?.nombre} · {fecha}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────
const MED_VACIO = {
  medicamento:'', dosis:'', via:'oral', frecuencia:'',
  duracion:'', cantidad:'', indicaciones:''
}

export default function Recetas() {
  const { tenantId, tenant } = useTenant()
  const [recetas,  setRecetas]  = useState([])
  const [modal,    setModal]    = useState(false)
  const [preview,  setPreview]  = useState(null)
  const [saving,   setSaving]   = useState(false)

  const [form, setForm] = useState({
    pacienteId: '', pacienteIdLegible: '', pacienteNombre: '',
    diagnostico: '', indicacionesGenerales: '', proximaCita: '',
    medicamentos: [{ ...MED_VACIO }],
  })

  useEffect(() => {
    if (!tenantId) return
    const q = query(
      collection(db, `tenants/${tenantId}/recetas`),
      orderBy('fecha', 'desc')
    )
    return onSnapshot(q, snap =>
      setRecetas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  const agregarMed = () =>
    setForm(f => ({ ...f, medicamentos: [...f.medicamentos, { ...MED_VACIO }] }))

  const actualizarMed = (i, field, val) =>
    setForm(f => {
      const meds = [...f.medicamentos]
      meds[i] = { ...meds[i], [field]: val }
      return { ...f, medicamentos: meds }
    })

  const eliminarMed = i =>
    setForm(f => ({
      ...f,
      medicamentos: f.medicamentos.filter((_, idx) => idx !== i)
    }))

  const guardar = async () => {
    if (!form.pacienteId) { toast.error('Selecciona un paciente'); return }
    if (!form.medicamentos[0]?.medicamento) {
      toast.error('Agrega al menos un medicamento'); return
    }
    setSaving(true)
    try {
      const numero = `RX-${Date.now().toString().slice(-6)}`
      const receta = { ...form, numero, tenantId, fecha: Timestamp.now() }
      await addDoc(collection(db, `tenants/${tenantId}/recetas`), receta)
      toast.success('Receta guardada ✓')
      setPreview(receta)
      setModal(false)
      setForm({
        pacienteId:'', pacienteIdLegible:'', pacienteNombre:'',
        diagnostico:'', indicacionesGenerales:'', proximaCita:'',
        medicamentos:[{ ...MED_VACIO }],
      })
    } catch(e) {
      console.error(e); toast.error('Error al guardar')
    } finally { setSaving(false) }
  }

  const imprimir = () => {
    const contenido = document.getElementById('receta-print').innerHTML
    const ventana = window.open('', '_blank', 'width=800,height=900')
    ventana.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Receta Médica</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          @media print {
            body { padding: 0; }
            button { display: none !important; }
          }
        </style>
      </head>
      <body>${contenido}</body>
      </html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print() }, 500)
  }

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Recetas médicas</h2>
          <p className="text-sm text-gray-400">{recetas.length} emitidas</p>
        </div>
        <button onClick={() => setModal(true)}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Nueva receta
        </button>
      </div>

      {/* Lista de recetas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        {recetas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-sm">Sin recetas emitidas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['No. Receta','Paciente','Fecha','Medicamentos','Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                           text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recetas.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-teal-700">
                      {r.numero}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <div>{r.pacienteNombre}</div>
                      <div className="text-xs text-gray-400">{r.pacienteIdLegible}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {format(r.fecha.toDate(), "d MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.medicamentos?.map(m => m.medicamento).filter(Boolean).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setPreview(r)}
                          className="text-xs text-teal-600 hover:underline">
                          Ver / Imprimir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vista previa activa */}
      {preview && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Vista previa — {preview.numero}
            </h3>
            <div className="flex gap-2">
              <button onClick={imprimir}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                           rounded-lg hover:bg-teal-700 transition-colors">
                🖨 Imprimir / Guardar PDF
              </button>
              <button onClick={() => setPreview(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm
                           rounded-lg hover:bg-gray-200 transition-colors">
                Cerrar vista previa
              </button>
            </div>
          </div>
          <RecetaPreview receta={preview} tenant={tenant} />
        </div>
      )}

      {/* Modal nueva receta */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl
                          max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nueva receta médica</h3>

            <div className="space-y-4">
              {/* Paciente */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Paciente *
                </label>
                {tenantId && (
                  <BuscadorPaciente tenantId={tenantId}
                    onSelect={p => setForm(f => ({
                      ...f,
                      pacienteId:        p.id,
                      pacienteIdLegible: p.pacienteId ?? '',
                      pacienteNombre:    `${p.nombre} ${p.apellidos}`,
                    }))} />
                )}
                {form.pacienteId && (
                  <p className="text-xs text-teal-600 mt-1">
                    ✓ {form.pacienteIdLegible} — {form.pacienteNombre}
                  </p>
                )}
              </div>

              {/* Diagnóstico */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Diagnóstico (opcional — aparece en la receta)
                </label>
                <input type="text" value={form.diagnostico}
                  onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>

              {/* Medicamentos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">
                    Medicamentos *
                  </label>
                  <button onClick={agregarMed}
                    className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                    + Agregar medicamento
                  </button>
                </div>
                {form.medicamentos.map((med, i) => (
                  <LineaMedicamento key={i} index={i} data={med}
                    onChange={(field, val) => actualizarMed(i, field, val)}
                    onRemove={() => eliminarMed(i)} />
                ))}
              </div>

              {/* Indicaciones generales */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Indicaciones generales
                </label>
                <textarea value={form.indicacionesGenerales} rows={2}
                  onChange={e => setForm(f => ({ ...f, indicacionesGenerales: e.target.value }))}
                  placeholder="Reposo, dieta, cuidados especiales..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>

              {/* Próxima cita */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Próxima cita (opcional)
                </label>
                <input type="text" value={form.proximaCita}
                  onChange={e => setForm(f => ({ ...f, proximaCita: e.target.value }))}
                  placeholder="En 7 días, 15 de mayo 2026..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={guardar} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Guardar y ver receta'}
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
