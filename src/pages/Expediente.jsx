import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, getDoc, collection, query, orderBy,
  onSnapshot, addDoc, updateDoc, Timestamp, getDocs
} from 'firebase/firestore'
import {
  ref, uploadBytesResumable, getDownloadURL
} from 'firebase/storage'
import { db, storage } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const TIPO_DOC = {
  laboratorio: { label: 'Laboratorio',    color: 'bg-teal-100 text-teal-700 border-teal-200' },
  imagen:      { label: 'Imagen/Estudio', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  nota:        { label: 'Nota clínica',   color: 'bg-purple-100 text-purple-700 border-purple-200' },
  receta:      { label: 'Receta',         color: 'bg-green-100 text-green-700 border-green-200' },
  consentimiento: { label: 'Consentimiento', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  iomt:        { label: 'IoMT',           color: 'bg-orange-100 text-orange-700 border-orange-200' },
  otro:        { label: 'Otro',           color: 'bg-amber-100 text-amber-700 border-amber-200' },
}

const TABS = ['Resumen','Consultas','Documentos','Signos vitales','Medicamentos','Antecedentes']

const fmtBytes = b => b < 1024*1024
  ? `${(b/1024).toFixed(0)} KB`
  : `${(b/(1024*1024)).toFixed(1)} MB`

const MED_VACIO = { medicamento:'', dosis:'', via:'oral', frecuencia:'', duracion:'', cantidad:'', indicaciones:'' }

export default function Expediente() {
  const { id } = useParams()
  const { tenantId, user } = useTenant()
  const navigate = useNavigate()

  const [paciente,   setPaciente]   = useState(null)
  const [consultas,  setConsultas]  = useState([])
  const [documentos, setDocumentos] = useState([])
  const [vitales,    setVitales]    = useState([])
  const [medicamentos, setMeds]     = useState([])
  const [recetas,    setRecetas]    = useState([])
  const [tab, setTab]               = useState('Resumen')

  const [modalConsulta, setModalConsulta] = useState(false)
  const [modalDoc,      setModalDoc]      = useState(false)
  const [modalVital,    setModalVital]    = useState(false)
  const [modalMed,      setModalMed]      = useState(false)
  const [modalReceta,   setModalReceta]   = useState(null) // consultaId o 'independiente'
  const [docViewer,     setDocViewer]     = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const fileInputRef = useRef()

  const [formConsulta, setFormConsulta] = useState({
    motivoConsulta:'', exploracionFisica:'', diagnostico:'',
    cie10:'', tratamiento:'', indicaciones:'', peso:'', talla:'',
    ta:'', fc:'', fr:'', temperatura:'', spo2:'',
  })
  const [formDoc, setFormDoc] = useState({
    tipo:'laboratorio', nombre:'', motivo:'', consultaId:'', notas:'', archivo: null,
  })
  const [formVital, setFormVital] = useState({
    peso:'', talla:'', ta:'', fc:'', fr:'', temperatura:'', spo2:'', glucosa:'', fecha:'',
  })
  const [formMed, setFormMed] = useState({
    nombre:'', dosis:'', frecuencia:'', inicio:'', indicadoPor:'', notas:'',
  })
  // Form receta ligada a consulta
  const [formReceta, setFormReceta] = useState({
    medicamentos: [{ ...MED_VACIO }],
    indicacionesGenerales: '',
    proximaCita: '',
    origenReceta: 'consulta', // 'consulta' | 'telefono' | 'otro'
    notaOrigen: '',
  })
  const [antecedentes, setAntec] = useState({
    dm:'', hta:'', cardiopatia:'', cancer:'', otras:'',
    cirugias:'', alergias:'', tabaquismo:'', alcoholismo:'',
    gestaciones:'', partos:'', cesareas:'', abortos:'',
  })
  const [savingAntec, setSavingAntec] = useState(false)

  useEffect(() => {
    if (!tenantId || !id) return
    getDoc(doc(db, `tenants/${tenantId}/pacientes/${id}`)).then(snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setPaciente(data)
        if (data.antecedentes) setAntec(data.antecedentes)
      }
    })
  }, [tenantId, id])

  useEffect(() => {
    if (!tenantId || !id) return
    const base = `tenants/${tenantId}`

    // FIX: Consultas — query sin where para evitar index faltante, filtrar client-side
    const unsubConsultas = onSnapshot(
      query(collection(db, `${base}/consultas`), orderBy('fecha', 'desc')),
      snap => {
        const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Filtrar por pacienteId del expediente actual
        setConsultas(todas.filter(c => c.pacienteId === id))
      },
      err => {
        console.error('Consultas error:', err)
        // Fallback sin orderBy
        getDocs(collection(db, `${base}/consultas`)).then(snap => {
          setConsultas(snap.docs.map(d => ({id:d.id,...d.data()})).filter(c => c.pacienteId === id))
        })
      }
    )

    const unsubDocs = onSnapshot(
      query(collection(db, `${base}/pacientes/${id}/documentos`), orderBy('fecha','desc')),
      snap => setDocumentos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubVitales = onSnapshot(
      query(collection(db, `${base}/pacientes/${id}/vitales`), orderBy('fecha','desc')),
      snap => setVitales(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubMeds = onSnapshot(
      collection(db, `${base}/pacientes/${id}/medicamentos`),
      snap => setMeds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    const unsubRecetas = onSnapshot(
      query(collection(db, `${base}/recetas`), orderBy('fecha','desc')),
      snap => setRecetas(snap.docs.map(d=>({id:d.id,...d.data()})).filter(r => r.pacienteId === id))
    )

    return () => { unsubConsultas(); unsubDocs(); unsubVitales(); unsubMeds(); unsubRecetas() }
  }, [tenantId, id])

  const guardarConsulta = async () => {
    if (!formConsulta.diagnostico) { toast.error('El diagnóstico es obligatorio'); return }
    try {
      const consultaRef = await addDoc(collection(db, `tenants/${tenantId}/consultas`), {
        ...formConsulta, pacienteId: id, tenantId,
        fecha: Timestamp.now(), subidoPor: user?.uid ?? '',
      })
      if (formConsulta.peso || formConsulta.ta || formConsulta.fc) {
        await addDoc(collection(db, `tenants/${tenantId}/pacientes/${id}/vitales`), {
          peso: formConsulta.peso, talla: formConsulta.talla,
          ta: formConsulta.ta, fc: formConsulta.fc,
          fr: formConsulta.fr, temperatura: formConsulta.temperatura,
          spo2: formConsulta.spo2, consultaId: consultaRef.id,
          fecha: Timestamp.now(),
        })
      }
      toast.success('Consulta guardada ✓')
      setModalConsulta(false)
      setFormConsulta({ motivoConsulta:'',exploracionFisica:'',diagnostico:'',
        cie10:'',tratamiento:'',indicaciones:'',peso:'',talla:'',
        ta:'',fc:'',fr:'',temperatura:'',spo2:'',
      })
    } catch(e) { console.error(e); toast.error('Error al guardar') }
  }

  const guardarRecetaDeConsulta = async () => {
    if (!formReceta.medicamentos[0]?.medicamento) {
      toast.error('Agrega al menos un medicamento'); return
    }
    try {
      const numero = `RX-${Date.now().toString().slice(-6)}`
      const origenTexto = {
        consulta: 'Recetado en consulta presencial',
        telefono: 'Recetado por teléfono',
        otro:     formReceta.notaOrigen || 'Otro medio',
      }[formReceta.origenReceta]

      await addDoc(collection(db, `tenants/${tenantId}/recetas`), {
        numero,
        pacienteId:          id,
        pacienteIdLegible:   paciente?.pacienteId ?? '',
        pacienteNombre:      `${paciente?.nombre ?? ''} ${paciente?.apellidos ?? ''}`.trim(),
        consultaId:          modalReceta === 'independiente' ? null : modalReceta,
        origenReceta:        formReceta.origenReceta,
        origenTexto,
        medicamentos:        formReceta.medicamentos,
        indicacionesGenerales: formReceta.indicacionesGenerales,
        proximaCita:         formReceta.proximaCita,
        tenantId,
        fecha:               Timestamp.now(),
      })
      toast.success('Receta guardada ✓')
      setModalReceta(null)
      setFormReceta({
        medicamentos: [{ ...MED_VACIO }],
        indicacionesGenerales: '', proximaCita: '',
        origenReceta: 'consulta', notaOrigen: '',
      })
    } catch(e) { console.error(e); toast.error('Error al guardar receta') }
  }

  const subirDocumento = async () => {
    if (!formDoc.archivo) { toast.error('Selecciona un archivo'); return }
    const archivo = formDoc.archivo
    const ext = archivo.name.split('.').pop()
    const nombre = formDoc.nombre || archivo.name
    const storageRef = ref(storage, `tenants/${tenantId}/pacientes/${id}/${Date.now()}_${archivo.name}`)
    const uploadTask = uploadBytesResumable(storageRef, archivo)
    uploadTask.on('state_changed',
      snap => setUploadProgress(Math.round(snap.bytesTransferred/snap.totalBytes*100)),
      err => { console.error(err); toast.error('Error al subir') },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref)
        await addDoc(collection(db, `tenants/${tenantId}/pacientes/${id}/documentos`), {
          tipo: formDoc.tipo, nombre, url, ext,
          tamanoBytes: archivo.size,
          consultaId: formDoc.consultaId || null,
          motivo: formDoc.motivo || 'Documento adjunto',
          notas: formDoc.notas,
          fuenteIoMT: false,
          subidoPor: user?.uid ?? '',
          fecha: Timestamp.now(),
        })
        toast.success('Documento subido ✓')
        setUploadProgress(null)
        setModalDoc(false)
        setFormDoc({ tipo:'laboratorio',nombre:'',motivo:'',consultaId:'',notas:'',archivo:null })
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    )
  }

  const guardarVital = async () => {
    try {
      await addDoc(collection(db, `tenants/${tenantId}/pacientes/${id}/vitales`), {
        ...formVital,
        fecha: formVital.fecha ? Timestamp.fromDate(new Date(formVital.fecha)) : Timestamp.now(),
      })
      toast.success('Signos vitales guardados ✓')
      setModalVital(false)
      setFormVital({ peso:'',talla:'',ta:'',fc:'',fr:'',temperatura:'',spo2:'',glucosa:'',fecha:'' })
    } catch(e) { toast.error('Error') }
  }

  const guardarMed = async () => {
    if (!formMed.nombre) { toast.error('El nombre del medicamento es obligatorio'); return }
    try {
      await addDoc(collection(db, `tenants/${tenantId}/pacientes/${id}/medicamentos`), {
        ...formMed, activo: true,
        inicio: formMed.inicio || format(new Date(),'yyyy-MM-dd'),
      })
      toast.success('Medicamento agregado ✓')
      setModalMed(false)
      setFormMed({ nombre:'',dosis:'',frecuencia:'',inicio:'',indicadoPor:'',notas:'' })
    } catch(e) { toast.error('Error') }
  }

  const guardarAntecedentes = async () => {
    setSavingAntec(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/pacientes/${id}`), { antecedentes })
      toast.success('Antecedentes guardados ✓')
    } catch { toast.error('Error') } finally { setSavingAntec(false) }
  }

  const imc = vitales[0]?.peso && vitales[0]?.talla
    ? (vitales[0].peso / ((vitales[0].talla/100)**2)).toFixed(1) : null

  if (!paciente) return (
    <div className="p-6 text-center text-gray-400 pt-20">
      <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      Cargando expediente...
    </div>
  )

  // Recetas de una consulta específica
  const recetasDeConsulta = (consultaId) => recetas.filter(r => r.consultaId === consultaId)

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Ficha superior */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <button onClick={() => navigate('/pacientes')}
          className="text-xs text-gray-400 hover:text-teal-600 mb-2 flex items-center gap-1">
          ← Volver a pacientes
        </button>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center
                            text-teal-700 font-semibold text-lg flex-shrink-0">
              {paciente.nombre?.[0]}{paciente.apellidos?.[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold text-gray-800">
                  {paciente.nombre} {paciente.apellidos}
                </h2>
                <span className="font-mono text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-100">
                  {paciente.pacienteId}
                </span>
                {paciente.alergias && paciente.alergias !== 'Ninguna' && (
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-200 font-medium">
                    ⚠ Alergias: {paciente.alergias}
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                {paciente.telefono && <span>📱 {paciente.telefono}</span>}
                {paciente.email    && <span>✉ {paciente.email}</span>}
                {paciente.rfc      && <span className="font-mono text-xs">RFC: {paciente.rfc}</span>}
                {paciente.sexo     && <span>{paciente.sexo === 'M' ? 'Masculino' : paciente.sexo === 'F' ? 'Femenino' : 'Otro'}</span>}
                {paciente.grupoSanguineo && <span className="font-semibold text-red-500">{paciente.grupoSanguineo}</span>}
              </div>
              {antecedentes.dm === 'si' && <span className="inline-block mt-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 mr-1">DM</span>}
              {antecedentes.hta === 'si' && <span className="inline-block mt-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-200 mr-1">HTA</span>}
            </div>
          </div>
          {vitales[0] && (
            <div className="hidden lg:flex gap-3 text-center">
              {[['TA',vitales[0].ta,'mmHg'],['FC',vitales[0].fc,'lpm'],
                ['Peso',vitales[0].peso,'kg'],['IMC',imc,''],['SpO₂',vitales[0].spo2,'%']
              ].filter(([,v]) => v).map(([lbl,val,unit]) => (
                <div key={lbl} className="bg-gray-50 rounded-lg px-3 py-2 min-w-[60px]">
                  <p className="text-xs text-gray-400">{lbl}</p>
                  <p className="text-sm font-semibold text-gray-800">{val}</p>
                  <p className="text-xs text-gray-400">{unit}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 mt-4 border-b border-gray-200 -mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap
                ${tab === t ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">

        {/* ── Resumen ─────────────────────────────────────── */}
        {tab === 'Resumen' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Última consulta</p>
                {consultas[0] ? (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">
                      {format(consultas[0].fecha.toDate(), "d 'de' MMMM yyyy", {locale:es})}
                    </p>
                    <p className="font-medium text-gray-800">{consultas[0].diagnostico}</p>
                    {consultas[0].tratamiento && <p className="text-sm text-gray-600 mt-1">{consultas[0].tratamiento}</p>}
                  </div>
                ) : <p className="text-sm text-gray-400">Sin consultas registradas</p>}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Línea de tiempo</p>
                <div className="space-y-3">
                  {[
                    ...consultas.slice(0,3).map(c => ({ fecha:c.fecha.toDate(), tipo:'consulta', texto:`Consulta: ${c.diagnostico}` })),
                    ...documentos.slice(0,3).map(d => ({ fecha:d.fecha.toDate(), tipo:'documento', texto:`${TIPO_DOC[d.tipo]?.label}: ${d.nombre}` })),
                  ].sort((a,b) => b.fecha - a.fecha).slice(0,6).map((item, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item.tipo==='consulta'?'bg-teal-500':'bg-blue-400'}`} />
                      <div>
                        <p className="text-xs text-gray-400">{format(item.fecha,"d MMM yyyy",{locale:es})}</p>
                        <p className="text-sm text-gray-700">{item.texto}</p>
                      </div>
                    </div>
                  ))}
                  {consultas.length === 0 && documentos.length === 0 && (
                    <p className="text-sm text-gray-400">Sin actividad registrada</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Medicamentos activos</p>
                {medicamentos.filter(m=>m.activo).slice(0,4).map(m => (
                  <div key={m.id} className="py-1.5 border-b border-gray-100 last:border-0">
                    <p className="text-sm font-medium text-gray-800">{m.nombre}</p>
                    <p className="text-xs text-gray-400">{m.dosis} — {m.frecuencia}</p>
                  </div>
                ))}
                {medicamentos.filter(m=>m.activo).length === 0 && <p className="text-xs text-gray-400">Sin medicamentos activos</p>}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Documentos recientes</p>
                {documentos.slice(0,4).map(d => (
                  <button key={d.id} onClick={() => setDocViewer(d)}
                    className="w-full text-left py-1.5 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <p className="text-xs font-medium text-gray-800 truncate">{d.nombre}</p>
                    <p className="text-xs text-gray-400">{TIPO_DOC[d.tipo]?.label} — {format(d.fecha.toDate(),'d MMM',{locale:es})}</p>
                  </button>
                ))}
                {documentos.length === 0 && <p className="text-xs text-gray-400">Sin documentos</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Consultas ────────────────────────────────────── */}
        {tab === 'Consultas' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{consultas.length} consultas registradas</p>
              <div className="flex gap-2">
                <button onClick={() => setModalReceta('independiente')}
                  className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                  + Receta sin consulta
                </button>
                <button onClick={() => setModalConsulta(true)}
                  className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                  + Nueva consulta
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {consultas.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="text-sm font-semibold text-gray-700">
                      {format(c.fecha.toDate(), "EEEE d 'de' MMMM yyyy", {locale:es})}
                    </p>
                    <div className="flex items-center gap-2">
                      {c.cie10 && (
                        <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                          CIE-10: {c.cie10}
                        </span>
                      )}
                      {/* Botón agregar receta a esta consulta */}
                      <button onClick={() => setModalReceta(c.id)}
                        className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg border border-green-200 hover:bg-green-100">
                        + Agregar receta
                      </button>
                    </div>
                  </div>

                  {(c.peso || c.ta || c.fc) && (
                    <div className="flex gap-4 mb-3 pb-3 border-b border-gray-100 flex-wrap">
                      {c.peso        && <span className="text-xs text-gray-500">Peso: <b>{c.peso} kg</b></span>}
                      {c.talla       && <span className="text-xs text-gray-500">Talla: <b>{c.talla} cm</b></span>}
                      {c.ta          && <span className="text-xs text-gray-500">TA: <b>{c.ta}</b></span>}
                      {c.fc          && <span className="text-xs text-gray-500">FC: <b>{c.fc} lpm</b></span>}
                      {c.temperatura && <span className="text-xs text-gray-500">Temp: <b>{c.temperatura}°C</b></span>}
                      {c.spo2        && <span className="text-xs text-gray-500">SpO₂: <b>{c.spo2}%</b></span>}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {c.motivoConsulta && <div><p className="text-xs text-gray-400 mb-0.5">Motivo</p><p className="text-gray-700">{c.motivoConsulta}</p></div>}
                    <div><p className="text-xs text-gray-400 mb-0.5">Diagnóstico</p><p className="text-gray-800 font-medium">{c.diagnostico}</p></div>
                    {c.tratamiento && <div><p className="text-xs text-gray-400 mb-0.5">Tratamiento</p><p className="text-gray-700">{c.tratamiento}</p></div>}
                    {c.indicaciones && <div><p className="text-xs text-gray-400 mb-0.5">Indicaciones</p><p className="text-gray-700">{c.indicaciones}</p></div>}
                  </div>
                  {c.exploracionFisica && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-0.5">Exploración física</p>
                      <p className="text-gray-600 text-xs">{c.exploracionFisica}</p>
                    </div>
                  )}

                  {/* Documentos de esta consulta */}
                  {documentos.filter(d=>d.consultaId===c.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Documentos de esta consulta</p>
                      <div className="flex gap-2 flex-wrap">
                        {documentos.filter(d=>d.consultaId===c.id).map(d => (
                          <button key={d.id} onClick={() => setDocViewer(d)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded">
                            📄 {d.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recetas de esta consulta */}
                  {recetasDeConsulta(c.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Recetas de esta consulta</p>
                      <div className="flex gap-2 flex-wrap">
                        {recetasDeConsulta(c.id).map(r => (
                          <span key={r.id} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200">
                            💊 {r.numero} — {r.medicamentos?.map(m=>m.medicamento).filter(Boolean).join(', ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {consultas.length === 0 && (
                <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm">Sin consultas registradas</p>
                </div>
              )}
            </div>

            {/* Recetas independientes (sin consulta) */}
            {recetas.filter(r => !r.consultaId).length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-600 mb-3">Recetas sin consulta asociada</p>
                {recetas.filter(r => !r.consultaId).map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-green-200 p-4 mb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-teal-700">{r.numero}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {format(r.fecha.toDate(),"d 'de' MMMM yyyy",{locale:es})}
                        </span>
                        {r.origenTexto && (
                          <span className="ml-2 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                            {r.origenTexto}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">
                      💊 {r.medicamentos?.map(m=>m.medicamento).filter(Boolean).join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Documentos ───────────────────────────────────── */}
        {tab === 'Documentos' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{documentos.length} documentos — {fmtBytes(documentos.reduce((s,d)=>s+(d.tamanoBytes??0),0))} total</p>
              <button onClick={() => setModalDoc(true)}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                + Subir documento
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {documentos.map(d => (
                <button key={d.id} onClick={() => setDocViewer(d)}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all">
                  <div className="text-3xl mb-2">{d.ext==='pdf'?'📄':['jpg','jpeg','png','webp'].includes(d.ext)?'🖼':'📎'}</div>
                  <span className={`text-xs px-2 py-0.5 rounded border mb-1 inline-block ${TIPO_DOC[d.tipo]?.color??''}`}>{TIPO_DOC[d.tipo]?.label}</span>
                  <p className="text-xs font-medium text-gray-800 mt-1 line-clamp-2">{d.nombre}</p>
                  <p className="text-xs text-gray-400 mt-1">{format(d.fecha.toDate(),'d MMM yyyy',{locale:es})}</p>
                  {d.tamanoBytes && <p className="text-xs text-gray-300">{fmtBytes(d.tamanoBytes)}</p>}
                </button>
              ))}
              <button onClick={() => setModalDoc(true)}
                className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-4
                           hover:border-teal-400 hover:bg-teal-50 transition-all flex flex-col items-center justify-center min-h-[120px]">
                <span className="text-2xl text-gray-300 mb-1">+</span>
                <p className="text-xs text-gray-400">Subir documento</p>
              </button>
            </div>
          </div>
        )}

        {/* ── Signos vitales ───────────────────────────────── */}
        {tab === 'Signos vitales' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{vitales.length} registros</p>
              <button onClick={() => setModalVital(true)}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                + Registrar vitales
              </button>
            </div>
            {vitales.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>{['Fecha','Peso','Talla','IMC','TA','FC','Temp','SpO₂','Glucosa'].map(h=>(
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vitales.map(v => {
                      const imcV = v.peso&&v.talla?(v.peso/((v.talla/100)**2)).toFixed(1):'—'
                      return (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{format(v.fecha.toDate(),"d/MM/yy",{locale:es})}</td>
                          <td className="px-3 py-2 text-xs">{v.peso?`${v.peso} kg`:'—'}</td>
                          <td className="px-3 py-2 text-xs">{v.talla?`${v.talla} cm`:'—'}</td>
                          <td className="px-3 py-2 text-xs font-medium">
                            <span className={imcV!=='—'&&Number(imcV)>30?'text-red-600':imcV!=='—'&&Number(imcV)<18.5?'text-amber-600':''}>{imcV}</span>
                          </td>
                          <td className="px-3 py-2 text-xs">{v.ta||'—'}</td>
                          <td className="px-3 py-2 text-xs">{v.fc?`${v.fc}`:'—'}</td>
                          <td className="px-3 py-2 text-xs">{v.temperatura?`${v.temperatura}°`:'—'}</td>
                          <td className="px-3 py-2 text-xs">{v.spo2?`${v.spo2}%`:'—'}</td>
                          <td className="px-3 py-2 text-xs">{v.glucosa||'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {vitales.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
                <p className="text-3xl mb-2">📊</p><p className="text-sm">Sin signos vitales</p>
              </div>
            )}
          </div>
        )}

        {/* ── Medicamentos ─────────────────────────────────── */}
        {tab === 'Medicamentos' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">{medicamentos.filter(m=>m.activo).length} activos / {medicamentos.length} total</p>
              <button onClick={() => setModalMed(true)}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                + Agregar medicamento
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {medicamentos.map(m => (
                <div key={m.id} className={`bg-white rounded-xl border p-4 ${m.activo?'border-gray-200':'border-gray-100 opacity-60'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{m.nombre}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{m.dosis} — {m.frecuencia}</p>
                      {m.indicadoPor && <p className="text-xs text-gray-400 mt-1">Indicado por: {m.indicadoPor}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.activo?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                      {m.activo?'Activo':'Suspendido'}
                    </span>
                  </div>
                  {m.activo && (
                    <button onClick={async () => {
                      await updateDoc(doc(db,`tenants/${tenantId}/pacientes/${id}/medicamentos/${m.id}`),{activo:false})
                      toast.success('Medicamento suspendido')
                    }} className="mt-2 text-xs text-red-500 hover:text-red-700">Suspender</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Antecedentes ─────────────────────────────────── */}
        {tab === 'Antecedentes' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Antecedentes heredofamiliares</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {[['dm','Diabetes mellitus'],['hta','Hipertensión'],['cardiopatia','Cardiopatía'],['cancer','Cáncer']].map(([field,label])=>(
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <select value={antecedentes[field]} onChange={e=>setAntec(a=>({...a,[field]:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                      <option value="">No sabe</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                ))}
                <div className="col-span-full">
                  <label className="block text-xs text-gray-500 mb-1">Otras</label>
                  <input type="text" value={antecedentes.otras} onChange={e=>setAntec(a=>({...a,otras:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Antecedentes personales</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {[['cirugias','Cirugías previas'],['alergias','Alergias'],['tabaquismo','Tabaquismo'],['alcoholismo','Alcoholismo']].map(([field,label])=>(
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="text" value={antecedentes[field]} onChange={e=>setAntec(a=>({...a,[field]:e.target.value}))}
                      placeholder="Ninguno" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                  </div>
                ))}
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Antecedentes gineco-obstétricos</h3>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[['gestaciones','Gestas'],['partos','Partos'],['cesareas','Cesáreas'],['abortos','Abortos']].map(([field,label])=>(
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="number" min="0" value={antecedentes[field]} onChange={e=>setAntec(a=>({...a,[field]:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                  </div>
                ))}
              </div>
              <button onClick={guardarAntecedentes} disabled={savingAntec}
                className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {savingAntec?'Guardando...':'Guardar antecedentes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ MODALES ═══════════ */}

      {/* Modal nueva consulta */}
      {modalConsulta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setModalConsulta(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Nueva consulta — {paciente.nombre}</h3>
            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Signos vitales</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
              {[['peso','Peso (kg)','number'],['talla','Talla (cm)','number'],['ta','TA (mmHg)','text'],['fc','FC (lpm)','number'],['temperatura','Temp (°C)','number'],['spo2','SpO₂ (%)','number']].map(([f,l,t])=>(
                <div key={f}>
                  <label className="block text-xs text-gray-400 mb-0.5">{l}</label>
                  <input type={t} value={formConsulta[f]} onChange={e=>setFormConsulta(fc=>({...fc,[f]:e.target.value}))}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"/>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {[['motivoConsulta','Motivo de consulta','textarea'],['exploracionFisica','Exploración física','textarea'],['diagnostico','Diagnóstico *','text'],['cie10','CIE-10','text'],['tratamiento','Tratamiento','textarea'],['indicaciones','Indicaciones','textarea']].map(([f,l,t])=>(
                <div key={f}>
                  <label className="block text-xs text-gray-500 mb-1">{l}</label>
                  {t==='textarea'
                    ?<textarea value={formConsulta[f]} rows={2} onChange={e=>setFormConsulta(fc=>({...fc,[f]:e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"/>
                    :<input type="text" value={formConsulta[f]} onChange={e=>setFormConsulta(fc=>({...fc,[f]:e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                  }
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={guardarConsulta} className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-700">Guardar consulta</button>
              <button onClick={()=>setModalConsulta(false)} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal receta ligada a consulta o independiente */}
      {modalReceta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setModalReceta(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2 text-gray-800">Nueva receta</h3>
            <p className="text-xs text-gray-400 mb-4">
              {modalReceta === 'independiente' ? 'Sin consulta asociada' : 'Ligada a la consulta seleccionada'}
            </p>

            {/* Origen de la receta */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-2">¿Cómo se indicó la receta?</label>
              <div className="flex gap-2">
                {[['consulta','🏥 En consulta'],['telefono','📱 Por teléfono'],['otro','📝 Otro']].map(([v,l])=>(
                  <button key={v} onClick={()=>setFormReceta(f=>({...f,origenReceta:v}))}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${formReceta.origenReceta===v?'border-teal-500 bg-teal-50 text-teal-700 font-medium':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {formReceta.origenReceta === 'otro' && (
                <input type="text" value={formReceta.notaOrigen} placeholder="Describe el medio..."
                  onChange={e=>setFormReceta(f=>({...f,notaOrigen:e.target.value}))}
                  className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              )}
            </div>

            {/* Medicamentos */}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-gray-700">Medicamentos *</label>
                <button onClick={()=>setFormReceta(f=>({...f,medicamentos:[...f.medicamentos,{...MED_VACIO}]}))}
                  className="text-xs text-teal-600 hover:text-teal-800">+ Agregar</button>
              </div>
              {formReceta.medicamentos.map((med,i)=>(
                <div key={i} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-semibold text-teal-700">Medicamento {i+1}</span>
                    {i>0&&<button onClick={()=>setFormReceta(f=>({...f,medicamentos:f.medicamentos.filter((_,idx)=>idx!==i)}))} className="text-xs text-red-400">✕</button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['medicamento','Medicamento *'],['dosis','Dosis'],['via','Vía'],['frecuencia','Frecuencia'],['duracion','Duración'],['cantidad','Cantidad']].map(([f2,l])=>(
                      <div key={f2}>
                        <label className="block text-xs text-gray-400 mb-0.5">{l}</label>
                        <input type="text" value={med[f2]??''} onChange={e=>{const meds=[...formReceta.medicamentos];meds[i]={...meds[i],[f2]:e.target.value};setFormReceta(f=>({...f,medicamentos:meds}))}}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"/>
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-0.5">Indicaciones adicionales</label>
                      <input type="text" value={med.indicaciones??''} onChange={e=>{const meds=[...formReceta.medicamentos];meds[i]={...meds[i],indicaciones:e.target.value};setFormReceta(f=>({...f,medicamentos:meds}))}}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"/>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Indicaciones generales</label>
              <textarea value={formReceta.indicacionesGenerales} rows={2} onChange={e=>setFormReceta(f=>({...f,indicacionesGenerales:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"/>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Próxima cita (opcional)</label>
              <input type="text" value={formReceta.proximaCita} onChange={e=>setFormReceta(f=>({...f,proximaCita:e.target.value}))}
                placeholder="En 7 días, 15 de mayo 2026..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            </div>

            <div className="flex gap-3">
              <button onClick={guardarRecetaDeConsulta}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700">
                Guardar receta
              </button>
              <button onClick={()=>setModalReceta(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal subir documento */}
      {modalDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setModalDoc(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Subir documento</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo de documento</label>
                <select value={formDoc.tipo} onChange={e=>setFormDoc(f=>({...f,tipo:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {Object.entries(TIPO_DOC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Archivo *</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-teal-400 hover:bg-teal-50 transition-all cursor-pointer"
                  onClick={()=>fileInputRef.current?.click()}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file)setFormDoc(f=>({...f,archivo:file,nombre:f.nombre||file.name}))}}>
                  <p className="text-2xl mb-1">📎</p>
                  <p className="text-sm text-gray-500">{formDoc.archivo?`✓ ${formDoc.archivo.name} (${fmtBytes(formDoc.archivo.size)})` : 'Arrastra o haz clic'}</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — máx 20 MB</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                  onChange={e=>{const file=e.target.files[0];if(file)setFormDoc(f=>({...f,archivo:file,nombre:f.nombre||file.name}))}}/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre del documento</label>
                <input type="text" value={formDoc.nombre} onChange={e=>setFormDoc(f=>({...f,nombre:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Asociar a consulta (opcional)</label>
                <select value={formDoc.consultaId} onChange={e=>setFormDoc(f=>({...f,consultaId:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="">Sin consulta específica</option>
                  {consultas.slice(0,10).map(c=><option key={c.id} value={c.id}>{format(c.fecha.toDate(),"d MMM yyyy",{locale:es})} — {c.diagnostico?.slice(0,30)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Motivo de carga</label>
                <input type="text" value={formDoc.motivo} onChange={e=>setFormDoc(f=>({...f,motivo:e.target.value}))}
                  placeholder="Resultado de laboratorio, documento preexistente..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              </div>
              {uploadProgress !== null && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Subiendo...</span><span>{uploadProgress}%</span></div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-teal-500 h-2 rounded-full transition-all" style={{width:`${uploadProgress}%`}}/>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={subirDocumento} disabled={uploadProgress!==null}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {uploadProgress!==null?`Subiendo ${uploadProgress}%`:'Subir documento'}
              </button>
              <button onClick={()=>{setModalDoc(false);setUploadProgress(null)}}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal vitales */}
      {modalVital && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setModalVital(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Registrar signos vitales</h3>
            <div className="grid grid-cols-2 gap-3">
              {[['peso','Peso (kg)','number'],['talla','Talla (cm)','number'],['ta','TA (mmHg)','text'],['fc','FC (lat/min)','number'],['fr','FR (resp/min)','number'],['temperatura','Temperatura (°C)','number'],['spo2','SpO₂ (%)','number'],['glucosa','Glucosa (mg/dL)','number']].map(([f,l,t])=>(
                <div key={f}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                <input type={t} value={formVital[f]} onChange={e=>setFormVital(v=>({...v,[f]:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              ))}
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Fecha</label>
              <input type="datetime-local" value={formVital.fecha} onChange={e=>setFormVital(v=>({...v,fecha:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={guardarVital} className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-700">Guardar</button>
              <button onClick={()=>setModalVital(false)} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal medicamento */}
      {modalMed && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setModalMed(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-800">Agregar medicamento</h3>
            <div className="space-y-3">
              {[['nombre','Medicamento *','text'],['dosis','Dosis (ej: 500mg)','text'],['frecuencia','Frecuencia (ej: cada 8h)','text'],['inicio','Fecha de inicio','date'],['indicadoPor','Indicado por','text'],['notas','Notas','text']].map(([f,l,t])=>(
                <div key={f}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                <input type={t} value={formMed[f]} onChange={e=>setFormMed(m=>({...m,[f]:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={guardarMed} className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-700">Agregar</button>
              <button onClick={()=>setModalMed(false)} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Visor documento */}
      {docViewer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={()=>setDocViewer(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div>
                <p className="font-medium text-gray-800">{docViewer.nombre}</p>
                <p className="text-xs text-gray-400">{TIPO_DOC[docViewer.tipo]?.label} — {format(docViewer.fecha.toDate(),"d 'de' MMMM yyyy",{locale:es})}</p>
              </div>
              <div className="flex gap-2">
                <a href={docViewer.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700">Abrir →</a>
                <button onClick={()=>setDocViewer(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">Cerrar</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              {['jpg','jpeg','png','webp'].includes(docViewer.ext)
                ?<img src={docViewer.url} alt={docViewer.nombre} className="w-full h-full object-contain p-4"/>
                :docViewer.ext==='pdf'
                ?<iframe src={docViewer.url} className="w-full h-full border-0" title={docViewer.nombre}/>
                :<div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center"><p className="text-4xl mb-2">📎</p><a href={docViewer.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline text-sm">Descargar →</a></div>
                </div>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
