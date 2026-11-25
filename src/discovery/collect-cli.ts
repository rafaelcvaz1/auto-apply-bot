import 'dotenv/config';
import { loadProfile,loadSources } from './config.js';
import { Store } from './store.js';
import { collect } from './sources.js';
const store=new Store();
try {const results=await collect(store,loadProfile(),loadSources());console.log(JSON.stringify(results,null,2));if(results.some(r=>r.error || r.detailErrors.length))process.exitCode=1;} finally {store.close();}
