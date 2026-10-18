# Revisión editorial de la versión del análisis — FE 1.9

Extensión de **Editorial review / Feedback** del sistema visual vigente y de la [ficha de la publicación seleccionada](FICHA.md). Permite registrar una decisión humana, su motivo y el contraste de evidencia sobre la versión exacta consultada. El estado guardado se presenta separado del borrador; editar el formulario no modifica el resultado del servidor.

## Recorrido implementado

1. En la ficha, **Revisión editorial** muestra primero el estado guardado, la versión del análisis, la revisión editorial, la fecha en hora de Colombia y el motivo cuando existe. El acceso compartido atribuye el registro al operador de demo, sin identificar a una persona individual.
2. El operador elige **Pendiente de revisión**, **Considerar para adaptación** o **Descartada** y escribe un motivo. El motivo es obligatorio para las tres decisiones, también al devolver una pieza a pendiente.
3. **Revisar evidencia antes de guardar** despliega los registros de esa versión, con enlaces para contrastarlos, estado y nota. Mantener una evidencia pendiente no la verifica.
4. **Guardar decisión** envía una sola solicitud explícita. La decisión, el motivo y las revisiones de evidencia se registran juntos mediante `recordReview`; no se anuncian como guardados hasta validar la respuesta.
5. **Consultar revisión guardada** recupera el resultado por GET. Conserva el borrador visible; **Cargar revisión guardada en el formulario** es una acción aparte que permite preparar un cambio sobre la revisión recibida.

Abrir, consultar o recargar la ficha no guarda decisiones ni solicita trabajo a proveedores. El registro editorial no depende de una autorización de gasto y no modifica las clasificaciones, los grupos, la señal temática ni las observaciones del análisis. Un borrador editorial sin resolver detiene un nuevo paso de análisis hasta guardarlo o cargar la revisión guardada.

## Evidencia incluida en la decisión

Cada solicitud contiene exactamente una entrada por evidencia de la versión revisada. Las notas acompañan el estado elegido:

| Estado                                  | Registro requerido                              |
| --------------------------------------- | ----------------------------------------------- |
| Pendiente de revisión                   | Nota opcional; no confirma la observación.      |
| Contrastada con el original             | Nota obligatoria que explica el contraste.      |
| En disputa                              | Nota obligatoria que documenta la discrepancia. |
| Información insuficiente para verificar | Nota obligatoria que describe la limitación.    |

El formulario no marca todas las observaciones como verificadas al guardar una decisión. Los enlaces internos llevan a la evidencia de la misma versión; cuando el borrador pertenece a otra versión, el enlace abre su ficha fijada. La revisión humana conserva los límites de la evidencia y no convierte una hipótesis en una causa demostrada.

## Versión exacta, autoridad y respuesta

La solicitud PUT conserva `expected_analysis_version` y `expected_review_revision`, además de la decisión, el motivo y las entradas de evidencia. Usa una clave de idempotencia y las guardas de acceso, origen y validación contractual del servidor.

El guardado exige una ficha vigente, la acción `record_review` en `current_actions` del envelope y ausencia de una operación en curso que lo impida. `data.allowed_actions` es información de la captura y no habilita el formulario. Las URL con `?analysis_version=N` permanecen en lectura, incluso cuando `N` sea la última versión; **Abrir versión actual** recupera la ruta operable cuando el servidor lo permite.

Una respuesta de éxito debe conservar ejecución, análisis, identidad de revisión y versión solicitadas, incrementar exactamente en uno la revisión editorial y devolver la misma decisión, motivo y revisión de cada evidencia. La consulta contrasta `getReview` con la revisión incluida en la ficha de esa misma versión. Las respuestas contradictorias no se presentan como un guardado confirmado.

Si una consulta trae otra versión o revisión, el borrador se conserva sin aplicarlo automáticamente sobre el resultado nuevo. Los históricos mantienen su revisión independiente; recuperar una revisión histórica nunca la inserta en la ficha actual.

## Fallos, entrega incierta y recuperación

Antes del PUT se guarda un recibo local compartido `record_review`, con la identidad de ejecución, análisis, video y revisión, clave y fecha, y el cuerpo editorial exacto pendiente. Incluye el motivo y las notas escritos por el operador; no contiene observaciones del análisis, resultados de proveedores ni credenciales. El recibo se valida al leerlo, no reemplaza otra solicitud pendiente y se retira al confirmar el guardado. Un recibo ilegible conserva las consultas y bloquea nuevos envíos.

El formulario muestra el cuerpo pendiente exacto y detiene su edición mientras se concilia. El recibo no expira en otra solicitud y no provoca guardados automáticos después de recargar. Un borrador todavía no enviado permanece en memoria de la página; el recibo conserva la entrada que ya se intentó enviar. Las revisiones confirmadas se recuperan del servidor, también desde otro contexto sin recibo local.

Si falla el envío, el borrador permanece y debe consultarse el estado antes de otro intento. Ante una respuesta perdida, la conciliación consulta la versión original por GET. Solo confirma recuperación cuando la revisión es la original más uno y coincide todo el cuerpo editorial; no basta con encontrar una revisión posterior.

**Reenviar el mismo guardado** solo se habilita después de una consulta que confirme que la revisión original sigue vigente y que la versión actual conserva permiso de escritura. Reutiliza cuerpo, clave y versiones originales. No existe reenvío automático.

