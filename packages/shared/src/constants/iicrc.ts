// IICRC S500 (2021) & S700 (2025) Standard Constants

// ─── S500 Water Damage ────────────────────────────────────────────────────────

export const S500_VERSION = '2021';

export const WATER_CATEGORIES = {
  category_1: {
    label: 'Category 1 — Clean Water',
    description: 'Water originates from a sanitary source and does not pose substantial harm.',
    examples: ['Broken supply line', 'Tub/sink overflow with clean water', 'Rainwater through clean surface'],
    healthRisk: 'Low',
  },
  category_2: {
    label: 'Category 2 — Gray Water',
    description: 'Contains significant contamination with potential to cause discomfort or illness.',
    examples: ['Dishwasher/washing machine overflow', 'Toilet bowl overflow with urine', 'Hydrostatic seepage'],
    healthRisk: 'Moderate',
  },
  category_3: {
    label: 'Category 3 — Black Water',
    description: 'Grossly contaminated — contains pathogenic agents.',
    examples: ['Sewage backup', 'Flooding from rivers/streams', 'Toilet bowl overflow with feces'],
    healthRisk: 'High',
  },
} as const;

export const WATER_CLASSES = {
  class_1: {
    label: 'Class 1 — Slow Evaporation',
    description: 'Least amount of water, absorption, and evaporation. ≤5% wet material.',
    typicalDryingDays: '1-3',
    affectsMaterials: ['Concrete slab', 'Low-porosity materials'],
  },
  class_2: {
    label: 'Class 2 — Fast Evaporation',
    description: 'Large amounts of water. 5–40% wet material. Walls wet to <24 inches.',
    typicalDryingDays: '3-5',
    affectsMaterials: ['Carpet and pad', 'Drywall base', 'Structural wood'],
  },
  class_3: {
    label: 'Class 3 — Fastest Evaporation',
    description: 'Greatest amount of evaporation. >40% of surfaces wet. Walls wet >24 inches.',
    typicalDryingDays: '5-10',
    affectsMaterials: ['Drywall', 'Insulation', 'Ceiling materials'],
  },
  class_4: {
    label: 'Class 4 — Specialty Drying',
    description: 'Deep pockets of saturation. Low permeance materials.',
    typicalDryingDays: '10-21',
    affectsMaterials: ['Hardwood floors', 'Concrete', 'Crawl spaces', 'Plaster'],
  },
} as const;

// Target dry standards by material (S500 §11)
export const DRY_STANDARDS_BY_MATERIAL: Record<string, number> = {
  'drywall': 14,
  'plywood_subfloor': 16,
  'hardwood_floor': 12,
  'concrete_slab': 4,
  'carpet': 1, // % relative to dry sample
  'framing_lumber': 16,
  'osb': 18,
  'plaster': 14,
  'brick_mortar': 0, // use resistivity method
  'insulation': 0, // typically requires removal if saturated
  'trim_baseboard': 14,
};

// Psychrometric drying goals (S500 §12)
export const PSYCHROMETRIC_DRYING_GOALS = {
  optimalDryingTempF: { min: 70, max: 90 },
  optimalRhPct: { min: 30, max: 55 },
  maxDewPointF: 55,
  minGrainDepression: 20, // grains/lb below ambient
} as const;

// S500 Required PPE by category
export const S500_PPE_BY_CATEGORY: Record<string, string[]> = {
  category_1: ['Rubber boots', 'Gloves'],
  category_2: ['Rubber boots', 'Nitrile gloves', 'Eye protection', 'N95 respirator'],
  category_3: [
    'Full Tyvek suit', 'Double nitrile gloves', 'Face shield',
    'Half-face respirator with P100/OV cartridge', 'Rubber boots',
  ],
};

// ─── S700 Fire/Smoke Damage ────────────────────────────────────────────────────

export const S700_VERSION = '2025';

export const FIRE_SMOKE_CATEGORIES = {
  wet_smoke: {
    label: 'Wet Smoke',
    description: 'Low heat, smoldering fires. Sticky, smeary residue. Strong odor.',
    cleaningMethod: 'Dry sponge first, then alkaline cleaners. Avoid spreading.',
    typicalMaterials: ['Rubber', 'Plastics'],
  },
  dry_smoke: {
    label: 'Dry Smoke',
    description: 'High heat, fast burning. Non-smeary, powdery residue. Dry and easier to clean.',
    cleaningMethod: 'HEPA vacuum then appropriate detergent/solvent.',
    typicalMaterials: ['Paper', 'Wood'],
  },
  protein_smoke: {
    label: 'Protein Smoke',
    description: 'Virtually invisible residue. Extremely pungent, discolors paints, varnishes.',
    cleaningMethod: 'Enzymatic cleaners. Often requires re-painting.',
    typicalMaterials: ['Cooking residue', 'Evaporated proteins'],
  },
  fuel_oil_smoke: {
    label: 'Fuel Oil Soot',
    description: 'From furnace puffbacks. Black, oily, pervasive.',
    cleaningMethod: 'Dry sponge, then degreaser. HEPA air scrubbers required.',
    typicalMaterials: ['Furnace soot'],
  },
  other_smoke: {
    label: 'Other Smoke',
    description: 'Chemical compound fires (e.g., meth labs, plastics, hazmat).',
    cleaningMethod: 'Requires industrial hygienist assessment.',
    typicalMaterials: ['Varied'],
  },
} as const;

