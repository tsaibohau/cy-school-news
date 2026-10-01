// Training-only read capability: no login form, no public full-content asset,
// no direct browser Storage access. Each capability reads one immutable <=15 queue.
const base=Deno.env.get('SUPABASE_URL')!;
if(!base.includes('sshovpnepgswzvjwjuyz'))throw new Error('Training only');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const auth={apikey:key,Authorization:`Bearer ${key}`};
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const allowed=/^https:\/\/cy-school-news-review(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin);
 const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})};
 const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
 if(origin&&!allowed)return json({error:'origin'},403);
 if(req.method!=='POST')return json({error:'method'},405);
 try{
  const input=await req.json();if(typeof input.access!=='string'||input.access.length>128)return json({error:'unauthorized'},401);
  const h=await hash(input.access);
  const r=await fetch(`${base}/rest/v1/autonomous_review_capabilities?token_hash=eq.${h}&select=batch_path,expires_at,enabled`,{headers:auth});
  if(!r.ok)return json({error:'unauthorized'},401);const rows=await r.json();
  if(rows.length!==1||!rows[0].enabled||Date.parse(rows[0].expires_at)<Date.now())return json({error:'unauthorized'},401);
  const path=rows[0].batch_path;if(!/^runs\/\d+\/batch-[ab]-review\.json$/.test(path))return json({error:'scope'},403);
  const s=await fetch(`${base}/storage/v1/object/autonomous-corpus-private/${path}`,{headers:auth});
  if(!s.ok)return json({error:'not_ready'},503);const batch=await s.json();
  if(!batch.model_freeze_sha256||batch.records.length>15)return json({error:'invalid_queue'},503);
  for(const record of batch.records){if('label' in record||'model_label' in record||'citations' in record||'confidence' in record)return json({error:'blind_gate'},503);}
  return json(batch);
 }catch{return json({error:'request'},400);}
});
