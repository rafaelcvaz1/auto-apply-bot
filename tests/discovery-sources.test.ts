import { describe,it,expect,vi } from 'vitest';
import { collect,mapRemotive } from '../src/discovery/sources';
import { loadProfile,loadSources } from '../src/discovery/config';
import { Store } from '../src/discovery/store';
const raw={title:'Data Analyst',company_name:'Empresa fixture',url:'https://example.org/source-fixture',candidate_required_location:'Brazil',description:'SQL'};
describe('coleta pública com respostas controladas',()=>{
 it('filtra cargos, rejeita itens inválidos e persiste histórico sem acessar URLs de vagas',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({jobs:[raw,{...raw,title:'Account Manager'},{...raw,url:'javascript:evil()'}]})));
  const store=new Store(':memory:');try{
   const result=await collect(store,loadProfile('config/search-profile.example.json'),{...loadSources(),gupyBoards:[],greenhouseBoards:[],arbeitnow:false});
   expect(result[0]).toMatchObject({source:'Remotive',fetched:3,imported:1,invalid:1});expect(store.list()).toHaveLength(1);expect(store.runs()).toHaveLength(1);
   expect(spy).toHaveBeenCalledTimes(1);expect(spy.mock.calls[0][0]).toBe('https://remotive.com/api/remote-jobs');
  }finally{spy.mockRestore();store.close();}
 });
 it('falha de uma fonte não impede a próxima nem remove vagas',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('bloqueado',{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({data:[{...raw,location:'Germany',remote:true}]})));
  const store=new Store(':memory:');try{const result=await collect(store,loadProfile('config/search-profile.example.json'),{...loadSources(),gupyBoards:[],greenhouseBoards:[]});expect(result[0].error).toBe('HTTP 403');expect(result[1].imported).toBe(1);expect(store.list()[0].assessment.eligibility).toBe('revisar');}finally{spy.mockRestore();store.close();}
 });
 it('exceções regionais impedem confirmação automática de elegibilidade',()=>expect(mapRemotive({...raw,candidate_required_location:'Worldwide except Brazil'}).remoteEligibility).toBe('fora_BR'));
});
