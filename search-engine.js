/* Busca estática: mesmas regras da Library Python; usada no Worker e nos testes. */
(function(root,factory){const engine=factory();if(typeof module==='object'&&module.exports)module.exports=engine;else root.PagesSearch=engine;})(globalThis,()=>{
  'use strict';
  const digits=value=>String(value).replace(/[^\p{Nd}]/gu,'');
  const trim=value=>String(value).replace(/^[\s\u001c-\u001f]+|[\s\u001c-\u001f]+$/gu,'');
  function normalizer(config){
    const charset=values=>'['+values.map(char=>'\\u{'+char.codePointAt(0).toString(16)+'}').join('')+']';
    const cases=new RegExp(charset(Object.keys(config.casefold)),'gu'),marks=new RegExp(charset(config.combining),'gu');
    return value=>String(value).replace(cases,char=>config.casefold[char]).normalize('NFD').replace(marks,'');
  }
  function create(catalog,themes,config){
    const normalize=normalizer(config),entries=catalog.map(entry=>({...entry,summary:normalize(entry.document.summary)}));
    const byId=new Map(entries.map(entry=>[entry.document.id,entry]));let hasTexts=false;
    function setTexts(texts){
      for(const [id,body]of Object.entries(texts)){const entry=byId.get(id);if(!entry)throw new Error('Texto sem documento no catálogo: '+id);entry.body=body;entry.normalizedBody=normalize(body);entry.text=entry.metadata+' '+entry.normalizedBody;}
      if(entries.some(entry=>entry.body===undefined))throw new Error('Índice textual incompleto');hasTexts=true;
    }
    function search(params={}){
      const query=trim(params.q||''),normalized=normalize(query),tokens=normalized.match(/\p{Nd}[\p{Nd}./-]*\p{Nd}|[\p{L}\p{N}_]+/gu)||[];
      if(query&&!hasTexts)throw new Error('A busca textual ainda não foi carregada');
      const theme=themes.find(theme=>theme.id===params.theme),sub=theme?.subthemes.find(sub=>sub.id===params.subtheme);
      if(params.theme&&!theme)throw new Error('Tema desconhecido');if(params.subtheme&&!sub)throw new Error('Subtema desconhecido ou sem tema');
      const allowed=theme?new Set(sub?sub.document_ids:theme.document_ids):null,results=[];
      for(const entry of entries){const doc=entry.document;
        if((params.instance&&params.instance!==doc.instance)||(params.year&&params.year!==doc.year))continue;
        if(params.tax&&!doc.tax.split('/').map(trim).includes(params.tax))continue;
        if(allowed&&!allowed.has(doc.id))continue;
        if(!tokens.every(token=>(entry.text||entry.metadata).includes(token)||(/^[\p{Nd}./-]+$/u.test(token)&&entry.identities.some(identity=>identity.includes(digits(token))))))continue;
        const exact=/^[\p{Nd}\s./-]+$/u.test(query)&&entry.identities.includes(digits(query));
        const score=(exact?1000:0)+tokens.reduce((sum,token)=>sum+(entry.summary.includes(token)?20:entry.metadata.includes(token)?5:1),0);
        results.push({entry,score});
      }
      const compare=(a,b)=>a===b?0:a>b?-1:1;
      results.sort((a,b)=>compare(query?a.score:0,query?b.score:0)||compare(Number(a.entry.document.year||0),Number(b.entry.document.year||0))||compare(a.entry.date,b.entry.date)||compare(a.entry.document.id,b.entry.document.id));
      const pages=Math.max(1,Math.ceil(results.length/config.page_size));let rawPage=params.page===undefined?'1':trim(params.page);
      if(!/^[+-]?\p{Nd}+(?:_\p{Nd}+)*$/u.test(rawPage))throw new Error('Página inválida');
      rawPage=rawPage.replace(/\p{Nd}/gu,char=>String(config.decimal[char]??char)).replaceAll('_','');
      const page=Math.min(pages,Math.max(1,Number(rawPage))),items=[];
      for(const {entry}of results.slice((page-1)*config.page_size,page*config.page_size)){
        let snippet=entry.preview;
        if(query){const positions=tokens.map(token=>entry.normalizedBody.indexOf(token)).filter(position=>position>=0).map(position=>Array.from(entry.normalizedBody.slice(0,position)).length);
          const start=positions.length?Math.max(0,Math.min(...positions)-90):0,body=Array.from(entry.body);
          snippet=(start?'…':'')+body.slice(start,start+270).join('')+(body.length>start+270?'…':'');}
        items.push({...entry.document,snippet});
      }
      return {items,total:results.length,page,pages,page_size:config.page_size,thematic_jjt_empty:!!(theme&&params.instance==='JJT')};
    }
    return {search,setTexts,normalize};
  }
  return {create,normalizer,trim};
});
