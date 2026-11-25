import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProfile,loadSources,profileVersion } from './config.js';
import { Store } from './store.js';
import { searchLinks } from './queries.js';
import { collect } from './sources.js';
import { loadAnswers,simulateBatch,type Answers } from '../applications/simulation.js';
import type { Profile } from './model.js';
const html=readFileSync(fileURLToPath(new URL('./ui.html',import.meta.url)),'utf8');
async function body(req: http.IncomingMessage): Promise<any> {
  const parts: Buffer[]=[];let size=0;
  for await(const part of req) {size+=part.length;if(size>2_000_000)throw new Error('Corpo excede 2 MB');parts.push(part);}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function csvCell(v: unknown): string {let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function createSearchServer(store: Store, initial: Profile, reload: ()=>Profile=loadProfile, answersLoader:()=>Answers=loadAnswers) {
  const token=randomBytes(32).toString('hex');let profile=initial;let collecting=false;
  return http.createServer(async(req,res)=>{
    const address=res.socket?.localPort; const hosts=[`127.0.0.1:${address}`,`localhost:${address}`];
    if(!hosts.includes(req.headers.host??'')){res.writeHead(403);res.end('Host inválido');return;}
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'nonce-"+token+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send=(code:number,data:unknown)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url??'/', 'http://127.0.0.1');
      if(req.method==='GET' && url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html.replaceAll('__TOKEN__',token));return;}
      if(req.method==='GET' && url.pathname==='/api/opportunities'){send(200,store.list());return;}
      if(req.method==='GET' && url.pathname==='/api/config'){send(200,{profile,profileVersion:profileVersion(profile),links:searchLinks(profile),runs:store.runs(),collecting});return;}
      if(req.method==='GET' && url.pathname==='/api/export'){
        const jobs=store.list();if(url.searchParams.get('format')==='csv'){
          res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="oportunidades.csv"'});
          res.end('\uFEFF'+[['id','cargo','empresa','modalidade','localizacao','score','elegibilidade','classificacao','url','justificativas','lacunas','incertezas','notas'],...jobs.map(j=>[j.id,j.title,j.company,j.mode,j.location,j.assessment.score,j.assessment.eligibility,j.reviewState,j.url,j.assessment.reasons.join('; '),j.assessment.gaps.join('; '),j.assessment.uncertainties.join('; '),j.notes])].map(row=>row.map(csvCell).join(',')).join('\r\n'));return;
        } res.setHeader('Content-Disposition','attachment; filename="oportunidades.json"');send(200,jobs);return;
      }
      if(req.method!=='POST'){send(404,{error:'Rota inexistente'});return;}
      const origin=req.headers.origin;
      if(req.headers['x-review-token']!==token || (origin && !hosts.some(h=>origin===`http://${h}`))){send(403,{error:'Requisição local não autorizada'});return;}
      if(url.pathname==='/api/collect') {
        if(collecting){send(409,{error:'Coleta já em andamento'});return;}collecting=true;
        try{const results=await collect(store,profile,loadSources());send(200,{results});}finally{collecting=false;}return;
      }
      if(url.pathname==='/api/reassess'){const next=reload();const count=store.reassess(next);profile=next;send(200,{count});return;}
      const data=await body(req);
      if(url.pathname==='/api/simulate'){if(data.mode!==undefined&&data.mode!=='simulation')throw new Error('Somente simulação local disponível');send(200,simulateBatch(store,profile,answersLoader()));return;}
      if(url.pathname==='/api/import'){if(!Array.isArray(data))throw new Error('Envie uma lista JSON');send(200,{processed:store.import(data,profile)});return;}
      if(url.pathname==='/api/review'){if(!Number.isSafeInteger(data.id)||data.id<1)throw new Error('ID inválido');send(store.review(data.id,data.state,data.notes)?200:404,{ok:true});return;}
      send(404,{error:'Rota inexistente'});
    }catch(e){send(400,{error:e instanceof Error?e.message:'Requisição inválida'});}
  });
}
