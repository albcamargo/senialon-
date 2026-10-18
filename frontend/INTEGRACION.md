# Recorrido integrado del frontend — FE 1.10

Verificación local del 18 de octubre de 2026, America/Bogota. Esta entrega une el navegador, el build de producción de Next, sus Server Actions/Route Handler, FastAPI y PostgreSQL temporal. Las respuestas de YouTube, JEV y Gemini son sintéticas e interceptadas en el transporte del backend: **no es una ejecución de producto ni una evaluación de los proveedores reales**.

## Recorrido comprobado

La suite nueva `tests/integration-e2e/journey.spec.ts` utiliza las pantallas del producto y las operaciones de Python sin sustituir endpoints, cálculos, autenticación o persistencia por un servidor de respuestas prefabricadas.

1. Crear una ejecución desde la interfaz y recuperar sus once fuentes y ventanas en America/Bogota.
2. Solicitar cada unidad de adquisición/clasificación hasta recibir la propuesta automática. Consultar no avanza trabajo.
3. Inspeccionar grupos y comprobar que la comparación está bloqueada sin confirmación.
4. Seleccionar una publicación elegible con la comparación pendiente. La selección conserva estado editorial pendiente y no dispara inferencia.
5. Confirmar la versión de grupos desde la interfaz y calcular la comparación sin llamadas adicionales a proveedores.
6. Solicitar seis unidades explícitas del análisis seleccionado; recuperar la versión 7 con observaciones, valor, afinidad, hipótesis y adaptación.
7. Cargar explícitamente en el formulario la revisión de esa versión. Guardar decisión, motivo y nota de contraste de evidencia; comprobar versión 7 y revisión editorial 2 en Python.
8. Recargar y consultar; abrir la versión histórica 1 en lectura, con su propia revisión pendiente.
9. Terminar el proceso Python y arrancar uno nuevo sobre el mismo PostgreSQL. Cerrar el contexto del navegador y recuperar desde uno nuevo la ficha completa, idéntica a la guardada, con la misma evidencia, revisión y ventanas. Las peticiones de recuperación son GET y no aumentan las llamadas a proveedores.

La carga explícita de la revisión es necesaria cuando los pasos de análisis generan una nueva versión: conservar un borrador anterior evita aplicarlo silenciosamente a evidencia distinta.

Los otros casos cubren un canal no resuelto, timeout audiovisual y rechazos de acceso/origen. Ante el timeout se conservan metadatos y señal, sin observaciones inventadas; consultar y recargar no reenvía el consumo incierto. Ante el fallo de canal se mantienen las once fuentes, desconocidos y la operación que exige conciliación.

## Límite observado ante fallo de canal

La API actual retiene una operación incierta de resolución y detiene nuevos pasos del corpus hasta conciliarla. La prueba acredita presentación del fallo y ausencia de reenvío; **no acredita continuar automáticamente por los demás canales ni completar una demo parcial con ese fallo**. BE debe resolver y comprobar esa continuidad dentro de BE 3.9/3.10/3.11, conservando la operación y su reserva cuando corresponda. No se alteró esa política desde frontend.

## Entorno aislado y reproducción

Requisitos: dependencias existentes de frontend y `backend/.venv`, Python 3.12, Node 24.21.0, Chromium de Playwright 1.63.0 y binarios locales de PostgreSQL. La configuración actual usa comandos POSIX para macOS/Linux. No instala paquetes ni utiliza archivos `.env` del equipo.

Desde `frontend/`:

```sh
npm test
npm run test:types
npm run typecheck
npm run lint
npm run format:check
npm run test:e2e:integration
```

El prehook de `test:e2e:integration` prepara el build controlado y verifica marcadores privados en logs y artefactos cliente. La suite utiliza solo los puertos loopback **3390** (Next), **3391** (FastAPI) y **3392** (supervisor de pruebas), sin aceptar una URL remota o credenciales reales. El supervisor exige `SENIALON_INTEGRATION_TEST_ONLY=1`, crea una base desechable en un directorio temporal y PostgreSQL escucha únicamente en un socket Unix privado. Los controles `/scenario`, `/state` y `/restart` pertenecen al supervisor de pruebas; no se añaden rutas a la aplicación Python. Playwright usa parada gradual por SIGTERM para que el supervisor cierre Python y PostgreSQL; el caso de acceso/origen volvió a pasar tras configurar esta limpieza y se verificó que no quedaran directorios temporales de la suite.

La localización de PostgreSQL usa `initdb` en PATH, `pg_config --bindir` o la instalación Homebrew de PostgreSQL 17. Para otra instalación:

```sh
SENIALON_TEST_POSTGRES_BIN=/ruta/a/postgresql/bin npm run test:e2e:integration
```

