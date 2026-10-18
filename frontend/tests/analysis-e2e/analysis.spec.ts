import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";

const harness = "http://127.0.0.1:3371";
const path = "/runs/fixture-run-001/analyses/fixture-analysis-001";
type RequestRow = {
  method: string;
  path: string;
  query: string;
  key: string | null;
  body: unknown;
};
async function requests(request: APIRequestContext): Promise<RequestRow[]> {
  return (await request.get(`${harness}/__test/requests`)).json();
}
async function advances(request: APIRequestContext) {
  return (await requests(request)).filter(
    (row) => row.method === "POST" && row.path.endsWith("/advance"),
  );
}
async function scenario(request: APIRequestContext, name: string) {
  await request.post(`${harness}/__test/scenario`, {
    data: { scenario: name },
  });
}
async function open(page: Page, suffix = "") {
  await page.goto(path + suffix);
  await expect(
    page.getByRole("heading", {
      name: "SINTÉTICO · Aplicación de IA para equipos",
      exact: true,
    }),
  ).toBeVisible();
}
const advanceButton = (page: Page) =>
  page.getByRole("button", { name: "Solicitar paso de análisis", exact: true });
const consultButton = (page: Page) =>
  page.getByRole("button", { name: "Consultar ficha", exact: true });
test.beforeEach(async ({ request }) => {
  await scenario(request, "analysis-complete");
});

