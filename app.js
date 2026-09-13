"use strict";
const $=s=>document.querySelector(s),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const chart=$("#gameCanvas"),cx=chart.getContext("2d"),brainCanvas=$("#brainCanvas"),bx=brainCanvas.getContext("2d");
const ui={toggle:$("#toggleButton"),toggleLabel:$("#toggleLabel"),heroStart:$("#heroStartButton"),reset:$("#resetButton"),speed:$("#speedControl"),speedOut:$("#speedOutput"),guard:$("#learningToggle"),overlay:$("#arenaMessage"),status:$("#sessionStatus"),light:$("#statusLight"),price:$("#priceValue"),change:$("#priceChange"),source:$("#marketSource"),time:$("#timeValue"),exposure:$("#exposureValue"),cash:$("#cashValue"),position:$("#positionValue"),decision:$("#decisionValue"),reason:$("#decisionReason"),rate:$("#spikeRate"),datasetStats:$("#datasetStats"),memory:$("#memoryBadge"),equity:$("#equityValue"),return:$("#returnValue"),alpha:$("#alphaValue"),sharpe:$("#sharpeValue"),drawdown:$("#drawdownValue"),trades:$("#tradeValue"),hitRate:$("#hitRateValue"),verdict:$("#verdictText"),features:$("#featureTape"),export:$("#exportButton"),copy:$("#copyPostButton"),copyStatus:$("#copyStatus"),dialog:$("#helpDialog")};
const fmtUSD=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD",maximumFractionDigits:v>1000?0:2}).format(v);
const fmtPct=v=>`${v>=0?"+":""}${v.toFixed(2).replace(".",",")}%`;
let recentSpikes=0,displayedRate=0;

class ConnectomeNetwork{
  constructor(data){
    this.neurons=data.neurons;this.edges=data.edges;this.count=this.neurons.length;
    this.potential=new Float32Array(this.count);this.spiked=new Uint8Array(this.count);this.activity=new Float32Array(this.count);this.current=new Float32Array(this.count);this.plastic=new Float32Array(this.edges.length).fill(1);
    this.groups=new Map();this.outgoing=Array.from({length:this.count},()=>[]);
    this.neurons.forEach((n,i)=>{if(!this.groups.has(n.role))this.groups.set(n.role,[]);this.groups.get(n.role).push(i)});
    const incoming=new Uint16Array(this.count);this.edges.forEach(e=>incoming[e[1]]++);
    this.edges.forEach((e,edgeIndex)=>{const[from,to,syn]=e,sign=Math.sign(syn)||1,w=sign*Math.log1p(Math.abs(syn))/5*(1.8/Math.sqrt(Math.max(1,incoming[to])));this.outgoing[from].push({to,weight:w,edgeIndex})});
    this.restoreMemory();
  }
  mean(role,side=null){let sum=0,n=0;for(const i of this.groups.get(role)||[]){if(side&&this.neurons[i].side!==side)continue;sum+=this.activity[i];n++}return n?sum/n:0}
  stimulate(role,value,side=null){for(const i of this.groups.get(role)||[]){if(!side||this.neurons[i].side===side)this.current[i]+=value}}
  step(s){
    const prev=this.spiked.slice();this.spiked.fill(0);this.current.fill(0);
    for(let from=0;from<this.count;from++){if(!prev[from])continue;for(const e of this.outgoing[from])this.current[e.to]+=e.weight*this.plastic[e.edgeIndex]}
    this.stimulate("lc4",s[4]*.72+s[5]*.5);this.stimulate("lplc2",s[4]*.8+s[5]*.65);
    this.stimulate("dnp09",s[0]*.55+s[2]*.48+.04);this.stimulate("mdn",s[1]*.58+s[3]*.44);
    this.stimulate("dna01",s[0]*.48+s[2]*.3,"right");this.stimulate("dna02",s[1]*.48+s[3]*.3,"left");
    for(let i=0;i<this.count;i++){this.potential[i]=this.potential[i]*.9+this.current[i]+(Math.random()*.025-.008);if(this.potential[i]>=1){this.spiked[i]=1;this.potential[i]=0}this.activity[i]=Math.max(this.spiked[i],this.activity[i]*.86);if(this.spiked[i])recentSpikes++}
    return[this.mean("dna02","left"),this.mean("dnp09"),this.mean("dna01","right"),this.mean("gf"),this.mean("mdn")];
  }
  reward(amount){if(!ui.guard.checked)return;for(let i=0;i<this.edges.length;i++){const e=this.edges[i];if(this.activity[e[0]]>.35&&this.activity[e[1]]>.2)this.plastic[i]=clamp(this.plastic[i]+amount,.82,1.18)}}
  reset(){this.potential.fill(0);this.spiked.fill(0);this.activity.fill(0)}
  restoreMemory(){try{const m=JSON.parse(localStorage.getItem("mosca-quant-memory"));if(m?.weights?.length===this.plastic.length)this.plastic.set(m.weights);ui.memory.textContent=`MEM ${String(m?.runs||0).padStart(2,"0")}`}catch{}}
  saveMemory(){try{const old=JSON.parse(localStorage.getItem("mosca-quant-memory"))||{};const runs=(old.runs||0)+1;localStorage.setItem("mosca-quant-memory",JSON.stringify({runs,weights:Array.from(this.plastic,v=>+v.toFixed(4))}));ui.memory.textContent=`MEM ${String(runs).padStart(2,"0")}`}catch{}}
}

