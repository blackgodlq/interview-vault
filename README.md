# Interview Vault · 面试知识库智能体

本地优先的面试资料检索工具：使用 BM25、TF-IDF 和题目匹配召回知识，在左栏显示本地检索原文，同时在右栏用 DeepSeek 非思考模式流式生成口述回答。使用 JavaScript / Node.js、HTML 和 CSS 实现。

## 启动

需要 Node.js 22 或更新版本。

```sh
npm ci
npm start
```

打开 http://127.0.0.1:18765 。在页面右上角配置自己的 DeepSeek API Key，或在启动前设置 `DEEPSEEK_API_KEY` 环境变量。项目不会自动加载 `.env`。模型调用会消耗使用者的 DeepSeek 额度；问题和候选内容会发送到 DeepSeek。

## 功能

- 口语化问题检索、原文回答、自动展开题目引用。
- Markdown 表格、加粗、代码块和分点显示。
- 页面新增知识、导入 TXT / Markdown / DOCX / PDF；扫描 PDF 需要先 OCR。
- 新知识保存于服务端 `knowledge-data/shared.json`，访问者共享；导入与管理限本机。
- 重复问题内存缓存，减少模型调用。

仓库包含 Java 和 Python / AI 两份资料、642 个问答，以及补充的表格。原始 TXT 位于 `dist/`，可在页面继续导入自己的资料。服务端后来上传的私人内容不包含在仓库中。

## 网络与密钥

服务默认监听 `0.0.0.0:18765`，没有登录鉴权。网络可达的访问者可以使用服务端配置的 API Key 发起模型请求。公网部署前应自行加上认证、限流与 HTTPS；防火墙和路由器不会由程序自动配置。Key 不应提交到仓库。

## 开发

`server.cjs` 是 HTTP 后端，`rag.mjs` 负责模型请求，`dist/engine.js` 负责检索，`dist/app.js` 负责答案展示。`import-parsers.mjs` 是文档解析源码；运行 `npm run build:imports` 更新浏览器解析包。

`dist/knowledge.json` 与 `dist/knowledge.js` 是预置知识的 JSON 和浏览器脚本，二者需保持一致；日常资料建议使用页面导入。无需 Python 即可运行。

Windows 无窗口启动器 `launcher.vbs` 需要在同目录 `runtime-node.txt` 中保存本机 node.exe 绝对路径（UTF-16），也可以直接使用 `npm start`。

## 开源协议

原创程序代码采用 MIT 协议。Java/Python 文档与对应知识数据的版权归原权利人，不包含在程序代码的 MIT 授权内。第三方依赖遵守各自协议；使用者导入的文档版权属于原权利人。

## 重建知识索引

需要 Python 3。修改 `dist/` 中的 TXT 后，先运行 `node prepare-outline.mjs` 更新目录（需 DeepSeek Key 并消耗 tokens），再运行 `python build.py`。`outline.json` 保存题目边界和源文件摘要。

## 双栏问答

左栏根据资料范围进行本地检索并显示完整原文。右栏每次提问都会独立调用 DeepSeek，生成适合口述的面试回答并消耗 API 额度。窄屏使用标签切换两栏。
