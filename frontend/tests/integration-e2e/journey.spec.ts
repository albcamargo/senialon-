import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type { Schema } from "../../src/lib/api/types";

const control = "http://127.0.0.1:3392";
const controlHeaders = {
  "X-Senialon-Test-Control": "synthetic-fe110-control-only",
};
const credentials = {
  username: "synthetic-integration-operator",
  password: "synthetic-integration-password",
};
type RuntimeState = {
  pid: number;
  calls: { provider: string; path: string }[];
  requests: { method: string; path: string }[];
};

async function state(request: APIRequestContext): Promise<RuntimeState> {
  const response = await request.get(`${control}/state`, {
    headers: controlHeaders,
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function scenario(request: APIRequestContext, name: string) {
  const response = await request.post(`${control}/scenario`, {
    headers: controlHeaders,
    data: { scenario: name },
  });
  expect(response.status()).toBe(200);
}
async function run(page: Page, id: string): Promise<Schema<"Run">> {
  const response = await page.request.get(`/api/v1/runs/${id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["x-contract-version"]).toBe("1.0.0");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return (await response.json()).data;
}
async function analysis(page: Page, id: string, aid: string) {
  const response = await page.request.get(`/api/v1/runs/${id}/analyses/${aid}`);
  expect(response.status()).toBe(200);
  return (await response.json()).data as Schema<"Analysis">;
}
async function create(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ejecuciones", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crear ejecución", exact: true })
    .click();
  await expect(page).toHaveURL(/\?run=[a-f0-9-]+$/);
  const id = new URL(page.url()).searchParams.get("run")!;
  await expect(
    page.getByRole("button", { name: "Solicitar siguiente paso", exact: true }),
  ).toBeEnabled();
  return id;
}
async function corpusStep(page: Page, id: string) {
  const before = (await run(page, id)).revision;
  await page
    .getByRole("button", { name: "Solicitar siguiente paso", exact: true })
    .click();
  await expect
    .poll(async () => (await run(page, id)).revision)
    .toBeGreaterThan(before);
  await expect(
    page.getByRole("button", { name: "Actualizar estado", exact: true }),
  ).toBeEnabled();
}
async function groupCorpus(page: Page, id: string) {
  for (let unit = 0; unit < 30; unit++) {
    if ((await run(page, id)).current_stage === "awaiting_confirmation") return;
    await corpusStep(page, id);
  }
  throw new Error(
    "El corpus no alcanzó la propuesta en treinta unidades explícitas.",
  );
}
async function select(page: Page) {
  const publications = page.locator("#publicaciones");
  await publications
    .getByRole("button", { name: "Consultar publicaciones", exact: true })
    .click();
  await expect(publications).toContainText("1 publicación elegible cargada");
  await expect(publications).toContainText("Candidato corto");
  await publications
    .getByRole("button", { name: /^Inspeccionar publicación/ })
    .click();
  await publications
    .getByRole("button", { name: "Seleccionar para análisis", exact: true })
    .click();
  await publications
    .getByRole("link", {
      name: "Abrir ficha de la publicación seleccionada",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/runs\/[^/]+\/analyses\/[^/?]+$/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
async function analysisStep(page: Page, id: string, aid: string) {
  const version = (await analysis(page, id, aid)).analysis_version;
  const button = page.getByRole("button", {
    name: "Solicitar paso de análisis",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expect
    .poll(async () => (await analysis(page, id, aid)).analysis_version)
    .toBeGreaterThan(version);
  await expect(
    page.getByRole("button", { name: "Consultar ficha", exact: true }),
  ).toBeEnabled();
}

test.beforeEach(async ({ request }) => {
  await scenario(request, "healthy");
});

test("recorrido UI completo entre Next, FastAPI y PostgreSQL; recuperación tras reinicio de Python", async ({
  page,
  request,
  browser,
}) => {
  const id = await create(page);
  const created = await run(page, id);
  expect(created.corpus).toHaveLength(11);
  expect(created.windows.timezone).toBe("America/Bogota");
  await groupCorpus(page, id);

  const comparison = page.locator("#comparacion");
  await comparison
    .getByRole("button", { name: "Consultar comparación", exact: true })
    .click();
  await expect(
    comparison.getByRole("button", {
      name: "Calcular comparación",
      exact: true,
    }),
  ).toBeDisabled();
  const groups = page.locator("#grupos");
  await groups
    .getByRole("button", { name: "Consultar grupos", exact: true })
    .click();
  await expect(groups).toContainText("SINTÉTICO · Automatización");

  // La selección y su revisión inicial no exigen señal ni confirmación.
  const beforeSelection = (await state(request)).calls.length;
  const aid = await select(page);
  const initial = await analysis(page, id, aid);
  expect(initial.analysis_version).toBe(1);
  expect(initial.review.decision).toBe("pending_review");
  expect(initial.signal.state).toBe("pending");
  expect((await state(request)).calls).toHaveLength(beforeSelection);

  await page.goto(`/?run=${id}`);
  await groups
    .getByRole("button", { name: "Consultar grupos", exact: true })
    .click();
  await groups
    .getByRole("button", { name: "Confirmar esta versión", exact: true })
    .click();
  await expect(groups).toContainText("Confirmación registrada");
  await comparison
    .getByRole("button", { name: "Consultar comparación", exact: true })
    .click();
  await comparison
    .getByRole("button", { name: "Calcular comparación", exact: true })
    .click();
  await expect(comparison).toContainText("Nuevo en el corpus");
  expect((await state(request)).calls).toHaveLength(beforeSelection);

  await page.goto(`/runs/${id}/analyses/${aid}`);
  for (let unit = 0; unit < 6; unit++) await analysisStep(page, id, aid);
  const complete = await analysis(page, id, aid);
  expect(complete.analysis_version).toBe(7);
  expect(complete.adaptation.stage.state).toBe("complete");
  expect(
    complete.dimensions.every((item) => item.stage.state === "complete"),
  ).toBe(true);
  await expect(page.locator("#evidencia")).toContainText("SINTÉTICO");
  await expect(page.locator("#hipotesis")).toContainText("HIPÓTESIS SINTÉTICA");

  const editorial = page.locator("#revision-editorial");
  await editorial
    .getByRole("button", {
      name: "Cargar revisión guardada en el formulario",
      exact: true,
    })
    .click();
  await editorial
    .getByLabel("Decisión editorial", { exact: true })
    .selectOption("consider_for_adaptation");
  await editorial
    .getByLabel("Motivo de la decisión", { exact: false })
    .fill("SINTÉTICO FE 1.10 · Contraste de evidencia y adaptación.");
  await editorial.getByText(/^Revisar evidencia antes de guardar/).click();
  await editorial
    .getByLabel("Estado de evidencia 1", { exact: true })
    .selectOption("verified_against_source");
  await editorial
    .getByLabel("Nota de evidencia 1", { exact: false })
    .fill("SINTÉTICO · Contraste registrado por el operador de prueba.");
  await expect(
    editorial.getByRole("button", { name: "Guardar decisión", exact: true }),
  ).toBeEnabled();
  await editorial
    .getByRole("button", { name: "Guardar decisión", exact: true })
    .click();
  await expect(editorial.getByText(/^Decisión guardada\./)).toBeVisible();
  const saved = await analysis(page, id, aid);
  expect(saved.review.revision).toBe(2);
  expect(saved.review.analysis_version).toBe(7);
  expect(saved.review.evidence_reviews[0].state).toBe(
    "verified_against_source",
  );
  expect(saved.evidence).toEqual(complete.evidence);

  const beforeRead = await state(request);
  await page.reload();
  await page
    .getByRole("button", { name: "Consultar ficha", exact: true })
    .click();
  await editorial
    .getByRole("button", { name: "Consultar revisión guardada", exact: true })
    .click();
  await expect(editorial).toContainText(
    "Estado guardado: Considerar para adaptación.",
  );
  await page.goto(`/runs/${id}/analyses/${aid}?analysis_version=1`);
  await expect(
    page.getByRole("button", {
      name: "Solicitar paso de análisis",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(editorial).toContainText(
    "Estado guardado: Pendiente de revisión.",
  );
  expect((await state(request)).calls).toEqual(beforeRead.calls);

  const restarted = await request.post(`${control}/restart`, {
    headers: controlHeaders,
  });
  expect(restarted.status()).toBe(200);
  expect((await restarted.json()).pid).not.toBe(beforeRead.pid);
  await page.context().close();
  const freshContext = await browser.newContext({
    httpCredentials: credentials,
  });
  const fresh = await freshContext.newPage();
  await fresh.goto(`http://127.0.0.1:3390/runs/${id}/analyses/${aid}`);
  await expect(fresh.locator("#revision-editorial")).toContainText(
    "Estado guardado: Considerar para adaptación.",
  );
  const restored = await analysis(fresh, id, aid);
  expect(restored).toEqual(saved);
  expect((await run(fresh, id)).windows).toEqual(created.windows);
  const after = await state(request);
  expect(after.calls).toEqual(beforeRead.calls);
  expect(
    after.requests
      .slice(beforeRead.requests.length)
      .every((row) => row.method === "GET"),
  ).toBe(true);
  await freshContext.close();
});

test("fallo de canal conserva las once fuentes, desconocidos y operación sin repetir red desde lecturas", async ({
  page,
  request,
}) => {
  await scenario(request, "channel_failure");
  const id = await create(page);
  await corpusStep(page, id);
  await expect(
    page.getByRole("heading", {
      name: "Cobertura de los 11 canales",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Solicitar siguiente paso", exact: true }),
  ).toBeDisabled();
  const failed = await run(page, id);
  expect(failed.corpus).toHaveLength(11);
  expect(failed.operations_to_inspect).toHaveLength(1);
  const before = await state(request);
  await page.getByRole("button", { name: /^Consultar operación/ }).click();
  await expect(
    page.getByText(/No se pudo resolver este canal/).first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Actualizar estado", exact: true })
    .click();
  await expect(
    page.getByText(/Lo desconocido no equivale a cero/),
  ).toBeVisible();
  expect((await state(request)).calls).toEqual(before.calls);
  expect((await run(page, id)).revision).toBe(failed.revision);
});

test("timeout audiovisual conserva metadatos y señal; no inventa observaciones ni repite al recargar", async ({
  page,
  request,
}) => {
  const id = await create(page);
  await groupCorpus(page, id);
  const aid = await select(page);
  const original = await analysis(page, id, aid);
  await scenario(request, "audiovisual_failure");
  await analysisStep(page, id, aid);
  const failed = await analysis(page, id, aid);
  expect(failed.audiovisual.state).toBe("uncertain");
  expect(failed.publication).toEqual(original.publication);
  expect(failed.signal).toEqual(original.signal);
  expect(failed.evidence).toEqual(original.evidence);
  expect(
    failed.dimensions.every(
      (item) => item.description === null && item.evidence_ids.length === 0,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Solicitar paso de análisis",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator("#metricas")).toContainText("0");
  const before = await state(request);
  await page.reload();
  await page
    .getByRole("button", { name: "Consultar ficha", exact: true })
    .click();
  const after = await state(request);
  expect(after.calls).toEqual(before.calls);
  expect(
    after.requests
      .slice(before.requests.length)
      .every((row) => row.method === "GET"),
  ).toBe(true);
  expect(await page.locator("body").innerText()).not.toContain(
    "SYNTHETIC_PRIVATE_ERROR_MUST_NOT_LEAK",
  );
});

test("ambos servicios rechazan acceso anónimo, credencial incorrecta y origen ajeno", async ({
  playwright,
  request,
}) => {
  const before = await state(request);
  for (const url of [
    "http://127.0.0.1:3390/",
    "http://127.0.0.1:3390/api/v1/runs",
    "http://127.0.0.1:3391/api/v1/runs",
  ]) {
    const response = await fetch(url);
    expect(response.status).toBe(401);
    await response.arrayBuffer();
  }
  const wrong = await playwright.request.newContext({
    httpCredentials: { username: credentials.username, password: "incorrecta" },
  });
  expect((await wrong.get("http://127.0.0.1:3391/api/v1/runs")).status()).toBe(
    401,
  );
  expect((await wrong.get("http://127.0.0.1:3390/api/v1/runs")).status()).toBe(
    401,
  );
  for (const port of [3390, 3391]) {
    const response = await request.post(
      `http://127.0.0.1:${port}/api/v1/runs`,
      {
        headers: {
          Origin: "https://invalid.example",
          "Idempotency-Key": "synthetic-invalid-origin",
        },
        data: {},
      },
    );
    expect(response.status()).toBe(403);
  }
  expect((await state(request)).calls).toEqual(before.calls);
  // El rechazo no deja ninguno de los procesos fuera de servicio.
  for (const port of [3390, 3391]) {
    expect(
      (await request.get(`http://127.0.0.1:${port}/api/v1/meta`)).status(),
    ).toBe(200);
  }
  await wrong.dispose();
});
