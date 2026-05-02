const KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;

if (!KEY || !TOKEN) {
  console.error('Error: TRELLO_API_KEY and TRELLO_TOKEN environment variables are required.');
  process.exit(1);
}
const BOARD_ID = '69f55f0f7a996c238682ee27';
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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getOrCreateList(existing, name) {
  const found = existing.find(l => l.name.toLowerCase() === name.toLowerCase() && !l.closed);
  if (found) { console.log(`  List exists: "${name}"`); return found.id; }
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

async function addChecklist(idCard, name, items) {
  await sleep(300);
  const cl = await api('POST', '/checklists', { idCard, name });
  for (const item of items) {
    await sleep(200);
    await api('POST', `/checklists/${cl.id}/checkItems`, { name: item });
  }
  console.log(`      + "${name}" (${items.length} items)`);
}

// ── Data ─────────────────────────────────────────────────────────────────────

const CARDS = [
  {
    name: '🌱 Companion Planting — Key Principles',
    desc: 'Core strategies for Maine vegetable gardens (May–July). Based on MOFGA recommendations. Effects vary by weather, soil, and microclimate — test and keep records. Always harden off transplants; monitor for late frosts with row covers.',
    checklists: [
      {
        name: 'Core Strategies',
        items: [
          'Pest control — aromatic herbs & flowers (marigolds, nasturtiums, basil, dill) repel or trap insects; diverse plantings confuse pests',
          'Nutrients & support — legumes (beans, peas) fix nitrogen; tall plants (corn, sunflowers) support climbers; root crops aerate soil',
          'Three Sisters (corn + beans + squash) — corn provides trellis, beans add nitrogen, squash shades soil & deters pests — ideal for June plantings',
          'Succession & interplanting — pair fast crops (radishes, lettuce) with slower ones (tomatoes, squash); replant July beds with companions in place',
          'Avoidances — some pairs compete for nutrients, attract shared pests/diseases (e.g., blight on tomatoes/potatoes), or inhibit growth (allelopathy)',
          'Flowers & herbs everywhere — marigolds (pest deterrent + beneficial insects), nasturtiums (trap crop for aphids/beetles), basil (flavor + repellent)',
        ],
      },
    ],
  },

  {
    name: '🍅 Tomatoes — Companion Guide',
    desc: 'Transplant late May–mid-June after frost. Maine tip: interplant basil and marigolds in rows or borders for July harvests.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Basil — improves flavor, repels flies / mosquitoes / aphids',
          'Marigolds — deters nematodes & pests',
          'Carrots — shade + soil aeration',
          'Lettuce — ground cover + pest confusion',
          'Onions — pest confusion',
          'Parsley — pest confusion',
          'Spinach — ground cover',
          'Asparagus — mutual pest protection',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Fennel — inhibits tomato growth',
          'Dill — inhibits tomato growth',
          'Potatoes — shared blight + pests',
          'Cabbage family — shared blight + pests',
          'Corn — shared earworm issues',
        ],
      },
    ],
  },

  {
    name: '🫘 Beans (Bush & Pole) — Companion Guide',
    desc: 'Direct sow mid–late June. Maine tip: plant pole beans up corn stalks in June hills; succession bush beans into July.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Corn — natural trellis + nitrogen boost (Three Sisters)',
          'Squash / pumpkins — Three Sisters ground cover',
          'Marigolds — repel Mexican bean beetles',
          'Nasturtiums — repel Mexican bean beetles',
          'Potatoes — mutual beetle protection',
          'Radishes — mutual beetle protection',
          'Broccoli / cabbage family — pest deterrence',
          'Sunflowers — support for pole beans',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Onions — stunt bean growth',
          'Garlic — stunt bean growth',
          'Beets — competition (some varieties)',
        ],
      },
    ],
  },

  {
    name: '🌽 Corn (Sweet) — Companion Guide',
    desc: 'Direct sow mid–late June. Use short-season varieties. Interplant with beans & squash for space efficiency in small Maine plots.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Beans — nitrogen fixation + climbing support (Three Sisters)',
          'Squash / pumpkins — Three Sisters ground cover + pest deterrence',
          'Cucumbers — ground cover',
          'Peas — early support',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Tomatoes — shared pests (earworm)',
        ],
      },
    ],
  },

  {
    name: '🥒 Squash, Pumpkins & Cucumbers — Companion Guide',
    desc: 'Direct sow or transplant late May–June when soil warms. Maine tip: nasturtiums among cucumber hills (MOFGA) deter striped cucumber beetles — space hills wider.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Corn + beans — Three Sisters combination',
          'Radishes — distract cucumber beetles',
          'Nasturtiums — repel aphids & beetles',
          'Marigolds — repel aphids & beetles',
          'Peas — pest control',
          'Dill — pest control',
          'Parsley — pest control',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Potatoes — blight risk',
          'Sage — stunts cucumbers',
          'Rosemary — stunts cucumbers',
          'Other cucurbits close together — pest / disease spread',
        ],
      },
    ],
  },

  {
    name: '🥬 Lettuce, Spinach & Leafy Greens — Companion Guide',
    desc: 'Direct sow / transplant early May onward; succession every 1–2 weeks through July. Maine tip: tuck lettuce & radishes between slower crops like tomatoes or squash for continuous harvests.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Carrots — shade + soil loosening',
          'Radishes — shade + soil loosening',
          'Onions — aphid repellent',
          'Chives — aphid repellent',
          'Garlic — aphid repellent',
          'Beets — nutrient sharing',
          'Broccoli — nutrient sharing',
          'Marigolds — attract beneficial insects',
          'Corn — light shade for summer heat',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Parsley — crowds lettuce',
          'Heavy brassicas — competition',
        ],
      },
    ],
  },

  {
    name: '🥕 Carrots & Root Crops — Companion Guide',
    desc: 'Carrots, beets, parsnips, radishes, turnips. Direct sow early–mid May; succession into July. Maine tip: classic peas + carrots pairing (MOFGA) — peas in center, carrots on sides — great for early May beds.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Tomatoes — shade + solanine acts as insecticide',
          'Leeks — repel carrot flies',
          'Onions — repel carrot flies',
          'Chives — repel carrot flies',
          'Rosemary — repel carrot flies',
          'Lettuce — mutual soil benefits',
          'Radishes — mutual soil benefits',
          'Cabbage family — general compatibility',
          'Peas — classic pairing; nutrient exchange',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Dill — harms carrot growth',
          'Coriander — harms carrot growth',
          'Parsnips — shared pests & diseases with carrots',
        ],
      },
    ],
  },

  {
    name: '🫛 Peas — Companion Guide',
    desc: 'Direct sow early May. Maine tip: early May peas with carrots or radishes for quick harvests before warm-season crops take over.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Carrots — classic pair; nutrient exchange',
          'Corn — support + nitrogen',
          'Beans — support + nitrogen',
          'Radishes — early season fill',
          'Turnips — early season fill',
          'Spinach — early season fill',
          'Mint — aphid control',
          'Chives — aphid control',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Onions — stunt pea growth',
          'Garlic — stunt pea growth',
        ],
      },
    ],
  },

  {
    name: '🥦 Broccoli, Cabbage, Kale & Brassicas — Companion Guide',
    desc: 'Transplant early May OR start for July / fall crop. Maine tip: July plantings pair well with existing onions or dill; use row covers early.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Dill — pest deterrence',
          'Onions — pest deterrence',
          'Celery — pest deterrence',
          'Beets — nutrient sharing',
          'Lettuce — nutrient sharing',
          'Nasturtiums — control cabbage worms',
          'Marigolds — control cabbage worms',
          'Beans — general compatibility',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Tomatoes — pest competition',
          'Peppers — pest competition',
          'Eggplant — pest competition',
          'Strawberries — some sources flag conflict',
        ],
      },
    ],
  },

  {
    name: '🥔 Potatoes — Companion Guide',
    desc: 'Plant early–mid May. Maine tip: alternate bean rows or interplant flax (MOFGA) for Colorado potato beetle control.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Beans — repel Colorado potato beetles',
          'Corn — space sharing',
          'Cabbage — space sharing',
          'Marigolds — beetle deterrent',
          'Horseradish — border protection',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Tomatoes — shared blight (very important in Maine)',
          'Onions — some inhibition reported',
        ],
      },
    ],
  },

  {
    name: '🌶️ Peppers — Companion Guide',
    desc: 'Transplant early–mid June. Maine tip: basil companions boost July–August yields in protected spots.',
    checklists: [
      {
        name: '✅ Good With',
        items: [
          'Basil — repels aphids & spider mites; improves flavor',
          'Onions — pest confusion',
          'Spinach — pest confusion',
          'Tomatoes — pest confusion',
        ],
      },
      {
        name: '❌ Avoid',
        items: [
          'Beans — tangling issues',
          'Brassicas — competition + pests',
          'Carrots — competition',
          'Corn — competition + pests',
          'Fennel — inhibits growth',
        ],
      },
    ],
  },

  {
    name: '🧅 Onions, Leeks, Scallions & Herbs — Quick Reference',
    desc: 'Universal pest fighters and flavor boosters. Marigolds and nasturtiums can go in any bed.',
    checklists: [
      {
        name: 'Onions / Leeks / Scallions',
        items: [
          '✅ Good with: carrots, beets, cabbage, lettuce, tomatoes',
          '❌ Avoid: asparagus, beans, peas',
        ],
      },
      {
        name: 'Key Herbs',
        items: [
          'Basil — with tomatoes & peppers (flavor boost + pest repellent)',
          'Dill — with brassicas strategically (NOT with carrots)',
          'Rosemary — repels carrot flies; pairs with beans & brassicas',
          'Mint — aphid control near peas & brassicas (plant in containers to contain spread)',
          'Parsley — near tomatoes & asparagus for pest confuion',
        ],
      },
      {
        name: 'Flowers (Universal)',
        items: [
          'Marigolds — borders or interplanted; attract ladybugs & lacewings; deter nematodes',
          'Nasturtiums — edible trap crop for aphids & cucumber beetles; plant near cucumbers, squash, beans',
        ],
      },
    ],
  },

  {
    name: '🌿 Suggested Maine Garden Bed Ideas (May–July)',
    desc: 'Ready-to-use bed combinations for Maine\'s short season. Start small — try 2–3 pairings per bed. Observe, adjust, and keep notes each year.',
    checklists: [
      {
        name: 'Three Sisters Bed — June',
        items: [
          'Corn hills planted first (short-season variety)',
          'Pole beans planted at base of corn once stalks are 6" tall',
          'Squash planted around outer edges of hills',
          'Benefit: corn = trellis, beans = nitrogen, squash = living mulch + pest deterrent',
        ],
      },
      {
        name: 'Tomato-Basil-Marigold Row — Late May',
        items: [
          'Tomatoes caged in center row',
          'Basil planted between tomato cages',
          'Marigolds along border / at feet of tomatoes',
          'Carrots or lettuce tucked underneath for ground cover',
        ],
      },
      {
        name: 'Carrot-Pea-Onion Bed — Early May',
        items: [
          'Peas planted in center (classic MOFGA pairing)',
          'Carrots planted on sides of peas',
          'Onions or chives interspersed throughout',
          'Radishes added as fast-filler crop',
        ],
      },
      {
        name: 'Succession Lettuce-Radish Mix — All Season',
        items: [
          'Sow lettuce & radish mix every 1–2 weeks',
          'Tuck between slower crops: broccoli, squash, tomatoes',
          'Harvest radishes fast (28 days) to open space continually',
          'Shade-tolerant — use under tall crops in July heat',
        ],
      },
      {
        name: 'Fall Brassica Bed — July Planting',
        items: [
          'Kale / broccoli / cabbage transplants or direct sow',
          'Dill interplanted for pest deterrence',
          'Onions interspersed',
          'Marigolds on border for pest protection',
          'Row covers ready for early frost in Sept/Oct',
        ],
      },
    ],
  },

  {
    name: '📅 Garden — Daily & Weekly Reminders',
    desc: 'Recurring garden check-ins for May–July. Run through the daily list every morning; weekly list every Sunday before the week starts.',
    checklists: [
      {
        name: 'Every Day — Morning Check',
        items: [
          'Walk every bed — look for pest damage, wilting, or disease',
          'Check soil moisture — water deeply if top inch is dry',
          'Check row covers — remove on warm days, replace if frost risk at night',
          'Spot-check for aphids under leaves (especially brassicas + beans)',
          'Look for cucumber beetles on squash/cucumber hills',
          'Check for cabbage worms on kale/broccoli/cabbage',
          'Pull any weeds before they establish',
          'Note anything unusual in garden journal',
        ],
      },
      {
        name: 'Every Week — Sunday Review',
        items: [
          'Check frost forecast for the coming week — prepare row covers if needed',
          'Succession sow lettuce and radishes in any open gaps',
          'Thin overcrowded seedlings (carrots, beets, lettuce)',
          'Fertilize with compost tea or liquid seaweed if plants look slow',
          'Check companion pairings — are marigolds/nasturtiums blooming?',
          'Inspect tomatoes — pinch suckers, tie to cages, check for blight',
          'Check bean and pea support structures — tie up if needed',
          'Harvest anything ready — don\'t let overripe veg slow the plant',
          'Add fresh mulch between rows if it\'s thinned out',
          'Review garden journal — note what\'s working, what to adjust',
          'Check propane / irrigation equipment before the week begins',
        ],
      },
      {
        name: 'Weekly — Planting & Succession Tasks',
        items: [
          'Week of May 1 — Peas, carrots, radishes, onions, spinach, beets, potatoes direct sow',
          'Week of May 15 — Transplant tomatoes + peppers (after last frost); add basil & marigolds',
          'Week of May 22 — Harden off squash/cucumber transplants; prepare hills',
          'Week of June 1 — Direct sow squash, cucumbers, corn, beans (soil must be warm)',
          'Week of June 7 — Plant corn hills; start Three Sisters setup',
          'Week of June 14 — Pole beans at base of corn; squash around hills',
          'Week of June 21 — Succession beans; check tomato companions are established',
          'Week of July 1 — Start fall brassica transplants (kale, broccoli, cabbage)',
          'Week of July 7 — Succession sow final round of lettuce/radishes for fall',
          'Week of July 14 — Review garden; plan fall bed rotations',
        ],
      },
    ],
  },

  {
    name: '📋 Companion Planting — Pro Tips for Maine',
    desc: 'Maine-specific success tips. USDA zones 4–6, last frost ~mid-May in central/southern areas. Resources: MOFGA fact sheets, UMaine Extension planting chart.',
    checklists: [
      {
        name: 'Top Tips',
        items: [
          'Start small — try 2–3 pairings per bed; scale what works',
          'Observe: what repels pests in YOUR yard? Adjust every year',
          'Keep a garden journal — note what thrived, what failed, and why',
          'Harden off all transplants before planting out',
          'Monitor for late frosts with row covers through end of May',
          'Mulch between companions to retain moisture and reduce weeds',
          'Add compost to support companion nutrient interactions',
          'Rotate crops each year to break pest/disease cycles',
          'Combine with row covers for brassicas — physical + companion protection',
          'Check MOFGA fact sheets and UMaine Extension for Maine-specific advice',
        ],
      },
      {
        name: 'Timing Reminders',
        items: [
          'Early May — peas, carrots, radishes, beets, spinach, onions, potatoes',
          'Mid May (after last frost) — transplant tomatoes, peppers with basil/marigolds',
          'Late May–June — squash, cucumbers, corn, beans (soil must be warm)',
          'July — succession lettuce/radishes; start fall brassica transplants',
        ],
      },
    ],
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching existing board lists…');
  const existing = await api('GET', `/boards/${BOARD_ID}/lists`);

  const listId = await getOrCreateList(existing, 'GARDEN / COMPANION PLANTING');

  console.log('\nCreating companion planting cards…\n');

  for (const card of CARDS) {
    try {
      const cardId = await createCard(listId, card.name, card.desc);
      for (const cl of card.checklists) await addChecklist(cardId, cl.name, cl.items);
    } catch (err) {
      console.error(`  FAILED "${card.name}": ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
