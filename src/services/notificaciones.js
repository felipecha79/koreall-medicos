// src/services/notificaciones.js
// Todos los puntos de notificación WhatsApp del sistema MediDesk
// Requiere: VITE_TWILIO_ACCOUNT_SID, VITE_TWILIO_AUTH_TOKEN, VITE_TWILIO_WA_NUMBER

import { enviarWA, formatCitaWA } from './whatsapp'

const drNombre = (tenant) => tenant?.nombreDoctor ?? tenant?.nombre ?? 'el consultorio'

// 1. CITA CONFIRMADA
export async function notifCitaConfirmada(cita, tenant) {
  if (!cita?.pacienteTel) return
  const { fechaFormato, horaFormato } = formatCitaWA(cita)
  return enviarWA(cita.pacienteTel,
    `✅ *Cita confirmada*\n\nHola ${cita.pacienteNombre}, tu cita con ${drNombre(tenant)} ha sido confirmada.\n\n` +
    `📅 *Fecha:* ${fechaFormato}\n🕐 *Hora:* ${horaFormato}\n📍 ${tenant?.direccion ?? ''}\n\n` +
    `Por favor llega 5 minutos antes. Para cancelar responde este mensaje. 🏥`
  )
}

// 2. RECORDATORIO 24H ANTES
export async function notifRecordatorio24h(cita, tenant) {
  if (!cita?.pacienteTel) return
  const { fechaFormato, horaFormato } = formatCitaWA(cita)
  return enviarWA(cita.pacienteTel,
    `⏰ *Recordatorio — cita mañana*\n\nHola ${cita.pacienteNombre} 👋\n\n` +
    `Mañana tienes cita con ${drNombre(tenant)}.\n\n` +
    `📅 *${fechaFormato}* a las *${horaFormato}*\n\n` +
    `Responde *SÍ* ✅ para confirmar o avísanos si necesitas reprogramar. ¡Te esperamos! 🏥`
  )
}

// 3. CAMBIO DE ESTATUS EN TURNO
const MSG_ESTATUS = {
  en_sala:      (n, dr) => `🪑 Hola ${n}, ya puedes pasar a la sala de espera de ${dr}. En breve te llamaremos 😊`,
  por_pasar:    (n, dr) => `🔔 *¡Es tu turno, ${n}!* Por favor pasa al consultorio de ${dr}. ¡Te esperamos! 🏥`,
  en_consulta:  (n, dr) => `🩺 Hola ${n}, el doctor de ${dr} te atenderá ahora. Si tienes estudios, tenlos listos ✅`,
  finalizada:   (n, dr) => `✅ Hola ${n}, tu consulta con ${dr} ha finalizado.\n\nPuedes ver tu receta y solicitar factura desde tu portal de paciente. Que te mejores 💙`,
}

export async function notifCambioEstatus(cita, nuevoEstatus, tenant) {
  if (!cita?.pacienteTel) return
  const fn = MSG_ESTATUS[nuevoEstatus]
  if (!fn) return
  return enviarWA(cita.pacienteTel, fn(cita.pacienteNombre, drNombre(tenant)))
}

// 4. CITA CANCELADA
export async function notifCitaCancelada(cita, tenant, motivo = '') {
  if (!cita?.pacienteTel) return
  const { fechaFormato, horaFormato } = formatCitaWA(cita)
  return enviarWA(cita.pacienteTel,
    `❌ *Cita cancelada*\n\nHola ${cita.pacienteNombre}, tu cita del *${fechaFormato} a las ${horaFormato}* fue cancelada.\n` +
    (motivo ? `📝 Motivo: ${motivo}\n` : '') +
    `\nPara reagendar responde este mensaje o visita tu portal. 📅`
  )
}

// 5. RECETA LISTA
export async function notifRecetaLista(paciente, recetaId, urlPortal = '') {
  if (!paciente?.telefono) return
  return enviarWA(paciente.telefono,
    `💊 *Tu receta está lista*\n\nHola ${paciente.nombre}, tu receta (${recetaId}) ya está disponible.\n\n` +
    (urlPortal ? `📱 Descárgala: ${urlPortal}\n\n` : `📱 Descárgala desde tu portal de paciente.\n\n`) +
    `Si tienes dudas sobre los medicamentos, contáctanos ✅`
  )
}

