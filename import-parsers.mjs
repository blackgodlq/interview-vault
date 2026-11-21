import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import mammoth from 'mammoth/mammoth.browser.js';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.min.mjs',location.href).href;
export async function extractFile(file){
 if(file.size>20*1024*1024)throw new Error('单个文件最多 20 MB。');
 const extension=file.name.split('.').pop().toLowerCase();
 if(extension==='pdf'){
  const document=await pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
  try{const pages=[];for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),content=await page.getTextContent();let text='';for(const item of content.items){if('str'in item)text+=item.str+(item.hasEOL?'\n':' ');}pages.push(text.trim());}const text=pages.join('\n\n');if(!text.trim())throw new Error('没有提取到文字。扫描图片 PDF 需要先做文字识别。');return text;}finally{await document.destroy();}
 }
 if(extension==='docx'){const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});if(!result.value.trim())throw new Error('Word 文档中没有可提取的正文。');return result.value;}
 if(['txt','md','markdown','csv','json'].includes(extension)){
  const bytes=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('gb18030').decode(bytes);}
 }
 throw new Error('支持 TXT、Markdown、CSV、JSON、PDF 和 DOCX 文件。旧版 DOC 请先另存为 DOCX。');
}
