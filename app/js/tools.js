'use strict';
/* ============================================================
   方块世界 - Minecraft 风格体素游戏 (单文件, Three.js r149)
   ============================================================ */

// ---------------- 工具函数 ----------------
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
let SEED=1337; // 世界种子：每次开新世界随机变化，存档会记住
function hash2(x,z){let h=Math.imul(x,374761393)^Math.imul(z,668265263)^SEED;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function hash3(x,y,z){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,987643211)^SEED;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function smooth(t){return t*t*(3-2*t);}
function vnoise(x,z){
  const xi=Math.floor(x),zi=Math.floor(z);
  const xf=x-xi,zf=z-zi;
  const a=hash2(xi,zi),b=hash2(xi+1,zi),c=hash2(xi,zi+1),d=hash2(xi+1,zi+1);
  const u=smooth(xf),v=smooth(zf);
  return lerp(lerp(a,b,u),lerp(c,d,u),v);
}
function fbm(x,z,oct){
  let s=0,amp=0.5,f=1,tot=0;
  for(let i=0;i<oct;i++){s+=vnoise(x*f,z*f)*amp;tot+=amp;amp*=0.5;f*=2;}
  return s/tot;
}

// ---------------- 音效 (WebAudio 合成) ----------------
let AC=null;
function ac(){
  if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}
  if(AC&&AC.state==='suspended')AC.resume();
  return AC;
}
function tone(freq,dur,type,vol,slideTo,delay){
  const c=ac();if(!c)return;
  dur=dur||0.1;type=type||'square';vol=vol||0.15;delay=delay||0;
  const t0=c.currentTime+delay;
  const o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t0);
  if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),t0+dur);
  g.gain.setValueAtTime(vol,t0);
  g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
  o.connect(g).connect(c.destination);
  o.start(t0);o.stop(t0+dur+0.02);
}
function noiseBurst(dur,cutoff,vol,delay){
  const c=ac();if(!c)return;
  dur=dur||0.12;cutoff=cutoff||1000;vol=vol||0.25;delay=delay||0;
  const t0=c.currentTime+delay;
  const len=Math.max(1,Math.floor(c.sampleRate*dur));
  const buf=c.createBuffer(1,len,c.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  const src=c.createBufferSource();src.buffer=buf;
  const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=cutoff;
  const g=c.createGain();g.gain.setValueAtTime(vol,t0);
  g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}
const sfx={
  digTick(kind){const cf=kind==='stone'?1400:kind==='wood'?700:500;noiseBurst(0.045,cf,0.12);},
  breakBlock(kind){
    if(kind==='glass'){noiseBurst(0.2,4000,0.3);tone(1800,0.12,'triangle',0.12,2400);}
    else if(kind==='wood'){noiseBurst(0.16,600,0.3);tone(160,0.12,'triangle',0.2,80);}
    else if(kind==='stone'){noiseBurst(0.18,1200,0.32);tone(220,0.08,'square',0.08,120);}
    else{noiseBurst(0.16,700,0.28);}
  },
  place(kind){if(kind==='wood')tone(200,0.07,'triangle',0.2,140);else noiseBurst(0.06,kind==='stone'?1500:900,0.2);},
  pickup(){tone(500,0.07,'sine',0.18,900);},
  craft(){tone(440,0.09,'triangle',0.2);tone(660,0.12,'triangle',0.2,0,0.08);},
  hurt(){tone(220,0.2,'sawtooth',0.25,90);},
  equip(){tone(700,0.05,'square',0.14);tone(940,0.09,'square',0.14,0,0.05);},
  smelt(){tone(320,0.08,'triangle',0.12,480);},
  hit(){noiseBurst(0.06,1800,0.2);tone(300,0.06,'square',0.12,200);},
  mobDie(){tone(300,0.25,'sawtooth',0.15,60);},
  splash(){noiseBurst(0.25,900,0.2);},
  select(){tone(600,0.03,'square',0.06);},
  gun(){noiseBurst(0.09,800,0.3);tone(150,0.08,'square',0.2,70);}, // 枪声
  reload(){tone(520,0.06,'square',0.1);tone(360,0.09,'square',0.1,0,0.07);},
  throwNade(){tone(700,0.05,'sine',0.12);tone(500,0.08,'sine',0.12,0,0.06);},
  boom(){noiseBurst(0.4,300,0.5);tone(80,0.35,'sawtooth',0.4,40);tone(45,0.5,'sine',0.3,30);}
};

// ---------------- 程序化纹理 ----------------
const TILE=16, ATLAS_N=16;
const tileCanvases=[];   // tileIdx -> canvas 16x16
const tileColors=[];     // tileIdx -> 主色 css
let atlasCanvas=null, atlasTex=null;

function makeTile(painter){
  const cv=document.createElement('canvas');cv.width=TILE;cv.height=TILE;
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,TILE,TILE);
  painter(ctx);
  // 平均色
  let r=0,g=0,b=0,n=0;
  try{
    const d=ctx.getImageData(0,0,TILE,TILE).data;
    for(let i=0;i<d.length;i+=4){if(d[i+3]>10){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}}
  }catch(e){}
  if(n===0){r=255;g=0;b=255;}
  tileCanvases.push(cv);
  tileColors.push('rgb('+Math.round(r/n)+','+Math.round(g/n)+','+Math.round(b/n)+')');
  return tileCanvases.length-1;
}
function px(ctx,x,y,c){ctx.fillStyle=c;ctx.fillRect(x,y,1,1);}
function fillAll(ctx,c){ctx.fillStyle=c;ctx.fillRect(0,0,TILE,TILE);}
function speckle(ctx,colors,count,seed){
  for(let i=0;i<count;i++){
    const x=Math.floor(hash2(i+seed*77,seed*13+i)*16);
    const y=Math.floor(hash2(seed*31+i,i+seed*57)*16);
    px(ctx,x,y,colors[i%colors.length]);
  }
}
function shade(c,f){ // c: [r,g,b]
  return 'rgb('+clamp(Math.round(c[0]*f),0,255)+','+clamp(Math.round(c[1]*f),0,255)+','+clamp(Math.round(c[2]*f),0,255)+')';
}
function noisyBase(ctx,base,spread,seed){
  fillAll(ctx,shade(base,1));
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const h=hash2(x+seed*131,y+seed*269);
    px(ctx,x,y,shade(base,1+(h-0.5)*spread));
  }
}
const T={}; // 纹理索引表

