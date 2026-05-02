const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD_ID = process.env.TRELLO_BOARD_ID || '69f55f0f7a996c238682ee27';

if (!KEY || !TOKEN) {
  console.error('Error: TRELLO_API_KEY and TRELLO_TOKEN environment variables are required.');
  process.exit(1);
}
const BASE = 'https://api.trello.com/1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, path, body = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('key', KEY);
  url.searchParams.set('token', TOKEN);

  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET') opts.body = JSON.stringify(body);
  else Object.entries(body).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function getOrCreateList(existingLists, name) {
  const found = existingLists.find(l => l.name.toLowerCase() === name.toLowerCase() && !l.closed);
  if (found) {
    console.log(`  List exists: "${name}" (${found.id})`);
    return found.id;
  }
  await sleep(300);
  const list = await api('POST', '/lists', { name, idBoard: BOARD_ID });
  console.log(`  Created list: "${name}" (${list.id})`);
  return list.id;
}

async function createCard(idList, name, desc) {
  await sleep(300);
  const card = await api('POST', '/cards', { idList, name, desc });
  console.log(`    Card: "${name}" → ${card.shortUrl}`);
  return card.id;
}

async function createChecklist(idCard, name) {
  await sleep(300);
  const cl = await api('POST', '/checklists', { idCard, name });
  return cl.id;
}

async function addCheckItem(idChecklist, name) {
  await sleep(200);
  await api('POST', `/checklists/${idChecklist}/checkItems`, { name });
}

async function buildChecklist(cardId, name, items) {
  const clId = await createChecklist(cardId, name);
  for (const item of items) await addCheckItem(clId, item);
}

// ── Board data ───────────────────────────────────────────────────────────────

const LISTS_NEEDED = [
  'PERSONAL / LEGAL',
  'FARM / PROPERTY',
  'AZIMUTH FOUNDATION',
  'PEOPLE / OUTREACH',
  'SAFETRACKS',
];