Los proveedores reciben claves y precios ficticios solo en el transporte interceptado; no se contactan servicios externos. La base, los registros temporales y los procesos se eliminan al terminar. No hay datos de prueba en producto/demo, nuevos paquetes, cambios del contrato ni modificaciones del backend de producción. Esta configuración ejecuta exclusivamente los casos nuevos de FE 1.10; no reintenta las suites anteriores rechazadas. GitHub Actions conserva su workflow existente; esta suite nueva se ejecuta mediante el comando anterior.

Desde `backend/`, para las suites existentes sin proveedores externos:

```sh
.venv/bin/python -B -m pytest -q tests analysis/tests
```

## Resultados

| Comprobación                                          | Resultado registrado                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Vitest                                                | 576 pruebas aprobadas, nueve archivos.                                                                        |
| Tipos del contrato                                    | 74 ejemplos canónicos aprobados.                                                                              |
| TypeScript, ESLint y build                            | Aprobados.                                                                                                    |
| Separación cliente/servidor                           | Marcadores privados ausentes de logs y 17 artefactos cliente.                                                 |
| Python sin PostgreSQL de equipo                       | 325 aprobadas, tres omitidas por requerir PostgreSQL; una advertencia de deprecación de Starlette/TestClient. |
| Playwright nuevo con Next–FastAPI–PostgreSQL temporal | Cuatro casos aprobados: recorrido completo/reinicio, fallo de canal, timeout audiovisual y acceso/origen.     |

La primera pasada de navegador aprobó dos de cuatro casos. Se ajustó el guion para cargar la revisión de la nueva versión antes de editar y para consultar de forma anónima sin heredar la credencial del cliente de pruebas. No se modificó el comportamiento del producto para eludir esas guardas.

La segunda pasada aprobó cuatro de cuatro. Se repitió únicamente el caso de acceso/origen después de consumir completamente las respuestas anónimas y añadir consultas válidas posteriores: aprobado. Durante ese caso Next registra `aborted / ECONNRESET`; el origen exacto del registro sigue sin confirmar. Las comprobaciones posteriores devuelven 200 en ambos servicios y las llamadas a proveedores no aumentan. Se conserva esta incidencia de registro para diagnóstico; no se atribuye a credenciales reales ni se silencia desde la aplicación.

El reinicio comprobado es el del **proceso Python**, con otro PID. El navegador nuevo es un contexto independiente en la misma máquina; no equivale a abrir el despliegue desde otro equipo físico. Next y PostgreSQL permanecen activos durante ese reinicio.

## Configuración encontrada y faltantes

La búsqueda incluyó archivos ignorados de `SENIALON/` y `senialon-compatible/`. Se encontraron archivos de ejemplo y `SENIALON/.env.local`, generado por Vercel, que contiene únicamente una variable OIDC; no contiene las variables de la aplicación. No se imprimieron ni copiaron sus valores. Durante la verificación llegaron dos commits remotos que solo actualizan el README raíz; se incorporaron mediante fast-forward hasta `0c0ea19`, sin modificar el código probado. Allí se encontró el acceso de demo y se utilizó únicamente para las lecturas desplegadas de la sección siguiente, sin copiar sus valores a pruebas, documentación o archivos de entorno.

El usuario confirmó posteriormente que `DATABASE_URL` y la migración todavía no estaban preparadas en el despliegue. Durante la preparación posterior de Supabase se crearon los archivos privados siguientes y se completaron host, usuario y puertos a partir de Connect. En la última lectura ambos conservaban `[YOUR-PASSWORD]`; no se consideran conexiones operativas.

| Ruta prevista          | Configuración necesaria                                                                                                            | Estado local                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `backend/.env`         | `DEMO_USERNAME`, `DEMO_PASSWORD`, `DEMO_ALLOWED_ORIGIN`, `DATABASE_URL`                                                            | Archivo privado preparado; URI transaccional 6543 con contraseña pendiente. Acceso local sin configurar.    |
| `backend/.env.migrate` | `DATABASE_URL` del mismo proyecto de Supabase                                                                                      | Archivo privado preparado; URI de sesión 5432 con contraseña pendiente.                                     |
| `backend/.env`         | `YOUTUBE_API_KEY`, `TYPESAFE_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` y modelo JEV verificado                                    | No encontrados.                                                                                             |
| `backend/.env`         | `JEV_RESERVATION_USD`, `GEMINI_RESERVATION_USD`, `PRICING_REFERENCE`, `AVAILABLE_BALANCE_USD`, cargos previos y límite incremental | No encontrados ni verificados.                                                                              |
| `frontend/.env.local`  | Las tres variables `DEMO_*`, con los mismos valores que Python                                                                     | Archivo no encontrado.                                                                                      |
| Binding de Vercel      | `SENIALON_BACKEND_URL`                                                                                                             | Lo inyecta Services en ejecución; no configurarlo manualmente en la nube ni publicarlo como `NEXT_PUBLIC_`. |

