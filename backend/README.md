# Backend de SENIALON

API interna Python 3.12/FastAPI con autenticación, operaciones del contrato 1.0.0, persistencia PostgreSQL y adaptadores controlados de YouTube, JEV y Gemini. La integración local desde `senialon-compatible` se describe en [INTEGRACION_JEV.md](../docs/INTEGRACION_JEV.md). Las comprobaciones con proveedores simulados no acreditan cuentas externas ni despliegue.

## Arranque reproducible

Requisitos: Python **3.12**, uv **0.11.26**, PostgreSQL; para Next, Node **>=24.21.0 <25** y npm **11.19.0**. Se conservan FastAPI **0.143.3**, Pydantic **2.14.1**, Uvicorn **0.54.0** y HTTPX **0.28.1**. Se añaden SQLAlchemy **2.0.40**, psycopg **3.2.9** y pydantic-settings **2.9.1** al lockfile existente.

Desde `backend/`:

```sh
uv sync --locked
cp -n .env.example .env
uv run --locked python scripts/generate_contract.py --check
```

Completar el archivo privado con las tres variables de acceso, `DATABASE_URL` y las configuraciones de proveedor necesarias. Los valores vacíos de la plantilla no habilitan acceso ni llamadas. La aplicación solo lee el entorno del proceso; `uv --env-file` carga explícitamente el archivo local.

```sh
uv run --locked --env-file .env python migrate.py
uv run --locked --env-file .env uvicorn main:app --host 127.0.0.1 --port 8000 --no-access-log
```

La migración inicial crea tablas `senialon_v1_*` y la fila de reservas si faltan. No borra resultados ni reinicia reservas existentes; no convierte tablas de prototipos ni constituye un sistema de upgrades. Solo se ejecuta explícitamente. PostgreSQL remoto usa TLS, pool pequeño y prepared statements desactivados; no hay almacenamiento duradero en memoria o archivos.

### Supabase del equipo

El 18 de octubre de 2026 se preparó el proyecto `yzcauzdirrirnogzrhwp` desde su panel. Se ejecutó en SQL Editor el DDL derivado de los modelos actuales, con creación aditiva de siete tablas y cinco índices e inserción del presupuesto solo si faltaba. La consulta posterior confirmó las siete tablas con RLS activa y propietario `postgres`, y la fila `demo` con reserva cero. Data API quedó desactivada: el producto accede mediante PostgreSQL desde Python. La [evidencia de preparación](../frontend/verification/supabase-setup.json) no acredita todavía la conexión de Vercel.

Los archivos privados `backend/.env` y `backend/.env.migrate` están excluidos de Git. Se prepararon con las URIs que muestra Connect del proyecto, conservando el marcador `[YOUR-PASSWORD]` hasta que el operador lo sustituya. Usar Transaction pooler, puerto **6543**, para `DATABASE_URL` de la aplicación, y Session pooler, puerto **5432**, para la migración. Codificar en la URI los caracteres reservados de la contraseña; no compartir la conexión por chat ni guardarla en variables `NEXT_PUBLIC_*`. No se necesitan claves de la Data API.

Con la conexión privada completa, desde `backend/` se puede ejecutar de nuevo la migración existente, que conserva las tablas y reservas:

```sh
env -u DATABASE_URL uv run --locked python migrate.py --env-file .env.migrate
```

