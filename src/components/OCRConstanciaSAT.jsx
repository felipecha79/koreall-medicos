// src/components/OCRConstanciaSAT.jsx
// Escanea la Constancia de Situación Fiscal del SAT y extrae datos de facturación
import { useState, useRef } from 'react'
import toast from 'react-hot-toast'

async function extraerDatosSAT(base64, mimeType) {
  const response = await fetch('/api/ocr-constancia-sat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mimeType }),
  })
  if (!response.ok) throw new Error(`API error ${response.status}`)
  const data = await response.json()
  return data.datos ?? {}
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
      toast.error('No se pudo leer el documento. Ingresa los datos manualmente.')
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
