import { normalize, type Job, type Profile, type WorkMode } from './model.js';
import { plain } from './text.js';
export interface Findings { mode: WorkMode; region: Job['remoteEligibility']; gaps: string[]; uncertainties: string[]; evidence: {kind:string;excerpt:string;conclusion:string}[]; degree: boolean; years?: number }
/** Conservative rules: only explicit restrictions create an impediment. Snippets are retained for review. */
export function jobFindings(job: Job,p: Profile): Findings {
  const description=plain(job.description), location=plain(job.location);
  const normalized=normalize(description);
  const f:Findings={mode:job.mode,region:job.remoteEligibility,gaps:[],uncertainties:[],evidence:[],degree:job.requiresCompletedDegree===true,years:job.minimumYears};
  const record=(kind:string,excerpt:string,conclusion:string,gap=false)=>{
    f.evidence.push({kind,excerpt:excerpt.slice(0,500),conclusion});
    if(gap)f.gaps.push(conclusion);
  };
  const snippet=(re:RegExp):string|undefined=>{const m=re.exec(normalized);if(!m)return;return description.slice(Math.max(0,m.index-70),Math.min(description.length,m.index+m[0].length+120));};
  const hybrid=snippet(/\b(hybrid work|hybrid working|hybrid model|modelo hibrido|trabalho hibrido|regime hibrido|home-office:|home office.{0,20}(20|40)%)\b/);
  const onsite=snippet(/\b(office-first commitment|on-site role|onsite role|presencial|presenca obrigatoria|trabalho no escritorio|anwesenheit im office|nur in der deutschschweiz)\b/);
  if(hybrid){f.mode='hibrido';record('modalidade',hybrid,'Descrição indica presença em regime híbrido');}
  if(onsite){if(/gewunscht|desired|preferred|desejavel|opcional|optional/.test(normalize(onsite))){f.uncertainties.push('Presença física desejada na descrição: confirmar se é obrigatória');record('modalidade',onsite,'Presença desejada, obrigatoriedade a confirmar');}else{f.mode=hybrid?'hibrido':'presencial';record('modalidade',onsite,'Descrição exige presença física');}}
  // Explicit remote declaration must describe work, not a company-wide benefit list.
  const remote=snippet(/\b(modelo de (?:trabalho|atuacao):? remoto|modalidade:? remoto|trabalho 100% remoto|100% remote|vaga (?:totalmente )?remota)\b/);
  if(remote && !hybrid && !onsite){f.mode='remoto';record('modalidade',remote,'Descrição informa trabalho remoto');}
  const foreign=/\b(?:us|usa|united states|europe|germany|uk|united kingdom|canada) only\b/.test(normalize(location));
  if(f.mode==='remoto' && foreign && !/\b(brazil|brasil|latam|latin america|worldwide|global)\b/.test(normalize(location))) {f.region='fora_BR';record('geografia',location,'Remoto restrito à região informada fora do Brasil',true);}
  const requiredPlace=snippet(/\b(?:presencial (?:em|na|no)|presenca obrigatoria (?:em|na|no)|office based in) (?:sao paulo|rio de janeiro|curitiba|porto alegre|recife|belo horizonte|brasilia|paris|london|munich|germany|united states)\b/);
  if(requiredPlace)record('geografia',requiredPlace,'Descrição exige presença em local fora dos municípios aceitos no Pará',true);
  const exclusion=snippet(/\b(?:except|excluding|exceto|excluindo|not available in) (?:candidates (?:in|from) )?(?:brazil|brasil)\b/);
  if(exclusion){f.region='fora_BR';record('geografia',exclusion,'Anúncio exclui explicitamente residência no Brasil',true);}
  const countryRestriction=snippet(/\b(?:(?:must|need to) (?:be based|reside|live) in|(?:remote|remoto) (?:only in|only|apenas|somente)|residencia obrigatoria (?:em|no|na)) (?:the )?(?:us|usa|united states|uk|united kingdom|germany|europe|canada|portugal|sao paulo|sp|rio de janeiro|rj|sul|sudeste)\b/);
  if(countryRestriction){f.region='fora_BR';record('geografia',countryRestriction,'Residência exigida fora da área aceita em Belém/PA',true);}
  const brazil=snippet(/\b(?:remoto (?:em todo o brasil|para todo o brasil|brasil)|remote (?:in|from) brazil|(?:residir|residencia) (?:em qualquer (?:local|regiao|lugar|estado) (?:do )?brasil|no brasil)|anywhere in brazil)\b/);
  if(brazil && !countryRestriction && !exclusion){f.region='BR';record('geografia',brazil,'Descrição permite trabalho a partir do Brasil');}
  if(f.mode==='remoto' && (f.region==='BR'||f.region==='global')) record('geografia',brazil??location,'Região remota declarada inclui Brasil; conferir eventuais exceções');
  if(f.mode==='presencial'||f.mode==='hibrido') {
    const local=normalize(location);
    const city=p.preferences.onsiteCities.some(c=>new RegExp('(^|[^a-z])'+normalize(c)+'([^a-z]|$)').test(local));
    const state=/\b(pa|para)\b/.test(local);
    const other=/\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/.test(local);
    if(city&&state&&!other)record('geografia',location,'Município e UF aceitos para presença física');
    else if(city&&!other)f.uncertainties.push('Município compatível; confirmar UF');
    else if(local && local!=='nao informada')record('geografia',location,'Presença física fora dos municípios aceitos no Pará',true);
    else f.uncertainties.push('Presença física exigida, mas local não confirmado');
  }
  const degree=snippet(/\bmaster.s \(or phd\s*\)|\b(?:superior completo(?: obrigatorio)?|graduacao completa(?: obrigatoria)?|diploma obrigatorio|completed degree required|bachelor.s degree required|master.s(?: degree)? (?:or phd|in a quantitative discipline)|abgeschlossenes studium|erfolgreich abgeschlossenes studium)\b/);
  if(degree && !/(?:desejavel|differential|nice to have)[^.;]{0,35}(?:superior|graduacao|degree)|(?:completo|completa) (?:ou|e) (?:cursando|em andamento)/.test(normalize(degree))) {f.degree=true;record('formacao',degree,'Anúncio exige formação concluída',false);}
  const course=snippet(/\b(?:formacao requerida|formacao academica):[^.]{5,120}/);
  if(course&&!/estatistica|statistic/.test(normalize(course))) {record('formacao',course,'Curso solicitado deve ser comparado à graduação declarada');f.uncertainties.push('Confirmar se a empresa aceita Estatística entre os cursos exigidos ou áreas afins');}
  const years=normalized.match(/(?:at least|minimum|minimum of|pelo menos|minimo de)\s+(\d{1,2})\s+(?:years|anos)|\b(\d{1,2})\+\s+years of experience/);
  if(f.years===undefined&&years){f.years=Number(years[1]??years[2]);record('experiencia',snippet(/(?:at least|minimum|minimum of|pelo menos|minimo de)\s+\d{1,2}\s+(?:years|anos)|\d{1,2}\+\s+years of experience/)!,'Mínimo explícito de experiência: '+f.years+' anos');}
  const fluent=snippet(/\b(?:english fluency required|fluent english (?:required|mandatory)|ingles fluente (?:obrigatorio|indispensavel))\b/);
  if(fluent)record('idioma',fluent,'Exige inglês fluente; perfil informa avançado',true);
  for(const [language,re] of [['Alemão',/\b(?:deutsch (?:mindestens )?c1|flie[ßs]end deutsch|german (?:c1|required|mandatory))\b/],['Espanhol',/\b(?:espanhol (?:fluente )?(?:obrigatorio|indispensavel)|spanish (?:required|mandatory))\b/],['Francês',/\b(?:frances (?:fluente )?(?:obrigatorio|indispensavel)|french (?:required|mandatory))\b/]] as const){const found=snippet(re);if(found){record('idioma',found,language+' obrigatório sem evidência no currículo');f.uncertainties.push(language+' obrigatório: a confirmar, ausência no currículo não comprova incompatibilidade');}}
  return f;
}
