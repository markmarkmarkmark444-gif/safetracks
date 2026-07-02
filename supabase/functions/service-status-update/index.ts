/**
 * Edge Function: service-status-update
 * Validates worker JWT, derives census tract centroid from PostGIS,
 * writes service_status with hcs_status=PENDING_HCS.
 * See docs/GIS-LAYER-DESIGN.md Section 3 for full flow.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STATUS_HMAC_SECRET = Deno.env.get('STATUS_HMAC_SECRET')!;
const VALID_STATUSES     = ['scheduled','active','delayed','completed','cancelled'] as const;
const VALID_SUPPLY       = ['well_stocked','low','out'] as const;
type SupplyLevel = typeof VALID_SUPPLY[number];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:corsHeaders()});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);

  const jwt = req.headers.get('Authorization')?.replace('Bearer ','');
  if (!jwt) return json({error:'Authentication required'},401);

  const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!);
  const {data:{user},error:authErr} = await anonClient.auth.getUser(jwt);
  if (authErr || !user) return json({error:'Invalid token'},401);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let body: Record<string,unknown>;
  try { body = await req.json(); } catch { return json({error:'Invalid JSON'},400); }

  const err = validate(body);
  if (err) return json({error:err},422);

  const {data:tractRow,error:tractErr} = await db
    .from('maine_census_tracts')
    .select('geoid, ST_AsGeoJSON(ST_Centroid(geom::geometry))::jsonb as centroid_geojson')
    .eq('geoid', body.census_tract)
    .single();
  if (tractErr || !tractRow) return json({error:`Unknown census tract: ${body.census_tract}`},422);

  const [lon,lat] = (tractRow.centroid_geojson as {coordinates:[number,number]}).coordinates;

  const {data:provider} = await db.from('service_providers')
    .select('id,census_tracts,is_active').eq('id',body.provider_id).single();
  if (!provider?.is_active) return json({error:'Provider not found or inactive'},404);
  if (!(provider.census_tracts as string[]).includes(body.census_tract as string))
    return json({error:'Provider not authorized for this census tract'},403);

  const canonical = JSON.stringify({
    provider_id:body.provider_id, census_tract:body.census_tract,
    service_date:body.service_date, window_start:body.window_start,
    window_end:body.window_end, status:body.status,
    narcan_level:body.narcan_level??null, syringe_level:body.syringe_level??null,
    fentanyl_test_level:body.fentanyl_test_level??null,
  });
  const statusHash = createHmac('sha256',STATUS_HMAC_SECRET).update(canonical).digest('hex');

  const {data:existing} = await db.from('service_status')
    .select('id,hcs_status').eq('provider_id',body.provider_id)
    .eq('service_date',body.service_date).eq('window_start',body.window_start).maybeSingle();
  if (existing) return json({id:existing.id,hcs_status:existing.hcs_status,duplicate:true},200);

  const {data:inserted,error:insertErr} = await db.from('service_status').insert({
    provider_id:body.provider_id, route_id:body.route_id??null,
    census_tract:body.census_tract, geom:`SRID=4326;POINT(${lon} ${lat})`,
    service_date:body.service_date, window_start:body.window_start, window_end:body.window_end,
    status:body.status, delay_minutes:body.delay_minutes??null,
    narcan_level:coerce(body.narcan_level as string|undefined),
    syringe_level:coerce(body.syringe_level as string|undefined),
    fentanyl_test_level:coerce(body.fentanyl_test_level as string|undefined),
    shift_code:(body.shift_code as string|undefined)?.replace(/[^A-Za-z0-9\-_]/g,'').slice(0,32)||null,
    status_hash:statusHash, hcs_status:'PENDING_HCS',
  }).select('id,hcs_status,census_tract,status,window_start,window_end').single();

  if (insertErr) return json({error:'Failed to record status update'},500);
  return json({...inserted,message:'Status recorded. HCS anchoring queued.'},201);
});

function validate(b:Record<string,unknown>):string|null {
  if (!b.provider_id||typeof b.provider_id!=='string') return 'provider_id required';
  if (!b.census_tract||!/^\d{11}$/.test(b.census_tract as string)) return 'census_tract must be 11-digit FIPS';
  if (!b.service_date||!/^\d{4}-\d{2}-\d{2}$/.test(b.service_date as string)) return 'service_date must be YYYY-MM-DD';
  if (!b.window_start||isNaN(Date.parse(b.window_start as string))) return 'window_start must be ISO datetime';
  if (!b.window_end||isNaN(Date.parse(b.window_end as string))) return 'window_end must be ISO datetime';
  if (Date.parse(b.window_end as string)<=Date.parse(b.window_start as string)) return 'window_end must be after window_start';
  if (!VALID_STATUSES.includes(b.status as typeof VALID_STATUSES[number])) return 'invalid status';
  return null;
}
function coerce(v:string|undefined):SupplyLevel|null {
  if (!v) return null;
  return VALID_SUPPLY.includes(v.toLowerCase() as SupplyLevel)?v.toLowerCase() as SupplyLevel:null;
}
function corsHeaders(){return{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...corsHeaders()}});}
