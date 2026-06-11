// src/services/whatsapp.js
// Envío de mensajes WhatsApp via Twilio con plantillas autorizadas
//
// CONFIGURACIÓN REQUERIDA en .env.local y Vercel:
//   VITE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   VITE_TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   VITE_TWILIO_WA_NUMBER=+5218332468305

const ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID
const AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN
const FROM_NUMBER = import.meta.env.VITE_TWILIO_WA_NUMBER || '+5218332468305'

// ── Template SIDs autorizados en Twilio ────────────
const TEMPLATE_SIDS = {
  confirmacion_cita1: 'HXe302e318c29df90e2d63ecc61b10e631',
  recordatorio_cita_24h1: 'HX7e3fc108179b068462e4880491a8b344',
  turno_proximo: 'HXa96c83e1a0b7290dfb45639d22b267e7',
}

// ── Validar que el teléfono tiene formato correcto ────────
function normalizarTel(tel) {
  if (!tel) return null
  const digitos = tel.replace(/\D/g, '')
  if (digitos.length === 10) return `+521${digitos}`
  if (digitos.length === 13 && digitos.startsWith('521')) return `+${digitos}`
  if (digitos.length === 12 && digitos.startsWith('52')) return `+521${digitos.slice(2)}`
  if (digitos.length >= 11) return `+${digitos}`
  return null
}

// ── Enviar mensaje WhatsApp via Twilio ────────────────────
export async function enviarWA(telefono, mensaje) {
  const telFormateado = normalizarTel(telefono)

  // Modo desarrollo: solo mostrar en consola
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.log(`[WA DEV] → ${telFormateado ?? telefono}:\n${mensaje}`)
    return { ok: true, modo: 'desarrollo' }
  }

  if (!telFormateado) {
    console.warn(`[WA] Teléfono inválido: ${telefono}`)
    return { ok: false, error: 'Teléfono inválido' }
  }

  try {
    const credentials = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`

    const body = new URLSearchParams({
      From: `whatsapp:${FROM_NUMBER}`,
      To: `whatsapp:${telFormateado}`,
      Body: mensaje,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await response.json()

    if (response.ok && data.sid) {
      console.log(`[WA] ✓ Enviado a ${telFormateado} — SID: ${data.sid}`)
      return { ok: true, sid: data.sid }
    } else {
      console.error('[WA] Error Twilio:', data)
      return { ok: false, error: data.message ?? 'Error de Twilio' }
    }
  } catch(e) {
    console.error('[WA] Error de red:', e.message)
    return { ok: false, error: e.message }
  }
}

// ── Enviar plantilla de WhatsApp via Twilio ────────────────────
export async function enviarPlantillaWA(telefono, nombrePlantilla, parametros = []) {
  const telFormateado = normalizarTel(telefono)
  const contentSid = TEMPLATE_SIDS[nombrePlantilla]

  // Modo desarrollo
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.log(`[WA DEV PLANTILLA] → ${telFormateado}: ${nombrePlantilla}(${parametros.join(', ')})`)
    return { ok: true, modo: 'desarrollo' }
  }

  if (!telFormateado) {
    console.warn(`[WA] Teléfono inválido: ${telefono}`)
    return { ok: false, error: 'Teléfono inválido' }
  }

  if (!contentSid) {
    console.error(`[WA] Plantilla no encontrada: ${nombrePlantilla}`)
    return { ok: false, error: `Plantilla ${nombrePlantilla} no configurada` }
  }

  try {
    const credentials = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`

    // Crear JSON de parámetros
    const contentVariables = JSON.stringify(parametros.reduce((obj, val, idx) => {
      obj[String(idx + 1)] = val
      return obj
    }, {}))

    const body = new URLSearchParams({
      From: `whatsapp:${FROM_NUMBER}`,
      To: `whatsapp:${telFormateado}`,
      ContentSid: contentSid,
      ContentVariables: contentVariables,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await response.json()

    if (response.ok && data.sid) {
      console.log(`[WA] ✓ Plantilla ${nombrePlantilla} enviada a ${telFormateado}`)
      return { ok: true, sid: data.sid }
    } else {
      console.error('[WA] Error Twilio:', data)
      return { ok: false, error: data.message ?? 'Error de Twilio' }
    }
  } catch(e) {
    console.error('[WA] Error de red:', e.message)
    return { ok: false, error: e.message }
  }
}

// ── Formatear datos de la cita para los mensajes ──────────
export function formatCitaWA(cita) {
  try {
    const fecha = cita.fecha?.toDate
      ? cita.fecha.toDate()
      : cita.fecha?.seconds
        ? new Date(cita.fecha.seconds * 1000)
        : new Date()

    const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
    const meses = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre']

    return {
      fechaFormato: `${dias[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]} ${fecha.getFullYear()}`,
      horaFormato:  `${String(fecha.getHours()).padStart(2,'0')}:${String(fecha.getMinutes()).padStart(2,'0')}`,
      fecha,
    }
  } catch {
    return { fechaFormato: 'fecha por confirmar', horaFormato: '', fecha: new Date() }
  }
}
