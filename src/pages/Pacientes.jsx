import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, Timestamp, where, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// Generar ID legible: PAC-XXXXX
const generarPacienteId = async (tenantId) => {
  const snap = await getDocs(collection(db, `tenants/${tenantId}/pacientes`))
  const num = snap.size + 1
  return `PAC-${String(num).padStart(5, '0')}`
}

const FORM_VACIO = {
  // Datos personales
  nombre:           '',
  apellidos:        '',
  fechaNacimiento:  '',
  sexo:             '',
  estadoCivil:      '',
  nacionalidad:     'Mexicana',
  ocupacion:        '',
  grupoSanguineo:   '',
  // Contacto
  telefono:         '',
  telefonoEmergencia: '',
  email:            '',
  // Dirección de casa
  calle:            '',
  colonia:          '',
  ciudad:           '',
  estado:           'Tamaulipas',
  cp:               '',
  pais:             'México',
  // Dirección fiscal (para CFDI)
  usarMismaDireccion: true,
  rfcRazonSocial:   '',
  rfc:              '',
  calleFiscal:      '',
  coloniaFiscal:    '',
  ciudadFiscal:     '',
  estadoFiscal:     '',
  cpFiscal:         '',
  regimenFiscal:    '616', // Persona física sin actividad
  usoCFDI:          'S01', // Sin efectos fiscales
  // Médico
  alergias:         '',
  tipoSangre:       '',
  enfermedadesCronicas: '',
  // CRM
  tipoPaciente:     'primera_vez', // 'primera_vez' | 'subsecuente'
  canalOrigen:      '', // ej: 'recomendacion', 'redes', 'google', 'walk-in'
  idioma:           'es', // 'es' | 'en'
  activo:           true,
}

const REGIMENES = [
  { c:'601', l:'General de Ley Personas Morales' },
  { c:'603', l:'Personas Morales con Fines no Lucrativos' },
  { c:'605', l:'Sueldos y Salarios e Ingresos Asimilados' },
  { c:'606', l:'Arrendamiento' },
  { c:'608', l:'Demás ingresos' },
  { c:'612', l:'Personas Físicas con Actividades Empresariales' },
  { c:'616', l:'Sin obligaciones fiscales' },
  { c:'621', l:'Incorporación Fiscal' },
  { c:'625', l:'Régimen de las actividades empresariales con ingresos a través de plataformas tecnológicas' },
  { c:'626', l:'Régimen Simplificado de Confianza RESICO' },
]

const USO_CFDI = [
  { c:'G01', l:'Adquisición de mercancias' },
  { c:'G03', l:'Gastos en general' },
  { c:'I01', l:'Construcciones' },
  { c:'P01', l:'Por definir' },
  { c:'S01', l:'Sin efectos fiscales' },
  { c:'CP01', l:'Pagos' },
  { c:'D01', l:'Honorarios médicos, dentales y gastos hospitalarios' },
]

const ESTADOS_MX = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche',
  'Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango',
  'Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco',
  'Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla',
  'Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora',
  'Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas',
]

