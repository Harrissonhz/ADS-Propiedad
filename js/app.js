// Inicialización de Supabase
let supabaseClient = null;

function initSupabase() {
  if (!window.ADS_CONFIG) {
    console.warn(
      'ADS_CONFIG no está definido. Crea js/config.js basado en config.example.js.'
    );
    return;
  }
  const { supabaseUrl, supabaseAnonKey } = window.ADS_CONFIG;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      'Supabase URL o anon key no configurados. Edita js/config.js con tus credenciales.'
    );
    return;
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
}

// Estado en memoria
let proyectos = [];
let evaluacionesPorProyecto = {};
let sortConfig = { key: 'nombre', dir: 'asc' }; // Nuevo: Estado global de orden

// Utilidades
function formatearPrecioMillones(valor) {
  if (valor == null || isNaN(valor)) return 'N/D';
  const millones = valor / 1_000_000;
  return millones.toLocaleString('es-CO', {
    maximumFractionDigits: 0,
  });
}

function promedio(arr) {
  if (!arr.length) return null;
  const sum = arr.reduce((acc, v) => acc + v, 0);
  return sum / arr.length;
}

function calcularResumen(proyectosFiltrados) {
  const total = proyectosFiltrados.length;
  const preciosMedios = proyectosFiltrados
    .map((p) => p.precio_desde || p.precio_hasta)
    .filter((v) => typeof v === 'number');
  const promedioPrecio = promedio(preciosMedios);

  const puntuaciones = proyectosFiltrados
    .map((p) => p.promedio_familiar)
    .filter((v) => typeof v === 'number');
  const promedioPuntuacion = promedio(puntuaciones);

  return { total, promedioPrecio, promedioPuntuacion };
}

function crearChipInteres(interesFinal) {
  if (interesFinal === false) {
    return '<span class="interest-chip interest-chip--no">Descartado</span>';
  }
  if (interesFinal === true) {
    return '<span class="interest-chip interest-chip--si">En análisis</span>';
  }
  return '<span class="interest-chip">Sin definir</span>';
}

function origenTag(origen) {
  const base = 'project-origin-tag';
  if (origen === 'expo2026') {
    return `<span class="${base} ${base}--expo">Expo 2026</span>`;
  }
  if (origen === 'web') {
    return `<span class="${base} ${base}--web">Web</span>`;
  }
  if (origen === 'familiar') {
    return `<span class="${base} ${base}--familiar">Familiar</span>`;
  }
  return '';
}

// Carga de datos desde Supabase
async function cargarProyectos() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('proyecto')
    .select(
      `
      id,
      nombre,
      id_original_expo,
      precio_desde,
      precio_hasta,
      direccion,
      departamento_text,
      ciudad_text,
      sector,
      tipo_inmueble,
      estrato,
      area_m2,
      estado_obra,
      email_contacto,
      telefono_contacto,
      sitio_web,
      url_imagen,
      origen,
      fecha_registro,
      visita_estado,
      visita_observaciones,
      evaluacion_familiar (
        id,
        puntuacion_general,
        interes_final,
        comentario,
        miembro_familia (
          nombre_miembro
        )
      )
    `
    )
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error cargando proyectos:', error);
    return;
  }

  proyectos = (data || []).map((p) => {
    const evals = p.evaluacion_familiar || [];
    const puntuaciones = evals.map((e) => e.puntuacion_general || 0);
    const promedioFamiliar = puntuaciones.length ? promedio(puntuaciones) : null;
    const hayDescartados = evals.some((e) => e.interes_final === false);
    const hayInteres = evals.some((e) => e.interes_final === true);

    evaluacionesPorProyecto[p.id] = evals;

    return {
      ...p,
      // Normalizamos nombres de campos para el frontend
      ciudad: p.ciudad_text,
      departamento: p.departamento_text,
      promedio_familiar: promedioFamiliar,
      // Priorizamos el descarte: si alguien lo descarta (false), el estado general es descartado
      interes_final: hayDescartados ? false : hayInteres ? true : null,
    };
  });

  poblarFiltrosDinamicos();
  poblarSelectProyectosEvaluacion();
  
  // Nuevo: Verificar si venimos desde Proyectos con un ID para evaluar
  const params = new URLSearchParams(window.location.search);
  const idEv = params.get('id');
  if (idEv) {
    const select = document.getElementById('ev-proyecto');
    if (select) {
      select.value = idEv;
      // Scroll al formulario si estamos en la página de evaluación
      const form = document.getElementById('form-evaluacion');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  renderizarTabla();
}

function poblarFiltrosDinamicos() {
  const ciudadSelect = document.getElementById('filter-ciudad');
  if (!ciudadSelect) return;
  const ciudades = Array.from(
    new Set(
      proyectos
        .map((p) => p.ciudad)
        .filter((c) => typeof c === 'string' && c.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, 'es'));

  ciudadSelect.innerHTML = '<option value="">Todas</option>';
  ciudades.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    ciudadSelect.appendChild(opt);
  });
}