// 6. FACTURA TIMBRADA
export async function notifFacturaLista(paciente, factura, urlPortal = '') {
  if (!paciente?.telefono) return
  return enviarWA(paciente.telefono,
    `🧾 *Tu factura está lista*\n\nHola ${paciente.nombre}, tu CFDI por ` +
    `*$${Number(factura.total ?? 0).toLocaleString('es-MX')} MXN* fue timbrado ante el SAT.\n\n` +
    `📋 Folio: ${factura.serie ?? ''}${factura.folio ?? ''}\n` +
    (urlPortal ? `📱 Descárgala: ${urlPortal}\n` : '') +
    `\nVálida para deducción de impuestos ✅`
  )
}

// 7. BIENVENIDA (registro exitoso)
export async function notifBienvenida(paciente, tenant, urlPortal = '') {
  if (!paciente?.telefono) return
  return enviarWA(paciente.telefono,
    `🎉 *¡Bienvenido a ${drNombre(tenant)}!*\n\nHola ${paciente.nombre}, tu cuenta fue creada exitosamente.\n\n` +
    `Con tu portal puedes:\n• 📅 Agendar citas\n• 💊 Ver recetas\n• 🧾 Solicitar facturas\n• 📊 Tu historial\n\n` +
    (urlPortal ? `Accede aquí: ${urlPortal}\n\n` : '') +
    `¡Bienvenido! 🏥`
  )
}

// 8. PAGO PENDIENTE (manual)
export async function notifPagoPendiente(paciente, cobro, tenant) {
  if (!paciente?.telefono) return
  return enviarWA(paciente.telefono,
    `💰 *Recordatorio de pago*\n\nHola ${paciente.nombre}, tienes un pago pendiente con ${drNombre(tenant)}.\n\n` +
    `💵 *Monto:* $${Number(cobro.monto ?? 0).toLocaleString('es-MX')} MXN\n` +
    `📋 *Concepto:* ${cobro.concepto ?? 'Consulta médica'}\n\n` +
    `Paga desde tu portal o en el consultorio. Si ya pagaste, ignora este mensaje ✅`
  )
}

// 9. TE EXTRAÑAMOS (desde reporte de seguimiento)
export async function notifTeExtranamos(paciente, diasSinCita, tenant) {
  if (!paciente?.telefono) return
  return enviarWA(paciente.telefono,
    `👋 *${drNombre(tenant)} te extraña*\n\nHola ${paciente.nombre}, han pasado *${diasSinCita} días* desde tu última visita.\n\n` +
    `¿Cómo te has sentido? La revisión periódica es clave para tu salud.\n\n` +
    `📅 Agenda tu cita desde tu portal o responde este mensaje. ¡Te esperamos! 💙`
  )
}

// 10. PAGO RECIBIDO
export async function notifPagoRecibido(paciente, cobro, tenant) {
  if (!paciente?.telefono) return
  return enviarWA(paciente.telefono,
    `✅ *Pago confirmado*\n\nHola ${paciente.nombre}, recibimos tu pago de ` +
    `*$${Number(cobro.monto ?? 0).toLocaleString('es-MX')} MXN* en ${drNombre(tenant)}.\n\n` +
    `🧾 Si necesitas factura CFDI solicítala desde tu portal. ¡Gracias! 🏥`
  )
}

// ── Mapa de todos los puntos ──────────────────────────────
export const PUNTOS_NOTIFICACION = [
  { id:'cita_confirmada',  automatico:true,  desc:'Al confirmar una cita desde la Agenda' },
  { id:'recordatorio_24h', automatico:true,  desc:'24h antes (requiere N8N o Cloud Function cron)' },
  { id:'cambio_estatus',   automatico:true,  desc:'Al cambiar estatus: en sala, por pasar, finalizada' },
  { id:'cita_cancelada',   automatico:true,  desc:'Al cancelar una cita' },
  { id:'receta_lista',     automatico:true,  desc:'Al generar una receta nueva' },
  { id:'factura_lista',    automatico:true,  desc:'Al timbrar un CFDI exitosamente' },
  { id:'bienvenida',       automatico:true,  desc:'Al completar el registro de paciente' },
  { id:'pago_pendiente',   automatico:false, desc:'Manual desde módulo de Cobros' },
  { id:'te_extranamos',    automatico:false, desc:'Manual desde Reportes → Seguimiento pacientes' },
  { id:'pago_recibido',    automatico:true,  desc:'Al marcar un cobro como pagado' },
]
