# SENIALON

![Logo de SENIALON](branding/Fluido%20%C2%B7%20claro%402x.png)

Detectamos la señal cuando apenas se enciende.

Detectamos la señal cuando apenas se enciende.

## Acceso para jurados

Abre [SENIALON — demo para evaluación](https://corefex-psi.vercel.app) en Chrome o Edge. Cuando el navegador solicite autenticación, introduce estas credenciales compartidas de demo:

| Dato | Valor |
| --- | --- |
| Usuario | `senialon` |
| Contraseña | `pass_senialon` |

No hace falta una cuenta en JEV, Gemini, YouTube ni Vercel para acceder como jurado. Si aparece un error 401 o vuelve a pedir la contraseña, prueba una ventana de incógnito y escribe ambos valores exactamente como aparecen arriba. Si Vercel solicita iniciar sesión en su plataforma antes de mostrar la aplicación, el responsable del despliegue debe habilitar el acceso externo conservando la autenticación de SENIALON.

### Configuración del despliegue

Estas variables deben coincidir en los procesos de Next y FastAPI, en el entorno de producción de Vercel:

```dotenv
DEMO_USERNAME=senialon
DEMO_PASSWORD=pass_senialon
DEMO_ALLOWED_ORIGIN=https://corefex-psi.vercel.app
PAID_CALLS_ENABLED=false
```

Después de cambiar variables en Vercel, generar un nuevo despliegue para aplicarlas. Editar este README no cambia la configuración del servidor. El enlace y las credenciales fueron proporcionados para la evaluación; su funcionamiento en producción aún debe comprobarse.

`PAID_CALLS_ENABLED=false` mantiene bloqueadas las inferencias pagadas nuevas; las credenciales permiten acceder, pero no habilitan por sí solas un análisis nuevo. Las claves API de proveedores y la conexión a la base de datos se configuran como secretos del servidor y no se publican en este documento.

Para ejecución local, usar `DEMO_ALLOWED_ORIGIN=http://127.0.0.1:3000` y configurar el mismo usuario y contraseña en ambos servicios. La sesión local que se inició antes de esta edición conserva su configuración anterior hasta reiniciarse con las variables nuevas.

## Configuración de JEV y proveedores para el responsable técnico

Configurar estas variables solo en el servicio backend de Vercel o en el archivo privado indicado explícitamente al arrancar. Los jurados no necesitan conocer las claves API. Los textos entre `<...>` son marcadores y deben sustituirse por valores reales en el servidor.

```dotenv
# JEV / TypeSafe
TYPESAFE_API_KEY=<clave_privada_de_TypeSafe>
JEV_MODEL=jev-latest

# Proveedores y persistencia del recorrido integrado
YOUTUBE_API_KEY=<clave_privada_de_YouTube>
GEMINI_API_KEY=<clave_privada_de_Gemini>
GEMINI_MODEL=<modelo_verificado_en_la_cuenta>
DATABASE_URL=<conexion_privada_PostgreSQL>

# Ejecución y control de gasto
API_MODE=record
PAID_CALLS_ENABLED=false
BUDGET_USD=5
JEV_RESERVATION_USD=
GEMINI_RESERVATION_USD=
PRICING_REFERENCE=
AVAILABLE_BALANCE_USD=
CONFIRMED_EXTERNAL_SPEND_USD=0
PROVIDER_TIMEOUT_SECONDS=15
```

`BUDGET_USD=5` propone el tope operativo correspondiente a los USD 5 indicados por el usuario; no acredita saldo disponible. Antes de habilitar llamadas pagadas, verificar el saldo, los cargos externos y las tarifas aplicables, y completar `AVAILABLE_BALANCE_USD`, `CONFIRMED_EXTERNAL_SPEND_USD`, `PRICING_REFERENCE` y las reservas máximas por solicitud. No inventar reservas ni interpretar costos desconocidos como cero. Cambiar `PAID_CALLS_ENABLED` requiere completar el control de [presupuesto](docs/budget/README.md).

`live` realiza llamadas sin añadir grabaciones reutilizables; `record` realiza llamadas y guarda respuestas en PostgreSQL. `replay` bloquea nuevas ejecuciones y envíos a proveedores; permite recuperar entregas ya persistidas, sin crear una demo ficticia ni clonar automáticamente una ejecución anterior. PostgreSQL puede ser externo: no son archivos de registro locales. La [plantilla completa](backend/.env.example) y la [guía backend](backend/README.md) describen la configuración.

## Identidad visual

Los logos actuales están en `branding/`. Las variantes disponibles son:

| Variante | 1x | 2x |
| --- | --- | --- |
| Clara | [1200 × 520](branding/Fluido%20%C2%B7%20claro%401x.png) | [2400 × 1040](branding/Fluido%20%C2%B7%20claro%402x.png) |
| Oscura | [1200 × 520](branding/Fluido%20%C2%B7%20oscuro%401x.png) | [2400 × 1040](branding/Fluido%20%C2%B7%20oscuro%402x.png) |
| Ícono | [512 × 512](branding/Fluido%20%C2%B7%20icono%401x.png) | [1024 × 1024](branding/Fluido%20%C2%B7%20icono%402x.png) |

## Documentos del producto

- [Definición del MVP](docs/DEFINICION_MVP.md).
- [Plan de trabajo](docs/PLAN_DE_TRABAJO.md).
- [Prioridades y dependencias de frontend](docs/PLAN_FRONTEND.md).
- [Revisión de consumo del contrato API — FE 1.1](docs/REVISION_CONTRATO_FRONTEND.md).
- [Tipos, validación y pruebas del consumidor — FE 1.1](frontend/CONTRATO_API.md).
- [Revisión semántica — ALG 2.1](docs/REVISION_SEMANTICA_ALG.md).
- [Interfaces internas de análisis y puertos de proveedores](docs/INTERFACES_ANALISIS.md).
- [Ventanas, conteos y comparación deterministas — ALG 2.2/2.5/2.6](backend/analysis/README.md).
- [Contrato API único — acuerdo 1.0.0 y política de versiones](docs/contracts/README.md).
- [Arquitectura C4](docs/ARQUITECTURA_C4.md).
- [Sistema visual y de interfaz](DESIGN.md).
- [Contexto del producto para diseño](PRODUCT.md).
- [Base frontend, arranque y entrega a Backend — FE 1.2](frontend/README.md).
- [Control de presupuesto y verificaciones pendientes — BE 3.2](docs/budget/README.md).
- [Base FastAPI, Services y entrega para FE 1.3 — avance BE 3.3](backend/README.md).
- [Integración de JEV, PostgreSQL y operaciones del contrato](docs/INTEGRACION_JEV.md).
- [Pruebas locales y pendientes de despliegue — BE 3.3](backend/VERIFICACION.md).
- [Comprobaciones de GitHub Actions y despliegue nativo de Vercel desde main](docs/DESPLIEGUE_GITHUB_ACTIONS.md).
- [Acceso compartido, BFF y pruebas Next–FastAPI — avance FE 1.3](frontend/ACCESO.md).
- [Interfaz de ejecuciones, cobertura y recuperación — avance FE 1.4](frontend/EJECUCIONES.md).
- [Inspección y confirmación de grupos — avance FE 1.5 y pendientes](frontend/GRUPOS.md).
- [Comparación temática, respaldo por canal y recuperación — avance FE 1.6](frontend/COMPARACION.md).
- [Catálogo y selección de publicaciones elegibles — avance FE 1.7](frontend/PUBLICACIONES.md).

## OpenSpec

Configurado con OpenSpec **1.14.3**, esquema `spec-driven`, perfil `core` e integración para Codex. El cambio [definir-mvp-senialon](openspec/changes/definir-mvp-senialon/proposal.md) incluye la propuesta, seis especificaciones funcionales, el [diseño técnico recomendado](openspec/changes/definir-mvp-senialon/design.md) y las [tareas de ejecución](openspec/changes/definir-mvp-senialon/tasks.md). Están completas FE 1.2 y FE 1.1: base visual local, tipos generados y validación JSON. BE 3.3 prepara FastAPI y Services/binding; FE 1.3 añade acceso web y un BFF comprobados localmente con Python real y el binding generado. El usuario confirmó un proyecto Vercel Hobby de albcamargo conectado al repositorio original, con despliegue Git nativo desde `main` y URL `https://corefex-psi.vercel.app`; el cierre de FE 1.3 y BE 3.3 conserva pendiente configurar y verificar el acceso protegido. BE 3.2 mantiene pendiente verificar las cuentas. La integración JEV incorpora código de recolección, persistencia y análisis; su verificación con cuentas del equipo sigue pendiente y no hay proveedores externos probados. El Python aportado en `docs/` se conserva sin ejecutar.

El frontend conserva el stack de `personal-finance-assistant`: **Next.js/App Router, React 19.3.0, TypeScript 5.9.3 y npm**, con Node `>=24.21.0 <25`. SENIALON fija Next.js **16.3.8**, un parche de seguridad de la referencia 16.3.3; [motivo y comandos](frontend/README.md). Python para análisis y Vercel para despliegue también están confirmados. El diseño propone Next.js como entrada web y FastAPI/Python como servicio interno del mismo proyecto Vercel, PostgreSQL en Supabase Free y acceso mediante credencial compartida. El primer despliegue debe verificar esta conexión. Los nuevos consumos de la demo tienen un máximo de **20 USD**; la suscripción Vercel ya abonada queda aparte. Las pruebas pagadas permanecen bloqueadas hasta verificar las cuentas según BE 3.2.

OpenSpec requiere Node.js **20.19.0 o posterior**. Para preparar esta herramienta en otra máquina:

```sh
npm install -g @fission-ai/openspec@1.14.3
openspec --version
```

La configuración del proyecto y las skills ya están en `openspec/` y `.agents/skills/`; no hace falta repetir la inicialización al clonar el repositorio.

Para revisar o resolver dudas en Codex, usar `openspec-explore`; para ejecutar tareas autorizadas, `openspec-apply-change`. El [contrato único](docs/contracts/openapi.json) conserva `1.0.0`. ALG 2.1 y BE 3.1 están cerradas documentalmente y G0 contractual cerrado por revisión asistida, sin firmas atribuidas ni proveedores probados. FE 1.2 y ambos hitos de FE 1.1 están completos; FE 1.3 y FE 1.4 tienen avances locales con sus pendientes de integración/despliegue documentados. BE 3.2 conserva pendiente verificar las cuentas antes de pruebas pagadas. Las tareas mantienen dueños y dependencias. [Documentación de la integración](https://openspec.dev/docs/supported-tools#codex).

FE 1.4 añade la interfaz de ejecuciones, cobertura, consultas y avance explícito sobre el contrato, con escenarios de dominio sintéticos separados de las pruebas de acceso con FastAPI real. ALG 2.2/2.5/2.6 entrega las funciones puras de ventanas, conteo y comparación; la integración/persistencia de sus entradas y salidas reales sigue pendiente. FE 1.5 prepara la inspección/confirmación de una propuesta exacta y conserva pendientes la integración auténtica y dos pruebas corregidas sin repetición autorizada. El contexto y las reglas de SENIALON están en [openspec/config.yaml](openspec/config.yaml).

La conciliación mantiene una sola fuente de integración: [docs/contracts/openapi.json](docs/contracts/openapi.json). El borrador competidor incorporado en `ae6b1a0` se retiró del árbol activo; sus diferencias, decisiones de migración y recuperación desde Git están en [openspec/contract/README.md](openspec/contract/README.md). Las comprobaciones se refieren exclusivamente a la versión y hash del contrato actual.

### Entorno local

El Node global de la máquina donde se hizo la configuración tiene un error de biblioteca. Se verificó OpenSpec utilizando el Node 24 disponible en Codex. En esa máquina, antes de ejecutar los comandos:

```sh
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
openspec --version
```

Este ajuste afecta solo a la sesión de terminal. Otros equipos con Node compatible no lo necesitan. El runtime usado para verificar OpenSpec es 24.19.0; el frontend requiere **Node.js >=24.21.0 y <25** y se verificó separadamente con 24.21.0. El funcionamiento del CLI no sustituye ese requisito del producto.