test("ficha completa, enlaces temporales y recarga solo consultan datos guardados", async ({
  page,
  request,
}) => {
  await open(page);
  for (const name of [
    "Métricas originales",
    "Señal temática",
    "Observaciones audiovisuales",
    "Valor para la audiencia",
    "Afinidad editorial",
    "Hipótesis explicativas",
    "Adaptación sugerida",
    "Evidencia y revisión",
  ])
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(
      1,
    );
  await expect(page.locator("#metricas dd").first()).toHaveText("0");
  await expect(page.locator("#metricas dd").nth(1)).toContainText(
    "No disponible",
  );
  await expect(
    page.getByText("Aporte respaldado", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("#evidencia")
      .getByRole("link", { name: /Contrastar 0:01–0:03 en YouTube/ })
      .first(),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=demoB000001&t=1s");
  await expect(advanceButton(page)).toBeDisabled();
  await consultButton(page).click();
  await expect(page.getByText(/Ficha consultada. Esta lectura/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ficha de publicación", exact: true }),
  ).toBeVisible();
  expect(await advances(request)).toHaveLength(0);
  expect((await requests(request)).every((row) => row.method === "GET")).toBe(
    true,
  );
  expect(
    (await requests(request)).some((row) =>
      /groups|comparison|review/.test(row.path),
    ),
  ).toBe(false);
});

test("la selección guardada del catálogo abre su ficha conservando la ejecución", async ({
  page,
  request,
}) => {
  await page.goto("/?run=fixture-run-001#publicaciones");
  const panel = page.locator("#publicaciones");
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await panel.getByText(/^Selecciones guardadas ·/).click();
  await panel
    .getByRole("button", { name: /^Consultar selección demoB000001$/ })
    .click();
  await panel
    .getByRole("link", {
      name: "Abrir ficha de la publicación seleccionada",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await expect(
    page.getByRole("link", {
      name: "Volver a publicaciones de esta ejecución",
      exact: true,
    }),
  ).toHaveAttribute("href", "/?run=fixture-run-001#publicaciones");
  expect(await advances(request)).toHaveLength(0);
});

test("versión anterior es de lectura, conserva su fallo y permite abrir la actual", async ({
  page,
  request,
}) => {
  await open(page, "?analysis_version=1");
  await expect(
    page.getByText("Versión anterior · solo lectura", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/No se completó el análisis audiovisual/),
  ).toBeVisible();
  await expect(advanceButton(page)).toBeDisabled();
  await page
    .getByRole("link", { name: "Abrir versión actual", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await expect(
    page.getByText("Aporte respaldado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/No se completó el análisis audiovisual/),
  ).toHaveCount(0);
  expect(await advances(request)).toHaveLength(0);
});

test("un avance explícito envía una unidad exacta y no se repite al recargar", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-pending");
  await open(page);
  await expect(advanceButton(page)).toBeEnabled();
  expect(await advances(request)).toHaveLength(0);
  await advanceButton(page).click();
  await expect(page.getByText(/Paso guardado por el servidor/)).toBeVisible();
  const rows = await advances(request);
  expect(rows).toHaveLength(1);
  expect(rows[0].body).toEqual({
    expected_run_revision: 10,
    target: {
      scope: "analysis",
      analysis_id: "fixture-analysis-001",
      expected_analysis_version: 1,
    },
  });
  expect(rows[0].key).toMatch(/^[a-f0-9-]{36}$/);
  await page.reload();
  await expect(
    page.getByText("Aporte respaldado", { exact: true }),
  ).toBeVisible();
  expect(await advances(request)).toHaveLength(1);
});

test("respuesta perdida se recupera con checkpoint y GET sin repetir consumo", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-lost");
  await open(page);
  await advanceButton(page).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/Hay una solicitud de análisis pendiente de confirmar/),
  ).toBeVisible();
  await expect(advanceButton(page)).toBeDisabled();
  await consultButton(page).click();
  await expect(
    page.getByText(/Operación confirmada. Se conserva el resultado/),
  ).toBeVisible();
  await expect(
    page.getByText(/Hay una solicitud de análisis pendiente de confirmar/),
  ).toHaveCount(0);
  expect(await advances(request)).toHaveLength(1);
  expect(
    (await requests(request)).some(
      (row) => row.method === "GET" && row.path.includes("/operations/"),
    ),
  ).toBe(true);
});

test("fallo consultado permite solo reenvío manual con el mismo cuerpo y clave", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-retry");
  await open(page);
  await advanceButton(page).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Reenviar la misma solicitud",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Consultar operación/ }).click();
  await page
    .getByRole("button", { name: "Reenviar la misma solicitud", exact: true })
    .click();
  await expect(page.getByText(/Paso guardado por el servidor/)).toBeVisible();
  const rows = await advances(request);
  expect(rows).toHaveLength(2);
  expect(rows[1].body).toEqual(rows[0].body);
  expect(rows[1].key).toBe(rows[0].key);
});

test("resultado incierto conserva reserva y bloquea reenvíos automáticos o manuales", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-uncertain");
  await open(page);
  await advanceButton(page).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await consultButton(page).click();
  await expect(
    page.getByText(/Resultado incierto: requiere conciliación manual/),
  ).toBeVisible();
  await expect(advanceButton(page)).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Reenviar la misma solicitud",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(advanceButton(page)).toBeDisabled();
  expect(await advances(request)).toHaveLength(1);
});

test("operación en curso exige consulta explícita sin sondeo ni otro avance", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-running");
  await open(page);
  await advanceButton(page).click();
  await expect(
    page.getByRole("button", { name: /^Consultar operación/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Consultar operación/ }).click();
  await expect(
    page.getByText("Operación consultada sin repetir la solicitud.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(advanceButton(page)).toBeDisabled();
  expect(await advances(request)).toHaveLength(1);
});

test("falla audiovisual y cobertura parcial conservan lo disponible sin completar lo desconocido", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-failed");
  await open(page);
  await expect(
    page.getByText(/No se completó el análisis audiovisual/),
  ).toBeVisible();
  await expect(page.locator("#senal")).toContainText("+100 %");
  await expect(
    page
      .locator("#audiovisual")
      .getByText("Sin observación respaldada disponible para esta dimensión.", {
        exact: true,
      }),
  ).toHaveCount(6);
  await scenario(request, "analysis-partial");
  await open(page);
  await expect(page.locator("#senal")).toContainText(
    "Comparación completa pendiente",
  );
  await expect(page.locator("#senal")).not.toContainText("100 %");
  await expect(page.locator("#senal")).not.toContainText("Nuevo en el corpus");
  expect(await advances(request)).toHaveLength(0);
});

test("ficha previa se conserva si falla la nueva consulta", async ({
  page,
  request,
}) => {
  await open(page);
  await request.post(`${harness}/__test/fail`);
  await consultButton(page).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Métricas originales", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Ficha anterior conservada/)).toBeVisible();
  await expect(advanceButton(page)).toBeDisabled();
  expect(await advances(request)).toHaveLength(0);
});

test("presupuesto pendiente y solicitud ajena bloquean nuevos pasos", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-budget");
  await open(page);
  await expect(advanceButton(page)).toBeDisabled();
  await scenario(request, "analysis-pending");
  await page.evaluate(() =>
    localStorage.setItem(
      "senialon:command:v1",
      JSON.stringify({
        version: 1,
        kind: "create",
        key: "synthetic-other-key-0001",
        createdAt: "2026-10-18T10:00:00-05:00",
        operationId: null,
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByText(/Hay otra solicitud sin confirmar/),
  ).toBeVisible();
  await expect(advanceButton(page)).toBeDisabled();
  expect(await advances(request)).toHaveLength(0);
});

test("respuesta incoherente y selector de versión inválido no se presentan como ficha válida", async ({
  page,
  request,
}) => {
  await scenario(request, "analysis-malformed");
  await page.goto(path);
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Métricas originales", exact: true }),
  ).toHaveCount(0);
  await scenario(request, "analysis-complete");
  await page.goto(path + "?analysis_version=0");
  await expect(
    page.getByText(/La versión solicitada no es válida/),
  ).toBeVisible();
  expect(await requests(request)).toHaveLength(0);
});

test("ruta protegida y anclas de evidencia accesibles sin ejecutar medios externos", async ({
  page,
  request,
}) => {
  // Node fetch has no Playwright-inherited HTTP credentials or browser cookies.
  const response = await fetch("http://127.0.0.1:3370" + path);
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("Basic");
  await open(page);
  const reference = page
    .locator("#audiovisual")
    .getByRole("link", { name: "evidencia fixture-av-format", exact: true });
  await reference.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#evidence-fixture-av-format$/);
  await expect(page.locator("#evidence-fixture-av-format")).toBeFocused();
  expect(await advances(request)).toHaveLength(0);
});

test("revisión visual de escritorio y móvil: contenido, foco y tabla sin desbordar la página", async ({
  page,
}) => {
  const directory = "/private/tmp/senialon-fe18-qa";
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.screenshot({ path: `${directory}/desktop.png` });
  await page.locator("#audiovisual").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/desktop-audiovisual.png` });
  await page.locator("#evidencia").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/desktop-evidence.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Ficha de publicación", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "SINTÉTICO · Aplicación de IA para equipos",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${directory}/mobile.png` });
  await page.locator("#audiovisual").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/mobile-audiovisual.png` });
  await page.locator("#evidencia").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/mobile-evidence.png` });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  const table = page.getByRole("region", {
    name: "Comparación guardada; tabla desplazable horizontalmente",
  });
  await table.focus();
  await expect(table).toBeFocused();
  expect(
    await table.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
});
