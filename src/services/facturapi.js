// src/services/facturapi.js — Novaryk.Med v1 · Multi-org Facturapi
// Cada tenant puede tener su propia API key de Facturapi (su propia organización).
// Si el tenant no tiene key propia, cae al VITE_FACTURAPI_KEY global (tu cuenta).
// NUNCA almacenes keys en Firestore sin cifrar — aquí se guardan como
// tenant.facturapiApiKey y solo el SuperAdmin las escribe desde Admin.jsx.

const FACTURAPI_URL = 'https://www.facturapi.io/v2'

// Key global (tu cuenta maestra) — fallback cuando el tenant no tiene la propia
const MASTER_KEY = import.meta.env.VITE_FACTURAPI_KEY

// Construye los headers usando la key del tenant si existe, si no la maestra
function buildHeaders(tenantApiKey) {
  const key = tenantApiKey || MASTER_KEY
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
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

// ── Organizaciones (multi-tenant) ────────────────────────
// Crea una organización en Facturapi bajo tu cuenta maestra.
// Retorna { id, is_production_ready, ... }
// El SuperAdmin llama esto al dar de alta un nuevo consultorio.
export async function crearOrganizacionFP({ rfc, nombreLegal, cp, regimen }) {
  const res = await fetch(`${FACTURAPI_URL}/organizations`, {
    method: 'POST',
    headers: buildHeaders(MASTER_KEY),
    body: JSON.stringify({
      name: nombreLegal,
      legal: {
        tax_system: regimen ?? '612',    // 612 = Personas Físicas Act. Empresariales
        tax_id: rfc,
        address: { zip: cp ?? '89000' },
      },
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// Obtiene la API key de producción/sandbox de una organización
// Facturapi devuelve keys separadas en organizations/{id}/apikeys
export async function obtenerApiKeyOrg(orgFpId) {
  const res = await fetch(`${FACTURAPI_URL}/organizations/${orgFpId}/apikeys`, {
    headers: buildHeaders(MASTER_KEY),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  // data.live o data.test según el ambiente de la cuenta maestra
  return data
}

// Consulta el estatus de una organización (para verificar que esté lista)
export async function consultarOrganizacionFP(orgFpId) {
  const res = await fetch(`${FACTURAPI_URL}/organizations/${orgFpId}`, {
    headers: buildHeaders(MASTER_KEY),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Clientes ─────────────────────────────────────────────
export async function crearCliente(paciente, tenantApiKey) {
  const res = await fetch(`${FACTURAPI_URL}/customers`, {
    method: 'POST',
    headers: buildHeaders(tenantApiKey),
    body: JSON.stringify({
      legal_name: `${paciente.nombre} ${paciente.apellidos}`.toUpperCase(),
      tax_id:     paciente.rfc,
      tax_system: paciente.regimenFiscal ?? '616',
      email:      paciente.email ?? undefined,
      address:    { zip: paciente.cp ?? '89000' },
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function buscarCliente(rfc, tenantApiKey) {
  const res = await fetch(`${FACTURAPI_URL}/customers?q=${rfc}`, {
    headers: buildHeaders(tenantApiKey),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.data?.[0] ?? null
}

// ── Emisión de CFDI ──────────────────────────────────────
// tenant debe tener tenant.facturapiApiKey para timbrar con su propio RFC.
// Si no tiene key propia, timbra con la cuenta maestra (útil en pruebas).
export async function emitirFactura({ cobro, paciente, tenant }) {
  const tenantApiKey = tenant?.facturapiApiKey ?? null

  let clienteId = paciente.facturapiCustomerId
  if (!clienteId) {
    const existente = paciente.rfc ? await buscarCliente(paciente.rfc, tenantApiKey) : null
    clienteId = existente
      ? existente.id
      : (await crearCliente(paciente, tenantApiKey)).id
  }

  const body = {
    type:     'I',
    customer: clienteId,
    items: [{ 
      quantity: 1,
      product: {
        description:  cobro.concepto ?? 'Consulta general',
        product_key:  '85121800',
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
    method: 'POST',
    headers: buildHeaders(tenantApiKey),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Descargar PDF / XML ──────────────────────────────────
export async function descargarFactura(invoiceId, tipo = 'pdf', tenantApiKey = null) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}/${tipo}`, {
    headers: buildHeaders(tenantApiKey),
  })
  if (!res.ok) throw new Error('No se pudo descargar')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `factura-${invoiceId}.${tipo}`; a.click()
  URL.revokeObjectURL(url)
}

// ── Enviar por email ─────────────────────────────────────
export async function enviarFacturaPorEmail(invoiceId, email, tenantApiKey = null) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}/email`, {
    method: 'POST',
    headers: buildHeaders(tenantApiKey),
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Cancelar CFDI ────────────────────────────────────────
export async function cancelarFactura(invoiceId, motivo = '02', tenantApiKey = null) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}`, {
    method: 'DELETE',
    headers: buildHeaders(tenantApiKey),
    body: JSON.stringify({ motive: motivo }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ── Listar facturas ──────────────────────────────────────
export async function listarFacturas({ page = 1, limit = 20 } = {}, tenantApiKey = null) {
  const res = await fetch(
    `${FACTURAPI_URL}/invoices?page=${page}&limit=${limit}`,
    { headers: buildHeaders(tenantApiKey) }
  )
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
