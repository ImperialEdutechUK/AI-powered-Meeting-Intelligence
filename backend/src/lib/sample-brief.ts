import { BUNDLE_VERSION, type BriefBundle } from './brief-bundle';

/**
 * A worked example, used by the `/example` route and by the render tests.
 *
 * The content mirrors the reference document supplied with the original brief so
 * the layout can be compared side by side, and so a new user can see what a
 * finished brief looks like before uploading anything.
 */
export const SAMPLE_BUNDLE: BriefBundle = {
  version: BUNDLE_VERSION,
  department: 'course-development',
  meetingType: 'team',
  confidentiality: 'internal',
  generatedAt: '2026-07-27T08:38:40.000Z',

  brief: {
    title: 'CDD Weekly Sync',
    dateLabel: '27 July 2026',
    summary:
      '27 July 2026 — account suspensions blocking projects, ITIL video approach overhaul, skills UI improvements, e-book milestone, video upload target, and team trip update.',
    metaChips: ['27 July 2026', 'SLC · Aspirex · LMS', 'Chaired by Sadeev Silva'],
    attendees: [
      'Sadeev Silva',
      'Ridma Keshan',
      'Malinda Gunasekara',
      'Malsha Nirmani',
      'Piyumi Shanika',
      'Fathima Rukaiya',
      'Fathima Zahra',
      'Pragatheesh Rajenthiram',
      'Nandika Anupama',
      'Yoga Milona',
      'Pasindu Maddumage',
      'Menuka Ranasinghe',
      'Yenushka Bandara',
    ],
    absentees: [],

    spotlights: [
      {
        tone: 'critical',
        title: 'Account suspensions — blocking multiple projects, Sadeev to resolve today',
        body: 'Google, Freepik and Adobe accounts were suspended in the absence of Ms. Rushan, who manages the payment cards. Sadeev committed to clearing all suspended accounts and overdue subscriptions within the day. Projects that depend on these accounts are on hold until access is restored.',
      },
      {
        tone: 'warning',
        title: 'Team trip — postponed, planning continues',
        body: 'The trip has been delayed because the group could not agree on a location. Sadeev suggested subsidised options or several smaller trips to different provinces. The event planning committee is asked to organise more varied, time-limited activities with competitions and prizes.',
      },
    ],

    metrics: [
      { value: '34', label: 'E-books completed (all marketing + SLC topic 1)' },
      { value: '1,900', label: 'Videos remaining for chapter upload project' },
      { value: '9', label: 'Science videos completed by Malsha' },
      { value: '100+', label: 'Videos per subject — production rate under review' },
      { value: '3', label: 'Accounts suspended (Google, Freepik, Adobe)' },
    ],

    tracks: [
      {
        code: 'A',
        title: 'Design, Content & E-books',
        leads: ['Ridma Keshan', 'Yoga Milona'],
        items: [
          {
            title: 'Prospectus — complete by end of tomorrow once accounts restored',
            owners: ['Ridma'],
            body: 'Two factors caused the delay: heavy image and text materials received recently, and suspended access to Freepik and Google. Once Sadeev restores access today, Ridma commits to completing the prospectus by end of tomorrow, covering the image changes and all QA feedback. Malinda’s QA review flagged mainly English issues such as link embedding and copy-paste errors, with no major content errors.',
            chips: [
              { kind: 'blocked', text: 'Blocked by account suspension' },
              { kind: 'date', text: 'Complete by end of tomorrow' },
              { kind: 'done', text: 'QA — no major content errors' },
              { kind: 'note', text: 'English: link embedding, copy-paste' },
            ],
          },
          {
            title: 'E-books — 34 complete, now working on childcare & early education',
            owners: ['Yoga'],
            body: 'Yoga has completed 34 e-books in total, covering all marketing books and the first major SLC topic. Work is now progressing on the second topic: childcare and early education.',
            chips: [
              { kind: 'done', text: '34 e-books done' },
              { kind: 'done', text: 'All marketing books complete' },
              { kind: 'done', text: 'SLC topic 1 complete' },
              { kind: 'progress', text: 'Now on childcare & early education' },
            ],
          },
        ],
      },
      {
        code: 'B',
        title: 'Video Production & Uploads',
        leads: ['Malsha', 'Piyumi', 'Pragatheesh', 'Pasindu'],
        items: [
          {
            title: 'Science videos — production rate flagged as unsustainable',
            owners: ['Malsha'],
            body: 'Nine science videos are complete with five more targeted. Sadeev raised a concern: at roughly one video per day, against 100+ videos per subject across chemistry and physics, the timeline is impractical. Malsha is to prepare a detailed breakdown of all subjects and progress, recommended as a PowerPoint, to enable proper planning. Diagram software should be taken monthly rather than annually, as the duration of need depends on the ongoing chemistry and physics projects.',
            chips: [
              { kind: 'done', text: '9 videos done' },
              { kind: 'progress', text: '5 more in current target' },
              { kind: 'action', text: 'Provide subject breakdown (PPT)' },
              { kind: 'decision', text: 'Monthly subscription — not annual' },
            ],
          },
          {
            title: 'Chapter-wise video uploads — 1,900 remaining, done by mid-August',
            owners: ['Piyumi', 'Rukaiya'],
            body: 'The team aims to upload the remaining 1,900 videos within three weeks, targeting completion in the second week of August. After each upload, links are rechecked for duplicates: one correct link per chapter, in the correct order. New team members Vimal and Niraj were considered for view-access support but deferred until they gain more experience, to avoid errors.',
            chips: [
              { kind: 'action', text: '1,900 videos remaining' },
              { kind: 'date', text: 'Target: 2nd week of August' },
              { kind: 'done', text: 'QA: duplicate check per chapter' },
              { kind: 'note', text: 'Vimal & Niraj deferred' },
            ],
          },
          {
            title: 'ITIL video production — overhaul approach, use After Effects',
            owners: ['Fathima Zahra', 'Pragatheesh'],
            body: 'Current AI-generated audio quality is unsatisfactory and Hejin’s credit model limits scale. Sadeev’s directive is to move away from static AI avatars and use After Effects to create dynamic, story-driven animated content. Short AI avatar segments may be retained for the intro and outro only. Opus 5 is to be explored as an additional animation tool. A new sample must be produced and submitted for review.',
            chips: [
              { kind: 'action', text: 'New sample required' },
              { kind: 'decision', text: 'After Effects — primary tool' },
              { kind: 'note', text: 'Explore Opus 5' },
              { kind: 'progress', text: 'Hejin credits limited — plan costs' },
            ],
          },
          {
            title: 'Promo videos — landscape format only for phase one',
            owners: ['Pasindu'],
            body: 'Pasindu confirmed the format clarification: only landscape videos are needed for the first round of promo video production. Vertical formats are not required at this stage.',
            chips: [
              { kind: 'done', text: 'Landscape only — confirmed' },
              { kind: 'note', text: 'Vertical — not phase one' },
            ],
          },
        ],
      },
      {
        code: 'C',
        title: 'Skills Intelligence System — UI Improvements',
        leads: ['Nandika', 'Yenushka'],
        items: [
          {
            title: 'UI overhaul — reduce clutter, add dropdowns, consider tutorial screens',
            owners: ['Nandika', 'Yenushka'],
            body: 'The current Skills Intelligence System UI has too much information on screen. Sadeev’s direction: remove repetitive graphs and redundant menus, introduce subcategories and dropdown navigation, and consider onboarding tutorial screens for new users. The goal is a clean, self-explanatory interface that staff will actually use — previous internal systems failed because of complexity.',
            chips: [
              { kind: 'action', text: 'Remove repetitive graphs & menus' },
              { kind: 'action', text: 'Add subcategories & dropdowns' },
              { kind: 'progress', text: 'Tutorial screens — to consider' },
              { kind: 'note', text: 'Goal: zero training needed' },
            ],
          },
        ],
      },
    ],

    direction: {
      eyebrow: 'DIRECTION · ITIL5 VIDEO PRODUCTION STANDARDS',
      title: 'Moving away from static AI avatars — Sadeev’s brief',
      bullets: [
        {
          lead: 'Primary tool:',
          text: 'After Effects for animated, visually engaging content. Avoid static AI avatar presentations as the main format.',
        },
        {
          lead: 'Storytelling:',
          text: 'Convert ITIL5 content into visual stories. Break complex information into digestible segments with clear structure.',
        },
        {
          lead: 'Avatar use:',
          text: 'Short AI avatar clips may appear at the intro and outro only, to add a human element without carrying the full video.',
        },
        {
          lead: 'Alternative tool:',
          text: 'Explore Opus 5 as an additional animation and production option alongside After Effects.',
        },
        {
          lead: 'Platform cost:',
          text: 'Hejin now has a monthly credit cap. Factor cost into all video planning decisions — do not assume unlimited usage.',
        },
        {
          lead: 'Next step:',
          text: 'Produce a new sample using this approach and submit it to Sadeev for review before full production begins.',
        },
      ],
    },

    doFirst: [
      {
        owner: 'Sadeev',
        action:
          'Resolve all suspended accounts (Google, Freepik, Adobe) and confirm subscriptions today so blocked projects can resume.',
      },
      {
        owner: 'Fathima Zahra & Pragatheesh',
        action:
          'Revise the ITIL5 video production approach using After Effects and submit a new sample to Sadeev for review.',
      },
      {
        owner: 'Ridma',
        action:
          'Once accounts are restored, complete the prospectus — image changes plus all QA corrections — by end of tomorrow.',
      },
    ],

    decisions: [
      {
        text: 'Diagram software to be taken on a monthly subscription, not annual.',
        owner: 'Malsha',
        status: 'agreed',
      },
      {
        text: 'Move ITIL5 production away from static AI avatars to After Effects animation.',
        owner: 'Sadeev',
        status: 'agreed',
      },
      {
        text: 'Promo videos: landscape only for phase one; vertical not required.',
        owner: 'Pasindu',
        status: 'agreed',
      },
      {
        text: 'View access for Vimal and Niraj on chapter uploads.',
        owner: 'Piyumi',
        status: 'deferred',
      },
      {
        text: 'Team trip location — no agreement reached, planning continues.',
        owner: 'Menuka',
        status: 'deferred',
      },
    ],

    risks: [
      {
        text: 'Science video timeline is impractical at one video per day against 100+ per subject.',
        severity: 'high',
        owner: 'Malsha',
      },
      {
        text: 'Suspended accounts stall the prospectus and any Freepik-dependent design work.',
        severity: 'high',
        owner: 'Sadeev',
      },
      {
        text: 'Hejin credit cap limits ITIL video scale and makes costs unpredictable.',
        severity: 'medium',
        owner: 'Fathima Zahra',
      },
    ],

    openQuestions: [
      'What is the realistic completion date for chemistry and physics once the subject breakdown is done?',
      'Who covers payment card access when Ms. Rushan is unavailable?',
    ],

    owners: [
      {
        name: 'Sadeev Silva',
        badge: 'MGT',
        role: 'Manager — Innovation & Product Development',
        assignment:
          'Resolve all suspended accounts today; confirm the monthly diagram software subscription; plan the ITIL video budget; review the new ITIL sample.',
      },
      {
        name: 'Ridma Keshan',
        badge: 'DES',
        role: 'Senior Graphic Designer',
        assignment:
          'Complete the prospectus with image changes and all QA corrections by end of tomorrow, once account access is restored.',
      },
      {
        name: 'Malinda Gunasekara',
        badge: 'DEV',
        role: 'Course Development Specialist',
        assignment:
          'QA review for the prospectus is complete (English issues flagged, no major content errors); support Ridma on corrections as needed.',
      },
      {
        name: 'Yoga Milona',
        badge: 'MED',
        role: 'Digital Learning Media Executive',
        assignment:
          'Continue e-book production on childcare and early education (SLC topic 2); 34 books completed to date.',
      },
      {
        name: 'Malsha Nirmani',
        badge: 'MED',
        role: 'Digital Learning Media Executive',
        assignment:
          'Prepare a detailed subject and progress breakdown (PowerPoint) for the science video project; confirm the monthly diagram software subscription.',
      },
      {
        name: 'Piyumi Shanika',
        badge: 'PDX',
        role: 'Product Development Executive',
        assignment:
          'Drive chapter-wise video uploads with Rukaiya; target 1,900 videos by the second week of August; maintain the duplicate-check process per chapter.',
      },
      {
        name: 'Fathima Rukaiya',
        badge: 'INT',
        role: 'Data Entry — Intern',
        assignment:
          'Support Piyumi on video chapter uploads; run QA duplicate checks after each upload batch.',
      },
      {
        name: 'Fathima Zahra',
        badge: 'TL',
        role: 'Team Lead — Product Development & Innovations',
        assignment:
          'Coordinate the ITIL5 video production overhaul with Pragatheesh; ensure the After Effects, story-driven approach is applied and a new sample is submitted.',
      },
      {
        name: 'Pragatheesh Rajenthiram',
        badge: 'VID',
        role: 'Senior Video Editor',
        assignment:
          'Revise the ITIL5 video approach using After Effects and story-driven animation; produce and share the new sample; explore Opus 5.',
      },
      {
        name: 'Pasindu Maddumage',
        badge: 'VID',
        role: 'Senior Video Editor',
        assignment:
          'Produce phase one promo videos in landscape format only; vertical format is not required at this stage.',
      },
      {
        name: 'Nandika Anupama',
        badge: 'AI',
        role: 'Product Development Executive — Agentic AI',
        assignment:
          'Implement Skills Intelligence System UI improvements with Yenushka: remove redundant graphs and menus, add subcategories and dropdowns, consider tutorial screens.',
      },
      {
        name: 'Yenushka Bandara',
        badge: 'INT',
        role: 'Data Entry — Intern',
        assignment:
          'Support Nandika on Skills Intelligence System UI simplification; focus on removing information overload and improving navigation.',
      },
    ],

    ownersNote:
      'Menuka Ranasinghe (EdTech Innovation Executive) updated the team on the trip postponement and sits on the event planning committee. New team members Vimal and Niraj will be considered for video upload support once they have gained sufficient experience.',

    timeline: [
      {
        when: 'Today',
        what: 'All suspended accounts resolved',
        who: ['Sadeev'],
      },
      {
        when: 'Tomorrow',
        what: 'Prospectus finalised (images + QA)',
        who: ['Ridma'],
      },
      {
        when: 'ASAP',
        what: 'ITIL sample · subject breakdown · UI improvements',
        who: ['Pragatheesh', 'Malsha', 'Nandika'],
      },
      {
        when: 'Aug wk 2',
        what: '1,900 chapter videos uploaded',
        who: ['Piyumi', 'Rukaiya'],
      },
      {
        when: 'Ongoing',
        what: 'E-books · science videos · promo videos',
        who: ['Yoga', 'Malsha', 'Pasindu'],
      },
    ],

    footerTags: ['Design & E-books', 'Video Production', 'Innovation', 'Accounts'],
  },

  transcript: {
    fileName: 'CDD Weekly Sync-20260727.vtt',
    format: 'vtt',
    hasTimings: true,
    durationMs: 2_820_000,
    totalWords: 6_412,
    totalCues: 214,
    unattributedCues: 0,
    warnings: [],
    speakers: [
      { name: 'Sadeev Silva', turns: 78, words: 2_410, spokenMs: 1_012_000, sharePct: 37.6 },
      { name: 'Malsha Nirmani', turns: 24, words: 742, spokenMs: 318_000, sharePct: 11.6 },
      { name: 'Ridma Keshan', turns: 21, words: 601, spokenMs: 262_000, sharePct: 9.4 },
      { name: 'Piyumi Shanika', turns: 19, words: 544, spokenMs: 236_000, sharePct: 8.5 },
      { name: 'Fathima Zahra', turns: 16, words: 468, spokenMs: 201_000, sharePct: 7.3 },
      {
        name: 'Pragatheesh Rajenthiram',
        turns: 14,
        words: 391,
        spokenMs: 172_000,
        sharePct: 6.1,
      },
      { name: 'Nandika Anupama', turns: 12, words: 340, spokenMs: 149_000, sharePct: 5.3 },
      { name: 'Yoga Milona', turns: 9, words: 231, spokenMs: 102_000, sharePct: 3.6 },
      { name: 'Malinda Gunasekara', turns: 8, words: 199, spokenMs: 88_000, sharePct: 3.1 },
      { name: 'Pasindu Maddumage', turns: 6, words: 148, spokenMs: 66_000, sharePct: 2.3 },
      { name: 'Menuka Ranasinghe', turns: 4, words: 128, spokenMs: 57_000, sharePct: 2.0 },
      { name: 'Fathima Rukaiya', turns: 3, words: 128, spokenMs: 56_000, sharePct: 2.0 },
      { name: 'Yenushka Bandara', turns: 2, words: 82, spokenMs: 36_000, sharePct: 1.3 },
    ],
  },

  grounding: {
    findings: [],
    checked: { numbers: 14, people: 41 },
    score: 100,
    clean: true,
  },

  telemetry: {
    model: 'deepseek/deepseek-v4-flash',
    strategy: 'single-pass',
    calls: [
      {
        label: 'single-pass',
        promptTokens: 11_284,
        completionTokens: 4_902,
        attempts: 1,
        finishReason: 'stop',
      },
    ],
    usage: { promptTokens: 11_284, completionTokens: 4_902, totalTokens: 16_186 },
    costUsd: 0.001898,
    repaired: false,
    truncatedOutput: false,
    truncatedInput: false,
    retries: 0,
    durationMs: 18_400,
  },
};