function buildTiles(){
  const grassG=[68,132,48], dirtB=[121,85,58], stoneG=[125,125,125];
  T.grassTop=makeTile(ctx=>{
    noisyBase(ctx,grassG,0.35,1);
    speckle(ctx,[shade(grassG,1.3),shade(grassG,0.75)],26,2);
  });
  T.dirt=makeTile(ctx=>{
    noisyBase(ctx,dirtB,0.4,3);
    speckle(ctx,[shade(dirtB,1.35),shade(dirtB,0.6)],22,4);
  });
  T.grassSide=makeTile(ctx=>{
    noisyBase(ctx,dirtB,0.4,3);
    for(let x=0;x<16;x++){
      const dep=2+Math.floor(hash2(x,91)*3);
      for(let y=0;y<=dep;y++)px(ctx,x,y,shade(grassG,0.85+hash2(x,y)*0.4));
    }
    speckle(ctx,[shade(dirtB,1.3),shade(dirtB,0.6)],16,5);
  });
  T.stone=makeTile(ctx=>{noisyBase(ctx,stoneG,0.22,6);speckle(ctx,[shade(stoneG,1.2),shade(stoneG,0.8)],18,7);});
  T.cobble=makeTile(ctx=>{
    fillAll(ctx,'#5a5a5a');
    const cells=[[0,0,5,4],[5,0,6,5],[11,0,5,4],[0,4,6,6],[6,5,5,5],[11,4,5,6],[0,10,5,6],[5,10,6,6],[11,10,5,6]];
    for(const c of cells){
      const f=0.75+hash2(c[0]*7,c[1]*13)*0.5;
      ctx.fillStyle=shade(stoneG,f);
      ctx.fillRect(c[0]+1,c[1]+1,c[2]-1,c[3]-1);
    }
  });
  T.logSide=makeTile(ctx=>{
    for(let x=0;x<16;x++){
      const f=0.7+hash2(x,17)*0.5;
      for(let y=0;y<16;y++)px(ctx,x,y,shade([88,66,40],f+(hash2(x,y+5)-0.5)*0.15));
    }
    for(let i=0;i<4;i++){const x=Math.floor(hash2(i,44)*16);ctx.fillStyle=shade([60,44,26],1);ctx.fillRect(x,0,1,16);}
  });
  T.logTop=makeTile(ctx=>{
    noisyBase(ctx,[150,116,70],0.15,8);
    ctx.strokeStyle=shade([96,72,42],1);
    for(let r=2;r<8;r+=2){ctx.strokeRect(8-r,8-r,r*2,r*2);}
  });
  T.planks=makeTile(ctx=>{
    noisyBase(ctx,[164,128,78],0.2,9);
    ctx.fillStyle=shade([110,82,48],1);
    for(let y=3;y<16;y+=4)ctx.fillRect(0,y,16,1);
    ctx.fillRect(7,0,1,4);ctx.fillRect(12,4,1,4);ctx.fillRect(3,8,1,4);ctx.fillRect(9,12,1,4);
  });
  T.leaves=makeTile(ctx=>{
    noisyBase(ctx,[52,120,44],0.5,10);
    speckle(ctx,[shade([52,120,44],1.5),shade([52,120,44],0.5)],40,11);
  });
  // 各种树皮（通用画法：竖纹+裂纹）
  function barkTile(base,seed){
    return makeTile(ctx=>{
      for(let x=0;x<16;x++){
        const f=0.7+hash2(x,seed)*0.5;
        for(let y=0;y<16;y++)px(ctx,x,y,shade(base,f+(hash2(x,y+5)-0.5)*0.15));
      }
      for(let i=0;i<4;i++){const x=Math.floor(hash2(i,seed+1)*16);ctx.fillStyle=shade(base,0.55);ctx.fillRect(x,0,1,16);}
    });
  }
  function leafTile(base,seed){
    return makeTile(ctx=>{
      noisyBase(ctx,base,0.5,seed);
      speckle(ctx,[shade(base,1.5),shade(base,0.5)],40,seed+1);
    });
  }
  T.spruceSide=barkTile([58,40,26],50);   // 云杉：深棕
  T.spruceLeaves=leafTile([34,78,38],52);  // 云杉叶：墨绿
  T.jungleSide=barkTile([120,92,52],54);   // 丛林木：浅棕
  T.acaciaSide=barkTile([105,100,95],56);  // 金合欢：灰皮
  T.darkSide=barkTile([52,34,22],58);      // 深色橡木：近黑
  T.darkLeaves=leafTile([30,66,30],60);    // 深色树叶
  T.cherrySide=barkTile([90,62,54],62);    // 樱花木：红棕
  T.cherryLeaves=leafTile([222,136,166],64); // 樱花叶：粉红（略压亮度）
  T.sand=makeTile(ctx=>{noisyBase(ctx,[170,150,102],0.18,12);speckle(ctx,['#b5a476','#93835a'],24,13);});
  T.glass=makeTile(ctx=>{
    ctx.fillStyle='#dff4ff';
    ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);ctx.fillRect(0,0,1,16);ctx.fillRect(15,0,1,16);
    px(ctx,3,3,'#ffffff');px(ctx,4,4,'#ffffff');px(ctx,5,5,'#cfe9f5');
    px(ctx,10,9,'#ffffff');px(ctx,11,10,'#ffffff');px(ctx,12,11,'#cfe9f5');
  });
  T.water=makeTile(ctx=>{
    noisyBase(ctx,[52,105,215],0.2,14);
    for(let i=0;i<5;i++){const y=Math.floor(hash2(i,77)*16);ctx.fillStyle='rgba(140,180,255,0.7)';ctx.fillRect(Math.floor(hash2(i,55)*12),y,4,1);}
  });
  T.tableTop=makeTile(ctx=>{
    noisyBase(ctx,[164,128,78],0.2,9);
    ctx.fillStyle=shade([110,82,48],1);
    ctx.strokeStyle=shade([96,72,42],1);ctx.strokeRect(2.5,2.5,11,11);
    ctx.fillRect(7,2,1,12);ctx.fillRect(2,7,12,1);
  });
  T.tableSide=makeTile(ctx=>{
    noisyBase(ctx,[164,128,78],0.2,9);
    ctx.fillStyle=shade([110,82,48],1);ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);
    ctx.fillStyle=shade([120,94,56],1);ctx.fillRect(3,4,10,8);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(4,5,3,3);ctx.fillRect(9,5,3,3);ctx.fillRect(6,9,4,2);
  });
  T.furnaceSide=makeTile(ctx=>{
    noisyBase(ctx,[110,110,110],0.25,15);
    ctx.fillStyle='#4a4a4a';ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);
  });
  T.furnaceTop=makeTile(ctx=>{
    noisyBase(ctx,[110,110,110],0.25,16);
    ctx.fillStyle='#4a4a4a';ctx.strokeStyle='#4a4a4a';ctx.strokeRect(3.5,3.5,9,9);
  });
  T.furnaceFront=makeTile(ctx=>{
    noisyBase(ctx,[110,110,110],0.25,15);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(4,5,8,7);
    ctx.fillStyle='#5a5a5a';ctx.fillRect(4,5,8,1);
    ctx.fillStyle='#3a3a3a';ctx.fillRect(0,0,16,2);ctx.fillRect(0,14,16,2);
  });
  function oreTile(blobColor,seed){
    return makeTile(ctx=>{
      noisyBase(ctx,stoneG,0.22,6);
      const blobs=[[3,3],[10,4],[5,10],[11,11],[8,7]];
      for(const b of blobs){
        ctx.fillStyle=blobColor;
        ctx.fillRect(b[0],b[1],2,2);
        px(ctx,b[0],b[1],shade([255,255,255],1));
        ctx.fillStyle=blobColor;px(ctx,b[0],b[1],blobColor);
      }
      speckle(ctx,[blobColor],5,seed);
    });
  }
  T.coalOre=oreTile('#2b2b2b',21);
  T.ironOre=oreTile('#d8af93',22);
  T.goldOre=oreTile('#fce44b',23);
  T.diamondOre=oreTile('#5ff2e8',24);
  T.redstoneOre=oreTile('#e03030',25);
  // 活塞：侧面木框+铁箍，正面推杆口
  T.pistonSide=makeTile(ctx=>{
    noisyBase(ctx,[164,128,78],0.25,33);
    speckle(ctx,[shade([164,128,78],1.2),shade([164,128,78],0.75)],14,34);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(0,0,16,2);ctx.fillRect(0,14,16,2);
    ctx.fillStyle='#6a6a6a';ctx.fillRect(0,2,16,1);ctx.fillRect(0,13,16,1);
  });
  T.pistonFront=makeTile(ctx=>{
    noisyBase(ctx,[164,128,78],0.25,35);
    ctx.fillStyle='#4a4a4a';ctx.fillRect(0,0,16,2);ctx.fillRect(0,14,16,2);ctx.fillRect(0,0,2,16);ctx.fillRect(14,0,2,16);
    ctx.fillStyle='#5a4a30';ctx.fillRect(4,4,8,8);
    ctx.fillStyle='#9a9a9a';ctx.fillRect(5,5,6,6);
    ctx.fillStyle='#7a7a7a';ctx.fillRect(6,6,4,4);
  });
  T.stickyFront=makeTile(ctx=>{
    noisyBase(ctx,[164,128,78],0.25,36);
    ctx.fillStyle='#4a4a4a';ctx.fillRect(0,0,16,2);ctx.fillRect(0,14,16,2);ctx.fillRect(0,0,2,16);ctx.fillRect(14,0,2,16);
    ctx.fillStyle='#5a4a30';ctx.fillRect(4,4,8,8);
    ctx.fillStyle='#9a9a9a';ctx.fillRect(5,5,6,6);
    // 绿色黏液
    ctx.fillStyle='#5aaa3a';
    ctx.fillRect(5,5,6,2);ctx.fillRect(4,6,1,4);ctx.fillRect(11,6,1,3);ctx.fillRect(6,10,3,1);
    ctx.fillStyle='#7acc5a';ctx.fillRect(6,5,2,1);ctx.fillRect(9,6,1,1);
  });
  T.wool=makeTile(ctx=>{
    noisyBase(ctx,[212,212,208],0.12,37);
    speckle(ctx,[shade([212,212,208],0.92),shade([212,212,208],1.05)],20,38);
  });
  T.door=makeTile(ctx=>{
    noisyBase(ctx,[150,112,66],0.2,39);
    ctx.fillStyle='#6a4c28';ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);ctx.fillRect(0,0,1,16);ctx.fillRect(15,0,1,16);
    ctx.fillStyle='#3a2c1a';ctx.fillRect(3,3,10,5); // 上窗
    ctx.fillStyle='#8ab8d8';ctx.fillRect(4,4,8,3);
    ctx.fillStyle='#6a4c28';ctx.fillRect(3,10,10,4); // 下板
    ctx.fillStyle='#8a683c';ctx.fillRect(4,11,8,2);
    ctx.fillStyle='#e8c84a';ctx.fillRect(12,8,2,2); // 门把手
  });
  T.doorOpen=makeTile(ctx=>{ // 门开着：门口是黑洞，门板转到左边贴着墙（像我的世界）
    fillAll(ctx,'#241a10'); // 门洞里面（有点光，不是全黑）
    ctx.fillStyle='#1a120a';ctx.fillRect(4,2,12,13); // 门洞深处
    // 转到左边的门板（侧过来变薄了）
    ctx.fillStyle='#6a4c28';ctx.fillRect(0,0,4,16);
    ctx.fillStyle='#8a683c';ctx.fillRect(0,1,3,6);ctx.fillRect(0,9,3,6); // 门板上的两块板
    ctx.fillStyle='#54391e';ctx.fillRect(3,0,1,16); // 门板厚度边
    ctx.fillStyle='#e8c84a';ctx.fillRect(2,8,2,2); // 门把手
    ctx.fillStyle='#6a4c28';ctx.fillRect(4,0,12,1);ctx.fillRect(4,15,12,1); // 上下门框
  });
  T.bed=makeTile(ctx=>{ // 床头（我的世界风格）：木框 + 白枕头 + 红毯子边
    noisyBase(ctx,[170,132,80],0.2,40); // 橡木框底
    ctx.fillStyle='#8a683c';ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);ctx.fillRect(0,0,1,16);ctx.fillRect(15,0,1,16); // 木框边
    ctx.fillStyle='#b02828';ctx.fillRect(1,7,14,8); // 红毯子尾部
    ctx.fillStyle='#d84040';ctx.fillRect(1,7,14,2);
    ctx.fillStyle='#8a2018';ctx.fillRect(1,13,14,2);
    ctx.fillStyle='#f0f0e8';ctx.fillRect(2,1,12,6); // 白枕头
    ctx.fillStyle='#d8d8cc';ctx.fillRect(2,6,12,1);ctx.fillRect(12,1,2,6); // 枕头阴影
    ctx.fillStyle='#ffffff';ctx.fillRect(3,2,9,2); // 枕头高光
  });
  T.bedFoot=makeTile(ctx=>{ // 床尾：木框 + 整张红毯子
    noisyBase(ctx,[170,132,80],0.2,40);
    ctx.fillStyle='#8a683c';ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);ctx.fillRect(0,0,1,16);ctx.fillRect(15,0,1,16);
    ctx.fillStyle='#b02828';ctx.fillRect(1,1,14,14); // 红毯子
    ctx.fillStyle='#d84040';ctx.fillRect(1,1,14,3);
    ctx.fillStyle='#8a2018';ctx.fillRect(1,12,14,3); // 毯子尾部深色
    ctx.fillStyle='#c03030';ctx.fillRect(3,5,3,3);ctx.fillRect(10,7,3,3); // 毯子褶皱
  });
  T.bedSide=makeTile(ctx=>{ // 床的侧面：木床架 + 上面红毯子 + 床脚
    noisyBase(ctx,[164,126,74],0.2,42); // 木头床架
    ctx.fillStyle='#8a683c';ctx.fillRect(0,15,16,1);
    ctx.fillStyle='#b02828';ctx.fillRect(0,0,16,4); // 毯子搭在边上
    ctx.fillStyle='#d84040';ctx.fillRect(0,0,16,1);
    ctx.fillStyle='#8a2018';ctx.fillRect(0,3,16,1);
    ctx.fillStyle='#6a4c28';ctx.fillRect(0,11,3,5);ctx.fillRect(13,11,3,5); // 两只床脚
    ctx.fillStyle='#54391e';ctx.fillRect(0,15,3,1);ctx.fillRect(13,15,3,1);
  });
  // 黑曜石：深紫黑
  T.obsidian=makeTile(ctx=>{
    noisyBase(ctx,[24,16,40],0.3,77);
    speckle(ctx,16,[60,40,100],90);
    speckle(ctx,8,[10,6,20],91);
  });
  // 下界传送门：紫色漩涡光幕
  T.portal=makeTile(ctx=>{
    noisyBase(ctx,[120,40,190],0.35,101);
    speckle(ctx,20,[190,110,255],102);
    speckle(ctx,10,[70,20,120],103);
    ctx.fillStyle='rgba(230,190,255,0.7)';ctx.fillRect(3,3,2,2);ctx.fillRect(11,8,2,2);ctx.fillRect(6,12,2,2);
  });
  // 末地传送门：黑色星空
  T.endPortal=makeTile(ctx=>{
    fillAll(ctx,'#05050c');
    speckle(ctx,14,[220,220,255],111);
    speckle(ctx,6,[140,220,190],112);
  });
  // 下界岩：红褐色
  T.netherrack=makeTile(ctx=>{
    noisyBase(ctx,[110,52,44],0.3,121);
    speckle(ctx,18,[80,32,28],122);
    speckle(ctx,10,[140,70,58],123);
  });
  // 岩浆：橙红流动
  T.lava=makeTile(ctx=>{
    noisyBase(ctx,[230,90,10],0.25,131);
    speckle(ctx,18,[255,180,40],132);
    speckle(ctx,10,[180,40,0],133);
  });
  // 荧石：金黄发光
  T.glowstone=makeTile(ctx=>{
    noisyBase(ctx,[230,180,90],0.2,141);
    speckle(ctx,20,[255,230,150],142);
    speckle(ctx,12,[200,140,60],143);
  });
  // 末地石：淡黄白斑（略压亮度）
  T.endstone=makeTile(ctx=>{
    noisyBase(ctx,[196,190,132],0.18,151);
    speckle(ctx,16,[172,166,104],152);
    speckle(ctx,8,[212,208,160],153);
  });
  // 箱子：木箱 + 深色盖子边 + 金色锁扣
  T.chestSide=makeTile(ctx=>{
    noisyBase(ctx,[176,139,77],0.2,171);
    ctx.fillStyle='rgba(90,60,30,0.55)';
    for(let i=0;i<3;i++)ctx.fillRect(0,5+i*5,16,1); // 木板缝
    ctx.fillStyle='#5a3c1e';
    ctx.fillRect(0,0,16,3);ctx.fillRect(0,3,16,1); // 盖子边
    ctx.fillStyle='#d9b04a';
    ctx.fillRect(7,3,2,3); // 锁扣
    ctx.fillStyle='#8a6a2a';
    ctx.fillRect(7,5,2,1);
  });
  T.chestTop=makeTile(ctx=>{
    noisyBase(ctx,[176,139,77],0.2,172);
    ctx.fillStyle='#5a3c1e';
    ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);ctx.fillRect(0,0,1,16);ctx.fillRect(15,0,1,16);
  });
  // 附魔台：紫色台面+上面一本打开的书
  T.enchantTop=makeTile(ctx=>{
    noisyBase(ctx,[60,40,80],0.2,181);
    ctx.fillStyle='#efe8d0';
    ctx.fillRect(3,4,4,8);ctx.fillRect(9,4,4,8); // 两页
    ctx.fillStyle='#b03060';
    ctx.fillRect(7,4,2,8); // 书脊
    ctx.fillStyle='#7a6a50';
    for(let i=0;i<3;i++){ctx.fillRect(4,6+i*2,2,1);ctx.fillRect(10,6+i*2,2,1);} // 字
  });
  T.enchantSide=makeTile(ctx=>{
    noisyBase(ctx,[40,30,50],0.2,182);
    ctx.fillStyle='#4ae8dd';
    ctx.fillRect(3,7,2,2);ctx.fillRect(11,5,2,2);ctx.fillRect(7,11,2,2); // 钻石光点
    ctx.fillStyle='#b03060';
    ctx.fillRect(0,0,16,2); // 顶部红毯边
  });
  // 耕地：深褐色犁沟
  T.farmland=makeTile(ctx=>{
    noisyBase(ctx,[96,66,40],0.25,161);
    ctx.fillStyle='#6a4626';
    for(let i=0;i<4;i++)ctx.fillRect(0,2+i*4,16,2);
    ctx.fillStyle='#7a5430';
    for(let i=0;i<4;i++)ctx.fillRect(0,4+i*4,16,1);
  });
  // 小麦生长 4 个阶段
  T.crops=[0,1,2,3].map(st=>makeTile(ctx=>{
    fillAll(ctx,'#00000000');
    ctx.clearRect(0,0,16,16);
    const h=[5,8,12,15][st];
    const col=st<3?['#5a9a3a','#6aaa42','#8ab84a'][st]:'#d8b83a';
    for(let i=0;i<5;i++){
      const x=1+i*3;
      ctx.fillStyle=col;ctx.fillRect(x,16-h,2,h);
      ctx.fillStyle='#00000033';ctx.fillRect(x+1,16-h,1,h);
      if(st>=2){ctx.fillStyle=st===3?'#e8d060':'#9ac858';ctx.fillRect(x,16-h,2,3);}
    }
  }));
  // 白桦木：白色树皮+黑斑
  T.birchSide=makeTile(ctx=>{
    noisyBase(ctx,[225,222,205],0.1,41);
    for(let i=0;i<7;i++){
      const x=Math.floor(hash2(i*5,42)*14),y=Math.floor(hash2(i*9,43)*14);
      ctx.fillStyle='#3a3a32';ctx.fillRect(x,y,2,1);
    }
    ctx.fillStyle='#b8b4a0';ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);
  });
  T.birchTop=makeTile(ctx=>{
    noisyBase(ctx,[200,180,130],0.15,44);
    ctx.strokeStyle='#8a7040';ctx.strokeRect(2.5,2.5,11,11);ctx.strokeRect(5.5,5.5,5,5);
  });
  // 花丛：绿叶底+红黄花朵
  T.flower=makeTile(ctx=>{
    noisyBase(ctx,[66,140,52],0.3,45);
    speckle(ctx,[shade([66,140,52],1.3),shade([66,140,52],0.7)],18,46);
    const fs=[[3,3,'#e04040'],[10,5,'#f0d040'],[6,9,'#e070c0'],[12,11,'#e04040'],[4,12,'#f0d040'],[9,2,'#f0f0f0']];
    for(const f of fs){
      ctx.fillStyle=f[2];
      px(ctx,f[0],f[1],f[2]);px(ctx,f[0]+1,f[1],f[2]);px(ctx,f[0],f[1]+1,f[2]);px(ctx,f[0]+1,f[1]+1,f[2]);
      px(ctx,f[0],f[1],'#fff8c0');
    }
  });
  T.debris=makeTile(ctx=>{
    noisyBase(ctx,[96,60,50],0.35,25);
    speckle(ctx,['#5a3226','#c98a5a','#3a1f18'],26,26);
    ctx.fillStyle='#d8a06a';ctx.fillRect(3,7,3,1);ctx.fillRect(9,11,4,1);
  });
  T.bedrock=makeTile(ctx=>{
    noisyBase(ctx,[70,70,70],0.8,27);
    speckle(ctx,['#1a1a1a','#3a3a3a'],30,28);
  });
  T.resin=makeTile(ctx=>{
    noisyBase(ctx,[214,120,40],0.3,31);
    speckle(ctx,[shade([214,120,40],1.25),shade([214,120,40],0.7)],20,32);
    // 树脂块的光泽斑
    for(let i=0;i<5;i++){
      const x=Math.floor(hash2(i*3,77)*13),y=Math.floor(hash2(i*5,88)*13);
      px(ctx,x,y,'#ffdba0');px(ctx,x+1,y,'#ffc880');
    }
  });

  // 合成图集
  atlasCanvas=document.createElement('canvas');
  atlasCanvas.width=ATLAS_N*TILE;atlasCanvas.height=ATLAS_N*TILE;
  const actx=atlasCanvas.getContext('2d');
  actx.imageSmoothingEnabled=false;
  for(let i=0;i<tileCanvases.length;i++){
    const cx=(i%ATLAS_N)*TILE,cy=Math.floor(i/ATLAS_N)*TILE;
    actx.drawImage(tileCanvases[i],cx,cy);
  }
  atlasTex=new THREE.CanvasTexture(atlasCanvas);
  atlasTex.magFilter=THREE.NearestFilter;
  atlasTex.minFilter=THREE.NearestFilter;
  atlasTex.generateMipmaps=false;
}
function tileUV(ti){
  const col=ti%ATLAS_N,row=Math.floor(ti/ATLAS_N);
  const inset=0.6/(ATLAS_N*TILE);
  const u0=col/ATLAS_N+inset,v0=1-(row+1)/ATLAS_N+inset;
  const u1=(col+1)/ATLAS_N-inset,v1=1-row/ATLAS_N-inset;
  return [u0,v0,u1,v1];
}

