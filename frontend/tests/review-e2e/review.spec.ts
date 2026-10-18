import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";

const harness = "http://127.0.0.1:3381";
const path = "/runs/fixture-run-001/analyses/fixture-analysis-001";
type Row = {
  method: string;
  path: string;
  query: string;
  key: string | null;
  body: {
    expected_analysis_version: number;
    expected_review_revision: number;
    decision: string;
    reason: string;
    evidence_reviews: {
      evidence_id: string;
      state: string;
      note: string | null;
    }[];
  } | null;
};
async function requests(request: APIRequestContext): Promise<Row[]> {
  return (await request.get(`${harness}/__test/requests`)).json();
}
async function writes(request: APIRequestContext) {
  return (await requests(request)).filter((row) => row.method === "PUT");
}
async function scenario(request: APIRequestContext, name: string) {
  await request.post(`${harness}/__test/scenario`, {
    data: { scenario: name },
  });
}
const panel = (page: Page) => page.locator("#revision-editorial");
const save = (page: Page) =>
  panel(page).getByRole("button", { name: "Guardar decisión", exact: true });
const consult = (page: Page) =>
  panel(page).getByRole("button", {
    name: "Consultar revisión guardada",
    exact: true,
  });
const reason = (page: Page) =>
  panel(page).getByLabel("Motivo de la decisión", { exact: false });
async function open(page: Page, suffix = "") {
  await page.goto(path + suffix);
  await expect(
    panel(page).getByRole("heading", {
      name: "Revisión editorial",
      exact: true,
    }),
  ).toBeVisible();
}
async function draft(
  page: Page,
  decision = "consider_for_adaptation",
  text = "SINTÉTICO · Útil para explicar automatización con evidencia",
) {
  await panel(page)
    .getByLabel("Decisión editorial", { exact: true })
    .selectOption(decision);
  await reason(page).fill(text);
}
test.beforeEach(async ({ request }) => {
  await scenario(request, "review-ready");
});
test.afterEach(async ({ request }) => {
  expect(
    (await requests(request)).filter(
      (row) =>
        row.path.endsWith("/advance") || row.path.endsWith("/confirmation"),
    ),
  ).toHaveLength(0);
});

test("abrir, editar y consultar no guardan ni aprueban automáticamente", async ({
  page,
  request,
}) => {
  await open(page);
  await expect(panel(page)).toContainText(
    "Estado guardado: Pendiente de revisión.",
  );
  await expect(reason(page)).toHaveValue("");
  await draft(page);
  await consult(page).click();
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await expect(panel(page)).toContainText(
    "Estado guardado: Pendiente de revisión.",
  );
  expect(await writes(request)).toHaveLength(0);
});

test("guarda decisión, motivo y revisión de toda la evidencia para la versión exacta", async ({
  page,
  request,
}) => {
  await open(page);
  await draft(page);
  await panel(page)
    .getByText(/^Revisar evidencia antes de guardar/)
    .click();
  await panel(page)
    .getByLabel("Estado de evidencia 1", { exact: true })
    .selectOption("verified_against_source");
  await panel(page)
    .getByLabel("Nota de evidencia 1", { exact: false })
    .fill("SINTÉTICO · Contrasté el fragmento con el original");
  await save(page).click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  await expect(panel(page)).toContainText(
    "Estado guardado: Considerar para adaptación.",
  );
  const sent = await writes(request);
  expect(sent).toHaveLength(1);
  expect(sent[0].key).toMatch(/^[a-f0-9-]{36}$/);
  expect(sent[0].body).toMatchObject({
    expected_analysis_version: 2,
    expected_review_revision: 1,
    decision: "consider_for_adaptation",
  });
  expect(sent[0].body!.evidence_reviews).toHaveLength(7);
  expect(
    new Set(sent[0].body!.evidence_reviews.map((e) => e.evidence_id)).size,
  ).toBe(7);
  expect(sent[0].body!.evidence_reviews[0]).toMatchObject({
    state: "verified_against_source",
    note: "SINTÉTICO · Contrasté el fragmento con el original",
  });
  await expect(page.locator("#evidencia")).toContainText(
    "Contrastada con el original",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("senialon:command:v1")),
  ).toBeNull();
});