function poblarSelectProyectosEvaluacion() {
  const selectProyecto = document.getElementById('ev-proyecto');
  if (!selectProyecto) return;

  const valorActual = selectProyecto.value;
  selectProyecto.innerHTML = '<option value="">Selecciona un proyecto</option>';
  proyectos.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nombre} (${p.ciudad || 'Sin ciudad'})`;
    selectProyecto.appendChild(opt);
  });
  if (valorActual) {
    selectProyecto.value = valorActual;
  }
}

// Filtros y orden
function obtenerFiltros() {
  const elTexto = document.getElementById('filter-texto');
  const elPrecioMin = document.getElementById('filter-precio-min');
  const elPrecioMax = document.getElementById('filter-precio-max');
  const elCiudad = document.getElementById('filter-ciudad');
  const elEstrato = document.getElementById('filter-estrato');
  const elTipo = document.getElementById('filter-tipo');
  const elEstado = document.getElementById('filter-estado-obra');
  const elSoloInteres = document.getElementById('filter-solo-interes');

  // Si esta página no tiene filtros (ej: Home/Evaluación), devolvemos filtros neutros.
  if (
    !elTexto ||
    !elPrecioMin ||
    !elPrecioMax ||
    !elCiudad ||
    !elEstrato ||
    !elTipo ||
    !elEstado ||
    !elSoloInteres
  ) {
    return {
      texto: '',
      precioMin: null,
      precioMax: null,
      ciudad: null,
      estrato: null,
      tipo: null,
      estadoObra: null,
      soloInteres: false,
    };
  }

  const texto = elTexto.value.trim().toLowerCase();
  const precioMin = parseFloat(elPrecioMin.value);
  const precioMax = parseFloat(elPrecioMax.value);
  const ciudad = elCiudad.value;
  const estrato = elEstrato.value;
  const tipo = elTipo.value;
  const estadoObra = elEstado.value.trim();
  const soloInteres = elSoloInteres.checked;

  return {
    texto,
    precioMin: isNaN(precioMin) ? null : precioMin * 1_000_000,
    precioMax: isNaN(precioMax) ? null : precioMax * 1_000_000,
    ciudad: ciudad || null,
    estrato: estrato || null,
    tipo: tipo || null,
    estadoObra: estadoObra || null,
    soloInteres,
  };
}

function aplicarFiltros() {
  const f = obtenerFiltros();

  let lista = [...proyectos];

  if (f.texto) {
    lista = lista.filter((p) => {
      const blob = `${p.nombre || ''} ${p.ciudad || ''} ${p.sector || ''}`.toLowerCase();
      return blob.includes(f.texto);
    });
  }

  if (f.precioMin != null) {
    lista = lista.filter((p) => {
      const precio = p.precio_desde || p.precio_hasta;
      if (typeof precio !== 'number') return false;
      return precio >= f.precioMin;
    });
  }

  if (f.precioMax != null) {
    lista = lista.filter((p) => {
      const precio = p.precio_desde || p.precio_hasta;
      if (typeof precio !== 'number') return false;
      return precio <= f.precioMax;
    });
  }

  if (f.ciudad) {
    lista = lista.filter((p) => p.ciudad === f.ciudad);
  }

  if (f.estrato) {
    lista = lista.filter((p) => String(p.estrato || '') === f.estrato);
  }

  if (f.tipo) {
    lista = lista.filter((p) => p.tipo_inmueble === f.tipo);
  }

  if (f.estadoObra) {
    lista = lista.filter((p) => (p.estado_obra || '').trim() === f.estadoObra);
  }

  if (f.soloInteres) {
    lista = lista.filter((p) => p.interes_final !== false);
  }

  return lista;
}

function aplicarOrden(lista) {
  const copia = [...lista];
  const { key, dir } = sortConfig;

  copia.sort((a, b) => {
    let valA, valB;

    switch (key) {
      case 'visita': valA = a.visita_estado; valB = b.visita_estado; break;
      case 'nombre': valA = a.nombre; valB = b.nombre; break;
      case 'ciudad': valA = a.ciudad; valB = b.ciudad; break;
      case 'tipo': valA = a.tipo_inmueble; valB = b.tipo_inmueble; break;
      case 'estrato': valA = Number(a.estrato || 0); valB = Number(b.estrato || 0); break;
      case 'area': valA = Number(a.area_m2 || 0); valB = Number(b.area_m2 || 0); break;
      case 'precio': valA = Number(a.precio_desde || 0); valB = Number(b.precio_desde || 0); break;
      case 'estado': valA = a.estado_obra; valB = b.estado_obra; break;
      case 'puntuacion': valA = a.promedio_familiar || 0; valB = b.promedio_familiar || 0; break;
      case 'interes': 
        valA = a.interes_final === true ? 1 : a.interes_final === false ? -1 : 0; 
        valB = b.interes_final === true ? 1 : b.interes_final === false ? -1 : 0; 
        break;
      default: valA = a.nombre; valB = b.nombre;
    }

    if (typeof valA === 'string') {
      const cmp = (valA || '').localeCompare(valB || '', 'es');
      return dir === 'asc' ? cmp : -cmp;
    } else {
      return dir === 'asc' ? (valA - valB) : (valB - valA);
    }
  });

  // NUEVO: Aseguramos que los DESCARTADOS siempre vayan al final
  copia.sort((a, b) => {
    const aDesc = a.interes_final === false ? 1 : 0;
    const bDesc = b.interes_final === false ? 1 : 0;
    return aDesc - bDesc;
  });

  return copia;
}

// Render
function renderizarTabla() {
  const tbody = document.getElementById('projects-tbody');
  const noResults = document.getElementById('no-results');
  const resumenEl = document.getElementById('projects-summary');
  if (!tbody || !noResults || !resumenEl) return;

  const filtrados = aplicarFiltros();
  const ordenados = aplicarOrden(filtrados);

  tbody.innerHTML = '';

  if (!ordenados.length) {
    noResults.classList.remove('hidden');
  } else {
    noResults.classList.add('hidden');
  }

  ordenados.forEach((p) => {
    const tr = document.createElement('tr');
    
    // Aplicar clase si está descartado
    if (p.interes_final === false) {
      tr.classList.add('project-row--discarded');
    }

    const precioBase = p.precio_desde || p.precio_hasta;
    let precioTexto = formatearPrecioMillones(p.precio_desde || 0);
    if (p.precio_hasta && p.precio_hasta !== p.precio_desde) {
      precioTexto += ` - ${formatearPrecioMillones(p.precio_hasta)}`;
    }

    const ciudadSector =
      [p.ciudad, p.sector].filter((x) => x && x.trim().length > 0).join(' · ') ||
      'N/D';

    const promedio =
      typeof p.promedio_familiar === 'number'
        ? p.promedio_familiar.toFixed(1).replace('.', ',')
        : 'Sin datos';
    const cantidadEvals = (evaluacionesPorProyecto[p.id] || []).length;

    tr.innerHTML = `
      <td data-label="Proyecto">
        <div class="project-main-cell">
          <span class="project-title">${p.nombre || 'Sin nombre'}</span>
          <span class="project-meta">
            ${p.id_original_expo ? `ID CSV: ${p.id_original_expo}` : ''}
            ${p.sitio_web ? ` · <a href="${p.sitio_web}" target="_blank" rel="noopener noreferrer">Ver sitio</a>` : ''}
          </span>
          ${origenTag(p.origen || '')}
        </div>
      </td>
      <td data-label="Ciudad / Sector">${ciudadSector}</td>
      <td data-label="Tipo">${p.tipo_inmueble || 'N/D'}</td>
      <td data-label="Estrato">${p.estrato || 'N/D'}</td>
      <td data-label="Área (m²)">${p.area_m2 != null ? p.area_m2 : 'N/D'}</td>
      <td data-label="Precio (M)">${precioBase ? precioTexto : 'N/D'}</td>
      <td data-label="Estado">${p.estado_obra || 'N/D'}</td>
      <td data-label="Promedio familiar">
        <div class="project-score" title="Clic para ver comentarios" data-accion="ver-comentarios" data-id="${p.id}" style="cursor:pointer">
          <span class="project-score__value">${promedio}</span>
          <span class="project-score__detail">${cantidadEvals} opiniones (ver <span style="text-decoration: underline">notas</span>)</span>
        </div>
      </td>
      <td data-label="Interés">${crearChipInteres(p.interes_final)}</td>
      <td data-label="Visita">
        <span class="visit-badge visit-badge--${(p.visita_estado || 'Sin agendar').toLowerCase().replace(/\s+/g, '-')}" title="${p.visita_observaciones || ''}">
          ${p.visita_estado || 'Sin agendar'}
        </span>
      </td>
      <td data-label="Acciones">
        <div class="action-buttons">
          <button class="btn btn--pill-small btn--secondary" data-accion="fijar-evaluacion" data-id="${p.id}">
            Evaluar
          </button>
          <button class="btn btn--pill-small btn--danger" data-accion="descartar" data-id="${p.id}">
            Descartar
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);

    // NUEVO: Fila de comentarios oculta por defecto
    const trComments = document.createElement('tr');
    trComments.id = `comments-${p.id}`;
    trComments.classList.add('comments-row', 'hidden');
    
    const detalleEvals = (evaluacionesPorProyecto[p.id] || []).map(ev => {
      const nombre = ev.miembro_familia?.nombre_miembro || 'Anon';
      const nota = ev.puntuacion_general ? `⭐ ${ev.puntuacion_general}` : '';
      const coment = ev.comentario ? `<span class="comment-text">"${ev.comentario}"</span>` : '<i>Sin comentario</i>';
      const chipInteres = ev.interes_final === false ? ' (Descartó)' : '';
      return `<div class="evaluation-detail"><b>${nombre}</b>: ${nota} - ${coment}${chipInteres}</div>`;
    }).join('') || 'No hay opiniones registradas.';

    trComments.innerHTML = `<td colspan="10"><div class="comments-container">${detalleEvals}</div></td>`;
    tbody.appendChild(trComments);
  });

  const resumen = calcularResumen(ordenados);
  const partes = [];
  partes.push(
    `<span class="projects-summary__item"><span class="projects-summary__label">Proyectos listados:</span><span class="projects-summary__value">${resumen.total}</span></span>`
  );
  if (resumen.promedioPrecio != null) {
    partes.push(
      `<span class="projects-summary__item"><span class="projects-summary__label">Precio medio aprox.:</span><span class="projects-summary__value">${formatearPrecioMillones(
        resumen.promedioPrecio
      )} M</span></span>`
    );
  }
  if (resumen.promedioPuntuacion != null) {
    partes.push(
      `<span class="projects-summary__item"><span class="projects-summary__label">Puntuación familiar media:</span><span class="projects-summary__value">${resumen.promedioPuntuacion
        .toFixed(1)
        .replace('.', ',')}</span></span>`
    );
  }
  resumenEl.innerHTML = partes.join('');
}

