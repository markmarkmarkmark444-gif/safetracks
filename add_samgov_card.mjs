const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD_ID = process.env.TRELLO_BOARD_ID || '69f55f0f7a996c238682ee27';

if (!KEY || !TOKEN) {
  console.error('Error: TRELLO_API_KEY and TRELLO_TOKEN environment variables are required.');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, path, body = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('key', KEY);
  url.searchParams.set('token', TOKEN);
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET') opts.body = JSON.stringify(body);
  else Object.entries(body).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function main() {
  const lists = await api('GET', '/boards/' + BOARD_ID + '/lists');
  const foundList = lists.find(l => l.name === 'AZIMUTH FOUNDATION' && !l.closed);
  console.log('Using list:', foundList.name, foundList.id);

  const card = await api('POST', '/cards', {
    idList: foundList.id,
    name: 'SAM.gov Registration — Full Setup Checklist',
    desc: 'Register for government contracts and grants. Free but takes 2-4 weeks to become fully active. Renew annually to stay eligible for bidding.',
  });
  console.log('Card:', card.shortUrl);

  const checklists = [
    {
      name: '1. Preparation & Authentication',
      items: [
        'Create a Login.gov personal account — this is the ONLY way to access the real SAM system',
        'Gather Articles of Organization (or Incorporation)',
        'Gather IRS CP-575 — EIN confirmation letter',
        'Gather a recent utility bill OR bank statement',
        'Confirm business name and address match exactly across all documents — down to the punctuation',
      ],
    },
    {
      name: '2. Core Registration Steps',
      items: [
        'Log into SAM.gov and select "Get Started" to request your 12-character Unique Entity ID (UEI) — replaced the old DUNS number',
        'Purpose of Registration — select "All Awards" to bid on both contracts AND grants',
        'IRS Consent — enter your TIN/EIN and authorize IRS to validate business details (takes 1-3 business days)',
        'CAGE Code — system assigns a Commercial and Government Entity code after submission and DLA vetting (if you do not already have one)',
      ],
    },
    {
      name: '3. Financial & Business Data',
      items: [
        'Banking Info — enter routing number and account number for Electronic Funds Transfer (EFT); how the government pays you',
        'NAICS Codes — identify codes for your specific services (e.g., restoration, remediation) so you appear in relevant contract searches',
        'Reps & Certs — complete Representations and Certifications section for business size and socio-economic status',
      ],
    },
    {
      name: 'Timeline & Maintenance',
      items: [
        'Full process is FREE — no cost to register',
        'Allow 2-4 weeks for registration to become fully active',
        'Set a calendar reminder to renew registration ANNUALLY — lapsing makes you ineligible to bid',
        'Monitor SAM.gov email for IRS validation confirmation after step 2',
        'Monitor for CAGE Code assignment email after DLA review',
      ],
    },
  ];

  for (const cl of checklists) {
    await sleep(300);
    const created = await api('POST', '/checklists', { idCard: card.id, name: cl.name });
    for (const item of cl.items) {
      await sleep(200);
      await api('POST', '/checklists/' + created.id + '/checkItems', { name: item });
    }
    console.log(' + checklist:', cl.name, '(' + cl.items.length + ' items)');
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
