/* DeepSeek selects source IDs; the browser renders only verified original text. */
'use strict';
const $=id=>document.getElementById(id),baseData=window.KNOWLEDGE;let data=baseData,engine=new InterviewEngine(data),byId=new Map(data.chunks.map(c=>[c.id,c]));
let scope='all',selected=null,lastResponse=null,mode='search',history=[];
let selectedAnswer='';
let apiKey='',modelConfigured=false,requestSerial=0,modelController=null;
try{history=JSON.parse(localStorage.getItem('interview-history-v1')||'[]');if(!Array.isArray(history))history=[];history=history.filter(x=>typeof x==='string').slice(0,7);}catch{}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
function historyUI(){const list=$('history');list.replaceChildren();if(!history.length)list.append(el('div','暂无检索记录','history-empty'));for(const q of history){const b=el('button',q,'history-item');b.title=q;b.onclick=()=>run(q);list.append(b);}}
function setScope(s){scope=s;document.querySelectorAll('[data-scope]').forEach(b=>b.classList.toggle('selected',b.dataset.scope===s));}
function setMode(m){mode=m;document.body.classList.toggle('has-answer',!!lastResponse);document.body.classList.toggle('catalog-mode',m==='catalog');$('catalog').hidden=m!=='catalog';$('home').hidden=m==='catalog'||!!lastResponse;$('results').hidden=m==='catalog'||!lastResponse;$('searchNav').classList.toggle('active',m==='search');$('browseNav').classList.toggle('active',m==='catalog');if(m==='catalog')renderCatalog();}
function renderText(text,target){
 target.replaceChildren();let code=false,buffer=[],lists=[];
 function inline(parent,value){
  for(const part of value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){
   if(part.startsWith('**')&&part.endsWith('**'))parent.append(el('strong',part.slice(2,-2)));
   else if(part.startsWith('`')&&part.endsWith('`'))parent.append(el('code',part.slice(1,-1),'inline-code'));
   else parent.append(document.createTextNode(part));
  }
 }
 function tableCells(value){
  value=value.trim();if(value.startsWith('|'))value=value.slice(1);if(value.endsWith('|')&&!value.endsWith('\\|'))value=value.slice(0,-1);
  const cells=[];let cell='',inCode=false;
  for(let i=0;i<value.length;i++){const char=value[i];if(char==='\\'&&value[i+1]==='|'){cell+='|';i++;continue;}if(char==='`')inCode=!inCode;if(char==='|'&&!inCode){cells.push(cell.trim());cell='';}else cell+=char;}
  cells.push(cell.trim());return cells;
 }
 function list(type,indent,start){
  while(lists.length&&lists.at(-1).indent>indent)lists.pop();
  if(lists.length&&lists.at(-1).indent===indent&&lists.at(-1).type!==type)lists.pop();
  let current=lists.at(-1);
  if(!current||current.indent<indent){const node=el(type,undefined,type==='ol'?'answer-points':'answer-bullets');if(type==='ol')node.start=start;const parent=current?.lastItem||target;parent.append(node);current={type,indent,node,lastItem:null};lists.push(current);}
  return current;
 }
 function point(item,value){
  const term=value.match(/^([^：:\n]{1,72})([：:])\s*(.+)$/);
  if(term&&!/[。；;]/.test(term[1])&&!/https?$/i.test(term[1])){
   const title=el('strong',undefined,'point-title');inline(title,term[1]+term[2]);item.append(title);
   const explanation=el('p',undefined,'point-explanation');inline(explanation,term[3]);item.append(explanation);
  }else if(value.length<=55&&!/[。；;]/.test(value)){
   const title=el('strong',undefined,'point-title');inline(title,value);item.append(title);
  }else inline(item,value);
 }
 function paragraph(value,parent){const node=el('p');if(value.length<65&&/[:：]$/.test(value)){node.className='subheading';const title=el('strong');inline(title,value);node.append(title);}else inline(node,value);parent.append(node);}
 const flush=()=>{if(buffer.length){const pre=el('pre');pre.append(el('code',buffer.join('\n')));(lists.at(-1)?.lastItem||target).append(pre);buffer=[];}};
 const lines=text.split('\n');
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
  const line=lines[lineIndex];
  if(line.includes('```')){const parts=line.split('```');if(code){if(parts[0])buffer.push(parts[0]);flush();code=false;}else{if(parts[0].trim())paragraph(parts[0],target);code=true;}continue;}
  if(code){buffer.push(line);continue;}if(!line.trim())continue;
  if(line.includes('|')&&lineIndex+1<lines.length){
   const headers=tableCells(line),separator=tableCells(lines[lineIndex+1]);
   if(headers.length>=2&&headers.length===separator.length&&separator.every(cell=>/^:?-{3,}:?$/.test(cell.trim()))){
    lists=[];const wrap=el('div',undefined,'answer-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','知识表格，可横向滚动');
    const table=el('table',undefined,'answer-table table-columns-'+headers.length),head=el('thead'),headRow=el('tr');
    headers.forEach(value=>{const cell=el('th');cell.scope='col';inline(cell,value);headRow.append(cell);});head.append(headRow);table.append(head);
    const body=el('tbody');lineIndex++;
    while(lineIndex+1<lines.length&&lines[lineIndex+1].trim()&&lines[lineIndex+1].includes('|')){
     const cells=tableCells(lines[lineIndex+1]);if(cells.length!==headers.length)break;lineIndex++;
     const row=el('tr');cells.forEach(value=>{const cell=el('td');inline(cell,value);row.append(cell);});body.append(row);
    }
    table.append(body);wrap.append(table);target.append(wrap);continue;
   }
  }
  const numbered=line.match(/^(\s*)(\d+)[.、]\s+(.+)$/),bullet=line.match(/^(\s*)[-•]\s+(.+)$/);
  if(numbered||bullet){const match=numbered||bullet,type=numbered?'ol':'ul',indent=match[1].replace(/\t/g,'  ').length,current=list(type,indent,numbered?+match[2]:0),item=el('li');if(numbered)item.value=+match[2];point(item,numbered?match[3]:match[2]);current.node.append(item);current.lastItem=item;continue;}
  const indented=/^\s+/.test(line)&&lists.at(-1)?.lastItem;
  if(indented)paragraph(line.trim(),lists.at(-1).lastItem);else{lists=[];paragraph(line,target);}
 }
 flush();
}
function showAnswer(id){
 const c=byId.get(id),complete=resolveInterviewAnswer(byId,id);selected=c;selectedAnswer=complete.text;
 const r=lastResponse?.results.find(x=>x.id===id);$('answerTitle').textContent=c.title;
 $('matchTag').textContent=complete.expanded?'已自动补齐 '+complete.expanded+' 处引用':r?.match||'完整原文';
 $('sourceLine').textContent=c.sourceName+'  /  '+c.chapter+'  ·  '+(complete.expanded?'引用内容已展开，无需打开原文档':'完整题目答案');
 $('answerBody').replaceChildren();
 complete.sections.forEach((section,i)=>{const wrap=el('section',undefined,i?'expanded-reference':'primary-answer');if(i)wrap.append(el('h3',section.title,'reference-title'),el('div','原文引用已自动展开','reference-caption'));const body=el('div');renderText(section.text,body);wrap.append(body);$('answerBody').append(wrap);});
 $('rawText').textContent=complete.sections.map(section=>section.raw).join('\n\n────────────\n\n');
 $('evidenceMeta').textContent=complete.sections.map(section=>section.sourceName+' / '+section.chapter+' / '+section.title+' · 第 '+section.line+' 行').join('\n');
 document.querySelectorAll('.candidate').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
}
function candidates(response){$('candidateList').replaceChildren();$('candidateCount').textContent=response.results.length+' 条';for(const r of response.results){const c=byId.get(r.id),b=el('button',undefined,'candidate');b.dataset.id=c.id;b.append(el('span',c.sourceName+' · '+c.chapter,'candidate-source'),el('strong',c.title),el('span',r.match||'目录原文','candidate-match'));b.onclick=()=>{cancelModel();showAnswer(c.id);$('answerMode').textContent='手动查看原文';$('modelMessage').hidden=true;};$('candidateList').append(b);}}
function cancelModel(){requestSerial++;modelController?.abort();modelController=null;$('searchPending').hidden=true;}
async function refreshModelStatus(){if(location.protocol==='file:'){$('status').textContent='离线原文模式';$('configStatus').textContent='离线 HTML 仅检索原文。使用 DeepSeek 请双击桌面上的面试知识库快捷方式。';return;}try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error();const state=await r.json();if(state.knowledgeVersion&&state.knowledgeVersion!==data.version){sessionStorage.setItem('resume-interview-query',$('query').value);location.reload();return;}modelConfigured=!!state.configured;$('configStatus').textContent=state.configured?'后端已配置 API Key，可直接提问。':'当前服务尚未配置 API Key，请在下方填写。';$('status').textContent=state.configured||apiKey?'DeepSeek 已就绪':'请配置 DeepSeek Key';}catch{$('configStatus').textContent='无法连接模型后端。请通过桌面快捷方式启动，或使用在线版本。';$('status').textContent='模型后端未连接';}}
async function run(query){
 if(window.knowledgeReady)await window.knowledgeReady;query=query.trim();if(!query){$('query').focus();return;}cancelModel();const serial=requestSerial;$('query').value=query;
 const response=engine.search(query,scope);lastResponse=response;setMode('search');$('readingPane').scrollTop=0;
 $('resultTitle').textContent='检索结果';$('resultMeta').textContent=response.results.length+' 个候选 · 本地检索 '+response.ms.toFixed(1)+' ms';
 $('empty').querySelector('h3').textContent='文档中未找到相关内容';$('empty').querySelector('p').textContent='资料中没有足够依据回答这个问题。可以补充问题背景或选择其他资料范围。';
 $('empty').hidden=true;$('resultGrid').hidden=true;$('modelMessage').hidden=true;selected=null;selectedAnswer='';
 history=[query,...history.filter(q=>q!==query)].slice(0,7);try{localStorage.setItem('interview-history-v1',JSON.stringify(history));}catch{}historyUI();
 if(location.protocol==='file:'){if(response.results.length){candidates(response);showAnswer(response.results[0].id);$('resultGrid').hidden=false;$('answerMode').textContent='离线原文（未调用 DeepSeek）';}else $('empty').hidden=false;return;}
 $('searchPending').hidden=false;$('searchPending').textContent=response.results.length?'已检索到资料，正在确认答案…':'正在理解问题并重新检索资料…';$('resultMeta').textContent='正在检索并确认答案…';
 modelController=new AbortController();const started=performance.now();
 try{
  const r=await fetch('/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,scope,...(apiKey?{apiKey}:{})}),signal:modelController.signal});
  const result=await r.json();if(serial!==requestSerial)return;$('searchPending').hidden=true;
  if(!r.ok)throw new Error(result.error||'DeepSeek 调用失败。');
  if(result.knowledgeVersion&&result.knowledgeVersion!==data.version){sessionStorage.setItem('resume-interview-query',query);location.reload();return;}
  if(result.knowledgeRevision&&result.knowledgeRevision!==data.knowledgeRevision&&window.syncSharedKnowledge){await window.syncSharedKnowledge();if(serial!==requestSerial)return;}
  if(result.id===null){selected=null;selectedAnswer='';$('empty').hidden=false;$('resultGrid').hidden=true;$('resultMeta').textContent=result.rewritten?'已理解问题并重新检索，资料中没有足够依据':'DeepSeek 未找到能直接回答的原文';return;}
  if(!byId.has(result.id))throw new Error('模型返回的题目不在本地资料中。');
  const ids=[...new Set([...(result.candidateIds||[]),...response.results.map(x=>x.id),result.id])].filter(id=>byId.has(id));
  lastResponse={...response,results:ids.map(id=>response.results.find(x=>x.id===id)||{id,match:result.rewritten?'语义匹配':'相关原文'})};
  candidates(lastResponse);$('empty').hidden=true;$('resultGrid').hidden=false;showAnswer(result.id);
  $('answerMode').textContent=result.selection==='exact-source'?'原文直达 · 题目匹配':'DeepSeek · 原文直答';$('resultMeta').textContent='DeepSeek 非思考 · '+((performance.now()-started)/1000).toFixed(2)+' 秒'+(result.rewritten?' · 语义匹配':'')+(result.cached?' · 缓存命中':'');$('status').textContent='DeepSeek 已就绪';
 }catch(e){
  if(e.name==='AbortError'||serial!==requestSerial)return;$('searchPending').hidden=true;
  if(response.results.length){candidates(response);showAnswer(response.results[0].id);$('resultGrid').hidden=false;$('empty').hidden=true;$('answerMode').textContent='本地候选 · 模型未完成';$('modelMessage').hidden=false;$('modelMessage').textContent=e.message||'模型连接失败，请检查设置。';$('resultMeta').textContent='模型调用未完成，下方仅为本地检索候选';}
  else{$('empty').hidden=false;$('empty').querySelector('h3').textContent='检索服务暂时不可用';$('empty').querySelector('p').textContent=e.message||'请检查模型连接后重试。';$('resultMeta').textContent='问题尚未完成检索';}
  $('status').textContent='检查 DeepSeek 配置';
 }
}
function renderCatalog(){const query=$('catalogFilter').value.toLowerCase(),s=$('catalogSource').value;let groups=new Map(),count=0;for(const c of data.chunks){if(s==='custom'?!c.entryId:s!=='all'&&c.source!==s)continue;if(query&&!(c.title+' '+c.chapter).toLowerCase().includes(query))continue;const key=c.sourceName+' / '+c.chapter;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);count++;}$('catalogMeta').textContent=count+' 个知识片段';$('catalogList').replaceChildren();for(const [name,chunks]of groups){const details=el('details',undefined,'catalog-group');details.open=!!query;const summary=el('summary',name);summary.append(el('small',chunks.length+' 题'));details.append(summary);for(const c of chunks){const b=el('button',c.title,'catalog-question');b.onclick=()=>{cancelModel();$('answerMode').textContent='目录原文';$('modelMessage').hidden=true;lastResponse={results:[{id:c.id,match:'目录原文'}],ms:0};setMode('search');$('resultTitle').textContent='目录原文';$('resultMeta').textContent=c.sourceName+' · '+c.text.length+' 字符';$('empty').hidden=true;$('resultGrid').hidden=false;candidates(lastResponse);showAnswer(c.id);$('readingPane').scrollTo({top:0,behavior:'smooth'});};details.append(b);}$('catalogList').append(details);}if(!count)$('catalogList').append(el('p','没有匹配的题目，请更换关键词。'));}
$('searchForm').onsubmit=e=>{e.preventDefault();run($('query').value);};$('query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();run($('query').value);}});document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>setScope(b.dataset.scope));document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>run(b.dataset.q));document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{setScope(b.dataset.source);$('catalogSource').value=b.dataset.source;setMode('catalog');});$('searchNav').onclick=()=>setMode('search');$('browseNav').onclick=()=>setMode('catalog');$('catalogFilter').oninput=renderCatalog;$('catalogSource').onchange=renderCatalog;$('clearHistory').onclick=()=>{history=[];try{localStorage.removeItem('interview-history-v1');}catch{}historyUI();toast('检索历史已清空');};$('copy').onclick=async()=>{if(!selected)return;try{await navigator.clipboard.writeText(selectedAnswer);toast('完整答案已复制');}catch{const t=el('textarea',selectedAnswer);document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();toast(ok?'完整答案已复制':'复制失败，请在原始片段中手动选择复制');}};
$('about').onclick=()=>$('infoDialog').showModal();$('closeInfo').onclick=$('closeInfoBottom').onclick=()=>$('infoDialog').close();document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('query').focus();}});for(const s of data.sources)$(s.id+'Count').textContent=data.chunks.filter(c=>c.source===s.id).length+' 个片段 · '+(s.characters/10000).toFixed(1)+' 万字';$('chunkCount').textContent=data.chunks.length.toLocaleString();$('status').textContent='正在连接 DeepSeek';$('submit').disabled=false;historyUI();
$('mobileCatalog').onclick=()=>{setMode(mode==='catalog'?'search':'catalog');$('mobileCatalog').textContent=mode==='catalog'?'面试问答':'知识目录';if(mode==='catalog')$('catalog').scrollIntoView({behavior:'smooth',block:'start'});};

