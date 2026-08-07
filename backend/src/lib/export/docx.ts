import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';

import type { BriefBundle } from '@/lib/brief-bundle';
import { CONFIDENTIALITY_LEVELS, getBundleDepartments, getDepartment } from '@/lib/departments';
import {
  CALLOUTS,
  CHIPS,
  HUES,
  rotateHue,
  timelineHex,
} from '@/lib/theme';
import { formatDuration } from '@/lib/transcript/cues';
import { sharePctLabel } from '@/lib/transcript/stats';
import { formatTimestamp } from '@/lib/utils';

/**
 * DOCX export.
 *
 * Word cannot reproduce the HTML document exactly — no gradients, no rounded
 * corners, no flex layout. The goal here is a faithful, *editable* translation:
 * the same information in the same order, with the same colour language, built
 * from real Word constructs (tables, shading, headings) so a department can amend
 * it before circulating.
 *
 * Sizes are half-points, per the OOXML spec: `size: 22` is 11pt.
 */

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;

const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
} as const;

const INK = {
  darkest: '0B0616',
  dark: '170E28',
  body: '3A2D54',
  muted: '665689',
  faint: '8778A8',
  hair: 'E8E4F2',
} as const;

const FONT = 'Inter';
/** Fallback chain Word applies when Inter is not installed on the machine. */
const FONT_FALLBACK = 'Calibri';

function pageWidthTwip(): number {
  // A4 210mm less 14mm margins each side.
  return convertMillimetersToTwip(210 - 28);
}

/* ------------------------------------------------------------------------- */
/* Small builders                                                            */
/* ------------------------------------------------------------------------- */

interface RunOptions {
  bold?: boolean;
  size?: number;
  color?: string;
  caps?: boolean;
  italics?: boolean;
  shadingFill?: string;
  spacingTwip?: number;
}

function run(text: string, options: RunOptions = {}): TextRun {
  const {
    bold = false,
    size = 20,
    color = INK.body,
    caps = false,
    italics = false,
    shadingFill,
    spacingTwip,
  } = options;

  return new TextRun({
    text,
    bold,
    italics,
    size,
    color,
    allCaps: caps,
    font: { name: FONT, hint: 'default' },
    ...(shadingFill
      ? { shading: { type: ShadingType.CLEAR, fill: shadingFill, color: 'auto' } }
      : {}),
    ...(spacingTwip ? { characterSpacing: spacingTwip } : {}),
  });
}

function para(
  children: TextRun[],
  options: {
    spacingBefore?: number;
    spacingAfter?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    indentLeft?: number;
    shadingFill?: string;
    keepNext?: boolean;
    lineRule?: number;
  } = {},
): Paragraph {
  return new Paragraph({
    children,
    alignment: options.align,
    keepNext: options.keepNext,
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 80,
      line: options.lineRule ?? 276,
    },
    ...(options.indentLeft ? { indent: { left: options.indentLeft } } : {}),
    ...(options.shadingFill
      ? { shading: { type: ShadingType.CLEAR, fill: options.shadingFill, color: 'auto' } }
      : {}),
  });
}

function eyebrow(text: string, color: string): Paragraph {
  return para([run(text, { bold: true, size: 15, color, caps: true, spacingTwip: 30 })], {
    spacingAfter: 60,
    keepNext: true,
  });
}

function sectionHeading(text: string, color: string): Paragraph {
  return new Paragraph({
    children: [
      run('▌ ', { bold: true, size: 26, color }),
      run(text, { bold: true, size: 26, color: INK.dark }),
    ],
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 360, after: 140 },
  });
}

/** A single-cell shaded panel, used for the hero and the "do first" block. */
function panel(
  children: Paragraph[],
  fill: string,
  options: { accentTop?: string } = {},
): Table {
  const rows: TableRow[] = [];

  if (options.accentTop) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [], spacing: { before: 0, after: 0 } })],
            shading: { type: ShadingType.CLEAR, fill: options.accentTop, color: 'auto' },
            margins: { top: 20, bottom: 20, left: 0, right: 0 },
            borders: NO_BORDERS,
          }),
        ],
        height: { value: 60, rule: 'exact' },
      }),
    );
  }

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          children,
          shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
          margins: { top: 200, bottom: 200, left: 240, right: 240 },
          borders: NO_BORDERS,
        }),
      ],
    }),
  );

  return new Table({
    rows,
    width: { size: pageWidthTwip(), type: WidthType.DXA },
    borders: NO_BORDERS,
    layout: 'fixed',
  });
}

