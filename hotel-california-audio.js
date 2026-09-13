(()=>{
'use strict';
const css=document.createElement('style');
css.textContent='.note .deg{color:#555!important}.note.ok .deg{color:#fff!important}.note.now .deg{color:#54b8ff!important;transform:scale(1.18)}.audioPanel{display:grid;gap:8px}.audioPanel select{width:100%;background:#181818;color:#fff;border:1px solid #444;border-radius:10px;min-height:44px;padding:8px}.meterA{height:9px;background:#222;border-radius:9px;overflow:hidden}.meterA div{height:100%;width:0;background:#aaa}.detectA{text-align:center;font-size:18px}.statusA{text-align:center;color:#aaa;font-size:13px}';
document.head.appendChild(css);
const panel=document.createElement('div');
panel.className='panel audioPanel';
panel.innerHTML='<button id="hcInput" class="btn">ギター入力 ON</button><select id="hcDevice" disabled><option>入力ON後に取得</option></select><div class="statusA">入力：<b id="hcActive">—</b></div><div class="meterA"><div id="hcLevel"></div></div><div class="detectA">検出：<b id="hcDetected">—</b>　次：<b id="hcTarget">—</b></div><div id="hcStatus" class="statusA">入力待ち</div>';
document.querySelectorAll('.panel')[1].after(panel);
const $=id=>document.getElementById(id),names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
let stream=null,ctx=null,an=null,buf=null,running=false,answer=0,seq=[],candidate=null,candidateAt=0,armed=true,silent=0;
function rebuild(){
 const a=DATA[page*2],b=DATA[page*2+1];
 seq=[...(a?.notes||[]).map(n=>({...n,ch:a.chord})),...(b?.notes||[]).map(n=>({...n,ch:b.chord}))];
 answer=0;candidate=null;armed=true;
 update();
}
function update(){
 const nodes=[...document.querySelectorAll('.note')];
 nodes.forEach((n,i)=>{n.classList.toggle('ok',i<answer);n.classList.toggle('now',i===answer)});
 $('hcTarget').textContent=seq[answer]?label(seq[answer],seq[answer].ch):'完了';
}
function accept(pc){
 if(!seq[answer]||!armed)return;
 const now=performance.now();
 if(candidate!==pc){candidate=pc;candidateAt=now;return}
 if(now-candidateAt<85)return;
 if(pc===seq[answer].pc){
  answer++;armed=false;candidate=null;$('hcStatus').textContent='✓ OK';update();
  if(answer>=seq.length){
   if((page+1)*2<DATA.length)setTimeout(()=>{page++;draw();rebuild()},140);
   else $('hcStatus').textContent='✓ Solo 完了！';
  }
 }else $('hcStatus').textContent='別音：'+names[pc];
}
function yin(x,sr){
 const n=x.length,min=Math.floor(sr/700),max=Math.min(Math.floor(sr/70),n/2),dif=new Float32Array(max+1),cm=new Float32Array(max+1);
 for(let t=1;t<=max;t++){let z=0;for(let i=0;i<n-t;i++){let d=x[i]-x[i+t];z+=d*d}dif[t]=z}
 let run=0;cm[0]=1;for(let t=1;t<=max;t++){run+=dif[t];cm[t]=run?dif[t]*t/run:1}
 let tau=0;for(let t=min;t<max;t++)if(cm[t]<.18){while(t+1<=max&&cm[t+1]<cm[t])t++;tau=t;break}
 if(!tau){let best=1;for(let t=min;t<=max;t++)if(cm[t]<best){best=cm[t];tau=t}}
 if(!tau||cm[tau]>.65)return null;
 return{hz:sr/tau,clarity:1-cm[tau]};
}
function loop(){
 if(!running||!an)return;
 an.getFloatTimeDomainData(buf);
 let rms=Math.sqrt(buf.reduce((z,v)=>z+v*v,0)/buf.length);
 $('hcLevel').style.width=Math.min(100,rms*15000)+'%';
 if(rms<.00010){if(++silent>3){armed=true;candidate=null;$('hcStatus').textContent='入力待ち'}requestAnimationFrame(loop);return}
 silent=0;
 const win=rms>=.00025?4096:8192,x=buf.slice(buf.length-win),p=yin(x,ctx.sampleRate);
 if(p&&p.clarity>=.30){let midi=Math.round(69+12*Math.log2(p.hz/440)),pc=(midi%12+12)%12;$('hcDetected').textContent=names[pc]+(Math.floor(midi/12)-1);if(!armed&&pc!==seq[Math.max(0,answer-1)]?.pc){armed=true;candidate=null}accept(pc)}
 requestAnimationFrame(loop);
}
async function list(selected){
 const ins=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
 $('hcDevice').innerHTML='';ins.forEach((d,i)=>$('hcDevice').add(new Option(d.label||'入力 '+(i+1),d.deviceId)));
 $('hcDevice').disabled=!ins.length;if(selected&&ins.some(d=>d.deviceId===selected))$('hcDevice').value=selected;
}
async function openInput(id=''){
 running=false;an=null;if(stream)stream.getTracks().forEach(t=>t.stop());
 let audio={echoCancellation:false,noiseSuppression:false,autoGainControl:false};if(id)audio.deviceId={exact:id};
 stream=await navigator.mediaDevices.getUserMedia({audio});
 const tr=stream.getAudioTracks()[0],settings=tr.getSettings?tr.getSettings():{};
 if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();
 const src=ctx.createMediaStreamSource(stream);an=ctx.createAnalyser();an.fftSize=16384;src.connect(an);buf=new Float32Array(an.fftSize);
 $('hcActive').textContent=tr.label||'Audio Input';$('hcInput').textContent='ギター入力 OFF';running=true;await list(settings.deviceId||id||'');loop();
}
$('hcInput').onclick=async()=>{if(running){running=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;an=null;$('hcInput').textContent='ギター入力 ON';$('hcActive').textContent='—'}else try{await openInput()}catch(e){$('hcStatus').textContent='入力エラー：'+e.message}};
$('hcDevice').onchange=()=>openInput($('hcDevice').value).catch(e=>$('hcStatus').textContent='入力エラー：'+e.message);
['prev','next','chordMode','bMode'].forEach(id=>$(id).addEventListener('click',()=>setTimeout(rebuild,0)));
rebuild();
})();
