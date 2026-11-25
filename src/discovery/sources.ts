import type { Job, Profile } from './model.js';
import { normalize, validateJob } from './model.js';
import { relevantRole, inferSeniority, assess } from './matching.js';
import { jobFindings } from './evidence.js';
import { plain } from './text.js';
import type { Sources } from './config.js';
import type { Store } from './store.js';
export function remoteRegion(location: string): Job['remoteEligibility'] {
  const t=normalize(location);
  if(/\b(?:except|excluding|exceto|excluindo) (?:brazil|brasil)\b/.test(t))return 'fora_BR';
  if(/\b(except|excluding|not available|exceto|excluindo|only|apenas|somente)\b/.test(t))return /^(usa only|us only|united states only|europe only|germany only|uk only)$/.test(t)?'fora_BR':'desconhecida';
  if(/\b(worldwide|anywhere in the world|global|anywhere)\b/.test(t))return 'global';
  if(/\b(brazil|brasil|latin america|latam|south america)\b/.test(t))return 'BR';
  return 'desconhecida';
}
async function request(url: string, timeout: number): Promise<string> {
  const response=await fetch(url,{signal:AbortSignal.timeout(timeout),redirect:'error',headers:{accept:'application/json, text/html','user-agent':'PersonalJobDiscovery/1.0'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const reader=response.body?.getReader();if(!reader)throw new Error('Resposta vazia');
  const chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>15_000_000)throw new Error('Resposta excedeu 15 MB');chunks.push(value);}}finally{await reader.cancel();}
  return Buffer.concat(chunks).toString('utf8');
}
export function mapRemotive(raw:any):Job {
  const location=plain(raw.candidate_required_location);
  return {title:plain(raw.title),company:plain(raw.company_name),url:String(raw.url),source:'Remotive',description:plain(raw.description),location,mode:'remoto',remoteEligibility:remoteRegion(location),seniority:inferSeniority(plain(raw.title)),...(raw.publication_date?{publishedAt:new Date(raw.publication_date).toISOString()}:{})};
}
export function mapArbeitnow(raw:any):Job {
  const location=plain(raw.location);
  return {title:plain(raw.title),company:plain(raw.company_name),url:String(raw.url),source:'Arbeitnow',description:plain(raw.description),location,mode:raw.remote===true?'remoto':'desconhecido',remoteEligibility:'desconhecida',seniority:inferSeniority(plain(raw.title)),...(Number.isFinite(raw.created_at)?{publishedAt:new Date(raw.created_at*1000).toISOString()}:{})};
}
export function mapGreenhouse(raw:any,board:string):Job {
  const location=plain(raw.location?.name);
  const remote=/\b(remote|remoto)\b/.test(normalize(location));
  return {title:plain(raw.title),company:board,url:String(raw.absolute_url),source:'Greenhouse:'+board,description:plain(raw.content),location,mode:remote?'remoto':'desconhecido',remoteEligibility:remote?remoteRegion(location):'desconhecida',seniority:inferSeniority(plain(raw.title)),...(raw.first_published?{publishedAt:new Date(raw.first_published).toISOString()}:{})};
}
function scriptData(html:string):any[] {
  const values:any[]=[];
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(/(?:application\/ld\+json|__NEXT_DATA__)/i.test(m[1]))try{values.push(JSON.parse(m[2].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')));}catch{/* Other scripts are not executed. */}
  }
  return values;
}
function visit(value:any,accept:(v:any)=>void):void {
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const x of value)visit(x,accept);return;}
  accept(value);for(const x of Object.values(value))visit(x,accept);
}
export function parseGupyListing(html:string,board:string):{id:string;title:string;location?:string;remote?:boolean}[] {
  const rows=new Map<string,string>();const metadata=new Map<string,{location:string;remote:boolean}>();
  const add=(id:unknown,title:unknown)=>{if(!rows.has(String(id))&&/^\d+$/.test(String(id))&&typeof title==='string'&&title.trim())rows.set(String(id),plain(title));};
  for(const data of scriptData(html))visit(data,v=>{if(v.workplace?.address&&v.id){const a=v.workplace.address;metadata.set(String(v.id),{location:[a.city,a.stateShortName,a.country].filter(Boolean).join(', '),remote:v.workplace.workplaceType==='remote'});}if(v.id!==undefined && (v.addressCity!==undefined||v.workplaceType!==undefined||v.jobType!==undefined||v.workplace!==undefined||v.type==='job'))add(v.id,v.name??v.title);});
  for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try{const url=new URL(match[1],`https://${board}.gupy.io`);if(url.hostname!==`${board}.gupy.io`)continue;
      const path=url.pathname.match(/^\/jobs\/(\d+)$/);if(path)add(path[1],plain(match[2]));
      else if(url.pathname.startsWith('/job/')){const encoded=decodeURIComponent(url.pathname.slice(5));const data=JSON.parse(Buffer.from(encoded,'base64').toString());add(data.jobId,plain(match[2]));}
    }catch{/* Never navigate to arbitrary or invalid URLs. */}
  }
  if(!rows.size&&!/\b(?:0 vagas|nenhuma vaga|no jobs)\b/i.test(plain(html)))throw new Error('Listagem pública sem vagas extraíveis; layout não suportado (não equivale a zero vagas)');
  return [...rows].map(([id,title])=>({id,title,...metadata.get(id)}));
}
export function parseGupyJob(html:string,board:string,id:string):Job {
  let posting:any, native:any;
  for(const data of scriptData(html)){
    if(data.props?.pageProps?.job)native=data.props.pageProps.job;
    visit(data,v=>{if(v['@type']==='JobPosting')posting=v;});
  }
  if(native && String(native.id)===id){
    const mode=native.workplaceType==='remote'?'remoto':native.workplaceType==='hybrid'?'hibrido':native.workplaceType==='on-site'?'presencial':'desconhecido';
    const expires=native.registerEndDate??native.expiresAt;
    return {title:plain(native.name),company:plain(native.careerPage?.name)||board,url:`https://${board}.gupy.io/jobs/${id}`,source:'Gupy:'+board,
      description:plain([native.description,'Responsabilidades: '+(native.responsibilities||''),'Requisitos: '+(native.prerequisites||''),native.relevantExperiences].filter(Boolean).join(' ')),
      location:[native.addressCity,native.addressStateShortName??native.addressState,native.addressCountry].filter(Boolean).join(', '),mode,
      remoteEligibility:'desconhecida',seniority:inferSeniority(plain(native.name)),
      ...(native.publishedAt?{publishedAt:new Date(native.publishedAt).toISOString()}:{}),
      ...(expires&&Number.isFinite(Date.parse(expires))?{expiresAt:new Date(/^\d{4}-\d{2}-\d{2}$/.test(expires)?expires+'T23:59:59-03:00':expires).toISOString()}:{}),
      status:native.status==='published'?'open':native.status==='closed'||native.status==='unpublished'?'closed':'unknown'};
  }
  if(!posting)throw new Error('Detalhe público sem dados estruturados; revisão manual necessária');
  const address=(Array.isArray(posting.jobLocation)?posting.jobLocation[0]:posting.jobLocation)?.address;
  const country=typeof address?.addressCountry==='object'?address.addressCountry.name:address?.addressCountry;
  const location=[address?.addressLocality,address?.addressRegion,country].filter(Boolean).join(', ');
  const remote=posting.jobLocationType==='TELECOMMUTE';
  const regions=Array.isArray(posting.applicantLocationRequirements)?posting.applicantLocationRequirements:[posting.applicantLocationRequirements];
  const region=regions.filter(Boolean).map((x:any)=>x.name??x.addressCountry??'').join(', ');
  return {title:plain(posting.title),company:plain(posting.hiringOrganization?.name)||board,url:`https://${board}.gupy.io/jobs/${id}`,source:'Gupy:'+board,description:plain(posting.description),location:location||region,mode:remote?'remoto':'desconhecido',remoteEligibility:remote?remoteRegion(region):'desconhecida',seniority:inferSeniority(plain(posting.title)),...(posting.datePosted?{publishedAt:new Date(posting.datePosted).toISOString()}:{}),...(posting.validThrough&&Number.isFinite(Date.parse(posting.validThrough))?{expiresAt:new Date(posting.validThrough).toISOString()}:{})};
}
export interface SourceResult {source:string;fetched:number;imported:number;invalid:number;compatible:number;review:number;incompatible:number;excluded:number;detailErrors:string[];error?:string;warning?:string;truncated?:boolean}
export async function collect(store:Store,p:Profile,s:Sources):Promise<SourceResult[]> {
  const results:SourceResult[]=[];
  const run=async(source:string,warning:string,load:(r:SourceResult,save:(j:Job)=>void)=>Promise<void>)=>{
    const r:SourceResult={source,fetched:0,imported:0,invalid:0,compatible:0,review:0,incompatible:0,excluded:0,detailErrors:[],warning};
    const seen=new Set<string>();
    const save=(input:Job)=>{try{const j=validateJob(input);if(!relevantRole(j.title,p,j.description)){r.excluded++;return;}if(seen.has(j.url))return;seen.add(j.url);
      const findings=jobFindings(j,p);j.mode=findings.mode;j.remoteEligibility=findings.region;
      r.imported+=store.import([j],p);const a=assess(j,p);if(a.eligibility==='compativel')r.compatible++;else if(a.eligibility==='revisar')r.review++;else r.incompatible++;
    }catch{r.invalid++;}};
    try{await load(r,save);}catch(e){r.error=e instanceof Error?e.message+((e.cause as any)?.code?' ('+(e.cause as any).code+')':''):'Falha de coleta';}
    results.push(r);
  };
  // Brazilian company boards first. Listings and details are GET-only and bounded.
  for(const board of s.gupyBoards)await run('Gupy:'+board,'Página pública da empresa; cobertura limitada aos itens expostos no HTML. Sem login, envio ou paginação automática.',async(r,save)=>{
    const rows=parseGupyListing(await request(`https://${board}.gupy.io/`,s.timeoutMs),board);r.fetched=rows.length;
    const limit=s.maxDetailsPerSource??20;
    // Read descriptions of generic analytical titles too; do not require exact title matches.
    const candidates=rows.sort((a,b)=>{const priority=(x:{title:string;location?:string;remote?:boolean})=>(relevantRole(x.title,p)?4:0)+(p.preferences.onsiteCities.some(c=>normalize(x.location??x.title).includes(normalize(c)))?3:0)+(x.remote||/remot/i.test(x.title)?2:0)-(/senior|sr|gerente|coordenador/i.test(x.title)?2:0);return priority(b)-priority(a);}).filter(x=>relevantRole(x.title,p)||/\b(analista|assistente|auxiliar|estag|trainee|analyst|pesquisa|planejamento|operac)/i.test(normalize(x.title))).slice(0,s.maxJobsPerSource);
    r.truncated=candidates.length>limit;
    for(const row of candidates.slice(0,limit))try{save(parseGupyJob(await request(`https://${board}.gupy.io/jobs/${row.id}`,s.timeoutMs),board,row.id));}catch(e){r.detailErrors.push(row.id+': '+(e instanceof Error?e.message:'Falha no detalhe'));}
  });
  for(const board of s.greenhouseBoards??[])await run('Greenhouse:'+board,'API pública por empresa; localização e requisitos ainda exigem confirmação quando ausentes.',async(r,save)=>{
    const data=JSON.parse(await request(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,s.timeoutMs));if(!Array.isArray(data.jobs))throw new Error('Formato de feed inesperado');r.fetched=data.jobs.length;r.truncated=data.jobs.length>s.maxJobsPerSource;
    for(const row of data.jobs.slice(0,s.maxJobsPerSource))try{save(mapGreenhouse(row,board));}catch{r.invalid++;}
  });
  for(const [source,url,field,map,enabled,warning] of [
    ['Remotive','https://remotive.com/api/remote-jobs','jobs',mapRemotive,s.remotive,'Feed internacional com atraso; cobertura limitada para Brasil.'],
    ['Arbeitnow','https://www.arbeitnow.com/api/job-board-api','data',mapArbeitnow,s.arbeitnow,'Primeira página internacional; remoto não comprova contratação no Brasil.'],
  ] as const)if(enabled)await run(source,warning,async(r,save)=>{
    const data=JSON.parse(await request(url,s.timeoutMs));if(!Array.isArray(data[field]))throw new Error('Formato de feed inesperado');r.fetched=data[field].length;r.truncated=r.fetched>s.maxJobsPerSource;
    for(const raw of data[field].slice(0,s.maxJobsPerSource))try{save(map(raw));}catch{r.invalid++;}
  });
  store.logRun({results});return results;
}
