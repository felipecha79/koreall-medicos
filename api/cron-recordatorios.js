// api/cron-recordatorios.js — Novaryk.Med
// Corre 1 vez al día vía Vercel Cron (ver vercel.json) y manda recordatorio
// de WhatsApp (plantilla recordatorio_cita_24h1) a todos los pacientes con
// cita programada para MAÑANA, en todos los tenants.
//
// Idempotente: marca cada cita con recordatorioEnviado=true para no
// duplicar el envío si el cron llega a correr más de una vez el mismo día.

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { enviarPlantillaWA } from './_lib/twilio.js'

function getAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  return getFirestore()
}

function formatHora(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  // Autenticación: Vercel Cron manda el secret en el header Authorization,
  // pero también se puede correr manualmente con ?secret=CRON_SECRET
  const secret = req.headers['authorization']?.replace('Bearer ', '') ?? req.query?.secret
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const db = getAdmin()

  // Ventana de "mañana" en hora de México (UTC-6). Se ajusta con margen
  // para no depender de dónde corre el servidor de Vercel.
  const ahora = new Date()
  const mananaInicio = new Date(ahora)
  mananaInicio.setDate(mananaInicio.getDate() + 1)
  mananaInicio.setHours(0, 0, 0, 0)
  const mananaFin = new Date(mananaInicio)
  mananaFin.setHours(23, 59, 59, 999)

  const resumen = { tenants: 0, citasRevisadas: 0, enviados: 0, errores: [] }

  try {
    const tenantsSnap = await db.collection('tenants').get()
    resumen.tenants = tenantsSnap.size

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id
      const tenant = tenantDoc.data()

      const citasSnap = await db
        .collection(`tenants/${tenantId}/citas`)
        .where('fecha', '>=', Timestamp.fromDate(mananaInicio))
        .where('fecha', '<=', Timestamp.fromDate(mananaFin))
        .get()

      for (const citaDoc of citasSnap.docs) {
        const cita = citaDoc.data()
        resumen.citasRevisadas++

        if (cita.estatus === 'cancelada') continue
        if (cita.recordatorioEnviado) continue
        if (!cita.pacienteTel) continue

        const fecha = cita.fecha.toDate()
        const resultado = await enviarPlantillaWA(cita.pacienteTel, 'recordatorio_cita_24h1', [
          cita.pacienteNombre ?? 'Paciente',
          formatHora(fecha),
        ])

        if (resultado.ok) {
          resumen.enviados++
          await citaDoc.ref.update({
            recordatorioEnviado: true,
            recordatorioFecha: Timestamp.now(),
          })
        } else {
          resumen.errores.push({ tenantId, citaId: citaDoc.id, error: resultado.error })
        }
      }
    }

    return res.status(200).json({ ok: true, ...resumen })
  } catch (e) {
    console.error('[cron-recordatorios]', e)
    return res.status(500).json({ error: e.message, ...resumen })
  }
}
