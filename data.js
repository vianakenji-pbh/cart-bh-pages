/* Recursos locais e rotas hash para hospedagem estática sob qualquer subpasta. */
'use strict';
function routeUrl(value=null){
  let route;
  if(value===null)route=location.hash.startsWith('#/')?location.hash.slice(1):'/';
  else if(String(value).startsWith('/'))route=String(value);
  else if(String(value).startsWith('#/'))route=String(value).slice(1);
  else{const outer=new URL(value,location.href);if(outer.origin!==location.origin)throw new Error('Link fora da biblioteca');route=outer.hash.startsWith('#/')?outer.hash.slice(1):'/';}
  return new URL(route,location.origin);
}
function routeHref(value){return String(value).startsWith('#/')?String(value):'#'+value;}
const StaticLibrary=(()=>{
  const cache=new Map(),pending=new Map();let worker=null,serial=0,searchReady=false;
  async function read(path){
    if(!cache.has(path))cache.set(path,fetch(new URL(path,document.baseURI)).then(async response=>{if(!response.ok)throw new Error('Não foi possível abrir o conteúdo da biblioteca.');return response.json();}));
    try{return await cache.get(path);}catch(error){cache.delete(path);throw error;}
  }
  function search(params){
    if(!worker){worker=new Worker(new URL('./search-worker.js',document.baseURI));worker.onmessage=({data})=>{const request=pending.get(data.id);if(!request)return;pending.delete(data.id);searchReady=true;data.error?request.reject(new Error(data.error)):request.resolve(data.result);};worker.onerror=()=>{for(const request of pending.values())request.reject(new Error('Não foi possível carregar a busca.'));pending.clear();worker.terminate();worker=null;};}
    return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,params});});
  }
  async function resource(kind){
    const url=new URL(kind,location.origin),path=url.pathname;
    const fixed={'/data/stats':'./data/stats.json','/data/themes':'./data/themes.json','/data/editorial':'./data/editorial.json','/data/graph':'./data/graph.json'};
    if(fixed[path])return read(fixed[path]);
    if(path==='/data/search')return search(Object.fromEntries(url.searchParams));
    if(path.startsWith('/data/document/')){const id=path.slice('/data/document/'.length);if(!/^(?:crt|jjt)-\d+$/.test(id))throw new Error('Julgado não encontrado');return read('./data/documents/'+id+'.json');}
    throw new Error('Conteúdo desconhecido');
  }
  return {resource,search,get searchReady(){return searchReady;}};
})();

document.querySelector('a.skip').addEventListener('click',event=>{event.preventDefault();document.querySelector('#main').focus();window.scrollTo(0,0);});