/* ------------------------------------------------------------------------- */
/* Sections                                                                  */
/* ------------------------------------------------------------------------- */

function heroBlock(bundle: BriefBundle, confidentialityLabel: string): Table {
  const { brief } = bundle;
  // Primary department seeds the accent colour; every selected department is
  // named in full in the eyebrow line.
  const departments = getBundleDepartments(bundle);
  const department = departments[0];
  const accent = HUES[department.hue].hex.mid.replace('#', '');
  const departmentNames = departments.map((d) => d.name).join(' · ');

  const children: Paragraph[] = [
    para(
      [
        run(`Action Brief · ${departmentNames}`, {
          bold: true,
          size: 15,
          color: accent,
          caps: true,
          spacingTwip: 30,
        }),
      ],
      { spacingAfter: 140 },
    ),
    para([run(brief.title, { bold: true, size: 52, color: 'FFFFFF' })], {
      spacingAfter: 120,
      lineRule: 300,
    }),
  ];

  if (brief.summary) {
    children.push(
      para([run(brief.summary, { size: 21, color: 'D8D2E6' })], { spacingAfter: 140 }),
    );
  }

  const chips = [...brief.metaChips, confidentialityLabel].filter(Boolean);
  if (chips.length > 0) {
    children.push(
      para([run(chips.join('   ·   '), { bold: true, size: 17, color: 'B7ACD0' })], {
        spacingAfter: 0,
      }),
    );
  }

  return panel(children, INK.darkest);
}

function attendeesBlock(bundle: BriefBundle): Paragraph[] {
  const { brief } = bundle;
  const out: Paragraph[] = [];
  if (brief.attendees.length > 0) {
    out.push(
      para(
        [
          run('Attendees: ', { bold: true, size: 18, color: INK.body }),
          run(brief.attendees.join(' · '), { size: 18, color: INK.faint }),
        ],
        { spacingBefore: 240, spacingAfter: 40 },
      ),
    );
  }
  if (brief.absentees.length > 0) {
    out.push(
      para(
        [
          run('Apologies: ', { bold: true, size: 18, color: INK.body }),
          run(brief.absentees.join(' · '), { size: 18, color: INK.faint }),
        ],
        { spacingAfter: 40 },
      ),
    );
  }
  return out;
}