Si el servidor conserva otra revisión o una versión posterior y no se confirma el guardado solicitado, **Cerrar intento sin sobrescribir la revisión** permite retirar explícitamente el recibo local sin escribir en el servidor. El borrador se conserva; cargar el estado guardado sigue siendo una acción separada. La consulta y conciliación también están disponibles desde una ficha histórica, sin habilitar en ella un nuevo guardado.

## Presentación y accesibilidad

La sección reutiliza negro y naranja SENIALON, Sora y Work Sans y los tokens existentes. El título y la consulta encabezan el bloque; estado guardado, versiones, fecha y contexto preceden al formulario. Decisión y motivo quedan visibles; la evidencia utiliza `details`/`summary` nativos y **Guardar decisión** cierra el recorrido.

La composición es plana, con separador superior y una columna de campos de hasta 72 caracteres de medida. Selectores, áreas de texto, enlaces de contraste y el desplegable de evidencia mantienen objetivos de al menos 44 px. Bajo 768 px, los botones de cabecera y acción ocupan el ancho disponible.

Los campos tienen etiquetas, ayuda contextual y errores vinculados mediante `aria-describedby` y `aria-invalid`. El envío inválido lleva el foco al primer campo que necesita corrección y abre su bloque de evidencia cuando corresponde. Los mensajes de resultado usan `aria-live`; los estados bloqueados explican el motivo en texto y no dependen únicamente del color.

Estas decisiones describen esta extensión. `DESIGN.md`, `PRODUCT.md` y `.impeccable/design.json` permanecen sin cambios; no se crean tokens, activos ni reglas visuales globales.

## Archivos y comprobación registrada

- `src/components/analysis/editorial-review.tsx` y `review.module.css`: estado guardado, borrador, validación accesible y recuperación explícita.
- `src/components/analysis/analysis-panel.tsx` y `analysis-view.tsx`: integración con la ficha, su versión y el avance de análisis.
- `src/app/review-actions.ts`: lectura coherente y guardado protegido con validación de identidad, revisión y cuerpo.
- `src/lib/analysis/review.ts`: validación de entrada editorial, equivalencia y permiso recibido.
- `src/lib/runs/command.ts` y `server.ts`: recibo compartido y transporte contractual.
- `tests/review.test.ts`, `tests/review-e2e/`, `tests/fixtures/review-server.mjs` y `playwright.review.config.ts`: comprobación nueva de FE 1.9.

Desde `frontend/`:

```sh
npm test -- tests/review.test.ts
npm run test:e2e:review
npm run typecheck
npm run lint
npm run format:check
npm run contract:check
npm run test:types
```

El prehook de `test:e2e:review` prepara el build controlado. Evidencia registrada en esta implementación: **576 Vitest, incluidas 42 pruebas nuevas de FE 1.9; 18 Playwright nuevos exclusivos; 74 ejemplos tipados, typecheck, lint y build aprobados**. Se comprobaron 17 artefactos cliente sin los marcadores privados del build. La primera pasada de navegador terminó 16/17; se corrigió una comprobación de eventos de almacenamiento para usar una segunda pestaña, y la pasada final terminó 18/18, incluida la conciliación desde una versión histórica.

La suite de navegador utiliza exclusivamente loopback 3380/3381 y su servidor sintético de pruebas. Sus datos y capturas no son producto ni demo y no acreditan proveedores o despliegue reales. No se reejecutaron suites antiguas rechazadas. El detector único devolvió `[]` y la revisión de cierre de cinco secciones no indicó correcciones materiales.

Capturas locales, identificadas como sintéticas: `/private/tmp/senialon-fe19-qa/desktop.png`, `/private/tmp/senialon-fe19-qa/mobile.png` y `/private/tmp/senialon-fe19-qa/mobile-evidence.png`.

Como comprobación separada, `backend/tests/test_jev_integration.py::test_full_contract_flow_snapshots_reviews_and_restart` terminó aprobada contra una instancia temporal de PostgreSQL 17.11 y la API Python real. Comprobó idempotencia del PUT, conflictos, versiones y recuperación de la revisión al recrear la aplicación. Usó proveedores simulados mediante `MockTransport` y saldo ficticio; la instancia temporal se detuvo y eliminó al terminar.

Esa prueba no conecta la interfaz Next con la API Python real y no acredita persistencia del Supabase del equipo, reinicio de proceso, proveedores auténticos ni la URL protegida desplegada. El contrato OpenAPI **1.0.0** conserva SHA-256 `d7e0b018263658e686da00997ddffbd19ba96e6e73de5b08e3f8917b95375956`. Backend, dependencias, lockfile y sistema visual global permanecen intactos.

## Alcance pendiente

FE 1.9 mantiene pendiente su cierre integrado: falta verificar la interfaz conectada a la API Python en el despliegue, la recuperación con la persistencia del equipo y el acceso a la URL protegida. La comprobación sintética del navegador y la prueba separada del backend sustentan partes distintas de ese recorrido.

La verificación posterior [FE 1.10](INTEGRACION.md) une la interfaz con la API Python real y PostgreSQL temporal, incluido un reinicio del proceso Python y recuperación desde otro contexto de navegador. Usa proveedores interceptados; mantiene pendiente la comprobación desplegada y de la persistencia del equipo. La integración opcional con Notion conserva la última prioridad.
