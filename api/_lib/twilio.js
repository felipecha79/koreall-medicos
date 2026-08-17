// api/_lib/twilio.js — Novaryk.Med
// Envío de WhatsApp vía Twilio — SOLO server-side. Las credenciales viven
// exclusivamente en variables de entorno de Vercel sin prefijo VITE_.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN
const FROM_NUMBER  = (process.env.TWILIO_WA_NUMBER || '+5218332468305').replace(/^whatsapp:/i, '')

export const TEMPLATE_SIDS = {
  confirmacion_cita1:     'HXe302e318c29df90e2d63ecc61b10e631',
  recordatorio_cita_24h1: 'HX7e3fc108179b068462e4880491a8b344',
  turno_proximo:          'HXa96c83e1a0b7290dfb45639d22b267e7',
  // ⚠️ Reemplaza este SID por el real una vez que Meta apruebe la plantilla
  // "reactivacion_paciente" (ver instrucciones en PacientesSinCita.jsx)
  reactivacion_paciente:  'HX_PENDIENTE_DE_APROBACION_META',
}

export function normalizarTel(tel) {
  if (!tel) return null
  const digitos = String(tel).replace(/\D/g, '')
  if (digitos.length === 10) return `+521${digitos}`
  if (digitos.length === 13 && digitos.startsWith('521')) return `+${digitos}`
  if (digitos.length === 12 && digitos.startsWith('52')) return `+521${digitos.slice(2)}`
  if (digitos.length >= 11) return `+${digitos}`
  return null
}

async function llamarTwilio(params) {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.log('[WA DEV — sin credenciales Twilio]', params.To, params.Body ?? params.ContentSid)
    return { ok: true, modo: 'desarrollo' }
  }
  const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`
  const body = new URLSearchParams({ From: `whatsapp:${FROM_NUMBER}`, ...params })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (res.ok && data.sid) return { ok: true, sid: data.sid }
  console.error('[WA] Error Twilio:', data)
  return { ok: false, error: data.message ?? 'Error de Twilio' }
}

export async function enviarWA(telefono, mensaje) {
  const tel = normalizarTel(telefono)
  if (!tel) return { ok: false, error: 'Teléfono inválido' }
  return llamarTwilio({ To: `whatsapp:${tel}`, Body: mensaje })
}

export async function enviarPlantillaWA(telefono, nombrePlantilla, parametros = []) {
  const tel = normalizarTel(telefono)
  if (!tel) return { ok: false, error: 'Teléfono inválido' }
  const contentSid = TEMPLATE_SIDS[nombrePlantilla]
  if (!contentSid) return { ok: false, error: `Plantilla ${nombrePlantilla} no configurada` }

  const contentVariables = JSON.stringify(
    parametros.reduce((obj, val, idx) => ({ ...obj, [String(idx + 1)]: val }), {})
  )
  return llamarTwilio({
    To: `whatsapp:${tel}`,
    ContentSid: contentSid,
    ContentVariables: contentVariables,
  })
}
