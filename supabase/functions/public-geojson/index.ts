/**
 * Edge Function: public-geojson
 * Public read-only GeoJSON API for Maine Drug Data Hub SSP Map.
 * Returns RFC 7946 FeatureCollection with Hedera verification links.
 * Privacy: census tract centroids only; no participant data; CONFIRMED only.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIRROR_NODE_BASE     = 'https://mainnet-public.mirrornode.hedera.com/api/v1';
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
  if (req.method!=='GET') return errFC('Method not allowed',405);

  const url = new URL(req.url);
  const census_tract = url.searchParams.get('census_tract');
  const program_type = url.searchParams.get('program_type');
  const hours_ahead  = Math.min(parseInt(url.searchParams.get('hours_ahead')?? '24'),72);

  let q = db.from('active_services_public').select(
    'id,provider_name,program_type,census_tract,geom_geojson,status,window_start,window_end,' +
    'delay_minutes,narcan_level,syringe_level,fentanyl_test_level,' +
    'hcs_topic_id,hcs_transaction_id,hcs_sequence_number,consensus_timestamp,' +
    'hcs_verify_url,zk_proof_id,zk_commitment,zk_public_signals,updated_at'
  ).gte('window_end',new Date().toISOString())
   .lte('window_start',new Date(Date.now()+hours_ahead*3600000).toISOString())
   .order('window_start',{ascending:true});

  if (census_tract) q = q.eq('census_tract',census_tract);
  if (program_type)  q = q.eq('program_type',program_type);

  const {data:rows,error} = await q;
  if (error) return errFC('Internal error',500);

  type Row = {
    id:string;provider_name:string;program_type:string;census_tract:string;
    geom_geojson:{coordinates:[number,number]};status:string;
    window_start:string;window_end:string;delay_minutes:number|null;
    narcan_level:string|null;syringe_level:string|null;fentanyl_test_level:string|null;
    hcs_topic_id:string|null;hcs_transaction_id:string|null;
    hcs_sequence_number:number|null;consensus_timestamp:string|null;
    hcs_verify_url:string|null;zk_proof_id:string|null;
    zk_commitment:string|null;zk_public_signals:unknown;updated_at:string;
  };

  const features = (rows??[]).map((r:Row) => ({
    type:'Feature',
    geometry:{type:'Point',coordinates:r.geom_geojson.coordinates},
    properties:{
      id:r.id, provider:r.provider_name, program_type:r.program_type,
      census_tract:r.census_tract,
      status:r.status, window_start:r.window_start, window_end:r.window_end,
      is_active_now: r.status==='active'||(r.status==='delayed'&&Date.now()>=new Date(r.window_start).getTime()&&Date.now()<=new Date(r.window_end).getTime()),
      delay_minutes:r.delay_minutes??null,
      supplies:{narcan:r.narcan_level??null,syringes:r.syringe_level??null,fentanyl_strips:r.fentanyl_test_level??null},
      verification:{
        hcs_topic_id:r.hcs_topic_id,hcs_transaction_id:r.hcs_transaction_id,
        hcs_sequence_number:r.hcs_sequence_number,consensus_timestamp:r.consensus_timestamp,
        verify_url:r.hcs_verify_url,
        mirror_node_url:r.hcs_topic_id?`${MIRROR_NODE_BASE}/topics/${r.hcs_topic_id}/messages/${r.hcs_sequence_number}`:null,
        zk_proof_id:r.zk_proof_id,zk_commitment:r.zk_commitment,zk_public_signals:r.zk_public_signals,
      },
      updated_at:r.updated_at,
    },
  }));

  const body = JSON.stringify({type:'FeatureCollection',features,metadata:{
    generated_at:new Date().toISOString(),record_count:features.length,hours_ahead,
    source:'SafeTracks · Azimuth Foundation Inc.',
    privacy_note:'Coordinates are census tract centroids only. No participant or exact-location data.',
    verification:'Each feature includes verify_url for independent Hedera Mirror Node verification.',
    mirror_node:MIRROR_NODE_BASE, license:'CC BY 4.0 — attribution: Azimuth Foundation Inc.',
  }},null,2);

  return new Response(body,{status:200,headers:{
    'Content-Type':'application/geo+json','Cache-Control':'public, max-age=300',
    'X-Privacy-Level':'census-tract-centroid-only',...cors(),
  }});
});

function cors(){return{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS'};}
function errFC(msg:string,status:number){
  return new Response(JSON.stringify({type:'FeatureCollection',features:[],error:msg}),
    {status,headers:{'Content-Type':'application/geo+json',...cors()}});
}
