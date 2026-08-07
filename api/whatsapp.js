// api/whatsapp.js — Novaryk.Med
// Endpoint on-demand para enviar WhatsApp desde el frontend (confirmaciones,
// cambios de estatus en Agenda, etc). Las credenciales de Twilio ya no
// viven en el navegador — solo aquí.

import { enviarWA, enviarPlantillaWA } from './_lib/twilio.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const { accion, telefono, mensaje, plantilla, parametros } = req.body || {}

  try {
    let resultado
    if (accion === 'plantilla') {
      if (!telefono || !plantilla) return res.status(400).json({ error: 'Falta telefono o plantilla' })
      resultado = await enviarPlantillaWA(telefono, plantilla, parametros ?? [])
    } else {
      if (!telefono || !mensaje) return res.status(400).json({ error: 'Falta telefono o mensaje' })
      resultado = await enviarWA(telefono, mensaje)
    }
    return res.status(200).json(resultado)
  } catch (e) {
    console.error('[whatsapp]', e)
    return res.status(500).json({ error: e.message })
  }
}
