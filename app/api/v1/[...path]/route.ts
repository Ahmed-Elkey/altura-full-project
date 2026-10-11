import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
// Container-only signed visitor identity; never accepts browser forwarding headers.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {visitorIdentity}=require('../../../../deploy/proxy-visitor.cjs') as {visitorIdentity:(cookie:string|undefined,key:string)=>{cookie:string;issue:boolean;ip:string}};
export const dynamic = 'force-dynamic';
const hopHeaders=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','content-length','content-encoding'];
async function proxy(request:NextRequest,{params}:{params:Promise<{path:string[]}>}) {
 const base=process.env.COMMERCE_INTERNAL_API_URL;
 if(!base)return new Response(null,{status:404});
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){
  const origin=request.headers.get('origin');
  if(origin){try{if(new URL(origin).host!==request.headers.get('host'))return Response.json({message:'Invalid request origin'},{status:403});}catch{return new Response(null,{status:403});}}
 }
 const {path}=await params;const url=new URL(`${base.replace(/\/$/,'')}/${path.map(encodeURIComponent).join('/')}`);url.search=request.nextUrl.search;
 const headers=new Headers(request.headers);for(const key of [...hopHeaders,'host','origin','referer','x-forwarded-host','x-forwarded-proto','x-forwarded-for'])headers.delete(key);
 const keyFile=process.env.COMMERCE_PROXY_KEY_FILE;
 const visitor=keyFile?visitorIdentity(request.cookies.get('altura_demo_visitor')?.value,readFileSync(keyFile,'utf8')):null;
 if(visitor)headers.set('x-forwarded-for',visitor.ip);
 try{
  const upstream=await fetch(url,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer(),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const output=new Headers(upstream.headers);for(const key of hopHeaders)output.delete(key);output.set('Cache-Control','private, no-store');
  if(visitor?.issue)output.append('Set-Cookie',`altura_demo_visitor=${visitor.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${request.nextUrl.protocol==='https:'||request.headers.get('x-forwarded-proto')==='https'?'; Secure':''}`);
  return new Response(upstream.body,{status:upstream.status,headers:output});
 }catch{return Response.json({message:'Commerce service is temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export {proxy as GET,proxy as POST,proxy as PUT,proxy as PATCH,proxy as DELETE,proxy as HEAD,proxy as OPTIONS};
