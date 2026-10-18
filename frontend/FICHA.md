# Ficha de la publicación seleccionada — FE 1.8

Extensión de **Publication / Evidence** del sistema visual vigente. Permite contrastar una selección guardada con su evidencia y revisar métricas, señal temática, observaciones, valor, afinidad, hipótesis y adaptación como dimensiones independientes. La lectura no inicia análisis ni guarda una decisión editorial.

## Recorrido implementado

1. Desde [Publicaciones elegibles](PUBLICACIONES.md), **Abrir ficha de la publicación seleccionada** abre `/runs/{runId}/analyses/{analysisId}`. La navegación conserva la ejecución y permite volver a su catálogo o comparación.
2. La página exige el acceso de demo antes de consultar los datos. Recupera por GET la ejecución y el análisis guardado; **Consultar ficha** repite esa lectura de forma explícita. Identidades o versiones inválidas muestran un error sin consultar el dominio.
3. La cabecera presenta título original, canal, enlace al video, revisión editorial, motivo registrado cuando existe, versión y fechas en hora de Colombia. Las anclas permiten llegar a cada dimensión o al catálogo de evidencia.
4. **Solicitar paso de análisis** envía una sola unidad autorizada mediante `advanceRun`, con destino `scope: analysis`, revisión de ejecución, versión del análisis y clave de idempotencia. Cada nuevo paso exige otra acción del operador.

No hay bucle de avance, polling ni POST automático al abrir, consultar o recargar la ficha. El cliente no garantiza que el trabajo continúe después de cerrar el navegador. El servidor decide qué unidad corresponde entre audiovisual, valor, persona, contexto empresarial, pilar y síntesis.

## Información presentada

| Bloque                      | Lectura implementada                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Métricas originales         | Vistas, Me gusta y comentarios recibidos, con fecha de captura; publicación, duración y condición de Short. Un valor desconocido conserva su motivo y no se convierte en cero. El desempeño permanece no evaluable con la razón recibida. |
| Señal temática              | Ventanas anterior y reciente en `America/Bogota`, conteos, diferencia y variación recibidos. Los detalles muestran publicaciones y contribución por canal, tema principal y secundarios sin conteo.                                       |
| Observaciones audiovisuales | Formato, gancho verbal, visual y auditivo, estructura y problema abordado, cada uno con estado, descripción respaldada y referencias. El material procesado conserva rango temporal y limitaciones.                                       |
| Valor                       | Problema, aprendizaje o aplicación y su respaldo; resultado JEV **Aporte respaldado**, **Utilidad no sustentada** o **Información insuficiente**.                                                                                         |
| Afinidad editorial          | Persona destinataria, contexto empresarial o de aplicación y pilar editorial por separado. Conserva los cuatro pilares acordados, **Otro pertinente** e **Información insuficiente**.                                                     |
| Hipótesis                   | Mecanismos propuestos con evidencia y limitaciones, identificados como hipótesis y sin atribuir causalidad demostrada.                                                                                                                    |
| Adaptación                  | Ángulo, aporte esperado, gancho, estructura y CTA cuando existen, con respaldo y limitaciones. Se identifican como propuestas; no acreditan recursos observados ni activos disponibles.                                                   |
| Evidencia y revisión        | Observación o fragmento textual, enlace para contrastar el original, intervalo audiovisual cuando corresponde, estado y nota de revisión, identidad y captura.                                                                            |

La señal es la conservada en esta versión del análisis: no se sustituye por una comparación posterior ni se recalcula en el navegador. Una comparación parcial conserva sus conteos disponibles y su razón, y suprime diferencia, porcentaje y afirmación de novedad no sustentados. Una base anterior de cero se presenta sin inventar un porcentaje. Si la señal está pendiente o el tema no está asignado, la pieza sigue siendo consultable y analizable.

Valor, afinidad y pertinencia muestran las trazas JEV disponibles en detalles nativos: pregunta, material de entrada, respuesta conservada, modelo, criterios y versión de pregunta. La atribución distingue explicación sintetizada por Gemini y resumen de evidencia. Los intentos fallidos o pendientes conservan su estado y razón; no se convierten en decisiones negativas. Las probabilidades recibidas se identifican como salidas del modelo, sin tratarlas como precisión validada o probabilidad de viralidad.

