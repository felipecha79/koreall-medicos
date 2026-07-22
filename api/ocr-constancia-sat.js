// api/ocr-constancia-sat.js — Novaryk.Med — CommonJS
// OCR de la Constancia de Situación Fiscal del SAT — corre en el servidor (Vercel Function).
// La API key de OpenAI vive SOLO aquí, nunca en el bundle del navegador.
// Usado por: OCRConstanciaSAT.jsx (MiCuenta / Facturación).

const PROMPT_SAT = `Esta es una Constancia de Situación Fiscal del SAT de México.
Extrae los siguientes datos y devuelve SOLO un JSON válido, sin explicaciones ni backticks:
{
  "rfc": "RFC completo (13 caracteres personas físicas, 12 morales)",
  "razonSocial": "Nombre completo o razón social exactamente como aparece",
  "regimenFiscal": "código numérico del régimen (ej: 616, 605, 612)",
  "regimenFiscalNombre": "nombre del régimen fiscal",
  "calle": "calle y número del domicilio fiscal",
  "colonia": "colonia del domicilio fiscal",
  "municipio": "municipio o alcaldía",
  "estado": "estado de la república",
  "cp": "código postal fiscal de 5 dígitos"
}
Si algún campo no es legible devuelve cadena vacía "". Solo JSON.`

function extraerTexto(data) {
  const msg = data.output?.find(o => o.type === 'message')
  const bloque = msg?.content?.find(c => c.type === 'output_text')
  return bloque?.text ?? data.output_text ?? '{}'
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en Vercel' })

  const { base64, mimeType } = req.body || {}
  if (!base64) return res.status(400).json({ error: 'Falta el archivo (base64)' })

  const esPDF = (mimeType || '').includes('pdf')

  try {
    const modelo = process.env.OPENAI_MODEL_VISION || 'gpt-4.1-mini'
    const contenidoArchivo = esPDF
      ? { type: 'input_file', filename: 'constancia.pdf', file_data: `data:application/pdf;base64,${base64}` }
      : { type: 'input_image', image_url: `data:${mimeType || 'image/jpeg'};base64,${base64}` }

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
            { type: 'input_text', text: PROMPT_SAT },
            contenidoArchivo,
          ],
        }],
      }),
    })

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text()
      console.error('[ocr-constancia-sat] OpenAI error:', openaiRes.status, errTxt)
      return res.status(502).json({ error: `OpenAI API ${openaiRes.status}` })
    }

    const data = await openaiRes.json()
    const texto = extraerTexto(data).replace(/```json|```/g, '').trim()
    const datos = JSON.parse(texto)
    return res.status(200).json({ ok: true, datos, usage: data.usage || null })
  } catch (e) {
    console.error('[ocr-constancia-sat]', e)
    return res.status(500).json({ error: e.message })
  }
}
