import Image from "next/image";
import Link from "next/link";
import { Icon } from "./icon";
import logo from "../../public/branding/senialon-dark.png";
import styles from "./workspace.module.css";

function Navigation({
  runId,
  section = "runs",
}: {
  runId?: string;
  section?: "runs" | "publications";
}) {
  const root = runId ? `/?run=${encodeURIComponent(runId)}` : "/";
  const anchorRoot = runId ? root : "";
  return (
    <nav className={styles.navigation} aria-label="Navegación principal">
      <Link
        className={section === "runs" ? styles.activeLink : undefined}
        href={root}
        aria-current={section === "runs" ? "page" : undefined}
        prefetch={false}
      >
        <Icon name="runs" />
        Ejecuciones
      </Link>
      <a href={`${anchorRoot}#comparacion`}>
        <Icon name="comparison" />
        Comparación temática
      </a>
      <a
        href={`${anchorRoot}#publicaciones`}
        className={section === "publications" ? styles.activeLink : undefined}
        aria-current={section === "publications" ? "page" : undefined}
      >
        <Icon name="publications" />
        Publicaciones
      </a>
      <p className={styles.navHint}>
        Comparación y publicaciones conservan la ejecución seleccionada.
      </p>
    </nav>
  );
}

export function Workspace({
  children,
  runId,
  section,
}: Readonly<{
  children: React.ReactNode;
  runId?: string;
  section?: "runs" | "publications";
}>) {
  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/" aria-label="SENIALON, inicio">
          <Image src={logo} alt="SENIALON" width={184} height={80} priority />
        </Link>
        <Navigation runId={runId} section={section} />
        <div className={styles.sidebarFooter}>
          <span>Radar de contenidos</span>
          <strong>YouTube · IA</strong>
          <span>Contexto editorial: LatAm</span>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <Link
            className={styles.mobileBrand}
            href="/"
            aria-label="SENIALON, inicio"
          >
            <Image src={logo} alt="SENIALON" width={138} height={60} priority />
          </Link>
          <span className={styles.sectionLabel}>Radar de contenidos</span>
          <span className={styles.workspaceLabel}>Espacio compartido</span>
        </header>
        <details className={styles.mobileNavigation}>
          <summary>
            <Icon name="menu" />
            <span>Menú</span>
            <Icon className={styles.menuChevron} name="chevron" />
          </summary>
          <Navigation runId={runId} section={section} />
        </details>
        <main id="contenido" className={styles.main} tabIndex={-1}>
          {children}
        </main>
        <footer className={styles.footer}>
          Las publicaciones aportan señales. La evidencia sostiene el criterio.
        </footer>
      </div>
    </div>
  );
}
