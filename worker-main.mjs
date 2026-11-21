// Private hosted Site: durable shared knowledge is stored in its R2 bucket.
let edgeEngine=new globalThis.InterviewEngine(KNOWLEDGE),edgeById=new Map(KNOWLEDGE.chunks.map(c=>[c.id,c]));
const edgeCache=new Map();let sharedMemo=null,sharedUntil=0,edgeRevision='';
const edgeJSON=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const STORE_KEY='knowledge/shared.json';
async function sharedKnowledge(env,fresh=false){
 if(!env.BUCKET)throw new RagError('共享知识存储未连接，请稍后重试。',503);
 if(!fresh&&sharedMemo&&Date.now()<sharedUntil)return sharedMemo;
 const object=await env.BUCKET.get(STORE_KEY),state=object?await object.json():{revision:'initial',entries:[]};
 sharedMemo={...state,etag:object?.etag};sharedUntil=Date.now()+2000;return sharedMemo;
}
function syncEdge(shared){if(shared.revision===edgeRevision)return;const data=globalThis.KnowledgeImport.merge(KNOWLEDGE,shared.entries,shared.revision);edgeEngine=new globalThis.InterviewEngine(data);edgeById=new Map(data.chunks.map(c=>[c.id,c]));edgeRevision=shared.revision;edgeCache.clear();}
async function mutateShared(env,change){
 for(let attempt=0;attempt<4;attempt++){
  const current=await sharedKnowledge(env,true),result=await change(current.entries);if(result.duplicate)return {...result,revision:current.revision};
  const next={revision:crypto.randomUUID(),entries:result.entries};
  const saved=await env.BUCKET.put(STORE_KEY,JSON.stringify(next),{onlyIf:current.etag?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  if(saved){sharedMemo={...next,etag:saved.etag};sharedUntil=Date.now()+2000;syncEdge(next);return {...result,revision:next.revision};}
 }
 throw new RagError('知识库正在更新，请重试保存。',409);
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),canManage=!!request.headers.get('oai-authenticated-user-id');
  try{
   if(url.pathname==='/api/status'&&request.method==='GET')return edgeJSON({app:'interview-agent-deepseek-v1',configured:!!env.DEEPSEEK_API_KEY,model:MODEL,thinking:false,desktop:false,knowledgeVersion:KNOWLEDGE.version,canManageKnowledge:canManage});
   if(url.pathname==='/api/knowledge'&&request.method==='GET'){const shared=await sharedKnowledge(env,true);return edgeJSON({revision:shared.revision,entries:shared.entries,canManage,storage:'cloud'});}
   if(request.method==='POST'||request.method==='PUT'||request.method==='PATCH'){
    if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return edgeJSON({error:'不允许跨站请求。'},403);
    if(!request.headers.get('Content-Type')?.includes('application/json'))return edgeJSON({error:'只接受 JSON 请求。'},415);
    const importing=url.pathname==='/api/knowledge'||/^\/api\/knowledge\/extra-[a-f0-9-]+$/.test(url.pathname);
    if(importing&&!canManage)return edgeJSON({error:'请使用站点所有者账户登录后管理知识。'},403);
    const text=await request.text();if(text.length>(importing?600000:12000))return edgeJSON({error:'请求过大。'},413);
    let body;try{body=JSON.parse(text);}catch{return edgeJSON({error:'请求格式错误。'},400);}
    if(importing){
     const id=url.pathname.split('/')[3];
     if(request.method==='POST'&&id||request.method!=='POST'&&!id)return edgeJSON({error:'请求方式不正确。'},405);
     const result=await mutateShared(env,async entries=>{
      if(request.method==='PATCH'){const old=entries.find(e=>e.id===id);if(!old||typeof body.enabled!=='boolean')throw new RagError('资料不存在或状态无效。',400);const entry={...old,enabled:body.enabled,updatedAt:new Date().toISOString()};return {entries:entries.map(e=>e.id===id?entry:e),entry};}
      const created=await globalThis.KnowledgeImport.createEntry(body,entries,request.method==='PUT'?id:undefined);if(created.duplicate)return created;
      return {...created,entries:request.method==='PUT'?entries.map(e=>e.id===id?created.entry:e):[...entries,created.entry]};
     });return edgeJSON({entry:result.entry,duplicate:!!result.duplicate,revision:result.revision});
    }
    if(url.pathname==='/api/answer'&&request.method==='POST'){const shared=await sharedKnowledge(env);syncEdge(shared);return edgeJSON(await answerQuestion({query:body.query,scope:body.scope,apiKey:body.apiKey||env.DEEPSEEK_API_KEY,engine:edgeEngine,byId:edgeById,cache:edgeCache}));}
   }
   if(request.method!=='GET'&&request.method!=='HEAD')return edgeJSON({error:'Method not allowed'},405);
   let name;try{name=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';}catch{return edgeJSON({error:'Not found'},404);}
   if(!Object.hasOwn(ASSETS,name))return edgeJSON({error:'Not found'},404);
   const asset=ASSETS[name];return new Response(request.method==='HEAD'?null:asset.text,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
  }catch(e){return edgeJSON({error:e.status?e.message:'共享知识服务暂时不可用，请重试。'},e.status||500);}
 }
};