test("descartar conserva publicación, señal, hipótesis y evidencia; volver a pendiente exige motivo", async ({
  page,
  request,
}) => {
  await open(page);
  await draft(
    page,
    "discarded",
    "SINTÉTICO · El ángulo no corresponde a esta adaptación",
  );
  await save(page).click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  await expect(panel(page)).toContainText("Estado guardado: Descartada.");
  await expect(
    page.getByRole("heading", {
      name: "SINTÉTICO · Aplicación de IA para equipos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#senal")).toContainText("+100 %");
  await expect(page.locator("#evidencia li")).toHaveCount(7);
  await draft(
    page,
    "pending_review",
    "SINTÉTICO · Falta contrastar un detalle antes de decidir",
  );
  await save(page).click();
  await expect(panel(page)).toContainText(
    "Estado guardado: Pendiente de revisión.",
  );
  const sent = await writes(request);
  expect(sent).toHaveLength(2);
  expect(sent[1].body!.expected_review_revision).toBe(2);
});

test("validación de motivo y nota lleva el foco al campo sin enviar PUT", async ({
  page,
  request,
}) => {
  await open(page);
  await save(page).click();
  await expect(reason(page)).toBeFocused();
  await expect(reason(page)).toHaveAttribute("aria-invalid", "true");
  await draft(page, "pending_review", "   ");
  await save(page).click();
  expect(await writes(request)).toHaveLength(0);
  await draft(page);
  await panel(page)
    .getByText(/^Revisar evidencia antes de guardar/)
    .click();
  await panel(page)
    .getByLabel("Estado de evidencia 1", { exact: true })
    .selectOption("disputed");
  await save(page).click();
  await expect(
    panel(page).getByLabel("Nota de evidencia 1", { exact: false }),
  ).toBeFocused();
  expect(await writes(request)).toHaveLength(0);
});

test("conflicto de revisión conserva el borrador y exige cargar explícitamente el estado actual", async ({
  page,
  request,
}) => {
  await scenario(request, "review-revision-conflict");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await expect(
    panel(page).getByRole("button", {
      name: "Cargar revisión guardada en el formulario",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await consult(page).click();
  await expect(panel(page)).toContainText(
    "Motivo guardado: SINTÉTICO · Otra sesión guardó esta revisión",
  );
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await expect(save(page)).toBeDisabled();
  await panel(page)
    .getByRole("button", {
      name: "Cargar revisión guardada en el formulario",
      exact: true,
    })
    .click();
  await draft(
    page,
    "consider_for_adaptation",
    "SINTÉTICO · Nueva decisión tras leer la revisión actual",
  );
  await save(page).click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  const sent = await writes(request);
  expect(sent).toHaveLength(2);
  expect(sent[1].body!.expected_review_revision).toBe(2);
});

test("versión nueva no recibe el motivo ni la revisión del borrador anterior", async ({
  page,
  request,
}) => {
  await scenario(request, "review-version-conflict");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await consult(page).click();
  await expect(panel(page)).toContainText(
    "Versión del análisis 3 · revisión editorial 1",
  );
  await expect(panel(page)).toContainText("Borrador para análisis versión 2");
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await expect(save(page)).toBeDisabled();
  await panel(page)
    .getByRole("button", {
      name: "Cargar revisión guardada en el formulario",
      exact: true,
    })
    .click();
  await expect(reason(page)).toHaveValue("");
  await draft(page, "discarded", "SINTÉTICO · Motivo para la nueva versión");
  await save(page).click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  const sent = await writes(request);
  expect(sent).toHaveLength(2);
  expect(sent[1].body!.expected_analysis_version).toBe(3);
});

test("respuesta perdida restaura el intento tras recargar y recupera el guardado sin otro PUT", async ({
  page,
  request,
}) => {
  await scenario(request, "review-lost");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await page.reload();
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await expect(reason(page)).toBeDisabled();
  await consult(page).click();
  await expect(
    panel(page).getByText(/^Revisión recuperada del servidor\./),
  ).toBeVisible();
  await expect(panel(page)).toContainText(
    "Estado guardado: Considerar para adaptación.",
  );
  expect(await writes(request)).toHaveLength(1);
  expect(
    await page.evaluate(() => localStorage.getItem("senialon:command:v1")),
  ).toBeNull();
});

test("fallo previo a escribir permite reenvío manual exacto solo después de GET", async ({
  page,
  request,
}) => {
  await scenario(request, "review-retry");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await expect(
    panel(page).getByRole("button", {
      name: "Reenviar el mismo guardado",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await consult(page).click();
  await panel(page)
    .getByRole("button", { name: "Reenviar el mismo guardado", exact: true })
    .click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  const sent = await writes(request);
  expect(sent).toHaveLength(2);
  expect(sent[1].key).toBe(sent[0].key);
  expect(sent[1].body).toEqual(sent[0].body);
});

test("respuesta incoherente no confirma guardado; GET recupera el registro válido", async ({
  page,
  request,
}) => {
  await scenario(request, "review-wrong-ack");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toHaveCount(0);
  await consult(page).click();
  await expect(
    panel(page).getByText(/^Revisión recuperada del servidor\./),
  ).toBeVisible();
  expect(await writes(request)).toHaveLength(1);
});

test("conciliación con otra revisión cierra solo el intento local y conserva el borrador", async ({
  page,
  request,
}) => {
  await scenario(request, "review-ambiguous-conflict");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await consult(page).click();
  await panel(page)
    .getByRole("button", {
      name: "Cerrar intento sin sobrescribir la revisión",
      exact: true,
    })
    .click();
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await expect(save(page)).toBeDisabled();
  expect(await writes(request)).toHaveLength(1);
});

test("conciliar una entrega desde un histórico conserva la revisión de cada versión", async ({
  page,
  request,
}) => {
  await scenario(request, "review-lost");
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await open(page, "?analysis_version=1");
  await consult(page).click();
  await expect(
    panel(page).getByText(/^La revisión solicitada está guardada/),
  ).toBeVisible();
  await expect(panel(page)).toContainText(
    "Versión del análisis 1 · revisión editorial 2",
  );
  await expect(panel(page)).toContainText(
    "Motivo guardado: SINTÉTICO · Motivo conservado de la versión anterior",
  );
  await expect(save(page)).toBeDisabled();
  expect(await writes(request)).toHaveLength(1);
  expect(
    await page.evaluate(() => localStorage.getItem("senialon:command:v1")),
  ).toBeNull();
});

test("histórico y falta de capacidades bloquean escritura; análisis parcial sigue revisable", async ({
  page,
  request,
}) => {
  await open(page, "?analysis_version=1");
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Motivo conservado de la versión anterior",
  );
  await expect(reason(page)).toBeDisabled();
  await expect(save(page)).toBeDisabled();
  await scenario(request, "review-no-action");
  await open(page);
  await expect(save(page)).toBeDisabled();
  await scenario(request, "review-partial");
  await open(page);
  await draft(
    page,
    "pending_review",
    "SINTÉTICO · Esperar material suficiente para revisar",
  );
  await save(page).click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  expect(await writes(request)).toHaveLength(1);
});

test("un fallo al consultar conserva motivo y resultados, y detiene nuevos envíos", async ({
  page,
  request,
}) => {
  await open(page);
  await draft(page);
  await request.post(`${harness}/__test/fail`);
  await consult(page).click();
  await expect(panel(page).getByRole("alert").first()).toBeVisible();
  await expect(reason(page)).toHaveValue(
    "SINTÉTICO · Útil para explicar automatización con evidencia",
  );
  await expect(
    page.getByRole("heading", { name: "Métricas originales", exact: true }),
  ).toBeVisible();
  await expect(save(page)).toBeDisabled();
  expect(await writes(request)).toHaveLength(0);
});

test("otro navegador sin recibos recupera del servidor la misma decisión y evidencia", async ({
  page,
  browser,
  request,
}) => {
  await open(page);
  await draft(page);
  await save(page).click();
  await expect(panel(page).getByText(/^Decisión guardada\./)).toBeVisible();
  const context = await browser.newContext({
    httpCredentials: {
      username: "synthetic-review-operator",
      password: "synthetic-review-password",
    },
  });
  try {
    const second = await context.newPage();
    await second.goto("http://127.0.0.1:3380" + path);
    await expect(panel(second)).toContainText(
      "Estado guardado: Considerar para adaptación.",
    );
    await expect(reason(second)).toHaveValue(
      "SINTÉTICO · Útil para explicar automatización con evidencia",
    );
    await expect(panel(second)).toContainText(
      "Versión del análisis 2 · revisión editorial 2",
    );
    expect(
      await second.evaluate(() => localStorage.getItem("senialon:command:v1")),
    ).toBeNull();
    expect(await writes(request)).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test("borrador editorial bloquea otro paso de análisis hasta guardarlo o cargar el estado guardado", async ({
  page,
  request,
}) => {
  await scenario(request, "review-edit-lock");
  await open(page);
  const advance = page.getByRole("button", {
    name: "Solicitar paso de análisis",
    exact: true,
  });
  await expect(advance).toBeEnabled();
  await draft(page);
  await expect(advance).toBeDisabled();
  await panel(page)
    .getByRole("button", {
      name: "Cargar revisión guardada en el formulario",
      exact: true,
    })
    .click();
  await expect(advance).toBeEnabled();
});

test("solicitud ajena o recibo ilegible no se reemplaza por un guardado", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "senialon:command:v1",
      JSON.stringify({
        version: 1,
        kind: "create",
        key: "synthetic-other-request-001",
        createdAt: "2026-10-18T11:00:00-05:00",
        operationId: null,
      }),
    ),
  );
  await open(page);
  await expect(save(page)).toBeDisabled();
  // The browser emits `storage` in other tabs, not in the tab doing the write.
  const otherTab = await page.context().newPage();
  await otherTab.goto("http://127.0.0.1:3380" + path);
  await otherTab.evaluate(() =>
    localStorage.setItem("senialon:command:v1", "invalid"),
  );
  await otherTab.close();
  await expect(panel(page)).toContainText(
    "No se puede recuperar el registro local",
  );
  await expect(save(page)).toBeDisabled();
  await consult(page).click();
  expect(await writes(request)).toHaveLength(0);
});

test("guardas de página y PUT rechazan acceso anónimo sin escribir", async ({
  request,
}) => {
  const response = await fetch("http://127.0.0.1:3380" + path);
  expect(response.status).toBe(401);
  const denied = await fetch(
    "http://127.0.0.1:3380/api/v1" + path + "/review",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:3380",
      },
      body: "{}",
    },
  );
  expect(denied.status).toBe(401);
  expect(await writes(request)).toHaveLength(0);
});

test("formulario legible en escritorio y móvil, foco y notas sin desbordar la página", async ({
  page,
}) => {
  const directory = "/private/tmp/senialon-fe19-qa";
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await draft(page);
  await panel(page).evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  );
  await page.screenshot({ path: `${directory}/desktop.png` });
  await panel(page).getByLabel("Decisión editorial", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(reason(page)).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel(page).evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  );
  await page.screenshot({ path: `${directory}/mobile.png` });
  await panel(page)
    .getByText(/^Revisar evidencia antes de guardar/)
    .click();
  await panel(page)
    .getByLabel("Estado de evidencia 1", { exact: true })
    .selectOption("insufficient_to_verify");
  await panel(page)
    .getByLabel("Nota de evidencia 1", { exact: false })
    .fill("SINTÉTICO · El material disponible no permite verificar el detalle");
  await panel(page)
    .getByLabel("Estado de evidencia 1", { exact: true })
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${directory}/mobile-evidence.png` });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const button = await save(page).boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(44);
});
