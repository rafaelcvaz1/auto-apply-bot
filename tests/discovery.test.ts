import http from 'node:http';
import { describe,it,expect,afterEach } from 'vitest';
import { loadProfile } from '../src/discovery/config';
import { assess,hasTerm } from '../src/discovery/matching';
import { canonicalUrl,validateJob,type Job } from '../src/discovery/model';
import { Store } from '../src/discovery/store';
import { searchLinks } from '../src/discovery/queries';
import { mapRemotive,mapArbeitnow } from '../src/discovery/sources';
import { createSearchServer } from '../src/discovery/server';
import { executarAgente } from '../src/agente';
const p=loadProfile('config/search-profile.example.json');
const now=new Date('2026-11-24T12:00:00Z');
function job(over:Partial<Job>={}):Job{return {title:'Analista de Dados',company:'Empresa de teste',url:'https://example.org/jobs/1',source:'Teste',description:'SQL, Excel, Power BI, R, Python e dashboards',location:'Brasil',mode:'remoto',remoteEligibility:'BR',seniority:'pleno',publishedAt:'2026-11-23',minimumYears:2,requiresCompletedDegree:false,requirements:[{skill:'SQL',required:true}],...over};}
describe('elegibilidade e evidências do perfil',()=>{
 it('mantém fatos fornecidos sem promover graduação nem inventar níveis',()=>{expect(p.education.status).toBe('em_conclusao');expect(p.skills.every(x=>x.level===undefined)).toBe(true);expect(p.experience[0].start).toBe('2023-06');});
 it('aceita remoto Brasil e explica o score',()=>{const a=assess(job(),p,now);expect(a.eligibility).toBe('compativel');expect(a.score).toBeGreaterThan(70);expect(a.reasons.join(' ')).toContain('SQL');});
 it.each(['Belém, PA','Ananindeua, Pará','Marituba, PA','Barcarena, PA'])('aceita município configurado: %s',location=>expect(assess(job({location,mode:'hibrido'}),p,now).eligibility).toBe('compativel'));
 it.each(['São Paulo, SP','Belém, PB','Belém de São Francisco, PE'])('elimina presencial fora da área mesmo com alta afinidade: %s',location=>expect(assess(job({location,mode:'presencial'}),p,now).eligibility).toBe('incompativel'));
 it('UF ausente exige revisão',()=>expect(assess(job({location:'Belém',mode:'presencial'}),p,now).eligibility).toBe('revisar'));
 it('remoto sem região não equivale a remoto Brasil',()=>expect(assess(job({remoteEligibility:'desconhecida'}),p,now).eligibility).toBe('revisar'));
 it('remoto restrito é eliminado',()=>expect(assess(job({remoteEligibility:'fora_BR'}),p,now).eligibility).toBe('incompativel'));
 it('não supõe formatura apenas porque chegou 2026',()=>expect(assess(job({requiresCompletedDegree:true}),p,now).gaps.join(' ')).toContain('graduação concluída'));
 it('rejeita mínimo de experiência não atendido',()=>expect(assess(job({minimumYears:5}),p,now).eligibility).toBe('incompativel'));
 it('rejeita inglês fluente sem promover avançado',()=>expect(assess(job({englishRequired:'fluente'}),p,now).eligibility).toBe('incompativel'));
 it('Power BI avançado obrigatório não é atendido',()=>expect(assess(job({requirements:[{skill:'Power BI',required:true,minLevel:'avancado'}]}),{...p,skills:[{name:'Power BI',level:'intermediario'}]},now).eligibility).toBe('incompativel'));
 it('nível desconhecido exige revisão e Airflow ausente requer confirmação',()=>{expect(assess(job({requirements:[{skill:'Python',required:true,minLevel:'avancado'}]}),p,now).eligibility).toBe('revisar');expect(assess(job({requirements:[{skill:'Airflow',required:true}]}),p,now).eligibility).toBe('revisar');});
 it('dados ausentes e estágio exigem revisão',()=>{expect(assess(job({requirements:undefined,minimumYears:undefined}),p,now).eligibility).toBe('revisar');expect(assess(job({seniority:'estagio'}),p,now).uncertainties.join(' ')).toContain('matrícula');});
 it('não confunde R com qualquer letra no meio de uma palavra',()=>{expect(hasTerm('relatórios','R')).toBe(false);expect(hasTerm('R, Python','R')).toBe(true);});
 it('expiradas são incompatíveis',()=>expect(assess(job({expiresAt:'2026-10-01'}),p,now).eligibility).toBe('incompativel'));
});
describe('persistência e revisão',()=>{
 it('normaliza URL e atualiza sem perder classificação e notas',()=>{const s=new Store(':memory:');try{s.import([job()],p);s.review(1,'favorita','Conferir jornada');s.import([job({url:'https://example.org/jobs/1/?utm_source=x#top',description:'SQL atualizado'})],p);expect(s.list()).toHaveLength(1);expect(s.list()[0]).toMatchObject({reviewState:'favorita',notes:'Conferir jornada',description:'SQL atualizado'});}finally{s.close();}});
 it('reavalia após mudança de perfil sem perder revisão',()=>{const s=new Store(':memory:');try{s.import([job()],p);s.review(1,'revisar','nota');const next=structuredClone(p);next.preferences.onsiteCities=['Outro'];next.skills=[];s.reassess(next);expect(s.list()[0].assessment.profileVersion).not.toBe(assess(job(),p).profileVersion);expect(s.list()[0].reviewState).toBe('revisar');}finally{s.close();}});
 it('importação inválida é atômica e bloqueia URLs executáveis',()=>{const s=new Store(':memory:');try{expect(()=>s.import([job(),job({url:'javascript:alert(1)'})],p)).toThrow();expect(s.list()).toHaveLength(0);expect(()=>canonicalUrl('https://user:pass@example.org')).toThrow();expect(()=>validateJob({...job(),minimumYears:'5'})).toThrow();}finally{s.close();}});
 it('links de todos os cargos vêm do perfil',()=>{const links=searchLinks(p);expect(new Set(links.map(x=>x.title)).size).toBe(p.roles.length);expect(links.some(l=>l.url.includes('desenvolvedor'))).toBe(false);});
});
describe('adaptadores públicos',()=>{
 it('não interpreta remoto europeu como Brasil',()=>expect(mapArbeitnow({title:'Data Analyst',company_name:'X',url:'https://example.org',remote:true,location:'Germany',description:'SQL'}).remoteEligibility).toBe('desconhecida'));
 it('mapeia remoto mundial e remove HTML de descrição',()=>{const j=mapRemotive({title:'Data Analyst',company_name:'X',url:'https://example.org',candidate_required_location:'Worldwide',description:'<p>SQL</p><script>evil()</script>'});expect(j.remoteEligibility).toBe('global');expect(j.description).toBe('SQL.');});
 it('entrypoint legado não chama navegador nem modelo',async()=>{await expect(executarAgente(null as any,null as any,null as any,null as any)).rejects.toThrow('desativada');});
});
describe('painel HTTP real',()=>{
 it('importa, filtra dados disponíveis, classifica, exporta e protege mutações',async()=>{
  const s=new Store(':memory:');const server=createSearchServer(s,p,()=>p);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as any).port;const base=`http://127.0.0.1:${port}`;
  try {
    const page=await fetch(base);const html=await page.text();expect(html).toContain('Oportunidades em Dados');const token=/const token='([a-f0-9]+)'/.exec(html)![1];
    expect((await fetch(base+'/api/import',{method:'POST',body:'[]'})).status).toBe(403);
    expect((await fetch(base+'/api/import',{method:'POST',headers:{'X-Review-Token':token,Origin:'https://evil.example'},body:'[]'})).status).toBe(403);
    const post=(route:string,data:any)=>fetch(base+'/api/'+route,{method:'POST',headers:{'X-Review-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});
    expect((await post('import',[job({company:'<script>alert(1)</script>'})])).status).toBe(200);
    expect((await post('review',{id:1,state:'favorita',notes:'=HYPERLINK("bad")'})).status).toBe(200);
    const jobs=await (await fetch(base+'/api/opportunities')).json();expect(jobs[0].reviewState).toBe('favorita');
    const csv=await (await fetch(base+'/api/export?format=csv')).text();expect(csv).toContain("'=HYPERLINK");
    expect((await post('reassess',{})).status).toBe(200);
    expect((await post('apply',{})).status).toBe(404);
    const badHost=await new Promise<number|undefined>(resolve=>{http.get(base,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});});expect(badHost).toBe(403);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
 });
});