const CARDS = [
  // ── PERSONAL / LEGAL ──────────────────────────────────────────────────────
  {
    list: 'PERSONAL / LEGAL',
    name: 'Azalea',
    desc: 'Daily reminder — check every day. Legal + custody + personal admin.',
    checklists: [
      {
        name: 'Action Items',
        items: [
          'Get lawyer for custody matters (Pine Tree Legal or 211 for payment help)',
          'Create lawyer folder + tracking checklist',
          'Write narrative around issues',
          'Inventory and tracking of visits',
          'Gather school records',
          'Get car accident records',
          'Compile all memorable issues into list format',
          'Save all notes from visits + itinerary for each visit',
          'Complete drug testing + counseling (for judge)',
          'Get medical record releases',
          'Change address to Maine',
          'Change bank account',
          'Complete any class/requirement the judge asks for',
          'Put all evidence into organized folders',
          'Call lawyer for daughter daily until resolved',
        ],
      },
    ],
  },
  {
    list: 'PERSONAL / LEGAL',
    name: 'Serve Claudia — Jasper Paperwork',
    desc: 'Legal filing — DO IMMEDIATELY. Daily reminder until complete.',
    checklists: [
      {
        name: 'Action Items',
        items: [
          'File paperwork to serve Claudia card for Jasper',
          'Confirm filing received',
          'Track completion and follow up',
        ],
      },
    ],
  },

  // ── FARM / PROPERTY ───────────────────────────────────────────────────────
  {
    list: 'FARM / PROPERTY',
    name: 'D Farm Work',
    desc: "Prep work before Monday trip to Derek's. Cleaning, documenting, payment setup.",
    checklists: [
      {
        name: 'Before Monday',
        items: [
          'Send Derek letterhead + payment direction',
          "Get Derek's work things ready",
        ],
      },
      {
        name: 'On Site',
        items: ['Clean bins', 'Clean garage', 'Move stuff to garage', 'Remove trash'],
      },
      {
        name: 'Reminders',
        items: ['Propane check Monday morning'],
      },
    ],
  },
  {
    list: 'FARM / PROPERTY',
    name: "Jana's Mom Visit Prep",
    desc: "Property prep before Jana's mom visits. Complete everything before arrival.",
    checklists: [
      {
        name: 'Property Tasks',
        items: [
          'Fix floors',
          'Fix stove',
          'Move wood into barn',
          'Clean entire barn',
          "Clear everything out of her bedroom",
          'Clear porch',
          'Make kitchen in cabin',
          'REMINDER: Do siding ASAP',
        ],
      },
      {
        name: 'Garden',
        items: [
          'Plant garden — fully done before visit',
          'Chainsaw tree — save limbs for mushroom cultivation (check pear wood viability)',
        ],
      },
      {
        name: 'Done When',
        items: [
          'Garden fully planted',
          'Floors finished',
          'Barn clean',
          'Bedroom cleared',
          'Porch clear',
          'Cabin kitchen functional',
        ],
      },
    ],
  },
  {
    list: 'FARM / PROPERTY',
    name: 'Jana — Birthday Gift',
    desc: 'Thoughtful and meaningful gift for Jana.',
    checklists: [
      {
        name: 'To Decide',
        items: [
          'Determine primary gift (thoughtful + meaningful)',
          'Explore glass art / glass items option',
          'Finalize gift before her birthday',
        ],
      },
    ],
  },

  // ── AZIMUTH FOUNDATION ────────────────────────────────────────────────────
  {
    list: 'AZIMUTH FOUNDATION',
    name: 'Azimuth Foundation — Filing Sequence',
    desc: 'Maine Nonprofit Corporation. 501(c)(3) pending. Programs: SafeTracks + Verified Restore.',
    checklists: [
      {
        name: 'Filing Steps — In Order',
        items: [
          'File Articles of Incorporation — Maine SOS — $40',
          'Receive Maine approval (2–5 business days)',
          'Apply for EIN — IRS.gov/EIN — free, same day',
          'File Form 1023-EZ — Pay.gov — $275',
          'Receive 501(c)(3) determination letter (2–4 weeks)',
          'Open nonprofit bank account',
          'Draft and adopt bylaws',
          'Hold first board meeting',
          'Create SAM.gov account (required for federal grants)',
        ],
      },
    ],
  },

  // ── PEOPLE / OUTREACH ─────────────────────────────────────────────────────
  {
    list: 'PEOPLE / OUTREACH',
    name: 'Jessie Smith — Consulting',
    desc: 'Grant approvals + org filings consultant. Confirm role and scope immediately.',
    checklists: [
      {
        name: 'Action Items',
        items: [
          'Confirm Jessie\'s consulting role — TODAY',
          'Define scope: grant approvals vs. org filings vs. both',
          'Send Jessie full context / master document',
          'Establish communication cadence',
          'Get Jessie into grant pipeline review',
          'Confirm fee/retainer structure',
        ],
      },
    ],
  },
  {
    list: 'PEOPLE / OUTREACH',
    name: 'Brent & Scotty',
    desc: '[Awaiting role clarification from Barry — field ops, contractors, or board?]',
    checklists: [
      {
        name: 'TBD',
        items: [
          'Clarify roles and responsibilities',
          'Define deliverables',
          'Set check-in schedule',
        ],
      },
    ],
  },
  {
    list: 'PEOPLE / OUTREACH',
    name: 'Michael Avella — Disability Rights NJ',
    desc: 'Key contact for SafeTracks healthcare and disability sector implementation.',
    checklists: [
      {
        name: 'Action Items',
        items: [
          'Review SafeTracks Healthcare & Disability Sector Implementation Strategy doc',
          'Draft outreach email to Michael',
          'Frame SafeTracks value prop for disability rights angle',
          'Identify specific collaboration ask (data, advocacy, network intros)',
          'Send email and log in Partner Tracker',
          'Follow up if no response in 5 days',
        ],
      },
    ],
  },
  {
    list: 'PEOPLE / OUTREACH',
    name: 'Jana — Work / SafeTracks Role',
    desc: 'Clinical Director Designate. MHRT-1 + CRMa completing in ~3 months. Unlocks SAMHSA eligibility and MaineCare billing.',
    checklists: [
      {
        name: 'Track to Completion',
        items: [
          'Track MHRT-1 + CRMa completion timeline',
          'Confirm Clinical Director Designate responsibilities in bylaws',
          'Identify SAMHSA eligibility unlock tasks upon certification',
          'Set up MaineCare billing framework upon certification',
          'Confirm Jana on all incorporator paperwork (she is incorporator)',
          'Schedule first board meeting — Jana must attend and sign',
          'Align on grant applications requiring clinical staff credentials',
        ],
      },
    ],
  },

  // ── SAFETRACKS ────────────────────────────────────────────────────────────
  {
    list: 'SAFETRACKS',
    name: 'SafeTracks — Master Action List',
    desc: 'Exhaustive rolling action list. Check daily.',
    checklists: [
      {
        name: 'TODAY',
        items: [
          'Set up Zeffy donation page',
          'Call Kennebec County — 207-622-0971',
          'Email Project DHARMA',
          'Email MADDS Brandeis — madds@brandeis.edu',
          'Confirm Jessie Smith consulting role',
        ],
      },
      {
        name: 'This Week',
        items: [
          'Call Oxford County — 207-743-6359',
          'Finish Supabase tables 3 + 4',
          'Fix URGENT metrics integration — incomplete SQL tasks',
        ],
      },
      {
        name: '30 Days',
        items: ['First 500 kit inventory — field operations'],
      },
      {
        name: 'Ongoing / Next Deadline',
        items: [
          'Maine Recovery Council LOI — submit before deadline',
          'Monitor grants.gov for SAMHSA FY2026 posting',
          'Avery Thomas warm intro to FAME contact',
          'Submit FAME Direct Loan application',
          'Launch active grant applications',
          'Print CFSRE packet — mail to Alex Krotulski',
        ],
      },
    ],
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching existing lists on board…');
  const existingLists = await api('GET', `/boards/${BOARD_ID}/lists`);
  console.log(`Found ${existingLists.length} existing list(s).`);

  // Build list name → id map, creating missing ones
  const listIds = {};
  for (const name of LISTS_NEEDED) {
    listIds[name] = await getOrCreateList(existingLists, name);
  }

  console.log('\nCreating cards…\n');

  for (const card of CARDS) {
    const listId = listIds[card.list];
    if (!listId) { console.error(`  ERROR: no list id for "${card.list}"`); continue; }

    try {
      const cardId = await createCard(listId, card.name, card.desc);
      for (const cl of card.checklists) {
        await buildChecklist(cardId, cl.name, cl.items);
        console.log(`      + checklist "${cl.name}" (${cl.items.length} items)`);
      }
    } catch (err) {
      console.error(`  FAILED card "${card.name}": ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
