'use strict';
const $ = (s, base = document) => base.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value).toLocaleString('pt-BR');
const fold = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
const api = StaticLibrary.resource;
let stats, themes, editorial, generation = 0, activeMatches = [], matchIndex = -1;
let positions = new Map();
let graphViews = new Map();
try {graphViews = new Map(JSON.parse(sessionStorage.getItem('cart-pages-graphs:'+location.pathname) || '[]'));} catch { /* Estado opcional. */ }
try {positions = new Map(JSON.parse(sessionStorage.getItem('cart-pages-positions:'+location.pathname) || '[]'));} catch { /* Sem estado de navegação anterior. */ }
const content = $('#content');
history.scrollRestoration = 'manual';

function locationState() {
  const url = routeUrl(), parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
  const state = Object.fromEntries(url.searchParams);
  if (parts[0] === 'tema') {state.theme = parts[1]; if (parts[2]) state.subtheme = parts[2];}
  if (parts[0] === 'julgado') state.doc = parts[1];
  state.view = parts[0] === 'julgado' ? 'document' : parts[0] === 'tema' ? 'theme' : parts[0] === 'pesquisa' ? 'search' : state.tab==='graph' ? 'graph' : 'home';
  return state;
}
function themePath(theme, sub) {return `#/tema/${encodeURIComponent(theme)}${sub ? '/' + encodeURIComponent(sub) : ''}`;}
function returnUrl(state) {
  if (state.back) {
    try {const url = routeUrl(state.back); if (url.origin===location.origin && (url.pathname==='/' || url.pathname==='/pesquisa' || url.pathname.startsWith('/tema/'))) return routeHref(url.pathname+url.search);} catch { /* Usar pesquisa como retorno. */ }
  }
  return stateUrl({...state,view:'search'},{doc:null});
}
function stateUrl(state, changes = {}) {
  const merged = {...state, ...changes};
  if(merged.view==='graph')return '#/?tab=graph'+(merged.doc?'&doc='+encodeURIComponent(merged.doc):'');
  let path = merged.view === 'theme' && merged.theme ? themePath(merged.theme, merged.subtheme) : '/pesquisa';
  const p = new URLSearchParams();
  for (const key of ['q','instance','tax','year','theme','subtheme','page','doc','mode']) {
    if (merged[key] && !(merged.view === 'theme' && ['theme','subtheme'].includes(key))) p.set(key, merged[key]);
  }
  if(merged.view==='theme' && merged.subtheme && resultLabels[merged.resultado])p.set('resultado',merged.resultado);
  return routeHref(path + (p.size ? '?' + p : ''));
}
function navigate(url, {replace = false, restore = false, anchor = null} = {}) {
  let restorePosition = restore;
  if (!restore) {
    const current = routeUrl(), target = routeUrl(url);
    const snapshot = {...history.state, scroll:window.scrollY, readerScroll:$('.reader')?.scrollTop || 0};
    positions.set(current.pathname+current.search,snapshot);history.replaceState(snapshot,'');
    try {sessionStorage.setItem('cart-pages-positions:'+location.pathname,JSON.stringify([...positions].slice(-100)));} catch { /* O histórico continua disponível sem armazenamento. */ }
    let next = positions.get(target.pathname+target.search);
    const sourceWithoutDoc = new URL(current), targetWithoutDoc = new URL(target);
    sourceWithoutDoc.searchParams.delete('doc');targetWithoutDoc.searchParams.delete('doc');
    const togglingReader = sourceWithoutDoc.pathname+sourceWithoutDoc.search === targetWithoutDoc.pathname+targetWithoutDoc.search;
    if (!next && togglingReader) next = {...snapshot,readerScroll:0};
    if(anchor && target.searchParams.has('doc') && current.pathname===target.pathname)next={...next||snapshot,readerScroll:0,readerAnchor:anchor};
    history[replace ? 'replaceState' : 'pushState'](next || {scroll:0}, '', routeHref(target.pathname+target.search));
    restorePosition = !!next;
  }
  render(restorePosition);
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-nav]');
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
    event.preventDefault();const row=link.closest('[data-judgment]'),paragraph=link.closest('[data-summary]');
    const element=row||paragraph,selector=row?`[data-judgment="${row.dataset.judgment}"]`:paragraph?`[data-summary="${paragraph.dataset.summary}"]`:null;
    navigate(link.href,{anchor:element?{selector,top:Math.max(105,Math.min(innerHeight-120,element.getBoundingClientRect().top))}:null});
  }
});
let routeRenderQueued=false;const restoreRoute=()=>{if(routeRenderQueued)return;routeRenderQueued=true;requestAnimationFrame(()=>{routeRenderQueued=false;render(true);});};window.addEventListener('popstate',restoreRoute);window.addEventListener('hashchange',restoreRoute);