let brain=null,positions=[],brainBackdrop=null,candles=[],dataSource="COINBASE PUBLIC";
let running=false,speed=1,mode="connectome",cursor=30,endIndex=0,lastStep=0,lastRate=0;
let cash=10000,qty=0,avgCost=0,peak=10000,maxDD=0,initialPrice=0,lastEquity=10000,tradeCooldown=0;
let trades=[],telemetry=[],equityCurve=[],benchmarkCurve=[],returns=[],lastDecision="HOLD",lastFeatures={};

function fallbackCandles(){
  let seed=783,price=68240;const out=[];
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<230;i++){const open=price,cycle=Math.sin(i/13)*.0035,shock=(rnd()-.5)*.018;price=Math.max(20000,open*(1+cycle+shock));const span=open*(.002+rnd()*.009);out.push({time:Date.now()/1000-(230-i)*3600,open,close:price,high:Math.max(open,price)+span,low:Math.min(open,price)-span,volume:500+rnd()*1800})}return out;
}
async function loadExperiment(){
  ui.toggle.disabled=true;ui.status.textContent="Carregando conectoma e mercado";
  try{const r=await fetch("data/flywire-circuit.json");const data=await r.json();brain=new ConnectomeNetwork(data);buildBrain();ui.datasetStats.textContent=`${brain.count.toLocaleString("pt-BR")} neurônios · ${brain.edges.length.toLocaleString("pt-BR")} conexões`}catch(e){ui.status.textContent="Falha ao carregar o conectoma";return}
  try{
    const r=await fetch("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",{headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error();const raw=await r.json();
    candles=raw.map(x=>({time:+x[0],low:+x[1],high:+x[2],open:+x[3],close:+x[4],volume:+x[5]})).sort((a,b)=>a.time-b.time).slice(-230);
    if(candles.length<210)throw new Error();
  }catch{candles=fallbackCandles();dataSource="FALLBACK REPRODUZÍVEL";ui.source.textContent=dataSource}
  endIndex=Math.min(candles.length,210);cursor=endIndex-180;reset(true);ui.toggle.disabled=false;ui.status.textContent="Experimento pronto";render();
}
function stats(values){const mean=values.reduce((a,b)=>a+b,0)/(values.length||1),sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length||1));return{mean,sd}}
function getFeatures(i){
  const c=candles[i],prev=candles[i-1],r1=c.close/prev.close-1,m6=c.close/candles[Math.max(0,i-6)].close-1,m24=c.close/candles[Math.max(0,i-24)].close-1;
  const rs=[];for(let j=Math.max(1,i-12);j<=i;j++)rs.push(candles[j].close/candles[j-1].close-1);
  const vol=stats(rs).sd,window=candles.slice(Math.max(0,i-24),i+1),top=Math.max(...window.map(x=>x.close)),dd=c.close/top-1,vs=stats(window.map(x=>x.volume)),vz=(c.volume-vs.mean)/(vs.sd||1),range=(c.high-c.low)/c.open;
  const sensors=[clamp(Math.max(0,r1)*85,0,1),clamp(Math.max(0,-r1)*85,0,1),clamp(Math.max(0,m6)*24,0,1),clamp(Math.max(0,-m6)*24,0,1),clamp(vol*75+Math.max(0,vz)*.08,0,1),clamp(-dd*12+range*18,0,1)];
  return{r1,m6,m24,vol,dd,vz,range,sensors};
}
function neuralDecision(f){
  let sum=[0,0,0,0,0];for(let n=0;n<14;n++){const m=brain.step(f.sensors);m.forEach((v,i)=>sum[i]+=v)}
  const score=(sum[1]*.42+sum[2])-(sum[0]+sum[3]*.7+sum[4]*.8),confidence=Math.abs(score)/14;
  if(score>.055)return{action:"BUY",reason:`saída compradora ${confidence.toFixed(3)}`};
  if(score<-.055)return{action:"SELL",reason:`saída defensiva ${confidence.toFixed(3)}`};
  return{action:"HOLD",reason:`sinal abaixo do limiar ${confidence.toFixed(3)}`};
}
function chooseDecision(f){
  if(mode==="connectome")return neuralDecision(f);
  for(let n=0;n<6;n++)brain.step(f.sensors);
  if(mode==="momentum"){if(f.m6>.006)return{action:"BUY",reason:"momentum 6h positivo"};if(f.m6<-.006)return{action:"SELL",reason:"momentum 6h negativo"};return{action:"HOLD",reason:"momentum dentro da banda"}}
  const r=Math.random();return{action:r<.26?"BUY":r>.74?"SELL":"HOLD",reason:"controle estocástico"};
}
function execute(action,price,index){
  if(tradeCooldown>0){tradeCooldown--;return null}
  const equity=cash+qty*price,exposure=qty*price/equity;let value=0,pnl=null;
  if(action==="BUY"&&exposure<.68){value=Math.min(equity*.22,cash);if(value>25){const fee=value*.0015,bought=(value-fee)/price;qty+=bought;cash-=value;avgCost=qty?((avgCost*(qty-bought))+price*bought)/qty:price}}
  if(action==="SELL"&&qty>0){const sold=qty*.42;value=sold*price;const fee=value*.0015;pnl=(price-avgCost)*sold-fee;qty-=sold;cash+=value-fee;if(qty<1e-8){qty=0;avgCost=0}}
  if(value){const t={index,action,price,value,pnl};trades.push(t);tradeCooldown=2;return t}return null;
}
function calculateMetrics(price){
  const equity=cash+qty*price,ret=(equity/10000-1)*100,bench=3000+(7000/initialPrice)*price,benchRet=(bench/10000-1)*100;
  peak=Math.max(peak,equity);maxDD=Math.max(maxDD,(peak-equity)/peak*100);
  if(equityCurve.length){const prev=equityCurve.at(-1);returns.push(equity/prev-1)}equityCurve.push(equity);benchmarkCurve.push(bench);
  const s=stats(returns),sharpe=s.sd?s.mean/s.sd*Math.sqrt(Math.min(returns.length,180)):0;
  const closed=trades.filter(t=>t.pnl!==null),wins=closed.filter(t=>t.pnl>0).length;
  return{equity,ret,bench,benchRet,alpha:ret-benchRet,sharpe,hit:closed.length?wins/closed.length*100:0};
}