El contexto y la procedencia permiten inspeccionar identidad, captura, versiones de criterios, reglas y clasificación y usos de modelos informados. La ausencia de un reporte de consumo no implica consumo cero. No se combinan desempeño, señal, valor y afinidad en una puntuación global.

## Evidencia, revisión y límites

Las referencias internas llevan al registro de evidencia correspondiente. Los enlaces al video se construyen desde su identificador validado; las observaciones audiovisuales enlazan al segundo inicial en YouTube y muestran el intervalo recibido. El catálogo conserva la referencia original como texto, junto con la captura.

La revisión distingue **Pendiente de revisión**, **Contrastada con el original**, **En disputa** e **Información insuficiente para verificar**, con la nota guardada cuando existe. La entrega original FE 1.8 las presenta en lectura; la autorización posterior incorpora el [formulario FE 1.9](REVISION_EDITORIAL.md), con decisión, motivo y revisión de evidencia asociados a la versión exacta.

Cada respuesta pasa las guardas de acceso y validación contractual en servidor, además de comprobaciones de ejecución, publicación elegible, ventanas, versión, señal, evidencia y revisión. Las referencias audiovisuales deben corresponder a su dimensión y quedar dentro del material procesado y de la duración conocida.

Un fallo audiovisual conserva los metadatos y la señal disponibles; las dimensiones sin observación respaldada siguen identificadas. Los faltantes no se completan con hechos, hipótesis o adaptaciones inventados. Evaluar el aporte del contenido no verifica externamente todas sus afirmaciones.

## Versiones y fallos de lectura

- La ruta sin query abre la versión actual recibida. **Enlace a esta versión guardada** añade `?analysis_version=N`, donde `N` debe ser un entero positivo.
- Cualquier URL con versión explícita queda en **solo lectura**, incluso si esa versión es la última. **Abrir versión actual** vuelve a la ruta sin query para continuar cuando el servidor lo permita.
- La lectura de una versión explícita consulta también la identidad y el número de la última versión. No mezcla sus señales, material o revisión; una versión histórica no admite acciones actuales ni operaciones pendientes en su envelope.
- La autoridad para avanzar es `current_actions` del envelope, junto con el presupuesto permitido y la ausencia de operaciones por conciliar. `data.allowed_actions` conserva metadatos de la captura y no habilita controles.
- Si una consulta falla, se conserva la ficha anterior con advertencia de desactualización y se detienen nuevos pasos hasta recuperar una lectura válida. Sin ficha validada se muestra un estado explícito, sin simular resultados vacíos.

## Entrega incierta y recuperación

Antes del POST se guarda un recibo local compartido `advance_analysis`: ejecución, análisis, video, revisión y versión originales, clave, fecha e identidad de operación si se conoce. Contiene metadatos de entrega, no credenciales ni resultados. No reemplaza otro recibo pendiente. Un registro ilegible permite consultar y bloquea nuevos pasos.

**Consultar ficha** permite buscar la operación por GET a partir de su identidad guardada, las referencias recibidas o el checkpoint pertinente. La recuperación exige coincidencia de ejecución, análisis, pieza, etapa y versión de entrada; un número de versión posterior por sí solo no confirma esa solicitud.

Una operación exitosa confirmada retira el recibo sin reenviar el consumo. Una operación en curso, fallida, bloqueada o incierta conserva su identidad. El estado incierto exige conciliación manual y no habilita reenvío automático.

**Reenviar la misma solicitud** solo aparece después de consultar una operación fallida o bloqueada cuya política sea `same_request_after_status_read`, con presupuesto permitido tanto en ejecución como en operación y una ficha vigente sin versión fijada. Reutiliza exactamente clave, cuerpo, revisión y versión originales. No crea otra solicitud para reemplazar una entrega sin confirmar.

## Decisiones visuales de esta extensión

