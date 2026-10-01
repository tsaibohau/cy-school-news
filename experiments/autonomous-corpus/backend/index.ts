import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

const project = "sshovpnepgswzvjwjuyz";
const base = Deno.env.get("SUPABASE_URL")!;
if (!base.includes(project)) throw new Error("Training project required");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const bucket = "autonomous-corpus-private";
const branch = "refs/heads/codex/autonomous-corpus-acquisition";
const audience = "cy-school-news-autonomous-training";
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const headers = {apikey:key, Authorization:`Bearer ${key}`};
const json = (x:unknown, status=200) => new Response(JSON.stringify(x), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function sha(data:Uint8Array) {return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",data))).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function db(table:string,query:string) {
  const r=await fetch(`${base}/rest/v1/${table}?${query}`,{headers});
  if(!r.ok) throw new Error("control query failed"); return await r.json();
}
function objectURL(path:string) {return `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;}
Deno.serve(async req => {
  try {
    if(req.method!=="POST") return json({error:"method"},405);
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
    if(!token) return json({error:"unauthorized"},401);
    let run="",control=false;
    if(token.split(".").length===3) {
      const {payload:p}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience,algorithms:["RS256"]});
      if(p.repository!=="tsaibohau/cy-school-news" || p.repository_id!=="1329797847" || p.repository_owner_id!=="315374876" || p.ref!==branch || p.event_name!=="push" || p.workflow_ref!==`tsaibohau/cy-school-news/.github/workflows/autonomous-acquisition.yml@${branch}`) return json({error:"identity"},403);
      const rows=await db("autonomous_allowed_commits",`sha=eq.${encodeURIComponent(String(p.sha))}&select=sha,expires_at`);
      if(!rows.length || Date.parse(rows[0].expires_at)<Date.now())return json({error:"commit not authorized"},403);
      run=String(p.run_id); if(!/^\d+$/.test(run))return json({error:"run"},403);
    } else {
      const hash=await sha(new TextEncoder().encode(token));
      const rows=await db("autonomous_backend_access",`token_hash=eq.${hash}&select=expires_at`);
      if(!rows.length || Date.parse(rows[0].expires_at)<Date.now())return json({error:"unauthorized"},401);
      control=true;
    }
    const length=Number(req.headers.get("content-length")||0);
    if(length>13000000)return json({error:"size"},413);
    const input=await req.json();
    if(input.op==="init" && control) {
      let r=await fetch(`${base}/storage/v1/bucket/${bucket}`,{headers});
      if(r.status===404 || r.status===400) r=await fetch(`${base}/storage/v1/bucket`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:12000000})});
      if(!r.ok)return json({error:"bucket setup",status:r.status},502);
      const check=await fetch(`${base}/storage/v1/bucket/${bucket}`,{headers});
      const b=await check.json();if(b.public!==false)throw new Error("bucket must be private");
      return json({bucket,private:true});
    }
    const path=String(input.path||"");
    if(!/^runs\/\d+\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..") || (!control&&!path.startsWith(`runs/${run}/`)))return json({error:"path"},403);
    if(input.op==="put") {
      const data=Uint8Array.from(atob(input.data),c=>c.charCodeAt(0));
      if(data.length>12000000)return json({error:"size"},413);
      const hash=await sha(data);if(hash!==input.sha256)return json({error:"hash"},400);
      const r=await fetch(objectURL(path),{method:"POST",headers:{...headers,"Content-Type":"application/octet-stream","x-upsert":"false"},body:data});
      if(!r.ok)return json({error:"write",status:r.status},502);
      const back=await fetch(objectURL(path),{headers});
      if(!back.ok || await sha(new Uint8Array(await back.arrayBuffer()))!==hash)throw new Error("read-back hash failed");
      return json({path,sha256:hash,verified:true});
    }
    if(input.op==="get" && control) {
      const r=await fetch(objectURL(path),{headers});if(!r.ok)return json({error:"read",status:r.status},404);
      const data=new Uint8Array(await r.arrayBuffer());
      if(input.format==="json")return json({sha256:await sha(data),data:JSON.parse(new TextDecoder().decode(data))});
      let binary="";for(const b of data)binary+=String.fromCharCode(b);
      return json({sha256:await sha(data),data:btoa(binary)});
    }
    return json({error:"operation"},403);
  } catch {return json({error:"request rejected"},400);}
});