function advance(){
  if(!brain||cursor>=endIndex){finish();return}
  const c=candles[cursor],f=getFeatures(cursor),d=chooseDecision(f),previous=lastEquity;
  const trade=execute(d.action,c.close,cursor),m=calculateMetrics(c.close);lastEquity=m.equity;
  if(cursor>endIndex-179)brain.reward(m.equity>previous ? .003 : -.003);
  lastDecision=d.action;lastFeatures=f;
  telemetry.push({timestamp:new Date(c.time*1000).toISOString(),fonte:dataSource,estrategia:mode,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume,retorno_1h:f.r1,momentum_6h:f.m6,volatilidade_12h:f.vol,drawdown_24h:f.dd,decisao:d.action,executada:Boolean(trade),cash,equity:m.equity,retorno_pct:m.ret,benchmark_pct:m.benchRet,alpha_pp:m.alpha,spikes_hz:displayedRate});
  cursor++;updateUI(c,f,d,m);render();if(cursor>=endIndex)finish();
}
function updateUI(c,f,d,m){
  const prev=candles[Math.max(0,cursor-1)],change=(c.close/prev.close-1)*100,exposure=m.equity?qty*c.close/m.equity*100:0;
  ui.price.textContent=fmtUSD(c.close);ui.change.textContent=`${fmtPct(change)} neste candle`;ui.change.className=change>=0?"positive":"negative";
  ui.time.textContent=`${Math.min(180,cursor-(endIndex-180)+1)} / 180`;ui.exposure.textContent=`${exposure.toFixed(1).replace(".",",")}%`;ui.cash.textContent=fmtUSD(cash);ui.position.textContent=`${qty.toFixed(4).replace(".",",")} BTC`;
  ui.decision.textContent=d.action;ui.decision.className=d.action.toLowerCase();ui.reason.textContent=d.reason;
  ui.equity.textContent=fmtUSD(m.equity);ui.return.textContent=fmtPct(m.ret);ui.return.className=m.ret>=0?"positive":"negative";ui.alpha.textContent=`α ${fmtPct(m.alpha)} p.p.`;ui.sharpe.textContent=m.sharpe.toFixed(2).replace(".",",");ui.drawdown.textContent=`${maxDD.toFixed(2).replace(".",",")}%`;ui.trades.textContent=trades.length;ui.hitRate.textContent=`${Math.round(m.hit)}% positivos`;
  ui.verdict.textContent=m.alpha>=0?`À frente do buy & hold por ${m.alpha.toFixed(2).replace(".",",")} p.p.`:`Atrás do buy & hold por ${Math.abs(m.alpha).toFixed(2).replace(".",",")} p.p.`;
  const vals=[`RET ${f.r1>=0?"+":""}${f.r1.toFixed(3)}`,`MOM ${f.m6>=0?"+":""}${f.m6.toFixed(3)}`,`VOL ${f.vol.toFixed(3)}`,`VOLUME ${f.vz.toFixed(2)}σ`,`DD ${f.dd.toFixed(3)}`,`RANGE ${f.range.toFixed(3)}`];[...ui.features.children].forEach((el,i)=>el.textContent=vals[i]);
}
function reset(show=true){
  running=false;const start=endIndex-180;cursor=start;cash=10000;qty=0;avgCost=0;peak=10000;maxDD=0;initialPrice=candles[start]?.close||1;lastEquity=10000;tradeCooldown=0;trades=[];telemetry=[];equityCurve=[];benchmarkCurve=[];returns=[];lastDecision="HOLD";if(brain)brain.reset();
  ui.toggleLabel.textContent="Executar";ui.status.textContent="Experimento pronto";ui.light.classList.remove("live");ui.price.textContent=candles[start]?fmtUSD(candles[start].close):"—";ui.change.textContent="aguardando replay";ui.time.textContent="0 / 180";ui.exposure.textContent="0%";ui.cash.textContent=fmtUSD(10000);ui.position.textContent="0,0000 BTC";ui.decision.textContent="HOLD";ui.reason.textContent="Aguardando o primeiro candle";ui.equity.textContent=fmtUSD(10000);ui.return.textContent="0,00%";ui.alpha.textContent="α 0,00 p.p.";ui.sharpe.textContent="0,00";ui.drawdown.textContent="0,00%";ui.trades.textContent="0";ui.hitRate.textContent="0% positivos";ui.verdict.textContent="Execute os 180 candles para comparar com buy & hold.";ui.overlay.classList.toggle("hidden",!show);render();
}
function setRunning(next){if(!brain||!candles.length)return;running=next;ui.toggleLabel.textContent=running?"Pausar":"Executar";ui.status.textContent=running?`${mode==="connectome"?"Conectoma":mode} processando candles`:"Replay pausado";ui.light.classList.toggle("live",running);if(running)ui.overlay.classList.add("hidden")}
function finish(){if(!running&&cursor<endIndex)return;running=false;ui.toggleLabel.textContent="Executar";ui.light.classList.remove("live");ui.status.textContent="Replay concluído";const alpha=equityCurve.length?(equityCurve.at(-1)-benchmarkCurve.at(-1))/100:0;ui.verdict.textContent=alpha>=0?`Conectoma venceu o benchmark por ${alpha.toFixed(2).replace(".",",")} p.p.`:`Benchmark venceu por ${Math.abs(alpha).toFixed(2).replace(".",",")} p.p.`;if(mode==="connectome"&&brain)brain.saveMemory()}

