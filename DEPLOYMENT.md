# Deploying ActionBrief to Railway

ActionBrief is two services now — `backend/` (API, Postgres, Chromium) and
`frontend/` (the UI, proxying `/api/*` to the backend). Deploy the backend
first; the frontend needs its URL. Start to finish this is about twenty
minutes. You need a Railway account, an OpenRouter API key, and this
repository pushed to GitHub.

---

## 1. Get an OpenRouter key

1. Sign in at <https://openrouter.ai>.
2. **Keys → Create key**. Copy it; it is shown once.
3. **Credits →** add some. Ten dollars covers thousands of briefs — a 60-minute
   meeting costs about $0.002 on the default model.

---

## 2. Create the Railway project and the backend service

1. <https://railway.app> → **New Project → Deploy from GitHub repo**.
2. Pick this repository. When Railway asks for the root directory / build
   context, set it to **`backend`** — that's where `backend/Dockerfile` and
   `backend/railway.toml` live. Railway detects the Dockerfile and uses it;
   the included `railway.toml` sets the health check and restart policy.
3. Rename the service to something like `actionbrief-backend` so the frontend
   service (added next) is easy to tell apart.
4. The first build will **fail on a missing environment** — expected. Configure
   the variables next, then redeploy.

## 3. Add Postgres

In the project canvas: **New → Database → Add PostgreSQL**.

Railway exposes it to your backend service as `${{Postgres.DATABASE_URL}}`.
Nothing else is needed — the container runs migrations on every boot, and
re-running them is a no-op.

## 4. Set the backend's variables

Backend service → **Variables** → **Raw Editor**, and paste:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
OPENROUTER_API_KEY=sk-or-v1-your-real-key
APP_PASSCODE=pick-something-memorable-not-guessable
SESSION_SECRET=paste-64-hex-characters-here
ORG_NAME=Imperial Learning
ORG_SHORT=IL
```

Generate the session secret locally:

```bash
openssl rand -hex 32
```

`SESSION_SECRET` must be at least 32 characters — the container refuses to start
otherwise, with a message saying so. Changing it later signs everybody out, which
is the intended way to revoke all sessions.

`APP_PASSCODE` is the single code every member of staff types. Treat it like a
door code: share it internally, change it when someone leaves.

### Everything else is optional (backend)

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENROUTER_MODEL_FAST` | `openai/gpt-5.6-luna` | The default model |
| `OPENROUTER_MODEL_DEEP` | `openai/gpt-5.6-luna-pro` | The "Deep" toggle on the form |
| `MAX_UPLOAD_MB` | `25` | Upload ceiling |
| `RATE_LIMIT_PER_HOUR` | `40` | Briefs per IP per hour |
| `PDF_MAX_CONCURRENT_RENDERS` | `2` | Chromium instances the PDF renderer may run at once; extra requests queue for up to 60s instead of piling up and exhausting memory |
| `SESSION_HOURS` | `72` | How long a sign-in lasts |
| `DATABASE_SSL` | `false` | Set `true` only for external managed Postgres |
| `CHROMIUM_PATH` | `/usr/bin/chromium` | Already correct inside the image |
| `APP_BASE_URL` | loopback | **Leave unset.** The PDF renderer needs loopback — it navigates to its own `/print/[id]`, never the frontend's |
| `OPENROUTER_SITE_URL` | — | Optional attribution on your OpenRouter dashboard |

Do **not** set `PORT`. Railway injects it and the entrypoint uses it.

Once this deploys green, note the backend's **private networking URL**
(Settings → Networking — something like `actionbrief-backend.railway.internal`)
or its public URL if you exposed one. The frontend needs it next.

## 5. Add the frontend service

1. In the same Railway project: **New → GitHub Repo**, pick this repository
   again, and set the root directory / build context to **`frontend`**.
2. Rename it to `actionbrief-frontend`.
3. Variables → Raw Editor:

```env
BACKEND_URL=http://actionbrief-backend.railway.internal:3001
ORG_NAME=Imperial Learning
ORG_SHORT=IL
```

Use the backend's actual private networking hostname from step 4. Internal
Railway networking is plain HTTP and does not leave Railway's network.

4. Deploy. This is what staff actually visit — give it the public domain
   (Settings → Networking → Generate Domain, or a custom domain).

## 6. Deploy and verify

Open the backend's health check directly (its own Railway URL, or through the
frontend's proxy — both work since `/api/*` is forwarded):

```
https://your-frontend.up.railway.app/api/health
```

You want:

```json
{ "ok": true, "checks": { "server": true, "config": true, "database": true, "pdf": true } }
```

All four must be `true`:

- **config** — the required variables parsed. If false, read the backend's
  deploy log; the entrypoint names the missing variables explicitly.