function spotlightBlocks(bundle: BriefBundle): Table[] {
  return bundle.brief.spotlights.map((spotlight) => {
    const tone = CALLOUTS[spotlight.tone];
    return new Table({
      rows: [
        new TableRow({
          children: [
            // Left accent rail.
            new TableCell({
              children: [new Paragraph({ children: [] })],
              shading: { type: ShadingType.CLEAR, fill: tone.hex.rail, color: 'auto' },
              width: { size: 60, type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              borders: NO_BORDERS,
            }),
            new TableCell({
              children: [
                para([run(spotlight.title, { bold: true, size: 21, color: tone.hex.title })], {
                  spacingAfter: 60,
                }),
                para([run(spotlight.body, { size: 19, color: INK.body })], { spacingAfter: 0 }),
              ],
              shading: { type: ShadingType.CLEAR, fill: tone.hex.fill, color: 'auto' },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              borders: NO_BORDERS,
            }),
          ],
        }),
      ],
      width: { size: pageWidthTwip(), type: WidthType.DXA },
      columnWidths: [60, pageWidthTwip() - 60],
      borders: NO_BORDERS,
      layout: 'fixed',
    });
  });
}

function metricsTable(bundle: BriefBundle): Table | null {
  const metrics = bundle.brief.metrics;
  if (metrics.length === 0) return null;
  const seed = getDepartment(bundle.department).hue;
  const total = pageWidthTwip();
  const each = Math.floor(total / metrics.length);
  const widths = metrics.map(() => each);

  const accentRow = new TableRow({
    children: metrics.map((_, index) => {
      const accent = HUES[rotateHue(index, seed)].hex.mid.replace('#', '');
      return new TableCell({
        children: [new Paragraph({ children: [], spacing: { before: 0, after: 0 } })],
        shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
        width: { size: each, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: NO_BORDERS,
      });
    }),
    height: { value: 60, rule: 'exact' },
  });

  const bodyRow = new TableRow({
    children: metrics.map((metric, index) => {
      const accent = HUES[rotateHue(index, seed)].hex.deep.replace('#', '');
      return new TableCell({
        children: [
          para([run(metric.value, { bold: true, size: 40, color: INK.dark })], {
            align: AlignmentType.CENTER,
            spacingAfter: 60,
          }),
          para([run(metric.label, { bold: true, size: 15, color: accent })], {
            align: AlignmentType.CENTER,
            spacingAfter: 0,
          }),
        ],
        shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' },
        width: { size: each, type: WidthType.DXA },
        margins: { top: 160, bottom: 160, left: 80, right: 80 },
        verticalAlign: VerticalAlign.TOP,
        borders: {
          ...NO_BORDERS,
          right:
            index === metrics.length - 1
              ? NO_BORDER
              : { style: BorderStyle.SINGLE, size: 4, color: INK.hair },
        },
      });
    }),
  });

  return new Table({
    rows: [accentRow, bodyRow],
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    borders: NO_BORDERS,
    layout: 'fixed',
  });
}

/** Non-breaking space: keeps a chip's padding and glyph attached to its text. */
const NBSP = '\u00A0';

function chipParagraph(
  chips: { kind: keyof typeof CHIPS; text: string }[],
  indentLeft: number,
): Paragraph | null {
  if (chips.length === 0) return null;
  const runs: TextRun[] = [];
  chips.forEach((c, index) => {
    const tokens = CHIPS[c.kind];
    if (index > 0) runs.push(run('  ', { size: 16 }));
    // The leading pad, glyph and first word are bound together so Word can never
    // leave a lone shaded glyph dangling at the end of a line.
    runs.push(
      run(`${NBSP}${tokens.glyph}${NBSP}${c.text}${NBSP}`, {
        bold: true,
        size: 16,
        color: tokens.hex.text,
        shadingFill: tokens.hex.fill,
      }),
    );
  });
  return para(runs, { indentLeft, spacingAfter: 120, spacingBefore: 40 });
}

function trackBlocks(bundle: BriefBundle): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const department = getDepartment(bundle.department);
  const seed = department.hue;

  bundle.brief.tracks.forEach((track, trackIndex) => {
    const tokens = HUES[rotateHue(trackIndex, seed)];
    const accent = tokens.hex.base.replace('#', '');

    out.push(
      new Paragraph({
        children: [
          run(`  TRACK ${track.code}  `, {
            bold: true,
            size: 15,
            color: 'FFFFFF',
            shadingFill: accent,
            caps: true,
            spacingTwip: 24,
          }),
          run('   ', { size: 15 }),
          run(track.title, { bold: true, size: 26, color: INK.dark }),
        ],
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        spacing: { before: 360, after: 60 },
      }),
    );

    if (track.leads.length > 0) {
      out.push(
        para([run(`Led by ${track.leads.join(' · ')}`, { size: 17, color: INK.faint })], {
          spacingAfter: 140,
          keepNext: true,
        }),
      );
    }

    track.items.forEach((item, itemIndex) => {
      const ownerTag =
        item.owners.length > 0
          ? `${department.code} · ${item.owners.join(' · ')}`
          : department.code;

      out.push(
        para(
          [
            run(`${String(itemIndex + 1).padStart(2, '0')}  `, {
              bold: true,
              size: 24,
              color: accent,
            }),
            run(item.title, { bold: true, size: 23, color: INK.dark }),
          ],
          { spacingBefore: 180, spacingAfter: 40, keepNext: true },
        ),
      );

      out.push(
        para([run(ownerTag, { bold: true, size: 14, color: accent, caps: true, spacingTwip: 24 })], {
          indentLeft: 300,
          spacingAfter: 60,
          keepNext: true,
        }),
      );

      out.push(
        para([run(item.body, { size: 19, color: INK.body })], {
          indentLeft: 300,
          spacingAfter: 60,
        }),
      );

      const chips = chipParagraph(item.chips, 300);
      if (chips) out.push(chips);
    });
  });

  return out;
}

function decisionsAndRisks(bundle: BriefBundle): (Paragraph | Table)[] {
  const { brief } = bundle;
  const seed = getDepartment(bundle.department).hue;
  const accent = HUES[seed].hex.base.replace('#', '');
  if (brief.decisions.length === 0 && brief.risks.length === 0) return [];

  const out: (Paragraph | Table)[] = [sectionHeading('Decisions & Risks', accent)];

  if (brief.decisions.length > 0) {
    out.push(eyebrow('Decided', '6D28D9'));
    for (const decision of brief.decisions) {
      const label =
        decision.status === 'agreed'
          ? { text: 'AGREED', fill: 'F0FDFA', color: '0F766E' }
          : decision.status === 'deferred'
            ? { text: 'DEFERRED', fill: 'FFFBEB', color: 'B45309' }
            : { text: 'REJECTED', fill: 'FEF2F2', color: '991B1B' };
      out.push(
        para(
          [
            run(`  ${label.text}  `, {
              bold: true,
              size: 14,
              color: label.color,
              shadingFill: label.fill,
            }),
            run('  ', { size: 18 }),
            run(decision.text, { size: 19, color: INK.body }),
            ...(decision.owner ? [run(` — ${decision.owner}`, { size: 19, color: INK.faint })] : []),
          ],
          { spacingAfter: 80 },
        ),
      );
    }
  }

  if (brief.risks.length > 0) {
    out.push(eyebrow('Risks & Blockers', 'BE123C'));
    for (const risk of brief.risks) {
      const label =
        risk.severity === 'high'
          ? { text: 'HIGH', fill: 'FEF2F2', color: '991B1B' }
          : risk.severity === 'medium'
            ? { text: 'MEDIUM', fill: 'FFFBEB', color: 'B45309' }
            : { text: 'LOW', fill: 'F1F5F9', color: '334155' };
      out.push(
        para(
          [
            run(`  ${label.text}  `, {
              bold: true,
              size: 14,
              color: label.color,
              shadingFill: label.fill,
            }),
            run('  ', { size: 18 }),
            run(risk.text, { size: 19, color: INK.body }),
            ...(risk.owner ? [run(` — ${risk.owner}`, { size: 19, color: INK.faint })] : []),
          ],
          { spacingAfter: 80 },
        ),
      );
    }
  }

  if (brief.openQuestions.length > 0) {
    out.push(eyebrow('Open Questions', INK.muted));
    for (const question of brief.openQuestions) {
      out.push(
        new Paragraph({
          children: [run(question, { size: 19, color: INK.body })],
          bullet: { level: 0 },
          spacing: { after: 60, line: 276 },
        }),
      );
    }
  }

  return out;
}

function directionBlock(bundle: BriefBundle): (Paragraph | Table)[] {
  const direction = bundle.brief.direction;
  if (!direction) return [];
  const seed = getDepartment(bundle.department).hue;
  const accent = HUES[seed].hex.mid.replace('#', '');

  const children: Paragraph[] = [
    para([run(direction.eyebrow, { bold: true, size: 15, color: accent, caps: true, spacingTwip: 30 })], {
      spacingAfter: 80,
    }),
    para([run(direction.title, { bold: true, size: 24, color: INK.dark })], {
      spacingAfter: 140,
    }),
  ];

  for (const bullet of direction.bullets) {
    children.push(
      para(
        [
          run('›  ', { bold: true, size: 20, color: accent }),
          ...(bullet.lead ? [run(`${bullet.lead} `, { bold: true, size: 19, color: INK.dark })] : []),
          run(bullet.text, { size: 19, color: INK.body }),
        ],
        { spacingAfter: 80 },
      ),
    );
  }

  return [panel(children, 'FFFFFF', { accentTop: accent })];
}

function doFirstBlock(bundle: BriefBundle): Table[] {
  const entries = bundle.brief.doFirst;
  if (entries.length === 0) return [];

  const children: Paragraph[] = [
    para([run('Do First · Most Time-Bound Items', { bold: true, size: 15, color: 'FB923C', caps: true, spacingTwip: 30 })], {
      spacingAfter: 80,
    }),
    para([run('To action immediately', { bold: true, size: 24, color: 'FFFFFF' })], {
      spacingAfter: 140,
    }),
  ];

  entries.forEach((entry, index) => {
    children.push(
      para(
        [
          run(`  ${index + 1}  `, { bold: true, size: 16, color: 'FFFFFF', shadingFill: 'F97316' }),
          run('  ', { size: 19 }),
          ...(entry.owner ? [run(`${entry.owner} — `, { bold: true, size: 19, color: 'FFFFFF' })] : []),
          run(entry.action, { size: 19, color: 'D8D2E6' }),
        ],
        { spacingAfter: 100 },
      ),
    );
  });

  return [panel(children, '1F1338')];
}

function ownersTable(bundle: BriefBundle): (Paragraph | Table)[] {
  const { brief } = bundle;
  const seed = getDepartment(bundle.department).hue;
  const accent = HUES[seed].hex.base.replace('#', '');
  if (brief.owners.length === 0 && !brief.ownersNote) return [];

  const out: (Paragraph | Table)[] = [sectionHeading('Who’s Owning What', accent)];

  if (brief.owners.length > 0) {
    const half = Math.floor(pageWidthTwip() / 2);
    const rows: TableRow[] = [];

    for (let i = 0; i < brief.owners.length; i += 2) {
      const pair = [brief.owners[i], brief.owners[i + 1]];
      rows.push(
        new TableRow({
          cantSplit: true,
          children: pair.map((owner) => {
            if (!owner) {
              return new TableCell({
                children: [new Paragraph({ children: [] })],
                width: { size: half, type: WidthType.DXA },
                borders: NO_BORDERS,
              });
            }
            return new TableCell({
              children: [
                para(
                  [run(owner.name, { bold: true, size: 21, color: INK.dark })],
                  { spacingAfter: 40 },
                ),
                ...(owner.role
                  ? [
                      para([run(owner.role, { bold: true, size: 15, color: INK.faint })], {
                        spacingAfter: 60,
                      }),
                    ]
                  : []),
                para([run(owner.assignment, { size: 18, color: INK.body })], {
                  spacingAfter: 0,
                }),
              ],
              width: { size: half, type: WidthType.DXA },
              margins: { top: 140, bottom: 140, left: 120, right: 160 },
              verticalAlign: VerticalAlign.TOP,
              borders: {
                ...NO_BORDERS,
                bottom: { style: BorderStyle.SINGLE, size: 4, color: INK.hair },
              },
            });
          }),
        }),
      );
    }

    out.push(
      new Table({
        rows,
        width: { size: pageWidthTwip(), type: WidthType.DXA },
        columnWidths: [half, half],
        borders: NO_BORDERS,
        layout: 'fixed',
      }),
    );
  }

  if (brief.ownersNote) {
    out.push(
      para([run(brief.ownersNote, { size: 18, color: INK.faint })], {
        spacingBefore: 160,
        spacingAfter: 0,
      }),
    );
  }

  return out;
}

function timelineTable(bundle: BriefBundle): (Paragraph | Table)[] {
  const steps = bundle.brief.timeline;
  if (steps.length === 0) return [];
  const seed = getDepartment(bundle.department).hue;
  const accent = HUES[seed].hex.base.replace('#', '');
  const each = Math.floor(pageWidthTwip() / steps.length);

  const accentRow = new TableRow({
    children: steps.map((_, index) => {
      return new TableCell({
        children: [new Paragraph({ children: [], spacing: { before: 0, after: 0 } })],
        shading: { type: ShadingType.CLEAR, fill: timelineHex(index), color: 'auto' },
        width: { size: each, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: NO_BORDERS,
      });
    }),
    height: { value: 60, rule: 'exact' },
  });

  const bodyRow = new TableRow({
    cantSplit: true,
    children: steps.map((step, index) => {
      return new TableCell({
        children: [
          para([run(step.when, { bold: true, size: 21, color: INK.dark })], {
            align: AlignmentType.CENTER,
            spacingAfter: 60,
          }),
          para([run(step.what, { size: 17, color: INK.muted })], {
            align: AlignmentType.CENTER,
            spacingAfter: 50,
          }),
          ...(step.who.length > 0
            ? [
                para(
                  [run(step.who.join(' · '), { bold: true, size: 15, color: timelineHex(index) })],
                  { align: AlignmentType.CENTER, spacingAfter: 0 },
                ),
              ]
            : []),
        ],
        width: { size: each, type: WidthType.DXA },
        margins: { top: 140, bottom: 140, left: 60, right: 60 },
        verticalAlign: VerticalAlign.TOP,
        borders: NO_BORDERS,
      });
    }),
  });

  return [
    sectionHeading('Deadlines & Next Steps', accent),
    new Table({
      rows: [accentRow, bodyRow],
      width: { size: pageWidthTwip(), type: WidthType.DXA },
      columnWidths: steps.map(() => each),
      borders: NO_BORDERS,
      layout: 'fixed',
    }),
  ];
}

function participationTable(bundle: BriefBundle): (Paragraph | Table)[] {
  const speakers = bundle.transcript.speakers.slice(0, 14);
  if (speakers.length < 2) return [];
  const seed = getDepartment(bundle.department).hue;
  const accent = HUES[seed].hex.base.replace('#', '');
  const max = Math.max(...speakers.map((s) => s.sharePct), 1);

  const nameW = Math.floor(pageWidthTwip() * 0.3);
  const barW = Math.floor(pageWidthTwip() * 0.48);
  const pctW = Math.floor(pageWidthTwip() * 0.11);
  const turnW = pageWidthTwip() - nameW - barW - pctW;

  const rows = speakers.map((speaker, index) => {
    const hex = HUES[rotateHue(index, seed)].hex.mid.replace('#', '');
    // Block characters give a real bar in Word without needing a chart part.
    const blocks = Math.max(1, Math.round((speaker.sharePct / max) * 28));
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          children: [para([run(speaker.name, { bold: true, size: 18, color: INK.body })], { spacingAfter: 0 })],
          width: { size: nameW, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 0, right: 80 },
          borders: NO_BORDERS,
        }),
        new TableCell({
          children: [para([run('█'.repeat(blocks), { size: 16, color: hex })], { spacingAfter: 0 })],
          width: { size: barW, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 0, right: 80 },
          verticalAlign: VerticalAlign.CENTER,
          borders: NO_BORDERS,
        }),
        new TableCell({
          children: [
            para([run(sharePctLabel(speaker.sharePct), { bold: true, size: 17, color: INK.body })], {
              align: AlignmentType.RIGHT,
              spacingAfter: 0,
            }),
          ],
          width: { size: pctW, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 0, right: 80 },
          borders: NO_BORDERS,
        }),
        new TableCell({
          children: [
            para([run(`${speaker.turns} turns`, { size: 16, color: INK.faint })], {
              align: AlignmentType.RIGHT,
              spacingAfter: 0,
            }),
          ],
          width: { size: turnW, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 0, right: 0 },
          borders: NO_BORDERS,
        }),
      ],
    });
  });

  const facts = bundle.transcript;
  return [
    sectionHeading('Participation — Measured from the Transcript', accent),
    para(
      [
        run(
          `${facts.speakers.length} speakers · ${facts.totalCues} turns · ${new Intl.NumberFormat(
            'en-GB',
          ).format(facts.totalWords)} words · ${formatDuration(facts.durationMs)} of dialogue`,
          { bold: true, size: 18, color: INK.muted },
        ),
      ],
      { spacingAfter: 120 },
    ),
    new Table({
      rows,
      width: { size: pageWidthTwip(), type: WidthType.DXA },
      columnWidths: [nameW, barW, pctW, turnW],
      borders: NO_BORDERS,
      layout: 'fixed',
    }),
    para(
      [
        run(
          'Share of spoken words per person, counted directly from the transcript. Not an indicator of contribution quality.',
          { size: 15, color: INK.faint, italics: true },
        ),
      ],
      { spacingBefore: 100, spacingAfter: 0 },
    ),
  ];
}

