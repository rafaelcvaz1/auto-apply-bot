import { describe,it,expect } from 'vitest';
import { loadProfile } from '../src/discovery/config';
import { assess,relevantRole } from '../src/discovery/matching';
import { jobFindings } from '../src/discovery/evidence';
import { parseGupyListing,parseGupyJob } from '../src/discovery/sources';
import { plain } from '../src/discovery/text';
import type { Job } from '../src/discovery/model';
const p=loadProfile('config/search-profile.example.json');
const base:Job={title:'Analista de Dados Pleno',company:'Fixture isolada',url:'https://example.org/job/1',source:'Teste',description:'SQL e dashboards',location:'Brasil',mode:'remoto',remoteEligibility:'BR',seniority:'pleno'};
describe('evidência além do feed',()=>{
 it('presença obrigatória fora do Pará prevalece sobre remoto no feed e alto score',()=>{
  const a=assess({...base,location:'Paris',description:'SQL Python Power BI Excel dashboards. Hybrid work environment, with 2 remote days a week.'},p);
  expect(a.eligibility).toBe('incompativel');expect(a.evidence?.some(e=>e.kind==='modalidade'&&e.excerpt.includes('Hybrid'))).toBe(true);
 });
 it.each(['Our office is in Munich; we ask for an office-first commitment.'])('lê compromisso presencial explícito: %s',description=>{
  expect(assess({...base,location:'Munich',description},p).eligibility).toBe('incompativel');
 });
 it('presença desejada não é impedimento automático',()=>expect(assess({...base,mode:'desconhecido',location:'Cologne',description:'Anwesenheit im Office an einem Tag pro Woche gewünscht.'},p).gaps).toHaveLength(0));
 it('exclusão do Brasil supera campo Worldwide',()=>expect(assess({...base,remoteEligibility:'global',description:'Worldwide except Brazil.'},p).eligibility).toBe('incompativel'));
 it('restrição estadual remota impede trabalhar de Belém',()=>expect(assess({...base,description:'Residência obrigatória em São Paulo.'},p).eligibility).toBe('incompativel'));
 it('ausência de confirmação de país permanece revisão',()=>expect(assess({...base,remoteEligibility:'desconhecida',description:'Flexible working arrangements (remote or hybrid, depending on role and location).'},p).eligibility).toBe('revisar'));
 it('salva trecho de elegibilidade brasileira',()=>expect(jobFindings({...base,description:'Trabalho 100% remoto para todo o Brasil.'},p).evidence.some(e=>e.kind==='geografia')).toBe(true));
 it('aceita Belém PA e rejeita homônimo fora do estado',()=>{
  expect(jobFindings({...base,mode:'presencial',location:'Belém, PA'},p).gaps).toHaveLength(0);
  expect(jobFindings({...base,mode:'presencial',location:'Belém, PB'},p).gaps.length).toBeGreaterThan(0);
 });
 it('formação obrigatória explicitada na descrição impede; cursando ou desejável não',()=>{
  expect(assess({...base,description:'Requisitos: superior completo em Estatística.'},p).eligibility).toBe('incompativel');
  expect(jobFindings({...base,description:'Superior completo ou cursando Estatística.'},p).degree).toBe(false);
  expect(jobFindings({...base,description:'Desejável superior completo.'},p).degree).toBe(false);
 });
 it('idioma ausente é a confirmar; fluência inglesa obrigatória conflita com avançado',()=>{
  const a=assess({...base,description:'Deutsch mindestens C1 und Englisch mindestens B2.'},p);
  expect(a.gaps).toHaveLength(0);expect(a.uncertainties.join(' ')).toContain('Alemão obrigatório');
  expect(assess({...base,description:'Inglês fluente obrigatório.'},p).eligibility).toBe('incompativel');
 });
 it('não inventa domínio de DAX e não transforma ausência em impedimento',()=>{
  const a=assess({...base,requirements:[{skill:'DAX',required:true}]},p);
  expect(a.eligibility).toBe('revisar');expect(a.uncertainties.join(' ')).toContain('DAX a confirmar');
 });
 it('detecta mínimo explícito de experiência',()=>expect(assess({...base,description:'At least 8 years of experience as a data analyst.'},p).gaps.join(' ')).toContain('8 anos'));
});
describe('amplitude com precisão',()=>{
 it('aceita título genérico pelas atividades analíticas principais',()=>expect(relevantRole('Analista Operacional',p,'Análise de bases; desenvolver dashboards e indicadores usando SQL.')).toBe(true));
 it('não aceita simples menção a ferramenta em atividade não analítica',()=>expect(relevantRole('Assistente Comercial',p,'Atender clientes e cadastrar pedidos; Excel desejável.')).toBe(false));
 it('decodifica HTML escapado antes de avaliar requisitos',()=>expect(plain('&lt;p&gt;Superior completo&lt;/p&gt;')).toBe('Superior completo.'));
});
describe('páginas públicas Gupy sem execução de scripts',()=>{
 it('extrai somente links de vagas da mesma empresa',()=>expect(parseGupyListing('<a href="/jobs/123">Analista de Dados</a><a href="https://evil.example/jobs/4">Não usar</a>','empresa')).toEqual([{id:'123',title:'Analista de Dados'}]));
 it('layout não suportado é falha, não zero vagas',()=>expect(()=>parseGupyListing('<html>Layout mudou</html>','empresa')).toThrow('layout não suportado'));
 it('mapeia JobPosting e não presume Brasil por existir escritório no país',()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:'Analista de Dados',description:'SQL',jobLocationType:'TELECOMMUTE',jobLocation:{address:{addressLocality:'São Paulo',addressRegion:'SP',addressCountry:'BR'}},hiringOrganization:{name:'Empresa'}})+'</script>';
  expect(parseGupyJob(html,'empresa','123')).toMatchObject({mode:'remoto',remoteEligibility:'desconhecida'});
 });
});