// Manejo de formularios
async function manejarNuevoProyecto(event) {
  event.preventDefault();
  if (!supabaseClient) {
    alert(
      'Supabase no está configurado aún. Edita js/config.js antes de guardar proyectos.'
    );
    return;
  }

  const nombre = document.getElementById('np-nombre').value.trim();
  const constructoraNombre =
    document.getElementById('np-constructora').value.trim() || null;
  const ciudad = document.getElementById('np-ciudad').value.trim();
  const sector = document.getElementById('np-sector').value.trim() || null;
  const tipo = document.getElementById('np-tipo').value || null;
  const precioDesdeNum = parseFloat(
    document.getElementById('np-precio-desde').value
  );
  const precioHastaNum = parseFloat(
    document.getElementById('np-precio-hasta').value
  );
  const estratoVal = document.getElementById('np-estrato').value;
  const areaNum = parseFloat(document.getElementById('np-area').value);
  const estado = document.getElementById('np-estado').value || null;
  const sitioWeb = document.getElementById('np-sitio-web').value.trim() || null;
  const urlImagen =
    document.getElementById('np-url-imagen').value.trim() || null;

  if (!nombre || !ciudad) {
    alert('Por favor completa al menos el nombre del proyecto y la ciudad.');
    return;
  }

  let constructoraId = null;
  if (constructoraNombre) {
    // Buscar si ya existe la constructora
    const { data: existentes, error: errBusca } = await supabaseClient
      .from('constructora')
      .select('id')
      .ilike('nombre', constructoraNombre)
      .limit(1);

    if (errBusca) {
      console.error('Error buscando constructora:', errBusca);
    }

    if (existentes && existentes.length) {
      constructoraId = existentes[0].id;
    } else {
      const { data: nueva, error: errNueva } = await supabaseClient
        .from('constructora')
        .insert({ nombre: constructoraNombre })
        .select('id')
        .single();

      if (errNueva) {
        console.error('Error creando constructora:', errNueva);
      } else if (nueva) {
        constructoraId = nueva.id;
      }
    }
  }

  const { error } = await supabaseClient.from('proyecto').insert({
    nombre,
    ciudad_text: ciudad,
    sector,
    tipo_inmueble: tipo,
    precio_desde: isNaN(precioDesdeNum)
      ? null
      : precioDesdeNum * 1_000_000,
    precio_hasta: isNaN(precioHastaNum)
      ? null
      : precioHastaNum * 1_000_000,
    estrato: estratoVal ? parseInt(estratoVal, 10) : null,
    area_m2: isNaN(areaNum) ? null : areaNum,
    estado_obra: estado,
    sitio_web: sitioWeb,
    url_imagen: urlImagen,
    origen: 'familiar',
    constructora_id: constructoraId,
  });

  if (error) {
    console.error('Error insertando proyecto:', error);
    alert('Ocurrió un error al guardar el proyecto en Supabase.');
    return;
  }

  (event.target || document.getElementById('form-nuevo-proyecto')).reset();
  await cargarProyectos();
  alert('Proyecto guardado correctamente.');
}

