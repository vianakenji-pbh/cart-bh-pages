'use strict';
importScripts('./vendor/d3-7.9.0.min.js');
let simulation, nodes = [], timer, steps = 0;
function publish(stable = false) {
  postMessage({type:'positions', stable, positions:nodes.map(n => [n.id,n.x,n.y,n.fx ?? null,n.fy ?? null])});
}
function run() {
  clearTimeout(timer);
  for (let i=0;i<6;i++) simulation.tick();
  steps += 6;
  const stable = simulation.alpha() < simulation.alphaMin() || steps > 420;
  publish(stable);
  if (!stable) timer = setTimeout(run,16);
}
onmessage = ({data}) => {
  if (data.type === 'init') {
    clearTimeout(timer); simulation?.stop(); nodes = data.nodes; steps=0;
    simulation = d3.forceSimulation(nodes).stop().alpha(data.alpha ?? 1)
      .force('links',d3.forceLink(data.links).id(n=>n.id).distance(l=>l.type==='tematico'?65:35).strength(.65))
      .force('charge',d3.forceManyBody().strength(n=>n.type==='document'?-18:-160).theta(.9))
      .force('collide',d3.forceCollide().radius(n=>n.type==='document'?6:18).iterations(1))
      .force('x',d3.forceX().strength(.012)).force('y',d3.forceY().strength(.012));
    publish(); run();
  } else if (data.type === 'drag') {
    const node = nodes.find(n=>n.id===data.id);
    if (node) {node.fx=data.x;node.fy=data.y;node.x=data.x;node.y=data.y;simulation.alpha(.15);steps=0;run();}
  } else if (data.type === 'stop') {
    clearTimeout(timer);simulation?.stop();
  }
};
