// src/components/PacientesSinCita.jsx
// Reporte de pacientes con última cita pero sin cita futura + envío de WA
import { useState, useEffect } from 'react'
import {
  collection, getDocs, query, orderBy, where, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { enviarWA } from '../services/whatsapp'
import toast from 'react-hot-toast'

// ── Mensajes de WhatsApp predefinidos ─────────────────────
const PLANTILLAS_WA = [
  {
    id: 'te_extranamos',
    label: '👋 Te extrañamos',
    texto: (nombre, dias, consultorio) =>
      `Hola ${nombre} 👋\n\n` +
      `Han pasado ${dias} días desde tu última visita al ${consultorio}.\n\n` +
      `¿Cómo te has sentido? Recuerda que la revisión periódica es importante para mantenerte saludable.\n\n` +
      `Agenda tu cita fácilmente desde nuestro portal o responde este mensaje.\n` +
      `¡Te esperamos! 🏥`,
  },
  {
    id: 'control_cronico',
    label: '💊 Control crónico',
    texto: (nombre, dias, consultorio) =>
      `Hola ${nombre},\n\n` +
      `Notamos que han pasado ${dias} días desde tu última consulta en ${consultorio}.\n\n` +
      `Si tienes un padecimiento crónico como diabetes o hipertensión, es importante mantenerse al día con tus controles.\n\n` +
      `Por favor agenda tu cita a la brevedad. Puedes hacerlo desde tu portal de paciente o llamándonos directamente.\n` +
      `Cuídate mucho 💙`,
  },
  {
    id: 'recordatorio_simple',
    label: '📅 Recordatorio simple',
    texto: (nombre, _dias, consultorio) =>
      `Hola ${nombre} 🙂\n\n` +
      `Te escribimos del ${consultorio} para recordarte que tienes pendiente agendar tu próxima consulta.\n\n` +
      `Cuando gustes, contáctanos o agenda desde tu portal.\n¡Saludos!`,
  },
]

// ── Colores por días sin cita ──────────────────────────────
function badgeDias(dias) {
  if (dias >= 90)  return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Crítico' }
  if (dias >= 60)  return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Urgente' }
  if (dias >= 30)  return { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Atención' }
  return           { bg: 'bg-blue-50',    text: 'text-blue-600',   label: 'Reciente' }
}

export default function PacientesSinCita({
  tenantId, filtroMinDias, setFiltroMinDias
}) {
  const [lista,         setLista]         = useState([])
  const [loading,       setLoading]       = useState(false)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [plantilla,     setPlantilla]     = useState('te_extranamos')
  const [enviando,      setEnviando]      = useState(false)
  const [consultorio,   setConsultorio]   = useState('el consultorio')
  const [busqueda,      setBusqueda]      = useState('')

  useEffect(() => {
    if (tenantId) cargarDatos()
  }, [tenantId, filtroMinDias])

  // Auto-cargar al abrir el tab (si ya tiene tenantId y lista vacía)
  useEffect(() => {
    if (tenantId && lista.length === 0) cargarDatos()
  }, [tenantId])

  const cargarDatos = async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const hoy = new Date()

      // Cargar todos los pacientes
      const pacSnap = await getDocs(
        query(collection(db, `tenants/${tenantId}/pacientes`), orderBy('creadoEn', 'desc'))
      )
      const pacientes = pacSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Cargar todas las citas
      const citaSnap = await getDocs(
        query(collection(db, `tenants/${tenantId}/citas`), orderBy('fecha', 'desc'))
      )
      const citas = citaSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Cargar nombre del tenant para el mensaje
      const tenantDoc = await getDocs(query(collection(db, 'tenants'), where('__name__', '==', tenantId)))
      if (!tenantDoc.empty) setConsultorio(tenantDoc.docs[0].data().nombre ?? 'el consultorio')

      const resultado = []

      for (const pac of pacientes) {
        const citasPac = citas.filter(c => c.pacienteId === pac.id)
        if (citasPac.length === 0) continue // nunca ha tenido cita

        // Ordenar citas por fecha
        const citasOrdenadas = citasPac.sort((a, b) => {
          const fa = a.fecha?.seconds ?? 0
          const fb = b.fecha?.seconds ?? 0
          return fb - fa
        })

        // Última cita (pasada o presente)
        const citasPasadas = citasOrdenadas.filter(c => {
          try {
            const f = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha?.seconds * 1000)
            return f <= hoy && !['cancelada', 'no_show'].includes(c.estatus)
          } catch { return false }
        })

        if (citasPasadas.length === 0) continue

        const ultimaCita = citasPasadas[0]
        const fechaUltima = ultimaCita.fecha?.toDate
          ? ultimaCita.fecha.toDate()
          : new Date((ultimaCita.fecha?.seconds ?? 0) * 1000)

        const diasSinCita = differenceInDays(hoy, fechaUltima)

        // Tiene cita futura?
        const tieneCitaFutura = citasOrdenadas.some(c => {
          try {
            const f = c.fecha?.toDate ? c.fecha.toDate() : new Date(c.fecha?.seconds * 1000)
            return f > hoy && !['cancelada', 'no_show'].includes(c.estatus)
          } catch { return false }
        })

        if (tieneCitaFutura) continue // ya tiene cita agendada — no incluir
        if (diasSinCita < filtroMinDias) continue // reciente — no incluir

        resultado.push({
          ...pac,
          ultimaCita: fechaUltima,
          diasSinCita,
          totalCitas: citasPasadas.length,
        })
      }

      // Ordenar por más días sin cita primero
      resultado.sort((a, b) => b.diasSinCita - a.diasSinCita)
      setLista(resultado)
    } catch(e) {
      console.error(e)
      toast.error('Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const seleccionarTodos = () => {
    if (seleccionados.size === listaFiltrada.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(listaFiltrada.map(p => p.id)))
    }
  }

  const enviarWAMasivo = async () => {
    const destinos = listaFiltrada.filter(p => seleccionados.has(p.id))
    if (destinos.length === 0) { toast.error('Selecciona al menos un paciente'); return }

    const plantillaObj = PLANTILLAS_WA.find(p => p.id === plantilla)
    if (!plantillaObj) return

    setEnviando(true)
    let ok = 0, fail = 0

    for (const pac of destinos) {
      if (!pac.telefono) { fail++; continue }
      const mensaje = plantillaObj.texto(pac.nombre, pac.diasSinCita, consultorio)
      const res = await enviarWA(pac.telefono, mensaje)
      if (res.ok) ok++
      else fail++
      await new Promise(r => setTimeout(r, 300)) // throttle
    }

    setEnviando(false)
    if (ok > 0)   toast.success(`✓ ${ok} mensajes enviados`)
    if (fail > 0) toast.error(`${fail} no se pudieron enviar (sin teléfono o error)`)
    setSeleccionados(new Set())
  }

  const exportarCSV = () => {
    const datos = listaFiltrada.map(p => ({
      Nombre:          `${p.nombre} ${p.apellidos}`,
      Telefono:        p.telefono ?? '',
      Email:           p.email ?? '',
      UltimaCita:      format(p.ultimaCita, 'dd/MM/yyyy', { locale: es }),
      DiasSinCita:     p.diasSinCita,
      TotalConsultas:  p.totalCitas,
      Prioridad:       p.diasSinCita >= 90 ? 'Crítico' : p.diasSinCita >= 60 ? 'Urgente' : 'Atención',
    }))
    const cols = Object.keys(datos[0])
    const csv = '\uFEFF' + [cols.join(','), ...datos.map(r => cols.map(c => r[c]).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `Seguimiento_Pacientes_${format(new Date(),'yyyyMMdd')}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }

  const listaFiltrada = lista.filter(p => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return `${p.nombre} ${p.apellidos} ${p.telefono ?? ''} ${p.email ?? ''}`
      .toLowerCase().includes(q)
  })

  // KPIs
  const criticos = listaFiltrada.filter(p => p.diasSinCita >= 90).length
  const urgentes = listaFiltrada.filter(p => p.diasSinCita >= 60 && p.diasSinCita < 90).length
  const conTelefono = listaFiltrada.filter(p => p.telefono).length

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { l:'Sin cita futura', v: listaFiltrada.length, c:'text-gray-800', bg:'bg-white border' },
          { l:'Críticos (+90 días)', v: criticos, c:'text-red-700', bg:'bg-red-50' },
          { l:'Urgentes (+60 días)', v: urgentes, c:'text-orange-700', bg:'bg-orange-50' },
          { l:'Con teléfono WA', v: conTelefono, c:'text-green-700', bg:'bg-green-50' },
        ].map((k, i) => (
          <div key={i} className={`${k.bg} rounded-xl p-4 border border-gray-100`}>
            <p className="text-xs text-gray-500 mb-1">{k.l}</p>
            <p className={`text-2xl font-bold ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        {/* Filtro días */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[[30,'30+ días'],[60,'60+ días'],[90,'90+ días']].map(([d, l]) => (
            <button key={d} onClick={() => setFiltroMinDias(d)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 first:border-0
                ${filtroMinDias === d ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <input type="text" placeholder="Buscar paciente..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-teal-400" />

        <button onClick={cargarDatos}
          className="px-3 py-2 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
          🔄 Actualizar
        </button>

        <button onClick={exportarCSV} disabled={!listaFiltrada.length}
          className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg
                     hover:bg-green-700 disabled:opacity-40">
          📊 Exportar CSV
        </button>
      </div>

      {/* Panel de envío masivo */}
      {seleccionados.size > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-teal-800">
              {seleccionados.size} paciente{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}
            </span>
            <select value={plantilla} onChange={e => setPlantilla(e.target.value)}
              className="flex-1 min-w-48 border border-teal-300 rounded-lg px-3 py-1.5 text-sm
                         bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
              {PLANTILLAS_WA.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <button onClick={enviarWAMasivo} disabled={enviando}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg
                         hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
              {enviando ? '⏳ Enviando...' : '💬 Enviar WhatsApp'}
            </button>
            <button onClick={() => setSeleccionados(new Set())}
              className="px-3 py-2 bg-white text-gray-500 text-xs rounded-lg border border-gray-200">
              ✕ Cancelar
            </button>
          </div>

          {/* Preview del mensaje */}
          {PLANTILLAS_WA.find(p => p.id === plantilla) && (
            <div className="mt-3 bg-white rounded-lg p-3 border border-teal-200">
              <p className="text-xs text-gray-400 mb-1">Vista previa del mensaje:</p>
              <p className="text-xs text-gray-700 whitespace-pre-line font-mono leading-5">
                {PLANTILLAS_WA.find(p => p.id === plantilla).texto(
                  seleccionados.size === 1
                    ? (listaFiltrada.find(p => seleccionados.has(p.id))?.nombre ?? 'Paciente')
                    : '[Nombre del paciente]',
                  listaFiltrada.find(p => seleccionados.has(p.id))?.diasSinCita ?? 30,
                  consultorio
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Analizando citas y pacientes...</p>
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-medium text-gray-700">
            {lista.length === 0
              ? 'Sin datos — da clic en Actualizar'
              : `¡Todos los pacientes tienen cita futura agendada! (filtro: +${filtroMinDias} días)`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5">
                    <input type="checkbox"
                      checked={seleccionados.size === listaFiltrada.length && listaFiltrada.length > 0}
                      onChange={seleccionarTodos}
                      className="w-4 h-4 accent-teal-600" />
                  </th>
                  {['Paciente','Teléfono','Última cita','Días sin cita','Prioridad','Total citas','WhatsApp'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listaFiltrada.map(pac => {
                  const badge = badgeDias(pac.diasSinCita)
                  return (
                    <tr key={pac.id}
                      className={`hover:bg-gray-50 ${seleccionados.has(pac.id) ? 'bg-teal-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox"
                          checked={seleccionados.has(pac.id)}
                          onChange={() => toggleSeleccion(pac.id)}
                          className="w-4 h-4 accent-teal-600" />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-medium text-gray-800">
                          {pac.nombre} {pac.apellidos}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{pac.pacienteId}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        {pac.telefono
                          ? <a href={`tel:${pac.telefono}`} className="text-teal-600 hover:underline">{pac.telefono}</a>
                          : <span className="text-gray-300 italic">Sin teléfono</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {format(pac.ultimaCita, "d 'de' MMM yyyy", { locale: es })}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-lg font-bold ${badge.text}`}>
                          {pac.diasSinCita}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">días</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {pac.totalCitas} consulta{pac.totalCitas !== 1 ? 's' : ''}
                      </td>
                      <td className="px-3 py-3">
                        {pac.telefono ? (
                          <button
                            onClick={async () => {
                              const pl = PLANTILLAS_WA.find(p => p.id === plantilla) ?? PLANTILLAS_WA[0]
                              const msg = pl.texto(pac.nombre, pac.diasSinCita, consultorio)
                              const res = await enviarWA(pac.telefono, msg)
                              if (res.ok) toast.success(`✓ WA enviado a ${pac.nombre}`)
                              else toast.error('No se pudo enviar')
                            }}
                            className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200
                                       rounded-lg text-xs hover:bg-green-100 transition-colors font-medium">
                            💬 Enviar
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
            <p className="text-xs text-gray-500">
              {listaFiltrada.length} paciente{listaFiltrada.length !== 1 ? 's' : ''} sin cita futura
              (de {lista.length} con historial de citas)
            </p>
            {listaFiltrada.some(p => p.telefono) && (
              <button onClick={() => {
                const conTel = listaFiltrada.filter(p => p.telefono && p.diasSinCita >= 60)
                setSeleccionados(new Set(conTel.map(p => p.id)))
                toast(`${conTel.length} pacientes urgentes seleccionados`)
              }}
                className="text-xs text-teal-600 hover:underline">
                Seleccionar urgentes y críticos con teléfono
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