export default function Pacientes() {
  const { tenantId } = useTenant()
  const navigate     = useNavigate()
  const [pacientes, setPacientes] = useState([])
  const [busqueda,  setBusqueda]  = useState('')
  const [modal,     setModal]     = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState(FORM_VACIO)
  const [tabForm,   setTabForm]   = useState('personal') // 'personal'|'contacto'|'fiscal'|'medico'|'crm'
  const [filtroTipo, setFiltroTipo] = useState('todos')

  useEffect(() => {
    if (!tenantId) return
    return onSnapshot(
      query(collection(db, `tenants/${tenantId}/pacientes`), orderBy('creadoEn', 'desc')),
      snap => setPacientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [tenantId])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // Al activar "misma dirección" copia los datos de casa a fiscal
  const sincronizarDireccion = (checked) => {
    set('usarMismaDireccion', checked)
    if (checked) {
      setForm(f => ({
        ...f,
        usarMismaDireccion: true,
        calleFiscal:   f.calle,
        coloniaFiscal: f.colonia,
        ciudadFiscal:  f.ciudad,
        estadoFiscal:  f.estado,
        cpFiscal:      f.cp,
      }))
    }
  }

  const guardar = async () => {
    if (!form.nombre || !form.apellidos) {
      toast.error('Nombre y apellidos son obligatorios'); return
    }
    setSaving(true)
    try {
      const pacienteId = await generarPacienteId(tenantId)
      const datos = {
        ...form,
        pacienteId,
        // Si usa misma dirección, copiar al fiscal
        calleFiscal:   form.usarMismaDireccion ? form.calle    : form.calleFiscal,
        coloniaFiscal: form.usarMismaDireccion ? form.colonia  : form.coloniaFiscal,
        ciudadFiscal:  form.usarMismaDireccion ? form.ciudad   : form.ciudadFiscal,
        estadoFiscal:  form.usarMismaDireccion ? form.estado   : form.estadoFiscal,
        cpFiscal:      form.usarMismaDireccion ? form.cp       : form.cpFiscal,
        tenantId,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
        totalConsultas: 0,
        ultimaConsulta: null,
      }
      await addDoc(collection(db, `tenants/${tenantId}/pacientes`), datos)
      toast.success(`Paciente registrado ✓ — ${pacienteId}`)
      setModal(false)
      setForm(FORM_VACIO)
      setTabForm('personal')
    } catch(e) {
      console.error(e); toast.error('Error al guardar')
    } finally { setSaving(false) }
  }

  const pacientesFiltrados = pacientes
    .filter(p => {
      if (filtroTipo !== 'todos' && p.tipoPaciente !== filtroTipo) return false
      if (!busqueda) return true
      const q = busqueda.toLowerCase()
      return `${p.nombre} ${p.apellidos} ${p.pacienteId ?? ''} ${p.email ?? ''} ${p.telefono ?? ''}`
        .toLowerCase().includes(q)
    })

  const TABS_FORM = [
    { id:'personal', label:'👤 Personal' },
    { id:'contacto', label:'📍 Contacto' },
    { id:'fiscal',   label:'🧾 Fiscal' },
    { id:'medico',   label:'🩺 Médico' },
    { id:'crm',      label:'📊 CRM' },
  ]

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Pacientes</h2>
          <p className="text-sm text-gray-400">{pacientes.length} registrados</p>
        </div>
        <button onClick={() => setModal(true)}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium
                     rounded-lg hover:bg-teal-700 transition-colors">
          + Nuevo paciente
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input type="text" placeholder="Buscar por nombre, ID, email o teléfono..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[['todos','Todos'],['primera_vez','Primera vez'],['subsecuente','Subsecuente']].map(([v,l]) => (
            <button key={v} onClick={() => setFiltroTipo(v)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 first:border-0
                ${filtroTipo===v ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['ID','Paciente','Contacto','Tipo','Estado civil','Última consulta',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pacientesFiltrados.map(p => (
              <tr key={p.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/pacientes/${p.id}`)}>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded">
                    {p.pacienteId}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center
                                    text-teal-700 font-semibold text-xs flex-shrink-0">
                      {p.nombre?.[0]}{p.apellidos?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">
                        {p.nombre} {p.apellidos}
                      </p>
                      <div className="flex gap-2">
                        {p.fechaNacimiento && (
                          <p className="text-xs text-gray-400">
                            {new Date().getFullYear() - new Date(p.fechaNacimiento).getFullYear()} años
                          </p>
                        )}
                        {p.grupoSanguineo && (
                          <span className="text-xs text-red-500 font-semibold">{p.grupoSanguineo}</span>
                        )}
                        {p.idioma === 'en' && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1 rounded">EN</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {p.telefono && <p className="text-xs text-gray-600">📱 {p.telefono}</p>}
                  {p.email    && <p className="text-xs text-gray-400 truncate max-w-[160px]">{p.email}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${p.tipoPaciente==='primera_vez'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-green-50 text-green-700'}`}>
                    {p.tipoPaciente==='primera_vez' ? 'Primera vez' : 'Subsecuente'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 capitalize">
                  {p.estadoCivil || '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {p.ultimaConsulta
                    ? format(p.ultimaConsulta.toDate(), "d MMM yyyy", {locale:es})
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={e => { e.stopPropagation(); navigate(`/pacientes/${p.id}`) }}
                    className="text-xs text-teal-600 hover:underline whitespace-nowrap">
                    Ver expediente →
                  </button>
                </td>
              </tr>
            ))}
            {pacientesFiltrados.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  <p className="text-3xl mb-2">👤</p>
                  <p className="text-sm">
                    {busqueda ? 'Sin resultados para la búsqueda' : 'Sin pacientes registrados'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo paciente */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Nuevo paciente</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Sub-tabs del form */}
            <div className="flex border-b border-gray-200 overflow-x-auto px-2">
              {TABS_FORM.map(t => (
                <button key={t.id} onClick={() => setTabForm(t.id)}
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors
                    ${tabForm===t.id ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">

              {/* Personal */}
              {tabForm === 'personal' && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['nombre','Nombre(s) *','text'],
                    ['apellidos','Apellidos *','text'],
                    ['fechaNacimiento','Fecha de nacimiento','date'],
                    ['grupoSanguineo','Grupo sanguíneo','text'],
                    ['nacionalidad','Nacionalidad','text'],
                    ['ocupacion','Ocupación','text'],
                  ].map(([f,l,t]) => (
                    <div key={f}>
                      <label className="block text-xs text-gray-500 mb-1">{l}</label>
                      <input type={t} value={form[f]}
                        onChange={e => set(f, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-teal-400" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sexo</label>
                    <select value={form.sexo} onChange={e => set('sexo', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400">
                      <option value="">Seleccionar</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                      <option value="otro">Otro / No especificado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Estado civil</label>
                    <select value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400">
                      <option value="">Seleccionar</option>
                      <option value="soltero">Soltero/a</option>
                      <option value="casado">Casado/a</option>
                      <option value="divorciado">Divorciado/a</option>
                      <option value="viudo">Viudo/a</option>
                      <option value="union_libre">Unión libre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Idioma preferido</label>
                    <select value={form.idioma} onChange={e => set('idioma', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400">
                      <option value="es">🇲🇽 Español</option>
                      <option value="en">🇺🇸 English</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Contacto */}
              {tabForm === 'contacto' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['telefono','Teléfono celular','tel'],
                      ['telefonoEmergencia','Teléfono emergencia','tel'],
                      ['email','Email','email'],
                    ].map(([f,l,t]) => (
                      <div key={f}>
                        <label className="block text-xs text-gray-500 mb-1">{l}</label>
                        <input type={t} value={form[f]}
                          onChange={e => set(f, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-teal-400" />
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-600 mb-3">📍 Dirección de casa</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Calle y número</label>
                        <input type="text" value={form.calle} onChange={e => set('calle', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-teal-400" />
                      </div>
                      {[
                        ['colonia','Colonia'],['ciudad','Ciudad'],['cp','C.P.'],['pais','País'],
                      ].map(([f,l]) => (
                        <div key={f}>
                          <label className="block text-xs text-gray-500 mb-1">{l}</label>
                          <input type="text" value={form[f]} onChange={e => set(f, e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                       focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Estado</label>
                        <select value={form.estado} onChange={e => set('estado', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-teal-400">
                          {ESTADOS_MX.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fiscal */}
              {tabForm === 'fiscal' && (
                <div className="space-y-4">
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
                    <p className="text-xs text-teal-700 font-medium mb-1">
                      💡 Datos para emitir CFDI a este paciente
                    </p>
                    <p className="text-xs text-teal-600">
                      Si el paciente no tiene RFC, usa XAXX010101000 (público en general).
                      El C.P. fiscal es obligatorio para timbrar.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Nombre / Razón social fiscal</label>
                      <input type="text" value={form.rfcRazonSocial}
                        onChange={e => set('rfcRazonSocial', e.target.value)}
                        placeholder="Nombre completo como aparece en el SAT"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-teal-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">RFC</label>
                      <input type="text" value={form.rfc}
                        onChange={e => set('rfc', e.target.value.toUpperCase())}
                        placeholder="XXXX000000XXX"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                                   focus:outline-none focus:ring-2 focus:ring-teal-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Régimen fiscal</label>
                      <select value={form.regimenFiscal}
                        onChange={e => set('regimenFiscal', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-teal-400">
                        {REGIMENES.map(r => (
                          <option key={r.c} value={r.c}>{r.c} — {r.l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Uso del CFDI</label>
                      <select value={form.usoCFDI}
                        onChange={e => set('usoCFDI', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-teal-400">
                        {USO_CFDI.map(u => (
                          <option key={u.c} value={u.c}>{u.c} — {u.l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={form.usarMismaDireccion}
                        onChange={e => sincronizarDireccion(e.target.checked)}
                        className="w-4 h-4 accent-teal-600" />
                      <span className="text-sm text-gray-700">
                        La dirección fiscal es la misma que la dirección de casa
                      </span>
                    </label>

                    {!form.usarMismaDireccion && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Calle y número fiscal</label>
                          <input type="text" value={form.calleFiscal}
                            onChange={e => set('calleFiscal', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                       focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                        {[
                          ['coloniaFiscal','Colonia'],['ciudadFiscal','Ciudad'],
                          ['cpFiscal','C.P. *'],['estadoFiscal','Estado'],
                        ].map(([f,l]) => (
                          <div key={f}>
                            <label className="block text-xs text-gray-500 mb-1">{l}</label>
                            <input type="text" value={form[f]}
                              onChange={e => set(f, e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                         focus:outline-none focus:ring-2 focus:ring-teal-400" />
                          </div>
                        ))}
                      </div>
                    )}

                    {form.usarMismaDireccion && form.cp && (
                      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                        📍 Se usará: {form.calle}, Col. {form.colonia}, C.P. {form.cp}, {form.ciudad}, {form.estado}
                      </div>
                    )}
                    {form.usarMismaDireccion && !form.cp && (
                      <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                        ⚠️ Completa la dirección de casa primero (necesitas el C.P. para facturar)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Médico */}
              {tabForm === 'medico' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Alergias conocidas</label>
                    <input type="text" value={form.alergias}
                      onChange={e => set('alergias', e.target.value)}
                      placeholder="Ej: Penicilina, ácaros, látex... o 'Ninguna'"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Enfermedades crónicas</label>
                    <input type="text" value={form.enfermedadesCronicas}
                      onChange={e => set('enfermedadesCronicas', e.target.value)}
                      placeholder="Ej: Diabetes tipo 2, hipertensión..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>
              )}

              {/* CRM */}
              {tabForm === 'crm' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Tipo de paciente</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['primera_vez','🆕 Primera vez','El paciente viene por primera vez al consultorio'],
                        ['subsecuente','🔄 Subsecuente','El paciente ya ha tenido consultas anteriores'],
                      ].map(([v,l,desc]) => (
                        <button key={v} onClick={() => set('tipoPaciente', v)}
                          className={`p-3 rounded-xl border-2 text-left transition-all
                            ${form.tipoPaciente===v
                              ? 'border-teal-500 bg-teal-50'
                              : 'border-gray-200 hover:border-gray-300'}`}>
                          <p className="text-sm font-medium text-gray-800">{l}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">¿Cómo nos conoció?</label>
                    <select value={form.canalOrigen} onChange={e => set('canalOrigen', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-teal-400">
                      <option value="">No especificado</option>
                      <option value="recomendacion">Recomendación de un paciente</option>
                      <option value="google">Google / Búsqueda en internet</option>
                      <option value="redes">Redes sociales</option>
                      <option value="walk_in">Llegó al consultorio directamente</option>
                      <option value="seguro">Seguro médico</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-xs text-blue-700 font-medium mb-2">
                      💡 Para campañas de "Te extrañamos"
                    </p>
                    <p className="text-xs text-blue-600">
                      Los pacientes subsecuentes que no han tenido consulta en más de 3 meses
                      serán candidatos para campañas automáticas de WhatsApp.
                      Esta funcionalidad estará disponible próximamente.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={guardar} disabled={saving}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm
                           font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : 'Registrar paciente'}
              </button>
              <button onClick={() => setModal(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
