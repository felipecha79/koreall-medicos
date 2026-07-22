// api/ocr-ine.js — Novaryk.Med — CommonJS
// OCR de INE/credencial de elector — corre en el servidor (Vercel Function).
// La API key de OpenAI vive SOLO aquí (process.env.OPENAI_API_KEY), nunca en el bundle del navegador.
// Usado por: OCRIneDoctor.jsx (Expediente) y RegistroPaciente.jsx (registro público de pacientes).

const PROMPT_INE = `Esta es una INE/credencial de elector mexicana.
Extrae exactamente los siguientes campos y devuelve SOLO un JSON válido sin explicaciones:
{
  "nombre": "solo el nombre(s), sin apellidos",
  "apellidoPaterno": "primer apellido",
  "apellidoMaterno": "segundo apellido",
  "fechaNacimiento": "YYYY-MM-DD",
  "sexo": "M o F",
  "curp": "CURP completa si es visible",
  "calle": "calle y número si aparece",
  "colonia": "colonia si aparece",
  "municipio": "municipio o ciudad",
  "estado": "estado de la república",
  "cp": "código postal si aparece"
}
Si algún campo no es legible devuelve cadena vacía "". No incluyas nada más en tu respuesta, solo el JSON.`

function extraerTexto(data) {
  const msg = data.output?.find(o => o.type === 'message')
  const bloque = msg?.content?.find(c => c.type === 'output_text')
  return bloque?.text ?? data.output_text ?? '{}'
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en Vercel' })

  const { imagenBase64, base64, mimeType } = req.body || {}
  const imagen = imagenBase64 || base64
  if (!imagen) return res.status(400).json({ error: 'Falta la imagen (imagenBase64)' })

  try {
    const modelo = process.env.OPENAI_MODEL_VISION || 'gpt-4.1-mini'
    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        max_output_tokens: 600,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: PROMPT_INE },
            { type: 'input_image', image_url: `data:${mimeType || 'image/jpeg'};base64,${imagen}` },
          ],
        }],
      }),
    })

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text()
      console.error('[ocr-ine] OpenAI error:', openaiRes.status, errTxt)
      return res.status(502).json({ error: `OpenAI API ${openaiRes.status}` })
    }

    const data = await openaiRes.json()
    const texto = extraerTexto(data).replace(/```json|```/g, '').trim()
    const datos = JSON.parse(texto)
    return res.status(200).json({ ok: true, datos, usage: data.usage || null })
  } catch (e) {
    console.error('[ocr-ine]', e)
    return res.status(500).json({ error: e.message })
  }
}
