export interface Profile {
  schemaVersion: 1;
  education: { course: string; institution: string; status: 'em_conclusao'; currentAnswer?: 'Cursando'; expectedAcademicCompletionYear?: number; expectedGraduationYear: number };
  experience: { organization: string; role?: string; relationship?: string; start: string; end: string | null; activities: string[] }[];
  professionalEvidence?: string[];
  toConfirm?: string[];
  developmentInterests?: string[];
  applicationRules?: ApplicationRules;
  skills: { name: string; level?: string; evidence?: string }[];
  english: 'avancado';
  roles: string[];
  preferences: { remoteCountry: 'BR'; onsiteCities: string[]; state: 'PA'; seniority: string[] };
}
export type Contract = 'CLT' | 'PJ' | 'trainee' | 'temporario' | 'estagio' | 'desconhecido';
export interface ApplicationRules {
  acceptedContracts: Contract[]; excludeInternships: boolean; brazilianCompaniesOnly: boolean;
  remoteMustBeFull: boolean; allowRelocation: boolean; minimumCltMonthly: number; expectedCltMonthly: number;
  expectedPjMonthly: number | null; availability: string; travel: boolean; drivingLicense: string;
  ownVehicle: boolean; workSundays: boolean; weekdayNightShifts: boolean; saturdayFlexible: boolean;
  benefitPreference: { food: string; transportOnsite: boolean; explicitExclusion: 'review' };
}
export type WorkMode = 'remoto' | 'presencial' | 'hibrido' | 'desconhecido';
export interface Job {
  title: string; company: string; url: string; source: string; description: string;
  location: string; mode: WorkMode; remoteEligibility: 'BR' | 'global' | 'fora_BR' | 'desconhecida';
  seniority: 'junior' | 'pleno' | 'senior' | 'trainee' | 'estagio' | 'desconhecida';
  publishedAt?: string;
  requirements?: { skill: string; required: boolean; minLevel?: string }[];
  requiresCompletedDegree?: boolean; minimumYears?: number; englishRequired?: 'basico' | 'intermediario' | 'avancado' | 'fluente';
  expiresAt?: string;
  status?: 'open' | 'closed' | 'unknown';
  contract?: Contract;
  companyOrigin?: { country: string; sourceUrl: string; excerpt: string };
  salary?: { min?: number; max?: number; currency: string; period: 'month' | 'year' | 'hour' };
  requiresOwnVehicle?: boolean;
  requiresSundayWork?: boolean;
  requiresRelocation?: boolean;
}
export interface Assessment {
  score: number; eligibility: 'compativel' | 'revisar' | 'incompativel';
  reasons: string[]; gaps: string[]; uncertainties: string[]; profileVersion: string; evaluatedAt: string;
  evidence?: { kind: string; excerpt: string; conclusion: string }[];
}
export const REVIEW_STATES = ['nova', 'favorita', 'revisar', 'descartada'] as const;
export type ReviewState = typeof REVIEW_STATES[number];
export interface Opportunity extends Job { id: number; canonicalUrl: string; firstSeenAt: string; lastSeenAt: string; reviewState: ReviewState; notes: string; assessment: Assessment }
export function normalize(s: string): string { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function canonicalUrl(value: string): string {
  const u = new URL(value);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('URL deve ser HTTP(S), sem credenciais');
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|trk$|trackingId$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort(); u.hostname = u.hostname.toLowerCase();
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}
export function validateJob(value: unknown): Job {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Vaga inválida');
  const v = value as Record<string, unknown>;
  for (const field of ['title', 'company', 'url', 'source', 'description', 'location']) {
    if (typeof v[field] !== 'string' || (v[field] as string).length > (field === 'description' ? 100000 : 2000)) throw new Error(`Campo inválido: ${field}`);
  }
  for (const field of ['title', 'company', 'source']) if (!(v[field] as string).trim()) throw new Error(`Campo vazio: ${field}`);
  canonicalUrl(v.url as string);
  if (!['remoto','presencial','hibrido','desconhecido'].includes(String(v.mode))) throw new Error('Modalidade inválida');
  if (!['BR','global','fora_BR','desconhecida'].includes(String(v.remoteEligibility))) throw new Error('Elegibilidade remota inválida');
  if (!['junior','pleno','senior','trainee','estagio','desconhecida'].includes(String(v.seniority))) throw new Error('Senioridade inválida');
  if(v.status !== undefined && !['open','closed','unknown'].includes(String(v.status))) throw new Error('Status inválido');
  if(v.contract !== undefined && !['CLT','PJ','trainee','temporario','estagio','desconhecido'].includes(String(v.contract))) throw new Error('Contrato inválido');
  if(v.companyOrigin !== undefined) {
    const c=v.companyOrigin as any;
    if(!c || typeof c.country!=='string' || !/^[A-Z]{2}$/.test(c.country) || typeof c.sourceUrl!=='string' || typeof c.excerpt!=='string' || !c.excerpt.trim() || c.excerpt.length>1000) throw new Error('Evidência da origem da empresa inválida');
    canonicalUrl(c.sourceUrl);
  }
  if(v.salary !== undefined) {
    const s=v.salary as any;
    if(!s || typeof s.currency!=='string' || !/^[A-Z]{3}$/.test(s.currency) || !['month','year','hour'].includes(s.period) || (s.min===undefined&&s.max===undefined) || [s.min,s.max].some(n=>n!==undefined&&(typeof n!=='number'||!Number.isFinite(n)||n<0)) || (s.min!==undefined&&s.max!==undefined&&s.min>s.max)) throw new Error('Salário inválido');
  }
  for(const field of ['requiresOwnVehicle','requiresSundayWork','requiresRelocation']) if(v[field]!==undefined&&typeof v[field]!=='boolean') throw new Error('Restrição inválida');
  for (const f of ['requiresCompletedDegree']) if (v[f] !== undefined && typeof v[f] !== 'boolean') throw new Error(`Campo inválido: ${f}`);
  if (v.minimumYears !== undefined && (typeof v.minimumYears !== 'number' || !Number.isFinite(v.minimumYears) || v.minimumYears < 0 || v.minimumYears > 60)) throw new Error('Experiência mínima inválida');
  if (v.englishRequired !== undefined && !['basico','intermediario','avancado','fluente'].includes(String(v.englishRequired))) throw new Error('Inglês inválido');
  for (const f of ['publishedAt','expiresAt']) if (v[f] !== undefined && (typeof v[f] !== 'string' || !Number.isFinite(Date.parse(v[f] as string)))) throw new Error(`Data inválida: ${f}`);
  if (v.requirements !== undefined && (!Array.isArray(v.requirements) || v.requirements.length > 100 || v.requirements.some((x: any) => !x || typeof x.skill !== 'string' || x.skill.length > 200 || typeof x.required !== 'boolean' || (x.minLevel !== undefined && !['basico','intermediario','avancado','fluente'].includes(x.minLevel))))) throw new Error('Requisitos inválidos');
  // Whitelist fields: never persist arbitrary executable or application metadata.
  const fields = ['title','company','url','source','description','location','mode','remoteEligibility','seniority','publishedAt','requirements','requiresCompletedDegree','minimumYears','englishRequired','expiresAt','status','contract','companyOrigin','salary','requiresOwnVehicle','requiresSundayWork','requiresRelocation'];
  return Object.fromEntries(fields.filter(k => v[k] !== undefined).map(k => [k,v[k]])) as unknown as Job;
}