// ---------------- 方块定义 ----------------
// id: {name, tiles:[top,bottom,side] 或 {top,bottom,side,front}, hard(秒), tool, minTier, drop, sound, opaque, solid}
const B_AIR=0,B_GRASS=1,B_DIRT=2,B_STONE=3,B_COBBLE=4,B_LOG=5,B_PLANKS=6,B_LEAVES=7,
      B_SAND=8,B_GLASS=9,B_WATER=10,B_TABLE=11,B_FURNACE=12,B_COAL_ORE=13,B_IRON_ORE=14,
      B_GOLD_ORE=15,B_DIAMOND_ORE=16,B_DEBRIS=17,B_BEDROCK=18,B_RESIN=19,B_REDSTONE_ORE=20,B_PISTON=21,
      B_STICKY=22,B_WOOL=23,B_DOOR=24,B_DOOR_OPEN=25,B_BED=26,B_BIRCH_LOG=27,B_FLOWER=28,
      B_SPRUCE_LOG=29,B_SPRUCE_LEAVES=30,B_JUNGLE_LOG=31,B_ACACIA_LOG=32,
      B_DARK_LOG=33,B_DARK_LEAVES=34,B_CHERRY_LOG=35,B_CHERRY_LEAVES=36,B_BED_HEAD=37,
      B_OBSIDIAN=38,B_PORTAL=39,B_ENDPORTAL=40,B_NETHERRACK=41,B_LAVA=42,B_GLOWSTONE=43,B_ENDSTONE=44,
      B_FARMLAND=45,B_CROPS=46,B_CHEST=47,B_ENCHANT=48;