function highlight(value, query) {
  const text = String(value || '');
  if (!query) return esc(text);
  const tokens = fold(query).match(/\d[\d./-]*\d|\w+/g) || [];
  const normalized = fold(text), spans = [];
  for (const token of tokens) {
    const pattern = /^[\d./-]+$/.test(token) ? token.replace(/\D/g, '').split('').join('[\\s./-]*') : token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(pattern, 'g');
    for (const match of normalized.matchAll(regex)) spans.push([match.index, match.index+match[0].length]);
  }
  spans.sort((a,b) => a[0]-b[0]); const merged = [];
  for (const s of spans) {const last = merged.at(-1); if (last && s[0] <= last[1]) last[1] = Math.max(last[1],s[1]); else merged.push(s);}
  let result = '', position = 0;
  for (const [start,end] of merged) {result += esc(text.slice(position,start)) + '<mark>' + esc(text.slice(start,end)) + '</mark>'; position=end;}
  return result + esc(text.slice(position));
}
function textHtml(text, query = '') {
  return String(text || '').split(/\n\s*\n/).map(block => {
    if (/^#{1,6}\s/.test(block)) return block.split('\n').map(line => /^#{1,6}\s/.test(line) ? `<h4>${highlight(line.replace(/^#{1,6}\s+/,''),query)}</h4>` : `<p>${highlight(line,query)}</p>`).join('');
    if (/^[-*]\s/.test(block)) return '<ul>' + block.split('\n').map(line => `<li>${highlight(line.replace(/^[-*]\s+/,''),query)}</li>`).join('') + '</ul>';
    return `<p>${highlight(block,query)}</p>`;
  }).join('');
}
function crumbs(items) {return `<nav class="crumbs" aria-label="Caminho"><a href="#/" data-nav>Biblioteca</a>${items.map(([name,url]) => ` <span aria-hidden="true">/</span> ${url ? `<a href="${esc(url)}" data-nav>${esc(name)}</a>` : `<span>${esc(name)}</span>`}`).join('')}</nav>`;}
function tree(state) {
  for(const [selector,view] of [['.side-home','home'],['.side-search','search']]){const link=$(selector);if(state.view===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  $('#theme-tree').innerHTML = themes.map(t => `<details class="tree-item ${state.view==='theme' && state.theme === t.id ? 'active' : ''}" ${state.view==='theme' && state.theme === t.id ? 'open' : ''}><summary><a href="${themePath(t.id)}" data-nav>${esc(t.name)}</a><small>${t.count}</small></summary><div class="subtree">${t.subthemes.map(s => `<a href="${themePath(t.id,s.id)}" data-nav class="${state.view==='theme' && state.subtheme === s.id && state.theme === t.id ? 'active' : ''}">${esc(s.name)}</a>`).join('')}</div></details>`).join('');
}
function searchForm(query = '') {return `<form class="search-box" id="search-form" role="search"><span class="search-icon" aria-hidden="true">⌕</span><input id="search-input" name="q" type="search" value="${esc(query)}" placeholder="Palavras, processo ou número do acórdão" aria-label="Pesquisar julgados"><button class="primary" type="submit">Pesquisar <span aria-hidden="true">→</span></button></form>`;}
function bindSearch(state) {$('#search-form')?.addEventListener('submit', e => {e.preventDefault(); navigate(stateUrl({...state,view:state.view === 'theme' ? 'theme' : 'search'}, {q:$('#search-input').value.trim(),page:null,doc:null}));});}
function footer() {return `<footer class="footer"><span>CART-BH · Conselho Administrativo de Recursos Tributários</span><span>Última coleta: ${esc(stats.collected.split('-').reverse().join('/'))}</span></footer>`;}
function homeHeader(tab='themes') {
  return `<section class="hero"><p class="eyebrow">JURISPRUDÊNCIA ADMINISTRATIVA · BELO HORIZONTE</p>${searchForm()}<p class="hint">Pesquise nos ${fmt(stats.total)} registros por palavras, processo ou número do acórdão.</p><p class="collection-counts">${fmt(stats.instances.CRT)} acórdãos do CRT <span>·</span> ${fmt(stats.instances.JJT)} decisões da JJT</p></section><nav class="home-tabs" aria-label="Visualização da biblioteca"><a href="#/" data-nav ${tab==='themes'?'aria-current="page"':''}>Temas</a><a href="#/?tab=graph" data-nav ${tab==='graph'?'aria-current="page"':''}>Grafo</a><a href="#/pesquisa" data-nav>Busca geral</a></nav>`;
}
function home() {
  document.title = 'Biblioteca CART-BH';
  const t = themes[0], sub = t.subthemes[0];
  content.innerHTML = `<div class="intro">${homeHeader()}<section id="temas"><a class="theme-card" href="${themePath(t.id)}" data-nav><span class="card-num">SELEÇÃO TEMÁTICA</span><h1>${esc(t.name)}</h1><p class="card-subtheme">${esc(sub.name)}</p><p>${esc(sub.question)}</p><span class="card-foot"><span>${sub.count} acórdãos · ${sub.process_count} processos</span><span aria-hidden="true">→</span></span></a></section>${footer()}</div>`;
  bindSearch({view:'search'});
}
function filters(state) {
  const option = (v,label,current) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(label)}</option>`;
  const theme = themes.find(t => t.id === state.theme);
  return `<div class="filter-bar"><label>INSTÂNCIA<select data-filter="instance" aria-label="Filtrar instância">${option('','CRT e JJT',state.instance)}${option('CRT','CRT',state.instance)}${option('JJT','JJT',state.instance)}</select></label><label>TRIBUTO<select data-filter="tax" aria-label="Filtrar tributo">${option('','Todos os tributos',state.tax)}${stats.taxes.map(t => option(t,t,state.tax)).join('')}</select></label><label>ANO<select data-filter="year" aria-label="Filtrar ano">${option('','Todos os anos',state.year)}${stats.years.map(y => option(y,y,state.year)).join('')}</select></label>${state.view !== 'theme' ? `<label>TEMA<select data-filter="theme" aria-label="Filtrar tema">${option('','Todos os temas',state.theme)}${themes.map(t => option(t.id,t.name,state.theme)).join('')}</select></label>${theme ? `<label>SUBTEMA<select data-filter="subtheme" aria-label="Filtrar subtema">${option('','Todos os subtemas',state.subtheme)}${theme.subthemes.map(s => option(s.id,s.name,state.subtheme)).join('')}</select></label>` : ''}` : ''}</div>`;
}
function activeFilters(state) {
  const theme = themes.find(t => t.id === state.theme), sub = theme?.subthemes.find(s => s.id === state.subtheme);
  const names = {q:state.q,instance:state.instance,tax:state.tax,year:state.year,theme:theme?.name,subtheme:sub?.name};
  return `<div class="active-filters">${Object.entries(names).filter(([,v]) => v).map(([key,v]) => `<button class="chip" data-remove="${key}" aria-label="Remover filtro ${esc(v)}">${esc(v)} <span aria-hidden="true">×</span></button>`).join('')}${Object.values(names).some(Boolean) ? '<button class="text-button" id="clear-filters">Limpar todos</button>' : ''}</div>`;
}
function resultCard(doc,state) {
  return `<article class="result-card ${state.doc === doc.id ? 'selected' : ''}" data-result="${doc.id}"><div class="badges"><span class="badge ${doc.instance.toLowerCase()}">${doc.instance}</span><span>${esc(doc.tax)}</span><span>${esc(doc.year)}</span>${doc.chamber ? `<span>${esc(doc.chamber)}</span>` : ''}</div><h3><a href="${esc(stateUrl(state,{doc:doc.id}))}" data-nav>${highlight(doc.title,state.q)}</a></h3><p class="result-summary">${highlight(doc.summary,state.q)}</p><p class="result-snippet">${highlight(doc.snippet,state.q)}</p><div class="result-bottom"><span>${doc.instance === 'CRT' ? 'Processo ' + esc(doc.process) : esc(doc.party)}</span><span>Texto publicado</span></div></article>`;
}
function themeIntro(state) {
  const t = themes.find(t => t.id === state.theme);
  if (!t) throw new Error('Tema não encontrado.');
  const sub = t.subthemes.find(s => s.id === state.subtheme);
  if (state.subtheme && !sub) throw new Error('Subtema não encontrado.');
  const trail = sub ? [[t.name,themePath(t.id)],[sub.name,null]] : [[t.name,null]];
  return `<section class="theme-overview">${crumbs(trail)}<p class="eyebrow">${sub ? 'SUBTEMA · PERGUNTA PRÁTICA' : 'EXPLORAÇÃO TEMÁTICA'}</p><h1 class="page-title">${esc(sub?.name || t.name)}</h1><p class="lead">${esc(sub?.question || t.scope)}</p><div class="coverage">${sub?.count ?? t.count} acórdãos · ${sub?.process_count ?? t.process_count} processos. Seleção temática com cobertura parcial do acervo.</div>${sub ? '' : `<div class="subtheme-grid">${t.subthemes.map(s => `<a class="subtheme-card" href="${themePath(t.id,s.id)}" data-nav><h3>${esc(s.name)}</h3><p>${esc(s.question)}</p><span>${s.count} acórdãos · ${s.process_count} processos →</span></a>`).join('')}</div>`}</section>`;
}
const resultLabels={a_favor:'A favor',contra:'Contra',parcial:'Parcial',a_conferir:'A conferir'};
function resultFilters(state) {
  const selected=resultLabels[state.resultado]?state.resultado:'';
  return `<div class="judgment-filters" role="group" aria-label="Filtrar quadro pelo impacto da baixa sobre a revisão"><button class="score all" data-result-filter="" aria-pressed="${selected===''}" aria-controls="judgment-table"><strong>${editorial.total_acordaos}</strong> Todos</button>${Object.entries(resultLabels).filter(([key])=>key!=='a_conferir'||editorial.totais[key]).map(([key,label])=>`<button class="score ${key}" data-result-filter="${key}" aria-pressed="${selected===key}" aria-controls="judgment-table"><strong>${editorial.totais[key]}</strong> ${label}</button>`).join('')}</div><p class="hint">${esc(editorial.classification_criterion)} ${editorial.total_acordaos} acórdãos correspondem a ${editorial.total_processos} processos.</p><p id="judgment-count" class="hint" role="status" aria-live="polite"></p>`;
}
function summaryReferences(text, state) {
  const judgments = new Map(editorial.julgados.map(record => [record.numero, record.id]));
  return String(text).split(/(\b\d{1,2}\.\d{3}\b)/g).map(part => {
    const id = judgments.get(part);
    return id ? `<a href="${esc(stateUrl(state,{doc:id}))}" data-nav aria-label="Ler acórdão ${esc(part)}">${esc(part)}</a>` : esc(part);
  }).join('');
}
function thematicSections(state) {
  if(!editorial)return '';
  if(!state.subtheme)return `<section class="editorial"><h2>Síntese da controvérsia</h2><p>${esc(editorial.resumo_tema)}</p></section>`;
  const rows=editorial.julgados.map(record=>{
    const href=stateUrl(state,{doc:record.id}), sources=`<details class="sources"><summary>Fontes e trechos de apoio</summary>${record.fontes.map(source=>`<div><a href="${esc(source.tipo==='texto_publicado'?href:source.url)}" ${source.tipo==='texto_publicado'?'data-nav':'target="_blank" rel="noopener"'}>${source.tipo==='pdf'?'Voto / certidão em PDF':'Texto publicado'}${source.pagina?' · p. '+esc(source.pagina):''} ↗</a><blockquote>${esc(source.trecho)}</blockquote></div>`).join('')}</details>`;
    return `<tr data-judgment="${record.id}" data-classification="${record.classificacao}" ${state.doc===record.id?'class="selected-judgment"':''}><th scope="row" data-label="Acórdão"><a href="${esc(href)}" data-nav>${esc(record.numero)}</a><small class="judgment-publication">Publicação: ${esc(record.data_publicacao || 'Não informada')}</small>${record.chamber?`<small class="judgment-chamber">${esc(record.chamber)}</small>`:''}</th><td data-label="Situação examinada">${esc(record.situacao)}</td><td data-label="Impacto da baixa / resultado final"><span class="score ${record.classificacao}">${resultLabels[record.classificacao]}</span><p>${esc(record.resultado)}</p>${record.observacao?`<p class="judgment-observation">${esc(record.observacao)}</p>`:''}</td><td data-label="Fundamento sobre ciência do Fisco">${esc(record.fundamento)}${sources}</td><td data-label="Documento"><a class="secondary" href="${esc(href)}" data-nav>Ler acórdão</a></td></tr>`;
  }).join('');
  return `<section class="editorial"><h2>Síntese dos julgamentos</h2>${editorial.resumo_subtema.map((p,index)=>`<p data-summary="${index}">${summaryReferences(p,state)}</p>`).join('')}<h2>Quadro comparativo dos ${editorial.total_acordaos} acórdãos</h2>${resultFilters(state)}<div class="comparison-wrap"><table class="comparison" id="judgment-table"><thead><tr><th>Acórdão</th><th>Situação examinada</th><th>Impacto da baixa / resultado final</th><th>Fundamento sobre ciência do Fisco</th><th>Documento</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function bindEditorialFilters(state) {
  if(!$('#judgment-table'))return;
  const apply=()=>{
    const selected=resultLabels[state.resultado]?state.resultado:'';let count=0;
    document.querySelectorAll('[data-judgment]').forEach(row=>{row.hidden=!!selected&&row.dataset.classification!==selected;if(!row.hidden)count++;});
    document.querySelectorAll('[data-result-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.resultFilter===selected)));
    $('#judgment-count').textContent=`${count} de ${editorial.total_acordaos} acórdãos exibidos${selected?' · '+resultLabels[selected]:''}.`;
    content.querySelectorAll('a[data-nav],a[data-page]').forEach(link=>{const url=routeUrl(link.href);if(url.pathname===routeUrl().pathname&&(url.searchParams.has('doc')||link.hasAttribute('data-page')||link.closest('.reader'))){if(selected)url.searchParams.set('resultado',selected);else url.searchParams.delete('resultado');link.href=routeHref(url.pathname+url.search);}});
  };
  document.querySelectorAll('[data-result-filter]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.resultFilter;if((state.resultado||'')===key)return;
    const current=routeUrl(),snapshot={...history.state,scroll:window.scrollY,editorialFocus:key};
    positions.set(current.pathname+current.search,snapshot);history.replaceState(snapshot,'');
    state.resultado=key;history.pushState(snapshot,'',stateUrl(state));apply();
    try{sessionStorage.setItem('cart-pages-positions:'+location.pathname,JSON.stringify([...positions].slice(-100)));}catch{/* Memory history remains available. */}
  }));apply();
}
function readerHtml(doc,state,full = false) {
  const fields = [['Processo',doc.process],['Tributo',doc.tax],['Ano',doc.year],['Publicação',doc.date || (doc.instance === 'CRT' ? 'Data não informada' : '')],['Contribuinte / requerente',doc.party],['Câmara',doc.chamber],['Relator(a)',doc.rapporteur],['Índice cadastral',doc.cadastral_index]];
  const close = stateUrl(state,{doc:null});
  return `<article class="reader ${full ? 'full' : ''}" id="reader" aria-label="Leitura do julgado">${full ? `<a class="secondary" href="${esc(returnUrl(state))}" data-nav>← Voltar à biblioteca</a>` : ''}<header class="reader-header"><div class="badges"><span class="badge ${doc.instance.toLowerCase()}">${doc.instance}</span><span>${esc(doc.tax)}</span><span>${esc(doc.year)}</span>${!full ? `<a href="${esc(close)}" data-nav style="margin-left:auto" aria-label="Fechar leitura">Fechar ×</a>` : ''}</div><${full ? 'h1' : 'h2'} class="doc-title">${highlight(doc.title,state.q)}</${full ? 'h1' : 'h2'}><dl class="reader-meta">${fields.filter(([,v]) => v).map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${highlight(v,state.q)}</dd></div>`).join('')}</dl><div class="reader-actions">${doc.pdf_url ? `<a class="secondary" href="${esc(doc.pdf_url)}" target="_blank" rel="noopener">PDF no site do CART-BH ↗</a>` : ''}${doc.source_form?`<form class="original-source" action="${esc(doc.source_url)}" method="post" target="_blank" rel="noopener">${Object.entries(doc.source_form).map(([name,value])=>`<input type="hidden" name="${esc(name)}" value="${esc(value)}">`).join('')}<button class="secondary" type="submit">Resultado no site do CART-BH ↗</button></form>`:`<a class="secondary" href="${esc(doc.source_url)}" target="_blank" rel="noopener">Fonte original ↗</a>`}<button class="secondary" id="copy-reference">Copiar referência</button>${!full ? `<a class="secondary" href="#/julgado/${doc.id}?back=${encodeURIComponent(close)}${state.q ? '&q='+encodeURIComponent(state.q) : ''}" data-nav>Página do julgado ↗</a>` : ''}</div>${!doc.pdf_url ? '<p class="reader-note">A origem não disponibiliza PDF para este registro. Acesse a consulta oficial em Fonte original.</p>' : ''}${doc.instance === 'JJT' ? '<p class="reader-note">Ano informado no acervo; não representa uma data de publicação.</p>' : '<p class="reader-note">O texto publicado abaixo e a ementa são distintos do documento do voto em PDF.</p>'}</header>${state.q ? '<div class="match-bar"><span id="match-count"></span><button class="secondary" id="previous-match" aria-label="Ocorrência anterior">↑</button><button class="secondary" id="next-match" aria-label="Próxima ocorrência">↓</button></div>' : ''}<section class="reader-section"><h3>${doc.instance === 'CRT' ? 'Ementa' : 'Assunto'}</h3><div class="document-text">${textHtml(doc.summary,state.q)}</div></section><section class="reader-section"><h3>Texto publicado ${doc.instance === 'CRT' ? 'no site' : '· inteiro teor'}</h3><div class="document-text">${doc.body ? textHtml(doc.body,state.q) : '<p>Texto não disponível no acervo local.</p>'}</div></section><section class="backlinks"><h3>Referenciado nestes temas</h3>${doc.themes.length ? `<ul>${doc.themes.map(t => `<li><a href="${themePath(t.theme_id)}" data-nav>${esc(t.theme_name)}</a><br><a href="${themePath(t.theme_id,t.subtheme_id)}" data-nav>${esc(t.subtheme_name)} →</a></li>`).join('')}</ul><small>Exemplos da taxonomia · vínculos com cobertura parcial.</small>` : `<p class="reader-note">Este julgado ainda não tem vínculos na taxonomia. Você pode encontrá-lo pela pesquisa textual.</p>`}</section></article>`;
}
function bindReader(doc) {
  $('#copy-reference')?.addEventListener('click', async () => {
    const text = `${doc.instance} — ${doc.title}; processo ${doc.process}; ${doc.year}${doc.date ? '; publicação '+doc.date : ''}. Fonte: ${doc.pdf_url || doc.source_url}. Biblioteca: ${new URL(routeHref('/julgado/'+doc.id),document.baseURI).href}`;
    try {await navigator.clipboard.writeText(text); toast('Referência copiada.');} catch {toast('Não foi possível copiar. Selecione a referência na página.');}
  });
  activeMatches = [...document.querySelectorAll('.reader mark')]; matchIndex = -1;
  const move = delta => {
    if (!activeMatches.length) return;
    activeMatches[matchIndex]?.classList.remove('current-match');
    matchIndex = matchIndex < 0 ? (delta>0 ? 0 : activeMatches.length-1) : (matchIndex+delta+activeMatches.length)%activeMatches.length;
    const mark=activeMatches[matchIndex];mark.classList.add('current-match');mark.scrollIntoView({block:'center',behavior:'smooth'});
    $('#match-count').textContent = `${matchIndex+1} de ${activeMatches.length} ocorrências`;
  };
  if ($('#match-count')) {$('#match-count').textContent = `${activeMatches.length} ocorrências`;$('#previous-match').disabled = $('#next-match').disabled = !activeMatches.length;$('#previous-match').onclick = () => move(-1);$('#next-match').onclick = () => move(1);}
}
function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('visible');setTimeout(() => $('#toast').classList.remove('visible'),2600);}

async function render(restore = false) {
  graphController?.destroy();graphController=null;
  const version = ++generation, state = locationState();
  if(state.mode==='graph'){navigate('/?tab=graph'+(state.doc?'&doc='+encodeURIComponent(state.doc):''),{replace:true});return;}
  try {
    tree(state);
    if (state.view === 'home') home();
    else if(state.view==='graph') {
      const [graph,doc]=await Promise.all([graphCache?Promise.resolve(graphCache):api('/data/graph'),state.doc?api('/data/document/'+encodeURIComponent(state.doc)):Promise.resolve(null)]);
      if(version!==generation)return;graphCache=graph;
      document.title='Grafo geral · Biblioteca CART-BH';
      content.innerHTML=`<div class="graph-page ${doc?'has-reader':''}">${homeHeader('graph')}<div class="search-layout graph-layout ${doc?'with-reader':''}">${graphMarkup()}${doc?readerHtml(doc,state):''}</div>${footer()}</div>`;
      bindSearch({view:'search'});mountGraph(graph,state);if(doc)bindReader(doc);
    }
    else if (state.view === 'document') {
      const doc = await api('/data/document/'+encodeURIComponent(state.doc)); if (version !== generation) return;
      document.title = `${doc.title} · Biblioteca CART-BH`;
      content.innerHTML = crumbs([[doc.title,null]]) + readerHtml(doc,state,true) + footer();bindReader(doc);
    } else {
      const visibleTheme=themes.find(t=>t.id===state.theme);
      if ((state.theme && !visibleTheme) || (state.subtheme && !visibleTheme?.subthemes.some(s=>s.id===state.subtheme))) {
        document.title='Tema fora do recorte · Biblioteca CART-BH';
        content.innerHTML=`${crumbs([['Tema fora do recorte atual',null]])}<h1 class="page-title">Tema fora do recorte atual</h1><p class="lead">Este tema ou subtema está fora da seleção temática apresentada nesta versão. Todos os julgados continuam disponíveis na busca geral.</p><a class="secondary" href="#/pesquisa" data-nav>Pesquisar no acervo completo →</a>${footer()}`;
        $('#main').focus({preventScroll:true});return;
      }
      if(state.view==='theme') {
        const doc=state.doc?await api('/data/document/'+encodeURIComponent(state.doc)):null;
        if(version!==generation)return;
        document.title=`${visibleTheme.name} · Biblioteca CART-BH`;
        content.innerHTML=themeIntro(state)+`<div class="search-layout ${doc?'with-reader':''}"><section class="results-column" aria-label="Conteúdo temático">${thematicSections(state)}</section>${doc?readerHtml(doc,state):''}</div>`+footer();
        bindEditorialFilters(state);if(doc)bindReader(doc);
      } else {
      content.querySelector('#pages-search-status')?.remove();
      if(!StaticLibrary.searchReady)content.innerHTML='<p class="loading" role="status">Carregando resultados…</p>';
      else content.insertAdjacentHTML('afterbegin','<p id="pages-search-status" class="loading" role="status">Pesquisando…</p>');
      const params = new URLSearchParams();
      for (const key of ['q','instance','tax','year','theme','subtheme','page']) if (state[key]) params.set(key,state[key]);
      const [results,doc] = await Promise.all([api('/data/search?'+params), state.doc ? api('/data/document/'+encodeURIComponent(state.doc)) : Promise.resolve(null)]);
      if (version !== generation) return;
      document.title = `Pesquisa · Biblioteca CART-BH`;
      const emptyMessage = results.thematic_jjt_empty ? 'A JJT ainda não tem exemplos associados à taxonomia. Remova o filtro temático para pesquisar seus textos.' : 'Experimente outras palavras ou remova um dos filtros para ampliar a pesquisa.';
      content.innerHTML = `${crumbs([['Pesquisa',null]])}<p class="eyebrow">PESQUISA NO ACERVO</p><h1 class="page-title">Julgados e decisões</h1><div class="search-layout ${doc ? 'with-reader' : ''}"><section class="results-column" aria-label="Resultados da pesquisa">${searchForm(state.q)}${filters(state)}${activeFilters(state)}<div class="result-meta"><span>${fmt(results.total)} julgados encontrados</span><span>${state.q ? 'Por relevância' : 'Ano decrescente'}</span></div><div id="results">${results.items.length ? results.items.map(d=>resultCard(d,state)).join('') : `<div class="empty"><h3>Nenhum julgado encontrado</h3><p>${emptyMessage}</p>${results.thematic_jjt_empty ? '<button class="secondary" id="remove-theme">Remover filtro temático</button>' : '<button class="secondary" id="empty-clear">Limpar filtros</button>'}</div>`}</div><div class="pager"><a class="secondary ${results.page===1 ? 'disabled' : ''}" href="${esc(stateUrl(state,{page:Math.max(1,results.page-1),doc:null}))}" data-page="previous" aria-disabled="${results.page===1}">← Anterior</a><span>Página ${results.page} de ${results.pages}</span><a class="secondary ${results.page===results.pages ? 'disabled' : ''}" href="${esc(stateUrl(state,{page:results.page+1,doc:null}))}" data-page="next" aria-disabled="${results.page===results.pages}">Próxima →</a></div></section>${doc ? readerHtml(doc,state) : ''}</div>${footer()}`;
      bindSearch(state);
      bindEditorialFilters(state);
      document.querySelectorAll('[data-filter]').forEach(select=>select.addEventListener('change', () => {const key=select.dataset.filter; navigate(stateUrl(state,{[key]:select.value,page:null,doc:null,...(key==='theme' ? {subtheme:null}: {})}));}));
      document.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=> {const key=button.dataset.remove;navigate(stateUrl(state,{[key]:null,page:null,doc:null,...(key==='theme' ? {view:'search',subtheme:null}:{})}));}));
      const clear = () => navigate('/pesquisa'); $('#clear-filters')?.addEventListener('click',clear);$('#empty-clear')?.addEventListener('click',clear);
      $('#remove-theme')?.addEventListener('click',()=>navigate(stateUrl({...state,view:'search'},{theme:null,subtheme:null,page:null,doc:null})));
      document.querySelectorAll('[data-page]').forEach(link=>link.addEventListener('click', e=>{e.preventDefault();if(link.getAttribute('aria-disabled') !== 'true') navigate(link.href);}));

      if (doc) bindReader(doc);
      }
    }
    bindPagesCards(state);
    if (restore) {window.scrollTo(0,history.state?.scroll || 0);if($('.reader')) $('.reader').scrollTop=history.state?.readerScroll || 0;if(history.state?.editorialFocus!==undefined)$(`[data-result-filter="${history.state.editorialFocus}"]`)?.focus({preventScroll:true});}
    else if (location.hash && !location.hash.startsWith('#/')) $(location.hash)?.scrollIntoView({block:'start'});
    else {window.scrollTo(0,0); $('#main').focus({preventScroll:true});}
    if(state.view==='theme' && state.doc && history.state?.readerAnchor){const anchor=history.state.readerAnchor,element=$(anchor.selector);if(element?.getClientRects().length)window.scrollBy(0,element.getBoundingClientRect().top-anchor.top);}
  } catch (error) {
    if(version !== generation) return;
    content.innerHTML=`<div class="error"><h1 class="page-title">Não foi possível abrir esta página</h1><p>${esc(error.message)}</p><a href="#/" data-nav>Voltar à biblioteca →</a></div>`;
  }
}
(async()=> {try {[stats,themes,editorial]=await Promise.all([api('/data/stats'),api('/data/themes'),api('/data/editorial')]);render(true);} catch(error) {content.innerHTML=`<div class="error">${esc(error.message)} Recarregue a página para tentar novamente.</div>`;}})();

/* Interações exclusivas da versão Pages: cartões, foco e seleção de texto. */
function bindPagesCards(state) {
  content.querySelectorAll('.result-card,.comparison tbody tr[data-judgment]').forEach(card => {
    card.dataset.readerCard = card.dataset.result || card.dataset.judgment;
    card.tabIndex = 0;
    if(card.classList.contains('result-card'))card.setAttribute('role', 'link');
    card.setAttribute('aria-label', 'Ler ' + (card.querySelector('h3')?.textContent || 'acórdão ' + card.querySelector('th a')?.textContent));
    const open = () => {
      const anchor = card.dataset.judgment ? {selector:`[data-judgment="${card.dataset.judgment}"]`,top:Math.max(105,Math.min(innerHeight-120,card.getBoundingClientRect().top))} : null;
      navigate(stateUrl(state,{doc:card.dataset.readerCard}),{anchor});
    };
    card.addEventListener('click', event => {
      if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.target.closest('a,button,input,select,textarea,summary,details') || String(window.getSelection()).trim())return;
      open();
    });
    card.addEventListener('keydown', event => {
      if(event.target===card && event.key==='Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey){event.preventDefault();open();}
    });
  });
}
