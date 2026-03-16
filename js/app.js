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
      evaluacion_familiar (
        id,
        puntuacion_general,
        interes_final
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
      interes_final: hayInteres ? true : hayDescartados ? false : null,
    };
  });

  poblarFiltrosDinamicos();
  poblarSelectProyectosEvaluacion();
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
  const select = document.getElementById('sort-select');
  const criterio = select ? select.value : 'nombre_asc';
  const copia = [...lista];

  const porNombreAsc = (a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es');

  switch (criterio) {
    case 'precio_desde_asc':
      copia.sort((a, b) => (a.precio_desde || 0) - (b.precio_desde || 0));
      break;
    case 'precio_desde_desc':
      copia.sort((a, b) => (b.precio_desde || 0) - (a.precio_desde || 0));
      break;
    case 'puntuacion_desc':
      copia.sort((a, b) => (b.promedio_familiar || 0) - (a.promedio_familiar || 0));
      break;
    case 'ciudad_asc':
      copia.sort((a, b) =>
        (a.ciudad || '').localeCompare(b.ciudad || '', 'es')
      );
      break;
    case 'nombre_asc':
    default:
      copia.sort(porNombreAsc);
      break;
  }

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
        <div class="project-score">
          <span class="project-score__value">${promedio}</span>
          <span class="project-score__detail">${cantidadEvals} opiniones</span>
        </div>
      </td>
      <td data-label="Interés">${crearChipInteres(p.interes_final)}</td>
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

async function manejarAccionesTabla(event) {
  const btn = event.target.closest('button[data-accion]');
  if (!btn || !supabaseClient) return;

  const accion = btn.dataset.accion;
  const idProyecto = btn.dataset.id;
  if (!accion || !idProyecto) return;

  if (accion === 'fijar-evaluacion') {
    const selectProyecto = document.getElementById('ev-proyecto');
    if (selectProyecto) {
      selectProyecto.value = idProyecto;
      selectProyecto.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  if (accion === 'descartar') {
    const confirmar = window.confirm(
      '¿Seguro que quieres marcar este proyecto como descartado (interés final = falso)?'
    );
    if (!confirmar) return;

    // Nota: en el modelo recomendado, miembro_id es NOT NULL.
    // Para descartar desde el listado sin identificar miembro, pedimos el nombre.
    const miembroNombre = (
      window.prompt('¿Quién está descartando este proyecto? (nombre)') || ''
    ).trim();
    if (!miembroNombre) return;

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

    const { error } = await supabaseClient.from('evaluacion_familiar').insert({
      proyecto_id: idProyecto,
      miembro_id: miembroId,
      puntuacion_general: 1,
      comentario: 'Marcado como descartado desde el listado.',
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
    sortSelect.addEventListener('change', renderizarTabla);
  }

  if (formNuevoProyecto) {
    formNuevoProyecto.addEventListener('submit', manejarNuevoProyecto);
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