const BLOCKS={};
function defBlock(id,name,hard,opt){
  opt=opt||{};
  BLOCKS[id]={id,name,hard,
    tiles:opt.tiles||null,
    tool:opt.tool||null, minTier:opt.minTier||0,
    drop:opt.drop!==undefined?opt.drop:id,
    sound:opt.sound||'stone',
    opaque:opt.opaque!==false, solid:opt.solid!==false,
    item:opt.item!==undefined?opt.item:id};
}
// ---------------- 物品定义 ----------------
const ITEMS={};
const MAT_COLOR={leather:'#9a6335',chain:'#b9b9b9',iron:'#e8e8e8',gold:'#ffd94a',diamond:'#4ae8dd',netherite:'#574b5e',turtle:'#3f9e46',wood:'#b08b4d',stone:'#8f8f8f'};
// 当前穿的盔甲材质数组 [helmet,chest,legs,boots]（null=没穿），用于联机同步 avatar 穿甲外观
function armorMats(){
  if(!inv||!inv.armor)return[null,null,null,null];
  return inv.armor.map(a=>a?(ITEMS[a.id]&&ITEMS[a.id].mat)||null:null);
}
let nextItemId=100;
const I={}; // 命名物品 id 表
function defItem(key,name,opt){
  opt=opt||{};
  const id=nextItemId++;
  I[key]=id;
  ITEMS[id]={id,key,name,
    icon:opt.icon||null,       // 绘制函数(ctx)
    type:opt.type||'item',     // item|tool|armor
    toolType:opt.toolType||null, tier:opt.tier||0, speed:opt.speed||1, dmg:opt.dmg||1,
    armorSlot:opt.armorSlot!==undefined?opt.armorSlot:null, armorPts:opt.armorPts||0, mat:opt.mat||null,
    gun:opt.gun||null,           // 枪战武器参数 {dmg,cd,clip,reload,spread,range,pellets?}
    maxStack:opt.maxStack||64};
  return id;
}
// 方块物品: ITEMS[blockId] = 方块型物品
function blockItemEntry(id){
  ITEMS[id]={id,key:'block'+id,name:BLOCKS[id].name,type:'block',blockId:id,maxStack:64};
}