async function manejarEvaluacion(event) {
  event.preventDefault();
  if (!supabaseClient) {
    alert(
      'Supabase no está configurado aún. Edita js/config.js antes de guardar evaluaciones.'
    );
    return;
  }

  const proyectoId = document.getElementById('ev-proyecto').value;
  const miembroNombre = document.getElementById('ev-miembro').value.trim();
  const puntuacionNum = parseInt(
    document.getElementById('ev-puntuacion').value,
    10
  );
  const comentario = document.getElementById('ev-comentario').value.trim();
  const interesFinal = document.getElementById('ev-interes-final').checked;
  const visitaEstado = document.getElementById('ev-visita-estado').value;
  const visitaNotas = document.getElementById('ev-visita-notas').value.trim();

  if (!proyectoId || !miembroNombre || isNaN(puntuacionNum)) {
    alert(
      'Selecciona un proyecto, indica el miembro de la familia y asigna una puntuación entre 1 y 5.'
    );
    return;
  }

  // Registrar/obtener miembro de la familia
  let miembroId = null;
  const { data: miembrosExistentes, error: errBuscaMiembro } =
    await supabaseClient
      .from('miembro_familia')
      .select('id')
      .ilike('nombre_miembro', miembroNombre)
      .limit(1);

  if (errBuscaMiembro) {
    console.error('Error buscando miembro de familia:', errBuscaMiembro);
  }

  if (miembrosExistentes && miembrosExistentes.length) {
    miembroId = miembrosExistentes[0].id;
  } else {
    const { data: nuevoMiembro, error: errNuevoMiembro } = await supabaseClient
      .from('miembro_familia')
      .insert({ nombre_miembro: miembroNombre })
      .select('id')
      .single();

    if (errNuevoMiembro) {
      console.error('Error creando miembro de familia:', errNuevoMiembro);
    } else if (nuevoMiembro) {
      miembroId = nuevoMiembro.id;
    }
  }

  if (!miembroId) {
    alert('No fue posible registrar al miembro de la familia.');
    return;
  }

  const { error } = await supabaseClient.from('evaluacion_familiar').insert({
    proyecto_id: proyectoId,
    miembro_id: miembroId,
    puntuacion_general: puntuacionNum,
    comentario: comentario || null,
    interes_final: interesFinal,
  });

  if (error) {
    console.error('Error insertando evaluación:', error);
    alert('Ocurrió un error al guardar la evaluación.');
    return;
  }

  // NUEVO: Actualizar el estado de visita en el proyecto
  const { error: errorProyecto } = await supabaseClient
    .from('proyecto')
    .update({ 
      visita_estado: visitaEstado, 
      visita_observaciones: visitaNotas 
    })
    .eq('id', proyectoId);

  if (errorProyecto) {
    console.error('Error actualizando visita del proyecto:', errorProyecto);
  }

  (event.target || document.getElementById('form-evaluacion')).reset();
  document.getElementById('ev-proyecto').value = proyectoId;

  const miembroSelect = document.getElementById('ev-miembro');
  if (miembroSelect) {
    const miembroGuardado = localStorage.getItem('ads_miembro_familia');
    if (miembroGuardado) {
      miembroSelect.value = miembroGuardado;
    }
  }

  await cargarProyectos();
  alert('Evaluación registrada correctamente.');
}