- **database** — Postgres reachable and migrated.
- **pdf** — Chromium was found. If false, PDF export returns a clear 501 and Word
  export still works.

Then open the frontend's root URL, enter the passcode, and generate a brief
from a real transcript.

## 7. Custom domain (optional)

Frontend service → **Settings → Networking → Custom Domain**. Add the CNAME
Railway shows to your DNS. TLS is issued automatically. Only the frontend needs
a public domain — leave the backend on Railway's internal network unless you
have a reason to expose it directly. Session cookies are host-relative, so
nothing in the app needs changing.

---

## Running it

### Resources

The backend is the heavy one: **PDF export launches Chromium**, which peaks
around 350–450 MB on its own, so give it **at least 1 GB**. `backend/railway.toml`
pins one replica for the same reason; raise memory before raising `numReplicas`.
The frontend is comfortable at 512 MB — it does no rendering beyond React SSR.

### Cost

Three components:

- **Railway** — two containers plus Postgres, on Railway's usage pricing. The
  frontend is small; expect the backend and Postgres to dominate.
- **OpenRouter** — about $0.004 per brief on the default model. 200 meetings a
  month is roughly $0.82. The library page shows cumulative spend, and every brief records
  its own token counts and cost.

### Backups

The briefs table holds everything. Railway's Postgres plugin offers backups in
its settings — turn them on. To take one manually:

```bash
railway run pg_dump "$DATABASE_URL" > actionbrief-$(date +%F).sql
```

### Upgrading

Push to your default branch; Railway rebuilds and redeploys both services
independently (each watches its own root directory). Migrations apply on boot
before the backend starts accepting traffic, and a failed migration aborts the
boot rather than serving a half-migrated schema.

---

## Troubleshooting

**Deploy fails with a list of variable names.** Exactly what it says — those
variables are unset on the **backend** service. The entrypoint checks before
doing anything else so the failure is unambiguous.

**The frontend loads but every page errors or hangs.** `BACKEND_URL` on the
frontend is wrong, or the backend isn't reachable from the frontend's network
(check both are in the same Railway project / private network).

**Health shows `database: false`.** `DATABASE_URL` is wrong or Postgres is not
up yet. If you are using external managed Postgres, set `DATABASE_SSL=true`. The
migration runner retries the connection twelve times over thirty seconds on cold
starts, so a transient failure resolves itself.

**Health shows `pdf: false`.** Chromium is missing from the backend image. The
Dockerfile installs it; if you replaced the base image, either reinstate the
`chromium` apt package or point `CHROMIUM_PATH` at a binary.

**PDF export returns "The document stylesheet did not load".** The backend
image was built without `.next/static` beside the standalone server. The
Dockerfile's runtime stage copies it; if you changed those `COPY` lines, restore
them. The app detects this and refuses rather than emitting an unformatted PDF.

**"That access code is not correct" with the right code.** `APP_PASSCODE` (on
the backend) has a stray space or quote. Railway's raw editor takes the value
literally — do not wrap it in quotes.

**Everyone got signed out.** `SESSION_SECRET` (backend) changed. Expected; sign
in again.

**Generation returns "out of credit".** Top up OpenRouter.

**Generation returns a rate-limit message.** `RATE_LIMIT_PER_HOUR` is per IP.
If the whole office shares one public IP, raise it.

**A brief says "too thin".** The transcript was mostly small talk, or too short.
Anything under about 60 words of dialogue is rejected up front with a clear
message.

**Names in the output are misspelled.** Teams transcription mangles names. Paste
the attendee list into the context panel on upload — it is the single largest
quality improvement available, and it also fills in the job titles on the owner
cards.

---

## Security notes

Worth knowing before you circulate the passcode:

- **One shared code, no user accounts.** Anyone with the code can read every
  brief in the library. That was the chosen model; if you need per-person access
  later, the auth layer is one module (`backend/src/lib/auth.ts`) and the gate is
  checked in one place per route.
- **Transcripts are not stored.** Only the generated brief and the measured
  statistics are persisted. The uploaded file is parsed in memory and discarded.
- **Meeting content is sent to OpenRouter**, which routes it to OpenAI. Confirm
  that is acceptable under your data-protection obligations before using this for
  anything confidential, and note the confidentiality selector on the form is a
  label on the document, not an access control.
- **The session cookie** is HttpOnly, SameSite=Lax and Secure in production, and
  never leaves the frontend origin — the frontend's `/api/*` rewrite proxies to
  the backend server-side, so the browser only ever talks to one host.
- **Rate limits** are per IP and stored in Postgres, so they survive restarts and
  hold across replicas. IPs are hashed before storage.
