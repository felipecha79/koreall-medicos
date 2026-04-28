import { useState, useEffect } from 'react'
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useTenant } from '../hooks/useTenant'
import toast from 'react-hot-toast'

// ── Themes prediseñados ───────────────────────────────────
const THEMES = [
  {
    id: 'teal_navy',
    nombre: 'Médico Profesional',
    desc: 'Teal + Navy — Clásico y confiable',
    preview: ['#0A8076', '#0D1F35', '#F7F4EF'],
    vars: {
      colorPrimario: '#0A8076',
      colorSecundario: '#0D1F35',
      colorFondo: '#F7F4EF',
      colorAccento: '#C4A265',
      tipografia: 'Cormorant Garamond',
      tipografiaUI: 'DM Sans',
    }
  },
  {
    id: 'blue_white',
    nombre: 'Clínica Moderna',
    desc: 'Azul + Blanco — Limpio y tecnológico',
    preview: ['#1E6FCC', '#0A2540', '#F0F7FF'],
    vars: {
      colorPrimario: '#1E6FCC',
      colorSecundario: '#0A2540',
      colorFondo: '#F0F7FF',
      colorAccento: '#E8A830',
      tipografia: 'Playfair Display',
      tipografiaUI: 'Inter',
    }
  },
  {
    id: 'green_earth',
    nombre: 'Bienestar Natural',
    desc: 'Verde + Tierra — Cálido y humano',
    preview: ['#2D7A3A', '#1A3A20', '#F5F2EC'],
    vars: {
      colorPrimario: '#2D7A3A',
      colorSecundario: '#1A3A20',
      colorFondo: '#F5F2EC',
      colorAccento: '#B8860B',
      tipografia: 'Lora',
      tipografiaUI: 'Source Sans Pro',
    }
  },
  {
    id: 'pink_pediatria',
    nombre: 'Pediatría',
    desc: 'Rosa + Naranja — Amigable para niños',
    preview: ['#E84393', '#FF6B35', '#FFF5F9'],
    vars: {
      colorPrimario: '#E84393',
      colorSecundario: '#FF6B35',
      colorFondo: '#FFF5F9',
      colorAccento: '#FFD700',
      tipografia: 'Nunito',
      tipografiaUI: 'Nunito',
    }
  },
  {
    id: 'purple_oncology',
    nombre: 'Especialista',
    desc: 'Morado + Gris — Serio y esperanzador',
    preview: ['#6B3FA0', '#2D2D3A', '#F8F5FF'],
    vars: {
      colorPrimario: '#6B3FA0',
      colorSecundario: '#2D2D3A',
      colorFondo: '#F8F5FF',
      colorAccento: '#A0C4FF',
      tipografia: 'Merriweather',
      tipografiaUI: 'Open Sans',
    }
  },
  {
    id: 'red_dental',
    nombre: 'Dental / Estética',
    desc: 'Rojo coral + Blanco — Sonrisas brillantes',
    preview: ['#E53935', '#212121', '#FFFAFA'],
    vars: {
      colorPrimario: '#E53935',
      colorSecundario: '#212121',
      colorFondo: '#FFFAFA',
      colorAccento: '#FF8A65',
      tipografia: 'Raleway',
      tipografiaUI: 'Raleway',
    }
  },
]

const TIPOGRAFIAS = [
  'Cormorant Garamond', 'DM Sans', 'Inter', 'Playfair Display',
  'Lora', 'Merriweather', 'Nunito', 'Raleway', 'Open Sans', 'Source Sans Pro',
]

