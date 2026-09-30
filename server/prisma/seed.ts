import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth.js'

// Everything below is seeded into the demo workspace
const WORKSPACE_ID = 'ws-demo'
const DEMO_EMAIL = 'demo@prodly.dev'
const DEMO_PASSWORD = 'prodly-demo'

const WORKSPACE_MODELS = new Set(['Document', 'Feature', 'AIMessage', 'ResearchInsight', 'FileNode', 'Member', 'Task'])
const withWorkspace = <T extends object>(data: T) => ({ ...data, workspaceId: WORKSPACE_ID })

// Adds workspaceId to every create, so the demo data below stays readable
const withWorkspaceIds = (client: PrismaClient) => client.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        if (WORKSPACE_MODELS.has(model)) args.data = withWorkspace(args.data)
        return query(args)
      },
      async createMany({ model, args, query }) {
        if (WORKSPACE_MODELS.has(model)) {
          args.data = Array.isArray(args.data) ? args.data.map(withWorkspace) : withWorkspace(args.data)
        }
        return query(args)
      },
    },
  },
})

let prisma: ReturnType<typeof withWorkspaceIds>

const now = new Date()

async function seedWorkspace() {
  // Skip if already seeded
  const existing = await prisma.document.count({ where: { workspaceId: WORKSPACE_ID } })
  if (existing > 0) { console.log('✓ Workspace already seeded — skipping'); return }

  // ── Documents ──────────────────────────────────────────────────────
  const doc1 = await prisma.document.create({
    data: {
      id: 'doc-1',
      title: 'AI-Powered Onboarding Flow — PRD',
      type: 'prd',
      tags: JSON.stringify(['onboarding', 'ai', 'growth']),
      content: `<h1>AI-Powered Onboarding Flow</h1>
<h2>Problem Statement</h2>
<p>New users struggle to understand the product's value within the first session, leading to a 62% drop-off before completing setup. The current static onboarding ignores user role, goals, and prior tool experience.</p>
<h2>Goals &amp; Success Metrics</h2>
<ul>
  <li>Activation rate (completes setup) | 38% → 60% | Q3 2026</li>
  <li>Time-to-first-value | 8 min → 4 min | Q3 2026</li>
  <li>Day-7 retention | 41% → 55% | Q3 2026</li>
</ul>
<h2>User Stories</h2>
<ul>
  <li>As a <strong>first-time user</strong>, I want the checklist to reflect my role so that I complete relevant steps only.</li>
  <li>As a <strong>returning user</strong>, I want to resume exactly where I left off so that I don't repeat completed steps.</li>
</ul>
<h2>Scope</h2>
<h3>In Scope</h3>
<ul><li>Role detection from sign-up form</li><li>Dynamic checklist generation</li><li>Progress persistence</li></ul>
<h3>Out of Scope</h3>
<ul><li>In-app video tutorials</li><li>Multi-language support</li></ul>
<h2>Functional Requirements</h2>
<ol>
  <li>System detects user role (PM / Engineer / Designer / Other) during sign-up</li>
  <li>Checklist renders 5–8 role-specific tasks within 500ms of login</li>
  <li>Progress syncs across devices in real time</li>
  <li>AI suggests next best action when user is idle for 2+ minutes</li>
</ol>
<h2>Open Questions</h2>
<ol>
  <li>Should we gate certain features behind checklist completion?</li>
  <li>How do we handle users who skip role selection?</li>
</ol>`,
      createdAt: now,
    },
  })

  await prisma.document.create({
    data: {
      id: 'doc-2',
      title: 'User Research: Activation Drop-off',
      type: 'research',
      tags: JSON.stringify(['research', 'activation', 'ux']),
      content: `<h1>User Research: Activation Drop-off</h1>
<h2>Research Summary</h2>
<p>20 moderated user interviews conducted across SMB and enterprise segments. Focus: where and why users abandon onboarding before completing setup.</p>
<h2>Key Themes</h2>
<h3>Theme 1: Onboarding Confusion</h3>
<p><strong>Frequency:</strong> 14 out of 20 participants</p>
<p><strong>Summary:</strong> Users couldn't identify what to do first. The flat list of tasks gave no sense of priority or sequence.</p>
<blockquote><p>"I didn't really know what to do first."</p></blockquote>
<blockquote><p>"There were too many options — I just closed it."</p></blockquote>
<h3>Theme 2: Email Re-engagement Works</h3>
<p><strong>Frequency:</strong> 9 out of 20 participants</p>
<p><strong>Summary:</strong> Users who received a follow-up email within 24 hours of sign-up were 3x more likely to return.</p>
<blockquote><p>"The reminder email was actually helpful."</p></blockquote>
<h2>Recommended Actions</h2>
<ol>
  <li>Redesign onboarding with role-based task ordering</li>
  <li>Add a 24-hour re-engagement email for users who didn't complete setup</li>
  <li>Add a progress indicator to the sidebar</li>
</ol>`,
      createdAt: now,
    },
  })

  await prisma.document.create({
    data: {
      id: 'doc-3',
      title: 'Q2 2026 Roadmap',
      type: 'roadmap',
      tags: JSON.stringify(['roadmap', 'q2', 'planning']),
      content: `<h1>Q2 2026 Product Roadmap</h1>
<h2>Strategic Theme</h2>
<p>Reduce time-to-value for new users while expanding power features for established teams.</p>
<h2>Now (April – May)</h2>
<ul>
  <li><strong>Smart Onboarding Checklist</strong> — personalised by role, reduces setup friction</li>
  <li><strong>Activation Email Sequence</strong> — automated drip for drop-off recovery</li>
</ul>
<h2>Next (June – July)</h2>
<ul>
  <li><strong>In-app Tooltip Coach</strong> — contextual AI guidance during complex workflows</li>
  <li><strong>Bulk CSV Import</strong> — enterprise teams need faster data migration</li>
</ul>
<h2>Later (August+)</h2>
<ul>
  <li><strong>Dark Mode</strong> — high-demand cosmetic feature</li>
  <li><strong>SSO / SAML</strong> — required for enterprise deals in pipeline</li>
</ul>
<h2>Dependencies &amp; Risks</h2>
<ul>
  <li>AI checklist depends on role-detection data model — must ship in April</li>
  <li>SSO blocked on security audit scheduled for July</li>
</ul>`,
      createdAt: now,
    },
  })

  await prisma.document.create({
    data: {
      id: 'doc-4',
      title: 'User Story: Onboarding Checklist',
      type: 'user-story',
      tags: JSON.stringify(['user-story', 'onboarding']),
      content: `<h2>User Story</h2>
<p><strong>As a</strong> first-time PM using the product<br>
<strong>I want to</strong> see a checklist tailored to my role<br>
<strong>So that</strong> I can complete setup quickly without wading through irrelevant steps.</p>
<h2>Acceptance Criteria</h2>
<pre><code>Scenario: PM role selected during sign-up
  Given the user selected "Product Manager" during registration
  When they log in for the first time
  Then the checklist shows PM-specific tasks
  And engineering-specific tasks are hidden

Scenario: Progress persists on refresh
  Given the user completed 3 of 6 checklist items
  When they refresh the page
  Then completed items remain checked
  And the progress bar reflects 50%</code></pre>
<h2>Story Points</h2>
<p>Estimate: <strong>5</strong> — requires role-detection integration + dynamic rendering logic</p>
<h2>Definition of Done</h2>
<ul>
  <li>Code reviewed and merged</li>
  <li>Acceptance criteria passing in staging</li>
  <li>Unit tests written for role-mapping logic</li>
  <li>QA sign-off on all 5 supported roles</li>
</ul>`,
      createdAt: now,
    },
  })

  // ── Features ───────────────────────────────────────────────────────
  await prisma.feature.createMany({
    data: [
      {
        id: 'feat-1',
        title: 'Smart Onboarding Checklist',
        description: 'Personalised checklist that adapts based on user role and goals detected during sign-up.',
        status: 'Now', priority: 'P0',
        reach: 5000, impact: 3, confidence: 80, effort: 2,
        riceScore: Math.round((5000 * 3 * 0.8) / 2),
        moscow: 'Must', assignee: 'Alice', dueDate: '2026-04-30', linkedDocId: 'doc-1',
      },
      {
        id: 'feat-2',
        title: 'In-app Tooltip Coach',
        description: 'Contextual tooltips powered by AI that guide users through complex workflows.',
        status: 'Next', priority: 'P1',
        reach: 3000, impact: 2, confidence: 70, effort: 3,
        riceScore: Math.round((3000 * 2 * 0.7) / 3),
        moscow: 'Should', assignee: 'Bob', dueDate: '2026-06-15', linkedDocId: 'doc-1',
      },
      {
        id: 'feat-3',
        title: 'Activation Email Sequence',
        description: 'Automated email drip triggered by key in-app actions to re-engage users who dropped off.',
        status: 'Now', priority: 'P1',
        reach: 8000, impact: 2, confidence: 90, effort: 1,
        riceScore: Math.round((8000 * 2 * 0.9) / 1),
        moscow: 'Must', assignee: 'Carol', dueDate: '2026-05-20', linkedDocId: null,
      },
      {
        id: 'feat-4',
        title: 'Bulk CSV Import',
        description: 'Allow enterprise teams to import existing data via CSV for faster migration.',
        status: 'Next', priority: 'P1',
        reach: 2500, impact: 3, confidence: 75, effort: 4,
        riceScore: Math.round((2500 * 3 * 0.75) / 4),
        moscow: 'Should', assignee: 'Dave', dueDate: '2026-07-01', linkedDocId: null,
      },
      {
        id: 'feat-5',
        title: 'Dark Mode',
        description: 'Full dark mode support across the application.',
        status: 'Later', priority: 'P3',
        reach: 2000, impact: 1, confidence: 95, effort: 2,
        riceScore: Math.round((2000 * 1 * 0.95) / 2),
        moscow: 'Could', assignee: '', dueDate: '', linkedDocId: null,
      },
      {
        id: 'feat-6',
        title: 'SSO / SAML Integration',
        description: 'Enterprise single sign-on support required for large account deals in the sales pipeline.',
        status: 'Later', priority: 'P2',
        reach: 1200, impact: 3, confidence: 60, effort: 5,
        riceScore: Math.round((1200 * 3 * 0.6) / 5),
        moscow: 'Must', assignee: 'Eve', dueDate: '2026-08-15', linkedDocId: null,
      },
      {
        id: 'feat-7',
        title: 'Progress Bar in Sidebar',
        description: 'Visual indicator of onboarding completion shown persistently in the left sidebar.',
        status: 'Now', priority: 'P2',
        reach: 5000, impact: 1, confidence: 90, effort: 1,
        riceScore: Math.round((5000 * 1 * 0.9) / 1),
        moscow: 'Should', assignee: 'Alice', dueDate: '2026-05-05', linkedDocId: 'doc-1',
      },
      {
        id: 'feat-8',
        title: 'Analytics Dashboard',
        description: 'PM-facing dashboard showing activation funnel metrics, drop-off points, and cohort retention.',
        status: 'Done', priority: 'P0',
        reach: 50, impact: 3, confidence: 100, effort: 3,
        riceScore: Math.round((50 * 3 * 1.0) / 3),
        moscow: 'Must', assignee: 'Bob', dueDate: '2026-03-31', linkedDocId: null,
      },
    ],
  })

  // ── Research Insights ──────────────────────────────────────────────
  await prisma.researchInsight.createMany({
    data: [
      {
        id: 'insight-1',
        theme: 'Onboarding Confusion',
        summary: 'Users struggle to understand the value proposition within the first session, leading to abandonment before completing setup.',
        quotes: JSON.stringify([
          "I didn't really know what to do first.",
          "There were too many options — I just closed it.",
          "I couldn't figure out if it was for me.",
        ]),
        frequency: 14,
        linkedFeatures: JSON.stringify(['feat-1', 'feat-2', 'feat-7']),
      },
      {
        id: 'insight-2',
        theme: 'Email Re-engagement Works',
        summary: 'Users who received a follow-up email within 24 hours of sign-up were 3x more likely to return and complete activation.',
        quotes: JSON.stringify([
          "The reminder email was actually helpful.",
          "I had forgotten about it until I got the email.",
        ]),
        frequency: 9,
        linkedFeatures: JSON.stringify(['feat-3']),
      },
      {
        id: 'insight-3',
        theme: 'Role-based Expectations',
        summary: 'Engineers and designers felt the default onboarding was built for PMs and found many steps irrelevant to their workflow.',
        quotes: JSON.stringify([
          "Half of these steps don't apply to me as a developer.",
          "Why is it asking me about roadmaps? I just want the API docs.",
        ]),
        frequency: 11,
        linkedFeatures: JSON.stringify(['feat-1']),
      },
    ],
  })

  // ── File Tree ──────────────────────────────────────────────────────
  await prisma.fileNode.create({
    data: {
      id: 'folder-1', name: 'Onboarding Project', type: 'folder',
      parentId: null, children: JSON.stringify(['doc-1', 'doc-2', 'doc-4']), createdAt: now,
    },
  })
  await prisma.fileNode.create({
    data: {
      id: 'folder-2', name: 'Planning', type: 'folder',
      parentId: null, children: JSON.stringify(['doc-3']), createdAt: now,
    },
  })
  await prisma.fileNode.createMany({
    data: [
      { id: 'doc-1', name: 'AI-Powered Onboarding Flow — PRD',  type: 'prd',        parentId: 'folder-1', children: '[]', createdAt: now },
      { id: 'doc-2', name: 'User Research: Activation Drop-off', type: 'research',   parentId: 'folder-1', children: '[]', createdAt: now },
      { id: 'doc-4', name: 'User Story: Onboarding Checklist',  type: 'user-story', parentId: 'folder-1', children: '[]', createdAt: now },
      { id: 'doc-3', name: 'Q2 2026 Roadmap',                   type: 'roadmap',    parentId: 'folder-2', children: '[]', createdAt: now },
    ],
  })

  console.log('✓ Workspace seeded')
}