// Motor de Carga Masiva (CSV)
async function manejarCargaCSV() {
  const fileInput = document.getElementById('csv-file');
  const statusEl = document.getElementById('csv-status');

  if (!fileInput.files.length) {
    alert('Por favor selecciona un archivo CSV primero.');
    return;
  }

  statusEl.classList.remove('hidden');
  statusEl.innerHTML = '⚙️ Procesando archivo...';
  
  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    // Saltamos la cabecera (primera línea)
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    let cargados = 0;
    let errores = 0;
    const nuevosProyectos = [];

    statusEl.innerHTML = `⚙️ Analizando ${dataLines.length} proyectos...`;

    // 1. Mapear constructoras únicas para insertarlas/buscarlas de una vez
    const constructorasSet = new Set();
    dataLines.forEach(line => {
      const parts = parsearCSVLine(line);
      if (parts[9]) constructorasSet.add(parts[9]); // columna 9 es constructora
    });

    const constructorasMap = {}; // nombre -> id
    for (const nombreC of Array.from(constructorasSet)) {
      const { data: exist } = await supabaseClient.from('constructora').select('id').ilike('nombre', nombreC).limit(1);
      if (exist && exist.length) {
        constructorasMap[nombreC] = exist[0].id;
      } else {
        const { data: nueva } = await supabaseClient.from('constructora').insert({ nombre: nombreC }).select('id').single();
        if (nueva) constructorasMap[nombreC] = nueva.id;
      }
    }

    // 2. Preparar los proyectos con NORMALIZACIÓN
    for (const line of dataLines) {
      const p = parsearCSVLine(line);
      if (p.length < 2) continue; // línea vacía o incompleta

      const nombreLimpio = p[0].trim(); // Quitamos espacios invisibles
      if (!nombreLimpio) continue;

      const precioD = parseFloat(p[6]);
      const precioH = parseFloat(p[7]);
      const area = parseFloat(p[5]);

      nuevosProyectos.push({
        nombre: nombreLimpio,
        ciudad_text: p[1] ? p[1].trim() : null,
        sector: p[2] ? p[2].trim() : null,
        tipo_inmueble: p[3] ? p[3].trim() : null,
        estrato: p[4] ? parseInt(p[4], 10) : null,
        precio_desde: isNaN(precioD) ? null : precioD * 1_000_000,
        precio_hasta: isNaN(precioH) ? null : precioH * 1_000_000,
        area_m2: isNaN(area) ? null : area,
        estado_obra: p[8] ? p[8].trim() : null,
        constructora_id: constructorasMap[p[9]] || null,
        sitio_web: p[10] || null,
        url_imagen: p[11] || null,
        visita_estado: p[12] || 'Sin agendar',
        visita_observaciones: p[13] || null,
        origen: 'web'
      });
    }

    // 3. Sincronización Avanzada (Upsert por nombre)
    if (nuevosProyectos.length) {
      statusEl.innerHTML = `📡 Sincronizando con la base de datos...`;
      
      // Enviamos el lote completo: Supabase usará la restricción UNIQUE de 'nombre' 
      // que configuramos antes para decidir si inserta o actualiza el registro existente.
      const { error } = await supabaseClient
        .from('proyecto')
        .upsert(nuevosProyectos, { 
          onConflict: 'nombre',
          ignoreDuplicates: false // Preferimos ACTUALIZAR los datos si ya existen
        });

      if (error) {
        console.error('Error en sincronización masiva:', error);
        statusEl.innerHTML = `❌ Error técnico: ${error.message}`;
        return;
      }
      cargados = nuevosProyectos.length;
    }

    statusEl.innerHTML = `✅ ¡Carga masiva exitosa! ${cargados} proyectos importados correctamente.`;
    fileInput.value = ''; // Limpiar input
    if (typeof cargarProyectos === 'function') cargarProyectos();
  };

  reader.readAsText(file);
}