describe('formatos e impedimentos observados nas páginas brasileiras',()=>{
 it('lê todos os itens dos dados públicos, além dos links renderizados',()=>{
  const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{jobs:[{id:7,title:'Estagiário de Planejamento',workplace:{address:{city:'Belém',stateShortName:'PA',country:'Brasil'},workplaceType:'on-site'}}]}}})+'</script>';
  expect(parseGupyListing(html,'empresa')).toMatchObject([{id:'7',location:'Belém, PA, Brasil'}]);
 });
 it('usa prazo de inscrição e status do detalhe nativo sem confundir traduções com encerramento',()=>{
  const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{job:{id:7,name:'Analista de Dados',description:'SQL',responsibilities:'Analisar bases',prerequisites:'Superior completo ou em andamento',workplaceType:'remote',addressCountry:'Brasil',status:'published',registerEndDate:'2027-01-20',careerPage:{name:'Empresa'}},translations:{closed:'Inscrições encerradas'}}}})+'</script>';
  const j=parseGupyJob(html,'empresa','7');expect(j.status).toBe('open');expect(j.expiresAt).toBe('2027-01-21T02:59:59.000Z');expect(assess(j,p).gaps).toHaveLength(0);
 });
 it('lê JSON-LD escapado pelo provedor',()=>{
  const data=JSON.stringify({'@type':'JobPosting',title:'Analista de Dados',description:'SQL',jobLocationType:'TELECOMMUTE',applicantLocationRequirements:{name:'Brazil'}}).replaceAll('"','&quot;');
  expect(parseGupyJob('<script type="application/ld+json">'+data+'</script>','empresa','7').remoteEligibility).toBe('BR');
 });
 it('não ignora diploma obrigatório por haver cursos desejáveis mais adiante',()=>{
  expect(assess({...base,description:'Nível de escolaridade: Superior completo. Formação requerida: Computação e áreas afins. Cursos e especializações: Desejável Ciência de Dados.'},p).eligibility).toBe('incompativel');
 });
 it('não usa competências da seção de requisitos como prova de atividade principal genérica',()=>{
  expect(relevantRole('Estagiário TI',p,'Responsabilidades: Suporte técnico e gestão de incidentes. Requisitos: SQL, análise de dados e elaborar dashboards.')).toBe(false);
 });
 it('inscrições encerradas geram impedimento explícito',()=>expect(assess({...base,status:'closed'},p).gaps).toContain('Inscrições encerradas na fonte'));
});

describe('restrições prevalecem sobre metadados conflitantes',()=>{
 it('usa presença fora do Pará explicitada na descrição mesmo com Belém no feed',()=>expect(assess({...base,location:'Belém, PA',description:'Trabalho presencial em São Paulo, três dias por semana.'},p).eligibility).toBe('incompativel'));
});
