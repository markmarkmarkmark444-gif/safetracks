/**
 * Edge Function: zk-hcs-submit
 * Processes PENDING_HCS service_status records:
 *   1. Generate ZK proof (mock Groth16; Phase 2: Aleo Halo2 via service_attestation.aleo)
 *   2. Submit status_hash + zk_commitment to Hedera HCS GIS topic
 *   3. Update service_status to CONFIRMED
 * Invoked by pg_cron every 5 minutes. Service-role auth only.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash, createHmac, randomBytes } from 'https://deno.land/std@0.168.0/node/crypto.ts';
import { Client, TopicMessageSubmitTransaction, TopicId, PrivateKey, AccountId, Hbar } from 'npm:@hashgraph/sdk@2.47.0';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STATUS_HMAC_SECRET   = Deno.env.get('STATUS_HMAC_SECRET')!;
const HEDERA_ACCOUNT_ID    = Deno.env.get('HEDERA_ACCOUNT_ID')??'';
const HEDERA_PRIVATE_KEY   = Deno.env.get('HEDERA_PRIVATE_KEY')??'';
const HEDERA_TOPIC_ID      = Deno.env.get('HEDERA_GIS_TOPIC_ID')??'';
const CIRCUIT_VERSION      = '0.1.0-mock';
const BATCH_SIZE           = 20;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
  const auth = req.headers.get('Authorization')??'';
  if (auth.replace('Bearer ','')!==SUPABASE_SERVICE_KEY) return json({error:'Service role required'},401);
  const results = await processBatch();
  return json({processed:results},200);
});

interface Rec { id:string;provider_id:string;census_tract:string;status:string;window_start:string;window_end:string;status_hash:string;narcan_level:string|null;syringe_level:string|null;fentanyl_test_level:string|null; }

async function processBatch() {
  const {data,error} = await db.from('service_status')
    .select('id,provider_id,census_tract,status,window_start,window_end,status_hash,narcan_level,syringe_level,fentanyl_test_level')
    .eq('hcs_status','PENDING_HCS')
    .lt('created_at',new Date(Date.now()-5*60000).toISOString())
    .order('created_at',{ascending:true}).limit(BATCH_SIZE);
  if (error) return [];
  const out=[];
  for (const r of data??[]) {
    out.push(await processOne(r as Rec));
    await new Promise(res=>setTimeout(res,200));
  }
  return out;
}

async function processOne(r:Rec) {
  try {
    const sc = sha256([r.status,r.narcan_level??'null',r.syringe_level??'null',r.fentanyl_test_level??'null'].join('|'));
    const wh = sha256(`${r.window_start}|${r.window_end}`);
    const rh = hmac(r.provider_id,STATUS_HMAC_SECRET);
    const pih = sha256([sc,wh,rh,r.census_tract,CIRCUIT_VERSION].join('||'));
    const vkh = sha256(`safetracks-gis-circuit-v${CIRCUIT_VERSION}`);
    const nonce = randomBytes(16).toString('hex');
    const proofData = JSON.stringify({protocol:'groth16_mock',nonce,
      pi_a:[hmac(pih,`pi_a_x:${nonce}`),hmac(pih,`pi_a_y:${nonce}`),'1'],
      pi_b:[[hmac(pih,`pi_b_x:${nonce}`),hmac(pih,`pi_b_y:${nonce}`)]],
      pi_c:[hmac(pih,`pi_c_x:${nonce}`),hmac(pih,`pi_c_y:${nonce}`),'1']});

    const {data:proofRow,error:pe} = await db.from('zk_service_proofs').insert({
      proof_input_hash:pih,proof_data:proofData,circuit_version:CIRCUIT_VERSION,
      verification_key_hash:vkh,is_valid:true,proof_system:'groth16-mock',
      public_signals:{status_commitment:sc,window_hash:wh,route_code_hash:rh,circuit_version:CIRCUIT_VERSION},
    }).select('id').single();
    if (pe) throw new Error(pe.message);

    const payload = {type:'safetracks_service_status_v1',
      provider_id_hash:hmac(r.provider_id,STATUS_HMAC_SECRET),
      census_tract:r.census_tract, status_hash:r.status_hash,
      zk_commitment:pih, window_start:r.window_start, anchored_at:new Date().toISOString()};

    const hcs = isHederaConfigured()
      ? await submitHcs(payload)
      : {topicId:'0.0.SIMULATED',transactionId:`0.0.SIMULATED@${Math.floor(Date.now()/1000)}.000000000`,sequenceNumber:0,consensusTimestamp:new Date().toISOString()};

    await db.from('service_status').update({
      hcs_status:'CONFIRMED',hcs_topic_id:hcs.topicId,
      hcs_transaction_id:hcs.transactionId,hcs_sequence_number:hcs.sequenceNumber,
      consensus_timestamp:hcs.consensusTimestamp,zk_proof_id:proofRow!.id,
    }).eq('id',r.id);

    return {id:r.id,status:'confirmed',txId:hcs.transactionId};
  } catch(e) {
    await db.from('service_status').update({hcs_status:'FAILED'}).eq('id',r.id);
    return {id:r.id,status:'failed',error:String(e)};
  }
}

let _client:Client|null=null;
function getClient(){
  if(_client)return _client;
  _client=Client.forMainnet();
  _client.setOperator(AccountId.fromString(HEDERA_ACCOUNT_ID),PrivateKey.fromStringDer(HEDERA_PRIVATE_KEY));
  _client.setDefaultMaxTransactionFee(new Hbar(1));
  return _client;
}
async function submitHcs(payload:unknown){
  const client=getClient();
  const tx=await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(HEDERA_TOPIC_ID)).setMessage(JSON.stringify(payload)).execute(client);
  const rec=await tx.getRecord(client);
  return {topicId:HEDERA_TOPIC_ID,transactionId:rec.transactionId?.toString()??'',
    sequenceNumber:Number(rec.topicSequenceNumber??0),consensusTimestamp:rec.consensusTimestamp?.toDate().toISOString()??new Date().toISOString()};
}
function isHederaConfigured(){return !!HEDERA_ACCOUNT_ID&&!!HEDERA_PRIVATE_KEY&&!!HEDERA_TOPIC_ID&&!HEDERA_ACCOUNT_ID.includes('XXXXXXX');}
function sha256(s:string){return createHash('sha256').update(s).digest('hex');}
function hmac(data:string,key:string){return createHmac('sha256',key).update(data).digest('hex');}
function cors(){return{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS'};}
function json(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json',...cors()}});}