// Función robusta para parsear líneas de CSV (maneja comas dentro de comillas)
function parsearCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cur.replace(/^"|"$/g, '').trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.replace(/^"|"$/g, '').trim());
  return result;
}

async function manejarAccionesTabla(event) {
  const trigger = event.target.closest('[data-accion]');
  if (!trigger || !supabaseClient) return;

  const accion = trigger.dataset.accion;
  const idProyecto = trigger.dataset.id;
  if (!accion || !idProyecto) return;

  if (accion === 'fijar-evaluacion') {
    const selectProyecto = document.getElementById('ev-proyecto');
    if (selectProyecto) {
      selectProyecto.value = idProyecto;
      selectProyecto.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Redirigir a la página de evaluación pasando el ID
      window.location.href = `evaluacion.html?id=${idProyecto}`;
    }
    return;
  }

  if (accion === 'ver-comentarios') {
    const row = document.getElementById(`comments-${idProyecto}`);
    if (row) {
      row.classList.toggle('hidden');
    }
    return;
  }

  if (accion === 'descartar') {
    const confirmar = window.confirm(
      '¿Seguro que quieres marcar este proyecto como descartado (interés final = falso)?'
    );
    if (!confirmar) return;

    // NUEVO: Intentamos obtener el nombre del miembro si ya ha evaluado antes
    let miembroNombre = localStorage.getItem('ads_miembro_familia');
    
    if (!miembroNombre) {
      miembroNombre = (
        window.prompt('¿Quién está descartando este proyecto? (nombre)') || ''
      ).trim();
      if (!miembroNombre) return;
      // Guardarlo si lo ingresó para no volver a preguntar
      localStorage.setItem('ads_miembro_familia', miembroNombre);
    }

    let miembroId = null;
    const { data: miembrosExistentes } = await supabaseClient
      .from('miembro_familia')
      .select('id')
      .ilike('nombre_miembro', miembroNombre)
      .limit(1);

    if (miembrosExistentes && miembrosExistentes.length) {
      miembroId = miembrosExistentes[0].id;
    } else {
      const { data: nuevoMiembro, error: errNuevoMiembro } = await supabaseClient
        .from('miembro_familia')
        .insert({ nombre_miembro: miembroNombre })
        .select('id')
        .single();
      if (errNuevoMiembro) {
        console.error('Error creando miembro de familia:', errNuevoMiembro);
      } else if (nuevoMiembro) {
        miembroId = nuevoMiembro.id;
      }
    }

    if (!miembroId) {
      alert('No fue posible registrar al miembro de la familia.');
      return;
    }

    const motivo = (
      window.prompt('¿Cuál es el motivo del descarte? (Opcional)') || 'Marcado como descartado desde el listado.'
    ).trim();

    const { error } = await supabaseClient.from('evaluacion_familiar').insert({
      proyecto_id: idProyecto,
      miembro_id: miembroId,
      puntuacion_general: 1,
      comentario: motivo,
      interes_final: false,
    });

    if (error) {
      console.error('Error marcando proyecto como descartado:', error);
      alert('No se pudo marcar como descartado.');
      return;
    }

    await cargarProyectos();
  }
}

