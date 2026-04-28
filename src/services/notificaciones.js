// src/services/notificaciones.js
// Envía WhatsApp automático cuando cambia el estatus de una cita
// Se llama desde Agenda.jsx y PortalPaciente.jsx al actualizar el estatus

import { enviarWA, formatCitaWA } from './whatsapp'

// ── Mensajes por estatus ──────────────────────────────────
const MENSAJES_ESTATUS = {

  confirmada: (paciente, cita, consultorio) =>
    `✅ Hola ${paciente.nombre}\n\n` +
    `Tu cita en *${consultorio.nombre}* está *confirmada*.\n` +
    `📅 ${cita.fechaFormato} a las *${cita.horaFormato} hrs*\n\n` +
    `Te esperamos. Si necesitas cambiar algo responde a este mensaje.\n\n` +
    `_${consultorio.nombre}_`,

  en_camino: (paciente, cita, consultorio) =>
    `🚗 ¡Perfecto ${paciente.nombre}!\n\n` +
    `El consultorio sabe que vas en camino.\n` +
    `📍 *${consultorio.direccion || consultorio.nombre}*\n\n` +
    `_${consultorio.nombre}_`,

  en_sala: (paciente, cita, consultorio) =>
    `🪑 Hola ${paciente.nombre}\n\n` +
    `Confirmamos que ya estás en la sala de espera.\n` +
    `El doctor estará contigo en breve. ¡Gracias por tu puntualidad!\n\n` +
    `_${consultorio.nombre}_`,

  por_pasar: (paciente, cita, consultorio) =>
    `🔔 *¡Es casi tu turno, ${paciente.nombre}!*\n\n` +
    `El doctor estará listo para atenderte en unos minutos.\n` +
    `Por favor acércate a recepción si aún no lo has hecho.\n\n` +
    `_${consultorio.nombre}_`,

  completada: (paciente, cita, consultorio) =>
    `🩺 Hola ${paciente.nombre}\n\n` +
    `Estás siendo atendido(a) por *${consultorio.nombreDoctor || 'el doctor'}*.\n\n` +
    `_${consultorio.nombre}_`,

  finalizada: (paciente, cita, consultorio) =>
    `🎉 ¡Gracias por tu visita, ${paciente.nombre}!\n\n` +
    `Esperamos haberte atendido muy bien en *${consultorio.nombre}*.\n\n` +
    `Si necesitas tu factura electrónica, accede a tu portal:\n` +
    `👉 ${import.meta.env.VITE_APP_URL ?? 'koreall-medicos.vercel.app'}/portal-paciente\n\n` +
    `¡Hasta pronto! 💚`,

  cancelada: (paciente, cita, consultorio) =>
    `❌ Hola ${paciente.nombre}\n\n` +
    `Tu cita del *${cita.fechaFormato}* en ${consultorio.nombre} ha sido *cancelada*.\n\n` +
    `¿Deseas reagendarla? Responde *REAGENDAR* o llama al ${consultorio.telefonoContacto || consultorio.telefono || ''}\n\n` +
    `_${consultorio.nombre}_`,

  // Recordatorio 24h antes — llamar desde cron/N8N
  recordatorio24h: (paciente, cita, consultorio) =>
    `⏰ Recordatorio — Hola ${paciente.nombre}\n\n` +
    `Mañana tienes cita en *${consultorio.nombre}*\n` +
    `📅 *${cita.fechaFormato}* a las *${cita.horaFormato} hrs*\n\n` +
    `Para confirmar responde *SÍ*\n` +
    `Para cancelar responde *NO*\n\n` +
    `_${consultorio.nombre}_`,

  // Recordatorio 2h antes
  recordatorio2h: (paciente, cita, consultorio) =>
    `⏰ Tu cita es en *2 horas*, ${paciente.nombre}\n` +
    `🏥 ${consultorio.nombre}\n` +
    `🕐 ${cita.horaFormato} hrs\n\n` +
    `¡Te esperamos!`,
}

// ── Función principal ─────────────────────────────────────
// Llama esto desde Agenda.jsx y PortalPaciente.jsx
// cuando cambies el estatus de una cita

export async function notificarCambioEstatus({ cita, nuevoEstatus, tenant }) {
  // Solo notificar si hay teléfono del paciente
  const tel = cita.pacienteTel
  if (!tel) {
    console.log('[Notif] Sin teléfono para', cita.pacienteNombre)
    return { ok: false, razon: 'Sin teléfono' }
  }

  const generarMensaje = MENSAJES_ESTATUS[nuevoEstatus]
  if (!generarMensaje) return { ok: false, razon: 'Estatus sin mensaje' }

  const paciente = {
    nombre: cita.pacienteNombre?.split(' ')[0] ?? 'Paciente',
  }

  const citaWA = formatCitaWA(cita)

  const consultorio = {
    nombre:        tenant?.nombre        ?? 'El consultorio',
    nombreDoctor:  tenant?.nombreDoctor  ?? '',
    direccion:     tenant?.direccion     ?? '',
    telefono:      tenant?.telefono      ?? '',
    telefonoContacto: tenant?.telefonoContacto ?? tenant?.telefono ?? '',
  }

  const mensaje = generarMensaje(paciente, citaWA, consultorio)

  const resultado = await enviarWA(tel, mensaje)
  console.log(`[Notif] ${nuevoEstatus} → ${tel}:`, resultado.ok ? '✓' : resultado.error)
  return resultado
}

// ── Hook para usar en componentes ────────────────────────
// Ejemplo de uso en Agenda.jsx:
//
// import { notificarCambioEstatus } from '../services/notificaciones'
//
// const cambiarEstatus = async (citaId, estatus) => {
//   await updateDoc(...)
//   await notificarCambioEstatus({ cita: modal, nuevoEstatus: estatus, tenant })
// }
