import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Store } from '../discovery/store.js';
import { loadProfile } from '../discovery/config.js';
import { loadAnswers,simulateBatch,validateForm,defaultForm } from './simulation.js';
if(process.argv.slice(2).some(a=>a!=='--help'))throw new Error('Somente simulação disponível; nenhum modo de envio pode ser ativado');
if(process.argv.includes('--help'))console.log('npm run simulate — planeja formulários locais sem rede. APPLICATION_FORM pode apontar para JSON local; padrão: modelo local genérico, não validado na plataforma.');
else {const store=new Store();try{const p=loadProfile();store.reassess(p);const form=process.env.APPLICATION_FORM?validateForm(JSON.parse(readFileSync(process.env.APPLICATION_FORM,'utf8'))):defaultForm;console.log(JSON.stringify(simulateBatch(store,p,loadAnswers(),form),null,2));}finally{store.close();}}
