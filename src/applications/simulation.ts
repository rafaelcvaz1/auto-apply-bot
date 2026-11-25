import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Profile, Opportunity } from '../discovery/model.js';
import { canonicalUrl,normalize } from '../discovery/model.js';
import { profileVersion } from '../discovery/config.js';
import { inferContract } from '../discovery/policy.js';
import { assess,hasTerm } from '../discovery/matching.js';
import { plain } from '../discovery/text.js';
import type { Store } from '../discovery/store.js';
export interface Answers {
  schemaVersion:1; candidateKey:string; contact:Record<string,string>; baseAnswers:Record<string,string>;
  realSubmissionEnabled:false; emailDeliveryEnabled:false;
}
export interface FormField { id:string; label:string; required:boolean; answerKey?:string; type?:'text'|'number'|'boolean'; options?:string[] }
export interface Simulation {
  id?:number; jobId:number; title:string; url:string; identity:string; profileVersion:string;
  status:'blocked'|'pending'|'simulated_ready'|'failed'; duplicate:boolean;
  filled:Record<string,string|number|boolean>; pending:{fieldId:string;question:string;reason:string}[];
  reasons:string[]; schemaSource:'local_template'; realSubmission:false; receipt:null;
}
export function loadAnswers(file=process.env.APPLICATION_PROFILE||'config/application-profile.local.json'):Answers {
  const a=JSON.parse(readFileSync(file,'utf8'));
  if(a.schemaVersion!==1||typeof a.candidateKey!=='string'||a.candidateKey.length<16||a.candidateKey.length>200||a.realSubmissionEnabled!==false||a.emailDeliveryEnabled!==false||!a.contact||!a.baseAnswers||![a.contact,a.baseAnswers].every(o=>typeof o==='object'&&!Array.isArray(o)&&Object.values(o).every(v=>typeof v==='string'&&v.length<=10000)))throw new Error('Respostas locais inválidas; envio real e e-mail devem permanecer desativados');
  return a;
}
export const defaultForm:FormField[]=[
  {id:'name',label:'Nome completo',required:true,answerKey:'full_name'},
  {id:'email',label:'E-mail',required:true,answerKey:'email'},
  {id:'education',label:'Situação atual da graduação',required:true,answerKey:'education_status',options:['Cursando','Concluído']},
  {id:'salary',label:'Pretensão mensal em BRL para o contrato da vaga',required:true,answerKey:'salary',type:'number'},
  {id:'availability',label:'Disponibilidade para início',required:true,answerKey:'availability'},
  {id:'privacy',label:'Aceite específico de privacidade da empregadora (não fornecido nesta simulação)',required:true},
];
export function validateForm(value:unknown):FormField[] {
  if(!Array.isArray(value)||value.length>100)throw new Error('Formulário deve conter até 100 campos');
  const ids=new Set<string>();
  for(const f of value){
    if(!f||typeof f.id!=='string'||!f.id.trim()||f.id.length>200||ids.has(f.id)||typeof f.label!=='string'||!f.label.trim()||f.label.length>2000||typeof f.required!=='boolean'||(f.answerKey!==undefined&&(typeof f.answerKey!=='string'||f.answerKey.length>200))||(f.type!==undefined&&!['text','number','boolean'].includes(f.type))||(f.options!==undefined&&(!Array.isArray(f.options)||f.options.length>100||!f.options.every((s:unknown)=>typeof s==='string'&&s.length<=1000))))throw new Error('Campo de formulário inválido');
    ids.add(f.id);
  }
  return value;
}
/** Stable across tracking URLs, policy changes and Gupy's two public route formats. */
export function applicationIdentity(url:string):string {
  const u=new URL(canonicalUrl(url));
  if(u.hostname.endsWith('.gupy.io')){
    let id=u.pathname.match(/^\/jobs\/(\d+)$/)?.[1];
    if(!id&&u.pathname.startsWith('/job/'))try{const j=JSON.parse(Buffer.from(decodeURIComponent(u.pathname.slice(5)),'base64').toString());if(/^\d+$/.test(String(j.jobId)))id=String(j.jobId);}catch{/* Unknown route stays distinct. */}
    if(id)return `gupy:${u.hostname}:${id}`;
  }
  return u.toString();
}
function answer(field:FormField,job:Opportunity,p:Profile,a:Answers):string|number|boolean|undefined {
  const key=field.answerKey;if(!key)return;
  const contactKeys=['full_name','email','phone','city','state'];
  if(contactKeys.includes(key))return a.contact[key];
  if(key==='education_status')return 'Cursando';
  if(key==='academic_completion_year')return p.education.expectedAcademicCompletionYear;
  if(key==='graduation_year')return p.education.expectedGraduationYear;
  const r=p.applicationRules;
  if(key==='salary'){
    if(!r||/anual|annual|por ano|hora|hour|usd|dolar/.test(normalize(field.label)))return;
    const contract=inferContract(job);return contract==='CLT'?r.expectedCltMonthly:contract==='PJ'?(r.expectedPjMonthly??undefined):undefined;
  }
  const known:Record<string,string|boolean|undefined>={availability:r?.availability,travel:r?.travel,driving_license:r?.drivingLicense,own_vehicle:r?.ownVehicle,work_sundays:r?.workSundays,weekday_nights:r?.weekdayNightShifts,saturday_flexible:r?.saturdayFlexible};
  if(Object.hasOwn(known,key))return known[key];
  if(key==='interest_in_job'){
    const raw=plain(job.description), responsibilities=raw.includes('Responsabilidades:')?raw.split('Responsabilidades:')[1].split('Requisitos:')[0]:raw;
    const skills=p.skills.filter(s=>hasTerm(responsibilities,s.name));
    const activity=responsibilities.split(/[.;\n]/).find(s=>/analis|consult|extr|trat|automat|dashboard|indicad|relatorio/i.test(s)&&skills.some(k=>hasTerm(s,k.name)));
    if(activity&&skills.length)return `Interessei-me pela atividade descrita no anúncio: ${activity.trim().slice(0,300)}. Ela se relaciona aos meus conhecimentos em ${skills.slice(0,3).map(s=>s.name).join(', ')} e ao meu interesse em trabalhar com dados em diferentes setores.`;
    return;
  }
  return Object.hasOwn(a.baseAnswers,key)?a.baseAnswers[key]:undefined;
}
export function simulate(job:Opportunity,p:Profile,a:Answers,form:FormField[]=defaultForm):Simulation {
  validateForm(form);
  if(a.realSubmissionEnabled!==false||a.emailDeliveryEnabled!==false)throw new Error('Envio real e e-mail desativados nesta rodada');
  const assessment=assess(job,p);
  const result:Simulation={jobId:job.id,title:job.title,url:job.url,identity:applicationIdentity(job.url),profileVersion:profileVersion(p),status:'pending',duplicate:false,filled:{},pending:[],reasons:[],schemaSource:'local_template',realSubmission:false,receipt:null};
  if(assessment.eligibility==='incompativel'){result.status='blocked';result.reasons=assessment.gaps;return result;}
  result.reasons.push(...assessment.uncertainties);
  for(const f of form){
    let value=answer(f,job,p,a);
    if(f.options && value!==undefined){const wanted=typeof value==='boolean'?(value?'sim':'nao'):normalize(String(value));value=f.options.find(o=>normalize(o)===wanted);}
    const valid=value!==undefined&&value!==''&&(!(f.type==='number')||(typeof value==='number'&&Number.isFinite(value)))&&(!(f.type==='boolean')||typeof value==='boolean');
    if(valid)Object.defineProperty(result.filled,f.id,{value,enumerable:true,configurable:true});
    else if(f.required)result.pending.push({fieldId:f.id,question:f.label,reason:f.answerKey==='salary'&&inferContract(job)==='PJ'?'Pretensão PJ não definida; valor obrigatório pendente':'Resposta confirmada ausente ou incompatível com as opções/tipo; requer esclarecimento'});
  }
  result.status=assessment.eligibility==='compativel'&&!result.pending.length?'simulated_ready':'pending';
  return result;
}
export interface SimulationBatch { mode:'simulation'; schemaSource:'local_template'; realSubmission:false; providerStatus:string; results:Simulation[]; emailPreview:{subject:string;body:string;deliveryEnabled:false}; counts:Record<string,number> }
export function simulateBatch(store:Store,p:Profile,a:Answers,form:FormField[]=defaultForm):SimulationBatch {
  validateForm(form);
  if(!p.applicationRules)throw new Error('Configure as regras de candidatura no perfil local antes de simular');
  if(a.realSubmissionEnabled!==false||a.emailDeliveryEnabled!==false)throw new Error('Envio real e e-mail desativados nesta rodada');
  const results=store.list().map(job=>{
    try {
    // Do not treat simulations as external receipts. Changes in inputs permit re-planning but never enable sending.
    const input=createHash('sha256').update(JSON.stringify({version:1,profile:p,job:{title:job.title,company:job.company,location:job.location,seniority:job.seniority,publishedAt:job.publishedAt,description:job.description,identity:applicationIdentity(job.url),contract:job.contract,companyOrigin:job.companyOrigin,salary:job.salary,requiresOwnVehicle:job.requiresOwnVehicle,requiresSundayWork:job.requiresSundayWork,requiresRelocation:job.requiresRelocation,mode:job.mode,remoteEligibility:job.remoteEligibility,status:job.status,expiresAt:job.expiresAt,requirements:job.requirements,minimumYears:job.minimumYears,requiresCompletedDegree:job.requiresCompletedDegree,englishRequired:job.englishRequired},answers:a,form})).digest('hex');
    return store.saveSimulation(a.candidateKey,applicationIdentity(job.url),input,simulate(job,p,a,form));
    } catch(e) {
      const failed:Simulation={jobId:job.id,title:job.title,url:job.url,identity:applicationIdentity(job.url),profileVersion:profileVersion(p),status:'failed',duplicate:false,filled:{},pending:[],reasons:['Falha local na simulação: '+(e instanceof Error?e.message:'Erro desconhecido')],schemaSource:'local_template',realSubmission:false,receipt:null};
      return failed;
    }
  });
  const counts={blocked:results.filter(r=>r.status==='blocked').length,pending:results.filter(r=>r.status==='pending').length,simulatedReady:results.filter(r=>r.status==='simulated_ready').length,failed:results.filter(r=>r.status==='failed').length,duplicates:results.filter(r=>r.duplicate).length,confirmed:0};
  const lines=(items:Simulation[])=>items.length?items.map(r=>`${r.title} — ${r.url}\n${[...r.reasons,...r.pending.map(q=>q.question+': '+q.reason)].join('; ')}`).join('\n\n'):'Nenhuma.';
  const body=['SIMULAÇÃO LOCAL — e-mail não enviado. Nenhuma candidatura transmitida.','ENVIOS CONFIRMADOS: 0 (sem recibos externos).','PENDÊNCIAS:',lines(results.filter(r=>r.status==='pending')),'FALHAS:',lines(results.filter(r=>r.status==='failed')),'EXCLUÍDAS:',lines(results.filter(r=>r.status==='blocked')),`PREPARADAS APENAS NA SIMULAÇÃO: ${counts.simulatedReady}`,`DUPLICATAS EVITADAS: ${counts.duplicates}`].join('\n\n');
  return {mode:'simulation',schemaSource:'local_template',realSubmission:false,providerStatus:'Sem integração de envio autorizada para a conta de candidato. Nenhum transporte de envio implementado.',results,counts,emailPreview:{subject:'Radar — simulação de candidaturas, pendências e falhas',body,deliveryEnabled:false}};
}
export function submitReal():never {throw new Error('Envio real indisponível: integração autorizada e confirmação externa não implementadas');}