Las plantillas existentes son `backend/.env.example` y `frontend/.env.example`. Guardar los archivos reales fuera de Git; no pegarlos en chats o documentación. Python no carga `.env` implícitamente: usar los comandos con `--env-file backend/.env` del [README backend](../backend/README.md). Next solo arranca con su propia configuración o con las variables heredadas del proceso que inicia Services.

Mantener `PAID_CALLS_ENABLED=false` hasta completar BE 3.2: claves presentes no autorizan gasto. Verificar también `API_MODE`, modelos, saldo, tarifas, reservas y cargos previos antes de una prueba auténtica. La conexión PostgreSQL requiere el esquema/migración de BE; una URL por sí sola no acredita persistencia operativa.

## Despliegue y cierre pendiente

En [la URL reportada](https://corefex-psi.vercel.app/), la consulta HTTPS anónima devolvió **401**. Después se usó el acceso de demo del README remoto para tres GET. La [evidencia saneada](verification/integration-deployed-readonly.json) conserva únicamente estados y encabezados, sin credenciales o resultados privados.

| Lectura desplegada               | Resultado                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/` con acceso válido            | 200; respuesta privada sin caché compartida.                                                               |
| `/api/v1/meta` con acceso válido | 200; contrato 1.0.0 y `private, no-store`. Comprueba el transporte autenticado Next–Python para metadatos. |
| `/api/v1/runs` con acceso válido | 500 `INTERNAL_ERROR`; contrato 1.0.0 y `private, no-store`. Bloquea el recorrido de datos.                 |

Esas lecturas no ejecutaron mutaciones de aplicación o proveedores reales. La lectura de metadatos no comprueba persistencia. El código de error por sí solo no demuestra su causa exacta.

### Preparación posterior de Supabase

Se preparó el proyecto `yzcauzdirrirnogzrhwp` desde SQL Editor con una migración aditiva derivada de los modelos actuales. Se verificaron siete tablas `senialon_v1_*`, todas con RLS activa y propietario `postgres`, y la fila de presupuesto `demo` con reserva cero. También se desactivó y guardó Data API. La [evidencia saneada](verification/supabase-setup.json) separa estos cambios de las lecturas anteriores del despliegue; el comando Python de migración no se ha ejecutado contra Supabase desde esta máquina.

La sesión CLI y el panel de Vercel solo muestran acceso a `anfecelis-projects`; allí existe otro proyecto llamado `senialon`. No se modificó ese proyecto ni se configuró la variable en un destino distinto de la demo. El estado de Vercel asociado al `main` remoto `0c0ea19` enlaza [acamargo-4070s-projects/senialon](https://vercel.com/acamargo-4070s-projects/senialon/GEAnnJ1zCU42UpoD8MjvHJaegazk); la sesión actual muestra «Not Found». Falta completar la contraseña en los archivos privados, acceder a ese proyecto con una cuenta autorizada y confirmar en Domains la relación con la URL reportada `corefex-psi.vercel.app`, configurar `DATABASE_URL` para Python y desplegar de nuevo la versión publicada. Después debe repetirse la lectura de ejecuciones y revisar los registros saneados del backend si persiste el 500. No se habilitaron consumos pagados ni se cerró FE 1.10 por la preparación del esquema.

El README remoto contiene una credencial de demo vigente. No se reprodujo su valor. Su publicación debe revisarse con BE: retirar y rotar ese acceso y compartirlo por el canal de entrega previsto, preservando la URL. Esta verificación no modifica credenciales o cuentas ni borra el historial Git.

Para cerrar FE 1.10 con BE 3.13 y ALG 2.11 falta:

1. Completar la conexión privada del proyecto de Supabase ya migrado, configurar `DATABASE_URL` para Python en el Vercel correcto y aplicar un nuevo despliegue. Verificar que `/api/v1/runs` devuelve 200; si persiste el 500, revisar los registros saneados del backend. La credencial y la conexión para metadatos ya tienen una comprobación positiva, sin acreditar las operaciones de datos.
2. Verificar el recorrido autenticado con las cuentas del equipo y una ejecución auténtica permitida por el control de gasto; conservar modelos, criterios, cobertura y evidencia. Una demo parcial declara sus faltantes.
3. Cerrar y reabrir desde otro equipo la misma ficha/revisión y comprobar la recuperación tras reinicio del entorno real, sin reprocesar resultados válidos.
4. Registrar el resultado desplegado y resolver la continuidad del corpus ante canales fallidos; no convertir esta suite aislada en prueba de calidad de JEV, saldo, costo o cobertura reales.

FE 1.10 conserva su casilla abierta hasta reunir esa evidencia. FE 1.11 puede preparar el playbook con esta distinción entre lo comprobado y lo pendiente; Notion mantiene la última prioridad.
