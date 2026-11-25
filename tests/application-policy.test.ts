import { describe,it,expect } from 'vitest';
import { assess } from '../src/discovery/matching';
import { inferContract } from '../src/discovery/policy';
import { validateJob } from '../src/discovery/model';
import { profile,job } from './application-fixtures';
describe('regras atuais e histórico',()=>{
 it('aceita contrato conhecido sem salário ou benefícios publicados',()=>expect(assess(job,profile).eligibility).toBe('compativel'));
 it.each(['CLT','PJ','trainee','temporario'] as const)('aceita contrato %s',contract=>expect(assess({...job,contract},profile).eligibility).toBe('compativel'));
 it('exclui estágio do histórico mesmo com geografia e score favoráveis',()=>{const a=assess({...job,title:'Estagiário de Dados',seniority:'estagio'},profile);expect(a.eligibility).toBe('incompativel');expect(a.gaps.join(' ')).toContain('Estágio excluído');});
 it('não confunde estágio no histórico do candidato com contrato da vaga',()=>expect(assess(job,{...profile,experience:[{organization:'Fixture',relationship:'estagio',start:'2023-01',end:null,activities:['Dados']}]}).eligibility).toBe('compativel'));
 it('origem incerta é revisão, empresa estrangeira confirmada é impedimento',()=>{
  expect(assess({...job,companyOrigin:undefined},profile).eligibility).toBe('revisar');
  expect(assess({...job,companyOrigin:{...job.companyOrigin!,country:'DE'}},profile).eligibility).toBe('incompativel');
 });
 it('Gupy ou localização Brasil não comprovam empresa brasileira',()=>expect(assess({...job,source:'Gupy:empresa',companyOrigin:undefined},profile).uncertainties.join(' ')).toContain('Origem brasileira'));
 it('mudança obrigatória prevalece sobre remoto no feed',()=>expect(assess({...job,requiresRelocation:true},profile).eligibility).toBe('incompativel'));
 it('remoto sem confirmação de 100% exige revisão',()=>expect(assess({...job,description:'SQL Python Power BI'},profile).eligibility).toBe('revisar'));
 it('diploma obrigatório é incompatível mesmo com previsão de colação futura',()=>expect(assess({...job,requiresCompletedDegree:true},{...profile,education:{...profile.education,expectedAcademicCompletionYear:2026,expectedGraduationYear:2027}}).eligibility).toBe('incompativel'));
});
describe('salários, benefícios e restrições confirmadas',()=>{
 it('CLT abaixo do piso é impedimento, no piso é aceito',()=>{
  expect(assess({...job,salary:{min:900,max:900,currency:'BRL',period:'month'}},profile).eligibility).toBe('incompativel');
  expect(assess({...job,salary:{min:1000,max:1000,currency:'BRL',period:'month'}},profile).eligibility).toBe('compativel');
 });
 it('faixa que cruza o piso exige revisão, não descarte',()=>expect(assess({...job,salary:{min:900,max:1500,currency:'BRL',period:'month'}},profile).eligibility).toBe('revisar'));
 it('não aplica piso CLT a PJ ou confunde salário anual com mensal',()=>{
  expect(assess({...job,contract:'PJ',salary:{min:900,max:900,currency:'BRL',period:'month'}},profile).eligibility).toBe('compativel');
  expect(assess({...job,salary:{min:900,max:900,currency:'BRL',period:'year'}},profile).eligibility).toBe('revisar');
 });
 it('lê salário mensal explícito sem usar valor de VA como salário',()=>{
  expect(assess({...job,description:job.description+' Salário: R$ 900,00 mensais.'},profile).eligibility).toBe('incompativel');
  expect(assess({...job,description:job.description+' VA: R$ 900,00 mensais.'},profile).eligibility).toBe('compativel');
 });
 it('benefício explicitamente excluído exige revisão; VT não é exigido no remoto',()=>{
  expect(assess({...job,description:job.description+' Sem vale alimentação.'},profile).eligibility).toBe('revisar');
  expect(assess({...job,description:job.description+' Sem vale transporte.'},profile).eligibility).toBe('compativel');
  expect(assess({...job,mode:'presencial',location:'Belém, PA',description:'SQL. Não oferece VT.'},profile).eligibility).toBe('revisar');
 });
 it('VR ou VA são alternativas, não exige os dois benefícios',()=>expect(assess({...job,description:job.description+' Sem VR, mas vale alimentação incluso.'},profile).eligibility).toBe('compativel'));
 it('veículo obrigatório impede; CNH ou veículo desejável não comprovam exigência',()=>{
  expect(assess({...job,description:job.description+' Veículo próprio obrigatório.'},profile).eligibility).toBe('incompativel');
  expect(assess({...job,description:job.description+' CNH B. Veículo próprio desejável.'},profile).eligibility).toBe('compativel');
 });
 it('domingo obrigatório impede, escala ambígua exige revisão, folga domingo não impede',()=>{
  expect(assess({...job,description:job.description+' Disponibilidade para trabalhar aos domingos.'},profile).eligibility).toBe('incompativel');
  expect(assess({...job,description:job.description+' Escala 6x1.'},profile).eligibility).toBe('revisar');
  expect(assess({...job,description:job.description+' Escala 6x1 com folga aos domingos.'},profile).eligibility).toBe('compativel');
 });
 it('aceita noite e sábado sem inventar disponibilidade para domingo',()=>expect(assess({...job,description:job.description+' Turno noturno, segunda a sábado.'},profile).eligibility).toBe('compativel'));
 it('não transforma contrato alternativo CLT/PJ em uma escolha confirmada',()=>expect(inferContract({...job,contract:undefined,description:'Contratação CLT ou PJ.'})).toBe('desconhecido'));
 it('valida campos novos antes de persistir',()=>{expect(()=>validateJob({...job,salary:{min:2,max:1,currency:'BRL',period:'month'}})).toThrow();expect(()=>validateJob({...job,companyOrigin:{country:'BR'}})).toThrow();});
});
