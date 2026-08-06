'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronDown, Sparkles, Wand2 } from 'lucide-react';

import {
  Button,
  Card,
  Field,
  Kicker,
  Notice,
  Select,
  TextArea,
  TextInput,
} from '@/components/ui';
import { Dropzone } from './Dropzone';
import {
  CONFIDENTIALITY_LEVELS,
  DEPARTMENT_LIST,
  MEETING_TYPES,
  getDepartment,
} from '@/lib/departments';
import {
  DEFAULT_BRIEF_INPUTS,
  todayIso,
  type BriefInputs,
} from '@/lib/brief-inputs';
import { HUES } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * The generate screen.
 *
 * Progressive disclosure by design: file + department + date are all that is
 * required, and every quality-improving field lives behind one disclosure so the
 * default path stays a drop-and-press. The fields that matter most (roster,
 * glossary) are named for what they fix, not for what they are.
 */

interface CreateResponse {
  ok: true;
  data: { id: string; warnings: string[] };
}

interface ErrorResponse {
  ok: false;
  error: { code: string; message: string; detail?: string; retryAfterSeconds?: number };
}

const STAGES = [
  'Reading the transcript',
  'Identifying speakers and workstreams',
  'Extracting decisions, owners and dates',
  'Checking every figure against the source',
  'Laying out the document',
] as const;

