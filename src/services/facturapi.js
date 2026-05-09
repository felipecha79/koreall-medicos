// src/services/facturapi.js — Wrapper Facturapi CFDI 4.0
const FACTURAPI_URL = 'https://www.facturapi.io/v2'
const API_KEY = import.meta.env.VITE_FACTURAPI_KEY

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
}

const FORMA_PAGO = {
  efectivo:      '01',
  cheque:        '02',
  transferencia: '03',
  tarjeta:       '04',
  debito:        '28',
  credito:       '99',
}

async function parseError(res) {
  let msg = `HTTP ${res.status}`
  try { const e = await res.clone().json(); msg = e.message ?? e.error ?? msg } catch {}
  return msg
}

// ── Clientes ─────────────────────────────────────────────
export async function crearCliente(paciente) {
  const res = await fetch(`${FACTURAPI_URL}/customers`, {
    method: 'POST', headers,
    body: JSON.stringify({
      legal_name: `${paciente.nombre} ${paciente.apellidos}`.toUpperCase(),
      tax_id:     paciente.rfc,
      tax_system: '616',
      email:      paciente.email ?? undefined,
      address:    { zip: paciente.cp ?? '89000' },
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function buscarCliente(rfc) {
  const res = await fetch(`${FACTURAPI_URL}/customers?q=${rfc}`, { headers })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.data?.[0] ?? null
}

// ── Emisión de CFDI ──────────────────────────────────────
export async function emitirFactura({ cobro, paciente, tenant }) {
  let clienteId = paciente.facturapiCustomerId
  if (!clienteId) {
    const existente = paciente.rfc ? await buscarCliente(paciente.rfc) : null
    clienteId = existente ? existente.id : (await crearCliente(paciente)).id
  }

  const body = {
    type:     'I',
    customer: clienteId,
    items: [{
      quantity: 1,
      product: {
        description:  cobro.concepto ?? 'Consulta general',
        product_key:  '85121800', // SAT: Servicios de consulta médica
        unit_key:     'E48',
        unit_name:    'Unidad de servicio',
        price:        cobro.monto,
        tax_included: false,
        taxes: [{ type: 'IVA', rate: 0.00, factor: 'Exento' }],
      },
    }],
    payment_form:   FORMA_PAGO[cobro.metodoPago ?? cobro.metodo] ?? '01',
    payment_method: (cobro.metodoPago ?? cobro.metodo) === 'credito' ? 'PPD' : 'PUE',
    use: 'G03',
    pdf_custom_section: `Consultorio: ${tenant?.nombre ?? ''}`,
  }

  const res = await fetch(`${FACTURAPI_URL}/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Descargar PDF / XML ──────────────────────────────────
export async function descargarFactura(invoiceId, tipo = 'pdf') {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}/${tipo}`, { headers })
  if (!res.ok) throw new Error('No se pudo descargar')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `factura-${invoiceId}.${tipo}`; a.click()
  URL.revokeObjectURL(url)
}

// ── Enviar por email ─────────────────────────────────────
export async function enviarFacturaPorEmail(invoiceId, email) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}/email`, {
    method: 'POST', headers, body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Cancelar CFDI ────────────────────────────────────────
export async function cancelarFactura(invoiceId, motivo = '02') {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}`, {
    method: 'DELETE', headers,
    body: JSON.stringify({ motive: motivo }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Listar facturas ──────────────────────────────────────
export async function listarFacturas({ page = 1, limit = 20 } = {}) {
  const res = await fetch(
    `${FACTURAPI_URL}/invoices?page=${page}&limit=${limit}`,
    { headers }
  )
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
