import json, re, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCES = [
    ('java', 'Java 后端', ROOT/'dist'/'Java面试八股文.txt', 'https://j1wtmv7ajj.feishu.cn/wiki/DCGfwqQ1cinVrOkWVBQcIQisnrd', ['基础篇','数据库篇','传统Web','Spring与SpringBoot','Redis','RabbitMQ','SpringCloud','ElasticSearch','Linux & Docker','前端篇','项目篇','AI','场景篇','人事篇']),
    ('python', 'Python / AI', ROOT/'dist'/'Python与AI面试八股文.txt', 'https://j1wtmv7ajj.feishu.cn/wiki/ElPtwiVwqiKzqgkMXQUcWG47nTf', ['Python','LangChain与LangGraph','MCP、Agent与A2A','大模型RAG','大模型提示词','项目与场景','大模型微调','数据构建','Transformer','大模型综合','硬件、部署与工具','数据库','Linux','Spring AI','深度学习','机器学习','人事']),
]
outline=json.loads((ROOT/'outline.json').read_text(encoding='utf-8'))
chunks=[]; sources=[]
for sid,name,path,url,chapters in SOURCES:
    text=path.read_bytes().decode('utf-8')
    digest=hashlib.sha256(text.encode()).hexdigest()
    verified=outline['sources'][sid]
    if verified['sha256']!=digest:
        raise RuntimeError('Source changed. Run node prepare-outline.mjs before rebuilding: '+path.name)
    lines=text.splitlines(keepends=True); offsets=[0]
    for line in lines: offsets.append(offsets[-1]+len(line))
    sections=verified['chapters']
    for ci,section in enumerate(sections):
        section_end=offsets[sections[ci+1]['line']-1] if ci+1<len(sections) else len(text)
        headings=section['headings']
        if not headings:
            headings=[dict(line=section['line'],number=0,title=section['title'])]
        for qi,heading in enumerate(headings):
            question_start=offsets[heading['line']-1]
            start=offsets[section['line']-1] if qi==0 else question_start
            end=offsets[headings[qi+1]['line']-1] if qi+1<len(headings) else section_end
            body_start=offsets[heading['line']]
            raw=text[start:end].strip(); answer=text[body_start:end].strip()
            chunks.append(dict(id=f"{sid}-{ci+1:02d}-{heading['number']:02d}",source=sid,sourceName=name,chapter=section['title'],title=heading['title'],questionNumber=heading['number'],text=raw,answer=answer,start=start,end=end,line=heading['line'],references=[]))
    sources.append(dict(id=sid,name=name,filename=path.name,url=url,characters=len(text),chapters=chapters,sha256=digest))
# Follow source cross-references at ingestion time, before retrieval or display.
for i,chunk in enumerate(chunks):
    siblings=[c for c in chunks if c['source']==chunk['source'] and c['chapter']==chunk['chapter']]
    pos=next(j for j,c in enumerate(siblings) if c['id']==chunk['id'])
    targets=[]
    if re.search(r'下\s*一\s*题|下题',chunk['answer']) and pos+1<len(siblings): targets.append(siblings[pos+1]['id'])
    if re.search(r'上\s*一\s*题|上题',chunk['answer']) and pos>0: targets.append(siblings[pos-1]['id'])
    for match in re.finditer(r'(?:参考|参照|见|看)第?\s*(\d+)\s*题',chunk['answer']):
        target=next((c for c in siblings if c['questionNumber']==int(match.group(1))),None)
        if target and target['id']!=chunk['id']:targets.append(target['id'])
    chunk['references']=list(dict.fromkeys(targets))
version='kb-'+hashlib.sha256((json.dumps(outline,ensure_ascii=False)+'resolved-references-v1'+(ROOT/'dist'/'engine.js').read_text(encoding='utf-8')+(ROOT/'dist'/'app.js').read_text(encoding='utf-8')).encode()).hexdigest()[:16]
data=dict(sources=sources,chunks=chunks,version=version,snapshotDate='2026-11-20')
(ROOT/'dist'/'knowledge.js').write_text('window.KNOWLEDGE='+json.dumps(data,ensure_ascii=False).replace('</','<\\/')+';',encoding='utf-8')
(ROOT/'dist'/'knowledge.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
for _,_,path,_,_ in SOURCES:
    pass  # Canonical TXT files already live in dist.
html=(ROOT/'dist'/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+(ROOT/'dist'/'style.css').read_text(encoding='utf-8')+'</style>')
for name in ['knowledge.js','engine.js','answers.js','knowledge-import.js','project-code.js','app.js','knowledge-ui.js']:
    script=(ROOT/'dist'/name).read_text(encoding='utf-8').replace('</script','<\\/script')
    html=html.replace('<script src="'+name+'"></script>','<script>'+script+'</script>')
(ROOT/'面试知识库智能体.html').write_text(html,encoding='utf-8')
print(json.dumps(dict(chunks=len(chunks),sources=[dict(name=s['name'],characters=s['characters'],chunks=sum(c['source']==s['id'] for c in chunks)) for s in sources]),ensure_ascii=False))