export function NewBriefForm({ maxUploadMb }: { maxUploadMb: number }) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [inputs, setInputs] = useState<BriefInputs>({
    ...DEFAULT_BRIEF_INPUTS,
    meetingDate: todayIso(),
  });
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<ErrorResponse['error'] | null>(null);

  const hasDepartment = inputs.departments.length > 0;

  // The first selected department is primary: it drives the theme, footer code
  // and which library filter the finished brief is filed under. Nothing is
  // pre-selected, so this falls back to a neutral default purely for styling
  // (accent color, placeholders) until the user picks one.
  const department = useMemo(
    () => getDepartment(inputs.departments[0] ?? 'course-development'),
    [inputs.departments],
  );
  const accent = HUES[department.hue];

  function set<K extends keyof BriefInputs>(key: K, value: BriefInputs[K]) {
    setInputs((previous) => ({ ...previous, [key]: value }));
  }

  function toggleDepartment(id: BriefInputs['departments'][number]) {
    setInputs((previous) => {
      const selected = previous.departments.includes(id);
      return {
        ...previous,
        departments: selected
          ? previous.departments.filter((d) => d !== id)
          : [...previous.departments, id],
      };
    });
  }

  async function submit() {
    if (!file || !hasDepartment || busy) return;
    setBusy(true);
    setError(null);
    setStage(0);

    // The stage list is indicative progress, not measured progress. It advances
    // on a timer and stops at the last stage until the request resolves.
    const ticker = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 7_000);

    try {
      const body = new FormData();
      body.append('transcript', file);
      body.append('inputs', JSON.stringify(inputs));

      const response = await fetch('/api/briefs', { method: 'POST', body });
      const payload = (await response.json()) as CreateResponse | ErrorResponse;

      if (!response.ok || !payload.ok) {
        setError(
          'error' in payload
            ? payload.error
            : { code: 'UNKNOWN', message: 'Generation failed. Try again.' },
        );
        setBusy(false);
        return;
      }

      router.push(`/brief/${payload.data.id}`);
    } catch {
      setError({
        code: 'NETWORK',
        message:
          'The connection dropped before the brief came back. Nothing was saved — try again.',
      });
      setBusy(false);
    } finally {
      clearInterval(ticker);
    }
  }

  return (
    /*
     * The action bar is sticky, so it overlays whatever is beneath it. The bottom
     * padding guarantees the last card can always be scrolled clear of it.
     */
    <div className="space-y-5 pb-28 sm:pb-24">
      {/* ---------------- Upload ---------------- */}
      <Card className="p-5">
        <Kicker>Step 1 · Transcript</Kicker>
        <div className="mt-3">
          <Dropzone file={file} onChange={setFile} maxMb={maxUploadMb} disabled={busy} />
        </div>
      </Card>

      {/* ---------------- Department + basics ---------------- */}
      <Card className="p-5">
        <Kicker>Step 2 · Whose meeting was it?</Kicker>

        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-400">
          Select one or more. The first one you pick is primary — it sets the
          document's theme and footer code.
        </p>

        {/*
          Real checkbox inputs behind styled labels rather than buttons with
          role="checkbox". Native checkboxes bring keyboard support and form
          semantics for free; ARIA-only checkboxes would need all of that
          hand-written and would be a keyboard trap without it.
        */}
        <fieldset
          className="mt-3 grid grid-cols-2 gap-2 border-0 p-0 sm:grid-cols-4"
          disabled={busy}
        >
          <legend className="sr-only">Departments</legend>
          {DEPARTMENT_LIST.map((dept) => {
            const selected = inputs.departments.includes(dept.id);
            const isPrimary = selected && inputs.departments[0] === dept.id;
            const tokens = HUES[dept.hue];
            return (
              <label
                key={dept.id}
                className={cn(
                  'flex min-h-[74px] cursor-pointer flex-col items-start justify-between rounded-xl border p-3 transition-all',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-900',
                  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
                  selected
                    ? 'border-transparent bg-ink-900 shadow-[0_8px_24px_-14px_rgba(15,6,22,0.6)]'
                    : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50',
                )}
              >
                <input
                  type="checkbox"
                  name="departments"
                  value={dept.id}
                  checked={selected}
                  onChange={() => toggleDepartment(dept.id)}
                  className="sr-only"
                />
                <span className="flex w-full items-start justify-between gap-1">
                  <span
                    aria-hidden
                    className="h-[3px] w-7 rounded-full"
                    style={{ background: tokens.hex.mid }}
                  />
                  {isPrimary ? (
                    <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/70">
                      Primary
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 w-full">
                  <span
                    className={cn(
                      'block text-[12.5px] font-bold leading-tight',
                      selected ? 'text-white' : 'text-ink-800',
                    )}
                  >
                    {dept.name}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.1em]',
                      selected ? 'text-white/60' : 'text-ink-400',
                    )}
                  >
                    {dept.code}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {hasDepartment ? (
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-400">
            {department.blurb}
          </p>
        ) : (
          <p className="mt-2.5 text-[12px] font-medium leading-relaxed text-red-700">
            Select at least one department.
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Meeting date" htmlFor="meetingDate">
            <TextInput
              id="meetingDate"
              type="date"
              value={inputs.meetingDate}
              max="2100-12-31"
              disabled={busy}
              onChange={(e) => set('meetingDate', e.target.value)}
            />
          </Field>

          <Field label="Meeting type" htmlFor="meetingType">
            <Select
              id="meetingType"
              value={inputs.meetingType}
              disabled={busy}
              onChange={(e) => set('meetingType', e.target.value)}
            >
              {MEETING_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Title"
            htmlFor="meetingTitle"
            optional
            hint="Blank = Derived from the transcript."
            hintPosition="below"
          >
            <TextInput
              id="meetingTitle"
              value={inputs.meetingTitle}
              maxLength={120}
              disabled={busy}
              placeholder={`e.g. ${department.code} Weekly Sync`}
              onChange={(e) => set('meetingTitle', e.target.value)}
            />
          </Field>

          <Field label="Chaired by" htmlFor="chair" optional>
            <TextInput
              id="chair"
              value={inputs.chair}
              maxLength={80}
              disabled={busy}
              placeholder="Sophia Turner"
              onChange={(e) => set('chair', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------- Optional context ---------------- */}
      <Card>
        <button
          type="button"
          onClick={() => setShowContext((v) => !v)}
          aria-expanded={showContext}
          aria-controls="context-panel"
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <Wand2 className="size-4 shrink-0 text-ink-400" aria-hidden />
              <span className="text-[15px] font-bold text-ink-900">
                Add context to sharpen the brief
              </span>
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-400">
              Optional. The attendee list fixes name spellings and job titles; the
              glossary fixes product names the transcriber mangled.
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-ink-400 transition-transform',
              showContext && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        {showContext ? (
          <div id="context-panel" className="space-y-4 border-t border-ink-100 px-5 py-5">
            <Field
              label="Attendees and their roles"
              htmlFor="roster"
              optional
              hint="One person per line, as “Name — Job title”. This is the single biggest quality lift: it fixes spellings and fills the role line on every owner card."
            >
              <TextArea
                id="roster"
                rows={5}
                value={inputs.roster}
                maxLength={4_000}
                disabled={busy}
                onChange={(e) => set('roster', e.target.value)}
                placeholder={'Emma Wilson - Human Resources\nLiam Carter - Information Technology\nOlivia Bennett - Finance\nNoah Brooks - Marketing'}
              />
            </Field>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field
                label="Projects, systems and acronyms"
                htmlFor="glossary"
                optional
                hint="Comma separated. Corrects anything the transcriber misheard."
              >
                <TextArea
                  id="glossary"
                  rows={3}
                  value={inputs.glossary}
                  maxLength={2_000}
                  disabled={busy}
                  onChange={(e) => set('glossary', e.target.value)}
                  placeholder="ITIL5, Aspirex, SLC, Freepik, After Effects, Hejin"
                />
              </Field>

              <Field
                label="Anyone absent"
                htmlFor="absentees"
                optional
                hint="Named but not present. Kept out of the attendee list."
              >
                <TextArea
                  id="absentees"
                  rows={3}
                  value={inputs.absentees}
                  maxLength={600}
                  disabled={busy}
                  onChange={(e) => set('absentees', e.target.value)}
                  placeholder="Sophia Turner"
                />
              </Field>

              <Field
                label="Emphasise"
                htmlFor="focus"
                optional
                hint="What the reader most needs to see."
              >
                <TextArea
                  id="focus"
                  rows={3}
                  value={inputs.focus}
                  maxLength={1_000}
                  disabled={busy}
                  onChange={(e) => set('focus', e.target.value)}
                  placeholder="Lead on anything blocking delivery this week."
                />
              </Field>

              <Field
                label="Leave out"
                htmlFor="exclusions"
                optional
                hint="Topics to omit entirely."
              >
                <TextArea
                  id="exclusions"
                  rows={3}
                  value={inputs.exclusions}
                  maxLength={1_000}
                  disabled={busy}
                  onChange={(e) => set('exclusions', e.target.value)}
                  placeholder="Salary discussion at the end. Personal chat."
                />
              </Field>
            </div>

            <Field
              label="Carry-over from last time"
              htmlFor="previousContext"
              optional
              hint="Background only — it is never quoted as though it were said today."
            >
              <TextArea
                id="previousContext"
                rows={3}
                value={inputs.previousContext}
                maxLength={2_000}
                disabled={busy}
                onChange={(e) => set('previousContext', e.target.value)}
                placeholder="Last week: prospectus was due Friday and slipped; e-book count was 28."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Who may read it"
                htmlFor="confidentiality"
                hint="Printed in the header and footer."
              >
                <Select
                  id="confidentiality"
                  value={inputs.confidentiality}
                  disabled={busy}
                  onChange={(e) => set('confidentiality', e.target.value)}
                >
                  {CONFIDENTIALITY_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name} — {level.blurb}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        ) : null}
      </Card>

      {/* ---------------- Errors ---------------- */}
      {error ? (
        <Notice tone="error" title={errorTitle(error.code)}>
          <p>{error.message}</p>
          {error.detail ? (
            <p className="mt-1.5 font-mono text-[11px] leading-relaxed opacity-70">
              {error.detail}
            </p>
          ) : null}
        </Notice>
      ) : null}

      {/* ---------------- Submit ---------------- */}
      <div className="sticky bottom-4 z-10">
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {busy ? (
              <>
                <p className="text-[13.5px] font-bold text-ink-900">{STAGES[stage]}…</p>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100 sm:w-64"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={STAGES.length}
                  aria-valuenow={stage + 1}
                  aria-label="Generation progress"
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${((stage + 1) / STAGES.length) * 100}%`,
                      background: accent.hex.mid,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-400">
                  Usually 20–40 seconds. Leave this tab open.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13.5px] font-bold text-ink-900">
                  {!file
                    ? 'Add a transcript to continue'
                    : !hasDepartment
                      ? 'Select a department to continue'
                      : 'Ready to generate'}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-400">
                  {hasDepartment ? department.name : 'No department selected'} ·{' '}
                  {inputs.meetingDate || 'no date set'}
                </p>
              </>
            )}
          </div>

          <Button
            size="lg"
            onClick={submit}
            disabled={!file || !hasDepartment}
            busy={busy}
            className="w-full sm:w-auto"
          >
            {busy ? 'Generating…' : (
              <>
                <Sparkles className="size-[18px]" aria-hidden />
                Generate brief
              </>
            )}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function errorTitle(code: string): string {
  if (code.startsWith('TRANSCRIPT_')) return 'That transcript could not be used';
  if (code.startsWith('MODEL_')) return 'The model could not be reached';
  if (code.startsWith('GENERATION_')) return 'The brief could not be built';
  if (code === 'RATE_LIMITED') return 'Hourly limit reached';
  if (code === 'MISCONFIGURED') return 'Server not configured';
  return 'Something went wrong';
}