La ficha conserva negro y naranja SENIALON, Sora y Work Sans y los tokens existentes. Extiende la mesa editorial con secciones planas y separadores; los estados y las limitaciones se expresan también mediante texto. No incorpora miniaturas ni medios externos inventados.

El primer tramo prioriza título de página, consulta y avance, regreso y versión, seguido del título de la publicación, canal, revisión, fecha, anclas y métricas. Los metadatos usan tres columnas y las dimensiones audiovisuales dos. Bajo 768 px, metadatos, dimensiones y ventanas pasan a una columna y los controles principales ocupan el ancho disponible.

La comparación se desplaza horizontalmente dentro de una región identificada y accesible por teclado, sin ensanchar toda la página. Enlaces principales y controles mantienen objetivos de al menos 44 px; las operaciones comunican su estado con `aria-live`. Las trazas y la procedencia usan `details`/`summary` nativos para conservar profundidad sin abrir todo el material a la vez.

Estas son decisiones locales de la ficha. `DESIGN.md`, `PRODUCT.md` y `.impeccable/design.json` permanecen sin cambios; no se crean tokens ni reglas visuales globales nuevas.

## Archivos y comprobación registrada

- `src/app/runs/[runId]/analyses/[analysisId]/page.tsx`: ruta protegida y lectura de versión.
- `src/app/analysis-actions.ts`: consulta y solicitud de una unidad protegidas en servidor.
- `src/components/analysis/`: panel de operación, ficha, señal, catálogo de evidencia y estilos locales.
- `src/lib/analysis/`: tipos, presentación y comprobaciones de consistencia.
- `src/lib/runs/command.ts`: recibo compartido `advance_analysis`.
- `tests/analysis.test.ts`, `tests/analysis-e2e/`, `tests/fixtures/analysis-server.mjs` y `playwright.analysis.config.ts`: comprobación nueva exclusiva de FE 1.8.

Desde `frontend/`, los comandos pertinentes son:

```sh
npm test -- tests/analysis.test.ts
npm run test:e2e:analysis
npm run typecheck
npm run lint
npm run format:check
npm run contract:check
npm run test:types
```

El prehook de `test:e2e:analysis` prepara el build controlado. Evidencia registrada en la implementación: **534 Vitest, incluidas 54 pruebas nuevas de FE 1.8; 14 Playwright nuevos exclusivos; typecheck, lint, build y 74 ejemplos tipados aprobados**. Se verificaron 17 artefactos cliente sin los marcadores privados del build controlado. La primera pasada de navegador terminó 12/14; se corrigieron dos comprobaciones de prueba sobre texto previo y autenticación heredada, y la siguiente terminó 14/14.

La suite nueva utiliza únicamente loopback 3370/3371 y su servidor sintético de pruebas. No usa esos datos como producto o demo y no acredita adquisición, proveedores, JEV, base de datos o Vercel reales. No se reejecutaron suites antiguas rechazadas. El detector único devolvió `[]` y la revisión de cierre de cinco secciones no indicó correcciones materiales.

Capturas locales de la revisión: `/private/tmp/senialon-fe18-qa/desktop.png`, `desktop-audiovisual.png`, `desktop-evidence.png`, `mobile.png`, `mobile-audiovisual.png` y `mobile-evidence.png`, todas dentro de esa misma carpeta.

El contrato OpenAPI **1.0.0** conserva SHA-256 `d7e0b018263658e686da00997ddffbd19ba96e6e73de5b08e3f8917b95375956`. Backend, dependencias, lockfile y sistema visual global permanecen intactos.

## Alcance pendiente

FE 1.8 conserva abierto su cierre integrado: falta comprobar las salidas de ALG 2.7–2.9 y las operaciones de BE 3.7/3.10/3.11 en el recorrido con proveedores, persistencia y URL protegida auténticos. La integración previa de JEV aporta código reutilizable, pero las pruebas sintéticas no acreditan cuentas, saldos ni servicios reales. El registro editorial posterior está documentado en [FE 1.9](REVISION_EDITORIAL.md), con sus comprobaciones y pendientes propios. La integración opcional con Notion mantiene la última prioridad.