// Seeded separately so existing workspaces also get a demo team and task board
async function seedTeam() {
  const existing = await prisma.member.count({ where: { workspaceId: WORKSPACE_ID, userId: null } })
  if (existing > 0) { console.log('✓ Team already seeded — skipping'); return }

  await prisma.member.createMany({
    data: [
      { id: 'member-alice', name: 'Alice', color: '#6366f1' },
      { id: 'member-bob',   name: 'Bob',   color: '#22c55e' },
      { id: 'member-carol', name: 'Carol', color: '#f59e0b' },
      { id: 'member-dave',  name: 'Dave',  color: '#ec4899' },
      { id: 'member-eve',   name: 'Eve',   color: '#06b6d4' },
    ],
  })

  // Only link tasks to the demo PRD when it exists
  const prd = await prisma.document.findUnique({ where: { id: 'doc-1' } })
  const sourceDocId = prd ? 'doc-1' : null

  await prisma.task.createMany({
    data: [
      { id: 'task-1', title: 'Add role picker to sign-up form', description: 'Ask new users for their role (PM, Engineer, Designer, Other) during sign-up and store it on the profile.', status: 'done', priority: 'P0', assigneeId: 'member-bob', estimate: 'S', sourceDocId, order: 0 },
      { id: 'task-2', title: 'Generate checklist from role and goals', description: 'Build the service that returns an ordered onboarding checklist for the detected role. Done when each role gets a distinct list.', status: 'in-progress', priority: 'P0', assigneeId: 'member-alice', dueDate: '2026-10-10', estimate: 'M', sourceDocId, order: 0 },
      { id: 'task-3', title: 'Persist checklist progress across sessions', description: 'Save completed steps so returning users resume where they left off.', status: 'todo', priority: 'P1', assigneeId: 'member-dave', dueDate: '2026-10-17', estimate: 'M', sourceDocId, order: 0 },
      { id: 'task-4', title: 'Design checklist sidebar widget', description: 'Figma designs for the collapsed and expanded checklist states, including empty and completed states.', status: 'review', priority: 'P1', assigneeId: 'member-carol', estimate: 'S', sourceDocId, order: 0 },
      { id: 'task-5', title: 'Track activation funnel events', description: 'Instrument checklist_viewed, step_completed and checklist_completed so we can measure the activation goal.', status: 'todo', priority: 'P2', assigneeId: 'member-eve', estimate: 'S', sourceDocId, order: 1 },
    ],
  })

  console.log('✓ Team and tasks seeded')
}

