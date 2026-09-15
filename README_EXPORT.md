# Export Reloj CR (para GitHub en Mac)

Este archivo viaja con el zip/tar de código. El historial Git de `main` está incluido (sin `node_modules`, `.next` ni `data/`).

## Origen de este árbol

El proyecto se desarrolló en **Cursor Origin**, no en GitHub:

- Repo Origin: `anzaja/tmp-74965db88ae3d14f`
- Clone Origin: `https://origin.cursor.com/git/anzaja/tmp-74965db88ae3d14f.git`
- Rama: `main`

No hay secretos de producción en el export. Copia `.env.example` a `.env.local` en tu Mac.

## Cómo instalar y correr

En macOS, Node 20+ (mejor 22 LTS):

```bash
tar -xzf reloj_cr_export_main.tar.gz
cd reloj-cr
npm install
cp .env.example .env.local   # opcional: NVIDIA_API_KEY, etc.
npm run dev
```

Abre [http://127.0.0.1:47321](http://127.0.0.1:47321).

`better-sqlite3` es nativo: si `npm install` falla, instala Xcode Command Line Tools (`xcode-select --install`) y vuelve a intentar.

Tests: `npm test` · humo RFP/IA: `npm run smoke` · Docker: `docker compose up --build`.

## Subir a GitHub (tú, desde el Mac)

El remoto `github` (`https://github.com/anzaja72/controlde-acceso-LEIA.git`) ya existía en Origin, pero **este entorno no tiene credenciales de GitHub**. No se hizo push desde el agente.

Si el repo de GitHub **aún no existe**:

```bash
cd reloj-cr
gh repo create anzaja72/controlde-acceso-LEIA --private --source=. --remote=github
git push -u github main
```

Si el repo **ya existe** (vacío o con README):

```bash
cd reloj-cr
git remote add github https://github.com/anzaja72/controlde-acceso-LEIA.git
# o, si el remoto ya está: git remote set-url github https://github.com/anzaja72/controlde-acceso-LEIA.git
git push -u github main
```

Si GitHub rechaza por historial distinto:

```bash
git push -u github main --force
```

Solo usa `--force` si el remoto está vacío o es desechable.

Tras el push, en GitHub: Settings → Secrets → `NVIDIA_API_KEY` (si usas Nemotron). No subas `.env.local`.
