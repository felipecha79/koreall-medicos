// api/facturapi.js — Novaryk.Med
// Proxy server-side para TODAS las operaciones de Facturapi (timbrado CFDI ante el SAT).
// La API key (maestra o por tenant) vive SOLO aquí — nunca en el bundle del navegador.
// El frontend llama a este endpoint con { tenantId, action, params } en vez de hablarle
// directo a facturapi.io.

import admin from 'firebase-admin'

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  return admin.firestore()
}

const FACTURAPI_URL = 'https://www.facturapi.io/v2'
const MASTER_KEY = process.env.FACTURAPI_API_KEY // sin prefijo VITE_ — solo servidor

// Resuelve qué key usar: la propia del tenant si la tiene, si no la maestra.
async function resolverApiKey(tenantId) {
  if (!tenantId) return MASTER_KEY
  try {
    const db = getDb()
    const snap = await db.doc(`tenants/${tenantId}`).get()
    return snap.exists && snap.data()?.facturapiApiKey
      ? snap.data().facturapiApiKey
      : MASTER_KEY
  } catch (e) {
    console.warn('[facturapi] No se pudo leer la key del tenant, usando maestra:', e.message)
    return MASTER_KEY
  }
}

function headers(key) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

async function parseError(res) {
  let msg = `HTTP ${res.status}`
  try { const e = await res.clone().json(); msg = e.message ?? e.error ?? msg } catch {}
  return msg
}

// CFDI 4.0: mayúsculas + sin acentos + sin régimen societario
function normalizarNombreSAT(nombre = '') {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const FORMA_PAGO = {
  efectivo: '01', cheque: '02', transferencia: '03',
  tarjeta: '04', debito: '28', credito: '99',
}

async function buscarCliente(rfc, key) {
  const res = await fetch(`${FACTURAPI_URL}/customers?q=${encodeURIComponent(rfc)}`, { headers: headers(key) })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return data.data?.[0] ?? null
}

async function crearCliente(paciente, key) {
  const rawName = paciente.rfcRazonSocial?.trim()
    || `${paciente.apellidos ?? ''} ${paciente.nombre ?? ''}`.trim()
  const res = await fetch(`${FACTURAPI_URL}/customers`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      legal_name: normalizarNombreSAT(rawName),
      tax_id:     paciente.rfc,
      tax_system: paciente.regimenFiscal ?? '616',
      email:      paciente.email ?? undefined,
      address:    { zip: paciente.cpFiscal ?? paciente.cp ?? '89000' },
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function actualizarCliente(clienteId, paciente, key) {
  const rawName = paciente.rfcRazonSocial?.trim()
    || `${paciente.apellidos ?? ''} ${paciente.nombre ?? ''}`.trim()
  const res = await fetch(`${FACTURAPI_URL}/customers/${clienteId}`, {
    method: 'PUT',
    headers: headers(key),
    body: JSON.stringify({
      legal_name: normalizarNombreSAT(rawName),
      tax_id:     paciente.rfc,
      tax_system: paciente.regimenFiscal ?? '616',
      email:      paciente.email ?? undefined,
      address:    { zip: paciente.cpFiscal ?? paciente.cp ?? '89000' },
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function emitirFactura({ cobro, paciente, tenantNombre }, key) {
  let clienteId = paciente.facturapiCustomerId
  if (!clienteId) {
    const existente = paciente.rfc ? await buscarCliente(paciente.rfc, key) : null
    clienteId = existente ? existente.id : (await crearCliente(paciente, key)).id
  } else {
    await actualizarCliente(clienteId, paciente, key).catch(() => {})
  }

  const body = {
    type: 'I',
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
    pdf_custom_section: `Consultorio: ${tenantNombre ?? ''}`,
  }

  const res = await fetch(`${FACTURAPI_URL}/invoices`, {
    method: 'POST', headers: headers(key), body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function descargarFactura(invoiceId, tipo, key) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}/${tipo}`, { headers: headers(key) })
  if (!res.ok) throw new Error('No se pudo descargar')
  const buf = Buffer.from(await res.arrayBuffer())
  return { base64: buf.toString('base64'), contentType: tipo === 'pdf' ? 'application/pdf' : 'application/xml' }
}

async function enviarFacturaPorEmail(invoiceId, email, key) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}/email`, {
    method: 'POST', headers: headers(key), body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function cancelarFactura(invoiceId, motivo, key) {
  const res = await fetch(`${FACTURAPI_URL}/invoices/${invoiceId}`, {
    method: 'DELETE', headers: headers(key), body: JSON.stringify({ motive: motivo ?? '02' }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function listarFacturas({ page = 1, limit = 20 } = {}, key) {
  const res = await fetch(`${FACTURAPI_URL}/invoices?page=${page}&limit=${limit}`, { headers: headers(key) })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// Solo SuperAdmin: alta de nuevas organizaciones — siempre con la key maestra
async function crearOrganizacionFP({ rfc, nombreLegal, cp, regimen }) {
  const res = await fetch(`${FACTURAPI_URL}/organizations`, {
    method: 'POST',
    headers: headers(MASTER_KEY),
    body: JSON.stringify({
      name: nombreLegal,
      legal: { tax_system: regimen ?? '612', tax_id: rfc, address: { zip: cp ?? '89000' } },
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function obtenerApiKeyOrg(orgFpId) {
  const res = await fetch(`${FACTURAPI_URL}/organizations/${orgFpId}/apikeys`, { headers: headers(MASTER_KEY) })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

async function consultarOrganizacionFP(orgFpId) {
  const res = await fetch(`${FACTURAPI_URL}/organizations/${orgFpId}`, { headers: headers(MASTER_KEY) })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!MASTER_KEY) return res.status(500).json({ error: 'FACTURAPI_API_KEY no configurada en Vercel' })

  const { tenantId, action, params = {} } = req.body || {}
  if (!action) return res.status(400).json({ error: 'Falta "action"' })

  try {
    const key = await resolverApiKey(tenantId)
    let resultado

    switch (action) {
      case 'buscarCliente':
        resultado = await buscarCliente(params.rfc, key); break
      case 'crearCliente':
        resultado = await crearCliente(params.paciente, key); break
      case 'actualizarCliente':
        resultado = await actualizarCliente(params.clienteId, params.paciente, key); break
      case 'emitirFactura':
        resultado = await emitirFactura(params, key); break
      case 'descargarFactura':
        resultado = await descargarFactura(params.invoiceId, params.tipo ?? 'pdf', key); break
      case 'enviarFacturaPorEmail':
        resultado = await enviarFacturaPorEmail(params.invoiceId, params.email, key); break
      case 'cancelarFactura':
        resultado = await cancelarFactura(params.invoiceId, params.motivo, key); break
      case 'listarFacturas':
        resultado = await listarFacturas(params, key); break
      case 'crearOrganizacionFP':
        resultado = await crearOrganizacionFP(params); break
      case 'obtenerApiKeyOrg':
        resultado = await obtenerApiKeyOrg(params.orgFpId); break
      case 'consultarOrganizacionFP':
        resultado = await consultarOrganizacionFP(params.orgFpId); break
      default:
        return res.status(400).json({ error: `Acción desconocida: ${action}` })
    }

    return res.status(200).json({ ok: true, data: resultado })
  } catch (e) {
    console.error(`[facturapi:${action}]`, e)
    return res.status(502).json({ error: e.message })
  }
}
