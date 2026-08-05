# ActionBrief

Turns a Microsoft Teams meeting transcript into a designed, department-branded
action brief — the decisions, owners, blockers and dates pulled out and laid out
on one A4 document that someone will actually read.

Built for the eight departments at Imperial Learning: Finance, Marketing, Sales,
Human Resources, Upper Management, Operations, Academic and Course Development.
Each gets its own accent palette and its own workstream vocabulary, so a brief is
recognisable at a glance.

---

## What it does

1. Someone downloads the transcript from Teams (**Recap → Transcript → Download**).
2. They drop it in, pick their department, and optionally paste the attendee list.
3. About thirty seconds later they get a formatted brief with:
   - a spotlight on the one or two things that actually matter,
   - a bento grid of the numbers that were stated in the meeting,
   - workstream tracks with numbered items, owners and status chips,
   - a decisions log and a risk register,
   - the three most time-bound actions,
   - a "who's owning what" grid,
   - a deadline timeline,
   - a participation chart measured from the transcript, not generated.
4. They export it as **print-ready A4 PDF** or **editable Word (.docx)**.

Every figure and every person named in the output is checked back against the
transcript before export. Anything the source does not support is shown as a
finding rather than buried — see [Verification](#verification).

---

## Architecture

Two independently deployable Next.js 16 apps:

| | `frontend/` | `backend/` |
| --- | --- | --- |
| Serves | The staff-facing UI | `/api/*` JSON API, plus the internal `/print/[id]` render target |
| Talks to | The backend, over HTTP (proxied via `/api/*` so cookies stay same-origin) | Postgres, OpenRouter, and its own headless Chromium |
| Holds | Pages, components, the passcode-gated app shell | Session/passcode auth, the DB layer, PDF/DOCX export, transcript ingestion, LLM orchestration |

The frontend never touches Postgres, the session-signing secret, or the model
API key directly — every one of those lives only in `backend/`. See
`frontend/next.config.ts`'s `rewrites()` for the proxy that keeps the browser's
`fetch('/api/...')` calls same-origin without any CORS configuration.

Each app has its own `package.json`, `Dockerfile` and `railway.toml` — they are
two separate Railway services, not one build with two entry points.

---

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | One request/response model for both the API and the print target |
| Styling | Tailwind CSS 4, self-hosted Inter | No font CDN at build or runtime, so the PDF is byte-stable |
| Model | OpenRouter → GPT-5.6 Luna / Luna Pro | 1M context, ~$0.004 per brief |
| Database | Postgres via `pg` and plain SQL | One table; no ORM engine binary to ship |
| PDF | Puppeteer driving system Chromium | The export *is* the preview — one implementation of the document |
| DOCX | `docx` (programmatic OOXML) | Editable output, not a screenshot in a wrapper |
| Tests | Vitest (backend), Playwright (frontend) | Parsers, schema, JSON recovery, grounding, exporters; browser smoke tests |
| Host | Railway, Docker, two services | No serverless timeout on long transcripts; Chromium available only where it's needed |

---

## Cost

Verified on openrouter.ai, 5 August 2026:

| Model | Context | Input | Output |
| --- | --- | --- | --- |
| `openai/gpt-5.6-luna` | 1,050,000 | $0.10 / M tokens | $0.60 / M tokens |
| `openai/gpt-5.6-luna-pro` | 1,050,000 | $0.10 / M tokens | $0.60 / M tokens |

A 60-minute meeting is roughly 11k input and 5k output tokens:

- **Luna** — (11,000 × 0.10 + 5,000 × 0.60) ÷ 1,000,000 = **$0.0041**
- **Luna Pro** — (11,000 × 0.10 + 5,000 × 0.60) ÷ 1,000,000 = **$0.0041**

At 200 meetings a month on Luna that is about **$0.82/month** in model cost.
Luna is the default; Luna Pro is a per-brief toggle for long or dense meetings —
priced the same today, but kept as a separate slug since OpenRouter can reprice
either independently.

---

## Verification

The document is written by a language model, so the app does not ask anyone to
take it on trust.

**Measured, never generated.** Speaker count, turn count, word count, meeting
duration and the participation shares are arithmetic on the parsed transcript
(`backend/src/lib/transcript/stats.ts`). The model never sees or supplies them.

**Fact-anchored.** After generation, every numeric literal and every person named
in the brief is checked against the transcript plus whatever context the uploader
typed (`backend/src/lib/qa/grounding.ts`). Spelled-out numbers are converted first, so
"one thousand nine hundred" in the transcript attests "1,900" in the brief
(`backend/src/lib/qa/numbers.ts`). Findings are ranked and shown beside the preview
before anyone can export.

**Honest about failure.** If the model's output was truncated, needed JSON
repair, or was regenerated after a thin first attempt, the panel says so. If the
transcript had no timestamps or no speaker labels, that is stated too.

**Refuses to ship a broken PDF.** The print route measures its own layout to
confirm the stylesheet applied; if it did not, the export fails with an
actionable error instead of producing an unformatted document
(`backend/src/app/print/[id]/page.tsx`, `backend/src/lib/export/pdf.ts`).

---

## Local development

Requires Node 22+ and a Postgres 14+ database. Run both services — the frontend
proxies `/api/*` to the backend, so neither is useful alone.

```bash
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env.local     # then fill in the four required values
npm run migrate
npm run dev                    # http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
cp .env.example .env.local     # BACKEND_URL defaults to http://127.0.0.1:3001
npm run dev                    # http://localhost:3000
```

`CHROMIUM_PATH` (backend) must point at a Chromium or Chrome binary for PDF
export to work locally. Everything else works without it; the health endpoint
reports which subsystems are available.

### Commands

Run from inside `backend/` or `frontend/` respectively:

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | both | Development server |
| `npm run build` | both | Production build (type-checks and lints) |
| `npm start` | both | Boot as production does |
| `npm run migrate` | backend | Apply pending SQL migrations |
| `npm run verify` | both | `typecheck` + `lint` (+ `test` in backend) |
| `npm test` | backend | Vitest suite |
| `npm run test:e2e` | frontend | Playwright end-to-end (needs both services running) |

### Verifying a change

```bash
cd backend && npm run verify
cd frontend && npm run verify
```

That is the gate. `next build` also runs type checking and linting in both
apps, so a broken build cannot reach an image.

---

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the Railway walkthrough (two
services), the full environment-variable reference, and how to diagnose a
deployment from `/api/health`.

---

## Repository layout

```
backend/
  src/
    app/
      api/              JSON API: auth, briefs, exports, health
      print/[id]/       Bare A4 render target for the PDF pipeline (internal only)
    components/brief/   The document itself — needed here to render PDFs
    lib/
      transcript/       .vtt/.srt/.docx/.pdf/.txt/.json → cues → stats
      ai/               OpenRouter client, prompt, schema, JSON recovery
      qa/                Grounding checks and number-word conversion
      export/            PDF (Chromium) and DOCX builders
      db.ts, repository.ts, auth.ts, env.ts   Postgres, sessions, config
  db/migrations/        Numbered SQL, applied once, tracked in the database
  scripts/              Container entrypoint and migration runner
  tests/                Unit, integration and fixtures

frontend/
  src/
    app/
      (app)/            Authenticated shell: new, library, brief/[id]
      login/  example/  Gate, and a worked sample viewable without signing in
    components/
      brief/            The document itself, for live preview
      app/              Shell, upload flow, export controls
      ui/               Buttons, fields, cards, notices
    lib/                 Duplicated isomorphic modules (schema, departments,
                         theme, utils) plus backend.ts, the HTTP client used
                         by every Server Component that needs backend data
  tests/e2e/            Playwright smoke tests
```

### Two conventions worth knowing

**Never build a Tailwind class by interpolation.** Tailwind scans source text, so
`bg-${colour}-500` produces nothing. Accent classes are looked up from the literal
maps in `theme.ts` (duplicated in both apps — keep them in sync).

**The document renders at exactly one width.** `.doc-page` is `210mm`, which is
793.7px at the 96dpi Chromium uses for print. The on-screen preview (frontend)
is that same markup scaled with a CSS transform, and the PDF pipeline (backend)
renders the identical markup unscaled, so the preview cannot disagree with the PDF.

### Shared code is duplicated, not a workspace package

`brief-bundle.ts`, `brief-inputs.ts`, `ai/schema.ts`, `departments.ts`,
`theme.ts`, `utils.ts` and the `BriefDocument` component tree exist as separate
copies in `frontend/src` and `backend/src`. This was a deliberate trade-off over
an npm-workspace `shared/` package — no build-tooling changes, but it means a
schema or styling change made in one app does **not** automatically apply to the
other. When you touch one of those files, check whether the same change belongs
in both copies.

---

## Extending it

**Add a department** — one entry in `DEPARTMENTS` in `departments.ts` — **in both
`frontend/src/lib` and `backend/src/lib`**. The picker, theming, filters and
prompt pick it up automatically once both copies agree.

**Change the document** — the section components live in
`components/brief/sections.tsx` and are assembled in `BriefDocument.tsx` — again,
in both apps. Adding a section means adding it there, to
`backend/src/lib/ai/schema.ts` (lenient input, strict output, normalisation) and
to the schema block in `backend/src/lib/ai/prompt.ts`. Mirror it in
`backend/src/lib/export/docx.ts` or it will be missing from Word exports.

**Change the model** — set `OPENROUTER_MODEL_FAST` / `OPENROUTER_MODEL_DEEP` on
the backend service. Add the price to `MODEL_PRICING` in
`backend/src/lib/ai/openrouter.ts` or the cost column shows `—` rather than a
guess.