$('modelSettings').onclick=()=>{$('modelDialog').showModal();refreshModelStatus();};
$('closeModel').onclick=()=>$('modelDialog').close();
$('saveKey').onclick=()=>{apiKey=$('apiKey').value.trim();$('apiKey').value='';$('modelDialog').close();refreshModelStatus();toast(apiKey?'已应用当前标签页的 Key':'使用后端默认 Key');};
$('clearKey').onclick=()=>{apiKey='';$('apiKey').value='';refreshModelStatus();toast('手动 Key 已清除');};
refreshModelStatus();

try{const pending=sessionStorage.getItem('resume-interview-query');if(pending){sessionStorage.removeItem('resume-interview-query');run(pending);}}catch{}

function applySharedKnowledge(entries,revision){
 data=KnowledgeImport.merge(baseData,entries,revision);engine=new InterviewEngine(data);byId=new Map(data.chunks.map(c=>[c.id,c]));
 const active=entries.filter(e=>e.enabled!==false);$('sourceCount').textContent=baseData.sources.length+active.length;$('navSourceCount').textContent=String(baseData.sources.length+active.length).padStart(2,'0');$('chunkCount').textContent=data.chunks.length.toLocaleString();$('characterCount').textContent=((baseData.sources.reduce((n,s)=>n+s.characters,0)+active.reduce((n,e)=>n+e.text.length,0))/10000).toFixed(1);
 for(const s of baseData.sources){const node=$(s.id+'Count');if(node)node.textContent=data.chunks.filter(c=>c.source===s.id).length+' 个片段';}
 if(mode==='catalog')renderCatalog();
}
