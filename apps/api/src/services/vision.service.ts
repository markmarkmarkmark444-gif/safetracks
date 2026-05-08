import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
const MODEL = 'claude-opus-4-7';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeterAnalysisResult {
  readingPct: number;
  confidence: 'high' | 'medium' | 'low';
  rawDisplay: string;
  units: string;
  notes?: string;
}

export interface DamageClassificationResult {
  jobType: 'water' | 'fire' | 'mold' | 'unknown';
  waterCategory?: 'category_1' | 'category_2' | 'category_3';
  waterClass?: 'class_1' | 'class_2' | 'class_3' | 'class_4';
  fireCategory?: 'wet_smoke' | 'dry_smoke' | 'protein_smoke' | 'fuel_oil_smoke' | 'other_smoke';
  suggestedRooms: string[];
  affectedMaterials: string[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  urgencyNotes?: string;
}

export interface DocumentExtractionResult {
  claimNumber?: string;
  policyNumber?: string;
  coverageAmount?: number;
  insuranceCompany?: string;
  deductible?: number;
  policyHolder?: string;
  lossDate?: string;
  confidence: 'high' | 'medium' | 'low';
  rawExtracted: Record<string, string>;
}

type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function toSupportedMime(mimeType: string): SupportedMimeType {
  const supported: SupportedMimeType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (supported.includes(mimeType as SupportedMimeType)) return mimeType as SupportedMimeType;
  return 'image/jpeg';
}

// ─── IICRC system prompt — cached across all damage classification calls ──────

const IICRC_SYSTEM_CONTENT = `You are an IICRC-certified water and fire damage restoration expert with deep knowledge of IICRC S500-2021 (Water Damage Restoration Standard) and S700-2025 (Fire and Smoke Damage Restoration Standard). You analyze damage photos and classify them according to these standards.

## IICRC S500 Water Damage Categories
- Category 1 (Clean Water): Sanitary source, low health risk. Broken supply lines, clean overflow, rainwater through clean surface.
- Category 2 (Gray Water): Significant contamination, moderate health risk. Dishwasher/washer overflow, toilet bowl with urine, hydrostatic seepage.
- Category 3 (Black Water): Grossly contaminated, high health risk. Sewage backup, flooding from rivers/streams, toilet overflow with feces.

Visual cues: Cat1 = clear/clean staining; Cat2 = grey/yellow tint, soap residue; Cat3 = brown/black staining, visible fecal matter.

## IICRC S500 Water Damage Classes
- Class 1 (Slow Evaporation): ≤5% of room materials wet. Concrete slab or low-porosity materials only. 1-3 days drying.
- Class 2 (Fast Evaporation): 5-40% wet. Walls wet below 24 inches. Carpet/pad, wall base affected. 3-5 days.
- Class 3 (Fastest Evaporation): >40% surfaces wet, walls >24 inches. Ceilings, insulation, upper walls. 5-10 days.
- Class 4 (Specialty Drying): Deep pocket saturation. Hardwood floors, concrete, stone, crawl spaces. 10-21 days.

Visual cues: tide line height → class; ceiling saturation = Class 3 minimum; floor type matters for Class 4.

## IICRC S700 Fire/Smoke Categories
- Wet Smoke: Smoldering, low-heat fire. Sticky, smeary, pungent residue. From rubber/plastics. Do not smear.
- Dry Smoke: High-heat, fast-burning. Powdery, non-smeary residue. From paper/wood. Easier to clean.
- Protein Smoke: Virtually invisible residue, extremely pungent. Discolors paints/varnishes. From kitchen fires.
- Fuel Oil Soot: Furnace puffback. Black, oily, pervasive throughout HVAC system.
- Other Smoke: Chemical/hazmat fires. Requires industrial hygienist assessment.

Visual cues: sticky/smeary residue = wet smoke; powdery black = dry smoke; strong odor with minimal visible = protein smoke; black film at AC vents = fuel oil.

## Affected Materials — Dry Standards
- Drywall: 14% dry standard
- Plywood subfloor: 16%
- Hardwood floor: 12% (Class 4 specialty)
- Concrete slab: 4% (Class 1 or 4)
- Carpet/pad: typically requires removal if saturated
- Framing lumber: 16%; OSB: 18%
- Insulation: typically requires removal if saturated

Provide IICRC-based classification with visual evidence reasoning and confidence level.`;

// ─── Moisture Meter OCR ───────────────────────────────────────────────────────

export async function analyzeMoistureMeter(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<MeterAnalysisResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    tools: [
      {
        name: 'read_moisture_meter',
        description: 'Extract the numeric moisture reading displayed on a moisture meter screen',
        input_schema: {
          type: 'object' as const,
          properties: {
            readingPct: {
              type: 'number',
              description: 'Numeric moisture reading shown on display (percentage or WME value)',
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Confidence in reading accuracy based on image clarity',
            },
            rawDisplay: {
              type: 'string',
              description: 'Exact characters/numbers as shown on the meter display',
            },
            units: {
              type: 'string',
              description: 'Unit shown (e.g., "%" for moisture content, "RH" for relative humidity, "WME" for wood moisture equivalent)',
            },
            notes: {
              type: 'string',
              description: 'Relevant notes about meter model, mode, scale, or reading context',
            },
          },
          required: ['readingPct', 'confidence', 'rawDisplay', 'units'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'read_moisture_meter' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: toSupportedMime(mimeType),
              data: imageBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'This is a photo of a moisture meter used in water damage restoration. Read the moisture percentage or value displayed on the meter screen and extract it as structured data.',
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Vision model did not return a meter reading');
  }

  const result = toolUse.input as MeterAnalysisResult;
  logger.info('Moisture meter OCR completed', { confidence: result.confidence, readingPct: result.readingPct });
  return result;
}

// ─── IICRC Damage Classification ─────────────────────────────────────────────

export async function classifyDamage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<DamageClassificationResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: IICRC_SYSTEM_CONTENT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'classify_damage',
        description: 'Classify water or fire/smoke damage according to IICRC S500/S700 standards',
        input_schema: {
          type: 'object' as const,
          properties: {
            jobType: {
              type: 'string',
              enum: ['water', 'fire', 'mold', 'unknown'],
              description: 'Primary damage type visible in the photo',
            },
            waterCategory: {
              type: 'string',
              enum: ['category_1', 'category_2', 'category_3'],
              description: 'IICRC S500 water category — only for water damage',
            },
            waterClass: {
              type: 'string',
              enum: ['class_1', 'class_2', 'class_3', 'class_4'],
              description: 'IICRC S500 water class based on extent and evaporation rate — only for water damage',
            },
            fireCategory: {
              type: 'string',
              enum: ['wet_smoke', 'dry_smoke', 'protein_smoke', 'fuel_oil_smoke', 'other_smoke'],
              description: 'IICRC S700 fire/smoke category — only for fire/smoke damage',
            },
            suggestedRooms: {
              type: 'array',
              items: { type: 'string' },
              description: 'Room types visually identifiable in the image (e.g., Kitchen, Living Room, Bathroom)',
            },
            affectedMaterials: {
              type: 'array',
              items: { type: 'string' },
              description: 'Materials visibly affected (use keys like drywall, hardwood_floor, carpet, insulation, concrete_slab, framing_lumber)',
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Confidence level in the classification',
            },
            reasoning: {
              type: 'string',
              description: 'Brief explanation of visual indicators used for classification (1-3 sentences)',
            },
            urgencyNotes: {
              type: 'string',
              description: 'Urgent observations — structural risk, sewage indicators, visible mold, Category 3 evidence',
            },
          },
          required: ['jobType', 'suggestedRooms', 'affectedMaterials', 'confidence', 'reasoning'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'classify_damage' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: toSupportedMime(mimeType),
              data: imageBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Analyze this damage photo and classify it according to IICRC S500/S700 standards. Identify damage type, category, class, affected rooms and materials. This classification will be reviewed and confirmed by a certified technician before being recorded.',
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Vision model did not return a damage classification');
  }

  const result = toolUse.input as DamageClassificationResult;
  logger.info('Damage classification completed', { jobType: result.jobType, confidence: result.confidence });
  return result;
}

// ─── Insurance Document Code Extraction ──────────────────────────────────────

export async function extractDocumentCodes(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<DocumentExtractionResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: 'You are an expert at reading insurance documents — declaration pages, Xactimate printouts, adjuster worksheets, and claim forms. Extract all relevant claim and policy codes with exact values as printed.',
    tools: [
      {
        name: 'extract_document_codes',
        description: 'Extract insurance codes and financial amounts from an insurance document image',
        input_schema: {
          type: 'object' as const,
          properties: {
            claimNumber: {
              type: 'string',
              description: 'Claim number exactly as printed (e.g., CLM-2024-087433)',
            },
            policyNumber: {
              type: 'string',
              description: 'Policy number exactly as printed',
            },
            coverageAmount: {
              type: 'number',
              description: 'Total coverage or replacement cost value in USD (numeric, no currency symbols)',
            },
            insuranceCompany: {
              type: 'string',
              description: 'Full name of the insurance company',
            },
            deductible: {
              type: 'number',
              description: 'Deductible amount in USD (numeric only)',
            },
            policyHolder: {
              type: 'string',
              description: 'Full name of the insured/policy holder',
            },
            lossDate: {
              type: 'string',
              description: 'Date of loss in ISO format YYYY-MM-DD',
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Confidence in extraction accuracy based on image quality',
            },
            rawExtracted: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'All other detected fields as key-value pairs (agentName, effectiveDate, propertyAddress, etc.)',
            },
          },
          required: ['confidence', 'rawExtracted'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_document_codes' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: toSupportedMime(mimeType),
              data: imageBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Extract all insurance codes, claim numbers, policy numbers, coverage amounts, and relevant data from this insurance document. Capture every relevant field visible. Values will be reviewed by the user before being applied.',
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Vision model did not return document extraction');
  }

  const result = toolUse.input as DocumentExtractionResult;
  logger.info('Document extraction completed', { confidence: result.confidence });
  return result;
}
