// src/services/facturapi.js — Novaryk.Med
// Cliente delgado: TODAS las llamadas van a /api/facturapi (server-side).
// La API key de Facturapi ya NO vive en este archivo ni en el navegador —
// solo existe en api/facturapi.js, dentro de Vercel.

async function llamarProxy(action, params = {}, tenantId = null) {
  const res = await fetch('/api/facturapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, action, params }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) throw new Error(body.error || `API ${res.status}`)
  return body.data
}

// CFDI 4.0: mayúsculas + sin acentos + sin régimen societario
// (se mantiene aquí también por si algún componente la usa solo para mostrar texto)
// OJO: la Ñ se descompone en NFD como N + tilde combinante (U+0303) — hay que protegerla.
export function normalizarNombreSAT(nombre = '') {
  return nombre
    .replace(/Ñ/g, '\u0001').replace(/ñ/g, '\u0002')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'Ñ').replace(/\u0002/g, 'ñ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Organizaciones (multi-tenant, solo SuperAdmin) ───────
export async function crearOrganizacionFP({ rfc, nombreLegal, cp, regimen }) {
  return llamarProxy('crearOrganizacionFP', { rfc, nombreLegal, cp, regimen })
}
export async function obtenerApiKeyOrg(orgFpId) {
  return llamarProxy('obtenerApiKeyOrg', { orgFpId })
}
export async function consultarOrganizacionFP(orgFpId) {
  return llamarProxy('consultarOrganizacionFP', { orgFpId })
}

// ── Clientes ──────────────────────────────────────────────
export async function crearCliente(paciente, tenantId) {
  return llamarProxy('crearCliente', { paciente }, tenantId)
}
export async function buscarCliente(rfc, tenantId) {
  return llamarProxy('buscarCliente', { rfc }, tenantId)
}
export async function actualizarCliente(clienteId, paciente, tenantId) {
  return llamarProxy('actualizarCliente', { clienteId, paciente }, tenantId)
}

// ── Emisión de CFDI ───────────────────────────────────────
// tenant?.id se usa para que el servidor resuelva la key propia del consultorio;
// si no tiene una propia, el servidor cae a la key maestra automáticamente.
export async function emitirFactura({ cobro, paciente, tenant }) {
  return llamarProxy('emitirFactura', { cobro, paciente, tenantNombre: tenant?.nombre }, tenant?.id)
}

// ── Descargar PDF / XML ──────────────────────────────────
export async function descargarFactura(invoiceId, tipo = 'pdf', tenantId = null) {
  const { base64, contentType } = await llamarProxy('descargarFactura', { invoiceId, tipo }, tenantId)
  const byteChars = atob(base64)
  const byteNumbers = new Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `factura-${invoiceId}.${tipo}`; a.click()
  URL.revokeObjectURL(url)
}

// ── Enviar por email ──────────────────────────────────────
export async function enviarFacturaPorEmail(invoiceId, email, tenantId = null) {
  return llamarProxy('enviarFacturaPorEmail', { invoiceId, email }, tenantId)
}

// ── Cancelar CFDI ─────────────────────────────────────────
export async function cancelarFactura(invoiceId, motivo = '02', tenantId = null) {
  return llamarProxy('cancelarFactura', { invoiceId, motivo }, tenantId)
}

// ── Listar facturas ───────────────────────────────────────
export async function listarFacturas({ page = 1, limit = 20 } = {}, tenantId = null) {
  return llamarProxy('listarFacturas', { page, limit }, tenantId)
}
