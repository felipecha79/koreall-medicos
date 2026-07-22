// api/ia-prediagnostico.js — Novaryk.Med — CommonJS
// Análisis IA pre-consulta — corre en el servidor (Vercel Function).
// La API key de OpenAI vive SOLO aquí, nunca en el bundle del navegador.
// Usado por: IAPreConsulta.jsx (panel del doctor en Agenda).

import admin from 'firebase-admin'

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  return admin.firestore()
}

function extraerTexto(data) {
  const msg = data.output?.find(o => o.type === 'message')
  const bloque = msg?.content?.find(c => c.type === 'output_text')
  return bloque?.text ?? data.output_text ?? '{}'
}

// Registrar tokens usados para el monitor de créditos (configuracion/ia_status)
async function registrarUso(tokensUsados) {
  if (!tokensUsados) return
  try {
    const db = getDb()
    const ref = db.collection('configuracion').doc('ia_status')
    const snap = await ref.get()
    const mesActual = new Date().toISOString().slice(0, 7)
    if (snap.exists) {
      const prev = snap.data()
      const mismoMes = prev.mesActual === mesActual
      await ref.update({
        creditosUsadosMes: mismoMes ? (prev.creditosUsadosMes ?? 0) + tokensUsados : tokensUsados,
        mesActual,
        ultimaLlamada: admin.firestore.FieldValue.serverTimestamp(),
        alertaEnviada: mismoMes ? (prev.alertaEnviada ?? false) : false,
      })
    } else {
      await ref.set({
        creditosUsadosMes: tokensUsados,
        creditosLimiteMes: 500000,
        mesActual,
        ultimaLlamada: admin.firestore.FieldValue.serverTimestamp(),
        alertaEnviada: false,
      })
    }
  } catch (e) {
    console.warn('[ia-prediagnostico] No se pudo registrar tokens:', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en Vercel' })

  const { texto, pacienteInfo = {} } = req.body || {}
  if (!texto) return res.status(400).json({ error: 'Falta el texto del padecimiento' })

  const edad = pacienteInfo.fechaNacimiento
    ? `${new Date().getFullYear() - new Date(pacienteInfo.fechaNacimiento).getFullYear()} años`
    : 'edad no especificada'

  try {
    const modelo = process.env.OPENAI_MODEL_TEXT || 'gpt-4.1-mini'
    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        max_output_tokens: 600,
        instructions: 'Asistente clínico conciso. Analiza el padecimiento y responde SOLO JSON válido, sin backticks.',
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: `Paciente: ${pacienteInfo.sexo === 'F' ? 'F' : pacienteInfo.sexo === 'M' ? 'M' : '?'}, ${edad}. Alergias: ${pacienteInfo.alergias || 'ninguna'}.
Padecimiento: "${texto}"

Responde SOLO este JSON:
{"observacion":"1-2 líneas conciso","diagnosticos":[{"dx":"nombre","probabilidad":"alta|media|baja","justificacion":"1 línea"}],"estudios":[{"estudio":"nombre","urgencia":"inmediata|electiva"}]}`,
          }],
        }],
      }),
    })

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text()
      console.error('[ia-prediagnostico] OpenAI error:', openaiRes.status, errTxt)
      return res.status(502).json({ error: `OpenAI API ${openaiRes.status}` })
    }

    const data = await openaiRes.json()
    const tokensUsados = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    await registrarUso(tokensUsados)

    const texto_resp = extraerTexto(data).replace(/```json|```/g, '').trim()
    const resultado = JSON.parse(texto_resp)
    return res.status(200).json({ ok: true, resultado })
  } catch (e) {
    console.error('[ia-prediagnostico]', e)
    return res.status(500).json({ error: e.message })
  }
}
