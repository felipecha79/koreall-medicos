// api/crear-suscripcion.js — DocVias v22
// Crea una Stripe Checkout Session de suscripción para el doctor
// El doctor guarda su tarjeta → Stripe cobra el día 1 de cada mes

import Stripe from 'stripe'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { tenantId, plan, priceId, email } = req.body
  if (!tenantId || !priceId) return res.status(400).json({ error: 'Faltan parámetros' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const db = getAdmin()

  try {
    const tenantSnap = await db.doc(`tenants/${tenantId}`).get()
    const tenant = tenantSnap.data() ?? {}

    // Buscar o crear customer en Stripe
    let customerId = tenant.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? tenant.email,
        name:  tenant.nombreDoctor ?? tenant.nombre,
        metadata: { tenantId, plan },
      })
      customerId = customer.id
      await db.doc(`tenants/${tenantId}`).update({ stripeCustomerId: customerId })
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`

    // Crear Checkout Session de suscripción
    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: ['card'],
      success_url: `${origin}/suscripcion?pago=exitoso&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/suscripcion?pago=cancelado`,
      subscription_data: {
        metadata: { tenantId, plan },
        billing_cycle_anchor: 'now',
      },
      metadata: { tenantId, plan },
      locale: 'es',
    })

    return res.status(200).json({ sessionId: session.id })
  } catch(e) {
    console.error('[crear-suscripcion]', e)
    return res.status(500).json({ error: e.message })
  }
}
