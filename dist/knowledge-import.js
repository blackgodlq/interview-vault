(function(root){
'use strict';
const MAX_TEXT=500000,MAX_DOCUMENTS=50,MAX_TOTAL=3000000;
function fail(message){const error=new Error(message);error.status=400;throw error;}
function validate(input){
 if(!input||typeof input!=='object')fail('知识内容格式不正确。');
 const title=typeof input.title==='string'?input.title.trim():'';
 const text=typeof input.text==='string'?input.text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim():'';
 if(!title||title.length>120)fail('标题需要填写 1–120 个字符。');
 if(!text||text.length>MAX_TEXT)fail('每份知识需要有正文，最多 50 万字符。');
 const category=['java','python','custom'].includes(input.category)?input.category:'custom';
 const filename=typeof input.filename==='string'?input.filename.split(/[\\/]/).pop().slice(0,200):'';
 return {title,text,category,filename};
}
async function createEntry(input,entries,id){
 const fields=validate(input),other=entries.filter(e=>e.id!==id);
 if(!id&&entries.length>=MAX_DOCUMENTS)fail('最多保存 50 份新增资料，请编辑已有资料或合并内容。');
 if(fields.text.length+other.reduce((n,e)=>n+e.text.length,0)>MAX_TOTAL)fail('新增知识总量最多 300 万字符。');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fields.text)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const duplicate=other.find(e=>e.digest===digest);if(duplicate)return {entry:duplicate,duplicate:true};
 const old=entries.find(e=>e.id===id);if(id&&!old)fail('这份资料不存在，请刷新列表。');
 const now=new Date().toISOString();
 return {entry:{...fields,id:old?.id||'extra-'+crypto.randomUUID(),digest,enabled:old?.enabled??true,createdAt:old?.createdAt||now,updatedAt:now},duplicate:false};
}
function chunksFor(entry){
 const sections=[];let current={title:entry.title,lines:[],line:1};
 const lines=entry.text.split('\n');let fenced=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if((line.match(/```/g)||[]).length%2)fenced=!fenced;
  const heading=!fenced&&line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if(heading){if(current.lines.join('\n').trim())sections.push(current);current={title:heading[1],lines:[],line:i+2};}
  else current.lines.push(line);
 }
 if(current.lines.join('\n').trim())sections.push(current);
 const chunks=[];
 for(const section of sections){
  const paragraphs=section.lines.join('\n').split(/\n\s*\n/);let group='',part=1,line=section.line;
  const emit=()=>{if(!group.trim())return;const text=group.trim();chunks.push({id:entry.id+'-'+chunks.length,entryId:entry.id,source:entry.category,sourceName:entry.title,chapter:section.title,title:section.title+(part>1?'（续 '+part+'）':''),text,answer:text,line,references:[]});line+=group.split('\n').length;group='';part++;};
  for(const paragraph of paragraphs){if(group&&group.length+paragraph.length>2400)emit();group+=(group?'\n\n':'')+paragraph;}
  emit();
 }
 return chunks;
}
function merge(base,entries,revision){return {...base,knowledgeRevision:revision,chunks:[...base.chunks,...entries.filter(e=>e.enabled!==false).flatMap(chunksFor)]};}
function canManageDesktop(remote,addresses){remote=(remote||'').replace(/^::ffff:/,'');return remote==='127.0.0.1'||remote==='::1'||addresses.includes(remote);}
root.KnowledgeImport={createEntry,chunksFor,merge,validate,canManageDesktop,MAX_TEXT,MAX_DOCUMENTS,MAX_TOTAL};
if(typeof module!=='undefined')module.exports=root.KnowledgeImport;
})(typeof window==='undefined'?globalThis:window);
