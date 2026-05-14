// api/cron-suscripciones.js — DocVias v22
// Vercel Serverless Function — corre el día 1 de cada mes via Vercel Cron
// También puede llamarse manualmente desde Admin con ?secret=CRON_SECRET
//
// Flujo por tenant:
// 1. Lee todos los tenants con suscripcionActiva !== false
// 2. Si el tenant tiene stripeSubscriptionId → Stripe ya cobra automáticamente
// 3. Si el tenant tiene cobro manual → genera CFDI + envía WhatsApp + email
// 4. Marca fechaProximoPago, actualiza Firestore
// 5. Si han pasado diasGracia sin pago → suscripcionActiva = false

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// Inicializar Firebase Admin (solo una vez)
function getAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  return getFirestore()
}

// ── Facturapi: emitir CFDI de suscripción DocVias ──────────────────────────
async function emitirCFDISuscripcion({ tenant, config, monto }) {
  const key = process.env.VITE_FACTURAPI_KEY
  if (!key) throw new Error('VITE_FACTURAPI_KEY no configurado')

  // Buscar o crear cliente en Facturapi
  let customerId = tenant.facturapiClienteDocViasId ?? null
  if (!customerId) {
    const buscar = await fetch(
      `https://www.facturapi.io/v2/customers?q=${tenant.rfc ?? 'XAXX010101000'}`,
      { headers: { Authorization: `Bearer ${key}` } }
    )
    const data = await buscar.json()
    customerId = data.data?.[0]?.id

    if (!customerId) {
      const crear = await fetch('https://www.facturapi.io/v2/customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: tenant.rfcRazonSocial ?? tenant.nombreDoctor ?? tenant.nombre,
          tax_id:     tenant.rfc ?? 'XAXX010101000',
          tax_system: tenant.regimen ?? '612',
          address:    { zip: tenant.cp ?? '89000' },
          email:      tenant.email ?? undefined,
        }),
      })
      const cliente = await crear.json()
      customerId = cliente.id
    }
  }

  const mes = new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' })
  const res = await fetch('https://www.facturapi.io/v2/invoices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type:           'I',
      customer:       customerId,
      payment_form:   '03',       // Transferencia electrónica
      payment_method: 'PUE',
      use:            'G03',
      items: [{
        quantity: 1,
        product: {
          description: `Servicio DocVias Plan ${tenant.plan?.toUpperCase() ?? 'PRO'} — ${mes}`,
          product_key: '81112101',  // Servicios de software en la nube (SaaS)
          unit_key:    'E48',
          unit_name:   'Unidad de servicio',
          price:       monto,
          tax_included: false,
          taxes: [{ type: 'IVA', rate: 0.16, factor: 'Tasa' }],
        },
      }],
    }),
  })
  const factura = await res.json()
  if (!res.ok) throw new Error(factura.message ?? 'Error Facturapi')
  return { factura, customerId }
}

// ── Notificar vía WhatsApp (Twilio) ────────────────────────────────────────
async function notificarWA({ telefono, nombre, monto, pdfUrl, vencimiento, esBloqueo }) {
  const sid   = process.env.VITE_TWILIO_ACCOUNT_SID
  const token = process.env.VITE_TWILIO_AUTH_TOKEN
  const from  = process.env.VITE_TWILIO_WA_NUMBER
  if (!sid || !token || !telefono) return

  const tel = telefono.replace(/\D/g, '')
  const to  = tel.length === 10 ? `whatsapp:+521${tel}` : `whatsapp:+${tel}`

  const msg = esBloqueo
    ? `🔒 *DocVias — Acceso suspendido*\n\nHola Dr. ${nombre}, tu acceso a DocVias ha sido suspendido por falta de pago.\n\nPara reactivar ingresa a tu portal y realiza el pago de *$${monto.toLocaleString('es-MX')} MXN*.\n\n¿Dudas? Escríbenos a este número.`
    : `🧾 *DocVias — Factura mensual disponible*\n\nHola Dr. ${nombre}, tu factura de *$${monto.toLocaleString('es-MX')} MXN* (IVA incluido) está disponible.\n\nFecha límite de pago: *${vencimiento}*\n\nPDF: ${pdfUrl ?? 'Disponible en tu portal'}\n\nIngresa a tu portal para pagar en línea.`

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: msg }),
    }
  )
}

