import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";

const harness = "http://127.0.0.1:3361";
const videoId = "demoB000001";
type Row = {
  method: string;
  path: string;
  query: string;
  key: string | null;
  body: unknown;
};
async function requests(request: APIRequestContext): Promise<Row[]> {
  return (await request.get(`${harness}/__test/requests`)).json();
}
async function selections(request: APIRequestContext) {
  return (await requests(request)).filter(
    (row) => row.method === "POST" && row.path.endsWith("/analyses"),
  );
}
async function scenario(request: APIRequestContext, name: string) {
  await request.post(`${harness}/__test/scenario`, {
    data: { scenario: name },
  });
}
async function catalog(page: Page) {
  await page.goto("/?run=fixture-run-001#publicaciones");
  const panel = page.locator("#publicaciones");
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await expect(
    panel.getByText(/^\d+ publicaci(?:ón|ones) elegibles? cargadas?/),
  ).toBeVisible();
  return panel;
}
async function preview(page: Page) {
  const panel = await catalog(page);
  await panel
    .getByRole("button", {
      name: /^Inspeccionar publicación\s*:\s*SINTÉTICO · Aplicación de IA para equipos$/,
    })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Seleccionar para análisis",
      exact: true,
    }),
  ).toBeEnabled();
  return panel;
}
test.beforeEach(async ({ request }) => {
  await scenario(request, "publications-ready");
});
test.afterEach(async ({ request }) => {
  expect(
    (await requests(request)).filter(
      (row) => row.method === "POST" && row.path.endsWith("/advance"),
    ),
  ).toHaveLength(0);
});

test("listar e inspeccionar solo leen; selección explícita sin grupos ni comparación", async ({
  page,
  request,
}) => {
  const panel = await preview(page);
  expect(await selections(request)).toHaveLength(0);
  expect(
    (await requests(request)).filter((row) =>
      /\/groups|\/comparison/.test(row.path),
    ),
  ).toHaveLength(0);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/Selección guardada por el servidor/),
  ).toBeVisible();
  const commands = await selections(request);
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toEqual({
    expected_run_revision: 10,
    video_id: videoId,
  });
  expect(commands[0].key).toMatch(/^[a-f0-9-]{36}$/);
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await panel.getByText(/^Selecciones guardadas ·/).click();
  await panel
    .getByRole("button", { name: /^Consultar selección demoB000001$/ })
    .click();
  expect(await selections(request)).toHaveLength(1);
});

test("permite seleccionar con señal de descenso", async ({ page, request }) => {
  await scenario(request, "publications-no-growth");
  const panel = await preview(page);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toBeVisible();
  expect(await selections(request)).toHaveLength(1);
});

test("paginación conserva el orden y transporta el cursor opaco", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-paged");
  const panel = await catalog(page);
  await expect(panel.getByText(/1 publicación elegible cargada/)).toBeVisible();
  await panel
    .getByRole("button", { name: "Ver más publicaciones", exact: true })
    .click();
  await expect(
    panel.getByText(/2 publicaciones elegibles cargadas/),
  ).toBeVisible();
  await expect(panel.locator("h3")).toHaveText([
    "SINTÉTICO · Aplicación de IA para equipos",
    "SINTÉTICO · Automatización con IA",
  ]);
  const next = (await requests(request)).find(
    (row) => row.path.endsWith("/videos") && row.query.includes("cursor="),
  )!;
  expect(new URLSearchParams(next.query).get("cursor")).toBe(
    "synthetic:publications:+/page2",
  );
  expect(await selections(request)).toHaveLength(0);
});

test("conflicto entre páginas conserva el listado previo sin mezclar", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-paged-conflict");
  const panel = await catalog(page);
  await panel
    .getByRole("button", { name: "Ver más publicaciones", exact: true })
    .click();
  await expect(panel.getByText(/Listado anterior conservado/)).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Ver más publicaciones", exact: true }),
  ).toBeDisabled();
  await expect(panel.locator("h3")).toHaveText([
    "SINTÉTICO · Aplicación de IA para equipos",
  ]);
});

