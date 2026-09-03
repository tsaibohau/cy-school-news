import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

type Action = "status" | "list" | "review"
type Body = { action?: Action; user_id?: string; status?: "approved" | "rejected" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function required(name: string) { const value = Deno.env.get(name); if (!value) throw new Error("missing_" + name.toLowerCase()); return value }
function secretKey() { const keys = Deno.env.get("SUPABASE_SECRET_KEYS"); if (keys) { const parsed = JSON.parse(keys) as Record<string,string>; if (parsed.default) return parsed.default } return required("SUPABASE_SERVICE_ROLE_KEY") }
function publishableKey() { const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"); if (keys) { const parsed = JSON.parse(keys) as Record<string,string>; if (parsed.default) return parsed.default } return required("SUPABASE_ANON_KEY") }
function allowed(req: Request) { return req.headers.get("origin") === "https://cy-school-news-staging.vercel.app" }
function reply(req: Request, body: Record<string,unknown>, status: number) { return Response.json(body,{status,headers:allowed(req)?{"access-control-allow-origin":"https://cy-school-news-staging.vercel.app","access-control-allow-headers":"apikey, authorization, content-type","access-control-allow-methods":"POST, OPTIONS","vary":"origin"}:{}}) }
Deno.serve(async req => {
  if (req.method === "OPTIONS") return reply(req,{ok:true},200)
  if (req.method !== "POST" || !allowed(req)) return reply(req,{error:"not_found"},404)
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")
    if (!token) return reply(req,{error:"unauthorized"},401)
    const url=required("SUPABASE_URL")
    const callerClient=createClient(url,publishableKey(),{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:callerData,error:callerError}=await callerClient.auth.getUser(token)
    const caller=callerData.user
    if(callerError||!caller) return reply(req,{error:"unauthorized"},401)
    const server=createClient(url,secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:admin}=await server.from("app_admins").select("user_id,revoked_at").eq("user_id",caller.id).maybeSingle()
    if(!admin||admin.revoked_at) return reply(req,{error:"forbidden"},403)
    const body=await req.json().catch(()=>null) as Body|null
    if(body?.action==="status") return reply(req,{admin:true},200)
    if(body?.action==="list"){
      const [{data:users,error:userError},{data:access,error:accessError}]=await Promise.all([
        server.auth.admin.listUsers({page:1,perPage:200}),server.from("account_access").select("user_id,status,requested_at,reviewed_at")
      ])
      if(userError||accessError) throw userError||accessError
      const states=new Map((access||[]).map(row=>[row.user_id,row]))
      return reply(req,{users:(users.users||[]).map(user=>({id:user.id,email:user.email||"",status:states.get(user.id)?.status||"pending",requested_at:states.get(user.id)?.requested_at||user.created_at,last_sign_in_at:user.last_sign_in_at}))},200)
    }
    if(body?.action==="review"&&UUID.test(String(body.user_id||""))&&(body.status==="approved"||body.status==="rejected")){
      const {data,error}=await server.from("account_access").update({status:body.status,reviewed_at:new Date().toISOString(),reviewed_by:caller.id}).eq("user_id",body.user_id).select("user_id").maybeSingle()
      if(error||!data) return reply(req,{error:"not_found"},404)
      const audit=await server.from("admin_audit_log").insert({actor_id:caller.id,action:body.status==="approved"?"account_approved":"account_rejected",target_user_id:data.user_id})
      if(audit.error) throw audit.error
      return reply(req,{status:body.status},200)
    }
    return reply(req,{error:"invalid_action"},400)
  } catch(error) { console.error(error); return reply(req,{error:"server_error"},500) }
})