// ── Handler principal ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Verificar autorización
  const secret = req.headers['authorization']?.replace('Bearer ', '') ?? req.query.secret
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const db = getAdmin()
  const ahora = new Date()
  const log = []

  try {
    // Leer configuración fiscal de DocVias
    const configSnap = await db.doc('configuracion/docvias').get()
    const config = configSnap.exists ? configSnap.data() : {}

    // Leer todos los tenants activos
    const tenantsSnap = await db.collection('tenants').get()
    const tenants = tenantsSnap.docs.map(d => ({ _docId: d.id, ...d.data() }))

    for (const tenant of tenants) {
      const tid = tenant._docId
      try {
        // Ignorar tenants sin plan o sin fecha de alta
        if (!tenant.activo) { log.push({ tid, skip: 'inactivo' }); continue }

        const diasGracia     = tenant.diasGracia ?? config.diasGraciaDefault ?? 10
        const plan           = tenant.plan ?? 'pro'
        const precios        = config.precioPlanes ?? { basico:1200, pro:1800, clinica:2800, enterprise:6000 }
        const montoBase      = precios[plan] ?? 1800
        const montoIVA       = Math.round(montoBase * 1.16)

        const fechaProxima   = tenant.fechaProximoPago?.toDate?.() ?? null
        const hoy            = new Date()
        hoy.setHours(0, 0, 0, 0)

        // ¿Es día de cobro? (dia 1 del mes o la fecha próxima)
        const esDiaDeCobro = !fechaProxima || fechaProxima <= hoy

        // ¿Está en periodo de gracia vencido?
        if (fechaProxima) {
          const diasVencido = Math.floor((hoy - fechaProxima) / (1000 * 60 * 60 * 24))
          if (diasVencido > diasGracia && tenant.suscripcionActiva !== false) {
            // Bloquear
            await db.doc(`tenants/${tid}`).update({
              suscripcionActiva: false,
              bloqueadoEn: Timestamp.now(),
              motivoBloqueo: 'Falta de pago',
            })
            await notificarWA({
              telefono: tenant.telefono ?? config.telefonoSoporte,
              nombre:   tenant.nombreDoctor ?? tenant.nombre ?? 'Doctor',
              monto:    montoIVA,
              esBloqueo: true,
            })
            log.push({ tid, accion: 'BLOQUEADO', diasVencido })
            continue
          }
        }

        if (!esDiaDeCobro) { log.push({ tid, skip: 'no_es_dia_de_cobro' }); continue }

        // ── Tenant con suscripción automática Stripe ───────────────────────
        if (tenant.stripeSubscriptionId && tenant.modoPago === 'automatico') {
          // Stripe cobra automáticamente via subscription — solo generar CFDI
          const proximoDia1 = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
          await db.doc(`tenants/${tid}`).update({
            fechaProximoPago: Timestamp.fromDate(proximoDia1),
          })
          log.push({ tid, accion: 'STRIPE_AUTO_OK' })

        } else {
          // ── Tenant con pago manual ─────────────────────────────────────
          // Generar CFDI
          let pdfUrl = null, cfdiId = null
          try {
            const { factura, customerId } = await emitirCFDISuscripcion({ tenant, config, monto: montoBase })
            pdfUrl  = factura.pdf_download_url ?? null
            cfdiId  = factura.id

            // Guardar factura en historial del tenant
            await db.collection(`tenants/${tid}/facturas_docvias`).add({
              facturapiId: factura.id,
              uuid:        factura.uuid,
              pdfUrl,
              xmlUrl:      factura.xml_download_url ?? null,
              total:       factura.total,
              estatus:     factura.status,
              mes:         `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`,
              plan,
              creadoEn:    Timestamp.now(),
              pagado:      false,
            })

            // Actualizar customerId para no buscarlo de nuevo
            if (!tenant.facturapiClienteDocViasId) {
              await db.doc(`tenants/${tid}`).update({ facturapiClienteDocViasId: customerId })
            }
          } catch(fe) {
            console.error(`[cron] CFDI error para ${tid}:`, fe.message)
            log.push({ tid, accion: 'CFDI_ERROR', error: fe.message })
          }

          // Calcular vencimiento (hoy + diasGracia)
          const fechaVenc = new Date(hoy)
          fechaVenc.setDate(fechaVenc.getDate() + diasGracia)
          const proximoDia1 = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
          const vencStr = fechaVenc.toLocaleDateString('es-MX', { day:'numeric', month:'long' })

          await db.doc(`tenants/${tid}`).update({
            fechaProximoPago:  Timestamp.fromDate(proximoDia1),
            fechaVencimiento:  Timestamp.fromDate(fechaVenc),
            ultimoCFDIUrl:     pdfUrl,
            ultimoCFDIId:      cfdiId,
          })

          // Notificar WA
          await notificarWA({
            telefono: tenant.telefono,
            nombre:   tenant.nombreDoctor ?? tenant.nombre ?? 'Doctor',
            monto:    montoIVA,
            pdfUrl,
            vencimiento: vencStr,
            esBloqueo: false,
          })

          log.push({ tid, accion: 'CFDI_GENERADO_WA_ENVIADO', monto: montoIVA })
        }
      } catch(e) {
        console.error(`[cron] Error en tenant ${tid}:`, e)
        log.push({ tid, accion: 'ERROR', error: e.message })
      }
    }

    return res.status(200).json({ ok: true, procesados: log.length, log })
  } catch(e) {
    console.error('[cron] Error general:', e)
    return res.status(500).json({ error: e.message })
  }
}
