'use strict';
let graphController = null, graphCache = null;
const graphColors = {CRT:'#245d48',JJT:'#a47b40',theme:'#395a8e',subtheme:'#93719d'};
let savedGraph = null;
try {savedGraph = JSON.parse(sessionStorage.getItem('cart-pages-general-graph:'+location.pathname));} catch { /* Optional state. */ }
function graphMarkup() {
  return `<section class="graph-column" aria-label="Grafo geral da biblioteca">
    <div class="graph-controls"><label>Identificação do nó<input type="search" id="graph-search" placeholder="Acórdão, processo ou nome" autocomplete="off"></label>
    <fieldset><legend>Documentos</legend><label><input type="checkbox" id="graph-crt" checked> CRT</label><label><input type="checkbox" id="graph-jjt" checked> JJT</label></fieldset>
    <label class="graph-orphans"><input type="checkbox" id="graph-orphans" checked> Mostrar documentos sem vínculos</label></div>
    <div class="graph-toolbar"><button class="secondary" id="graph-zoom-in" aria-label="Ampliar grafo">+</button><button class="secondary" id="graph-zoom-out" aria-label="Reduzir grafo">−</button><button class="secondary" id="graph-fit">Enquadrar</button><output id="graph-zoom" aria-label="Zoom"></output><output id="graph-count" aria-live="polite"></output><span id="graph-status" role="status">Calculando distribuição…</span></div>
    <div class="graph-legend" aria-label="Legenda"><span class="crt">CRT</span><span class="jjt">JJT</span><span class="theme">Tema</span><span class="subtheme">Subtema</span></div>
    <p id="graph-help" class="graph-help">Arraste a área ou um nó. Use a roda, + e − para ampliar; setas para mover. Clique em um documento para ler ou em um tema para abrir sua página.</p>
    <canvas id="library-graph" tabindex="0" role="img" aria-label="Rede da biblioteca inteira" aria-describedby="graph-help graph-count">Use a pesquisa geral para encontrar e abrir documentos da biblioteca.</canvas>
  </section>`;
}
function mountGraph(graph, state) {
  const canvas = $('#library-graph'), ctx = canvas.getContext('2d');
  const nodes = graph.nodes.map(n=>({...n})), byId = new Map(nodes.map(n=>[n.id,n]));
  const stored = savedGraph || {};
  for (const [id,x,y,fx,fy] of stored.positions || []) if(byId.has(id))Object.assign(byId.get(id),{x,y,fx,fy});
  let view = {x:0,y:0,scale:1,...stored.view}, filters = {CRT:true,JJT:true,orphans:true,q:'',...stored.filters};
  let selected = state.doc || stored.selected || null, hovered = null, drag = null, width=0,height=0, stable=!!stored.stable;
  let visible=[], links=[], visibleIds=new Set(), worker=null, frame=0, dirty=true, initialized=false, moved=!!stored.view;
  const adjacency = new Map(nodes.map(n=>[n.id,new Set()]));
  for(const l of graph.links){adjacency.get(l.source).add(l.target);adjacency.get(l.target).add(l.source);}
  const save = () => {
    savedGraph={view:width&&height?{...view}:stored.view,width:width||stored.width,height:height||stored.height,filters:{...filters},selected,stable,positions:nodes.filter(n=>Number.isFinite(n.x)).map(n=>[n.id,n.x,n.y,n.fx??null,n.fy??null])};
    try{sessionStorage.setItem('cart-pages-general-graph:'+location.pathname,JSON.stringify(savedGraph));}catch{/* Memory state stays available. */}
  };
  const requestDraw=()=>{dirty=true;if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(dirty)draw();});};
  function draw() {
    dirty=false;if(!width||!height)return;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,width,height);
    const focus=hovered || selected, neighbors=adjacency.get(focus), focusVisible=visibleIds.has(focus);
    ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
    for(const link of links){const a=byId.get(link.source),b=byId.get(link.target);if(!Number.isFinite(a.x)||!Number.isFinite(b.x))continue;
      const related=focusVisible&&(a.id===focus||b.id===focus);
      ctx.globalAlpha=focusVisible?(related?.9:.09):.35;ctx.strokeStyle=related?'#245d48':link.type==='tematico'?'#8a779b':'#9ca49a';
      ctx.lineWidth=(related?1.7:.8)/view.scale;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    const labels=[];
    for(const n of visible){if(!Number.isFinite(n.x))continue;const related=n.id===focus||neighbors?.has(n.id);
      ctx.globalAlpha=focusVisible?(related?1:.22):.85;ctx.fillStyle=graphColors[n.instance||n.type];
      const radius=(n.type==='document'?Math.max(3.4,1.4/view.scale):Math.max(8,3/view.scale))+(n.id===focus?2/view.scale:0);ctx.beginPath();ctx.arc(n.x,n.y,radius,0,2*Math.PI);ctx.fill();
      if(n.id===selected){ctx.strokeStyle='#202e26';ctx.lineWidth=2/view.scale;ctx.stroke();}
      if(n.id===focus || (related&&focusVisible) || (view.scale>1.3) || n.type!=='document') labels.push({n,priority:n.id===focus?0:related?1:n.type!=='document'?2:3});}
    ctx.restore();ctx.globalAlpha=1;ctx.font='11px Segoe UI, sans-serif';const boxes=[];
    labels.sort((a,b)=>a.priority-b.priority);
    for(const {n,priority} of labels){const x=n.x*view.scale+view.x+9,y=n.y*view.scale+view.y-7;if(x<0||x>width||y<0||y>height)continue;
      const label=n.label.length>65?n.label.slice(0,62)+'…':n.label,w=ctx.measureText(label).width;
      const box={x,y:y-11,w:w+7,h:16};if(priority>0&&boxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))continue;
      boxes.push(box);ctx.fillStyle='#fffefae8';ctx.fillRect(box.x-2,box.y,box.w,box.h);ctx.fillStyle='#303b35';ctx.fillText(label,x,y);}
    $('#graph-zoom').textContent=Math.round(view.scale*100)+'%';
    canvas.dataset.scale=String(view.scale);canvas.dataset.selected=selected||'';canvas.dataset.stable=String(stable);
  }
  function fit() {
    const points=visible.filter(n=>Number.isFinite(n.x));if(!width||!height||!points.length)return;
    const xs=points.map(n=>n.x),ys=points.map(n=>n.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    view.scale=Math.max(.06,Math.min(4,(width-55)/Math.max(100,maxX-minX),(height-65)/Math.max(100,maxY-minY)));
    view.x=width/2-(minX+maxX)/2*view.scale;view.y=height/2-(minY+maxY)/2*view.scale;requestDraw();
  }
  function refresh() {
    const q=fold(filters.q),numeric=q.replace(/[.\/-]/g,'');
    visible=nodes.filter(n=>(n.type!=='document'||(filters[n.instance]&&(filters.orphans||n.degree>0)))&&(!q||fold(n.label+' '+(n.process||'')+' '+n.id).includes(q)||(numeric&&fold(n.label+' '+(n.process||'')).replace(/[.\/-]/g,'').includes(numeric))));
    visibleIds=new Set(visible.map(n=>n.id));links=graph.links.filter(l=>visibleIds.has(l.source)&&visibleIds.has(l.target));
    $('#graph-count').textContent=`${fmt(visible.length)} de ${fmt(nodes.length)} nós · ${fmt(links.length)} vínculos`;
    requestDraw();save();
  }
  const point=e=>{const box=canvas.getBoundingClientRect();return{x:e.clientX-box.left,y:e.clientY-box.top};};
  const world=p=>({x:(p.x-view.x)/view.scale,y:(p.y-view.y)/view.scale});
  const hit=p=>{let found=null,best=12/view.scale;const w=world(p);for(const n of visible){const d=Math.hypot(n.x-w.x,n.y-w.y);if(d<best){found=n;best=d;}}return found;};
  function openNode(node){selected=node.id;save();navigate(node.type==='document'?stateUrl(state,{doc:node.id}):themePath(node.theme_id,node.subtheme_id));}
  function clearSelection(){selected=null;save();requestDraw();}
  function zoom(factor,p={x:width/2,y:height/2}){const next=Math.max(.06,Math.min(8,view.scale*factor)),ratio=next/view.scale;view.x=p.x-(p.x-view.x)*ratio;view.y=p.y-(p.y-view.y)*ratio;view.scale=next;moved=true;save();requestDraw();}
  $('#graph-search').value=filters.q;$('#graph-crt').checked=filters.CRT;$('#graph-jjt').checked=filters.JJT;$('#graph-orphans').checked=filters.orphans;
  $('#graph-search').oninput=e=>{filters.q=e.target.value;refresh();};
  for(const [id,key] of [['graph-crt','CRT'],['graph-jjt','JJT'],['graph-orphans','orphans']])$('#'+id).onchange=e=>{filters[key]=e.target.checked;refresh();};
  $('#graph-zoom-in').onclick=()=>zoom(1.25);$('#graph-zoom-out').onclick=()=>zoom(.8);$('#graph-fit').onclick=()=>{fit();moved=true;save();};
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12,point(e));},{passive:false});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=point(e),n=hit(p);drag={start:p,last:p,node:n,x:view.x,y:view.y,moved:false};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{const p=point(e);if(!drag){const n=hit(p);hovered=n?.id||null;canvas.title=n?n.label+(n.process?' · Processo '+n.process:''):'';requestDraw();return;}
    if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>5)drag.moved=true;
    if(drag.moved){moved=true;if(drag.node){const w=world(p);Object.assign(drag.node,{x:w.x,y:w.y,fx:w.x,fy:w.y});if(!worker)startWorker(.15);stable=false;worker.postMessage({type:'drag',id:drag.node.id,...w});}else{view.x=drag.x+p.x-drag.start.x;view.y=drag.y+p.y-drag.start.y;}requestDraw();}});
  const stop=e=>{if(!drag)return;const previous=drag;drag=null;canvas.classList.remove('dragging');if(e.type==='pointerup'&&!previous.moved){const n=hit(point(e));if(n)openNode(n);else clearSelection();}else save();};
  canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('pointerleave',()=>{hovered=null;requestDraw();});
  canvas.addEventListener('keydown',e=>{const delta={ArrowLeft:[45,0],ArrowRight:[-45,0],ArrowUp:[0,45],ArrowDown:[0,-45]}[e.key];if(delta){e.preventDefault();view.x+=delta[0];view.y+=delta[1];moved=true;save();requestDraw();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?.8:1.25);}else if(e.key==='Enter'&&selected&&visibleIds.has(selected))openNode(byId.get(selected));});
  const observer=new ResizeObserver(()=>{const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;const oldWidth=width,oldHeight=height;width=box.width;height=box.height;canvas.width=Math.round(width*devicePixelRatio);canvas.height=Math.round(height*devicePixelRatio);
    if(!initialized){initialized=true;if(!stored.view||!stored.width||!stored.height)fit();else{view.x+=(width-stored.width)/2;view.y+=(height-stored.height)/2;}}else{view.x+=(width-oldWidth)/2;view.y+=(height-oldHeight)/2;}save();requestDraw();});observer.observe(canvas);
  refresh();
  function startWorker(alpha=1){worker=new Worker(new URL('./graph-worker.js',document.baseURI));worker.onmessage=({data})=>{if(data.type!=='positions')return;for(const [id,x,y,fx,fy]of data.positions)Object.assign(byId.get(id),{x,y,fx,fy});stable=data.stable;if(!moved)fit();$('#graph-status').textContent=stable?'Distribuição estabilizada':'Calculando distribuição…';requestDraw();if(stable)save();};worker.onerror=()=>{$('#graph-status').textContent='Não foi possível calcular a distribuição. Recarregue a página.';};worker.postMessage({type:'init',nodes,alpha,links:graph.links.map(l=>({...l}))});}
  if(!stable)startWorker();
  else $('#graph-status').textContent='Distribuição estabilizada';
  graphController={destroy(){save();worker?.postMessage({type:'stop'});worker?.terminate();observer.disconnect();cancelAnimationFrame(frame);},save};
}