/**
 * Closing footer block, matching `DocFooter` (the shared PDF/preview
 * component) rather than a Word-only "provenance" panel: a department/title/
 * date bar over an org/confidentiality/disclaimer bar.
 */
function docFooterBlock(
  bundle: BriefBundle,
  orgName: string,
  confidentialityLabel: string,
  departmentCodes: string,
): Table[] {
  const { brief } = bundle;
  const generatedLabel = `Generated ${formatTimestamp(bundle.generatedAt)}`;

  const topRun = [
    run(`${departmentCodes}`, { bold: true, size: 15, color: 'FFFFFF' }),
    run(` · ${brief.title} · ${brief.dateLabel}`, { size: 15, color: 'BEB2DE' }),
  ];
  if (brief.footerTags.length > 0) {
    topRun.push(run(`   ${brief.footerTags.join('   ·   ')}`, { size: 13, color: 'D8CEF0' }));
  }

  const topBar = panel([para(topRun, { spacingAfter: 0 })], INK.dark);
  const bottomBar = panel(
    [
      para(
        [
          run(
            `${orgName} · ${confidentialityLabel} · ${generatedLabel}. Written by an AI model ` +
              'from the meeting transcript and checked against it automatically. Verify anything ' +
              'consequential against the recording before acting on it. Relative dates ' +
              `("today", "tomorrow", "ASAP") are as stated in the meeting on ${brief.dateLabel}.`,
            { size: 15, color: '9C8FC2' },
          ),
        ],
        { spacingAfter: 0 },
      ),
    ],
    INK.darkest,
  );

  return [topBar, bottomBar];
}