// S700 Required air testing thresholds
export const S700_AIR_QUALITY_THRESHOLDS = {
  particulateMatter_PM2_5_ugm3: 35, // EPA 24hr standard
  totalVOC_ppb: 400,
  carbonMonoxide_ppm: 1,
  formaldehyde_ppb: 16,
} as const;

// S700 PPE requirements
export const S700_PPE_REQUIREMENTS = [
  'Full Tyvek coveralls (disposable)',
  'N100 or P100 respirator with OV cartridge',
  'Safety goggles (indirect vent)',
  'Nitrile gloves (double)',
  'Rubber booties',
  'Hard hat (if structural risk)',
];

// S700 Standard deodorization methods
export const S700_DEODORIZATION_METHODS = {
  thermal_fogging: 'Thermal fogging with solvent-based deodorant',
  hydroxyl_generation: 'Hydroxyl radical generator (safe for occupied spaces)',
  ozone_treatment: 'Ozone shock treatment (space must be unoccupied)',
  encapsulation: 'Sealing/encapsulation of remaining odor sources',
  duct_cleaning: 'HVAC duct cleaning per NADCA standards',
} as const;

// ─── Equipment Production Standards ──────────────────────────────────────────

// LGR dehumidifier capacity (pints/day at 80°F/60% RH per AHAM standard)
export const EQUIPMENT_DEHUMIDIFIER_STANDARDS = {
  residential_lrg: { minPintsPerDay: 70, maxSqFtCoverage: 2000 },
  commercial_lrg: { minPintsPerDay: 100, maxSqFtCoverage: 3000 },
  desiccant: { minPintsPerDay: 100, grainCapacity: true },
} as const;

// Air mover CFM standards for coverage
export const EQUIPMENT_AIR_MOVER_STANDARDS = {
  standard: { cfm: 1200, coverageSqFt: 150 },
  high_velocity: { cfm: 2400, coverageSqFt: 300 },
} as const;

// ─── Cost Codes (Xactimate Compatible) ────────────────────────────────────────

export const XACTIMATE_COST_CODES = {
  // Equipment rental
  'DH-EQLG': 'Dehumidifier - large commercial (per day)',
  'DH-EQMD': 'Dehumidifier - medium (per day)',
  'EQ-AMOV': 'Air mover - axial (per day)',
  'EQ-ASCB': 'Air scrubber (per day)',
  'EQ-HRSX': 'Hydroxyl generator (per day)',
  'EQ-NGAS': 'Negative air machine / air scrubber (per day)',
  // Water damage
  'WTR-DEMO': 'Demo - remove drywall',
  'WTR-EXTR': 'Water extraction',
  'WTR-SUBF': 'Subfloor - dry/treat',
  // Fire/smoke
  'SMK-CONT': 'Content cleaning',
  'SMK-DUCT': 'HVAC duct cleaning',
  'SMK-TFOG': 'Thermal fogging',
  'SMK-STRX': 'Structure cleaning - smoke/soot',
  // Mold
  'MOL-REMV': 'Mold remediation per sq ft',
  'MOL-TEST': 'Air quality / mold testing',
  // Labor
  'LAB-TECH': 'Technician labor (per hour)',
  'LAB-SPVR': 'Supervisor labor (per hour)',
  'LAB-PROJ': 'Project manager labor (per hour)',
} as const;

// ─── Compliance Checklist ─────────────────────────────────────────────────────

export const S500_COMPLIANCE_CHECKLIST = [
  'Water source identified and stopped',
  'Category and class documented',
  'Moisture readings taken at all affected rooms',
  'Psychrometric readings taken (temp/RH/dew point/grains)',
  'Equipment placed per S500 protocol',
  'Daily monitoring readings logged',
  'Structural drying goals established',
  'Photos taken before, during, and after',
  'Work authorization signed by property owner',
  'Antimicrobial application documented if required',
  'Demo scope documented with pre/post photos',
  'Certificate of completion signed by all parties',
] as const;

export const S700_COMPLIANCE_CHECKLIST = [
  'Fire cause and origin documented',
  'Smoke category identified (wet/dry/protein/fuel oil)',
  'Scope of loss documented with photos',
  'Safety assessment completed (structural, electrical, gas)',
  'Content inventory completed',
  'Containment established to prevent cross-contamination',
  'HEPA air scrubbers placed and running',
  'Deodorization method selected and documented',
  'Air quality baseline testing completed',
  'Cleaning protocols documented per S700',
  'Pack-out inventory logged if applicable',
  'Post-remediation air quality test completed',
  'Certificate of completion signed by all parties',
] as const;
