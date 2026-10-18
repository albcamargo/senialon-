# Frontend de SENIALON

Base local verificable de la aplicación. Incluye App Router, TypeScript estricto, fuentes locales, estilos de `DESIGN.md`, logos Fluido y una pantalla inicial sin resultados de análisis. La recolección permanece deshabilitada hasta implementar sus operaciones.

FE 1.1 añade [tipos generados y validación del contrato](CONTRATO_API.md). FE 1.3 implementa [acceso compartido y transporte autenticado](ACCESO.md), comprobados localmente entre Next y FastAPI. FE 1.4 incorpora [ejecuciones, cobertura y recuperación](EJECUCIONES.md): interfaz sobre el contrato, verificada con escenarios sintéticos. La fuente única sigue en `docs/contracts/openapi.json`. El usuario confirmó un proyecto Vercel Hobby de albcamargo con despliegue nativo desde `main`; la comprobación del recorrido protegido y de las operaciones reales sigue pendiente.

FE 1.5 prepara [inspección y confirmación de grupos](GRUPOS.md), con versión/evidencia y recuperación sin reenvío automático. Conserva pendientes la integración real y la repetición de dos pruebas corregidas cuya ejecución fue rechazada. Las pruebas sintéticas no forman parte de la demo.

FE 1.6 incorpora [comparación temática y respaldo por canal](COMPARACION.md), con conteos recibidos, cobertura parcial explícita y cálculo separado de las consultas. Se verificaron 431 pruebas unitarias y 8 pruebas nuevas de navegador exclusivas de comparación. El cierre integrado conserva pendiente el recorrido con servicios reales.

FE 1.7 incorpora [catálogo, inspección y selección de publicaciones elegibles](PUBLICACIONES.md), independientes de grupos y comparación. La selección guarda una identidad mediante BE sin solicitar análisis profundo; se recupera por GET tras perder una respuesta. Verificación local: 480 Vitest (49 nuevas), 13 Playwright nuevos exclusivos de FE 1.7 y build aprobados. La persistencia con servicios reales y el recorrido desplegado conservan su comprobación pendiente.

FE 1.8 incorpora la [ficha de publicación y evidencia](FICHA.md): métricas, señal conservada, observaciones temporales, valor, afinidad, hipótesis y adaptación en bloques independientes. Incluye URL recuperable y versiones de lectura, revisión visible y avance explícito de una unidad con recuperación por GET. Verificación de esa entrega: **534 Vitest (54 nuevas), 14 Playwright nuevos exclusivos de FE 1.8 y build aprobados**; 17 artefactos cliente sin marcadores privados. Las pruebas usan únicamente datos sintéticos; el recorrido con proveedores, persistencia y despliegue reales sigue pendiente.

FE 1.9 incorpora el [registro de revisión editorial](REVISION_EDITORIAL.md): decisión, motivo obligatorio y revisión de evidencia sobre la versión exacta del análisis. Separa estado guardado y borrador, conserva la entrada ante fallos y concilia respuestas perdidas por GET antes de permitir un reenvío manual idéntico. Verificación local: **576 Vitest (42 nuevas), 18 Playwright nuevos exclusivos de FE 1.9, typecheck, lint, build y 74 ejemplos tipados aprobados**. Una prueba separada de la API Python con PostgreSQL temporal comprobó guardado, conflictos y recuperación al recrear la aplicación; usó proveedores simulados. Falta verificar el recorrido Next–Python desplegado y la persistencia del equipo para cerrar la tarea integrada. La siguiente implementación es FE 1.10.

## Requisitos y arranque

- Node.js `>=24.21.0 <25`; `.nvmrc` fija `24.21.0`.
- npm `11.19.0`, con `package-lock.json` versionado. Usar `npm ci` para reproducir la instalación.
- Next.js `16.3.8`, React/React DOM `19.3.0` y TypeScript `5.9.3`; dependencias directas fijadas sin rangos.

Desde la raíz del repositorio:

```sh
cd frontend
npm ci
cp -n .env.example .env.local
npm run dev
```

Abrir `http://127.0.0.1:3000`. El desarrollo escucha solo en loopback por defecto. Para comprobar producción local:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

