// src/services/permisos.js — Novaryk.Med v23
// Definición central de roles y permisos
// Los módulos usan puedeVer(rol, modulo) para decidir si mostrar contenido

export const ROLES = [
  { value: 'superadmin',  label: 'Super Admin',       desc: 'Acceso total al sistema',                      color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'dueno',       label: 'Dueño de clínica',  desc: 'Todo el consultorio, sin panel de plataforma', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'doctor',      label: 'Doctor',             desc: 'Clínica completa excepto admin de plataforma', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'recepcion',   label: 'Recepcionista',      desc: 'Agenda, pacientes y cobros',                   color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'enfermeria',  label: 'Enfermería',         desc: 'Agenda, pacientes y expediente',               color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'contador',    label: 'Contador',           desc: 'Cobros, reportes y facturación',               color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'farmacia',    label: 'Farmacia',           desc: 'Solo lectura de recetas',                      color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'reportes',    label: 'Reportes',           desc: 'Solo módulo de reportes',                      color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
]

// Módulos del sistema
export const MODULOS = [
  'agenda', 'pacientes', 'expediente', 'recetas', 'cobros',
  'facturacion', 'reportes', 'sitio', 'telemedicina',
  'usuarios', 'suscripcion', 'encuesta', 'importar', 'admin',
]

// Matriz de permisos por rol
// true = acceso, false = sin acceso
const PERMISOS = {
  //              agenda  pacient  expedient  recetas  cobros  factura  reportes  sitio  telemed  usuarios  suscripcion  encuesta  importar  admin
  superadmin: [  true,   true,    true,      true,    true,   true,    true,     true,  true,    true,     true,        true,     true,     true  ],
  dueno:      [  true,   true,    true,      true,    true,   true,    true,     true,  true,    true,     true,        true,     true,     false ],
  doctor:     [  true,   true,    true,      true,    true,   true,    true,     true,  true,    true,     true,        true,     true,     false ],
  recepcion:  [  true,   true,    false,     false,   true,   false,   false,    false, false,   false,    false,       true,     false,    false ],
  enfermeria: [  true,   true,    true,      true,    false,  false,   false,    false, false,   false,    false,       false,    false,    false ],
  contador:   [  false,  false,   false,     false,   true,   true,    true,     false, false,   false,    false,       false,    false,    false ],
  farmacia:   [  false,  false,   false,     true,    false,  false,   false,    false, false,   false,    false,       false,    false,    false ],
  reportes:   [  false,  false,   false,     false,   false,  false,   true,     false, false,   false,    false,       false,    false,    false ],
}

/**
 * Verifica si un rol tiene acceso a un módulo
 * @param {string} rol - valor del rol (ej: 'doctor')
 * @param {string} modulo - nombre del módulo (ej: 'facturacion')
 * @returns {boolean}
 */
export function puedeVer(rol, modulo) {
  if (!rol) return false
  // 'admin' es alias legacy de superadmin
  const rolNorm = rol === 'admin' ? 'superadmin' : rol
  const idx = MODULOS.indexOf(modulo)
  if (idx === -1) return true // módulo desconocido — permitir por defecto
  return PERMISOS[rolNorm]?.[idx] ?? false
}

/**
 * Devuelve todos los módulos accesibles para un rol
 * @param {string} rol
 * @returns {string[]}
 */
export function modulosDeRol(rol) {
  const rolNorm = rol === 'admin' ? 'superadmin' : rol
  return MODULOS.filter(m => puedeVer(rolNorm, m))
}

/**
 * Devuelve el objeto de rol por su value
 */
export function infoRol(rol) {
  return ROLES.find(r => r.value === rol) ?? { value: rol, label: rol, color: 'bg-gray-100 text-gray-600' }
}

// Mapa módulo → ruta
export const MODULO_RUTA = {
  agenda:       '/agenda',
  pacientes:    '/pacientes',
  expediente:   '/pacientes',
  recetas:      '/recetas',
  cobros:       '/cobros',
  facturacion:  '/facturacion',
  reportes:     '/reportes',
  sitio:        '/sitio-web',
  telemedicina: '/telemedicina',
  usuarios:     '/usuarios',
  suscripcion:  '/suscripcion',
  encuesta:     '/encuesta',
  importar:     '/importar',
  admin:        '/admin',
}
