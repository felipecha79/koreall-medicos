// src/components/OCRIneDoctor.jsx
// OCR de INE para el alta de pacientes desde la vista del doctor
// Mismo motor que RegistroPaciente pero como componente reutilizable
import { useState, useRef } from 'react'
import toast from 'react-hot-toast'

async function extraerDatosINE(base64, mimeType) {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('NO_KEY')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-api-key':     key,
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
            text: `Esta es una INE/credencial de elector mexicana. 
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
Si algún campo no es legible devuelve cadena vacía "". Solo JSON.`
          }
        ]
      }]
    })
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  return JSON.parse((data.content?.[0]?.text ?? '{}').replace(/```json|```/g, '').trim())
}

export default function OCRIneDoctor({ onDatosCargados, compact = false }) {
  const [escaneando, setEsc]   = useState(false)
  const [preview,    setPrev]  = useState(null)
  const [listo,      setListo] = useState(false)
  const fileRef = useRef()

  const procesar = async (archivo) => {
    if (!archivo) return
    if (archivo.size > 10 * 1024 * 1024) { toast.error('Imagen mayor a 10 MB'); return }

    const reader = new FileReader()
    reader.onload = e => setPrev(e.target.result)
    reader.readAsDataURL(archivo)

    setEsc(true)
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(archivo)
      })
      const datos = await extraerDatosINE(base64, archivo.type || 'image/jpeg')
      if (!datos.nombre && !datos.apellidoPaterno) {
        toast.error('No se pudo leer la INE. Ingresa los datos manualmente.')
        return
      }
      onDatosCargados(datos)
      setListo(true)
      toast.success(`✓ INE leída — ${datos.nombre} ${datos.apellidoPaterno}`)
    } catch(e) {
      if (e.message === 'NO_KEY') {
        toast('VITE_ANTHROPIC_API_KEY no configurada', { icon: 'ℹ️' })
      } else {
        toast.error('No se pudo leer la INE')
      }
    } finally { setEsc(false) }
  }

  if (compact) return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={e => procesar(e.target.files[0])} />
      <button type="button" onClick={() => fileRef.current?.click()}
        disabled={escaneando}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors
          ${listo
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'}`}>
        {escaneando
          ? <><div className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/>Leyendo...</>
          : listo ? '✓ INE leída' : '🪪 Escanear INE'}
      </button>
      {listo && (
        <button type="button" onClick={() => { setListo(false); setPrev(null) }}
          className="text-xs text-gray-400 hover:text-gray-600">
          Limpiar
        </button>
      )}
    </div>
  )

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
      <p className="text-xs font-medium text-teal-800 mb-2">
        🪪 Escanear INE para llenar datos automáticamente
      </p>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); procesar(e.dataTransfer.files[0]) }}
        className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all
          ${escaneando ? 'border-teal-400 bg-teal-100' : 'border-teal-300 hover:border-teal-400 hover:bg-teal-100'}`}>
        {preview ? (
          <div className="flex items-center gap-3">
            <img src={preview} alt="INE" className="h-14 object-contain rounded-lg flex-shrink-0" />
            {escaneando
              ? <div className="flex items-center gap-2 text-teal-600 text-sm">
                  <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/>
                  Leyendo INE...
                </div>
              : listo
              ? <p className="text-sm text-green-700 font-medium">✓ Datos cargados correctamente</p>
              : <p className="text-sm text-teal-600">Procesando...</p>
            }
          </div>
        ) : (
          <div>
            <span className="text-2xl mb-1 block">🪪</span>
            <p className="text-xs font-medium text-teal-700">Toca para subir foto de la INE</p>
            <p className="text-xs text-teal-500">O arrastra la imagen aquí</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={e => procesar(e.target.files[0])} />
      <p className="text-xs text-teal-500 mt-1 text-center">
        🔒 La imagen no se almacena — solo se extraen los datos
      </p>
    </div>
  )
}