function limpiarFiltros() {
  const form = document.getElementById('filters-form');
  if (form) form.reset();
  renderizarTabla();
}

// Inicialización de eventos
function initEventos() {
  const formFiltros = document.getElementById('filters-form');
  const btnResetFiltros = document.getElementById('btn-reset-filtros');
  const sortSelect = document.getElementById('sort-select');
  const formNuevoProyecto = document.getElementById('form-nuevo-proyecto');
  const formEvaluacion = document.getElementById('form-evaluacion');
  const tabla = document.getElementById('projects-table');

  if (formFiltros) {
    formFiltros.addEventListener('submit', (e) => {
      e.preventDefault();
      renderizarTabla();
    });
  }

  if (btnResetFiltros) {
    btnResetFiltros.addEventListener('click', limpiarFiltros);
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      // Sincronizar el select con la nueva lógica (asumimos campo_direccion)
      const [key, dir] = e.target.value.split('_').filter(v => v !== 'desde'); // caso precio_desde_asc
      // Ajuste especial para los nombres del select de tu HTML
      if (e.target.value.includes('precio')) sortConfig.key = 'precio';
      else if (e.target.value.includes('puntuacion')) sortConfig.key = 'puntuacion';
      else if (e.target.value.includes('ciudad')) sortConfig.key = 'ciudad';
      else sortConfig.key = 'nombre';
      
      sortConfig.dir = e.target.value.includes('desc') ? 'desc' : 'asc';
      renderizarTabla();
    });
  }

  if (tabla) {
    const thead = tabla.querySelector('thead');
    if (thead) {
      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        
        const key = th.dataset.sort;
        if (sortConfig.key === key) {
          sortConfig.dir = sortConfig.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortConfig.key = key;
          sortConfig.dir = 'asc';
        }
        
        // Efecto visual de flecha en las cabeceras
        document.querySelectorAll('th[data-sort]').forEach(el => el.textContent = el.textContent.replace(' ↑', '').replace(' ↓', ''));
        th.textContent += sortConfig.dir === 'asc' ? ' ↑' : ' ↓';
        
        renderizarTabla();
      });
    }

    tabla.addEventListener('click', manejarAccionesTabla);
  }

  if (formNuevoProyecto) {
    formNuevoProyecto.addEventListener('submit', manejarNuevoProyecto);
  }

  const btnCargarCSV = document.getElementById('btn-cargar-csv');
  if (btnCargarCSV) {
    btnCargarCSV.addEventListener('click', manejarCargaCSV);
  }

  if (formEvaluacion) {
    formEvaluacion.addEventListener('submit', manejarEvaluacion);

    const selectMiembro = document.getElementById('ev-miembro');
    if (selectMiembro) {
      const miembroGuardado = localStorage.getItem('ads_miembro_familia');
      if (miembroGuardado) {
        selectMiembro.value = miembroGuardado;
      }
      selectMiembro.addEventListener('change', (e) => {
        localStorage.setItem('ads_miembro_familia', e.target.value);
      });
    }
  }

  if (tabla) {
    tabla.addEventListener('click', manejarAccionesTabla);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  initEventos();
  if (supabaseClient) {
    await cargarProyectos();
  }
});