Completar las tres variables de servidor antes de entrar; sin configuración válida, el acceso queda cerrado. El build no necesita credenciales, base de datos o llamadas a proveedores. Para el recorrido conectado, usar Services y el mismo entorno en ambos servidores según [ACCESO.md](ACCESO.md). No se ejecutan análisis desde lecturas.

## Entrega a Backend / BE 3.3

| Propiedad                        | Valor entregado                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Directorio del servicio          | `frontend/`                                                                                        |
| Instalación                      | `npm ci`                                                                                           |
| Desarrollo local                 | `npm run dev`                                                                                      |
| Build                            | `npm run build`                                                                                    |
| Arranque de producción local     | `npm run start -- --hostname 127.0.0.1 --port 3100`                                                |
| Framework                        | Next.js / App Router                                                                               |
| Variables necesarias al ejecutar | `DEMO_USERNAME`, `DEMO_PASSWORD`, `DEMO_ALLOWED_ORIGIN`; binding generado para conectar con Python |
| Artefactos generados             | `.next/`, excluido de Git                                                                          |

El build ejecuta `contract:check` antes de Next. Su contexto debe incluir `../docs/contracts/openapi.json`; mantener el checkout completo al configurar BE 3.3.

La configuración de Vercel Services, su binding y el primer despliegue corresponden a BE 3.3. FE 1.3 usa `SENIALON_BACKEND_URL` generado y el contrato [OpenAPI 1.0.0](../docs/contracts/README.md). Las tres variables de `.env.example` son de servidor y deben coincidir con FastAPI; no se incluyen valores ni se usa `NEXT_PUBLIC_*` para secretos. [Entrega y pruebas](ACCESO.md).

La base autentica páginas y Route Handlers y conserva comprobaciones independientes en Python. Las páginas privadas renderizan por solicitud; API privada sin caché compartida. La URL accesible a otras personas sigue pendiente: aún no existe proyecto Vercel y se requiere cerrar las verificaciones de FE 1.3/BE 3.3/3.6.

## Sistema visual y activos

- Tokens en `src/app/globals.css`; composición en CSS Modules, sin un segundo framework de estilos.
- Sora y Work Sans variables se sirven localmente desde paquetes Fontsource fijados en `5.3.0`. No se consultan servicios de fuentes durante el build o la navegación. Sus licencias OFL se incluyen en los paquetes instalados.
- `public/branding/` contiene copias sin editar de los logos Fluido claro y oscuro a 2× de `branding/`; `src/app/icon.png` conserva el ícono Fluido a 1×.
- Navegación lateral en escritorio; menú nativo plegable en pantallas menores de 1200 px. Fuentes consultables con teclado y estado inicial explícito.
- Los once enlaces son configuración confirmada del corpus, no acreditan que los canales ya hayan sido consultados. No se muestran conteos, métricas o ejecuciones inventadas.

## Comprobaciones

```sh
npm run contract:check
npm run test
npm run test:types
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run security:client
npm run test:e2e
npm audit --omit=dev
```

La evidencia visual está en [VERIFICACION.md](VERIFICACION.md), la del consumidor en [CONTRATO_API.md](CONTRATO_API.md) y la de acceso/transporte en [ACCESO.md](ACCESO.md). Playwright 1.63.0 comprueba el acceso protegido local; el recorrido editorial completo y el cierre de FE 1.10 siguen pendientes. Estas pruebas no acreditan despliegue, persistencia o proveedores operativos.

## Parche de seguridad del stack de referencia

El proyecto de referencia usaba Next.js `16.3.3`. La instalación encontró alertas aplicables a esa versión, incluida [GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). SENIALON fija Next.js y `eslint-config-next` en `16.3.8`, un parche de la misma línea, conservando React y TypeScript acordados.

La auditoría de producción con ese parche devuelve **0 vulnerabilidades**. La auditoría completa conserva **5 alertas altas** propagadas desde `braces@3.0.3` por las herramientas de ESLint; el [aviso oficial](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) no publica aún una versión corregida. Es una limitación del tooling de desarrollo, sin ese paquete en las dependencias de producción. No aplicar `npm audit fix --force`: propone cambios de versión mayores o una degradación incompatible del tooling.
