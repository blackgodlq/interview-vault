// Public desktop backend. Keys stay in the process; never in static files.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const ROOT=__dirname,DIST=path.join(ROOT,'dist'),HOST='0.0.0.0',PORT=18765;
const interfaces=Object.entries(os.networkInterfaces()).flatMap(([name,items])=>items.filter(i=>i.family==='IPv4').map(i=>({...i,name})));
const allowedHosts=new Set(['127.0.0.1','localhost',os.hostname().toLowerCase(),...interfaces.map(i=>i.address)].map(host=>host+':'+PORT));
const lanUrls=interfaces.filter(i=>!i.internal&&!/VMware|Mihomo|VMnet|vEthernet/i.test(i.name)&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)).map(i=>'http://'+i.address+':'+PORT);
const {Engine}=require('./dist/engine.js');require('./dist/answers.js');const knowledgeImport=require('./dist/knowledge-import.js');
const baseData=JSON.parse(fs.readFileSync(path.join(DIST,'knowledge.json'),'utf8')),cache=new Map();
const storeDir=path.join(ROOT,'knowledge-data'),storeFile=path.join(storeDir,'shared.json');
let shared=fs.existsSync(storeFile)?JSON.parse(fs.readFileSync(storeFile,'utf8')):{revision:'initial',entries:[]};
if(!Array.isArray(shared.entries)||typeof shared.revision!=='string')throw new Error('新增知识库文件格式错误，请先恢复备份。');
let data,engine,byId,writeQueue=Promise.resolve();
function rebuild(){data=knowledgeImport.merge(baseData,shared.entries,shared.revision);engine=new Engine(data);byId=new Map(data.chunks.map(c=>[c.id,c]));cache.clear();}
rebuild();
function canManage(req){return knowledgeImport.canManageDesktop(req.socket.remoteAddress,Object.values(os.networkInterfaces()).flat().filter(Boolean).map(i=>i.address));}
function mutateKnowledge(change){const operation=writeQueue.then(async()=>{const result=await change(shared.entries);if(result.duplicate)return result;const next={revision:crypto.randomUUID(),entries:result.entries};fs.mkdirSync(storeDir,{recursive:true});fs.writeFileSync(storeFile+'.tmp',JSON.stringify(next),'utf8');fs.renameSync(storeFile+'.tmp',storeFile);shared=next;rebuild();return result;});writeQueue=operation.catch(()=>{});return operation;}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
function readBody(req,limit=12000){return new Promise((resolve,reject)=>{const chunks=[];let size=0,tooLarge=false;req.on('data',b=>{size+=b.length;if(size>limit){tooLarge=true;return;}chunks.push(b);});req.on('end',()=>{if(tooLarge){const e=new Error('请求内容过大。');e.status=413;return reject(e);}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{const e=new Error('请求格式错误。');e.status=400;reject(e);}});req.on('error',reject);});}
async function start(){const {answerQuestion,streamInterviewAnswer,MODEL}=await import('./rag.mjs');
 const server=http.createServer(async(req,res)=>{
  try{
   const requestHost=(req.headers.host||'').toLowerCase();
   let publicIpHost=false;
   try{const authority=new URL('http://'+requestHost);publicIpHost=!!net.isIP(authority.hostname.replace(/^\[|\]$/g,''))&&authority.port===String(PORT)&&!authority.username&&!authority.password&&authority.pathname==='/';}catch{}
   // Accept an external IP in Host when a router forwards port 18765 here.
   if(!allowedHosts.has(requestHost)&&!publicIpHost)return json(res,403,{error:'Host 不允许。'});
   const origin=req.headers.origin;if(origin&&origin!=='http://'+req.headers.host)return json(res,403,{error:'不允许跨站请求。'});
   const url=new URL(req.url,'http://127.0.0.1:'+PORT);
   if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{app:'interview-agent-deepseek-v1',configured:!!process.env.DEEPSEEK_API_KEY,model:MODEL,thinking:false,desktop:true,knowledgeVersion:baseData.version,knowledgeRevision:shared.revision,canManageKnowledge:canManage(req),lanAccess:true,networkMode:'any-source',lanUrls});
   if(url.pathname==='/api/knowledge'&&req.method==='GET')return json(res,200,{...shared,canManage:canManage(req),storage:'desktop'});
   if(url.pathname==='/api/knowledge'&&req.method==='POST'||/^\/api\/knowledge\/extra-[a-f0-9-]+$/.test(url.pathname)&&['PUT','PATCH'].includes(req.method)){
    if(!canManage(req))return json(res,403,{error:'新增知识由本机管理。请在运行智能体的电脑上打开页面导入。'});
    if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'只接受 JSON 请求。'});
    const body=await readBody(req,2100000),id=url.pathname.split('/')[3];
    const result=await mutateKnowledge(async entries=>{
     if(req.method==='PATCH'){const old=entries.find(e=>e.id===id);if(!old||typeof body.enabled!=='boolean'){const e=new Error('资料不存在或状态无效。');e.status=400;throw e;}const entry={...old,enabled:body.enabled,updatedAt:new Date().toISOString()};return {entries:entries.map(e=>e.id===id?entry:e),entry};}
     const created=await knowledgeImport.createEntry(body,entries,req.method==='PUT'?id:undefined);if(created.duplicate)return created;
     return {...created,entries:req.method==='PUT'?entries.map(e=>e.id===id?created.entry:e):[...entries,created.entry]};
    });return json(res,200,{entry:result.entry,duplicate:!!result.duplicate,revision:shared.revision});
   }
   if(url.pathname==='/api/interview-answer'&&req.method==='POST'){
    if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'只接受 JSON 请求。'});
    const body=await readBody(req);
    if(res.destroyed)return;
    const controller=new AbortController();
    res.once('close',()=>controller.abort());
    const stream=await streamInterviewAnswer({query:body?.query,apiKey:body?.apiKey||process.env.DEEPSEEK_API_KEY,signal:controller.signal});
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
    const {Readable}=require('node:stream');
    const {pipeline}=require('node:stream/promises');
    await pipeline(Readable.fromWeb(stream),res);
    return;
   }
   if(url.pathname==='/api/answer'&&req.method==='POST'){
    if(!req.headers['content-type']?.includes('application/json'))return json(res,415,{error:'只接受 JSON 请求。'});
    const body=await readBody(req);const result=await answerQuestion({query:body.query,scope:body.scope,apiKey:body.apiKey||process.env.DEEPSEEK_API_KEY,engine,byId,cache});return json(res,200,result);
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
   const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html',file=path.resolve(DIST,relative);
   if(!file.startsWith(DIST+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'Not found'});
   res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
   if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'请求未完成，请重试。'});else res.end();}
 });server.on('error',e=>{if(e.code==='EADDRINUSE')process.exit(0);console.error('本地服务启动失败：'+e.code);process.exit(1);});server.listen(PORT,HOST,()=>console.log('面试知识库已启动：http://127.0.0.1:'+PORT+'\n局域网入口：'+lanUrls.join('、')));
}
start();
