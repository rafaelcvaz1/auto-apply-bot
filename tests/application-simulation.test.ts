import { describe,it,expect,vi } from 'vitest';
import { Store } from '../src/discovery/store';
import { simulate,simulateBatch,applicationIdentity,submitReal,type Answers,type FormField } from '../src/applications/simulation';
import { profile,job } from './application-fixtures';
const answers:Answers={schemaVersion:1,candidateKey:'candidate-test-isolated',contact:{full_name:'Candidato de teste',email:'fixture@example.org'},baseAnswers:{about:'Texto confirmado no teste',learning:'Interesses de desenvolvimento'},realSubmissionEnabled:false,emailDeliveryEnabled:false};
const form:FormField[]=[{id:'education',label:'Situação atual',required:true,answerKey:'education_status',options:['Cursando','Concluído']},{id:'salary',label:'Pretensão mensal BRL',required:true,answerKey:'salary',type:'number'},{id:'vehicle',label:'Possui veículo?',required:true,answerKey:'own_vehicle',type:'boolean'}];
function withStore(fn:(s:Store)=>void){const s=new Store(':memory:');try{s.import([job],profile);fn(s);}finally{s.close();}}
describe('simulação sem transporte externo',()=>{
 it('preenche Cursando, pretensão CLT e falso sem perder resposta negativa',()=>withStore(s=>{const r=simulate(s.list()[0],profile,answers,form);expect(r.filled).toEqual({education:'Cursando',salary:2000,vehicle:false});expect(r.status).toBe('simulated_ready');expect(r.receipt).toBeNull();expect(r.realSubmission).toBe(false);}));
 it('pretensão PJ obrigatória fica pendente e não herda valor CLT',()=>withStore(s=>{const r=simulate({...s.list()[0],contract:'PJ'},profile,answers,form);expect(r.filled).not.toHaveProperty('salary');expect(r.pending).toContainEqual(expect.objectContaining({fieldId:'salary',reason:expect.stringContaining('PJ')}));}));
 it('pergunta obrigatória desconhecida e consentimento não são inventados',()=>withStore(s=>{const r=simulate(s.list()[0],profile,answers,[{id:'cpf',label:'Informe CPF',required:true},{id:'consent',label:'Aceita política específica?',required:true}]);expect(r.status).toBe('pending');expect(r.pending).toHaveLength(2);expect(r.filled).toEqual({});}));
 it('opção incompatível e salário anual não recebem resposta mensal automática',()=>withStore(s=>{const r=simulate(s.list()[0],profile,answers,[{id:'degree',label:'Formação',required:true,answerKey:'education_status',options:['Concluído']},{id:'salary',label:'Pretensão anual',required:true,answerKey:'salary'}]);expect(r.pending).toHaveLength(2);}));
 it('bloqueia estágio antes de preencher dados pessoais',()=>withStore(s=>{const r=simulate({...s.list()[0],seniority:'estagio'},profile,answers,form);expect(r.status).toBe('blocked');expect(r.filled).toEqual({});}));
 it('redige interesse somente com atividade concreta, sem inventar qualificação',()=>withStore(s=>{const r=simulate({...s.list()[0],description:'Responsabilidades: Automatizar relatórios com Python. Requisitos: SQL.'},profile,answers,[{id:'why',label:'Por quê?',required:true,answerKey:'interest_in_job'}]);expect(r.filled.why).toContain('Automatizar relatórios com Python');expect(r.filled.why).not.toContain('avançado');}));
 it('mantém intenções de aprender fora de competências comprovadas',()=>withStore(s=>{const r=simulate(s.list()[0],profile,answers,[{id:'ml',label:'Anos de experiência com ML?',required:true,answerKey:'machine_learning_years'}]);expect(r.pending).toHaveLength(1);}));
 it('evita reprocessar a mesma simulação e não registra confirmação externa',()=>withStore(s=>{const spy=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw new Error('Rede não permitida na simulação');});try{const first=simulateBatch(s,profile,answers,form),second=simulateBatch(s,profile,answers,form);expect(first.counts.duplicates).toBe(0);expect(second.counts.duplicates).toBe(1);expect(second.counts.confirmed).toBe(0);expect(second.emailPreview.deliveryEnabled).toBe(false);expect(spy).not.toHaveBeenCalled();expect(s.db.prepare('SELECT count(*) n FROM application_simulations').get()).toEqual({n:1});}finally{spy.mockRestore();}}));
 it('perfil alterado permite nova simulação sem gerar recibo ou habilitar envio',()=>withStore(s=>{simulateBatch(s,profile,answers,form);const changed={...profile,applicationRules:{...profile.applicationRules!,expectedCltMonthly:2500}};const r=simulateBatch(s,changed,answers,form);expect(r.counts.duplicates).toBe(0);expect(r.results[0].filled.salary).toBe(2500);expect(r.results[0].receipt).toBeNull();}));
 it('preserva favoritas, notas, datas e histórico de coletas',()=>withStore(s=>{s.review(1,'favorita','Não alterar');s.logRun({results:[]});const before=s.list()[0];simulateBatch(s,profile,answers,form);expect(s.list()[0]).toEqual(before);expect(s.runs()).toHaveLength(1);}));
 it('deduplica variantes da mesma vaga Gupy',()=>{const encoded=Buffer.from(JSON.stringify({jobId:123,source:'gupy_portal'})).toString('base64');expect(applicationIdentity('https://empresa.gupy.io/jobs/123?jobBoardSource=public')).toBe(applicationIdentity('https://empresa.gupy.io/job/'+encodeURIComponent(encoded)));});
 it('entrada inválida não cria tentativas e não habilita modo real',()=>withStore(s=>{expect(()=>simulateBatch(s,profile,answers,[{id:'x',label:'?',required:true},{id:'x',label:'?',required:true}])).toThrow();expect(s.db.prepare('SELECT count(*) n FROM application_simulations').get()).toEqual({n:0});expect(()=>simulate(s.list()[0],profile,{...answers,realSubmissionEnabled:true} as unknown as Answers,form)).toThrow();expect(submitReal).toThrow('Envio real indisponível');}));
});