function drawMarket(){
  cx.clearRect(0,0,chart.width,chart.height);cx.fillStyle="#0b0e0c";cx.fillRect(0,0,chart.width,chart.height);
  cx.strokeStyle="rgba(150,170,155,.07)";cx.lineWidth=1;for(let y=55;y<560;y+=84){cx.beginPath();cx.moveTo(45,y);cx.lineTo(1065,y);cx.stroke()}
  if(!candles.length)return;const right=Math.max(endIndex-180,Math.min(cursor,endIndex-1)),left=Math.max(0,right-69),view=candles.slice(left,right+1),lo=Math.min(...view.map(c=>c.low)),hi=Math.max(...view.map(c=>c.high)),pad=(hi-lo)*.1||1,yOf=p=>55+(hi+pad-p)/(hi-lo+pad*2)*420,xStep=1010/70;
  view.forEach((c,k)=>{const x=48+k*xStep,up=c.close>=c.open,color=up?"#b7e36b":"#e57e70";cx.strokeStyle=color;cx.fillStyle=color;cx.beginPath();cx.moveTo(x,yOf(c.high));cx.lineTo(x,yOf(c.low));cx.stroke();const top=Math.min(yOf(c.open),yOf(c.close)),h=Math.max(2,Math.abs(yOf(c.open)-yOf(c.close)));cx.globalAlpha=.72;cx.fillRect(x-3,top,6,h);cx.globalAlpha=1});
  for(const t of trades.filter(t=>t.index>=left&&t.index<=right)){const x=48+(t.index-left)*xStep,y=yOf(t.price);cx.fillStyle=t.action==="BUY"?"#b7e36b":"#e57e70";cx.beginPath();cx.arc(x,y,t.action==="BUY"?5:4,0,Math.PI*2);cx.fill();cx.font="8px Cascadia Mono";cx.fillText(t.action==="BUY"?"B":"S",x+7,y+3)}
  if(equityCurve.length){const values=[...equityCurve,...benchmarkCurve],min=Math.min(...values),max=Math.max(...values),start=Math.max(0,equityCurve.length-70),drawLine=(arr,color)=>{cx.strokeStyle=color;cx.lineWidth=1.5;cx.beginPath();arr.slice(start).forEach((v,i)=>{const x=48+i*xStep,y=535-(v-min)/(max-min||1)*45;i?cx.lineTo(x,y):cx.moveTo(x,y)});cx.stroke()};drawLine(benchmarkCurve,"rgba(143,155,145,.55)");drawLine(equityCurve,"#b7e36b")}
}

