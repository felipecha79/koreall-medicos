// src/components/OCRConstanciaSAT.jsx
// Escanea la Constancia de Situación Fiscal del SAT y extrae datos de facturación
import { useState, useRef } from 'react'
import toast from 'react-hot-toast'

const ANTHROPIC_KEY = () => import.meta.env.VITE_ANTHROPIC_API_KEY

async function extraerDatosSAT(base64, mimeType) {
  const key = ANTHROPIC_KEY()
  if (!key) throw new Error('NO_KEY')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          {
            type: 'text',
            text: `Esta es una Constancia de Situación Fiscal del SAT de México.
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
          }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`API error ${response.status}`)
  const data = await response.json()
  const texto = data.content?.[0]?.text ?? '{}'
  return JSON.parse(texto.replace(/```json|```/g, '').trim())
}

// ── Componente ────────────────────────────────────────────
export default function OCRConstanciaSAT({ onDatosCargados }) {
  const [escaneando, setEsc] = useState(false)
  const [preview,    setPrev] = useState(null)
  const fileRef = useRef()

  const procesar = async (archivo) => {
    if (!archivo) return
    if (archivo.size > 15 * 1024 * 1024) { toast.error('Archivo mayor a 15 MB'); return }

    setEsc(true)
    // Preview solo si es imagen
    if (archivo.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPrev(e.target.result)
      reader.readAsDataURL(archivo)
    } else {
      setPrev('pdf')
    }

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(archivo)
      })

      const mimeType = archivo.type || (archivo.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
      const datos = await extraerDatosSAT(base64, mimeType)

      if (!datos.rfc) {
        toast.error('No se encontró RFC en el documento. Verifica que sea la constancia correcta.')
        return
      }

      onDatosCargados(datos)
      toast.success(`✓ Constancia SAT leída — RFC: ${datos.rfc}`)
    } catch(e) {
      if (e.message === 'NO_KEY') {
        toast.error('Configura VITE_ANTHROPIC_API_KEY para usar el OCR')
      } else {
        toast.error('No se pudo leer el documento. Ingresa los datos manualmente.')
      }
    } finally { setEsc(false) }
  }

  return (
    <div>
      {/* Zona de carga */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); procesar(e.dataTransfer.files[0]) }}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
          ${escaneando ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50'}`}>

        {preview === 'pdf' ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="text-2xl">📄</span>
            <span className="text-sm text-gray-600 font-medium">Constancia SAT cargada</span>
          </div>
        ) : preview ? (
          <img src={preview} alt="Constancia" className="max-h-24 object-contain mx-auto rounded-lg" />
        ) : (
          <div className="py-2">
            <span className="text-3xl block mb-1">🏛️</span>
            <p className="text-sm font-medium text-gray-700">Sube la Constancia de Situación Fiscal</p>
            <p className="text-xs text-gray-400">PDF o imagen · Desde el portal del SAT (sat.gob.mx)</p>
          </div>
        )}

        {escaneando && (
          <div className="flex items-center justify-center gap-2 mt-2 text-teal-600 text-sm">
            <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            Leyendo constancia SAT...
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden"
        onChange={e => procesar(e.target.files[0])} />

      <p className="text-xs text-gray-400 mt-1 text-center">
        🔒 El documento no se almacena — solo se extraen los datos fiscales
      </p>
    </div>
  )
}
