/* Extractive RAG: title matching + BM25 + sparse TF-IDF cosine. No remote calls. */
(function(root){
'use strict';
const aliases=[['底层结构','底层原理','实现原理','原理'],['垃圾回收','gc'],['全局解释器锁','gil'],['检索增强生成','rag'],['消息队列','rabbitmq','mq'],['装饰器','decorator'],['协程','coroutine'],['向量数据库','向量库'],['浅拷贝','浅复制'],['深拷贝','深复制'],['自动装配','自动配置'],['多版本并发控制','mvcc'],['大语言模型','llm'],['提示词','prompt'],['倒排索引','倒排'],['单例模式','单例']];
function canonical(s){return s.normalize('NFKC').toLowerCase().replace(/\bbm[\s_-]*25\b/g,'bm25').replace(/\btf[\s_-]*idf\b/g,'tfidf');}
function norm(s){return canonical(s).replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\s+/g,'');}
function tokens(s){let out=[];for(const part of canonical(s).match(/[a-z_][a-z0-9_+.]*|[\u4e00-\u9fff]+/g)||[]){if(/^[a-z_]/.test(part)){out.push(part);continue;} if(part.length===1)continue; for(let i=0;i<part.length-1;i++)out.push(part.slice(i,i+2));if(part.length<=5)out.push(part);}return out;}
function cleanQuery(q){
 let s=canonical(q).replace(/(?:是)?(?:怎么|如何)(?:工作|运作|运行)(?:的)?/g,' 原理 ').replace(/^在(.+?)方面[，,]?/,'$1 ').replace(/(?:应该|应当|该)?(?:怎么|如何|怎样)(?:才能|才可以|能|去|来|进行|做)?/g,' ');
 // Consume full conversational wrappers before removing pronouns.
 s=s.replace(/(?:你|您|你们)(?:知不知道|了解不了解|有没有听说过|知道|了解|清楚|熟悉|懂不懂|听说过)/g,' ')
 .replace(/(?:你|您|你们)?(?:能不能|可不可以|是否可以|能否|可以|能)?(?:给我|帮我|帮忙)?(?:简单地|简单|通俗地|通俗|大概|详细地|详细|具体地|具体|稍微)?(?:讲一讲|讲讲|讲一下|说一说|说说|说一下|说下|介绍一下|解释一下|解释下|介绍下|介绍|解释|谈谈|聊聊|回答一下)/g,' ')
 .replace(/我想(?:问一下|问问|知道|了解一下|了解)|请问|请你|请|帮我|你有什么|你有|你的|你们|你|有什么|有何|相关的|方面|什么是|是什么|有哪些|如何理解|怎么理解/g,' ')
 .replace(/(?:是)?(?:怎么|如何)(?:工作|运作|运行)(?:的)?|工作原理|工作机制|运作机制/g,' 原理 ')
 .replace(/\bhow\b([\s\S]*?)\bworks?\b/g,'$1 原理 ')
 .replace(/\b(?:can|could|would|you|please|tell|me|about|explain|briefly|simply|do|does|how|work|works|know|understand|what|the|a|an)\b/g,' ')
 .replace(/[的吗呢呀啊呗吧嘛]|[，。？！、:：,?!]/g,' ')
 .replace(/\s+/g,' ').trim();
 return s||canonical(q).trim();
}
function titleKey(text){
 return norm(text).replace(/[，。？！、:：,?!]/g,'');
}
function causeTopic(text){
 // Keep the subject on both sides of the question phrase.
 const topic=text
  .replace(/(?:为什么|为何)\s*(?:(?:会|容易)\s*)?(?:(?:出现|产生|发生)(?:了)?\s*)?/g,' ')
  .replace(/(?:会|容易)\s*(?:出现|产生|发生)(?:了)?\s*/g, verb=>/^(?:为什么|为何)/.test(text)?' ':verb)
  .replace(/(?:的)?(?:原因(?:是)?|成因)$/,'')
  .replace(/\s+/g,' ').trim();
 return titleKey(topic).length>=2?topic:text;
}
function makeTF(ts){let m=new Map();for(const t of ts)m.set(t,(m.get(t)||0)+1);return m;}
class Engine{
constructor(data){this.data=data;this.N=data.chunks.length;this.df=new Map();this.cache=new Map();this.docs=data.chunks.map(c=>{const ts=tokens(c.title+' '+c.title+' '+c.chapter+' '+c.text);const tf=makeTF(ts);for(const t of tf.keys())this.df.set(t,(this.df.get(t)||0)+1);return {c,tf,len:ts.length,title:norm(c.title),questionTitle:titleKey(cleanQuery(c.title)),titleTokens:new Set(tokens(c.title))};});this.avg=this.docs.reduce((a,d)=>a+d.len,0)/this.N;this.idf=new Map([...this.df].map(([t,n])=>[t,Math.log(1+(this.N-n+.5)/(n+.5))]));for(const d of this.docs){d.norm=Math.sqrt([...d.tf].reduce((a,[t,f])=>a+((1+Math.log(f))*(this.idf.get(t)||0))**2,0));}}
search(query,source='all',limit=8){const started=performance.now(),key=source+'|'+query;if(this.cache.has(key))return {...this.cache.get(key),cached:true,ms:performance.now()-started};const phrasing=cleanQuery(query),fullTitle=titleKey(phrasing);
const clean=causeTopic(phrasing);
let expanded=clean;for(const group of aliases)if(group.some(t=>norm(clean).includes(norm(t))))expanded+=' '+group.join(' ');const qt=makeTF(tokens(expanded)),original=[...new Set(tokens(clean))];const qn=titleKey(clean);const explicitTech=[...new Set((clean.match(/[a-z_][a-z0-9_+.]{1,}/g)||[]))];const tech=explicitTech.filter(t=>this.df.has(t));const qnorm=Math.sqrt([...qt].reduce((a,[t,f])=>a+((1+Math.log(f))*(this.idf.get(t)||0))**2,0));let results=[];
for(const d of this.docs){if(source==='custom'?!d.c.entryId:source!=='all'&&d.c.source!==source)continue;let bm=0,dot=0,covered=0,tc=0;for(const [t,f]of qt){let n=d.tf.get(t)||0,idf=this.idf.get(t)||0;if(n){bm+=idf*n*2.2/(n+1.2*(.25+.75*d.len/this.avg));dot+=(1+Math.log(n))*idf*(1+Math.log(f))*idf;}}for(const t of original){if(d.tf.has(t))covered++;if(d.titleTokens.has(t))tc++;}const coverage=original.length?covered/original.length:0,titleCoverage=original.length?tc/original.length:0,cosine=qnorm&&d.norm?dot/(qnorm*d.norm):0;const exact=qn.length>=2&&(d.title===qn||d.title.includes(qn));const titleInside=d.title.length>=2&&qn.includes(d.title);const score=(exact?60:0)+(titleInside?35:0)+titleCoverage*22+coverage*8+bm*1.1+cosine*14;
const techTitle=tech.filter(t=>d.titleTokens.has(t)||norm(d.c.chapter).includes(t)).length;const techMatched=tech.filter(t=>d.tf.has(t)).length;const strongAnchor=techTitle>0;
const titlePriority=qn.length<2?0:d.questionTitle===fullTitle?2:d.questionTitle===qn?1:0;
if(titlePriority||covered&&(coverage>=.2||strongAnchor)&&(!explicitTech.length||explicitTech.some(t=>d.tf.has(t))))results.push({id:d.c.id,score:score-8*(tech.length-techMatched)+(tech.length===1&&qn===tech[0]&&d.title===tech[0]+'原理'?50:0)+techTitle*60+(tech.includes('rag')&&d.titleTokens.has('rag')?35:0)+(tech.length&&!['java','python','redis','rag'].includes(tech[0])&&d.title.startsWith(tech[0])?15:0),titlePriority,techTitle,strongAnchor,bm,cosine,coverage,titleCoverage,exact,match:titlePriority===1?'题目主题匹配':titlePriority===2||exact?'题目直接命中':titleInside?'题目包含匹配':titleCoverage>=.6?'题目相关匹配':'正文相关片段'});}
results.sort((a,b)=>b.titlePriority-a.titlePriority||b.score-a.score);let top=results[0];const meaningful=top&&(top.titlePriority||top.exact||top.strongAnchor||top.titleCoverage>=.4||(top.coverage>=.65&&top.cosine>=.035));const response={query,results:meaningful?results.slice(0,limit):[],ms:performance.now()-started,cached:false};this.cache.set(key,response);return response;}
}
Engine.normalizeQuery=q=>norm(cleanQuery(q)).replace(/[，。？！、:：,?!]/g,'');
root.InterviewEngine=Engine;if(typeof module!=='undefined')module.exports={Engine,tokens,cleanQuery,canonical};
})(typeof window==='undefined'?globalThis:window);
