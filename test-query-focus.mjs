import assert from 'node:assert/strict';
import fs from 'node:fs';
import engineModule from './dist/engine.js';
import {answerQuestion} from './rag.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./dist/knowledge.json',import.meta.url),'utf8'));
const engine=new engineModule.Engine(data),byId=new Map(data.chunks.map(c=>[c.id,c]));
const cases=[
 ['我们刚才聊了下 MySQL 索引，先放一放哈。假如有人一直查一个根本不存在的商品，Redis 每次都没命中，最后请求都打到数据库。这叫什么？一般怎么处理？','Redis 缓存穿透',/穿透/],
 ['嗯，你简历里写了用过 Java 集合。咱们先不聊线程安全，就说说 HashMap 吧，它底层到底是怎么存数据的？','HashMap 原理',/hashmap/i],
 ['我们先不说用哪个大模型哈。就说有时候模型明明不知道，还能一本正经地编一个答案，这种幻觉一般是怎么产生的？','大模型 幻觉 原因',/幻觉/],
 ['刚才提到向量检索，我再问一个。假如用户输入几个关键词，我想按词匹配的相关程度给文档排个序。你知道 BM25 大概是怎么算的吗？','BM25 原理',/bm25/i],
 ['你平时写 Python 的时候，假如想给好几个函数统一加个日志，又不想挨个去改函数体。听说装饰器能做这个，你能讲讲它是怎么回事吗？','Python 装饰器',/装饰器/]
];
for(const [query,rewrite,expected]of cases){
 let calls=0;const args={query,retrieveOnly:true,apiKey:'mock',engine,byId,cache:new Map(),fetcher:async(_,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.stream,false);assert(payload.messages[1].content.includes(query));return Response.json({choices:[{message:{content:JSON.stringify({query:rewrite})}}]});}};
 const result=await answerQuestion(args);assert.equal(result.rewritten,true);assert.match(byId.get(result.candidateIds[0])?.title||'',expected);assert.equal(calls,1);
 assert.equal((await answerQuestion(args)).cached,true);assert.equal(calls,1);
 console.log('PASS mocked rewrite -> real retrieval:',byId.get(result.candidateIds[0]).title);
}
