import { normalize, type Job, type Profile, type Assessment, type Contract, type WorkMode } from './model.js';
import { plain } from './text.js';
export function inferContract(job: Job): Contract {
  if(job.seniority==='estagio'||/\b(estagio|estagiari[oa]|internship|intern)\b/.test(normalize(job.title))) return 'estagio';
  if(job.contract && job.contract!=='desconhecido')return job.contract;
  const t=normalize(job.title+' '+plain(job.description));
  if(/\bclt\b/.test(t)&&/\bpj\b/.test(t))return 'desconhecido';
  if(/\bclt\b/.test(t))return 'CLT';
  if(/\b(?:pj|pessoa juridica)\b/.test(t))return 'PJ';
  if(/\btrainee\b/.test(normalize(job.title)))return 'trainee';
  if(/\b(temporario|temporaria|temporary)\b/.test(normalize(job.title)))return 'temporario';
  return 'desconhecido';
}
export function policyFindings(job:Job,p:Profile,mode:WorkMode):Pick<Assessment,'gaps'|'uncertainties'|'evidence'> {
  const result:Pick<Assessment,'gaps'|'uncertainties'|'evidence'>={gaps:[],uncertainties:[],evidence:[]};
  const r=p.applicationRules;if(!r)return result;
  const description=plain(job.description), t=normalize(description);
  const add=(kind:string,excerpt:string,conclusion:string,blocking=false)=>{
    result.evidence!.push({kind,excerpt:excerpt.slice(0,500),conclusion});
    (blocking?result.gaps:result.uncertainties).push(conclusion);
  };
  const excerpt=(re:RegExp)=>{const m=re.exec(t);return m?description.slice(Math.max(0,m.index-35),m.index+m[0].length+65):undefined;};
  const contract=inferContract(job);
  if(contract==='estagio'&&r.excludeInternships)add('contrato',job.title,'Estágio excluído pelas preferências atuais, inclusive no histórico',true);
  else if(contract==='desconhecido')result.uncertainties.push('Confirmar contrato: CLT, PJ, trainee ou temporário');
  else if(!r.acceptedContracts.includes(contract))add('contrato',contract,'Contrato fora dos tipos aceitos',true);
  if(r.brazilianCompaniesOnly) {
    if(job.companyOrigin) {
      const c=job.companyOrigin;
      result.evidence!.push({kind:'origem_empresa',excerpt:c.excerpt+' — '+c.sourceUrl,conclusion:c.country==='BR'?'Origem brasileira documentada':'Origem da empresa fora do Brasil'});
      if(c.country!=='BR')result.gaps.push('Empresa de origem estrangeira; preferência por empresas brasileiras');
    } else {
      const company=normalize(job.company).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const claim=excerpt(new RegExp('\\b(?:somos uma empresa brasileira|'+company+' e uma empresa brasileira)\\b'));
      if(claim)result.evidence!.push({kind:'origem_empresa',excerpt:claim,conclusion:'Descrição da empregadora declara origem brasileira'});
      else result.uncertainties.push('Origem brasileira da empresa a confirmar; plataforma, idioma e localização da vaga não comprovam origem');
    }
  }
  if(mode==='remoto'&&r.remoteMustBeFull && !/\b(?:100% (?:remot[oa]|remote)|totalmente remot[oa]|fully remote|remot[oa] 100%)\b/.test(t)) result.uncertainties.push('Confirmar trabalho 100% remoto a partir de Belém, sem presença obrigatória');
  const relocation=excerpt(/\b(?:mudanca de (?:cidade|domicilio|residencia) (?:obrigatoria|necessaria)|(?:necessario|obrigatorio) (?:mudar|relocar)|disponibilidade para (?:mudanca de cidade|relocacao)|relocation required)\b/);
  if(!r.allowRelocation&&(job.requiresRelocation===true||relocation))add('localizacao',relocation??'requiresRelocation=true','Vaga exige mudança de cidade, não aceita no perfil',true);
  const vehicle=excerpt(/\b(?:(?:veiculo|carro) proprio (?:e )?(?:obrigatorio|necessario|indispensavel)|(?:obrigatorio|necessario|imprescindivel) (?:possuir |ter )?(?:veiculo|carro) proprio|own (?:car|vehicle) required)\b/);
  if(!r.ownVehicle&&(job.requiresOwnVehicle===true||vehicle))add('veiculo',vehicle??'requiresOwnVehicle=true','Veículo próprio obrigatório; perfil informa não possuir',true);
  const sunday=excerpt(/\b(?:trabalh(?:ar|o) (?:aos |nos )?domingos|disponibilidade para (?:trabalhar (?:aos )?)?domingos|(?:segunda|terca|quarta|quinta|sexta|sabado) a domingo|domingos (?:obrigatorios|incluidos)|sunday work required)\b/);
  if(!r.workSundays && (job.requiresSundayWork===true || (sunday&&!/nao (?:exige|ha|e necessario)|domingos (?:opcionais|facultativos)|nao e obrigatorio|nao sao obrigatorios|sem trabalho aos domingos/.test(normalize(sunday)))))add('jornada',sunday??'requiresSundayWork=true','Trabalho aos domingos obrigatório; indisponível no perfil',true);
  else if(!r.workSundays&&/\b(?:6x1|finais de semana|fins de semana|weekends)\b/.test(t)&&!/folga(?:s)? (?:fixa(?:s)? )?aos domingos/.test(t))result.uncertainties.push('Confirmar se a escala inclui domingos obrigatórios');
  let salary=job.salary;
  if(!salary){
    // Only amounts explicitly labelled monthly salary, never benefits or annual totals.
    const m=t.match(/\bsalario(?: mensal)?\s*[:de]*\s*r\$\s*(\d[\d.]*(?:,\d{2})?)(?:\s*(?:a|ate|-)\s*r?\$?\s*(\d[\d.]*(?:,\d{2})?))?\s*(?:mensais|mensal|por mes|\/mes)/);
    if(m){const number=(s:string)=>Number(s.replaceAll('.','').replace(',','.'));const a=number(m[1]);salary={min:a,max:m[2]?number(m[2]):a,currency:'BRL',period:'month'};}
  }
  if(contract==='CLT'&&salary) {
    if(salary.currency==='BRL'&&salary.period==='month') {
      const upper=salary.max;
      if(upper!==undefined && upper<r.minimumCltMonthly)add('salario',JSON.stringify(salary),'Salário CLT mensal abaixo do piso configurado',true);
      else if(salary.min!==undefined&&salary.min<r.minimumCltMonthly)result.uncertainties.push('Faixa salarial CLT pode ficar abaixo do piso; confirmar proposta');
    }else result.uncertainties.push('Salário informado em outra moeda ou periodicidade; confirmar valor CLT mensal');
  }
  const food=excerpt(/\b(?:sem (?:vale[- ]?(?:refeicao|alimentacao)|vr|va)|nao (?:oferece|oferecemos|ha|possui) (?:vale[- ]?(?:refeicao|alimentacao)|vr|va))\b/);
  const foodAlternative=t.split(/[.;,]|\bmas\b|\bporem\b/).some(part=>!/\b(?:sem|nao)\b/.test(part)&&/\b(?:vale[- ]?(?:refeicao|alimentacao)|vr|va)\b/.test(part));
  if(food&&!foodAlternative)add('beneficios',food,'Benefício de alimentação explicitamente excluído; confirmar regra antes de prosseguir');
  if((mode==='presencial'||mode==='hibrido')&&r.benefitPreference.transportOnsite){
    const transport=excerpt(/\b(?:sem (?:vale[- ]?transporte|vt)|nao (?:oferece|oferecemos|ha|possui) (?:vale[- ]?transporte|vt))\b/);
    if(transport)add('beneficios',transport,'VT explicitamente excluído para presença física; confirmar regra antes de prosseguir');
  }
  return result;
}