El estado de Vercel asociado a `main` (`0c0ea19`) en GitHub apunta a [este despliegue de acamargo-4070s-projects/senialon](https://vercel.com/acamargo-4070s-projects/senialon/GEAnnJ1zCU42UpoD8MjvHJaegazk). La sesión de `anfecelis` muestra «Not Found» al abrirlo. Su proyecto local `senialon` corresponde a otro destino. Abrir el proyecto enlazado con una cuenta que ya tenga acceso y confirmar allí el dominio de la demo antes de modificar variables.

Pendiente: configurar el `DATABASE_URL` transaccional para el backend del despliegue correcto, entorno Production, y volver a desplegar la versión publicada de `main`. La URL de demo reportada sigue siendo **corefex-psi.vercel.app**; la relación de ese alias con el proyecto enlazado por GitHub aún no se ha comprobado en Domains. Conservar el binding `SENIALON_BACKEND_URL` y `PAID_CALLS_ENABLED=false`; no subir el árbol local con cambios pendientes para aplicar una variable. Después verificar la lectura autenticada de `/api/v1/runs` y la persistencia del recorrido real. La migración por sí sola no cierra FE 1.10.

## Configuración

| Variable                                                                     | Uso                                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEMO_USERNAME`, `DEMO_PASSWORD`                                             | Credencial compartida, igual en Next y Python. Sin valores de acceso predeterminados.                                                             |
| `DEMO_ALLOWED_ORIGIN`                                                        | Origen exacto, sin ruta/barra final. HTTPS al desplegar; HTTP de loopback solo en desarrollo.                                                     |
| `DATABASE_URL`                                                               | DSN PostgreSQL del equipo; preferir pooler transaccional y TLS para Supabase.                                                                     |
| `YOUTUBE_API_KEY`, `TYPESAFE_API_KEY`, `GEMINI_API_KEY`                      | Secretos del servidor; no se copian desde otra carpeta ni llevan `NEXT_PUBLIC_`.                                                                  |
| `JEV_MODEL`                                                                  | Alias inicial `jev-latest`; se conserva el modelo realmente informado en cada respuesta.                                                          |
| `GEMINI_MODEL`                                                               | Modelo que el equipo haya verificado en su cuenta. Sin supuesto de disponibilidad.                                                                |
| `API_MODE`                                                                   | `record` por defecto: conserva respuestas reutilizables; `live` no añade grabaciones reutilizables.                                               |
| `PAID_CALLS_ENABLED`                                                         | `false` por defecto. Tener una API key no autoriza consumo.                                                                                       |
| `BUDGET_USD`                                                                 | Tope operativo configurable hasta USD 20 de nuevos consumos.                                                                                      |
| `JEV_RESERVATION_USD`, `GEMINI_RESERVATION_USD`                              | Cotas conservadoras por petición verificadas antes de habilitar pago.                                                                             |
| `PRICING_REFERENCE`, `AVAILABLE_BALANCE_USD`, `CONFIRMED_EXTERNAL_SPEND_USD` | Referencia de tarifas, saldo y cargos externos confirmados. Completar el control de [BE 3.2](../docs/budget/README.md).                           |
| `PROVIDER_TIMEOUT_SECONDS`                                                   | 15 s por request como máximo. Una página hace hasta dos requests; medir el recorrido real dentro del timeout del BFF de 50 s y funciones de 60 s. |

Las reservas se serializan en PostgreSQL antes de cada envío. Un timeout o una salida inválida conserva el estado incierto y la reserva, sin repetición automática. Las reservas no equivalen a facturas y necesitan conciliación operativa; no se liberan automáticamente.

`API_MODE=replay` impide nuevas creaciones y nuevos envíos live/record de ejecuciones antiguas. Recuperar entregas ya persistidas por idempotencia no consume APIs. No existe una operación del producto que clone grabaciones históricas en una ejecución nueva ni un modo demo con datos ficticios.

## Contrato y comportamiento

[OpenAPI](../docs/contracts/openapi.json) conserva versión **1.0.0** y SHA-256 `d7e0b018263658e686da00997ddffbd19ba96e6e73de5b08e3f8917b95375956`. Se exponen sus **18 operaciones y 15 rutas**, con las guardas originales y sin documentación pública. Sin base configurada, las operaciones de dominio responden `FEATURE_UNAVAILABLE`; los metadatos siguen disponibles con autenticación.

Todas las respuestas mantienen JSON contractual, versión/correlación, `private, no-store` y `nosniff`. Mutaciones requieren origen exacto e idempotencia cuando el contrato lo indica. GET solo lee: no adquiere, clasifica, calcula, migra ni libera reservas. Los errores se sanean sin reflejar entradas, DSN o claves.

Una ejecución conserva los 11 canales y ventanas de Bogotá; cada avance procesa una unidad explícita y persiste operación/checkpoint. Los grupos se proponen usando ambas ventanas y se confirman antes de otra acción de comparación. Ventanas, conteos y comparación reutilizan las funciones ALG existentes. El análisis profundo requiere selección explícita y conserva snapshots/revisiones. Notion permanece diferido con respuesta explícita, sin guardado simulado.

El transporte específico utiliza `JsonHttpTransport` y su gate, no un segundo cliente de salida. Las claves Google van en cabecera, las decisiones JEV se validan con sus probabilidades/uso y las salidas Gemini usan esquemas estrictos. Las rúbricas y prompts están en `analysis/`; HTTP, BD, secretos y reservas permanecen en BE.

## Contrato empaquetado

`senialon_api/generated/contract.json` es una proyección regenerable de OpenAPI para el bundle Python, sin ejemplos de prueba. No es otra autoridad. La API comprueba el hash si dispone de la fuente; pytest comprueba que la proyección siga actualizada.

Tras un cambio autorizado del contrato:

```sh
uv run --locked python scripts/generate_contract.py
uv run --locked python scripts/generate_contract.py --check
```

## Comprobaciones

```sh
uv run --locked python -B -m pytest -q tests analysis/tests
```

Las pruebas usan transportes simulados. Sin `TEST_DATABASE_URL` se usa SQLite solo en pruebas y se omiten tres comprobaciones de concurrencia; no acredita bloqueos PostgreSQL. Con un DSN de pruebas, se crean/eliminan esquemas aleatorios aislados. Usar una base dedicada con permiso para crear esquemas; nunca conectar automáticamente una cuenta del equipo.

## Services y despliegue

Desde la raíz, con dependencias instaladas y entorno local explícito:

```sh
uv run --project backend --locked --env-file backend/.env npx --yes vercel@64.5.0 dev -L --listen 127.0.0.1:3000
```

`vercel.json` conserva Next como única entrada pública, Python interno y el binding `SENIALON_BACKEND_URL`. No definir el binding manualmente ni configurar `frontend/` como raíz del proyecto. Se incluye el contrato derivado y se excluyen pruebas, scripts de migración y archivos de entorno del bundle.

El usuario confirmó un proyecto de la cuenta de albcamargo, plan Hobby, conectado al repositorio original para desplegar `main` mediante Git nativo de Vercel. La URL reportada es `https://corefex-psi.vercel.app`. [GitHub Actions](../docs/DESPLIEGUE_GITHUB_ACTIONS.md) conserva las comprobaciones de frontend y Python; su job de despliegue se retiró y no requiere secretos de Vercel. Ambas automatizaciones se ejecutan de forma independiente: las pruebas de Actions no bloquean por sí solas el despliegue nativo.

El [registro histórico BE 3.3](VERIFICACION.md), [acceso FE](../frontend/ACCESO.md) y [registro de integración actual](../docs/INTEGRACION_JEV.md) distinguen comprobaciones locales de cuentas reales. Services sigue pendiente de primer despliegue protegido, costos/límites efectivos, Supabase del equipo y evaluación real con proveedores. No se contratan extras ni se habilitan pagos por esta integración.