/* ------------------------------------------------------------------------- */
/* Document                                                                  */
/* ------------------------------------------------------------------------- */

export async function renderDocx(bundle: BriefBundle, orgName: string): Promise<Buffer> {
  const departments = getBundleDepartments(bundle);
  const department = departments[0];
  const departmentCodes = departments.map((d) => d.code).join('/');
  const confidentiality =
    CONFIDENTIALITY_LEVELS.find((c) => c.id === bundle.confidentiality)?.name ?? 'Internal';

  const children: (Paragraph | Table)[] = [
    heroBlock(bundle, confidentiality),
    ...attendeesBlock(bundle),
  ];

  for (const table of spotlightBlocks(bundle)) {
    children.push(para([run('', { size: 12 })], { spacingBefore: 120, spacingAfter: 0 }));
    children.push(table);
  }

  const metrics = metricsTable(bundle);
  if (metrics) {
    children.push(sectionHeading('At a Glance — Numbers', HUES[department.hue].hex.base.replace('#', '')));
    children.push(metrics);
  }

  children.push(...trackBlocks(bundle));
  children.push(...decisionsAndRisks(bundle));
  children.push(...directionBlock(bundle));

  if (bundle.brief.doFirst.length > 0) {
    children.push(para([run('', { size: 12 })], { spacingBefore: 240, spacingAfter: 0 }));
    children.push(...doFirstBlock(bundle));
  }

  children.push(...ownersTable(bundle));
  children.push(...timelineTable(bundle));
  children.push(...participationTable(bundle));

  children.push(para([run('', { size: 12 })], { spacingBefore: 320, spacingAfter: 0 }));
  children.push(...docFooterBlock(bundle, orgName, confidentiality, departmentCodes));

  const doc = new Document({
    creator: orgName,
    title: `${bundle.brief.title} — ${bundle.brief.dateLabel}`,
    description: bundle.brief.summary,
    styles: {
      default: {
        document: {
          run: { font: { name: FONT, hint: 'default' }, size: 20, color: INK.body },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(14),
              right: convertMillimetersToTwip(14),
              bottom: convertMillimetersToTwip(16),
              left: convertMillimetersToTwip(14),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 0 },
                children: [
                  run(
                    `${departmentCodes} · ${bundle.brief.title} · ${bundle.brief.dateLabel}  —  page `,
                    { size: 15, color: INK.faint },
                  ),
                  new TextRun({
                    children: [PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                    size: 15,
                    color: INK.faint,
                    font: { name: FONT_FALLBACK, hint: 'default' },
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