async function ensureWorkspace() {
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    create: { id: WORKSPACE_ID, name: 'Demo workspace', joinCode: 'DEMO-PRODLY' },
    update: {},
  })
}

// A ready-made login for trying the app locally
async function seedDemoUser() {
  if (await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })) {
    console.log('✓ Demo user already exists — skipping')
    return
  }
  await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Demo PM',
      passwordHash: await hashPassword(DEMO_PASSWORD),
      workspaceId: WORKSPACE_ID,
      member: { create: { name: 'Demo PM', color: '#8b5cf6', workspaceId: WORKSPACE_ID } },
    },
  })
  console.log(`✓ Demo user seeded (${DEMO_EMAIL} / ${DEMO_PASSWORD})`)
}

/** Seeds the demo workspace, team, tasks and login. Safe to run repeatedly. */
export async function seedDemo(client: PrismaClient) {
  prisma = withWorkspaceIds(client)
  await ensureWorkspace()
  await seedWorkspace()
  await seedTeam()
  await seedDemoUser()
}

// Run directly with `tsx prisma/seed.ts`; the tests import seedDemo instead
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const client = new PrismaClient()
  // A login with a published password must never appear on a real deployment by accident
  const skip = process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== 'true'
  if (skip) console.log('✓ Production: skipping demo data (set SEED_DEMO=true to include it)')
  ;(skip ? Promise.resolve() : seedDemo(client))
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(() => client.$disconnect())
}
