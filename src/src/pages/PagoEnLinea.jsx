import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, Timestamp, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ── Conekta config ────────────────────────────────────────
// SETUP: agrega al .env.local
// VITE_CONEKTA_PUBLIC_KEY=key_test_TU_KEY_AQUI
// Obtén tu key en: app.conekta.com → Developers → API Keys

const CONEKTA_KEY = import.meta.env.VITE_CONEKTA_PUBLIC_KEY ?? ''

const METODO_LABELS = {
  efectivo:      { label: 'Efectivo',       icon: '💵' },
  tarjeta:       { label: 'Tarjeta',        icon: '💳' },
  transferencia: { label: 'Transferencia',  icon: '🏦' },
  oxxo:          { label: 'OXXO Pay',       icon: '🏪' },
  spei:          { label: 'SPEI/CoDi',      icon: '📱' },
}

// ── Formulario de tarjeta ─────────────────────────────────
function FormTarjeta({ onToken, loading }) {
  const [card, setCard] = useState({
    number: '', name: '', expYear: '', expMonth: '', cvc: '',
  })

  const formatCard = val => val.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim().slice(0, 19)

  const tokenizar = async () => {
    if (!window.Conekta) {
      toast.error('Carga de Conekta.js fallida — revisa la consola')
      return
    }
    window.Conekta.setPublicKey(CONEKTA_KEY)
    window.Conekta.Token.create(
      {
        card: {
          number:    card.number.replace(/\s/g, ''),
          name:      card.name,
          exp_year:  card.expYear,
          exp_month: card.expMonth,
          cvc:       card.cvc,
        }
      },
      token => onToken(token.id),
      err   => toast.error(err.message_to_purchaser ?? 'Tarjeta no válida')
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Número de tarjeta</label>
        <input type="text" value={card.number} maxLength={19}
          onChange={e => setCard(c => ({ ...c, number: formatCard(e.target.value) }))}
          placeholder="4111 1111 1111 1111"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                     font-mono tracking-wider focus:outline-none focus:ring-2
                     focus:ring-teal-400" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Nombre del titular</label>
        <input type="text" value={card.name}
          onChange={e => setCard(c => ({ ...c, name: e.target.value }))}
          placeholder="Como aparece en la tarjeta"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-teal-400" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mes exp.</label>
          <input type="text" value={card.expMonth} maxLength={2}
            onChange={e => setCard(c => ({ ...c, expMonth: e.target.value }))}
            placeholder="MM"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                       font-mono focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Año exp.</label>
          <input type="text" value={card.expYear} maxLength={2}
            onChange={e => setCard(c => ({ ...c, expYear: e.target.value }))}
            placeholder="AA"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                       font-mono focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">CVC</label>
          <input type="password" value={card.cvc} maxLength={4}
            onChange={e => setCard(c => ({ ...c, cvc: e.target.value }))}
            placeholder="•••"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                       font-mono focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
        <span>🔒</span>
        <span>Datos cifrados con SSL. No almacenamos tu tarjeta.</span>
      </div>
      <button onClick={tokenizar} disabled={loading}
        className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm
                   font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
        {loading ? 'Procesando...' : 'Pagar con tarjeta'}
      </button>
    </div>
  )
}

// ── Componente SPEI/OXXO ──────────────────────────────────
function InfoTransferencia({ tipo, cobro }) {
  // En producción, esto viene de la respuesta de Conekta
  // después de crear la orden con el backend
  const clabe = '646180157099999999' // Ejemplo sandbox
  const referencia = `MD${cobro.id?.slice(0,8).toUpperCase()}`

  return (
    <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
      <p className="text-sm font-semibold text-blue-800 mb-3">
        {tipo === 'spei' ? '📱 Datos para SPEI/CoDi' : '🏪 Referencia OXXO Pay'}
      </p>
      {tipo === 'spei' ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Banco:</span>
            <span className="font-medium">STP</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">CLABE:</span>
            <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border">
              {clabe}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Monto:</span>
            <span className="font-bold">${cobro.monto?.toLocaleString('es-MX')} MXN</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Concepto:</span>
            <span>{referencia}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Referencia:</span>
            <span className="font-mono text-lg font-bold">{referencia}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Monto:</span>
            <span className="font-bold">${cobro.monto?.toLocaleString('es-MX')} MXN</span>
          </div>
          <p className="text-xs text-blue-600 mt-2">
            Muestra esta referencia en cualquier OXXO. Válida por 3 días.
          </p>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">
        ⚠️ En sandbox: estos datos son de prueba. En producción se generan via Conekta.
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────
export default function PagoEnLinea() {
  const { tenantId } = useTenant()
  const [cobros,  setCobros]  = useState([])
  const [modal,   setModal]   = useState(null)
  const [metodo,  setMetodo]  = useState('tarjeta')
  const [loading, setLoading] = useState(false)
  const [paso,    setPaso]    = useState(1) // 1=seleccionar método, 2=pagar, 3=confirmado

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

  const pendientes = cobros.filter(c => c.estadoPago !== 'paid')
  const pagados    = cobros.filter(c => c.estadoPago === 'paid')

  const abrirPago = (cobro) => {
    setModal(cobro)
    setMetodo('tarjeta')
    setPaso(1)
  }

  const procesarPagoEfectivo = async (cobro) => {
    setLoading(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/cobros/${cobro.id}`), {
        estadoPago:   'paid',
        metodoPago:   'efectivo',
        fechaPagoOnline: Timestamp.now(),
      })
      toast.success('Cobro registrado como pagado en efectivo ✓')
      setPaso(3)
    } catch(e) {
      toast.error('Error al registrar pago')
    } finally { setLoading(false) }
  }

  const procesarPagoTarjeta = async (tokenId) => {
    setLoading(true)
    try {
      // En producción: llamar a tu Cloud Function con el tokenId
      // La Cloud Function usa la API key PRIVADA de Conekta para crear la orden
      // Aquí simulamos el resultado exitoso (sandbox)
      toast('Procesando cargo...', { icon: '⏳' })

      // Simular llamada al backend
      await new Promise(r => setTimeout(r, 1500))

      await updateDoc(doc(db, `tenants/${tenantId}/cobros/${modal.id}`), {
        estadoPago:      'paid',
        metodoPago:      'tarjeta',
        conektaToken:    tokenId,
        fechaPagoOnline: Timestamp.now(),
      })
      toast.success('¡Pago exitoso! ✓')
      setPaso(3)
    } catch(e) {
      console.error(e); toast.error('Error al procesar el pago')
    } finally { setLoading(false) }
  }

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Pagos en línea</h2>
          <p className="text-sm text-gray-400">
            {pendientes.length} pendientes · {pagados.length} pagados
          </p>
        </div>
      </div>

      {/* Aviso Conekta */}
      {!CONEKTA_KEY && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-amber-800">⚠️ Conekta no está configurado</p>
          <p className="text-xs text-amber-700 mt-1">
            Agrega <code className="bg-amber-100 px-1 rounded">VITE_CONEKTA_PUBLIC_KEY=key_test_...</code>
            a tu <code className="bg-amber-100 px-1 rounded">.env.local</code>.
            Obtén tu key en{' '}
            <a href="https://app.conekta.com" target="_blank" rel="noreferrer"
              className="underline">app.conekta.com</a>.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[
          ['pendientes', `Pendientes (${pendientes.length})`],
          ['pagados',    `Pagados (${pagados.length})`],
        ].map(([key, label]) => (
          <button key={key}
            onClick={() => {}}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors
                       border-teal-500 text-teal-600">
            {label}
          </button>
        ))}
      </div>

      {/* Lista de cobros */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cobros.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">💳</p>
            <p className="text-sm">Sin cobros registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Paciente','Concepto','Monto','Estado','Método','Acción'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium
                                           text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cobros.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.pacienteNombre}</div>
                      <div className="text-xs text-gray-400">{c.pacienteIdLegible}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.concepto}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">
                      ${Number(c.monto).toLocaleString('es-MX')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                        ${c.estadoPago === 'paid'
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                        {c.estadoPago === 'paid' ? '✓ Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.metodoPago
                        ? METODO_LABELS[c.metodoPago]?.icon + ' ' + METODO_LABELS[c.metodoPago]?.label
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.estadoPago !== 'paid' && (
                        <button onClick={() => abrirPago(c)}
                          className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg
                                     hover:bg-teal-700 transition-colors">
                          Registrar pago
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de pago */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setModal(null); setPaso(1) }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Paso 3: Confirmación */}
            {paso === 3 ? (
              <div className="text-center py-4">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">¡Pago registrado!</h3>
                <p className="text-sm text-gray-500 mb-1">
                  {modal.pacienteNombre}
                </p>
                <p className="text-2xl font-bold text-teal-600 mb-4">
                  ${Number(modal.monto).toLocaleString('es-MX')} MXN
                </p>
                <button onClick={() => { setModal(null); setPaso(1) }}
                  className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm
                             font-medium hover:bg-teal-700 transition-colors">
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                {/* Encabezado */}
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-gray-800">Registrar pago</h3>
                  <div className="flex justify-between mt-2 text-sm">
                    <span className="text-gray-500">{modal.pacienteNombre}</span>
                    <span className="font-bold text-gray-800">
                      ${Number(modal.monto).toLocaleString('es-MX')} MXN
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{modal.concepto}</p>
                </div>

                {/* Selector de método */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2">Método de pago</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(METODO_LABELS).map(([key, val]) => (
                      <button key={key} onClick={() => setMetodo(key)}
                        className={`flex flex-col items-center py-2.5 px-1 rounded-xl text-xs
                                    border transition-colors
                                    ${metodo === key
                                      ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                                      : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                        <span className="text-xl mb-0.5">{val.icon}</span>
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contenido según método */}
                {metodo === 'efectivo' && (
                  <div>
                    <div className="bg-gray-50 rounded-xl p-4 mb-4 text-center">
                      <p className="text-xs text-gray-500 mb-1">Monto a cobrar</p>
                      <p className="text-3xl font-bold text-gray-800">
                        ${Number(modal.monto).toLocaleString('es-MX')}
                        <span className="text-sm text-gray-400 ml-1">MXN</span>
                      </p>
                    </div>
                    <button onClick={() => procesarPagoEfectivo(modal)} disabled={loading}
                      className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm
                                 font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                      {loading ? 'Registrando...' : '✓ Confirmar pago en efectivo'}
                    </button>
                  </div>
                )}

                {metodo === 'tarjeta' && (
                  <FormTarjeta loading={loading}
                    onToken={token => procesarPagoTarjeta(token)} />
                )}

                {metodo === 'transferencia' && (
                  <div>
                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <p className="text-xs text-gray-500 mb-2">Datos bancarios del consultorio</p>
                      <p className="text-xs text-gray-400">
                        Configura los datos bancarios en el perfil del consultorio (Firestore → tenants → banco).
                      </p>
                    </div>
                    <button onClick={() => procesarPagoEfectivo(modal)} disabled={loading}
                      className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm
                                 font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {loading ? 'Registrando...' : '✓ Confirmar transferencia recibida'}
                    </button>
                  </div>
                )}

                {metodo === 'oxxo' && (
                  <InfoTransferencia tipo="oxxo" cobro={modal} />
                )}

                {metodo === 'spei' && (
                  <InfoTransferencia tipo="spei" cobro={modal} />
                )}

                <button onClick={() => { setModal(null); setPaso(1) }}
                  className="w-full mt-3 text-xs text-gray-400 py-2 hover:text-gray-600">
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
