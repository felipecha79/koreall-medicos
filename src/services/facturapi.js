// src/services/facturapi.js
// Wrapper para Facturapi CFDI 4.0
// Docs: https://www.facturapi.io/docs
//
// SETUP:
// 1. Crea cuenta en facturapi.io
// 2. En sandbox: usa tu API key de TEST (empieza con sk_test_...)
// 3. En producción: usa tu API key LIVE (empieza con sk_live_...)
// 4. Agrega al .env.local:
//    VITE_FACTURAPI_KEY=sk_test_TU_KEY_AQUI
//
// IMPORTANTE: En producción esta key debe estar en un backend/Cloud Function
// para no exponerla en el frontend. Para el MVP del piloto funciona en cliente.

const FACTURAPI_URL = 'https://www.facturapi.io/v2'
const API_KEY = import.meta.env.VITE_FACTURAPI_KEY

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
}

// ── Clientes (receptores de CFDI) ─────────────────────────
export async function crearCliente(paciente) {
  const res = await fetch(`${FACTURAPI_URL}/customers`, {
    method: 'POST', headers,
    body: JSON.stringify({
      legal_name: `${paciente.nombre} ${paciente.apellidos}`.toUpperCase(),
      tax_id:     paciente.rfc,
      tax_system: '616', // Sin obligaciones fiscales (personas físicas sin actividad)
      email:      paciente.email ?? undefined,
      address:    { zip: '89000' }, // Requerido por SAT — usar CP del paciente
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function buscarCliente(rfc) {
  const res = await fetch(`${FACTURAPI_URL}/customers?q=${rfc}`, { headers })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.data?.[0] ?? null
}

// ── Emisión de CFDI ───────────────────────────────────────
export async function emitirFactura({ cobro, paciente, tenant }) {
  // Buscar o crear cliente en Facturapi
  let clienteId = paciente.facturapiCustomerId

  if (!clienteId) {
    // Buscar por RFC primero
    const existente = paciente.rfc ? await buscarCliente(paciente.rfc) : null
    if (existente) {
      clienteId = existente.id
    } else {
      const nuevo = await crearCliente(paciente)
      clienteId = nuevo.id
    }
  }

  // Tipo de comprobante: I = Ingreso
  const body = {
    type:     'I',
    customer: clienteId,
    items: [{
      quantity:    1,
      product: {
        description:  cobro.concepto ?? 'Honorarios médicos',
        product_key:  '85121800', // Clave SAT correcta: Servicios de salud
        unit_key:     'E48',      // Clave unidad SAT corr
        unit_name:    'Unidad de servicio',
        price:        cobro.monto,
        tax_included: false,
        taxes: [
          // Honorarios médicos están exentos de IVA (Art. 15 LIVA)
          // Si el doctor cobra IVA, cambiar a: { type: 'IVA', rate: 0.16 }
          { type: 'IVA', rate: 0.00, factor: 'Exento' },
        ],
      },
    }],
    payment_form: FORMA_PAGO[cobro.metodo] ?? '01',
    payment_method: cobro.metodo === 'credito' ? 'PPD' : 'PUE',
    use: 'G03', // Gastos en general (más común para pacientes)
    pdf_custom_section: `Consultorio: ${tenant?.nombre ?? ''}`,
  }

  const res = await fetch(`${FACTURAPI_URL}/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message ?? 'Error al timbrar')
  }
  return res.json()
}

// ── Descargar PDF o XML ───────────────────────────────────
export async function descargarFactura(invoiceId, tipo = 'pdf') {
  const res = await fetch(
    `${FACTURAPI_URL}/invoices/${invoiceId}/${tipo}`,
    { headers }
  )
  if (!res.ok) throw new Error('No se pudo descargar')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `factura-${invoiceId}.${tipo}`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Enviar por email ──────────────────────────────────────
export async function enviarFacturaPorEmail(invoiceId, email) {
  const res = await fetch(
    `${FACTURAPI_URL}/invoices/${invoiceId}/email`,
    { method: 'POST', headers,
      body: JSON.stringify({ email }) }
  )
  if (!res.ok) throw new Error('No se pudo enviar')
  return res.json()
}

// ── Cancelar CFDI ─────────────────────────────────────────
export async function cancelarFactura(invoiceId, motivo = '02') {
  // Motivos: 01=Error sin relación, 02=Error con relación, 03=No efectuado, 04=Operación nominativa
  const res = await fetch(
    `${FACTURAPI_URL}/invoices/${invoiceId}/cancel?motive=${motivo}`,
    { method: 'DELETE', headers }
  )
  if (!res.ok) throw new Error('No se pudo cancelar')
  return res.json()
}

// ── Complemento de pago ───────────────────────────────────
export async function emitirComplementoPago({ facturaOriginal, cobro }) {
  const body = {
    type: 'P', // Complemento de pago
    customer: facturaOriginal.customer.id,
    items: [{
      quantity: 1,
      product: {
        description:  'Pago',
        product_key:  '84111506',
        unit_key:     'ACT',
        price:        0,
      }
    }],
    related: [{
      relationship: '04', // Sustitución
      uuid: facturaOriginal.uuid,
    }],
    complements: [{
      type: 'pago',
      data: [{
        payment_form:  FORMA_PAGO[cobro.metodo] ?? '01',
        currency:      'MXN',
        amount:        cobro.monto,
        related_documents: [{
          uuid:               facturaOriginal.uuid,
          amount:             cobro.monto,
          last_balance:       cobro.monto,
          installment:        1,
          tax_object:         '01',
        }],
      }],
    }],
  }

  const res = await fetch(`${FACTURAPI_URL}/invoices`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Mapeo forma de pago SAT ───────────────────────────────
const FORMA_PAGO = {
  efectivo:      '01', // Efectivo
  cheque:        '02', // Cheque nominativo
  transferencia: '03', // Transferencia electrónica
  tarjeta:       '04', // Tarjeta de crédito
  debito:        '28', // Tarjeta de débito
  credito:       '99', // Por definir (PPD)
}

export { FORMA_PAGO }
