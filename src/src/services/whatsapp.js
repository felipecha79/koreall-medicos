// src/services/whatsapp.js
// Wrapper para WhatsApp Business via Twilio
//
// SETUP RÁPIDO (sandbox — sin aprobación):
// 1. Crea cuenta en twilio.com (gratis)
// 2. Ve a Messaging → Try it out → Send a WhatsApp message
// 3. Sigue las instrucciones para unirte al sandbox desde tu celular
// 4. Copia tu Account SID y Auth Token
// 5. Agrega al .env.local:
//    VITE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    VITE_TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    VITE_TWILIO_WA_NUMBER=+14155238886  (número sandbox de Twilio)
//
// IMPORTANTE: En producción estas keys van en Cloud Functions, no en frontend.
// Para el piloto funcionan en cliente.

const TWILIO_SID   = import.meta.env.VITE_TWILIO_ACCOUNT_SID ?? ''
const TWILIO_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN  ?? ''
const WA_FROM      = import.meta.env.VITE_TWILIO_WA_NUMBER ?? '+14155238886'

const TWILIO_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`

// ── Función base de envío ─────────────────────────────────
export async function enviarWA(telefono, mensaje) {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn('[WhatsApp] Twilio no configurado — agrega VITE_TWILIO_* al .env.local')
    return { ok: false, error: 'No configurado' }
  }

  // Normalizar teléfono mexicano
  const tel = normalizarTel(telefono)
  if (!tel) return { ok: false, error: 'Teléfono inválido' }

  try {
    const body = new URLSearchParams({
      From: `whatsapp:${WA_FROM}`,
      To:   `whatsapp:${tel}`,
      Body: mensaje,
    })

    const res = await fetch(TWILIO_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.message ?? 'Error Twilio')
    return { ok: true, sid: data.sid }
  } catch(e) {
    console.error('[WhatsApp] Error:', e.message)
    return { ok: false, error: e.message }
  }
}

// ── Normalizar teléfono a formato internacional ───────────
function normalizarTel(tel) {
  if (!tel) return null
  const limpio = tel.replace(/\D/g, '')
  if (limpio.length === 10) return `+52${limpio}` // México sin código
  if (limpio.length === 12 && limpio.startsWith('52')) return `+${limpio}`
  if (limpio.startsWith('+')) return tel
  return `+${limpio}`
}

// ── Mensajes predefinidos ─────────────────────────────────

export const MENSAJES = {

  // Confirmación de cita agendada
  citaAgendada: (paciente, cita, consultorio) =>
    `Hola ${paciente.nombre} 👋\n\n` +
    `Tu cita en *${consultorio.nombre}* ha sido *confirmada* ✅\n\n` +
    `📅 *Fecha:* ${cita.fechaFormato}\n` +
    `🕐 *Hora:* ${cita.horaFormato} hrs\n` +
    `📋 *Motivo:* ${cita.motivo || 'Consulta general'}\n\n` +
    `📍 *Dirección:* ${consultorio.direccion || ''}\n\n` +
    `Si necesitas cancelar o reagendar, responde a este mensaje o llama al ${consultorio.telefono}.\n\n` +
    `_MediDesk · ${consultorio.nombre}_`,

  // Recordatorio 24h antes
  recordatorio24h: (paciente, cita, consultorio) =>
    `Hola ${paciente.nombre} 🌟\n\n` +
    `Te recordamos que *mañana* tienes cita en *${consultorio.nombre}*\n\n` +
    `📅 *${cita.fechaFormato}* a las *${cita.horaFormato} hrs*\n\n` +
    `Para confirmar tu asistencia responde *SÍ*\n` +
    `Para cancelar responde *NO*\n\n` +
    `_MediDesk · ${consultorio.nombre}_`,

  // Recordatorio 2h antes
  recordatorio2h: (paciente, cita, consultorio) =>
    `⏰ Hola ${paciente.nombre}\n\n` +
    `Tu cita en *${consultorio.nombre}* es *en 2 horas*\n` +
    `🕐 A las *${cita.horaFormato} hrs*\n\n` +
    `📍 ${consultorio.direccion || ''}\n\n` +
    `¡Te esperamos!`,

  // Aviso de turno próximo (30 min)
  turnoProximo: (paciente, consultorio) =>
    `🔔 Hola ${paciente.nombre}\n\n` +
    `*Ya casi es tu turno* en ${consultorio.nombre} 🏥\n\n` +
    `En aproximadamente *30 minutos* será tu consulta.\n` +
    `Si ya estás aquí, por favor notifica en recepción.\n\n` +
    `_${consultorio.nombre}_`,

  // Es tu turno
  esTuTurno: (paciente, consultorio) =>
    `✅ *¡Es tu turno, ${paciente.nombre}!*\n\n` +
    `Por favor pasa al consultorio de *${consultorio.nombreDoctor}*\n\n` +
    `_${consultorio.nombre}_`,

  // Cita cancelada
  citaCancelada: (paciente, cita, consultorio) =>
    `Hola ${paciente.nombre}\n\n` +
    `Tu cita del *${cita.fechaFormato}* en ${consultorio.nombre} ha sido *cancelada*.\n\n` +
    `¿Deseas reagendarla? Responde *REAGENDAR* o llama al ${consultorio.telefono}\n\n` +
    `_MediDesk · ${consultorio.nombre}_`,

  // Post-consulta con link de pago
  postConsultaConPago: (paciente, cobro, linkPago, consultorio) =>
    `Hola ${paciente.nombre} 👋\n\n` +
    `Gracias por tu visita a *${consultorio.nombre}* 🏥\n\n` +
    `💳 *Tu saldo pendiente:* $${Number(cobro.monto).toLocaleString('es-MX')} MXN\n` +
    `📋 *Concepto:* ${cobro.concepto}\n\n` +
    `Paga en línea de forma segura:\n` +
    `👉 ${linkPago}\n\n` +
    `¿Necesitas factura? Responde *FACTURA* con tu RFC.\n\n` +
    `_MediDesk · ${consultorio.nombre}_`,

  // Bienvenida nuevo paciente (registro por WA)
  bienvenida: (paciente, consultorio, linkPortal) =>
    `¡Bienvenido/a ${paciente.nombre}! 🎉\n\n` +
    `Tu perfil en *${consultorio.nombre}* ha sido creado exitosamente.\n\n` +
    `🔑 Accede a tu expediente y citas en:\n` +
    `👉 ${linkPortal}\n\n` +
    `Tus datos de acceso son tu correo: *${paciente.email}*\n\n` +
    `Si tienes dudas responde a este mensaje.\n\n` +
    `_MediDesk · ${consultorio.nombre}_`,

  // Solicitud de reagenda
  reagenda: (paciente, consultorio) =>
    `Hola ${paciente.nombre} 👋\n\n` +
    `Recibimos tu solicitud de reagendar tu cita en *${consultorio.nombre}*.\n\n` +
    `Un momento de nuestro equipo te contactará para confirmar la nueva fecha.\n\n` +
    `O si prefieres, puedes seleccionar tu horario directamente en:\n` +
    `👉 ${import.meta.env.VITE_PORTAL_URL ?? 'medideskmx.com/portal'}\n\n` +
    `_${consultorio.nombre}_`,

  // Recordatorio de factura pendiente
  facturaDisponible: (paciente, consultorio) =>
    `Hola ${paciente.nombre} 🧾\n\n` +
    `Tu *factura electrónica* de ${consultorio.nombre} ya está disponible.\n\n` +
    `Descárgala desde tu portal:\n` +
    `👉 ${import.meta.env.VITE_PORTAL_URL ?? 'medideskmx.com/portal'}\n\n` +
    `_${consultorio.nombre}_`,
}

// ── Helpers de formato de fecha ───────────────────────────
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatCitaWA(cita) {
  const fecha = cita.fecha?.toDate ? cita.fecha.toDate() : new Date(cita.fecha)
  return {
    fechaFormato: format(fecha, "EEEE d 'de' MMMM", { locale: es }),
    horaFormato:  format(fecha, 'HH:mm'),
  }
}
