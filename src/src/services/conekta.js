// src/services/conekta.js
// Wrapper para Conekta pagos en línea
// Docs: https://developers.conekta.com
//
// SETUP:
// 1. Crea cuenta en conekta.com
// 2. Ve a Developers → API Keys
// 3. Usa la key de TEST para desarrollo (empieza con key_test_...)
// 4. Agrega al .env.local:
//    VITE_CONEKTA_PUBLIC_KEY=key_test_TU_KEY_AQUI
//
// IMPORTANTE: La llave PRIVADA (key_test_XXXXX) NUNCA va en el frontend.
// Para cobros reales con Conekta necesitas un backend o Cloud Function.
// Esta implementación usa el flujo de "Order" para generar referencias OXXO y SPEI.

const CONEKTA_URL = 'https://api.conekta.io'
// Para el piloto usamos Basic Auth con la key pública (modo cliente)
const PUB_KEY = import.meta.env.VITE_CONEKTA_PUBLIC_KEY ?? ''

// ── Tokenizar tarjeta (cliente) ───────────────────────────
// Conekta.js se carga desde CDN — ver index.html
export function tokenizarTarjeta(cardData) {
  return new Promise((resolve, reject) => {
    if (!window.Conekta) {
      reject(new Error('Conekta.js no cargado'))
      return
    }
    window.Conekta.setPublicKey(PUB_KEY)
    window.Conekta.Token.create(
      { card: cardData },
      token  => resolve(token.id),
      error  => reject(new Error(error.message_to_purchaser))
    )
  })
}

// ── Generar referencia OXXO Pay ───────────────────────────
// Esta función debe llamarse desde tu backend/Cloud Function
// con la llave privada. Aquí se muestra la estructura del payload.
export function payloadOxxo({ monto, paciente, concepto }) {
  return {
    currency:     'MXN',
    customer_info: {
      name:  `${paciente.nombre} ${paciente.apellidos}`,
      email: paciente.email ?? 'sin@email.com',
      phone: paciente.telefono ?? '0000000000',
    },
    line_items: [{
      name:       concepto ?? 'Honorarios médicos',
      unit_price: monto * 100, // Conekta usa centavos
      quantity:   1,
    }],
    charges: [{
      payment_method: {
        type:       'oxxo_cash',
        expires_at: Math.floor(Date.now()/1000) + (3 * 24 * 60 * 60), // 3 días
      }
    }],
  }
}

// ── Generar referencia SPEI ───────────────────────────────
export function payloadSpei({ monto, paciente, concepto }) {
  return {
    currency: 'MXN',
    customer_info: {
      name:  `${paciente.nombre} ${paciente.apellidos}`,
      email: paciente.email ?? 'sin@email.com',
      phone: paciente.telefono ?? '0000000000',
    },
    line_items: [{
      name:       concepto ?? 'Honorarios médicos',
      unit_price: monto * 100,
      quantity:   1,
    }],
    charges: [{
      payment_method: { type: 'spei' }
    }],
  }
}

// ── Cobro con tarjeta tokenizada ──────────────────────────
export function payloadTarjeta({ monto, paciente, concepto, tokenId }) {
  return {
    currency: 'MXN',
    customer_info: {
      name:  `${paciente.nombre} ${paciente.apellidos}`,
      email: paciente.email ?? 'sin@email.com',
      phone: paciente.telefono ?? '0000000000',
    },
    line_items: [{
      name:       concepto ?? 'Honorarios médicos',
      unit_price: monto * 100,
      quantity:   1,
    }],
    charges: [{
      payment_method: {
        type:     'card',
        token_id: tokenId,
      }
    }],
  }
}

export const ESTADO_PAGO = {
  pending:    { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700' },
  paid:       { label: 'Pagado',     color: 'bg-green-100 text-green-700' },
  expired:    { label: 'Expirado',   color: 'bg-red-100 text-red-600' },
  refunded:   { label: 'Reembolsado',color: 'bg-gray-100 text-gray-600' },
}
