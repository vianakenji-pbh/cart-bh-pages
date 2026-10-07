'use strict';
importScripts('./search-engine.js');
const read=async path=>{const response=await fetch(path);if(!response.ok)throw new Error('Não foi possível carregar a busca.');return response.json();};
let enginePromise,textPromise;
function engine(){return enginePromise ||= Promise.all([read('./data/catalog.json'),read('./data/themes.json'),read('./data/search-config.json')]).then(([catalog,themes,config])=>PagesSearch.create(catalog,themes,config));}
async function texts(){
  if(typeof DecompressionStream==='function'){
    try{const response=await fetch('./data/texts.json.gz');if(!response.ok)throw new Error('Índice comprimido indisponível');return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();}catch{/* Compatibilidade com hosts sem arquivos gzip e navegadores antigos. */}
  }
  return read('./data/texts.json');
}
onmessage=async({data})=>{
  try{const searchEngine=await engine();
    if(PagesSearch.trim(data.params.q||''))await(textPromise ||= texts().then(text=>{searchEngine.setTexts(text);return true;}));
    postMessage({id:data.id,result:searchEngine.search(data.params)});
  }catch(error){postMessage({id:data.id,error:error.message});}
};
