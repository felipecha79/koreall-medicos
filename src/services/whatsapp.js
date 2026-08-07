// src/services/whatsapp.js
// Cliente delgado: manda al endpoint /api/whatsapp (server-side).
// Las credenciales de Twilio ya NO viven en este archivo ni en el navegador.

async function llamarProxy(payload) {
  const res = await fetch('/api/whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[WA] Error:', data.error)
    return { ok: false, error: data.error ?? `API ${res.status}` }
  }
  return data
}

// ── Enviar mensaje libre ──────────────────────────────────
export async function enviarWA(telefono, mensaje) {
  return llamarProxy({ accion: 'libre', telefono, mensaje })
}

// ── Enviar plantilla autorizada ───────────────────────────
export async function enviarPlantillaWA(telefono, nombrePlantilla, parametros = []) {
  return llamarProxy({ accion: 'plantilla', telefono, plantilla: nombrePlantilla, parametros })
}

// ── Formatear datos de la cita para los mensajes (sin cambios) ──
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
