// src/services/facturapi.js
// Wrapper para Facturapi CFDI 4.0
// Docs: https://www.facturapi.io/docs
//
// SETUP:
// 1. Crea cuenta en facturapi.io
// 2. En sandbox: usa tu API key de TEST (empieza con sk_test_...)
// 3. En producci\u00f3n: usa tu API key LIVE (empieza con sk_live_...)
// 4. Agrega al .env.local:
//    VITE_FACTURAPI_KEY=sk_test_TU_KEY_AQUI
//
// IMPORTANTE: En producci\u00f3n esta key debe estar en un backend/Cloud Function
// para no exponerla en el frontend. Para el MVP del piloto funciona en cliente.

const FACTURAPI_URL = 'https://www.facturapi.io/v2'
const API_KEY = import.meta.env.VITE_FACTURAPI_KEY

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
}

// \u2500\u2500 Clientes (receptores de CFDI) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function crearCliente(paciente) {
  const res = await fetch(`${FACTURAPI_URL}/customers`, {
    method: 'POST', headers,
    body: JSON.stringify({
      legal_name: `${paciente.nombre} ${paciente.apellidos}`.toUpperCase(),
      tax_id:     paciente.rfc,
      tax_system: '616', // Sin obligaciones fiscales (personas f\u00edsicas sin actividad)
      email:      paciente.email ?? undefined,
      address:    { zip: '89000' }, // Requerido por SAT \u2014 usar CP del paciente
    }),
  })
  if (!res.ok) { let m='Error'; try { const e=await res.json(); m=e.message??e.error??m } catch(ex) { try { m=await res.text() } catch {} }; throw new Error(m) }
  return res.json()
}

export async function buscarCliente(rfc) {
  const res = await fetch(`${FACTURAPI_URL}/customers?q=${rfc}`, { headers })
  if (!res.ok) { let m='Error'; try { const e=await res.json(); m=e.message??e.error??m } catch(ex) { try { m=await res.text() } catch {} }; throw new Error(m) }
  const data = await res.json()
  return data.data?.[0] ?? null
}

// \u2500\u2500 Emisi\u00f3n de CFDI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
        description:  cobro.concepto ?? 'Honorarios m\u00e9dicos',
        product_key:  '85101500', // Clave SAT: Servicios m\u00e9dicos
        unit_key:     'ACT',      // Clave unidad: Actividad
        unit_name:    'Actividad',
        price:        cobro.monto,
        tax_included: false,
        taxes: [
          // Honorarios m\u00e9dicos est\u00e1n exentos de IVA (Art. 15 LIVA)
          // Si el doctor cobra IVA, cambiar a: { type: 'IVA', rate: 0.16 }
          { type: 'IVA', rate: 0.00, factor: 'Exento' },
        ],
      },
    }],
    payment_form: FORMA_PAGO[cobro.metodo] ?? '01',
    payment_method: cobro.metodo === 'credito' ? 'PPD' : 'PUE',
    use: 'G03', // Gastos en general (m\u00e1s com\u00fan para pacientes)
    pdf_custom_section: `Consultorio: ${tenant?.nombre ?? ''}`,
  }

  const res = await fetch(`${FACTURAPI_URL}/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = 'Error al timbrar'
    try { const err = await res.json(); msg = err.message ?? err.error ?? msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

// \u2500\u2500 Descargar PDF o XML \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

// \u2500\u2500 Enviar por email \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function enviarFacturaPorEmail(invoiceId, email) {
  const res = await fetch(
    `${FACTURAPI_URL}/invoices/${invoiceId}/email`,
    { method: 'POST', headers,
      body: JSON.stringify({ email }) }
  )
  if (!res.ok) throw new Error('No se pudo enviar')
  return res.json()
}

// \u2500\u2500 Cancelar CFDI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function cancelarFactura(invoiceId, motivo = '02') {
  // Motivos: 01=Error sin relaci\u00f3n, 02=Error con relaci\u00f3n, 03=No efectuado, 04=Operaci\u00f3n nominativa
  const res = await fetch(
    `${FACTURAPI_URL}/invoices/${invoiceId}/cancel?motive=${motivo}`,
    { method: 'DELETE', headers }
  )
  if (!res.ok) throw new Error('No se pudo cancelar')
  return res.json()
}

// \u2500\u2500 Complemento de pago \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
      relationship: '04', // Sustituci\u00f3n
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
  if (!res.ok) { let m='Error'; try { const e=await res.json(); m=e.message??e.error??m } catch(ex) { try { m=await res.text() } catch {} }; throw new Error(m) }
  return res.json()
}

// \u2500\u2500 Mapeo forma de pago SAT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const FORMA_PAGO = {
  efectivo:      '01', // Efectivo
  cheque:        '02', // Cheque nominativo
  transferencia: '03', // Transferencia electr\u00f3nica
  tarjeta:       '04', // Tarjeta de cr\u00e9dito
  debito:        '28', // Tarjeta de d\u00e9bito
  credito:       '99', // Por definir (PPD)
}

export { FOR