function buildBrain(){
  const xs=brain.neurons.map(n=>n.pos[0]),ys=brain.neurons.map(n=>n.pos[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  positions=brain.neurons.map(n=>({x:24+(n.pos[0]-minX)/(maxX-minX||1)*472,y:20+(n.pos[1]-minY)/(maxY-minY||1)*266}));
  brainBackdrop=document.createElement("canvas");brainBackdrop.width=520;brainBackdrop.height=310;
  const g=brainBackdrop.getContext("2d");g.fillStyle="#0b0e0c";g.fillRect(0,0,520,310);g.lineWidth=.35;
  for(const [from,to,syn] of brain.edges){const a=clamp(.01+Math.log1p(Math.abs(syn))*.008,.01,.06);g.strokeStyle=syn>=0?`rgba(183,227,107,${a})`:`rgba(229,126,112,${a})`;g.beginPath();g.moveTo(positions[from].x,positions[from].y);g.lineTo(positions[to].x,positions[to].y);g.stroke()}
}
function drawBrain(){
  if(!brain||!brainBackdrop){bx.fillStyle="#0b0e0c";bx.fillRect(0,0,520,310);return}
  bx.drawImage(brainBackdrop,0,0);positions.forEach((p,i)=>{const a=brain.activity[i],role=brain.neurons[i].role,motor=["dna01","dna02","dnp09","gf","mdn"].includes(role);bx.shadowColor="rgba(183,227,107,.9)";bx.shadowBlur=a*11;bx.fillStyle=a>.35?"#d8ff97":motor?"#658060":"#29342c";bx.beginPath();bx.arc(p.x,p.y,motor?2.7:1.35,0,Math.PI*2);bx.fill();bx.shadowBlur=0});
  bx.fillStyle="#8f9b91";bx.font="8px Cascadia Mono";bx.fillText("SENSORY",12,300);bx.fillText("FAFB v783",230,300);bx.fillText("DESCENDING",445,300);
}
function render(){drawMarket();drawBrain()}
function frame(now){
  if(running&&now-lastStep>620/speed){lastStep=now;advance()}
  if(now-lastRate>500){displayedRate=recentSpikes*2;recentSpikes=0;lastRate=now;ui.rate.textContent=displayedRate}
  if(brain&&!running)brain.activity.forEach((v,i)=>brain.activity[i]=v*.96);
  drawBrain();requestAnimationFrame(frame);
}

function exportCSV(){
  if(!telemetry.length){ui.copyStatus.textContent="Execute alguns candles primeiro";return}
  const cols=Object.keys(telemetry[0]),esc=v=>`"${String(v).replaceAll('"','""')}"`,csv=[cols.join(","),...telemetry.map(row=>cols.map(k=>esc(row[k])).join(","))].join("\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`mosca-quant-${mode}-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);ui.copyStatus.textContent=`${telemetry.length} candles exportados`;
}
async function copyResult(){
  const m=equityCurve.length?calculateSnapshot():{ret:0,alpha:0,sharpe:0};
  const text=`Coloquei 668 neurônios reais de uma mosca diante do Bitcoin.\n\nO MOSCA.QUANT transforma candles públicos de BTC-USD em seis sinais sensoriais, propaga esses sinais por 18.968 conexões do FlyWire e converte a atividade neural em BUY, HOLD ou SELL — tudo em paper trading auditável.\n\nResultado (${mode}):\n• retorno: ${fmtPct(m.ret)}\n• alpha vs. buy & hold: ${fmtPct(m.alpha)} p.p.\n• Sharpe: ${m.sharpe.toFixed(2)}\n• max drawdown: ${maxDD.toFixed(2)}%\n• ${trades.length} trades\n\nNão é estratégia financeira nem evidência de aprendizagem lucrativa. É um experimento de Data Science sobre redes, séries temporais, benchmarking e explicabilidade.\n\nhttps://github.com/Matheussantos25/mosca-lab-connectome-game\n\n#DataScience #DataAnalytics #Neuroscience #Bitcoin #OpenScience`;
  try{await navigator.clipboard.writeText(text);ui.copyStatus.textContent="Resultado copiado"}catch{ui.copyStatus.textContent="Não foi possível copiar"}
}
function calculateSnapshot(){
  const equity=equityCurve.at(-1)||10000,bench=benchmarkCurve.at(-1)||10000,ret=(equity/10000-1)*100,alpha=(equity-bench)/100,s=stats(returns),sharpe=s.sd?s.mean/s.sd*Math.sqrt(Math.min(returns.length,180)):0;return{ret,alpha,sharpe};
}
ui.toggle.addEventListener("click",()=>setRunning(!running));ui.heroStart.addEventListener("click",()=>setRunning(true));ui.reset.addEventListener("click",()=>reset(true));
ui.speed.addEventListener("input",e=>{speed=+e.target.value;ui.speedOut.textContent=`${speed.toFixed(1).replace(".0","").replace(".",",")}x`});
document.querySelectorAll('input[name="controllerMode"]').forEach(input=>input.addEventListener("change",e=>{mode=e.target.value;reset(true)}));
ui.export.addEventListener("click",exportCSV);ui.copy.addEventListener("click",copyResult);
$("#aboutButton").addEventListener("click",()=>ui.dialog.showModal());$("#closeHelp").addEventListener("click",()=>ui.dialog.close());$("#understoodButton").addEventListener("click",()=>ui.dialog.close());
ui.dialog.addEventListener("click",e=>{if(e.target===ui.dialog)ui.dialog.close()});
loadExperiment();render();requestAnimationFrame(frame);