export default function SitioWeb() {
  const { tenantId, tenant } = useTenant()
  const [config, setConfig] = useState({
    themeId: 'teal_navy',
    colorPrimario: '#0A8076',
    colorSecundario: '#0D1F35',
    colorFondo: '#F7F4EF',
    colorAccento: '#C4A265',
    tipografia: 'Cormorant Garamond',
    tipografiaUI: 'DM Sans',
    logoUrl: '',
    nombreConsultorio: '',
    sloganHero: 'Su salud, nuestra prioridad',
    especialidad: '',
    descripcionDoctor: '',
    cedulaProfesional: '',
    direccion: '',
    telefonoContacto: '',
    emailContacto: '',
    horarios: {
      lun: '09:00 – 14:00 · 16:00 – 20:00',
      mar: '09:00 – 14:00 · 16:00 – 20:00',
      mie: '09:00 – 14:00 · 16:00 – 20:00',
      jue: '09:00 – 14:00 · 16:00 – 20:00',
      vie: '09:00 – 14:00 · 16:00 – 20:00',
      sab: '09:00 – 13:00',
      dom: '',
    },
    servicios: [
      { titulo: 'Consulta General', descripcion: 'Diagnóstico y tratamiento con expediente digital.', icono: '🩺' },
      { titulo: 'Medicina Preventiva', descripcion: 'Chequeos y programas de prevención personalizados.', icono: '💉' },
      { titulo: 'Control Crónico', descripcion: 'Seguimiento de diabetes, hipertensión y más.', icono: '📊' },
    ],
    activado: true,
  })
  const [tab, setTab] = useState('theme')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    getDoc(doc(db, `tenants/${tenantId}`)).then(snap => {
      if (snap.exists() && snap.data().sitioWeb) {
        setConfig(c => ({ ...c, ...snap.data().sitioWeb }))
      } else if (snap.exists()) {
        // Pre-fill from tenant data
        const t = snap.data()
        setConfig(c => ({
          ...c,
          nombreConsultorio: t.nombre ?? '',
          especialidad: t.especialidad ?? '',
          cedulaProfesional: t.cedula ?? '',
          direccion: t.direccion ?? '',
          telefonoContacto: t.telefono ?? '',
          emailContacto: t.email ?? '',
        }))
      }
    })
  }, [tenantId])

  const guardar = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, `tenants/${tenantId}`), { sitioWeb: config })
      toast.success('Sitio web actualizado ✓')
    } catch(e) {
      toast.error('Error al guardar')
    } finally { setSaving(false) }
  }

  const aplicarTheme = (theme) => {
    setConfig(c => ({ ...c, themeId: theme.id, ...theme.vars }))
    toast.success(`Theme "${theme.nombre}" aplicado`)
  }

  const themeActivo = THEMES.find(t => t.id === config.themeId) ?? THEMES[0]

  const TABS_CONFIG = [
    { id: 'theme',    label: '🎨 Apariencia' },
    { id: 'info',     label: '📋 Información' },
    { id: 'horarios', label: '🕐 Horarios' },
    { id: 'servicios',label: '🩺 Servicios' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Mi sitio web</h2>
          <p className="text-sm text-gray-400">
            Personaliza tu landing page — los cambios se publican al instante
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/" target="_blank" rel="noreferrer"
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors">
            Ver sitio →
          </a>
          <button onClick={guardar} disabled={saving}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg
                       hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando...' : 'Publicar cambios'}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {TABS_CONFIG.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${tab === t.id ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Apariencia / Themes ─────────────────────── */}
      {tab === 'theme' && (
        <div className="space-y-6">

          {/* Theme activo */}
          <div className="bg-white rounded-xl border border-teal-300 p-4">
            <p className="text-xs text-gray-500 mb-2 font-medium">Theme activo</p>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {themeActivo.preview.map((color, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border border-gray-200"
                    style={{ background: color }} />
                ))}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{themeActivo.nombre}</p>
                <p className="text-xs text-gray-500">{themeActivo.desc}</p>
              </div>
            </div>
          </div>

          {/* Grid de themes */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Elige un tema prediseñado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {THEMES.map(theme => (
                <button key={theme.id}
                  onClick={() => aplicarTheme(theme)}
                  className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md
                    ${config.themeId === theme.id
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  {/* Preview de colores */}
                  <div className="flex gap-2 mb-3">
                    {theme.preview.map((color, i) => (
                      <div key={i}
                        className="flex-1 h-10 rounded-lg"
                        style={{ background: color }} />
                    ))}
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">{theme.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{theme.desc}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {theme.vars.tipografia} · {theme.vars.tipografiaUI}
                  </p>
                  {config.themeId === theme.id && (
                    <span className="mt-2 inline-block text-xs bg-teal-100 text-teal-700
                                     px-2 py-0.5 rounded-full font-medium">
                      ✓ Activo
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Personalización de colores */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">
              Ajuste fino de colores
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['colorPrimario', 'Color principal'],
                ['colorSecundario', 'Color oscuro'],
                ['colorFondo', 'Color de fondo'],
                ['colorAccento', 'Color acento'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={config[key]}
                      onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={config[key]}
                      onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono
                                 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </div>
                </div>
              ))}
            </div>

            {/* Tipografías */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              {[
                ['tipografia', 'Tipografía de títulos'],
                ['tipografiaUI', 'Tipografía de texto'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <select value={config[key]}
                    onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400">
                    {TIPOGRAFIAS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview en tiempo real */}
          <div className="bg-gray-900 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-3">Vista previa del hero</p>
            <div className="rounded-xl overflow-hidden" style={{ background: config.colorSecundario }}>
              <div className="px-6 py-8">
                <p className="text-xs mb-2" style={{ color: config.colorPrimario, fontFamily: 'monospace' }}>
                  ● Consultorio activo
                </p>
                <h1 className="text-3xl font-light mb-2" style={{ color: '#FFFFFF', fontFamily: config.tipografia }}>
                  {config.sloganHero || 'Su salud, nuestra prioridad'}
                </h1>
                <p className="text-sm mb-4" style={{ color: config.colorAccento, fontFamily: 'monospace', letterSpacing: '.1em' }}>
                  {config.especialidad || 'Medicina General'}
                </p>
                <button className="px-5 py-2 rounded-full text-sm font-medium"
                  style={{ background: config.colorPrimario, color: '#FFFFFF', fontFamily: config.tipografiaUI }}>
                  📅 Agendar cita
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Información ─────────────────────────────── */}
      {tab === 'info' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Datos del consultorio</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['nombreConsultorio', 'Nombre del consultorio *', 'text'],
                ['especialidad',      'Especialidad',             'text'],
                ['sloganHero',        'Frase principal del hero', 'text'],
                ['cedulaProfesional', 'Cédula profesional',       'text'],
                ['telefonoContacto',  'Teléfono de contacto',     'tel'],
                ['emailContacto',     'Email de contacto',        'email'],
                ['direccion',         'Dirección completa',       'text'],
              ].map(([field, label, type]) => (
                <div key={field}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type={type} value={config[field] ?? ''}
                    onChange={e => setConfig(c => ({ ...c, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}
              <div className="col-span-full">
                <label className="block text-xs text-gray-500 mb-1">Descripción del doctor</label>
                <textarea value={config.descripcionDoctor ?? ''} rows={3}
                  onChange={e => setConfig(c => ({ ...c, descripcionDoctor: e.target.value }))}
                  placeholder="Breve descripción sobre el doctor y su experiencia..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Horarios ─────────────────────────────────── */}
      {tab === 'horarios' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-700 mb-4">Horarios de atención</p>
          <div className="space-y-3">
            {[
              ['lun','Lunes'],['mar','Martes'],['mie','Miércoles'],
              ['jue','Jueves'],['vie','Viernes'],['sab','Sábado'],['dom','Domingo'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{label}</span>
                <input type="text" value={config.horarios?.[key] ?? ''}
                  onChange={e => setConfig(c => ({
                    ...c,
                    horarios: { ...c.horarios, [key]: e.target.value }
                  }))}
                  placeholder={key === 'dom' ? 'Cerrado' : '09:00 – 14:00 · 16:00 – 20:00'}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Deja en blanco los días cerrados. Formato sugerido: 09:00 – 14:00 · 16:00 – 20:00
          </p>
        </div>
      )}

      {/* ── Tab: Servicios ────────────────────────────────── */}
      {tab === 'servicios' && (
        <div className="space-y-4">
          {(config.servicios ?? []).map((svc, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Servicio {i + 1}</p>
                <button
                  onClick={() => setConfig(c => ({
                    ...c,
                    servicios: c.servicios.filter((_, idx) => idx !== i)
                  }))}
                  className="text-xs text-red-400 hover:text-red-600">
                  Eliminar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ícono (emoji)</label>
                  <input type="text" value={svc.icono}
                    onChange={e => setConfig(c => {
                      const svcs = [...c.servicios]
                      svcs[i] = { ...svcs[i], icono: e.target.value }
                      return { ...c, servicios: svcs }
                    })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Título</label>
                  <input type="text" value={svc.titulo}
                    onChange={e => setConfig(c => {
                      const svcs = [...c.servicios]
                      svcs[i] = { ...svcs[i], titulo: e.target.value }
                      return { ...c, servicios: svcs }
                    })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                  <input type="text" value={svc.descripcion}
                    onChange={e => setConfig(c => {
                      const svcs = [...c.servicios]
                      svcs[i] = { ...svcs[i], descripcion: e.target.value }
                      return { ...c, servicios: svcs }
                    })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => setConfig(c => ({
              ...c,
              servicios: [...(c.servicios ?? []), { titulo: '', descripcion: '', icono: '🏥' }]
            }))}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl
                       text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600
                       hover:bg-teal-50 transition-all">
            + Agregar servicio
          </button>
        </div>
      )}

      {/* Botón guardar sticky en móvil */}
      <div className="sticky bottom-4 mt-6">
        <button onClick={guardar} disabled={saving}
          className="w-full py-3 bg-teal-600 text-white text-sm font-medium rounded-xl
                     hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-lg">
          {saving ? 'Publicando...' : '🚀 Publicar cambios'}
        </button>
      </div>
    </div>
  )
}
