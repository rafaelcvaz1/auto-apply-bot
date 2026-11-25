import type { Profile } from './model.js';
export function searchLinks(p: Profile): {title: string; source: string; mode: string; url: string}[] {
  return p.roles.flatMap(title=>[
    {title,source:'LinkedIn',mode:'Remoto Brasil',url:'https://www.linkedin.com/jobs/search/?'+new URLSearchParams({keywords:title,location:'Brasil',f_WT:'2'})},
    {title,source:'LinkedIn',mode:'Belém e região: confirmar município',url:'https://www.linkedin.com/jobs/search/?'+new URLSearchParams({keywords:title,location:'Belém, Pará, Brasil',f_WT:'1,3'})},
    {title,source:'Indeed',mode:'Remoto Brasil',url:'https://br.indeed.com/jobs?'+new URLSearchParams({q:title,l:'Remoto'})},
    {title,source:'Indeed',mode:'Belém e região: confirmar município',url:'https://br.indeed.com/jobs?'+new URLSearchParams({q:title,l:'Belém, PA',radius:'50'})},
    {title,source:'Gupy',mode:'Busca geral; aplicar filtros no portal',url:'https://portal.gupy.io/job-search/term='+encodeURIComponent(title)},
    {title,source:'Vagas.com',mode:'Busca geral; aplicar filtros no portal',url:'https://www.vagas.com.br/vagas-de-'+encodeURIComponent(title.toLowerCase().replace(/\s+/g,'-'))},
  ]);
}
