import type { Job, Profile, Assessment } from './model.js';
import { normalize } from './model.js';
import { profileVersion } from './config.js';
import { jobFindings } from './evidence.js';
import { plain } from './text.js';
import { policyFindings } from './policy.js';
const aliases: Record<string,string[]> = {
 'sql':['sql'], 'r':['r','r language','r programming'], 'python':['python'],
 'power bi':['power bi','powerbi'], 'excel':['excel'], 'estatistica descritiva':['estatistica descritiva','descriptive statistics'],
 'estatistica inferencial':['estatistica inferencial','inferential statistics'], 'dashboards':['dashboards','dashboard'],
 'tratamento de dados':['tratamento de dados','data cleaning','limpeza de dados'], 'relatorios':['relatorios','reporting'],
};
export function hasTerm(text: string, term: string): boolean {
  const t = normalize(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(normalize(text));
}
export function relevantRole(title: string, p: Profile, description = ''): boolean {
  if (p.roles.filter(r=>!/planejamento|operacoes|operations|pesquisa|research|monitoramento|monitoring/i.test(r)).some(r => hasTerm(title, r.replace(/ j[uú]nior/i,''))) || /\b(data analyst|bi analyst|data scientist|statistician|research analyst|market intelligence|business intelligence|reporting analyst|data quality|analista de dados|analista de bi|analista de indicadores|informacoes gerenciais)\b/.test(normalize(title))) return true;
  // Generic titles need at least two concrete analytical activities, rather than a passing tool mention.
  let text=normalize(plain(description));
  if(text.includes('responsabilidades:'))text=text.split('responsabilidades:')[1].split('requisitos:')[0];
  const activities=[/\b(?:analise|analisar|analy[sz]e|analysis|tratamento|validacao|consolidacao) (?:de |das |of )?(?:bases|dados|data)/,/\b(?:constru|desenvolv|automat|elabor|monitor|acompanh|build|develop|automat|monitor)[a-z]*[^.]{0,65}\b(?:dashboard|dashboards|indicadores|relatorios|reporting|reports|metrics|kpis)\b/,/\b(?:sql|metodos quantitativos|quantitative methods|modelagem estatistica|statistical modeling)\b/,/\b(?:consolidacao de informacoes|bases de dados gerenciais|conferencia de informacoes|analise de resultados|analisar dados)\b/,/\b(?:preparacao|qualidade|saneamento|integracao|extracao|limpeza|quality|cleaning|integration) (?:de |dos |of )?(?:dados|bases|data)/];
  return activities.filter(re=>re.test(text)).length>=2 && /\b(analista|assistente|auxiliar|analyst|assistant|trainee|estagio|estagiario|intern|planejamento|operacoes|pesquisa|monitoramento|estatistic|reporting)\b/.test(normalize(title));
}
export function inferSeniority(text: string): Job['seniority'] {
  const t=normalize(text);
  if (/\b(senior|sr|lead|principal|especialista|coordenador|gerente)\b/.test(t)) return 'senior';
  if (/\b(estagio|estagiario|intern|internship)\b/.test(t)) return 'estagio';
  if (/\btrainee\b/.test(t)) return 'trainee';
  if (/\b(junior|jr|entry level)\b/.test(t)) return 'junior';
  if (/\b(pleno|pl|mid level|mid-level)\b/.test(t)) return 'pleno'; return 'desconhecida';
}
export function assess(job: Job, p: Profile, now = new Date()): Assessment {
  const reasons: string[]=[], gaps: string[]=[], uncertainties: string[]=[]; let score=0;
  const text = normalize(job.title+' '+plain(job.description));
  const findings=jobFindings(job,p);
  const mode=findings.mode, region=findings.region;
  const policy=policyFindings(job,p,mode);
  gaps.push(...findings.gaps,...policy.gaps);uncertainties.push(...findings.uncertainties,...policy.uncertainties);
  if (relevantRole(job.title,p,job.description)) {score+=35; reasons.push('Cargo alinhado aos interesses declarados');} else gaps.push('Cargo fora dos interesses declarados');
  if(mode==='remoto') {
    if((region==='BR'||region==='global') && !findings.gaps.length){score+=15;reasons.push('Remoto com evidência de elegibilidade para Brasil');}
    else if(region==='fora_BR')gaps.push('Remoto explicitamente restrito fora da localização aceita');
    else uncertainties.push('Confirmar se o trabalho remoto permite residência em Belém/PA, Brasil');
  } else if(mode==='presencial'||mode==='hibrido') {
    if(findings.evidence.some(e=>e.conclusion==='Município e UF aceitos para presença física')){score+=15;reasons.push('Presença física em município configurado no Pará');}
  } else uncertainties.push('Modalidade e elegibilidade geográfica não confirmadas');
  const matches=p.skills.filter(s=>(aliases[normalize(s.name)] ?? [normalize(s.name)]).some(a=>hasTerm(text,a))).map(s=>s.name);
  score+=Math.min(25,matches.length*5); if(matches.length) reasons.push('Competências citadas: '+matches.join(', '));
  else uncertainties.push('Nenhuma competência declarada identificada no anúncio');
  if(p.preferences.seniority.includes(job.seniority)) {score+=10;reasons.push('Senioridade priorizada: '+job.seniority);} else if(job.seniority==='senior') uncertainties.push('Senioridade acima da prioridade júnior/pleno'); else if(job.seniority==='desconhecida') uncertainties.push('Senioridade não informada'); else if(!(job.seniority==='estagio'&&p.applicationRules?.excludeInternships)) uncertainties.push('Senioridade fora das prioridades atuais: '+job.seniority);
  const degree=findings.degree;
  if(job.requiresCompletedDegree === undefined && !degree) uncertainties.push('Exigência de graduação concluída não confirmada');
  if(degree) gaps.push('Exige graduação concluída; perfil informa curso em conclusão'); else reasons.push(`Formação declarada: ${p.education.course}/${p.education.institution}: Cursando; atividades acadêmicas ${p.education.expectedAcademicCompletionYear??'a confirmar'}, colação prevista ${p.education.expectedGraduationYear}`);
  if(job.seniority==='estagio'&&!p.applicationRules?.excludeInternships) uncertainties.push('Confirmar matrícula ativa, semestre, jornada e prazo até formatura');
  if(job.seniority==='trainee') uncertainties.push('Confirmar janela de conclusão exigida pelo programa');
  // Merge overlapping experience intervals; academic work is never added as employment.
  const intervals=p.experience.map(e=>[Date.parse(e.start+'-01'), Math.min(now.getTime(),e.end?Date.parse(e.end+'-01'):now.getTime())]).filter(([a,b])=>a<=b).sort((a,b)=>a[0]-b[0]);
  let duration=0, end=0; for(const [a,b] of intervals){duration+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
  const years=duration/(365.25*86400000);
  if(findings.years!==undefined) {if(findings.years>years) gaps.push(`Experiência mínima de ${findings.years} anos superior ao período profissional declarado`); else {score+=5; reasons.push('Tempo mínimo de experiência atendido pelo período declarado (escopo deve ser conferido)');}}
  else uncertainties.push('Experiência mínima não estruturada; conferir descrição');
  const levels=['basico','intermediario','avancado','fluente'];
  if(job.englishRequired==='fluente') gaps.push('Exige inglês fluente; perfil declara avançado');
  else if(job.englishRequired) {score+=5; reasons.push('Nível de inglês declarado atende ao requisito informado');}
  for(const req of job.requirements ?? []) {
    const s=p.skills.find(s=>normalize(s.name)===normalize(req.skill) || (aliases[normalize(s.name)]??[]).includes(normalize(req.skill)));
    if(!s) uncertainties.push(`${req.required?'Obrigatório':'Desejável'}: ${req.skill} a confirmar; não consta no currículo`);
    else if(req.minLevel && (!s.level || levels.indexOf(s.level)<levels.indexOf(req.minLevel))) (s.level && req.required?gaps:uncertainties).push(`Nível ${req.minLevel} em ${req.skill} não comprovado (perfil: ${s.level??'não especificado'})`);
  }
  if(job.requirements === undefined) {
    uncertainties.push('Requisitos obrigatórios e desejáveis precisam de revisão da descrição');
    for(const skill of ['DAX','Power Query','Git','dbt','Databricks','Airflow','SAP','HubSpot','BigQuery','Machine Learning','FinOps'])
      if(hasTerm(text,skill)&&!p.skills.some(s=>normalize(s.name)===normalize(skill))) uncertainties.push(`Anúncio cita ${skill}: a confirmar no perfil e verificar obrigatoriedade`);
  }
  if(job.status==='closed') gaps.push('Inscrições encerradas na fonte');
  if(job.expiresAt && Date.parse(job.expiresAt)<now.getTime()) gaps.push('Prazo da vaga expirado');
  if(!job.publishedAt) uncertainties.push('Data de publicação desconhecida');
  // Missing extraction never silently becomes an eligibility confirmation.
  const needsReview=uncertainties.some(s=>!/Data de publicacao|Data de publicação/.test(s));
  return {evidence:[...findings.evidence,...policy.evidence??[]],score:Math.max(0,Math.min(100,score)),eligibility:gaps.length?'incompativel':needsReview?'revisar':'compativel', reasons,gaps,uncertainties,profileVersion:profileVersion(p),evaluatedAt:now.toISOString()};
}
