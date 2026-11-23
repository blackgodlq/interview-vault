(() => {
'use strict';
const files=new Map();
const maxFiles=500,maxBytes=8*1024*1024,maxFileBytes=256*1024;
const supported=/\.(?:java|kt|scala|py|js|jsx|mjs|cjs|ts|tsx|go|rs|cs|cpp|c|h|sql|xml|json|ya?ml|toml|ini|properties|sh|ps1|md|txt|gradle|vue|html|css)$/i;
const entryPoint=/(?:^|\/)(?:readme(?:\.\w+)?|pom\.xml|build\.gradle(?:\.kts)?|pyproject\.toml|requirements\.txt|package\.json|dockerfile|(?:main|app|server)\.(?:py|java|ts|js)|\w+Application\.java)$/i;
const ignored=/(?:^|\/)(?:\.[^/]+|node_modules|vendor|target|build|dist|venv|__pycache__|coverage|[^/]*(?:secret|credential)[^/]*|[^/]*\.lock)(?:\/|$)/i;
const equivalents=[
 ['登录','认证','鉴权','login','auth','jwt'],
 ['权限','授权','permission','authorization','security'],
 ['缓存','redis','cache','caffeine'],
 ['数据库','持久化','事务','repository','mapper','transaction','sql'],
 ['接口','路由','api','controller','router','endpoint'],
 ['智能体','agent','langgraph','langchain','workflow','工作流'],
 ['检索','search','retrieval','rag','召回'],
 ['向量','embedding','vector'],
 ['重试','retry','backoff'],
 ['消息','队列','queue','kafka','rabbitmq']
];
const common=new Set('const let var package import public private static final class def self return string int void true false none null this 项目 代码 实现 怎么 如何 什么 你们 你的 这个 一个 功能 具体 哪些 用到 介绍'.split(' '));
function terms(text){
 const found=new Set();
 for(const part of text.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().match(/[a-z][a-z0-9]+|[\u3400-\u9fff]+/g)||[]){
  if(/^[a-z]/.test(part))found.add(part);
  else for(let i=0;i+1<part.length;i++)found.add(part.slice(i,i+2));
 }
 return [...found].filter(term=>!common.has(term));
}
function redact(text){
 return text.replace(/-----BEGIN [^\n]*PRIVATE KEY-----[\s\S]*?-----END [^\n]*PRIVATE KEY-----/g,
  key=>key.replace(/[^\r\n]+/g,'[已隐藏密钥]'))
 .replace(/^.*(?:api[_-]?key|password|passwd|secret|access[_-]?token|private[_-]?key|authorization)\s*["']?\s*[:=].*$/gim,'[已隐藏敏感配置行]')
 .replace(/\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,}|AKIA[A-Z0-9]{16})\b/g,'[已隐藏密钥]');
}
function indexFile(path,text,size,label=path){
 const lines=redact(text).split(/\r?\n/),chunks=[];
 const pathTerms=new Set(terms(path));
 for(let offset=0;offset<lines.length;offset+=28){
  const window=lines.slice(offset,offset+36).map(line=>line.slice(0,300));
  const body=window.join('\n').trimEnd();
  if(body.trim())chunks.push({path:label,group:path.includes("/")?path.split("/")[0]:path.split(".").at(-1),entry:entryPoint.test(path),line:offset+1,text:body,terms:new Set(terms(body)),pathTerms});
  if(offset+36>=lines.length)break;
 }
 return {size,chunks};
}
function search(question,previous=''){
 if(!files.size)return [];
 const q=question.toLowerCase();
 const broad=/(?:项目|工程|代码库|系统).{0,12}(?:结构|架构|流程|技术栈|如何设计)|介绍.{0,8}(?:项目|工程)|技术栈|目录结构|整体架构|(?:项目|工程).{0,10}(?:负责|做了什么)/.test(q);
 const focused=/(?:项目|工程|代码|你们|你的|我们|仓库)/.test(q);
 const primary=new Set(terms(question)),secondary=new Set(terms(previous));
 for(const group of equivalents)if(group.some(term=>primary.has(term)||q.includes(term)))for(const term of group)primary.add(term);
 const ranked=[];
 for(const {chunks} of files.values())for(const chunk of chunks){
  let score=broad&&chunk.line===1&&chunk.entry?8:0;
  for(const term of primary){
   if(chunk.pathTerms.has(term))score+=term.length>=4?8:4;
   else if(chunk.terms.has(term))score+=term.length>=4?4:2;
  }
  if(previous&&(/^(?:那|然后|继续|它|这种|这个|再|追问)/.test(q)||focused)){
   for(const term of secondary){
    if(chunk.pathTerms.has(term))score+=2;
    else if(chunk.terms.has(term))score+=1;
   }
  }
  if(score>=4)ranked.push({chunk,score});
 }
 ranked.sort((a,b)=>b.score-a.score);
 if(broad){
  const groups=new Set(),first=[],rest=[];
  for(const hit of ranked){
   (groups.has(hit.chunk.group)?rest:first).push(hit);
   groups.add(hit.chunk.group);
  }
  ranked.splice(0,ranked.length,...first,...rest);
 }
 const chosen=[],counts=new Map();
 for(const {chunk} of ranked){
  const count=counts.get(chunk.path)||0;
  if(count>=(broad?1:2)||chosen.some(other=>other.path===chunk.path&&Math.abs(other.line-chunk.line)<36))continue;
  counts.set(chunk.path,count+1);
  chosen.push({path:chunk.path.slice(0,240),line:chunk.line,text:chunk.text.slice(0,1800)});
  if(chosen.length===4)break;
 }
 return chosen;
}

const get=id=>document.getElementById(id);
const status=get('projectStatus'),list=get('projectList'),toggle=get('projectCode');
let busy=false;
function render(){
 list.replaceChildren();
 toggle.textContent=files.size?'项目代码 · '+files.size:'项目代码';
 get('projectClear').disabled=busy||!files.size;
 for(const path of files.keys()){
  const row=document.createElement('li'),label=document.createElement('span'),remove=document.createElement('button');
  label.textContent=path;
  remove.type='button';
  remove.className='text-button';
  remove.textContent='移除';
  remove.setAttribute('aria-label','移除 '+path);
  remove.disabled=busy;
  remove.onclick=()=>{files.delete(path);status.textContent='已索引 '+files.size+' 个文件';render();};
  row.append(label,remove);list.append(row);
 }
}
async function add(selected){
 if(busy)return;
 busy=true;
 get('projectFiles').disabled=get('projectFolder').disabled=true;
 status.textContent='正在索引项目代码…';
 render();
 let bytes=[...files.values()].reduce((sum,file)=>sum+file.size,0),added=0,skipped=0;
 try{
  for(const file of selected){
   const originalPath=file.webkitRelativePath||file.name;
   let path=originalPath,suffix=2;
   const signature=file.size+':'+file.lastModified;
   while(files.has(path)&&files.get(path).signature!==signature)path=originalPath+' ('+(suffix++)+')';
   if(files.has(path)){skipped++;continue;}
   if(ignored.test(originalPath)||(!supported.test(originalPath)&&!entryPoint.test(originalPath))||
      file.size>maxFileBytes||bytes+file.size>maxBytes||files.size>=maxFiles){
    skipped++;continue;
   }
   try{
    const text=await file.text();
    if(!text.trim()||text.includes('\0')){skipped++;continue;}
    files.set(path,{...indexFile(originalPath,text,file.size,path),signature});
    bytes+=file.size;
    added++;
   }catch{skipped++;}
  }
 }finally{
  busy=false;
  get('projectFiles').disabled=get('projectFolder').disabled=false;
  status.textContent='已索引 '+files.size+' 个文件，本次处理 '+added+' 个'+(skipped?'，跳过 '+skipped+' 个':'');
  render();
 }
}
toggle.onclick=()=>get('projectDialog').showModal();
get('projectClose').onclick=()=>get('projectDialog').close();
get('projectClear').onclick=()=>{files.clear();status.textContent='已清空项目索引';render();};
for(const id of ['projectFiles','projectFolder']){
 const input=get(id);
 input.onchange=()=>{
  const selected=[...input.files];
  input.value='';
  if(selected.length)void add(selected);
 };
}
window.ProjectCode={search};
})();
