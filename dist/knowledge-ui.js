'use strict';
(()=>{
let entries=[],permission=false,pending=[],chosen=-1,editing=null,parsersPromise=null,saving=false;
const notice=(text,error=false)=>{$('knowledgeFeedback').textContent=text;$('knowledgeFeedback').classList.toggle('error',error);};
async function request(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.error||'知识库操作未完成。');return result;}
function fieldsToPending(){if(chosen>=0&&pending[chosen])Object.assign(pending[chosen],{title:$('knowledgeTitle').value,text:$('knowledgeText').value,category:$('knowledgeCategory').value});}
function updateCount(){$('knowledgeTextCount').textContent=$('knowledgeText').value.length.toLocaleString()+' 字符';}
function fill(item){$('knowledgeTitle').value=item?.title||'';$('knowledgeText').value=item?.text||'';$('knowledgeCategory').value=item?.category||'custom';updateCount();}
function tab(name){for(const [id,value]of [['pasteTab','paste'],['fileTab','file'],['manageTab','manage']]){const on=value===name;$(id).classList.toggle('selected',on);$(id).setAttribute('aria-selected',String(on));}$('knowledgeEditor').hidden=name==='manage';$('knowledgeManage').hidden=name!=='manage';$('knowledgeUpload').hidden=name!=='file';notice('');}
function reset(){pending=[];chosen=-1;editing=null;fill(null);$('knowledgeFileList').replaceChildren();$('knowledgeFiles').value='';$('saveKnowledge').textContent='保存并加入知识库';}
function fileList(){$('knowledgeFileList').replaceChildren();pending.forEach((item,i)=>{const button=el('button',(item.saved?'✓ ':'')+item.filename,'knowledge-file'+(chosen===i?' selected':''));button.onclick=()=>{fieldsToPending();chosen=i;fill(item);fileList();};$('knowledgeFileList').append(button);});}
function manage(){const list=$('knowledgeEntryList');list.replaceChildren();$('importedCount').textContent=entries.length;if(!entries.length){list.append(el('p','还没有新增知识。粘贴一条知识或上传第一份文档即可。','knowledge-empty'));return;}
 for(const entry of entries){const row=el('div',undefined,'knowledge-entry'),info=el('div');info.append(el('strong',entry.title),el('small',(entry.category==='java'?'Java':entry.category==='python'?'Python / AI':'通用')+' · '+entry.text.length.toLocaleString()+' 字符 · '+(entry.enabled===false?'已停用':'参与检索')));row.append(info);
  if(permission){const actions=el('div',undefined,'knowledge-entry-actions'),edit=el('button','编辑','text-button'),toggle=el('button',entry.enabled===false?'启用':'停用','text-button');edit.onclick=()=>{reset();editing=entry.id;fill(entry);tab('paste');$('saveKnowledge').textContent='保存修改';};toggle.onclick=async()=>{toggle.disabled=true;try{await request('/api/knowledge/'+entry.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:entry.enabled===false})});await sync();notice(entry.enabled===false?'知识已启用。':'知识已停用，原内容仍保存在服务端。');}catch(e){notice(e.message,true);}finally{toggle.disabled=false;}};actions.append(edit,toggle);row.append(actions);}
  list.append(row);
 }
}
async function sync(){if(location.protocol==='file:')return;const state=await request('/api/knowledge',{cache:'no-store'});entries=state.entries;permission=!!state.canManage;applySharedKnowledge(entries,state.revision);manage();$('knowledgePermission').hidden=permission;$('knowledgePermission').textContent='当前为共享只读访问。请在运行智能体的电脑上打开页面添加或编辑知识。';$('saveKnowledge').disabled=!permission;$('knowledgeFiles').disabled=!permission;return state;}
window.syncSharedKnowledge=sync;
window.knowledgeReady=sync().catch(e=>{notice(e.message,true);});
$('addKnowledge').onclick=async()=>{$('knowledgeDialog').showModal();try{await sync();}catch(e){notice(e.message,true);}};$('closeKnowledge').onclick=()=>$('knowledgeDialog').close();
$('pasteTab').onclick=()=>{fieldsToPending();tab('paste');};$('fileTab').onclick=()=>{if(editing)reset();tab('file');};$('manageTab').onclick=()=>{fieldsToPending();tab('manage');manage();};$('newKnowledge').onclick=()=>{reset();tab('paste');};$('knowledgeText').oninput=updateCount;
async function loadFiles(files){if(!permission)return notice('请在本机页面导入知识。',true);if(files.length>5)return notice('每次最多选择 5 份文档。',true);reset();tab('file');$('saveKnowledge').disabled=true;
 try{parsersPromise??=import('./import-parsers.mjs');const parsers=await parsersPromise;for(let i=0;i<files.length;i++){const file=files[i];notice('正在解析 '+(i+1)+'/'+files.length+'：'+file.name);const text=await parsers.extractFile(file);KnowledgeImport.validate({title:file.name,text});pending.push({title:file.name.replace(/\.[^.]+$/,''),filename:file.name,text,category:'custom',saved:false});}if(pending.length){chosen=0;fill(pending[0]);fileList();notice('已提取 '+pending.length+' 份文档。请检查预览后保存。');}}
 catch(e){notice(e.message||'文档解析失败，请检查文件。',true);if(pending.length){chosen=0;fill(pending[0]);fileList();}}
 finally{$('saveKnowledge').disabled=!permission;}
}
$('knowledgeFiles').onchange=()=>loadFiles(Array.from($('knowledgeFiles').files));const drop=$('knowledgeUpload');drop.ondragover=e=>{e.preventDefault();};drop.ondrop=e=>{e.preventDefault();loadFiles(Array.from(e.dataTransfer.files));};
$('saveKnowledge').onclick=async()=>{if(saving||!permission)return;fieldsToPending();const batch=pending.length?pending.filter(item=>!item.saved):[{title:$('knowledgeTitle').value,text:$('knowledgeText').value,category:$('knowledgeCategory').value}];if(!batch.length)return notice('这些文档已经保存，可继续上传或新建知识。');
 try{for(const item of batch)KnowledgeImport.validate(item);saving=true;$('saveKnowledge').disabled=true;let added=0,duplicates=0;for(const item of batch){notice('正在保存：'+item.title);const result=await request('/api/knowledge'+(editing?'/'+editing:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});item.saved=true;result.duplicate?duplicates++:added++;}await sync();fileList();notice((editing?'修改已保存。':'已保存 '+added+' 份知识。')+(duplicates?' '+duplicates+' 份已有相同内容，未重复导入。':'')+' 已加入共享检索。');toast('知识库已更新');}
 catch(e){notice(e.message||'保存失败，请重试。',true);try{await sync();}catch{}}
 finally{saving=false;$('saveKnowledge').disabled=!permission;}
};
})();
