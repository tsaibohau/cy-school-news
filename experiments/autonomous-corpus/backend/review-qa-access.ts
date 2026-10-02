import { createRemoteJWKSet,jwtVerify } from "https://esm.sh/jose@5.9.6";
const base=Deno.env.get("SUPABASE_URL")!;if(!base.includes("sshovpnepgswzvjwjuyz"))throw new Error("Training only");
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;const headers={apikey:key,Authorization:`Bearer ${key}`};
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{try{
 if(req.method!=="POST")return json({error:"method"},405);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
 const {payload:p}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:"cy-school-news-autonomous-training",algorithms:["RS256"]});
 if(p.repository!=="tsaibohau/cy-school-news"||p.repository_id!=="1329797847"||p.repository_owner_id!=="315374876"||p.ref!=="refs/heads/codex/autonomous-corpus-acquisition"||p.event_name!=="push"||p.workflow_ref!=="tsaibohau/cy-school-news/.github/workflows/autonomous-acquisition.yml@refs/heads/codex/autonomous-corpus-acquisition")return json({error:"identity"},403);
 const r=await fetch(`${base}/rest/v1/autonomous_allowed_commits?sha=eq.${encodeURIComponent(String(p.sha))}&select=expires_at`,{headers});if(!r.ok)return json({error:"authorization"},403);
 const rows=await r.json();if(rows.length!==1||Date.parse(rows[0].expires_at)<Date.now())return json({error:"authorization"},403);
 const q=await fetch(`${base}/storage/v1/object/autonomous-corpus-private/runs/36994119597/qa-review-access.json`,{headers});if(!q.ok)return json({error:"not ready"},503);
 const config=await q.json();if(p.sha!==config.allowed_sha||Date.parse(config.expires_at)<Date.now())return json({error:"scope"},403);
 return json({access:config.access});
}catch{return json({error:"unauthorized"},401);}});