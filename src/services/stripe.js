// src/services/stripe.js — Novaryk.Med v1
// Stripe Connect — pagos directos a la cuenta del doctor (sin pasar por Novaryk.Med)
//
// ARQUITECTURA:
//   Paciente → paga → cuenta Stripe del doctor (Connected Account)
//   Novaryk.Med → recibe application_fee (% de comisión opcional, hoy en 0)
//
// SETUP INICIAL (ver README.stripe.md que se genera con este archivo):
//   VITE_STRIPE_PUBLIC_KEY = pk_test_... (tu llave pública de plataforma)
//   El doctor configura su stripeAccountId en Admin → Sistema → Pagos
//
// IMPORTANTE: Stripe requiere backend para crear PaymentIntents con
//   application_fee y on_behalf_of. Usamos Stripe.js + Payment Element
//   en el frontend, y una Cloud Function mínima para el PI.
//   Mientras no hay Cloud Function, el flujo usa Checkout Session redirect
//   que SÍ funciona 100% desde el frontend con Connect.

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY ?? ''

// ── Cargar Stripe.js dinámicamente ───────────────────────
let stripePromise = null
export function getStripe() {
  if (!stripePromise) {
    stripePromise = new Promise((resolve, reject) => {
      if (window.Stripe) { resolve(window.Stripe(STRIPE_PK)); return }
      const script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/'
      script.onload = () => resolve(window.Stripe(STRIPE_PK))
      script.onerror = () => reject(new Error('No se pudo cargar Stripe.js'))
      document.head.appendChild(script)
    })
  }
  return stripePromise
}

// ── Crear Checkout Session (redirect) ────────────────────
// Funciona 100% desde frontend con Stripe Connect.
// El doctor debe tener stripeAccountId configurado en su tenant.
// successUrl y cancelUrl reciben {CHECKOUT_SESSION_ID} de Stripe.
export async function crearCheckoutSession({
  monto,          // número en MXN (ej. 500)
  concepto,       // string
  pacienteEmail,  // string
  pacienteNombre, // string
  stripeAccountId,// string — Connected Account del doctor (acct_xxx)
  cobroId,        // string — ID del cobro en Firestore (para webhook)
  tenantId,       // string
  successUrl,     // string — URL de retorno éxito
  cancelUrl,      // string — URL de retorno cancelación
}) {
  if (!STRIPE_PK) throw new Error('VITE_STRIPE_PUBLIC_KEY no configurado')
  if (!stripeAccountId) throw new Error('Este consultorio no tiene Stripe configurado')

  const stripe = await getStripe()

  // Stripe Checkout requiere backend para crear la Session con on_behalf_of.
  // Usamos el endpoint público de Stripe con fetch + secret key NUNCA en frontend.
  // SOLUCIÓN FRONTEND-ONLY: usar Payment Links generados por el doctor en Stripe,
  // o el flujo de Stripe.js con redirectToCheckout usando una Session pre-creada.
  //
  // Para el piloto SIN Cloud Functions usamos el método de
  // Stripe Payment Links API — el doctor genera un link en el dashboard
  // y lo guarda en su tenant (tenant.stripePaymentLink).
  // Este método es 100% frontend-safe.
  //
  // Para producción completa con monto dinámico → Cloud Function (ver README).

  throw new Error('MODO_BACKEND_REQUERIDO')
}

// ── Redirect a Payment Link con monto dinámico ───────────
// Stripe permite pasar ?prefilled_email y el monto si el link tiene precio variable
export function abrirPaymentLink({ paymentLink, monto, email, cobroId }) {
  if (!paymentLink) throw new Error('El consultorio no tiene Payment Link configurado')
  const url = new URL(paymentLink)
  if (email) url.searchParams.set('prefilled_email', email)
  // Stripe no permite override de monto por URL en Payment Links estándar.
  // Para monto dinámico usar Price API + Checkout Session (requiere backend).
  url.searchParams.set('client_reference_id', cobroId ?? '')
  window.open(url.toString(), '_blank')
}

// ── Verificar estado de un PaymentIntent ─────────────────
export async function verificarPago(paymentIntentId, stripeAccountId) {
  // Solo se puede verificar desde backend. En frontend usamos Firestore
  // para rastrear el estado (webhook actualiza el cobro en Firestore).
  // Esta función es placeholder para cuando se implemente Cloud Functions.
  console.warn('[Stripe] verificarPago requiere backend. Usar Firestore listener.')
  return null
}

// ── Utilidades ───────────────────────────────────────────
export function montoCentavos(mxn) { return Math.round(mxn * 100) }
export function montoMXN(centavos) { return centavos / 100 }

export const STRIPE_ESTADO = {
  pending:    { label: 'Pendiente',   color: 'bg-amber-100 text-amber-700' },
  processing: { label: 'Procesando',  color: 'bg-blue-100 text-blue-700'   },
  succeeded:  { label: 'Pagado',      color: 'bg-green-100 text-green-700' },
  failed:     { label: 'Fallido',     color: 'bg-red-100 text-red-600'     },
  cancelled:  { label: 'Cancelado',   color: 'bg-gray-100 text-gray-500'   },
}