// ---------------- 物品图标绘制 ----------------
function drawItemIcon(ctx,id){
  const it=ITEMS[id];if(!it)return;
  ctx.clearRect(0,0,16,16);
  if(it.type==='block'){
    const b=BLOCKS[it.blockId];
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(tileCanvases[b.tiles.side],0,0,16,16);
    return;
  }
  if(it.icon)it.icon(ctx);
}
function P(ctx,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h|1);}
function iconStick(ctx){ctx.save();ctx.translate(8,8);ctx.rotate(-Math.PI/4);P(ctx,-1,-7,2,14,'#8a6a3a');P(ctx,-1,-7,1,14,'#a5824d');ctx.restore();}
function iconIngot(color,edge){
  return function(ctx){
    P(ctx,3,6,10,6,edge);P(ctx,2,7,12,4,edge);
    P(ctx,3,6,10,4,color);P(ctx,4,6,8,1,shade([255,255,255],1));
    P(ctx,3,6,10,1,'#ffffff');P(ctx,3,6,1,4,'#ffffff');
  };
}
function iconCoal(base){return function(ctx){
  P(ctx,4,4,8,8,'#111');P(ctx,3,5,10,6,'#111');
  P(ctx,4,4,8,8,base);P(ctx,5,5,3,3,shade([120,120,120],1));
};}
function iconDiamond(ctx){
  P(ctx,4,2,8,3,'#bff');P(ctx,3,5,10,4,'#4ae8dd');P(ctx,5,9,6,3,'#3ec9c0');P(ctx,6,12,4,2,'#2aa89f');
  P(ctx,4,2,2,2,'#fff');
}
function iconNugget(ctx){P(ctx,6,6,5,5,'#e8e0d0');P(ctx,6,6,2,2,'#fff');P(ctx,10,10,1,1,'#b8b0a0');}
function iconScrap(ctx){
  ctx.save();ctx.translate(8,8);ctx.rotate(0.5);
  P(ctx,-4,-3,8,6,'#6b4632');P(ctx,-4,-3,8,2,'#8a6248');P(ctx,-2,0,4,1,'#c9905e');
  ctx.restore();
}
function iconScute(ctx){
  P(ctx,4,3,8,10,'#2d7a34');P(ctx,3,4,10,8,'#3f9e46');
  P(ctx,5,5,6,2,'#57b45e');P(ctx,5,9,6,1,'#2d7a34');P(ctx,7,5,1,7,'#2d7a34');
}
function iconResin(ctx){
  P(ctx,4,4,8,8,'#c26a1e');P(ctx,3,5,10,6,'#d67a28');
  P(ctx,5,5,3,3,'#ffdba0');P(ctx,9,9,2,2,'#a85a18');P(ctx,6,10,4,1,'#a85a18');
}
function iconLeather(ctx){
  P(ctx,3,4,10,8,'#7a4a26');P(ctx,2,5,12,6,'#9a6335');
  P(ctx,4,5,4,2,'#b07a48');P(ctx,9,8,3,2,'#7a4a26');
}
function iconString(ctx){
  ctx.strokeStyle='#e8e8e8';ctx.lineWidth=1.4;ctx.beginPath();
  ctx.moveTo(3,13);ctx.quadraticCurveTo(3,6,8,7);ctx.quadraticCurveTo(13,8,12,3);ctx.stroke();
  ctx.strokeStyle='#b8b8b8';ctx.beginPath();ctx.moveTo(5,13);ctx.quadraticCurveTo(6,9,10,10);ctx.stroke();
}
function toolIcon(kind,color){
  return function(ctx){
    // 手柄
    ctx.save();ctx.translate(8,9);ctx.rotate(-Math.PI/4);
    P(ctx,-1,-2,2,10,'#8a6a3a');P(ctx,-1,-2,1,10,'#a5824d');
    ctx.restore();
    ctx.save();ctx.translate(8,9);ctx.rotate(-Math.PI/4);ctx.translate(0,-6);
    const dark='rgba(0,0,0,0.35)';
    if(kind==='pick'){
      P(ctx,-6,-2,12,3,color);P(ctx,-6,-2,12,1,'#ffffff55');
      P(ctx,-6,-2,2,5,color);P(ctx,4,-2,2,5,color);
      P(ctx,-6,3,2,2,dark);P(ctx,4,3,2,2,dark);
    }else if(kind==='axe'){
      P(ctx,-1,-4,5,7,color);P(ctx,-1,-4,5,1,'#ffffff55');
      P(ctx,2,-4,4,4,color);P(ctx,4,-4,2,7,dark);
    }else if(kind==='shovel'){
      P(ctx,-2,-6,4,5,color);P(ctx,-2,-6,4,1,'#ffffff55');
      P(ctx,-1,-2,2,1,dark);P(ctx,-2,-1,4,2,color);P(ctx,-1,1,2,1,dark);
    }else if(kind==='hoe'){
      P(ctx,-1,-6,2,7,color);P(ctx,-1,-6,2,1,'#ffffff55');
      P(ctx,1,-6,4,2,color);P(ctx,4,-4,2,3,color);P(ctx,4,-4,2,1,dark);
    }else{ // sword
      P(ctx,-1,-8,2,9,color);P(ctx,-1,-8,1,9,'#ffffff66');
      P(ctx,-1,-9,2,2,color);
      P(ctx,-4,1,8,2,'#8a6a3a');P(ctx,-1,3,2,2,'#6b4f2a');
    }
    ctx.restore();
  };
}
function armorIcon(kind,color,trim){
  return function(ctx){
    const d=shade([90,90,90],1); // 描边色(深色)
    const dk=trim||'rgba(0,0,0,0.35)';
    if(kind==='helmet'){
      P(ctx,3,3,10,8,color);P(ctx,2,4,12,6,color);
      P(ctx,3,3,10,2,'#ffffff44');P(ctx,2,9,5,2,dk);P(ctx,11,9,3,2,dk);
      P(ctx,3,10,3,2,color);P(ctx,10,10,3,2,color);
    }else if(kind==='chest'){
      P(ctx,4,3,8,10,color);P(ctx,2,3,2,7,color);P(ctx,12,3,2,7,color);
      P(ctx,4,3,8,2,'#ffffff44');P(ctx,6,3,4,2,dk);
      P(ctx,4,11,8,2,dk);P(ctx,2,9,2,1,dk);P(ctx,12,9,2,1,dk);
    }else if(kind==='legs'){
      P(ctx,3,2,10,4,color);P(ctx,3,6,4,8,color);P(ctx,9,6,4,8,color);
      P(ctx,3,2,10,1,'#ffffff44');P(ctx,3,12,4,2,dk);P(ctx,9,12,4,2,dk);
    }else{ // boots
      P(ctx,2,8,5,3,color);P(ctx,2,11,6,2,color);
      P(ctx,9,8,5,3,color);P(ctx,8,11,6,2,color);
      P(ctx,2,8,5,1,'#ffffff44');P(ctx,9,8,5,1,'#ffffff44');
      P(ctx,2,13,6,1,dk);P(ctx,8,13,6,1,dk);
    }
  };
}

