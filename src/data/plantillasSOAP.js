// src/data/plantillasSOAP.js
// Plantillas clínicas SOAP por especialidad para el módulo de consultas

export const PLANTILLAS_SOAP = {
  // ── Medicina General ──────────────────────────────────
  general: {
    id: 'general',
    nombre: 'Medicina General',
    icono: '🩺',
    campos: {
      motivoConsulta: '',
      subjetivo: '',
      objetivo: '',
      diagnostico: '',
      cie10: '',
      tratamiento: '',
      indicaciones: '',
      planSeguimiento: '',
    },
    guias: {
      motivoConsulta: 'Motivo principal de la visita. ¿Desde cuándo? ¿Con qué intensidad?',
      subjetivo: 'S — Lo que refiere el paciente: síntomas, evolución, antecedentes del padecimiento actual.',
      objetivo: 'O — Exploración física: signos vitales, hallazgos relevantes al examen.',
      diagnostico: 'A — Diagnóstico o diagnósticos diferenciales más probables.',
      tratamiento: 'P — Medicamentos, dosis, vía, frecuencia y duración.',
      indicaciones: 'Indicaciones no farmacológicas: dieta, reposo, actividad física.',
      planSeguimiento: 'Fecha de próxima cita, estudios pendientes, criterios de alarma.',
    }
  },

  // ── Pediatría ─────────────────────────────────────────
  pediatria: {
    id: 'pediatria',
    nombre: 'Pediatría',
    icono: '🧒',
    campos: {
      motivoConsulta: '',
      antecedentesPerinatal: '',
      desarrolloPsicomotor: '',
      alimentacion: '',
      vacunacion: '',
      subjetivo: '',
      objetivo: '',
      somatometria: '',
      diagnostico: '',
      cie10: '',
      tratamiento: '',
      indicaciones: '',
    },
    guias: {
      motivoConsulta: 'Motivo de consulta referido por el tutor.',
      antecedentesPerinatal: 'Peso al nacer, semanas de gestación, tipo de parto, APGAR.',
      desarrolloPsicomotor: 'Hitos del desarrollo: control cefálico, sedestación, marcha, lenguaje.',
      alimentacion: 'Lactancia materna/fórmula. Ablactación. Dieta actual.',
      vacunacion: 'Esquema de vacunación completo/incompleto. Última vacuna aplicada.',
      subjetivo: 'Descripción del padecimiento actual por tutor.',
      objetivo: 'Exploración física completa: estado general, hidratación, coloración.',
      somatometria: 'Peso, talla, PC. Percentil para edad y sexo.',
      diagnostico: 'Diagnóstico principal + diagnósticos secundarios.',
      tratamiento: 'Medicamentos calculados por peso (mg/kg). Dosis y frecuencia.',
    }
  },

  // ── Ginecología ───────────────────────────────────────
  ginecologia: {
    id: 'ginecologia',
    nombre: 'Ginecología y Obstetricia',
    icono: '🌸',
    campos: {
      motivoConsulta: '',
      antecedentesGineco: '',
      cicloMenstrual: '',
      vidaSexual: '',
      gestas: '',
      subjetivo: '',
      objetivo: '',
      exploracionGinecologica: '',
      diagnostico: '',
      cie10: '',
      tratamiento: '',
      indicaciones: '',
    },
    guias: {
      motivoConsulta: 'Motivo de consulta ginecológica.',
      antecedentesGineco: 'MFUM, FUP, método anticonceptivo actual, Papanicolaou previo.',
      cicloMenstrual: 'Regular/irregular. Duración. Dismenorrea. Sangrado intermenstrual.',
      vidaSexual: 'Activa/inactiva. Número de compañeros. ITS previas.',
      gestas: 'G_P_A_C_ (gestas, partos, abortos, cesáreas). Complicaciones obstétricas.',
      subjetivo: 'Síntomas actuales referidos por la paciente.',
      objetivo: 'Exploración: mamas, abdomen, exploración pélvica, especuloscopia si aplica.',
      exploracionGinecologica: 'Hallazgos en exploración pélvica. Útero, anexos, cérvix.',
      diagnostico: 'Diagnóstico(s) ginecológico(s).',
      tratamiento: 'Tratamiento farmacológico o indicación de estudios.',
    }
  },

  // ── Cirugía pediátrica ────────────────────────────────
  cirugia_pediatrica: {
    id: 'cirugia_pediatrica',
    nombre: 'Cirugía Pediátrica',
    icono: '⚕️',
    campos: {
      motivoConsulta: '',
      antecedentesQuirurgicos: '',
      examenFisico: '',
      hallazgosQuirurgicos: '',
      diagnostico: '',
      cie10: '',
      planQuirurgico: '',
      consentimientoInformado: '',
      riesgoAnestesico: '',
      indicaciones: '',
    },
    guias: {
      motivoConsulta: 'Motivo de valoración quirúrgica.',
      antecedentesQuirurgicos: 'Cirugías previas, tipo de anestesia, complicaciones.',
      examenFisico: 'Estado general, signos vitales, área a intervenir.',
      hallazgosQuirurgicos: 'Descripción clínica de la patología quirúrgica.',
      diagnostico: 'Diagnóstico quirúrgico.',
      planQuirurgico: 'Tipo de procedimiento, vía de abordaje, materiales.',
      consentimientoInformado: 'Riesgos explicados al tutor. Firma obtenida.',
      riesgoAnestesico: 'ASA I/II/III. Evaluación preoperatoria.',
      indicaciones: 'Preparación preoperatoria: ayuno, medicación, estudios.',
    }
  },

  // ── Control crónico (DM2 / HTA) ───────────────────────
  control_cronico: {
    id: 'control_cronico',
    nombre: 'Control Crónico (DM2/HTA)',
    icono: '📊',
    campos: {
      motivoConsulta: '',
      ultimosEstudios: '',
      adherenciaTratamiento: '',
      automonitoreo: '',
      complicaciones: '',
      examenFisico: '',
      diagnostico: '',
      cie10: '',
      ajusteTratamiento: '',
      metas: '',
      planSeguimiento: '',
    },
    guias: {
      motivoConsulta: 'Consulta de control / descompensación.',
      ultimosEstudios: 'HbA1c, glucosa, creatinina, perfil lipídico, ECG (últimas fechas y valores).',
      adherenciaTratamiento: '¿Toma sus medicamentos? ¿Olvida dosis? ¿Efectos adversos?',
      automonitoreo: 'Glucometría en casa: valores promedio. TA en casa si tiene HTA.',
      complicaciones: 'Búsqueda activa: pie diabético, retinopatía, nefropatía, neuropatía.',
      examenFisico: 'TA, FC, Peso/IMC, exploración de pies, fondo de ojo si aplica.',
      ajusteTratamiento: 'Cambios en dosis o medicamentos con justificación.',
      metas: 'Metas individualizadas: HbA1c, TA, LDL, peso.',
      planSeguimiento: 'Próxima cita. Estudios a repetir. Referencia a especialista si necesario.',
    }
  },

  // ── Primera vez (genérico) ────────────────────────────
  primera_vez: {
    id: 'primera_vez',
    nombre: 'Primera Vez',
    icono: '📋',
    campos: {
      motivoConsulta: '',
      antecedentesHeredofamiliares: '',
      antecedentesPersonalesPatologicos: '',
      antecedentesPersonalesNoPatologicos: '',
      exploracionFisica: '',
      diagnostico: '',
      cie10: '',
      tratamiento: '',
      indicaciones: '',
      planSeguimiento: '',
    },
    guias: {
      motivoConsulta: 'Motivo de la primera consulta.',
      antecedentesHeredofamiliares: 'DM, HTA, cardiopatías, cáncer en familiares directos.',
      antecedentesPersonalesPatologicos: 'Enfermedades previas, cirugías, hospitalizaciones, alergias, medicamentos actuales.',
      antecedentesPersonalesNoPatologicos: 'Tabaquismo, alcoholismo, actividad física, dieta, ocupación.',
      exploracionFisica: 'Exploración física completa por aparatos y sistemas.',
      diagnostico: 'Impresión diagnóstica.',
      tratamiento: 'Plan de tratamiento inicial.',
      planSeguimiento: 'Estudios iniciales solicitados. Próxima cita.',
    }
  },
}

// ── Helper para inicializar campos ────────────────────────
export function getFormConsultaConPlantilla(plantillaId) {
  const plantilla = PLANTILLAS_SOAP[plantillaId] ?? PLANTILLAS_SOAP.general
  return {
    plantillaId,
    ...plantilla.campos,
    // Campos fijos siempre presentes
    peso: '', talla: '', ta: '', fc: '', temperatura: '', spo2: '', fr: '',
  }
}

export const LISTA_PLANTILLAS = Object.values(PLANTILLAS_SOAP)