test("detalle con elegibilidad pendiente no permite seleccionar", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-ineligible");
  const panel = await catalog(page);
  await panel
    .getByRole("button", { name: /^Inspeccionar publicación\s*:/ })
    .first()
    .click();
  await expect(
    panel.getByText("Elegibilidad pendiente.", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Seleccionar para análisis",
      exact: true,
    }),
  ).toBeDisabled();
  expect(await selections(request)).toHaveLength(0);
});

test("respuesta perdida se recupera tras recargar sin otro POST", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-lost");
  const panel = await preview(page);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/Hay una selección pendiente de confirmar/),
  ).toHaveCount(0);
  expect(await selections(request)).toHaveLength(1);
});

test("recuperación busca páginas restantes antes de resolver la selección", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-lost-paged");
  const panel = await preview(page);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await page.reload();
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await expect(
    panel.getByText(/Hay una selección pendiente de confirmar/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Reenviar la misma selección",
      exact: true,
    }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Ver más selecciones guardadas", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/Hay una selección pendiente de confirmar/),
  ).toHaveCount(0);
  expect(await selections(request)).toHaveLength(1);
});

test("reenvío manual tras lectura completa conserva clave y cuerpo", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-retry");
  const panel = await preview(page);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Reenviar la misma selección",
      exact: true,
    }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Reenviar la misma selección", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toBeVisible();
  const commands = await selections(request);
  expect(commands).toHaveLength(2);
  expect(commands[0].key).toBe(commands[1].key);
  expect(commands[0].body).toEqual(commands[1].body);
  const rows = await requests(request);
  const posts = rows.flatMap((row, index) =>
    row.method === "POST" && row.path.endsWith("/analyses") ? [index] : [],
  );
  expect(
    rows
      .slice(posts[0] + 1, posts[1])
      .some((row) => row.method === "GET" && row.path.endsWith("/analyses")),
  ).toBe(true);
});

test("cambio de revisión conserva incertidumbre y no ofrece reenvío", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-revision-changed");
  const panel = await preview(page);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await expect(
    panel.getByText(/Hay una selección pendiente de confirmar/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Reenviar la misma selección",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await selections(request)).toHaveLength(1);
});

test("fallo de consulta conserva el catálogo anterior identificado", async ({
  page,
  request,
}) => {
  const panel = await catalog(page);
  await request.post(`${harness}/__test/fail`, {
    data: { reads: "publications" },
  });
  await panel
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await expect(panel.getByText(/Listado anterior conservado/)).toBeVisible();
  await expect(
    panel.getByRole("heading", {
      name: "SINTÉTICO · Aplicación de IA para equipos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByRole("alert")).toBeVisible();
});

test("fallo de selecciones conserva publicaciones e inspección", async ({
  page,
  request,
}) => {
  await request.post(`${harness}/__test/fail`, {
    data: { reads: "selections" },
  });
  const panel = await preview(page);
  await expect(
    panel.getByText(/No se pudieron recuperar las selecciones guardadas/),
  ).toBeVisible();
  expect(await selections(request)).toHaveLength(0);
});

test("rechazo de elegibilidad no anuncia guardado", async ({
  page,
  request,
}) => {
  await scenario(request, "publications-not-eligible");
  const panel = await preview(page);
  await panel
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Selección guardada", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByText(/Hay una selección pendiente de confirmar/),
  ).toHaveCount(0);
  expect(await selections(request)).toHaveLength(1);
});

test("teclado, candidato frente a Short y vistas móvil/escritorio", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const panel = await catalog(page);
  const inspect = panel
    .getByRole("button", { name: /^Inspeccionar publicación\s*:/ })
    .first();
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByRole("button", {
      name: "Seleccionar para análisis",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    panel.getByText("Short confirmado", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    panel.getByRole("article").getByText("Candidato corto", { exact: true }),
  ).toBeVisible();
  await mkdir("/private/tmp/senialon-fe17-visual", { recursive: true });
  await panel.screenshot({
    path: "/private/tmp/senialon-fe17-visual/desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(
    page.getByRole("link", { name: "Saltar al contenido", exact: true }),
  ).not.toBeFocused();
  await page.screenshot({
    path: "/private/tmp/senialon-fe17-visual/mobile.png",
    animations: "disabled",
  });
  await panel
    .getByRole("article")
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: "/private/tmp/senialon-fe17-visual/mobile-selection.png",
    animations: "disabled",
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(await selections(request)).toHaveLength(0);
});
