// #!/usr/bin/env node
// import fs from 'node:fs';
// import fsp from 'node:fs/promises';
// import path from 'node:path';
// import { spawn } from 'node:child_process';

// const ROOT = path.resolve(process.cwd());
// const PROJECT_ID = 'exemple';
// const PROJECT_DIR = path.join('src','assets','projects', PROJECT_ID);
// const SRC_DIR = path.join(PROJECT_DIR, 'source-tpuml');
// const GEN_PUML_DIR = path.join(PROJECT_DIR, 'gen-puml');
// const EXPORT_DIR = path.join(PROJECT_DIR, 'export');
// const EXPORT_SVG_DIR = path.join(EXPORT_DIR, 'svg');
// const TOOLS_DIR = path.join(PROJECT_DIR, 'tools');
// const JAR_PATH = path.join(TOOLS_DIR, 'plantuml.jar');
// const MANIFEST_PATH = path.join(PROJECT_DIR, 'manifest.json');
// const BUNDLE_ZIP = path.join(EXPORT_DIR, 'tpuml_bundle.zip');

// function looksLikeTpuml(src){return /@starttpuml\b/i.test(src)||/^\s*type\s+\w+/m.test(src)||/^\s*include\s+/m.test(src)}
// function transpileTpuml(src){
//   const TYPE_TEMPLATES={Actor:(id,label)=>`actor ${label?`\"${label}\" `:''}as ${id}`,Service:(id,label,stereo)=>`participant ${label?`\"${label}\" `:''}as ${id}${stereo?` <<${stereo}>>`:' <<service>>'}`,DB:(id,label)=>`database ${label?`\"${label}\" `:''}as ${id}`,Queue:(id,label)=>`queue ${label?`\"${label}\" `:''}as ${id}`,Boundary:(id,label)=>`boundary ${label?`\"${label}\" `:''}as ${id}`};
//   const lines=src.split(/\r?\n/);const includes=[],decls=[],body=[];
//   const typeRe=/^type\s+(\w+)\s+([A-Za-z_][\w]*)\s*(?:\"([^\"]*)\")?\s*(?:<<\s*([A-Za-z0-9_+-]+)\s*>>)?\s*$/;
//   const includeRe=/^(?:include|!include)\s+(.+)\s*$/;const startTypedRe=/^\s*@starttpuml\s*$/i;const endTypedRe=/^\s*@endtpuml\s*$/i;
//   for(const raw of lines){const line=raw.trim();if(startTypedRe.test(line)||endTypedRe.test(line))continue;
//     const inc=line.match(includeRe);if(inc){includes.push(`!include ${inc[1]}`);continue;}
//     const m=line.match(typeRe);if(m){const[,t,id,quoted,stereo]=m;const tpl=TYPE_TEMPLATES[t];if(!tpl)throw new Error('Type inconnu: '+t);decls.push(tpl(id,quoted,stereo));continue;}
//     body.push(raw);}
//   const out=['@startuml',...includes];if(decls.length)out.push('',...decls,'');out.push(...body,'@enduml');return out.join('\n');
// }

// async function ensureDirs(){await fsp.mkdir(GEN_PUML_DIR,{recursive:true});await fsp.mkdir(EXPORT_SVG_DIR,{recursive:true});}

// async function transpileAll(){
//   await ensureDirs();
//   const startersDir=path.join(SRC_DIR,'starter');
//   const files=(await fsp.readdir(startersDir)).filter(f=>f.endsWith('.starttpuml'));
//   const items=[];
//   for(const file of files){
//     const tpPath=path.join(startersDir,file);
//     const base=path.basename(file,'.starttpuml');
//     const pumlOut=path.join(GEN_PUML_DIR,base+'.puml');
//     const svgOut=path.join(EXPORT_SVG_DIR,base+'.svg');
//     const src=await fsp.readFile(tpPath,'utf-8');
//     const puml=transpileTpuml(src);
//     await fsp.writeFile(pumlOut,puml,'utf-8');
//     await new Promise((resolve,reject)=>{
//       const child=spawn('java',['-Djava.awt.headless=true','-jar',path.join(ROOT,JAR_PATH),'-tsvg','-pipe','-DPLANTUML_SECURITY_PROFILE=LEGACY'],{stdio:['pipe','pipe','inherit']});
//       let out='';child.stdout.on('data',d=>out+=d);child.on('error',reject);child.on('close',code=>{code===0?resolve(out):reject(new Error('PlantUML failed '+code));});
//       child.stdin.write(puml);child.stdin.end();
//     }).then(async(svgText)=>{await fsp.writeFile(svgOut,svgText,'utf-8');});
//     items.push({title: base.replace(/[-_]/g,' ').replace(/\b\w/g,m=>m.toUpperCase()), svg: path.relative(EXPORT_DIR,svgOut).replace(/\\/g,'/'), puml: path.relative(PROJECT_DIR,pumlOut).replace(/\\/g,'/'), tpuml: path.relative(PROJECT_DIR,tpPath).replace(/\\/g,'/') });
//   }
//   const manifest={project:PROJECT_ID,items};
//   await fsp.writeFile(MANIFEST_PATH,JSON.stringify(manifest,null,2),'utf-8');
//   await fsp.writeFile(path.join(PROJECT_DIR,'export','tpuml_bundle.zip'), 'Bundle created after installing zip-lib or using your own zipping.', 'utf-8');
//   console.log('✓ Transpile OK');
// }

// const args=process.argv.slice(2);
// if(args.includes('--gen')){transpileAll().catch(e=>{console.error(e);process.exit(1);});}
// else if(args.includes('--watch')){console.log('Watching not implemented in this minimal build');}
// else{console.log('Usage: node tpuml-pipeline.mjs --gen | --watch');}