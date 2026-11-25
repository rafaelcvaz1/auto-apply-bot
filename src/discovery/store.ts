import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalUrl, validateJob, REVIEW_STATES, type Opportunity, type Profile, type ReviewState } from './model.js';
import { assess } from './matching.js';
import type { Simulation } from '../applications/simulation.js';
export class Store {
  readonly db: Database.Database;
  constructor(file = process.env.SEARCH_DB || 'data/oportunidades.db') {
    if(file!==':memory:') mkdirSync(dirname(file),{recursive:true});
    this.db=new Database(file);
    if ((this.db.pragma('user_version', { simple: true }) as number) > 1) { this.db.close(); throw new Error('Banco criado por versão mais recente; atualize o aplicativo'); }
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS opportunities(id INTEGER PRIMARY KEY, canonical_url TEXT UNIQUE NOT NULL, job TEXT NOT NULL, assessment TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, review_state TEXT NOT NULL DEFAULT 'nova', notes TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS collection_runs(id INTEGER PRIMARY KEY, at TEXT NOT NULL, report TEXT NOT NULL); PRAGMA user_version = 1;
    CREATE TABLE IF NOT EXISTS application_simulations(id INTEGER PRIMARY KEY, candidate_key TEXT NOT NULL, identity TEXT NOT NULL, input_hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(candidate_key,identity,input_hash));`);
  }
  import(values: unknown[], profile: Profile): number {
    if(!Array.isArray(values)||values.length>2000) throw new Error('Importe no máximo 2000 vagas por lote');
    const jobs=values.map(validateJob); // validate entire batch before writing
    return this.db.transaction(()=>{
      for(const j of jobs) {const at=new Date().toISOString(); this.db.prepare(`INSERT INTO opportunities(canonical_url,job,assessment,first_seen,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(canonical_url) DO UPDATE SET job=excluded.job,assessment=excluded.assessment,last_seen=excluded.last_seen`).run(canonicalUrl(j.url),JSON.stringify(j),JSON.stringify(assess(j,profile)),at,at);}
      return jobs.length;
    })();
  }
  list(): Opportunity[] {
    return (this.db.prepare('SELECT * FROM opportunities ORDER BY id DESC').all() as any[]).map(r=>({...JSON.parse(r.job),id:r.id,canonicalUrl:r.canonical_url,assessment:JSON.parse(r.assessment),firstSeenAt:r.first_seen,lastSeenAt:r.last_seen,reviewState:r.review_state,notes:r.notes}));
  }
  review(id: number, state: ReviewState, notes: string): boolean {
    if(!REVIEW_STATES.includes(state)||typeof notes!=='string'||notes.length>5000) throw new Error('Classificação ou nota inválida');
    return this.db.prepare('UPDATE opportunities SET review_state=?,notes=? WHERE id=?').run(state,notes,id).changes>0;
  }
  reassess(p: Profile): number {return this.db.transaction(()=>{const jobs=this.list();for(const j of jobs)this.db.prepare('UPDATE opportunities SET assessment=? WHERE id=?').run(JSON.stringify(assess(j,p)),j.id);return jobs.length;})();}
  logRun(report: unknown): void {this.db.prepare('INSERT INTO collection_runs(at,report) VALUES(?,?)').run(new Date().toISOString(),JSON.stringify(report));}
  runs(): unknown[] {return (this.db.prepare('SELECT at,report FROM collection_runs ORDER BY id DESC LIMIT 10').all() as any[]).map(x=>({at:x.at,...JSON.parse(x.report)}));}
  saveSimulation(candidateKey:string,identity:string,inputHash:string,result:Simulation):Simulation {
    return this.db.transaction(()=>{
      const insert=this.db.prepare('INSERT OR IGNORE INTO application_simulations(candidate_key,identity,input_hash,result,created_at) VALUES(?,?,?,?,?)').run(candidateKey,identity,inputHash,JSON.stringify(result),new Date().toISOString());
      const row=this.db.prepare('SELECT id,result FROM application_simulations WHERE candidate_key=? AND identity=? AND input_hash=?').get(candidateKey,identity,inputHash) as {id:number;result:string};
      return {...JSON.parse(row.result),id:row.id,duplicate:insert.changes===0};
    })();
  }
  close(): void {this.db.close();}
}
