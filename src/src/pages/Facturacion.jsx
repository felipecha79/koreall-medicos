import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, Timestamp, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import {
  emitirFactura, descargarFactura,
  enviarFacturaPorEmail, cancelarFactura
} from '../services/facturapi'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const ESTATUS_COLOR = {
  valid:     'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
  pending:   'bg-amber-100 text-amber-700 border-amber-200',
}

const ESTATUS_LABEL = {
  valid:     'Timbrada',
  cancelled: 'Cancelada',
  pending:   'Pendiente',
}

export default function Facturacion() {
  const { tenantId, tenant } = useTenant()
  const [cobros,    setCobros]    = useState([])
  const [facturas,  setFacturas]  = useState([])
  const [pacientes, setPacientes] = useState({})
  const [modal,     setModal]     = useState(null) // cobro seleccionado
  const [loading,   setLoading]   = useState(false)
  const [tab,       setTab]       = useState('pendientes')
  const [emailModal, setEmailModal] = useState(null)
  const [emailDest,  setEmailDest]  = useState('')

  // Cargar cobros sin factura
  useEffect(() => {
    if (!tenantId) return
    const q = query(
      collection(db, `tenants/${tenantId}/cobros`),
      orderBy('fechaPago', 'desc')
    )
    return onSnapshot(q, snap =>
      setCobros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  // Cargar facturas emitidas
  useEffect(() => {
    if (!tenantId) return
    const q = query(
      collection(db, `tenants/${tenantId}/facturas`),
      orderBy('fecha', 'desc')
    )
    return onSnapshot(q, snap =>
      setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  // Cargar pacientes para lookup
  useEffect(() => {
    if (!tenantId) return
    getDocs(collection(db, `tenants/${tenantId}/pacientes`)).then(snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } })
      setPacientes(map)
    })
  }, [tenantId])

  const pendientes = cobros.filter(c => !c.facturado && c.pacienteId)
  const totalPendiente = pendientes.reduce((s,c) => s + Number(c.monto ?? 0), 0)

  const facturar = async (cobro) => {
    const paciente = pacientes[cobro.pacienteId]
    if (!paciente) { toast.error('Paciente no encontrado'); return }
    if (!paciente.rfc) {
      toast.error('El paciente no tiene RFC. Agrégalo en su ficha antes de facturar.')
      return
    }
    if (!import.meta.env.VITE_FACTURAPI_KEY) {
      toast.error('Configura VITE_FACTURAPI_KEY en tu .env.local')
      return
    }

    setLoading(true)
    setModal(null)
    try {
      toast('Timbrando ante el SAT...', { icon: '⏳' })

      const factura = await emitirFactura({ cobro, paciente, tenant })

      // Guardar en Firestore
      const { addDoc } = await import('firebase/firestore')
      // Sanitizar — Firestore no acepta undefined
      const sanitize = obj => JSON.parse(JSON.stringify(obj, (k,v) => v === undefined ? null : v))
      const facturaRef = await addDoc(
        collection(db, `tenants/${tenantId}/facturas`), sanitize({
          facturapiId:  factura.id,
          uuid:         factura.uuid,
          folio:        factura.folio_number,
          serie:        factura.series,
          pdfUrl:       factura.pdf_download_url ?? null,
          xmlUrl:       factura.xml_download_url ?? null,
          total:        factura.total,
          estatus:      factura.status,
          cobroId:      cobro.id,
          pacienteId:   cobro.pacienteId,
          pacienteNombre: cobro.pacienteNombre,
          pacienteIdLegible: cobro.pacienteIdLegible,
          concepto:     cobro.concepto,
          fecha:        Timestamp.now(),
          tenantId,
        })
      )

      // Marcar cobro como facturado
      await updateDoc(doc(db, `tenants/${tenantId}/cobros/${cobro.id}`), {
        facturado:  true,
        facturaId:  facturaRef.id,
        cfdiUuid:   factura.uuid,
        cfdiUrl:    factura.pdf_download_url ?? null,
      })

      toast.success(`CFDI timbrado ✓ — UUID: ${factura.uuid.slice(0,8)}...`)
    } catch(e) {
      console.error(e)
      toast.error(`Error: ${e.message}`)
    } finally { setLoading(false) }
  }

  const cancelar = async (factura) => {
    if (!window.confirm('¿Seguro que deseas cancelar esta factura ante el SAT? Esta acción no se puede deshacer.')) return
    setLoading(true)
    try {
      await cancelarFactura(factura.facturapiId)
      await updateDoc(doc(db, `tenants/${tenantId}/facturas/${factura.id}`), {
        estatus: 'cancelled'
      })
      // Desmarcar cobro
      if (factura.cobroId) {
        await updateDoc(doc(db, `tenants/${tenantId}/cobros/${factura.cobroId}`), {
          facturado: false, facturaId: null, cfdiUuid: null
        })
      }
      toast.success('Factura cancelada ante el SAT')
    } catch(e) {
      toast.error(`Error al cancelar: ${e.message}`)
    } finally { setLoading(false) }
  }

  const enviarEmail = async () => {
    if (!emailDest) { toast.error('Escribe un email'); return }
    try {
      await enviarFacturaPorEmail(emailModal.facturapiId, emailDest)
      toast.success('Factura enviada por email ✓')
      setEmailModal(null); setEmailDest('')
    } catch(e) {
      toast.error('Error al enviar')
    }
  }

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Facturación CFDI 4.0</h2>
          <p className="text-sm text-gray-400">
            {facturas.filter(f=>f.estatus==='valid').length} facturas timbradas
          </p>
        </div>
      </div>

      {/* Aviso si no hay API key */}
      {!import.meta.env.VITE_FACTURAPI_KEY && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-amber-800">
            ⚠️ Facturapi no está configurado
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Agrega <code className="bg-amber-100 px-1 rounded">VITE_FACTURAPI_KEY=sk_test_...</code> a tu archivo
            <code className="bg-amber-100 px-1 rounded ml-1">.env.local</code> y reinicia el servidor.
            Obtén tu API key en <a href="https://facturapi.io" target="_blank" rel="noreferrer"
              className="underline">facturapi.io</a> (sandbox gratuito).
          </p>
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Por facturar</p>
          <p className="text-2xl font-bold text-amber-500">{pendientes.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            ${totalPendiente.toLocaleString('es-MX')} MXN
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Timbradas</p>
          <p className="text-2xl font-bold text-green-600">
            {facturas.filter(f=>f.estatus==='valid').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Canceladas</p>
          <p className="text-2xl font-bold text-red-400">
            {facturas.filter(f=>f.estatus==='cancelled').length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          ['pendientes', `Por facturar (${pendientes.length})`],
          ['historial',  `Historial (${facturas.length})`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === key
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: cobros pendientes de facturar */}
      {tab === 'pendientes' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {pendientes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">✅</p>
              <p className="text-sm">Todos los cobros están facturados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Fecha','ID Paciente','Paciente','RFC','Concepto','Monto','Acción'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                             text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendientes.map(c => {
                    const pac = pacientes[c.pacienteId]
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {c.fechaPago
                            ? format(c.fechaPago.toDate(), "d MMM yyyy", {locale:es})
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-teal-50 text-teal-700
                                           px-2 py-0.5 rounded border border-teal-100">
                            {c.pacienteIdLegible ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {c.pacienteNombre}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {pac?.rfc
                            ? pac.rfc
                            : <span className="text-red-400">Sin RFC</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.concepto}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">
                          ${Number(c.monto).toLocaleString('es-MX')}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setModal(c)}
                            disabled={loading || !pac?.rfc}
                            className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg
                                       hover:bg-teal-700 disabled:opacity-40 transition-colors">
                            Facturar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: historial de facturas */}
      {tab === 'historial' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {facturas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">🧾</p>
              <p className="text-sm">Sin facturas emitidas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Folio','Paciente','Fecha','Concepto','Total','Estatus','Acciones'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                             text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturas.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {f.serie}{f.folio}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <div>{f.pacienteNombre}</div>
                        <div className="text-xs text-gray-400">{f.pacienteIdLegible}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {format(f.fecha.toDate(), "d MMM yyyy", {locale:es})}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{f.concepto}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        ${Number(f.total ?? 0).toLocaleString('es-MX')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium
                          ${ESTATUS_COLOR[f.estatus] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ESTATUS_LABEL[f.estatus] ?? f.estatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {f.pdfUrl && (
                            <button
                              onClick={() => descargarFactura(f.facturapiId, 'pdf')}
                              className="text-xs text-teal-600 hover:underline whitespace-nowrap">
                              PDF
                            </button>
                          )}
                          {f.xmlUrl && (
                            <button
                              onClick={() => descargarFactura(f.facturapiId, 'xml')}
                              className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                              XML
                            </button>
                          )}
                          <button
                            onClick={() => { setEmailModal(f); setEmailDest('') }}
                            className="text-xs text-gray-500 hover:underline whitespace-nowrap">
                            Email
                          </button>
                          {f.estatus === 'valid' && (
                            <button
                              onClick={() => cancelar(f)}
                              disabled={loading}
                              className="text-xs text-red-400 hover:text-red-600
                                         hover:underline whitespace-nowrap disabled:opacity-40">
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal confirmar facturación */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2 text-gray-800">
              Confirmar emisión de CFDI
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              Revisa los datos antes de timbrar. Una vez emitido, solo puedes cancelar ante el SAT.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Paciente</span>
                <span className="font-medium">{modal.pacienteNombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">RFC</span>
                <span className="font-mono text-xs">
                  {pacientes[modal.pacienteId]?.rfc ?? '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Concepto</span>
                <span>{modal.concepto}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Monto</span>
                <span className="font-bold text-gray-800">
                  ${Number(modal.monto).toLocaleString('es-MX')} MXN
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Método pago</span>
                <span>{modal.metodo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Uso CFDI</span>
                <span>G03 — Gastos en general</span>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 mb-5">
              <p className="text-xs text-blue-700">
                💡 Los honorarios médicos están <b>exentos de IVA</b> conforme al Art. 15 de la LIVA.
                El CFDI se emitirá sin IVA trasladado.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => facturar(modal)} disabled={loading}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {loading ? 'Timbrando...' : 'Emitir CFDI'}
              </button>
              <button onClick={() => setModal(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm
                           hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal enviar por email */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setEmailModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4 text-gray-800">
              Enviar factura por email
            </h3>
            <label className="block text-xs text-gray-500 mb-1">
              Email del destinatario
            </label>
            <input type="email" value={emailDest}
              onChange={e => setEmailDest(e.target.value)}
              placeholder="paciente@email.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-teal-400 mb-4" />
            <div className="flex gap-3">
              <button onClick={enviarEmail}
                className="flex-1 bg-teal-600 text-white py-2 rounded-xl text-sm
                           font-medium hover:bg-teal-700 transition-colors">
                Enviar
              </button>
              <button onClick={() => setEmailModal(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-xl text-sm
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
