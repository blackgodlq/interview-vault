const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
esbuild.buildSync({absWorkingDir:root,tsconfigRaw:{compilerOptions:{}},entryPoints:[path.join(root,'import-parsers.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:path.join(root,'dist/import-parsers.mjs')});
fs.copyFileSync(path.join(root,'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(root,'dist/pdf.worker.min.mjs'));
console.log('PDF and DOCX parsers bundled.');
