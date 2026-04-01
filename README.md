# ADS-Propiedades

Panel web estático para que tu familia lleve el **registro, comparación y evaluación de proyectos inmobiliarios** (compra o arriendo), usando:

- **Frontend**: HTML + CSS + JavaScript puro.
- **Backend como servicio**: Supabase (Postgres + API + autenticación).

Este proyecto está pensado para:

- Cargar los proyectos iniciales desde el archivo CSV `proyectos_expo_2026_PIPE_CORREGIDO.csv` a Supabase.
- Permitir que la familia agregue nuevos proyectos encontrados en Internet.
- Puntuar los proyectos (1–5), agregar comentarios y marcar si siguen en análisis o se descartan.
- Filtrar y ordenar para quedarse solo con los proyectos mejor calificados.

## Estructura de carpetas

- `index.html`: página principal del panel familiar.
- `css/styles.css`: estilos con un diseño moderno y legible.
- `js/app.js`: lógica de la UI y llamadas a Supabase.
- `js/config.example.js`: ejemplo de configuración. Debes copiarlo a `config.js`.

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. En la sección de Base de Datos, crea las tablas basadas en el modelo del archivo `ModeloER.md`:
   - `constructora`
   - `proyecto`
   - `miembro_familia`
   - `evaluacion_familiar`
3. Configura las claves primarias `uuid` y los nombres de columnas igual a los descritos en `ModeloER.md`.

### Configurar el cliente en el frontend

1. Copia el archivo:

   - `js/config.example.js` → `js/config.js`

2. Edita `js/config.js` y coloca tus credenciales de Supabase:

   ```js
   window.ADS_CONFIG = {
     supabaseUrl: 'https://TU-PROJECT-REF.supabase.co',
     supabaseAnonKey: 'TU_SUPABASE_ANON_KEY',
   };
   ```

3. Abre `index.html` en tu navegador (doble click o con un servidor estático simple).

## Flujo de uso

1. **Carga inicial del CSV a Supabase**  
   - Desde la consola de Supabase puedes usar la opción de importar CSV a la tabla `proyecto`.  
   - Mapea las columnas del CSV a las columnas del modelo (`id_original_expo`, `nombre`, `precio_desde`, `precio_hasta`, `ciudad`, `sector`, etc.).  
   - Para `precio_desde` y `precio_hasta` tendrás que transformar el texto del rango a números; esto se puede hacer con un script aparte o manualmente en una primera fase.

2. **Listado y filtros**
   - La tabla principal muestra:
     - Nombre, ciudad/sector, tipo, estrato, área, precio aproximado, estado, promedio familiar e interés.
   - Se puede:
     - Buscar por texto (nombre, ciudad, sector).
     - Filtrar por rango de precio, ciudad, estrato, tipo de inmueble, estado de obra.
     - Ver solo proyectos que siguen en análisis.
     - Ordenar por precio, nombre, ciudad o puntuación familiar.

3. **Agregar nuevos proyectos**
   - Usa el formulario "Agregar nuevo proyecto".
   - Al guardar, se inserta un registro en la tabla `proyecto` (origen = `familiar`) y, si hace falta, se crea automáticamente la `constructora`.

4. **Evaluar proyectos en familia**
   - Selecciona un proyecto en el formulario "Puntuar proyecto en familia".
   - Indica el miembro de la familia (si no existe, se crea en `miembro_familia`).
   - Asigna una puntuación 1–5, comentario y si sigue en análisis o se descarta.
   - Esto crea una fila en `evaluacion_familiar` y actualiza el promedio mostrado.

5. **Descartar proyectos desde el listado**
   - En cada fila hay un botón "Descartar" que inserta una evaluación con `interes_final = false`, marcando el proyecto como descartado.

## Notas finales

- El proyecto es completamente estático: no requiere Node, ni frameworks; solo necesitas un navegador moderno.
- Toda la lógica de datos se apoya en Supabase (API JavaScript).
- Si luego quieres mejorar la UI, es fácil extender los estilos y añadir más filtros/columnas.

