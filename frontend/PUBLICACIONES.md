# Publicaciones elegibles — FE 1.7

Extensión de la mesa editorial vigente: permite consultar e inspeccionar cualquier pieza elegible y guardar su selección, aunque su tema no aumente o la comparación esté pendiente. No exige confirmar grupos ni consultar la comparación para acceder al catálogo.

## Recorrido implementado

1. **Consultar publicaciones** recupera por GET la ejecución, el catálogo elegible y la primera página de selecciones guardadas (`getRun`, `listEligibleVideos`, `listAnalyses`). No recolecta ni analiza videos.
2. Cada fila muestra título original o faltante explícito, fuente, semana, duración, condición de Short y fecha. La consulta identifica cuánto material se ha cargado y si quedan páginas; las ventanas y revisión permanecen en detalles nativos.
3. **Inspeccionar publicación** consulta `getVideo` y la ejecución por GET. Conserva catálogo y contexto, y muestra enlace al original, canal, publicación/captura en hora de Colombia, elegibilidad y su razón. Los metadatos, estadísticas, pertinencia de IA y evidencia se despliegan en línea.
4. **Seleccionar para análisis** envía únicamente el POST `selectAnalysis`, con `video_id`, `expected_run_revision` y clave de idempotencia. Solo se habilita con detalle elegible vigente, acción `select_analysis` permitida y sin otra solicitud pendiente.

**Selección guardada** aparece solo tras una respuesta válida del servidor. Muestra identidad, versión, fechas y estados recibidos; guardar o consultar la selección no envía `advance_analysis` ni inicia análisis audiovisual ni aprueba una oportunidad. Una pieza ya seleccionada permite consultar la misma identidad sin reprocesarla.

## Páginas, revisiones y fallos

- Las consultas solicitan páginas de hasta 20 elementos y devuelven el cursor opaco sin interpretarlo. Publicaciones y selecciones se paginan por separado.
- Cada página debe corresponder a la ejecución y a su `snapshot_revision`. La unión exige revisión estable, cursor que avance e identidades sin duplicados; ante cambios se pide consultar de nuevo, sin mezclar páginas.
- El número cargado y el fin del listado recibido no acreditan cobertura completa de los once canales. El vacío se limita al material disponible; no demuestra ausencia de contenido de IA.
- Un fallo conserva el catálogo o detalle anterior con advertencia de desactualización. Detiene paginación o selección afectadas hasta actualizar; no convierte el error en un resultado vacío.
- Si falla la lectura de selecciones guardadas, el catálogo válido sigue disponible. Las respuestas pasan validación contractual y comprobaciones de ejecución, fuente, ventana, evidencia e identidad antes de mostrarse como confirmadas.

## Evidencia y faltantes

La condición distingue **Candidato corto**, **Short confirmado** y condición sin determinar. La duración sola no acredita un Short; la confirmación muestra su respaldo recibido.

Vistas, Me gusta y comentarios conservan el valor original con formato es-CO. Las métricas desconocidas muestran **No disponible** y su motivo, sin sustituirlas por cero. Una captura no acredita éxito ni crecimiento de audiencia. Descripción, fecha y duración ausentes también se identifican; no se inventan miniaturas, evidencia o resultados audiovisuales.

## Recuperación de una selección incierta

El recibo local `select_analysis` conserva ejecución, publicación, revisión original y clave. Guarda metadatos de entrega, sin credenciales ni resultados. El registro compartido no reemplaza otra solicitud pendiente; un registro ilegible permite consultas y detiene nuevas selecciones.

Al volver a consultar, se busca la publicación por GET en las selecciones guardadas, recorriendo sus páginas. Si aparece, se consulta `getAnalysis`, se valida la identidad y se recupera la selección sin reenviar el POST. Una respuesta incierta conserva el recibo; los rechazos definitivos previstos permiten retirarlo.

**Reenviar la misma selección** es una acción manual disponible solo después de consultar todas las páginas sin encontrarla, con catálogo vigente, la revisión original aún vigente y `select_analysis` permitida. Reutiliza la misma publicación y clave; nunca se reenvía automáticamente ni sustituye otra solicitud. Si cambia la revisión, requiere conciliación y no habilita ese reenvío.

## Sistema visual conservado

La extensión reutiliza el negro y naranja SENIALON, Sora para encabezados y Work Sans para lectura y controles. Las filas son planas, delimitadas por separadores, con una acción principal y controles secundarios existentes; la evidencia usa `details`/`summary` nativos.

El primer tramo prioriza título/consulta, propósito y estado, seguido de filas con fuente, ventana, duración y condición de Short. Bajo 768 px las filas apilan contenido y acción, y los datos pasan a una columna; enlaces y detalles mantienen objetivos de al menos 44 px. Los estados se anuncian con `aria-live`, con textos específicos para controles repetidos.

Este trabajo conserva `DESIGN.md`, `PRODUCT.md` y `.impeccable/design.json`; no crea tokens ni modifica la identidad global.

## Archivos y comprobación registrada

- `src/components/publications/`: panel, catálogo, detalle, selección guardada y estilos de la extensión.
- `src/app/publication-actions.ts`: lecturas y selección protegidas; `src/lib/publications/`: tipos, presentación y consistencia.
- `src/lib/runs/command.ts`: recibo compartido con identidad `select_analysis`.

Desde `frontend/`, los comandos pertinentes son:

```sh
npm test -- tests/publications.test.ts
npm run test:e2e:publications
npm run typecheck
npm run lint
npm run format:check
npm run contract:check
```

El prehook de `test:e2e:publications` prepara el build controlado. Evidencia ya verificada en la implementación: **480 Vitest (49 nuevas), 13 Playwright nuevos exclusivos de FE 1.7, typecheck, lint sin advertencias, formato, 74 ejemplos tipados y build aprobados**; 14 artefactos cliente sin marcadores privados. No se reejecutaron suites antiguas rechazadas.

La suite nueva usa solo el servidor sintético en loopback 3360/3361. Sus escenarios son pruebas, nunca datos de demo; no acreditan adquisición, base de datos, JEV, proveedores ni Vercel reales. La revisión externa de cinco secciones terminó sin correcciones materiales y el único detector devolvió `[]`.

Capturas locales: `/private/tmp/senialon-fe17-visual/desktop.png`, `/private/tmp/senialon-fe17-visual/mobile.png` y `/private/tmp/senialon-fe17-visual/mobile-selection.png`. La captura móvil usa el viewport real y no registra el enlace de salto oculto fuera de pantalla.

El contrato OpenAPI **1.0.0** conserva SHA-256 `d7e0b018263658e686da00997ddffbd19ba96e6e73de5b08e3f8917b95375956`; backend, dependencias y lockfile permanecen intactos.

## Alcance pendiente

FE 1.8 y FE 1.9 no están implementadas por esta entrega. FE 1.7 conserva abierta su casilla de cierre integrado: faltan BE 3.8–3.11, ALG 2.3 y el recorrido desplegado con corpus, pertinencia y persistencia auténticos. La evidencia sintética no sustituye esas verificaciones.
