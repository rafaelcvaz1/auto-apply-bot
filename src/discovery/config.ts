import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Profile } from './model.js';
export interface Sources { remotive: boolean; arbeitnow: boolean; gupyBoards: string[]; greenhouseBoards?: string[]; maxJobsPerSource: number; timeoutMs: number; maxDetailsPerSource?: number }
export function loadProfile(file = process.env.SEARCH_PROFILE || 'config/search-profile.local.json'): Profile {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const strings=(v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(x=>typeof x==='string' && x.trim().length>0);
  const month=(v: unknown): v is string => typeof v==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  if (p.schemaVersion !== 1 || !p.education || typeof p.education.course !== 'string' || !p.education.course.trim() || typeof p.education.institution !== 'string' || !p.education.institution.trim() || p.education.status !== 'em_conclusao' || !Number.isInteger(p.education.expectedGraduationYear) || p.education.expectedGraduationYear < 2000 || p.education.expectedGraduationYear > 2100 || !Array.isArray(p.skills) || !p.skills.length || !p.skills.every((s: any) => s && typeof s.name === 'string' && s.name.trim() && (s.level === undefined || ['basico','intermediario','avancado','fluente'].includes(s.level))) || !strings(p.roles) || !Array.isArray(p.experience) || !p.experience.length || !p.experience.every((e: any) => e && typeof e.organization === 'string' && e.organization.trim() && strings(e.activities) && month(e.start) && (e.end === null || (month(e.end) && e.end >= e.start))) || p.english !== 'avancado' || p.preferences?.remoteCountry !== 'BR' || p.preferences?.state !== 'PA' || !strings(p.preferences.onsiteCities) || !strings(p.preferences.seniority) || !p.preferences.seniority.every((s: string)=>['junior','pleno','senior','trainee','estagio'].includes(s))) throw new Error('Perfil inválido: confira config/search-profile.json');
  if(p.education.currentAnswer!==undefined && p.education.currentAnswer!=='Cursando') throw new Error('Situação atual da graduação inválida');
  if(p.education.expectedAcademicCompletionYear!==undefined && (!Number.isInteger(p.education.expectedAcademicCompletionYear)||p.education.expectedAcademicCompletionYear<2000||p.education.expectedAcademicCompletionYear>p.education.expectedGraduationYear)) throw new Error('Previsões acadêmicas inválidas');
  if(p.applicationRules!==undefined) {
    const r=p.applicationRules, number=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
    if(!strings(r.acceptedContracts)||!r.acceptedContracts.every((c:string)=>['CLT','PJ','trainee','temporario','estagio'].includes(c))||!number(r.minimumCltMonthly)||!number(r.expectedCltMonthly)||(r.expectedPjMonthly!==null&&!number(r.expectedPjMonthly))||typeof r.availability!=='string'||!r.availability.trim()||typeof r.drivingLicense!=='string'||!r.drivingLicense.trim()||!['excludeInternships','brazilianCompaniesOnly','remoteMustBeFull','allowRelocation','travel','ownVehicle','workSundays','weekdayNightShifts','saturdayFlexible'].every(k=>typeof r[k]==='boolean')||typeof r.benefitPreference?.food!=='string'||typeof r.benefitPreference.transportOnsite!=='boolean'||r.benefitPreference.explicitExclusion!=='review') throw new Error('Regras de candidatura inválidas');
  }
  return p;
}
export function profileVersion(p: Profile): string { return createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0,16); }
export function loadSources(file = process.env.SEARCH_SOURCES || 'config/search-sources.json'): Sources {
  const s = JSON.parse(readFileSync(file,'utf8'));
  if (typeof s.remotive !== 'boolean' || typeof s.arbeitnow !== 'boolean' || !Array.isArray(s.gupyBoards) || s.gupyBoards.length > 50 || !s.gupyBoards.every((b: unknown) => typeof b === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(b)) || !Number.isInteger(s.maxJobsPerSource) || s.maxJobsPerSource < 1 || s.maxJobsPerSource > 2000 || !Number.isInteger(s.timeoutMs) || s.timeoutMs < 1000 || s.timeoutMs > 60000) throw new Error('Configuração de fontes inválida');
  if (s.greenhouseBoards !== undefined && (!Array.isArray(s.greenhouseBoards) || s.greenhouseBoards.length > 20 || !s.greenhouseBoards.every((b: unknown)=>typeof b==='string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(b)))) throw new Error('Boards Greenhouse inválidos');
  if (s.maxDetailsPerSource !== undefined && (!Number.isInteger(s.maxDetailsPerSource) || s.maxDetailsPerSource < 0 || s.maxDetailsPerSource > 100)) throw new Error('Limite de detalhes inválido');
  return s;
}
export function dashboardPort(): number {
  const v = process.env.DASHBOARD_PORT ?? '3000';
  if (!/^\d+$/.test(v) || +v < 1 || +v > 65535) throw new Error('DASHBOARD_PORT deve estar entre 1 e 65535'); return +v;
}