// ---------------- 内容注册 ----------------
function registerContent(){
  // 材料物品(先定义, 方块掉落要引用)
  defItem('stick','木棍',{icon:iconStick});
  defItem('leather','皮革',{icon:iconLeather});
  defItem('rotten_flesh','腐肉',{icon:ctx=>{
    ctx.fillStyle='#8a5a3a';ctx.fillRect(3,4,10,9);
    ctx.fillStyle='#a5714a';ctx.fillRect(4,3,8,2);ctx.fillRect(5,12,6,2);
    ctx.fillStyle='#5f7a3a';ctx.fillRect(5,6,2,2);ctx.fillRect(10,9,2,2);
  }});
  defItem('redstone','红石粉',{icon:ctx=>{
    ctx.fillStyle='#7a7a7a';ctx.fillRect(6,6,4,4);
    ctx.fillStyle='#e03030';
    ctx.fillRect(7,3,2,3);ctx.fillRect(3,7,3,2);ctx.fillRect(10,8,3,2);ctx.fillRect(8,10,2,3);ctx.fillRect(5,4,2,2);ctx.fillRect(11,4,2,2);ctx.fillRect(4,11,2,2);
    ctx.fillStyle='#ff7070';ctx.fillRect(7,4,1,1);ctx.fillRect(10,9,1,1);ctx.fillRect(5,7,1,1);
  }});
  defItem('slimeball','黏液球',{icon:ctx=>{
    ctx.fillStyle='#5aaa3a';ctx.fillRect(4,5,8,8);ctx.fillRect(5,4,6,1);ctx.fillRect(5,13,6,1);
    ctx.fillStyle='#7acc5a';ctx.fillRect(6,6,2,2);
    ctx.fillStyle='#3a7a2a';ctx.fillRect(9,10,2,2);
  }});
  defItem('ender_pearl','末影珍珠',{icon:ctx=>{
    ctx.fillStyle='#0d4a42';ctx.fillRect(4,4,8,8);ctx.fillRect(5,3,6,10);ctx.fillRect(3,5,10,6);
    ctx.fillStyle='#1a7a6a';ctx.fillRect(5,5,6,6);
    ctx.fillStyle='#7ae8d8';ctx.fillRect(6,5,2,2);
  }});
  defItem('bow','弓',{icon:ctx=>{ // 棕色弯弓+白弦
    ctx.fillStyle='#8a5a2a';
    ctx.fillRect(10,2,2,3);ctx.fillRect(8,4,2,3);ctx.fillRect(7,7,2,3);ctx.fillRect(8,10,2,3);ctx.fillRect(10,12,2,2);
    ctx.fillStyle='#e8e8e0';ctx.fillRect(12,2,1,12);
    ctx.fillStyle='#c9a020';ctx.fillRect(9,7,1,2);
  },maxStack:1});
  defItem('arrow','箭',{icon:ctx=>{
    ctx.fillStyle='#c9b898';ctx.fillRect(3,11,9,2);ctx.fillRect(4,10,7,1);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(11,10,3,3);ctx.fillRect(12,9,2,1);
    ctx.fillStyle='#e8e8e0';ctx.fillRect(2,12,3,1);ctx.fillRect(2,10,2,1);
  },maxStack:64});
  defItem('dragon_egg','龙蛋',{icon:ctx=>{
    ctx.fillStyle='#1a1226';ctx.fillRect(5,3,6,2);ctx.fillRect(4,5,8,7);ctx.fillRect(5,12,6,2);
    ctx.fillStyle='#3a2a56';ctx.fillRect(6,6,2,2);ctx.fillRect(9,9,2,2);
    ctx.fillStyle='#7a5ac2';ctx.fillRect(7,4,2,1);
  },maxStack:1});
  // ---------- 枪战武器（type:'gun'） ----------
  defItem('pistol','手枪',{icon:ctx=>{ // 短枪身 + 握把
    ctx.fillStyle='#3a3a3a';ctx.fillRect(3,6,9,3);
    ctx.fillStyle='#555';ctx.fillRect(4,6,9,1);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(4,9,2,4);ctx.fillRect(6,10,1,3);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(11,7,1,2);
  },type:'gun',gun:{dmg:8,cd:0.35,clip:12,reload:1.1,spread:0.05,range:40}});
  defItem('smg','冲锋枪',{icon:ctx=>{ // 长枪身 + 弹匣 + 握把
    ctx.fillStyle='#2e3a4a';ctx.fillRect(2,5,12,3);
    ctx.fillStyle='#4a5a6a';ctx.fillRect(3,5,11,1);
    ctx.fillStyle='#222';ctx.fillRect(4,8,2,3);ctx.fillRect(6,8,1,4);ctx.fillRect(8,8,1,4);
    ctx.fillStyle='#7a8a9a';ctx.fillRect(2,6,2,1);
  },type:'gun',gun:{dmg:5,cd:0.12,clip:30,reload:1.6,spread:0.09,range:32}});
  defItem('shotgun','霰弹枪',{icon:ctx=>{ // 双管粗身 + 木护木
    ctx.fillStyle='#4a4a3a';ctx.fillRect(2,5,12,4);
    ctx.fillStyle='#6a6a4a';ctx.fillRect(2,5,12,2);
    ctx.fillStyle='#8a5a2a';ctx.fillRect(7,9,3,4);ctx.fillRect(10,10,1,3);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(2,6,2,3);
  },type:'gun',gun:{dmg:6,pellets:5,cd:0.9,clip:6,reload:1.9,spread:0.14,range:18}});
  defItem('sniper','狙击枪',{icon:ctx=>{ // 长枪管 + 瞄准镜
    ctx.fillStyle='#2a2a2a';ctx.fillRect(1,5,14,2);
    ctx.fillStyle='#444';ctx.fillRect(1,5,14,1);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(6,3,3,3);ctx.fillRect(7,4,1,1);
    ctx.fillStyle='#3a3a2a';ctx.fillRect(5,7,3,3);ctx.fillRect(8,8,1,2);
  },type:'gun',gun:{dmg:30,cd:1.4,clip:5,reload:2.0,spread:0,range:60}});
  defItem('grenade','手榴弹',{icon:ctx=>{ // 深绿球 + 引信 + 拉环
    ctx.fillStyle='#3a5a2a';ctx.fillRect(4,7,8,6);
    ctx.fillStyle='#4a7a3a';ctx.fillRect(5,7,7,1);ctx.fillRect(5,11,7,1);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(7,4,2,3);ctx.fillRect(8,3,1,2);
    ctx.fillStyle='#2a3a1a';ctx.fillRect(6,10,4,2);
  },type:'grenade',maxStack:5});
  defItem('mine','地雷',{icon:ctx=>{ // 暗绿圆盘 + 红色指示灯
    ctx.fillStyle='#2e4a2a';ctx.fillRect(2,9,12,4);
    ctx.fillStyle='#4a7a3a';ctx.fillRect(3,9,10,1);
    ctx.fillStyle='#3a5a2a';ctx.fillRect(3,11,10,1);
    ctx.fillStyle='#b03030';ctx.fillRect(7,5,2,4);
  },type:'mine',maxStack:3});
  defItem('book','书',{icon:ctx=>{
    ctx.fillStyle='#b03060';ctx.fillRect(2,1,12,14); // 封面
    ctx.fillStyle='#efe8d0';ctx.fillRect(3,2,10,12); // 书页
    ctx.fillStyle='#b03060';ctx.fillRect(7,2,2,12); // 书脊
    ctx.fillStyle='#8a7a5a';
    for(let i=0;i<4;i++){ctx.fillRect(4,4+i*2,2,1);ctx.fillRect(10,4+i*2,2,1);}
  },maxStack:16});
  defItem('seeds','小麦种子',{icon:ctx=>{
    ctx.fillStyle='#7aa03a';ctx.fillRect(3,4,2,3);ctx.fillRect(7,3,2,3);ctx.fillRect(11,4,2,3);
    ctx.fillRect(5,9,2,3);ctx.fillRect(9,10,2,3);ctx.fillRect(4,13,2,2);ctx.fillRect(10,13,2,2);
    ctx.fillStyle='#a8c858';ctx.fillRect(3,4,1,1);ctx.fillRect(7,3,1,1);ctx.fillRect(5,9,1,1);
  }});
  defItem('wheat','小麦',{icon:ctx=>{
    ctx.fillStyle='#c9a832';ctx.fillRect(3,2,2,8);ctx.fillRect(7,1,2,9);ctx.fillRect(11,2,2,8);
    ctx.fillStyle='#e8cc50';ctx.fillRect(3,2,2,2);ctx.fillRect(7,1,2,2);ctx.fillRect(11,2,2,2);
    ctx.fillStyle='#8a6a20';ctx.fillRect(2,10,12,2);ctx.fillRect(6,10,1,5);
  }});
  defItem('bread','面包',{icon:ctx=>{
    ctx.fillStyle='#b0762a';ctx.fillRect(2,5,12,6);ctx.fillRect(3,4,10,1);ctx.fillRect(3,11,10,1);
    ctx.fillStyle='#d89a48';ctx.fillRect(3,6,10,4);
    ctx.fillStyle='#8a5a1a';ctx.fillRect(4,7,2,2);ctx.fillRect(8,8,2,2);ctx.fillRect(11,6,2,2);
  },maxStack:64});
  defItem('string','线',{icon:iconString});
  defItem('iron_ingot','铁锭',{icon:iconIngot('#e8e8e8','#9a9a9a')});
  defItem('gold_ingot','金锭',{icon:iconIngot('#ffd94a','#c9a020')});
  defItem('diamond','钻石',{icon:iconDiamond});
  defItem('iron_nugget','铁粒',{icon:iconNugget});
  defItem('netherite_scrap','下界合金碎片',{icon:iconScrap});
  defItem('netherite_ingot','下界合金锭',{icon:iconIngot('#574b5e','#3a323e')});
  defItem('scute','鳞甲',{icon:iconScute});
  defItem('coal','煤炭',{icon:iconCoal('#2b2b2b')});
  defItem('charcoal','木炭',{icon:iconCoal('#1a1a1a')});
  defItem('resin_clump','树脂团',{icon:iconResin});

  defBlock(B_GRASS,'草方块',0.65,{tiles:{top:T.grassTop,bottom:T.dirt,side:T.grassSide},drop:B_DIRT,tool:'shovel',sound:'dirt'});
  defBlock(B_DIRT,'泥土',0.5,{tiles:{top:T.dirt,bottom:T.dirt,side:T.dirt},tool:'shovel',sound:'dirt'});
  defBlock(B_STONE,'石头',4,{tiles:{top:T.stone,bottom:T.stone,side:T.stone},tool:'pick',minTier:1,drop:B_COBBLE,sound:'stone'});
  defBlock(B_COBBLE,'圆石',4,{tiles:{top:T.cobble,bottom:T.cobble,side:T.cobble},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_LOG,'橡木原木',2,{tiles:{top:T.logTop,bottom:T.logTop,side:T.logSide},tool:'axe',sound:'wood'});
  defBlock(B_PLANKS,'橡木木板',2,{tiles:{top:T.planks,bottom:T.planks,side:T.planks},tool:'axe',sound:'wood'});
  defBlock(B_LEAVES,'橡树叶',0.25,{tiles:{top:T.leaves,bottom:T.leaves,side:T.leaves},drop:0,sound:'grass'});
  defBlock(B_SAND,'沙子',0.45,{tiles:{top:T.sand,bottom:T.sand,side:T.sand},tool:'shovel',sound:'sand'});
  defBlock(B_GLASS,'玻璃',0.35,{tiles:{top:T.glass,bottom:T.glass,side:T.glass},drop:0,sound:'glass',opaque:false});
  defBlock(B_WATER,'水',99999,{tiles:{top:T.water,bottom:T.water,side:T.water},drop:0,sound:'sand',opaque:false,solid:false});
  defBlock(B_TABLE,'工作台',2.5,{tiles:{top:T.tableTop,bottom:T.planks,side:T.tableSide},tool:'axe',sound:'wood'});
  defBlock(B_FURNACE,'熔炉',4,{tiles:{top:T.furnaceTop,bottom:T.furnaceTop,side:T.furnaceSide,front:T.furnaceFront},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_COAL_ORE,'煤矿石',6,{tiles:{top:T.coalOre,bottom:T.coalOre,side:T.coalOre},tool:'pick',minTier:1,drop:I.coal,sound:'stone'});
  defBlock(B_IRON_ORE,'铁矿石',6,{tiles:{top:T.ironOre,bottom:T.ironOre,side:T.ironOre},tool:'pick',minTier:2,drop:I.iron_ingot,sound:'stone'}); // 直接掉铁锭
  defBlock(B_GOLD_ORE,'金矿石',6,{tiles:{top:T.goldOre,bottom:T.goldOre,side:T.goldOre},tool:'pick',minTier:3,drop:I.gold_ingot,sound:'stone'}); // 直接掉金锭
  defBlock(B_DIAMOND_ORE,'钻石矿石',8,{tiles:{top:T.diamondOre,bottom:T.diamondOre,side:T.diamondOre},tool:'pick',minTier:3,drop:I.diamond,sound:'stone'});
  defBlock(B_DEBRIS,'远古残骸',15,{tiles:{top:T.debris,bottom:T.debris,side:T.debris},tool:'pick',minTier:4,sound:'stone'});
  defBlock(B_BEDROCK,'基岩',Infinity,{tiles:{top:T.bedrock,bottom:T.bedrock,side:T.bedrock},drop:0,sound:'stone'});
  defBlock(B_RESIN,'树脂块',1.5,{tiles:{top:T.resin,bottom:T.resin,side:T.resin},sound:'wood'});
  defBlock(B_REDSTONE_ORE,'红石矿石',6,{tiles:{top:T.redstoneOre,bottom:T.redstoneOre,side:T.redstoneOre},tool:'pick',minTier:3,drop:I.redstone,sound:'stone'});
  defBlock(B_PISTON,'活塞',1.5,{tiles:{top:T.pistonSide,bottom:T.pistonSide,side:T.pistonSide,front:T.pistonFront},sound:'wood'});
  defBlock(B_STICKY,'粘性活塞',1.5,{tiles:{top:T.pistonSide,bottom:T.pistonSide,side:T.pistonSide,front:T.stickyFront},sound:'wood'});
  defBlock(B_WOOL,'羊毛',0.8,{tiles:{top:T.wool,bottom:T.wool,side:T.wool},sound:'grass'});
  defBlock(B_CHEST,'箱子',1.5,{tiles:{top:T.chestTop,bottom:T.planks,side:T.chestSide},tool:'axe',sound:'wood'});
  defBlock(B_ENCHANT,'附魔台',10,{tiles:{top:T.enchantTop,bottom:T.obsidian,side:T.enchantSide},tool:'pick',minTier:3,sound:'stone'});
  defBlock(B_DOOR,'木门',1.5,{tiles:{top:T.door,bottom:T.door,side:T.door},sound:'wood'});
  defBlock(B_DOOR_OPEN,'木门（开着）',1.5,{tiles:{top:T.doorOpen,bottom:T.doorOpen,side:T.doorOpen},sound:'wood',opaque:false,solid:false,drop:B_DOOR});
  defBlock(B_BED,'床',0.5,{tiles:{top:T.bedFoot,bottom:T.planks,side:T.bedSide},sound:'wood'});
  defBlock(B_BED_HEAD,'床头',0.5,{tiles:{top:T.bed,bottom:T.planks,side:T.bedSide},sound:'wood',drop:0});
  defBlock(B_OBSIDIAN,'黑曜石',20,{tiles:{top:T.obsidian,bottom:T.obsidian,side:T.obsidian},tool:'pick',minTier:4,sound:'stone'});
  defBlock(B_PORTAL,'下界传送门',1.2,{tiles:{top:T.portal,bottom:T.portal,side:T.portal},sound:'glass',opaque:false,solid:false});
  defBlock(B_ENDPORTAL,'末地传送门',1.2,{tiles:{top:T.endPortal,bottom:T.endPortal,side:T.endPortal},sound:'glass',opaque:false,solid:false});
  defBlock(B_NETHERRACK,'下界岩',2,{tiles:{top:T.netherrack,bottom:T.netherrack,side:T.netherrack},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_LAVA,'岩浆',99999,{tiles:{top:T.lava,bottom:T.lava,side:T.lava},drop:0,sound:'sand',opaque:false,solid:false});
  defBlock(B_GLOWSTONE,'荧石',1.5,{tiles:{top:T.glowstone,bottom:T.glowstone,side:T.glowstone},sound:'glass'});
  defBlock(B_ENDSTONE,'末地石',4,{tiles:{top:T.endstone,bottom:T.endstone,side:T.endstone},tool:'pick',minTier:2,sound:'stone'});
  defBlock(B_FARMLAND,'耕地',0.5,{tiles:{top:T.farmland,bottom:T.dirt,side:T.dirt},tool:'shovel',drop:B_DIRT,sound:'dirt'});
  defBlock(B_CROPS,'小麦',0.05,{tiles:{top:T.crops[0],bottom:T.crops[0],side:T.crops[0]},drop:0,sound:'grass',opaque:false,solid:false});
  defBlock(B_BIRCH_LOG,'白桦原木',2,{tiles:{top:T.birchTop,bottom:T.birchTop,side:T.birchSide},tool:'axe',sound:'wood'});
  defBlock(B_FLOWER,'花丛',0.1,{tiles:{top:T.flower,bottom:T.flower,side:T.flower},sound:'grass'});
  defBlock(B_SPRUCE_LOG,'云杉原木',2,{tiles:{top:T.logTop,bottom:T.logTop,side:T.spruceSide},tool:'axe',sound:'wood'});
  defBlock(B_SPRUCE_LEAVES,'云杉树叶',0.25,{tiles:{top:T.spruceLeaves,bottom:T.spruceLeaves,side:T.spruceLeaves},drop:0,sound:'grass'});
  defBlock(B_JUNGLE_LOG,'丛林原木',2,{tiles:{top:T.logTop,bottom:T.logTop,side:T.jungleSide},tool:'axe',sound:'wood'});
  defBlock(B_ACACIA_LOG,'金合欢原木',2,{tiles:{top:T.logTop,bottom:T.logTop,side:T.acaciaSide},tool:'axe',sound:'wood'});
  defBlock(B_DARK_LOG,'深色橡木原木',2,{tiles:{top:T.logTop,bottom:T.logTop,side:T.darkSide},tool:'axe',sound:'wood'});
  defBlock(B_DARK_LEAVES,'深色橡树树叶',0.25,{tiles:{top:T.darkLeaves,bottom:T.darkLeaves,side:T.darkLeaves},drop:0,sound:'grass'});
  defBlock(B_CHERRY_LOG,'樱花原木',2,{tiles:{top:T.logTop,bottom:T.logTop,side:T.cherrySide},tool:'axe',sound:'wood'});
  defBlock(B_CHERRY_LEAVES,'樱花树叶',0.25,{tiles:{top:T.cherryLeaves,bottom:T.cherryLeaves,side:T.cherryLeaves},drop:0,sound:'grass'});
  for(let b=1;b<=B_ENCHANT;b++)if(b!==B_DOOR_OPEN&&b!==B_BED_HEAD&&b!==B_LAVA&&b!==B_CROPS)blockItemEntry(b);

  // 工具: 镐/斧/剑 × 木/石/铁/金/钻石
  const toolMats=[
    ['wood','木',B_PLANKS,2,1],['stone','石',B_COBBLE,4,2],['iron','铁',I.iron_ingot,6,3],
    ['gold','金',I.gold_ingot,12,1],['diamond','钻石',I.diamond,8,4]];
  const tcol={wood:'#b08b4d',stone:'#8f8f8f',iron:'#e8e8e8',gold:'#ffd94a',diamond:'#4ae8dd'};
  for(const m of toolMats){
    defItem(m[0]+'_pickaxe',m[1]+'镐',{icon:toolIcon('pick',tcol[m[0]]),type:'tool',toolType:'pick',speed:m[3],tier:m[4],dmg:2,maxStack:1});
    defItem(m[0]+'_axe',m[1]+'斧',{icon:toolIcon('axe',tcol[m[0]]),type:'tool',toolType:'axe',speed:m[3],tier:m[4],dmg:3,maxStack:1});
    defItem(m[0]+'_sword',m[1]+'剑',{icon:toolIcon('sword',tcol[m[0]]),type:'tool',toolType:'sword',speed:1,tier:m[4],dmg:2+m[4],maxStack:1});
    defItem(m[0]+'_shovel',m[1]+'锹',{icon:toolIcon('shovel',tcol[m[0]]),type:'tool',toolType:'shovel',speed:m[3],tier:m[4],dmg:1,maxStack:1});
    defItem(m[0]+'_hoe',m[1]+'锄头',{icon:toolIcon('hoe',tcol[m[0]]),type:'tool',toolType:'hoe',speed:1,tier:m[4],dmg:1,maxStack:1});
  }
  // 下界合金工具（最强！不能合成，要用钻石工具+下界合金锭升级）
  defItem('netherite_pickaxe','下界合金镐',{icon:toolIcon('pick','#574b5e'),type:'tool',toolType:'pick',speed:10,tier:5,dmg:3,maxStack:1});
  defItem('netherite_axe','下界合金斧',{icon:toolIcon('axe','#574b5e'),type:'tool',toolType:'axe',speed:10,tier:5,dmg:4,maxStack:1});
  defItem('netherite_sword','下界合金剑',{icon:toolIcon('sword','#574b5e'),type:'tool',toolType:'sword',speed:1,tier:5,dmg:8,maxStack:1});
  defItem('netherite_shovel','下界合金锹',{icon:toolIcon('shovel','#574b5e'),type:'tool',toolType:'shovel',speed:10,tier:5,dmg:2,maxStack:1});
  defItem('netherite_hoe','下界合金锄头',{icon:toolIcon('hoe','#574b5e'),type:'tool',toolType:'hoe',speed:1,tier:5,dmg:2,maxStack:1});

  // 护甲: 五套×4 + 海龟壳 + 下界合金×4
  const armorMats=[
    ['leather','皮革',I.leather,[1,3,2,1]],
    ['chain','锁链',I.iron_nugget,[2,5,4,1]],
    ['iron','铁',I.iron_ingot,[2,6,5,2]],
    ['gold','金',I.gold_ingot,[2,5,3,1]],
    ['diamond','钻石',I.diamond,[3,8,6,3]],
    ['netherite','下界合金',I.netherite_ingot,[4,9,7,4]]];
  const slotNames=['头盔','胸甲','护腿','靴子'];
  const slotKinds=['helmet','chest','legs','boots'];
  for(const m of armorMats){
    for(let s=0;s<4;s++){
      defItem(m[0]+'_'+slotKinds[s],m[1]+slotNames[s],{
        icon:armorIcon(slotKinds[s],MAT_COLOR[m[0]]),type:'armor',armorSlot:s,armorPts:m[3][s],mat:m[0],maxStack:1});
    }
  }
  defItem('turtle_helmet','海龟壳',{icon:armorIcon('helmet',MAT_COLOR.turtle),type:'armor',armorSlot:0,armorPts:2,mat:'turtle',maxStack:1});
}

// ---------------- 合成配方 ----------------
// shaped: {pat:[行字符串], key:{字符:物品id}, out:{id,count}}
// shapeless: {ing:{物品id:数量}, out:{id,count}}
const RECIPES=[];
let curGroup='基础';
function addShaped(pat,key,outId,outCount){
  RECIPES.push({type:'shaped',pat,key,out:{id:outId,count:outCount||1},group:curGroup});
}
function addShapeless(ing,outId,outCount){
  RECIPES.push({type:'shapeless',ing,out:{id:outId,count:outCount||1},group:curGroup});
}
function buildRecipes(){
  curGroup='🌱 基础材料';
  addShapeless({[B_LOG]:1},B_PLANKS,4);
  addShapeless({[B_BIRCH_LOG]:1},B_PLANKS,4); // 白桦木也能做木板
  addShapeless({[B_SPRUCE_LOG]:1},B_PLANKS,4); // 云杉原木做木板
  addShapeless({[B_JUNGLE_LOG]:1},B_PLANKS,4); // 丛林原木做木板
  addShapeless({[B_ACACIA_LOG]:1},B_PLANKS,4); // 金合欢原木做木板
  addShapeless({[B_DARK_LOG]:1},B_PLANKS,4); // 深色橡木原木做木板
  addShapeless({[B_CHERRY_LOG]:1},B_PLANKS,4); // 樱花原木做木板
  addShaped(['P','P'],{P:B_PLANKS},I.stick,4);
  addShaped(['PP','PP'],{P:B_PLANKS},B_TABLE,1);
  addShaped(['CCC','C C','CCC'],{C:B_COBBLE},B_FURNACE,1);
  addShaped(['PPP','P P','PPP'],{P:B_PLANKS},B_CHEST,1); // 8块木板围一圈=箱子
  // 活塞（和我的世界配方一样：3木板+4圆石+1铁锭+1红石粉）
  addShaped(['PPP','CIC','CRC'],{P:B_PLANKS,C:B_COBBLE,I:I.iron_ingot,R:I.redstone},B_PISTON,1);
  // 粘性活塞（和原版一样：活塞+黏液球）
  addShaped(['S','P'],{S:I.slimeball,P:B_PISTON},B_STICKY,1);
  // 羊毛（和原版一样：4条线织成）
  addShaped(['SS','SS'],{S:I.string},B_WOOL,1);
  // 木门（和原版一样：6块木板，给3扇）
  addShaped(['PP','PP','PP'],{P:B_PLANKS},B_DOOR,3);
  // 床（和原版一样：3羊毛+3木板）
  addShaped(['WWW','PPP'],{W:B_WOOL,P:B_PLANKS},B_BED,1);
  addShaped(['OOO','O O','OOO'],{O:B_OBSIDIAN},B_PORTAL,1); // 黑曜石围一圈=下界传送门
  addShaped(['DGD','GOG','DGD'],{D:I.diamond,G:B_GLOWSTONE,O:B_OBSIDIAN},B_ENDPORTAL,1); // 钻石+荧石+黑曜石=末地传送门
  addShaped([' TS','T S',' TS'],{T:I.stick,S:I.string},I.bow,1); // 3木棍+3线=弓
  addShapeless({[I.stick]:1},I.arrow,4); // 木棍做箭
  addShapeless({[I.wheat]:3},I.bread,1); // 三个小麦做面包
  addShapeless({[I.wheat]:1},I.seeds,2); // 一个小麦搓出两颗种子
  addShapeless({[I.iron_ingot]:1},I.iron_nugget,9);
  curGroup='⛏️ 工具（镐 / 斧 / 剑）';
  // 工具
  const toolMats=[B_PLANKS,B_COBBLE,I.iron_ingot,I.gold_ingot,I.diamond];
  const toolKeys=['wood','stone','iron','gold','diamond'];
  for(let i=0;i<5;i++){
    addShaped(['MMM',' S ',' S '],{M:toolMats[i],S:I.stick},I[toolKeys[i]+'_pickaxe'],1);
    addShaped(['MM','MS',' S'],{M:toolMats[i],S:I.stick},I[toolKeys[i]+'_axe'],1);
    addShaped(['M','M','S'],{M:toolMats[i],S:I.stick},I[toolKeys[i]+'_sword'],1);
    addShaped(['M','S','S'],{M:toolMats[i],S:I.stick},I[toolKeys[i]+'_shovel'],1); // 铲子：1材料+2棍
    addShaped(['MM',' S',' S'],{M:toolMats[i],S:I.stick},I[toolKeys[i]+'_hoe'],1); // 锄头：2材料+2棍
  }
  // 护甲: 材料 → 4 部位
  const armorSets=[
    [I.leather,'leather'],[I.iron_nugget,'chain'],[I.iron_ingot,'iron'],[I.gold_ingot,'gold'],[I.diamond,'diamond']];
  const pats=[['MMM','M M'],['M M','MMM','MMM'],['MMM','M M','M M'],['M M','M M']];
  const kinds=['helmet','chest','legs','boots'];
  for(const s of armorSets)for(let k=0;k<4;k++)
    addShaped(pats[k],{M:s[0]},I[s[1]+'_'+kinds[k]],1);
  // 海龟壳
  curGroup='🐢 海龟壳';
  addShaped(['MMM','M M'],{M:I.scute},I.turtle_helmet,1);
  // 树脂块（苍白花园更新）
  curGroup='🧡 树脂（打嘎吱怪掉树脂团）';
  addShaped(['RR','RR'],{R:I.resin_clump},B_RESIN,1);
  // 下界合金
  curGroup='🔥 下界合金';
  addShapeless({[I.netherite_scrap]:4,[I.gold_ingot]:4},I.netherite_ingot,1);
  for(const k of kinds)
    addShapeless({[I['diamond_'+k]]:1,[I.netherite_ingot]:1},I['netherite_'+k],1);
  // 下界合金工具升级：钻石工具+下界合金锭
  for(const k of ['pickaxe','axe','sword','shovel','hoe'])
    addShapeless({[I['diamond_'+k]]:1,[I.netherite_ingot]:1},I['netherite_'+k],1);
  // ✨ 附魔
  curGroup='✨ 附魔';
  addShapeless({[I.leather]:1,[I.string]:2},I.book,1); // 皮革+线缝成书
  addShaped([' B ','DOD','OOO'],{B:I.book,D:I.diamond,O:B_OBSIDIAN},B_ENCHANT,1); // 书+2钻石+4黑曜石=附魔台
}
// 熔炉烧炼表
const SMELT={};
function buildSmelt(){
  SMELT[B_IRON_ORE]=I.iron_ingot;
  SMELT[B_GOLD_ORE]=I.gold_ingot;
  SMELT[B_DEBRIS]=I.netherite_scrap;
  SMELT[B_SAND]=B_GLASS;
  SMELT[I.rotten_flesh]=I.leather; // 腐肉烧成皮革
  SMELT[B_LOG]=I.charcoal;
}
const FUEL={};
function buildFuel(){
  FUEL[I.coal]=8;FUEL[I.charcoal]=8;FUEL[B_LOG]=2;FUEL[B_PLANKS]=2;FUEL[I.stick]=1;
}

