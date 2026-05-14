// api/stripe-webhook.js — DocVias v22
// Recibe eventos de Stripe: pago exitoso de suscripción → reactiva tenant
// Configurar en Stripe Dashboard → Webhooks → tu-dominio.vercel.app/api/stripe-webhook

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

function getAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })})
  }
  return getFirestore()
}

export const config = { api: { bodyParser: false } }

async function buffer(readable) {
  const chunks = []
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY))
  const sig    = req.headers['stripe-signature']
  const buf    = await buffer(req)

  let event
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    return res.status(400).json({ error: `Webhook error: ${e.message}` })
  }

  const db = getAdmin()

  if (event.type === 'invoice.payment_succeeded') {
    const inv = event.data.object
    const subId = inv.subscription

    // Buscar tenant por stripeSubscriptionId
    const snap = await db.collection('tenants')
      .where('stripeSubscriptionId', '==', subId).limit(1).get()

    if (!snap.empty) {
      const tid = snap.docs[0].id
      const proximoDia1 = new Date()
      proximoDia1.setMonth(proximoDia1.getMonth() + 1, 1)
      proximoDia1.setHours(0, 0, 0, 0)

      await db.doc(`tenants/${tid}`).update({
        suscripcionActiva: true,
        fechaProximoPago:  Timestamp.fromDate(proximoDia1),
        ultimoPagoStripe:  Timestamp.now(),
        bloqueadoEn:       null,
        motivoBloqueo:     null,
      })

      // Registrar en historial
      await db.collection(`tenants/${tid}/facturas_docvias`).add({
        stripeInvoiceId: inv.id,
        total:           inv.amount_paid / 100,
        estatus:         'paid',
        mes:             new Date().toISOString().slice(0, 7),
        pagado:          true,
        pagadoEn:        Timestamp.now(),
        pdfUrl:          inv.invoice_pdf ?? null,
      })
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const inv   = event.data.object
    const subId = inv.subscription
    const snap  = await db.collection('tenants')
      .where('stripeSubscriptionId', '==', subId).limit(1).get()
    if (!snap.empty) {
      await db.doc(`tenants/${snap.docs[0].id}`).update({
        ultimoFalloPago: Timestamp.now(),
        falloPagoMensaje: inv.last_finalization_error?.message ?? 'Pago rechazado',
      })
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub  = event.data.object
    const snap = await db.collection('tenants')
      .where('stripeSubscriptionId', '==', sub.id).limit(1).get()
    if (!snap.empty) {
      await db.doc(`tenants/${snap.docs[0].id}`).update({
        stripeSubscriptionId: null,
        modoPago: 'manual',
      })
    }
  }

  return res.status(200).json({ received: true })
}
