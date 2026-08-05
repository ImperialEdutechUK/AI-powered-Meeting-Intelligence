# Frontend/backend split — status

The split of ActionBrief into `frontend/` and `backend/` is **complete and
verified**. Full architectural plan:
`C:\Users\KS COMPUTERS\.claude\plans\precious-cuddling-waffle.md`.

## Done

- [x] `backend/` scaffolded — API routes, `/print/[id]`, all backend-only `src/lib`
      modules, `db/migrations`, `scripts/{migrate,start}.mjs`, its own
      `package.json`/`tsconfig.json`/`next.config.ts`/`eslint.config.mjs`/
      `postcss.config.mjs`/`vitest.config.ts`/`.env.example`/`Dockerfile`/
      `railway.toml`/`.dockerignore`.
- [x] Two new backend routes added: `GET /api/auth/session` (frontend can no
      longer verify the session cookie itself) and `GET /api/briefs/stats`
      (replaces the direct `countByDepartment()`/`totals()` calls pages used
      to make in-process).
- [x] Removed `DocumentFrame.tsx` and `GroundingPanel.tsx` from backend's copy
      of `components/brief/` — unused by `/print/[id]` and `GroundingPanel`
      needs `@/components/ui`, which backend intentionally doesn't have.
- [x] `frontend/` scaffolded — pages, components, isomorphic `src/lib` modules
      duplicated, own config/Docker/railway files.
- [x] `frontend/src/lib/env.ts` — minimal env contract (`BACKEND_URL`,
      `ORG_NAME`, `ORG_SHORT`, `MAX_UPLOAD_MB`), replacing the old `serverEnv()`.
- [x] `frontend/src/lib/backend.ts` — `backendFetch`/`backendJson` helpers that
      forward the request's cookie to the backend server-side.
- [x] `frontend/src/lib/api-types.ts` — plain-type mirrors of backend's
      `BriefRow`/`BriefRecord`/`DepartmentCount`/`Totals` response shapes.
- [x] 6 Server Component pages/layouts rewritten to call the backend over HTTP
      instead of importing `@/lib/repository` / `@/lib/auth` / `@/lib/env`
      directly: `page.tsx`, `login/page.tsx`, `(app)/layout.tsx`,
      `(app)/library/page.tsx`, `(app)/new/page.tsx`, `(app)/brief/[id]/page.tsx`.
- [x] `frontend/next.config.ts` `rewrites()` proxies `/api/:path*` to
      `BACKEND_URL` — the 5 client-side `fetch('/api/...')` call sites
      (`NewBriefForm`, `ExportBar` ×2, `LoginForm`, `Shell`) needed **zero**
      changes as a result.
- [x] Test suites moved: `tests/unit` + `tests/integration` → `backend/tests`;
      `tests/e2e` → `frontend/tests/e2e` (removed the now-meaningless
      "print route 404s without a session" case — `/print/[id]` isn't part of
      the frontend's surface anymore).
- [x] `README.md` and `DEPLOYMENT.md` rewritten for the two-service architecture.
- [x] Audited every `@/...` import in both `frontend/src` and `backend/src` —
      all resolve to files that exist.
- [x] Clean `npm install` in both `backend/` (477 packages) and `frontend/`
      (368 packages) — confirmed via real exit codes, not just log inspection.
- [x] `npm run typecheck` and `npm run lint` clean in both apps.
- [x] `npm run build` clean in both apps (`output: 'standalone'`), all expected
      routes present:
      - backend: `/api/auth/{login,logout,session}`, `/api/briefs`,
        `/api/briefs/[id]`, `/api/briefs/[id]/{docx,pdf}`, `/api/briefs/stats`,
        `/api/health`, `/print/[id]`.
      - frontend: `/`, `/login`, `/new`, `/library`, `/brief/[id]`, `/example`.
- [x] Both dev servers run together and the split's plumbing was verified live
      (with placeholder env vars — no real Postgres was available in this
      environment, see caveat below):
      - `GET /api/health` through the frontend proxy correctly reaches the
        backend (`config: true`, `database`/`pdf` correctly report `false`
        with no real DB/Chromium configured).
      - `/`, `/library` correctly 307-redirect to `/login` when unauthenticated
        — proves the rewritten Server Components' `backendJson('/api/auth/session')`
        round-trip works.
      - `GET /api/briefs` correctly returns `401` unauthenticated, through the
        proxy.
      - `/example` (static, no backend dependency) and `/login` both render `200`.
- [x] Removed all root duplicate files/folders now that both apps are
      confirmed self-sufficient: `src/`, `db/`, `scripts/`, `tests/`,
      `package.json`, `package-lock.json`, `Dockerfile`, `next.config.ts`,
      `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`,
      `vitest.config.ts`, `playwright.config.ts`, `.env.example`,
      `railway.toml`, `.dockerignore`. Root now only has `.gitignore`,
      `README.md`, `DEPLOYMENT.md`, `SPLIT-TODO.md`, `backend/`, `frontend/`.
- [x] Re-ran `npm run build` in both apps **after** the root cleanup to prove
      neither depended on anything at the old root — both still build clean,
      and the "multiple lockfiles" Turbopack warning is gone.

## Caveat: DB/model-dependent paths untested here

This sandbox has no reachable Postgres (Docker Desktop's daemon isn't running,
no local `psql`) and no real `OPENROUTER_API_KEY`. That means the following
were **not** exercised end-to-end here and should be tried against a real
database before you trust this in production:

- Completing an actual login (`POST /api/auth/login` needs a working
  `checkRateLimit()` Postgres query — it 500s here for exactly that reason,
  which is expected, not a bug in the split).
- Generating a brief, viewing the library/brief pages with real data, PDF/DOCX
  export, sign-out.
- `backend`'s vitest suite (`npm run test`) — didn't run since it wasn't
  needed to prove the split's plumbing, but nothing about the split should
  affect it (test files were moved unchanged).
- `docker build` of both `Dockerfile`s and a full containerized run.

## Next time you have a real database available

```bash
cd backend
cp .env.example .env.local   # fill in real DATABASE_URL, OPENROUTER_API_KEY, etc.
npm run migrate
npm run dev                  # :3001

cd frontend
cp .env.example .env.local   # BACKEND_URL defaults to http://127.0.0.1:3001
npm run dev                  # :3000
```

Then walk: login → new brief → library → brief detail → PDF export → docx
export → logout. Also worth running `cd backend && npm run test` and, once
both are confirmed, `docker build` + a containerized run of both.

## Known risk to keep in mind going forward

Shared code is **duplicated**, not a workspace package (explicit trade-off the
user chose). These pairs must be kept in sync by hand on future changes:

- `{frontend,backend}/src/lib/{brief-bundle,brief-inputs,departments,theme,utils,sample-brief}.ts`
- `{frontend,backend}/src/lib/ai/schema.ts`
- `{frontend,backend}/src/components/brief/{BriefDocument,primitives,sections}.tsx`
- `{frontend,backend}/src/lib/transcript/{cues,stats,types}.ts` (frontend's
  `transcript/extract.ts` is a deliberately slimmed-down shim — constants only,
  no `mammoth`/`unpdf` — keep its exports in sync with backend's real one)
- The response shapes in `frontend/src/lib/api-types.ts` must keep matching
  `backend/src/lib/repository.ts`'s `BriefRow`/`BriefRecord`/`DepartmentCount`/
  `Totals` exports.