describe('falhas e interface HTTP',()=>{
 it('falha de persistência aparece como falha local, nunca envio confirmado',()=>withStore(s=>{const spy=vi.spyOn(s,'saveSimulation').mockImplementation(()=>{throw new Error('SQLite indisponível');});try{const r=simulateBatch(s,profile,answers,form);expect(r.counts.failed).toBe(1);expect(r.counts.confirmed).toBe(0);expect(r.emailPreview.body).toContain('SQLite indisponível');}finally{spy.mockRestore();}}));
 it('expõe somente simulação protegida e rejeita modo real',async()=>{
  const {createSearchServer}=await import('../src/discovery/server');const s=new Store(':memory:');s.import([job],profile);const server=createSearchServer(s,profile,()=>profile,()=>answers);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+(server.address() as any).port;
  try{
   const html=await(await fetch(base)).text();const token=/const token='([a-f0-9]+)'/.exec(html)![1];
   const post=(data:unknown,validToken=true)=>fetch(base+'/api/simulate',{method:'POST',headers:validToken?{'X-Review-Token':token,'Content-Type':'application/json'}:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   expect((await post({mode:'simulation'},false)).status).toBe(403);
   expect((await post({mode:'real'})).status).toBe(400);
   expect((await fetch(base+'/api/apply',{method:'POST',headers:{'X-Review-Token':token},body:'{}'})).status).toBe(404);
   const response=await post({mode:'simulation'});expect(response.status).toBe(200);const result=await response.json();expect(result.realSubmission).toBe(false);expect(result.counts.confirmed).toBe(0);expect(result.emailPreview.deliveryEnabled).toBe(false);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
 });
});
