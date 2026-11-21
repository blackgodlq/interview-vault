/* Resolve verified local source references before rendering or copying. */
(function(root){
function readableBody(chunk){
 let text=chunk.answer===undefined?chunk.text:chunk.answer;
 // These parenthetical directions are editorial navigation, not answer facts.
 text=text.replace(/[（(][^）)\n]*(?:下\s*一\s*题|上\s*一\s*题|下题|上题)[^）)\n]*[）)]/g,'');
 // Preserve factual clauses; suppress navigation-only sentences when expanded.
 if(chunk.references?.length){text=text.replace(/(?:具体)?(?:可以)?(?:参考|参照|看|见)\s*(?:下\s*一\s*题|上\s*一\s*题|下题|上题)(?:的(?:答案|内容))?(?:进行回答)?[：:]?/g,'');}
 return text.trim();
}
function resolveAnswer(data,id){
 const map=data instanceof Map?data:new Map(data.chunks.map(c=>[c.id,c]));
 const sections=[],visited=new Set();
 function visit(key){if(visited.has(key))return;const c=map.get(key);if(!c)return;visited.add(key);sections.push({id:c.id,title:c.title,sourceName:c.sourceName,chapter:c.chapter,line:c.line,text:readableBody(c),raw:c.text});for(const ref of c.references||[])visit(ref);}
 visit(id);
 return {sections,expanded:Math.max(0,sections.length-1),text:sections.map(s=>s.title+'\n'+s.text).join('\n\n')};
}
root.resolveInterviewAnswer=resolveAnswer;if(typeof module!=='undefined')module.exports={resolveAnswer,readableBody};
})(typeof window==='undefined'?globalThis:window);
