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

// ---------------- 🎵 背景音乐（自动生成的小钢琴曲：白天明亮、夜晚神秘，还会一个乐句一个乐句地弹） ----------------
function bgmBus(){ // 带一点点回声的通道，声音听起来更空旷、更柔和
  const c=ac();if(!c)return null;
  if(BGM.bus)return BGM.bus;
  const dry=c.createGain();dry.gain.value=0.9;
  const dl=c.createDelay(1);dl.delayTime.value=0.27;
  const fb=c.createGain();fb.gain.value=0.3;
  const wet=c.createGain();wet.gain.value=0.3;
  const out=c.createGain();out.gain.value=1;
  dry.connect(out);dry.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(wet);wet.connect(out);
  out.connect(c.destination);
  BGM.bus=dry;
  return dry;
}
function bgmNote(f,dur,vol,type,delay){ // 一个柔和的琴音：轻轻响起、轻轻消失（不会"咔"一下）
  const c=ac();if(!c)return;
  const bus=bgmBus();if(!bus)return;
  const t0=c.currentTime+(delay||0);
  const o=c.createOscillator(),o2=c.createOscillator(),g=c.createGain(),g2=c.createGain();
  o.type=type||'triangle';o.frequency.value=f;
  o2.type='sine';o2.frequency.value=f*2.003; // 高八度陪衬，差一点点音高会更柔
  g2.gain.value=0.22;
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol,t0+0.07); // 慢慢起音
  g.gain.setValueAtTime(vol,t0+Math.max(0.07,dur*0.35));
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur); // 慢慢收尾
  o.connect(g);o2.connect(g2);g2.connect(g);g.connect(bus);
  o.start(t0);o2.start(t0);o.stop(t0+dur+0.05);o2.stop(t0+dur+0.05);
}
const BGM={
  on:true,timer:null,nextT:0,bar:0,bus:null,
  mood:'day',moodT:0,melIdx:4,phraseLeft:0,
  scales:{ // 三种心情的音阶
    day:[0,2,4,7,9,12,14,16,19],   // 白天：明亮的五声音阶
    night:[0,3,5,7,10,12,15,17],  // 夜晚：神秘的小调音阶
    fun:[0,2,5,7,9,12,14,17]      // 活泼：跳跃的五声
  },
  bases:{day:220,night:174.6,fun:246.9},
  chordRoots:[0,-4,-7,-2], // 低音和弦轮流走：稳稳的 → 温柔 → 下沉 → 回来
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick(),200);},
  tick(){
    if(!this.on||typeof started==='undefined'||!started||document.hidden)return;
    const c=ac();if(!c)return;
    const now=c.currentTime;
    if(now<this.nextT)return;
    // 选心情：夜里自动变成神秘的曲子，白天在「明亮」和「活泼」之间慢慢换
    this.moodT++;
    const isNight=typeof dayTime!=='undefined'&&dayTime>0.55&&dayTime<0.95;
    const want=isNight?'night':((this.moodT/24|0)%2===0?'day':'fun');
    if(want!==this.mood){this.mood=want;this.phraseLeft=0;} // 换曲子啦
    const sc=this.scales[this.mood],base=this.bases[this.mood];
    // 每 4 拍铺一个软软的双音和弦垫底（让音乐厚厚的）
    if(this.bar%4===0){
      const r=this.chordRoots[(this.bar/4|0)%4];
      const f=base*0.5*Math.pow(2,r/12);
      bgmNote(f,5.5,0.045,'sine');
      bgmNote(f*1.4983,5.5,0.026,'sine',0.09); // 五度和音
    }
    this.bar++;
    // 旋律：像走路一样一个音一个音地挪，偶尔跳一下——这样听起来像真的曲子，不是乱弹
    if(this.phraseLeft<=0)this.phraseLeft=2+((Math.random()*4)|0); // 一个乐句 2~5 个音
    this.phraseLeft--;
    const step=Math.random()<0.7?(Math.random()<0.5?-1:1):(Math.random()<0.5?-2:2);
    this.melIdx=Math.max(0,Math.min(sc.length-1,this.melIdx+step));
    const f=base*Math.pow(2,sc[this.melIdx]/12);
    const dur=1.6+Math.random()*1.8;
    bgmNote(f,dur,this.mood==='night'?0.05:0.06,'triangle');
    // 偶尔叠一个三度和音，或者一闪一闪的高音
    if(Math.random()<0.2){
      const hi=Math.min(sc.length-1,this.melIdx+2);
      bgmNote(base*Math.pow(2,sc[hi]/12),dur*0.9,0.03,'triangle',0.03);
    }
    if(Math.random()<0.22)bgmNote(f*2,dur*0.6,0.014,'sine',0.12);
    // 乐句弹完就休息久一点，跟真的我的世界音乐一样不急不忙
    const rest=this.phraseLeft<=0?2.4+Math.random()*2.6:0.55+Math.random()*0.95;
    this.nextT=now+rest*(this.mood==='night'?1.35:1);
  }
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
  // 🌵 仙人掌：沙漠里的绿柱子
  T.cactus=makeTile(ctx=>{
    noisyBase(ctx,[46,128,50],0.25,55);
    for(let x=2;x<16;x+=4)for(let y=0;y<16;y++)px(ctx,x,y,'#2a7a30'); // 深色竖条纹
    speckle(ctx,10,[120,200,110],61);
    speckle(ctx,6,[220,240,210],63); // 小刺
  });
  // 🍀 幸运方块：黄黄的，上面一个大大的问号！
  function paintQ(ctx,color){
    ctx.fillStyle=color;
    // 问号：弯弯的上半 + 下面一点
    ctx.fillRect(6,3,4,1);ctx.fillRect(5,4,1,2);ctx.fillRect(10,4,1,2);
    ctx.fillRect(8,6,2,1);ctx.fillRect(7,7,2,2);
    ctx.fillRect(7,11,2,2);
  }
  T.lucky=makeTile(ctx=>{
    noisyBase(ctx,[240,200,40],0.25,88);
    speckle(ctx,10,[255,240,140],89);
    paintQ(ctx,'#7a5a10');
  });
  T.luckySuper=makeTile(ctx=>{
    noisyBase(ctx,[255,220,90],0.3,90);
    speckle(ctx,14,[255,255,220],91); // 闪闪金光
    speckle(ctx,8,[255,180,30],92);
    paintQ(ctx,'#ffffff');
  });
  T.unlucky=makeTile(ctx=>{
    noisyBase(ctx,[70,50,90],0.3,93); // 暗暗的紫色，一看就不吉利
    speckle(ctx,10,[120,80,160],94);
    paintQ(ctx,'#2a1a3a');
  });
  T.luckyDiamond=makeTile(ctx=>{
    noisyBase(ctx,[90,220,230],0.3,95); // 💎 钻石蓝！
    speckle(ctx,12,[220,255,255],96);
    paintQ(ctx,'#1a6a7a');
  });
  T.luckyRainbow=makeTile(ctx=>{
    const cols=['#e04040','#e09030','#e0d040','#40c050','#4090e0','#9040d0'];
    for(let i=0;i<6;i++){ctx.fillStyle=cols[i];ctx.fillRect(0,i*3,16,3);}
    speckle(ctx,8,[255,255,255],97);
    paintQ(ctx,'#ffffff');
  });
  T.luckyTnt=makeTile(ctx=>{
    noisyBase(ctx,[200,50,40],0.3,98); // 🧨 红红的，一看就会炸！
    speckle(ctx,10,[255,150,60],99);
    paintQ(ctx,'#5a1010');
  });
  T.luckyMob=makeTile(ctx=>{
    noisyBase(ctx,[120,200,90],0.3,100); // 👾 绿绿的，会蹦出生物！
    speckle(ctx,10,[200,255,180],101);
    paintQ(ctx,'#3a5a20');
  });
  // 海晶石：蓝绿色的海底石头，有一格一格的花纹（海底神殿专用！）
  T.prism=makeTile(ctx=>{
    noisyBase(ctx,[62,150,160],0.3,77);
    ctx.fillStyle='#2a7a88';
    for(let i=0;i<16;i+=5){ctx.fillRect(i,0,1,16);ctx.fillRect(0,i,16,1);} // 格子花纹
    speckle(ctx,10,[120,220,225],81);
    speckle(ctx,6,[20,90,100],83);
  });
  // 压力板：边边画成沙子的颜色，只有中间一小块灰板子——看起来就小小的！
  T.plate=makeTile(ctx=>{
    noisyBase(ctx,[222,196,122],0.22,66); // 和沙子一样的底色
    speckle(ctx,['#e8d48e','#c9a860'],20,67);
    ctx.fillStyle='#b8b8b0';
    ctx.fillRect(3,3,10,10); // 中间的小板子
    ctx.fillStyle='#c8c8c0';
    ctx.fillRect(4,4,8,8); // 亮亮的面
    ctx.fillStyle='#7a7a72';
    ctx.fillRect(7,7,2,2); // 中间的按钮
  });
  // 幽匿方块：黑黑的深蓝绿色，上面有发光的蓝点点（远古城市专用！）
  T.sculk=makeTile(ctx=>{
    noisyBase(ctx,[10,32,36],0.35,88);
    speckle(ctx,14,[16,60,66],91);
    speckle(ctx,6,[30,190,180],97); // 发光的蓝绿色小点点
    speckle(ctx,4,[5,16,20],99);
  });
  // 红石粉：撒在地上的红点阵（透明底，像小麦一样贴在方块上）
  T.redstoneDust=makeTile(ctx=>{
    ctx.clearRect(0,0,16,16);
    ctx.fillStyle='#d42020';ctx.fillRect(7,7,2,2); // 中间一颗
    ctx.fillStyle='#a81515';
    ctx.fillRect(7,3,2,2);ctx.fillRect(7,11,2,2);ctx.fillRect(3,7,2,2);ctx.fillRect(11,7,2,2);
    ctx.fillStyle='#e04040';
    ctx.fillRect(5,5,1,1);ctx.fillRect(10,5,1,1);ctx.fillRect(5,10,1,1);ctx.fillRect(10,10,1,1);
    ctx.fillRect(7,1,2,1);ctx.fillRect(7,14,2,1);ctx.fillRect(1,7,1,2);ctx.fillRect(14,7,1,2);
  });
  T.empty=makeTile(ctx=>{ctx.clearRect(0,0,16,16);});
  // 金属块：亮面+深色边框，一看就很值钱
  const metalBlock=(base,dark,light)=>makeTile(ctx=>{
    noisyBase(ctx,base,0.08,17);
    ctx.fillStyle=dark;ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);ctx.fillRect(0,0,1,16);ctx.fillRect(15,0,1,16);
    ctx.fillStyle=light;ctx.fillRect(1,1,14,1);ctx.fillRect(1,1,1,14);
    ctx.fillStyle=dark;ctx.fillRect(3,3,10,1);ctx.fillRect(3,3,1,10);
    ctx.fillStyle=light;ctx.fillRect(3,12,10,1);ctx.fillRect(12,3,1,10);
  });
  T.ironBlock=metalBlock([228,228,224],'#8a8a86','#ffffff');
  T.goldBlock=metalBlock([255,217,74],'#b8890a','#fff2a8');
  T.diamondBlock=metalBlock([74,232,221],'#1a9a90','#c8fff8');
  T.netheriteBlock=metalBlock([87,75,94],'#3a323e','#8a7a96');
  T.infinityBlock=metalBlock([181,106,232],'#5a2a80','#e8c0ff');
  T.infinityOre=oreTile('#b46ae8',31); // 紫色矿点的无尽贪婪矿石
  T.emeraldOre=oreTile('#2ad84a',37); // 绿色矿点的绿宝石矿石
  T.emeraldBlock=metalBlock([42,200,74],'#1a7a3a','#aaffcc');
  T.tnt=makeTile(ctx=>{ // TNT侧面：红红的一圈+白腰带
    noisyBase(ctx,[200,50,30],0.25,41);
    ctx.fillStyle='#f0e0c0';ctx.fillRect(0,6,16,4);
    ctx.fillStyle='#3a2a20';ctx.font='bold 5px monospace';ctx.fillText('TNT',2,10);
  });
  T.tntTop=makeTile(ctx=>{ // TNT顶面：红+黑引线
    noisyBase(ctx,[200,50,30],0.25,43);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(7,7,2,2);
  });
  T.superTnt=makeTile(ctx=>{ // 超级TNT：紫红相间，一看就很危险
    noisyBase(ctx,[150,30,90],0.3,47);
    ctx.fillStyle='#ffe080';ctx.fillRect(0,6,16,4);
    ctx.fillStyle='#3a1a20';ctx.font='bold 4px monospace';ctx.fillText('SUPER',1,10);
  });
  T.altar=makeTile(ctx=>{ // 祭坛顶面：黑底紫色符文
    noisyBase(ctx,[24,16,40],0.3,53);
    px(ctx,4,4,'#b46ae8');px(ctx,11,4,'#b46ae8');px(ctx,4,11,'#b46ae8');px(ctx,11,11,'#b46ae8');
    ctx.fillStyle='#8a3fd0';ctx.fillRect(6,6,4,4);
    px(ctx,7,7,'#e0b0ff');px(ctx,8,8,'#e0b0ff');
  });
  T.command=makeTile(ctx=>{ // 命令方块：橙色小灯阵
    noisyBase(ctx,[190,110,50],0.2,59);
    for(let y=2;y<14;y+=3)for(let x=2;x<14;x+=3)px(ctx,x,y,'#ffe8b0');
    ctx.fillStyle='#7a4a20';ctx.fillRect(0,0,16,1);ctx.fillRect(0,15,16,1);
  });
  T.bomb=makeTile(ctx=>{ // 恐怖炸弹：黑色大炸弹+骷髅感
    noisyBase(ctx,[40,30,50],0.3,61);
    ctx.fillStyle='#c576f0';ctx.fillRect(0,6,16,4);
    ctx.fillStyle='#e8e8e8';ctx.fillRect(5,7,2,2);ctx.fillRect(9,7,2,2);
    ctx.fillStyle='#2a1a30';ctx.fillRect(7,9,2,1);
  });
  T.brew=makeTile(ctx=>{ // 酿造台：深色底座+三根杆子
    noisyBase(ctx,[60,55,70],0.3,67);
    ctx.fillStyle='#3a3544';ctx.fillRect(2,11,12,4); // 底座
    ctx.fillStyle='#8a8a9a';ctx.fillRect(7,3,2,8); // 中间杆子
    ctx.fillStyle='#6a6a7a';ctx.fillRect(3,6,2,5);ctx.fillRect(11,6,2,5); // 旁边两根
    ctx.fillStyle='#c9a020';ctx.fillRect(7,2,2,1);
  });


  // ================= yangcraft 移植纹理 =================
  T.redstoneBlock=makeTile(ctx=>{
    noisyBase(ctx,[190,30,25],0.25,102); // 🟥 红石块：红红的还发光
    speckle(ctx,12,[255,90,70],103);
    speckle(ctx,6,[255,200,180],104);
  });
  T.orePortal=makeTile(ctx=>{
    noisyBase(ctx,[60,220,255],0.35,105); // 🌀 矿石维度传送门：蓝蓝亮亮的旋涡
    speckle(ctx,10,[255,255,255],106);
    speckle(ctx,8,[255,200,255],107);
    ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillRect(7,2,2,12);ctx.fillRect(2,7,12,2); // 亮十字
  });
  T.fire=makeTile(ctx=>{
    // 🔥 火苗形状：透明底，外面橙、里面黄、中间白，像真的火！
    ctx.fillStyle='#ff7a10';
    ctx.beginPath();ctx.moveTo(8,15);ctx.lineTo(3,11);ctx.lineTo(4,7);ctx.lineTo(6,8);ctx.lineTo(7,2);ctx.lineTo(9,5);ctx.lineTo(11,3);ctx.lineTo(13,11);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffc832';
    ctx.beginPath();ctx.moveTo(8,15);ctx.lineTo(5,11);ctx.lineTo(8,6);ctx.lineTo(11,11);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff6c8';ctx.fillRect(7,11,2,4);
  });
  T.torch=makeTile(ctx=>{
    ctx.clearRect(0,0,16,16);
    ctx.fillStyle='#6a4a28';ctx.fillRect(7,6,2,10); // 棍子
    ctx.fillStyle='#ffd94a';ctx.fillRect(6,2,4,5); // 火苗
    ctx.fillStyle='#ff9c2a';ctx.fillRect(7,3,2,4);
    ctx.fillStyle='#fff8d0';ctx.fillRect(7,3,1,2);
  });
  T.copier=makeTile(ctx=>{
    noisyBase(ctx,[200,90,220],0.25,111); // 📋 复制方块：粉紫色，有扫描线
    ctx.fillStyle='#7a2a9a';ctx.fillRect(2,2,12,2);ctx.fillRect(2,12,12,2);ctx.fillRect(2,2,2,12);ctx.fillRect(12,2,2,12); // 边框
    ctx.fillStyle='#ffd0ff';ctx.fillRect(5,7,6,2); // 扫描线
    ctx.fillStyle='#ffffff';ctx.fillRect(7,4,2,2);ctx.fillRect(7,10,2,2); // 上下两个小箭头点
  });
  // 🧨 各种TNT：红红的身体 + 不同颜色的腰带
  function paintTnt(ctx,base,stripe,seed){
    noisyBase(ctx,base,0.25,seed);
    ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(0,0,16,2);ctx.fillRect(0,14,16,2); // 上下黑边
    ctx.fillStyle=stripe;ctx.fillRect(0,6,16,4); // 中间的腰带
    ctx.fillStyle='#ffffff';ctx.font='bold 6px monospace';ctx.fillText('TNT',3,9.5);
  }
  T.tntBig=makeTile(ctx=>paintTnt(ctx,[150,30,30],'#ffd000',120));
  T.tntFire=makeTile(ctx=>paintTnt(ctx,[200,60,10],'#ffdd33',121));
  T.tntIce=makeTile(ctx=>paintTnt(ctx,[120,180,230],'#ffffff',122));
  T.tntLightning=makeTile(ctx=>paintTnt(ctx,[230,200,40],'#ffffff',123));
  T.tntMob=makeTile(ctx=>paintTnt(ctx,[40,120,40],'#1a3a1a',124));
  T.tntAnimal=makeTile(ctx=>paintTnt(ctx,[240,150,180],'#ffffff',125));
  T.tntDiamond=makeTile(ctx=>paintTnt(ctx,[80,220,230],'#ffffff',126));
  T.tntHouse=makeTile(ctx=>paintTnt(ctx,[160,110,60],'#7a5a30',127));
  T.tntRainbow=makeTile(ctx=>{paintTnt(ctx,[200,60,160],'#ffd000',128);const rc=['#ff4040','#ffa030','#ffe040','#40c040','#4090ff','#a060ff'];for(let i=0;i<6;i++){ctx.fillStyle=rc[i];ctx.fillRect(1+i*2.4,1,2.4,3);}});
  T.tntFlood=makeTile(ctx=>paintTnt(ctx,[40,110,220],'#bfe8ff',129));
  T.tntLava=makeTile(ctx=>paintTnt(ctx,[200,70,10],'#ffdd44',130));
  T.tntHole=makeTile(ctx=>paintTnt(ctx,[25,15,40],'#a060ff',131));
  T.tntFirework=makeTile(ctx=>paintTnt(ctx,[220,40,90],'#ffe080',132));
  T.tntFood=makeTile(ctx=>paintTnt(ctx,[200,130,40],'#fff0c0',133));
  T.tntChest=makeTile(ctx=>paintTnt(ctx,[150,110,30],'#ffd700',134));
  T.tntTp=makeTile(ctx=>paintTnt(ctx,[80,220,190],'#ffffff',135));
  T.copperOre=oreTile('#e08850',140); // 🟠 铜矿石：橙色的点点
  T.lapisOre=oreTile('#3a5ad8',141); // 🔵 青金石矿石：深蓝色的点点
  T.copperBlock=metalBlock([224,136,80],'#a05a28','#ffc898'); // 🟠 铜块
  T.lapisBlock=metalBlock([58,90,216],'#26338a','#9ab0ff'); // 🔵 青金石块
  T.paleLeaves=makeTile(ctx=>{noisyBase(ctx,[168,172,176],0.18,150);speckle(ctx,['#c8ccd0','#8a8e92'],6,151);}); // 🩶 灰色树叶
  T.creakHeart=makeTile(ctx=>{ // 🧡 嘎吱核心：灰白木头+橙色眼睛
    noisyBase(ctx,[200,198,190],0.15,152);
    ctx.fillStyle='#8a8578';ctx.fillRect(0,0,16,2);ctx.fillRect(0,14,16,2);
    ctx.fillStyle='#ff8c1a';ctx.fillRect(5,5,6,6); // 橙色大眼
    ctx.fillStyle='#ffd94a';ctx.fillRect(6,6,4,4);
    ctx.fillStyle='#3a2a1a';ctx.fillRect(7,7,2,2); // 黑眼珠
  });
  T.rod=makeTile(ctx=>{ // ⚡ 避雷针：铜色细杆+亮亮的尖头
    ctx.clearRect(0,0,16,16);
    ctx.fillStyle='#8a5a30';ctx.fillRect(7,10,2,6); // 深棕色杆脚
    ctx.fillStyle='#e08850';ctx.fillRect(7,4,2,6); // 铜杆
    ctx.fillStyle='#ffc898';ctx.fillRect(7,4,1,6); // 高光
    ctx.fillStyle='#ffe8a0';ctx.fillRect(6,1,4,3); // 发光的尖头
    ctx.fillStyle='#ffffff';ctx.fillRect(7,1,2,2);
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
      B_FARMLAND=45,B_CROPS=46,B_CHEST=47,B_ENCHANT=48,B_REDSTONE=49,
      B_IRON_BLOCK=50,B_GOLD_BLOCK=51,B_DIAMOND_BLOCK=52,B_NETHERITE_BLOCK=53,B_INFINITY_BLOCK=54,
      B_INFINITY_ORE=55,B_EMERALD_ORE=56,B_EMERALD_BLOCK=57,
      B_TNT=58,B_SUPER_TNT=59,B_ALTAR=60,B_COMMAND=61,B_BOMB=62,B_BREW=63,B_SCULK=64,
      B_CACTUS=65,B_PLATE=66,B_PRISM=67,
      B_LUCKY=68,B_LUCKY_SUPER=69,B_UNLUCKY=70,
      B_LUCKY_DIAMOND=71,B_LUCKY_RAINBOW=72,B_LUCKY_TNT=73,B_LUCKY_MOB=74,
      B_SAPLING=75, // 树苗（原 49 让位给红石粉，挪到 75；空岛存档里旧树苗 id 49 需迁移）
      B_OREPORTAL=76,B_FIRE=77,B_TORCH=78,B_COPIER=79,
      B_TNT_BIG=80,B_TNT_FIRE=81,B_TNT_ICE=82,B_TNT_LIGHTNING=83,B_TNT_MOB=84,B_TNT_ANIMAL=85,B_TNT_DIAMOND=86,B_TNT_HOUSE=87,
      B_TNT_RAINBOW=88,B_TNT_FLOOD=89,B_TNT_LAVA=90,B_TNT_HOLE=91,B_TNT_FIREWORK=92,B_TNT_FOOD=93,B_TNT_CHEST=94,B_TNT_TP=95,
      B_COPPER_ORE=96,B_LAPIS_ORE=97,B_COPPER_BLOCK=98,B_LAPIS_BLOCK=99,
      B_REDSTONE_BLOCK=100,
      B_CREAK_HEART=101,B_PALE_LEAVES=102,B_ROD=103; // ⚡ 避雷针：闪电都往它身上劈！
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
const MAT_COLOR={leather:'#9a6335',chain:'#b9b9b9',iron:'#e8e8e8',gold:'#ffd94a',diamond:'#4ae8dd',netherite:'#574b5e',turtle:'#3f9e46',wood:'#b08b4d',stone:'#8f8f8f',infinity:'#b46ae8',god:'#ffe8a0',storm:'#7a4ae8',redstone:'#e83a2a',coal:'#2b2b2b',emerald:'#3ac85a',copper:'#e08850',lapis:'#3a5ad8',obsidian:'#3a2a5e',bedrock:'#6a6a6a',titan:'#c04ae8'};
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
    food:opt.food||0,          // 能吃的东西：回复的生命值
    mod:opt.mod||null,         // 属于哪个模组（him/storm/lucky），模组没开就藏起来
    potion:opt.potion||null,   // 药水效果：heal/poison/jump/speed/harm/slow
    hideInCreative:opt.hideInCreative||false,
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
    }else if(kind==='spear'){ // 长矛：细细的杆+尖尖的头
      P(ctx,-1,-6,2,1,color); // 矛尖
      P(ctx,-1.5,-5,3,4,color);P(ctx,-1.5,-5,1.5,4,'#ffffff66'); // 矛头（材料的颜色！）
      P(ctx,-1,-1,2,10,'#a5824d');P(ctx,-1,-1,1,10,'#c4a26a'); // 细长的矛杆
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
  defItem('sapling','树苗',{icon:ctx=>{ // 空岛核心：打树叶掉落，种下能长成树
    ctx.fillStyle='#8a5a2a';ctx.fillRect(7,9,2,5);ctx.fillRect(6,10,1,2);
    ctx.fillStyle='#5aaa3a';ctx.fillRect(5,5,6,5);ctx.fillRect(6,4,4,2);
    ctx.fillStyle='#7acc5a';ctx.fillRect(6,6,2,2);ctx.fillRect(9,7,1,1);
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
  },type:'gun',gun:{dmg:8,cd:0.35,clip:10,reload:1.1,spread:0.05,range:40}});
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
  },type:'mine',maxStack:5}); // 捡枪模式：捡一次 5 颗，用完消失
  defItem('missile','追踪导弹',{icon:ctx=>{ // 白色细长弹体 + 红色弹头 + 尾翼
    ctx.fillStyle='#e8e8e8';ctx.fillRect(3,5,10,6); // 弹身
    ctx.fillStyle='#f0f0f0';ctx.fillRect(4,5,8,1);
    ctx.fillStyle='#b03030';ctx.fillRect(10,5,3,6); // 红色弹头
    ctx.fillStyle='#8a8a8a';ctx.fillRect(3,3,1,10); // 尾翼
    ctx.fillStyle='#ff8a30';ctx.fillRect(2,6,1,4); // 尾焰
  },type:'missile',maxStack:3,gun:{dmg:26,cd:1.5,clip:3,reload:2.0,spread:0,range:0}});
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
  },maxStack:64,food:3});
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
  defBlock(B_SAPLING,'树苗',0.1,{tiles:{top:T.leaves,bottom:T.leaves,side:T.leaves},drop:I.sapling,sound:'grass',opaque:false,solid:false});
  defBlock(B_REDSTONE,'红石粉',0.05,{tiles:{top:T.redstoneDust,bottom:T.empty,side:T.empty},drop:I.redstone,sound:'grass',opaque:false,solid:false});
  defBlock(B_TNT,'TNT',1,{tiles:{top:T.tntTop,bottom:T.tntTop,side:T.tnt},sound:'wood'}); // 点一下就爆炸！
  defBlock(B_SUPER_TNT,'超级TNT',1,{tiles:{top:T.tntTop,bottom:T.tntTop,side:T.superTnt},sound:'wood'}); // 更大爆炸
  defBlock(B_BOMB,'恐怖炸弹',1.5,{tiles:{top:T.tntTop,bottom:T.tntTop,side:T.bomb},sound:'wood'}); // 对付凋零风暴的终极武器
  defBlock(B_ALTAR,'凋零风暴祭坛',8,{tiles:{top:T.altar,bottom:T.obsidian,side:T.obsidian},tool:'pick',minTier:4,sound:'stone'});
  defBlock(B_COMMAND,'命令方块',Infinity,{tiles:{top:T.command,bottom:T.command,side:T.command},drop:0,sound:'stone'});
  defBlock(B_BREW,'酿造台',1.5,{tiles:{top:T.brew,bottom:T.brew,side:T.brew},tool:'pick',minTier:1,sound:'stone'}); // 女巫小屋里有，也能自己合成
  defBlock(B_IRON_BLOCK,'铁块',5,{tiles:{top:T.ironBlock,bottom:T.ironBlock,side:T.ironBlock},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_GOLD_BLOCK,'金块',5,{tiles:{top:T.goldBlock,bottom:T.goldBlock,side:T.goldBlock},tool:'pick',minTier:2,sound:'stone'});
  defBlock(B_DIAMOND_BLOCK,'钻石块',6,{tiles:{top:T.diamondBlock,bottom:T.diamondBlock,side:T.diamondBlock},tool:'pick',minTier:2,sound:'stone'});
  defBlock(B_NETHERITE_BLOCK,'下界合金块',15,{tiles:{top:T.netheriteBlock,bottom:T.netheriteBlock,side:T.netheriteBlock},tool:'pick',minTier:4,sound:'stone'});
  defBlock(B_INFINITY_BLOCK,'无尽贪婪块',20,{tiles:{top:T.infinityBlock,bottom:T.infinityBlock,side:T.infinityBlock},tool:'pick',minTier:4,sound:'stone'});
  defBlock(B_INFINITY_ORE,'无尽贪婪矿石',12,{tiles:{top:T.infinityOre,bottom:T.infinityOre,side:T.infinityOre},tool:'pick',minTier:4,drop:I.infinity_ingot,sound:'stone'}); // 要用下界合金镐挖
  defBlock(B_EMERALD_ORE,'绿宝石矿石',6,{tiles:{top:T.emeraldOre,bottom:T.emeraldOre,side:T.emeraldOre},tool:'pick',minTier:2,drop:I.emerald,sound:'stone'}); // 铁镐就能挖
  defBlock(B_EMERALD_BLOCK,'绿宝石块',6,{tiles:{top:T.emeraldBlock,bottom:T.emeraldBlock,side:T.emeraldBlock},tool:'pick',minTier:2,sound:'stone'});
  defBlock(B_SCULK,'幽匿方块',1.2,{tiles:{top:T.sculk,bottom:T.sculk,side:T.sculk},sound:'stone'}); // 远古城市的黑地板
  defBlock(B_CACTUS,'仙人掌',0.6,{tiles:{top:T.cactus,bottom:T.cactus,side:T.cactus},sound:'grass'}); // 🌵 沙漠里的仙人掌
  defBlock(B_PLATE,'压力板',0.5,{tiles:{top:T.plate,bottom:T.plate,side:T.plate},sound:'stone'}); // ⚠ 沙漠神殿的陷阱：踩上去会爆炸！
  defBlock(B_PRISM,'海晶石',1.8,{tiles:{top:T.prism,bottom:T.prism,side:T.prism},sound:'stone'}); // 🌊 海底神殿的蓝色石头
  defBlock(B_LUCKY,'幸运方块',0.8,{tiles:{top:T.lucky,bottom:T.lucky,side:T.lucky},sound:'stone'}); // 🍀 挖掉有惊喜！
  defBlock(B_LUCKY_SUPER,'超级幸运方块',0.8,{tiles:{top:T.luckySuper,bottom:T.luckySuper,side:T.luckySuper},sound:'stone'}); // ✨ 好运翻倍！
  defBlock(B_UNLUCKY,'倒霉方块',0.8,{tiles:{top:T.unlucky,bottom:T.unlucky,side:T.unlucky},sound:'stone'}); // 💀 千万别挖……吧？
  defBlock(B_LUCKY_DIAMOND,'钻石幸运方块',0.8,{tiles:{top:T.luckyDiamond,bottom:T.luckyDiamond,side:T.luckyDiamond},sound:'stone'}); // 💎 几乎都是传说装备！
  defBlock(B_LUCKY_RAINBOW,'彩虹幸运方块',0.8,{tiles:{top:T.luckyRainbow,bottom:T.luckyRainbow,side:T.luckyRainbow},sound:'stone'}); // 🌈 一次抽两回！
  defBlock(B_LUCKY_TNT,'炸弹幸运方块',0.8,{tiles:{top:T.luckyTnt,bottom:T.luckyTnt,side:T.luckyTnt},sound:'stone'}); // 🧨 轰！快跑！
  defBlock(B_LUCKY_MOB,'生物幸运方块',0.8,{tiles:{top:T.luckyMob,bottom:T.luckyMob,side:T.luckyMob},sound:'stone'}); // 👾 会蹦出好多生物！
  // ---------- yangcraft 移植方块 ----------
  defBlock(B_OREPORTAL,'矿石维度传送门',1.2,{tiles:{top:T.orePortal,bottom:T.orePortal,side:T.orePortal},sound:'glass',opaque:false,solid:false,drop:0});
  defBlock(B_FIRE,'火',0.1,{tiles:{top:T.fire,bottom:T.fire,side:T.fire},sound:'grass',opaque:false,solid:false,drop:0});
  defBlock(B_TORCH,'火把',0.05,{tiles:{top:T.torch,bottom:T.torch,side:T.torch},sound:'wood',opaque:false,solid:false});
  defBlock(B_COPIER,'复制方块',1.0,{tiles:{top:T.copier,bottom:T.copier,side:T.copier},sound:'stone'}); // 📋 两个复制方块中间会变出你要的方块！
  defBlock(B_TNT_BIG,'超级大大TNT',0.5,{tiles:{top:T.tntBig,bottom:T.tntBig,side:T.tntBig},sound:'grass'}); // 🧨 超巨大爆炸！
  defBlock(B_TNT_FIRE,'火焰TNT',0.5,{tiles:{top:T.tntFire,bottom:T.tntFire,side:T.tntFire},sound:'grass'}); // 🔥 炸完还着火！
  defBlock(B_TNT_ICE,'冰冻TNT',0.5,{tiles:{top:T.tntIce,bottom:T.tntIce,side:T.tntIce},sound:'grass'}); // 🧊 把怪物冻住！
  defBlock(B_TNT_LIGHTNING,'雷电TNT',0.5,{tiles:{top:T.tntLightning,bottom:T.tntLightning,side:T.tntLightning},sound:'grass'}); // ⚡ 召唤好多闪电！
  defBlock(B_TNT_MOB,'怪物TNT',0.5,{tiles:{top:T.tntMob,bottom:T.tntMob,side:T.tntMob},sound:'grass'}); // 👹 蹦出一群怪物！
  defBlock(B_TNT_ANIMAL,'动物TNT',0.5,{tiles:{top:T.tntAnimal,bottom:T.tntAnimal,side:T.tntAnimal},sound:'grass'}); // 🐷 蹦出一群小动物！
  defBlock(B_TNT_DIAMOND,'钻石TNT',0.5,{tiles:{top:T.tntDiamond,bottom:T.tntDiamond,side:T.tntDiamond},sound:'grass'}); // 💎 炸出钻石矿！
  defBlock(B_TNT_HOUSE,'房子TNT',0.5,{tiles:{top:T.tntHouse,bottom:T.tntHouse,side:T.tntHouse},sound:'grass'}); // 🏠 啵！变出一座房子！
  defBlock(B_TNT_RAINBOW,'彩虹TNT',0.5,{tiles:{top:T.tntRainbow,bottom:T.tntRainbow,side:T.tntRainbow},sound:'grass'}); // 🌈 下彩虹方块雨！
  defBlock(B_TNT_FLOOD,'洪水TNT',0.5,{tiles:{top:T.tntFlood,bottom:T.tntFlood,side:T.tntFlood},sound:'grass'}); // 🌊 哗啦啦发大水！
  defBlock(B_TNT_LAVA,'岩浆TNT',0.5,{tiles:{top:T.tntLava,bottom:T.tntLava,side:T.tntLava},sound:'grass'}); // 🌋 喷出滚烫岩浆！
  defBlock(B_TNT_HOLE,'黑洞TNT',0.5,{tiles:{top:T.tntHole,bottom:T.tntHole,side:T.tntHole},sound:'grass'}); // 🕳️ 吸出一个超级大深坑！
  defBlock(B_TNT_FIREWORK,'烟花TNT',0.5,{tiles:{top:T.tntFirework,bottom:T.tntFirework,side:T.tntFirework},sound:'grass'}); // 🎆 满天都是烟花！
  defBlock(B_TNT_FOOD,'美食TNT',0.5,{tiles:{top:T.tntFood,bottom:T.tntFood,side:T.tntFood},sound:'grass'}); // 🍗 掉一大堆好吃的！
  defBlock(B_TNT_CHEST,'宝箱TNT',0.5,{tiles:{top:T.tntChest,bottom:T.tntChest,side:T.tntChest},sound:'grass'}); // 🎁 变出装满宝贝的宝箱！
  defBlock(B_TNT_TP,'传送TNT',0.5,{tiles:{top:T.tntTp,bottom:T.tntTp,side:T.tntTp},sound:'grass'}); // 🌀 咻！把你传送到随机地方！
  defBlock(B_COPPER_ORE,'铜矿石',5,{tiles:{top:T.copperOre,bottom:T.copperOre,side:T.copperOre},tool:'pick',minTier:1,drop:I.copper_ingot,sound:'stone'}); // 🟠 石镐就能挖，直接掉铜锭！
  defBlock(B_LAPIS_ORE,'青金石矿石',5,{tiles:{top:T.lapisOre,bottom:T.lapisOre,side:T.lapisOre},tool:'pick',minTier:1,drop:I.lapis,sound:'stone'}); // 🔵 石镐就能挖！
  defBlock(B_COPPER_BLOCK,'铜块',5,{tiles:{top:T.copperBlock,bottom:T.copperBlock,side:T.copperBlock},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_LAPIS_BLOCK,'青金石块',5,{tiles:{top:T.lapisBlock,bottom:T.lapisBlock,side:T.lapisBlock},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_REDSTONE_BLOCK,'红石块',5,{tiles:{top:T.redstoneBlock,bottom:T.redstoneBlock,side:T.redstoneBlock},tool:'pick',minTier:1,sound:'stone'});
  defBlock(B_CREAK_HEART,'嘎吱核心',2,{tiles:{top:T.creakHeart,bottom:T.creakHeart,side:T.creakHeart},tool:'axe',drop:I.resin_clump,sound:'wood'}); // 🧡 长在苍白花园的树上，挖掉它嘎吱怪才会死！
  defBlock(B_PALE_LEAVES,'灰树叶',0.2,{tiles:{top:T.paleLeaves,bottom:T.paleLeaves,side:T.paleLeaves},sound:'grass',drop:0}); // 🩶 苍白花园的灰树叶
  defBlock(B_ROD,'避雷针',1.5,{tiles:{top:T.rod,bottom:T.rod,side:T.rod},tool:'pick',sound:'stone',opaque:false,solid:false}); // ⚡ 打雷的时候，闪电全都劈到它身上！

  for(let b=1;b<=B_ROD;b++)if(b!==B_DOOR_OPEN&&b!==B_BED_HEAD&&b!==B_LAVA&&b!==B_CROPS&&b!==B_REDSTONE&&b!==B_COMMAND&&b!==B_OREPORTAL&&b!==B_FIRE)blockItemEntry(b);
  for(const tb of [B_TNT_BIG,B_TNT_FIRE,B_TNT_ICE,B_TNT_LIGHTNING,B_TNT_MOB,B_TNT_ANIMAL,B_TNT_DIAMOND,B_TNT_HOUSE,B_TNT_RAINBOW,B_TNT_FLOOD,B_TNT_LAVA,B_TNT_HOLE,B_TNT_FIREWORK,B_TNT_FOOD,B_TNT_CHEST,B_TNT_TP])ITEMS[tb].mod='moretnt'; // 🧨 更多TNT是模组内容
  ITEMS[B_COPIER].mod='copy'; // 📋 复制方块是模组内容
  blockItemEntry(B_SAPLING); // 树苗（id 75 在循环范围外，单独注册）
  for(const lb of [B_LUCKY,B_LUCKY_SUPER,B_UNLUCKY,B_LUCKY_DIAMOND,B_LUCKY_RAINBOW,B_LUCKY_TNT,B_LUCKY_MOB])ITEMS[lb].mod='lucky'; // 幸运方块是模组内容
  ITEMS[B_ALTAR].mod='storm';ITEMS[B_BOMB].mod='storm'; // 模组物品：开了模组才出现在创造库

  // 工具: 镐/斧/剑 × 木/石/铁/金/钻石
  const toolMats=[
    ['wood','木',B_PLANKS,2,1],['stone','石',B_COBBLE,4,2],['iron','铁',I.iron_ingot,6,3],
    ['gold','金',I.gold_ingot,12,1],['diamond','钻石',I.diamond,8,4],
    ['redstone','红石',I.redstone,7,3],['coal','煤炭',I.coal,5,2],['emerald','绿宝石',I.emerald,9,4],
    ['copper','铜',I.copper_ingot,5,2],['lapis','青金石',I.lapis,6,3], // 🛡️ 更多盔甲模组的新工具
    ['obsidian','黑曜石',B_OBSIDIAN,10,5],['bedrock','基岩',B_BEDROCK,16,6]]; // 🗿 泰坦模组：黑曜石装备+最强基岩装备
  const tcol={wood:'#b08b4d',stone:'#8f8f8f',iron:'#e8e8e8',gold:'#ffd94a',diamond:'#4ae8dd',redstone:'#e83a2a',coal:'#2b2b2b',emerald:'#3ac85a',copper:'#e08850',lapis:'#3a5ad8',obsidian:'#3a2a5e',bedrock:'#6a6a6a'};
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
  // ---------- yangcraft 移植物品 ----------
  defItem('copper_ingot','铜锭',{icon:iconIngot('#e08850','#a05a28')}); // 🟠 挖铜矿直接掉，烧炼也能得
  defItem('lapis','青金石',{icon:ctx=>{ // 🔵 深蓝色的小晶石
    ctx.fillStyle='#3a5ad8';ctx.fillRect(4,4,8,8);ctx.fillRect(5,3,6,10);
    ctx.fillStyle='#26338a';ctx.fillRect(4,4,2,8);
    ctx.fillStyle='#9ab0ff';ctx.fillRect(6,5,2,2);
  }});
  defItem('golden_apple','金苹果',{icon:ctx=>{ // 🍎 金灿灿的苹果！吃了回血还有金光护盾！
    ctx.fillStyle='#ffd94a';ctx.fillRect(5,5,7,7);ctx.fillRect(4,6,9,5);ctx.fillRect(6,12,5,2);
    ctx.fillStyle='#e8b820';ctx.fillRect(5,9,2,2);ctx.fillRect(10,10,2,2);
    ctx.fillStyle='#fff2a8';ctx.fillRect(6,6,2,2); // 高光
    ctx.fillStyle='#8a5a1a';ctx.fillRect(8,3,1,3); // 苹果把
    ctx.fillStyle='#3a9a3a';ctx.fillRect(9,3,2,2); // 小叶子
  },maxStack:64,food:10}); // 一个金苹果回 10 颗心！
  defItem('flint_steel','打火石',{icon:ctx=>{ // 🔥 点矿石维度门框 / 点火
    ctx.save();ctx.translate(8,9);ctx.rotate(-Math.PI/4);
    P(ctx,-1,-2,2,10,'#8a6a3a');P(ctx,-1,-2,1,10,'#a5824d'); // 手柄
    ctx.restore();
    P(ctx,9,3,4,4,'#9aa0a6');P(ctx,10,4,2,2,'#e8e8e8'); // 铁块头
    P(ctx,3,9,3,3,'#ff8c1a');P(ctx,4,10,1,1,'#ffd94a'); // 火花！
    P(ctx,2,12,2,2,'#ffb84d');
  },maxStack:1,type:'tool',toolType:'flint',speed:1,tier:1,dmg:1});
  defItem('titan_soul','泰坦之魂',{icon:ctx=>{ // 💜 泰坦掉落的紫色宝石
    ctx.fillStyle='#c04ae8';ctx.fillRect(4,3,8,10);ctx.fillRect(3,4,10,8);
    ctx.fillStyle='#8a2ab0';ctx.fillRect(4,4,2,8);
    ctx.fillStyle='#f0c0ff';ctx.fillRect(6,5,2,3);
  },mod:'titan'});
  defItem('titan_sword','泰坦之剑',{icon:toolIcon('sword','#c04ae8'),type:'tool',toolType:'sword',speed:1,tier:7,dmg:8000,maxStack:1,mod:'titan'}); // 全世界最强的剑！
  function titanEggIcon(base,spots){return ctx=>{
    ctx.fillStyle=base;ctx.fillRect(5,3,6,10);ctx.fillRect(4,4,8,8);
    ctx.fillStyle=spots;
    ctx.fillRect(5,5,1,1);ctx.fillRect(8,6,1,1);ctx.fillRect(6,9,1,1);ctx.fillRect(9,9,1,1);
  };}
  defItem('titan_zombie_egg','僵尸泰坦蛋',{icon:titanEggIcon('#3a8a3a','#1a4a1a'),maxStack:16,mod:'titan'});
  defItem('titan_skeleton_egg','骷髅泰坦蛋',{icon:titanEggIcon('#d8d8d8','#8a8a8a'),maxStack:16,mod:'titan'});
  defItem('titan_creeper_egg','苦力怕泰坦蛋',{icon:titanEggIcon('#4ac04a','#1a6a1a'),maxStack:16,mod:'titan'});
  defItem('titan_spider_egg','蜘蛛泰坦蛋',{icon:titanEggIcon('#5a2a2a','#2a0a0a'),maxStack:16,mod:'titan'});
  defItem('titan_golem_egg','铁傀儡泰坦蛋',{icon:titanEggIcon('#e8e8e8','#9a9a9a'),maxStack:16,mod:'titan'});
  defItem('titan_warden_egg','坚守者泰坦蛋',{icon:titanEggIcon('#1a3a4a','#0a1a2a'),maxStack:16,mod:'titan'});
  defItem('witherzilla_egg','凋零斯拉蛋',{icon:titanEggIcon('#1a3a6a','#4ab8ff'),maxStack:16,mod:'titan'});
  const armorMats=[
    ['leather','皮革',I.leather,[1,3,2,1]],
    ['chain','锁链',I.iron_nugget,[2,5,4,1]],
    ['iron','铁',I.iron_ingot,[2,6,5,2]],
    ['gold','金',I.gold_ingot,[2,5,3,1]],
    ['diamond','钻石',I.diamond,[3,8,6,3]],
    ['netherite','下界合金',I.netherite_ingot,[4,9,7,4]],
    ['infinity','无尽贪婪',I.infinity_ingot,[8,12,10,8]], // 全套穿上：打十下只掉一点点血
    ['god','创世',I.god_core,[12,16,14,12]], // HIM模组：全套穿上几乎不掉血！
    ['redstone','红石',I.redstone,[2,6,5,2]], // 🛡️ 更多盔甲模组
    ['coal','煤炭',I.coal,[1,4,3,1]],
    ['emerald','绿宝石',I.emerald,[3,8,6,3]],
    ['copper','铜',I.copper_ingot,[2,5,4,2]],
    ['lapis','青金石',I.lapis,[2,5,4,2]],
    ['obsidian','黑曜石',B_OBSIDIAN,[20,30,25,20]], // 🗿 泰坦模组：保护力超强！
    ['bedrock','基岩',B_BEDROCK,[40,60,50,40]], // 🗿 基岩盔甲：几乎打不动你！
    ['titan','泰坦',I.titan_soul,[50,70,60,50]]]; // 🗿 泰坦盔甲：打败泰坦才能做，全世界最强！
  const slotNames=['头盔','胸甲','护腿','靴子'];
  const slotKinds=['helmet','chest','legs','boots'];
  for(const m of armorMats){
    for(let s=0;s<4;s++){
      defItem(m[0]+'_'+slotKinds[s],m[1]+slotNames[s],{
        icon:armorIcon(slotKinds[s],MAT_COLOR[m[0]]),type:'armor',armorSlot:s,armorPts:m[3][s],mat:m[0],maxStack:1});
    }
  }
  for(const tm of ['redstone','coal','emerald','copper','lapis'])for(const tk of ['pickaxe','axe','sword','shovel','hoe'])ITEMS[I[tm+'_'+tk]].mod='armor'; // 🛡️ 新工具是模组内容
  for(const tm of ['obsidian','bedrock'])for(const tk of ['pickaxe','axe','sword','shovel','hoe'])ITEMS[I[tm+'_'+tk]].mod='titan'; // 🗿 泰坦模组装备
  ITEMS[I.obsidian_sword].dmg=2000; // ⚫ 黑曜石剑：一刀2000点！
  ITEMS[I.obsidian_axe].dmg=12;
  ITEMS[I.bedrock_sword].dmg=4000; // ⬛ 基岩剑：一刀4000点！！打泰坦专用！
  ITEMS[I.bedrock_axe].dmg=30;
  defItem('turtle_helmet','海龟壳',{icon:armorIcon('helmet',MAT_COLOR.turtle),type:'armor',armorSlot:0,armorPts:2,mat:'turtle',maxStack:1});
  for(const k of ['helmet','chest','legs','boots'])ITEMS[I['god_'+k]].mod='him'; // 创世盔甲是HIM模组内容
  for(const am of ['redstone','coal','emerald','copper','lapis'])for(const k of ['helmet','chest','legs','boots'])ITEMS[I[am+'_'+k]].mod='armor'; // 🛡️ 更多盔甲模组内容
  for(const am of ['obsidian','bedrock','titan'])for(const k of ['helmet','chest','legs','boots'])ITEMS[I[am+'_'+k]].mod='titan'; // 🗿 泰坦模组盔甲
  // ---------- 分支融合新增物品（无尽贪婪/创世/风暴/药水/长矛/枪械，id 顺延保证存档兼容） ----------
  defItem('infinity_ingot','无尽贪婪锭',{icon:iconIngot('#c576f0','#7a3fb0')}); // 无尽贪婪：紫色的传说材料
  defItem('carrot','胡萝卜',{icon:ctx=>{
    ctx.fillStyle='#ff8a2a';ctx.fillRect(6,4,4,9);
    ctx.fillStyle='#e07020';ctx.fillRect(6,4,1,9);ctx.fillRect(9,4,1,9);
    ctx.fillStyle='#3a9a2a';ctx.fillRect(7,1,1,3);ctx.fillRect(9,2,1,2);
  },maxStack:64,food:2});
  defItem('potato','土豆',{icon:ctx=>{
    ctx.fillStyle='#d8b860';ctx.fillRect(5,5,6,7);
    ctx.fillStyle='#c0a048';ctx.fillRect(5,5,1,7);ctx.fillRect(10,5,1,7);
    ctx.fillStyle='#8a7a3a';ctx.fillRect(7,7,1,1);ctx.fillRect(8,9,1,1);
  },maxStack:64,food:2});
  defItem('emerald','绿宝石',{icon:ctx=>{
    ctx.fillStyle='#2ad84a';
    ctx.fillRect(5,3,6,2);ctx.fillRect(4,5,8,4);ctx.fillRect(5,9,6,2);ctx.fillRect(6,11,4,1);
    ctx.fillStyle='#8affa8';ctx.fillRect(5,4,2,2);
    ctx.fillStyle='#1a8a2a';ctx.fillRect(9,7,2,3);
  }});
  defItem('blaze_powder','冶炼粉',{icon:ctx=>{ // 下界挖出来的金红色粉末
    ctx.fillStyle='#ff9a3a';ctx.fillRect(4,9,8,3);
    ctx.fillStyle='#ffc86a';ctx.fillRect(5,8,3,1);ctx.fillRect(9,8,2,1);
    ctx.fillStyle='#e06018';ctx.fillRect(4,12,8,1);
  }});
  defItem('bullet','子弹',{icon:ctx=>{ // 黄头小子弹
    ctx.fillStyle='#ffd94a';ctx.fillRect(6,2,4,5);
    ctx.fillStyle='#c9a830';ctx.fillRect(6,2,1,5);
    ctx.fillStyle='#b08a3a';ctx.fillRect(5,7,6,5);
    ctx.fillStyle='#8a6a2a';ctx.fillRect(5,12,6,2);
  }});
  defItem('bucket','铁桶',{icon:ctx=>{
    ctx.fillStyle='#3a3a3a';ctx.fillRect(5,5,6,8);
    ctx.fillStyle='#5a5a5a';ctx.fillRect(6,5,1,8);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(5,5,6,1);
    ctx.strokeStyle='#3a3a3a';ctx.beginPath();ctx.arc(8,5,3,Math.PI,0);ctx.stroke();
  },maxStack:1});
  defItem('water_bucket','水桶',{icon:ctx=>{
    ctx.fillStyle='#3a3a3a';ctx.fillRect(5,5,6,8);
    ctx.fillStyle='#3a7bd5';ctx.fillRect(6,6,4,2);
    ctx.fillStyle='#6aa8e8';ctx.fillRect(7,6,2,1);
    ctx.strokeStyle='#3a3a3a';ctx.beginPath();ctx.arc(8,5,3,Math.PI,0);ctx.stroke();
  },maxStack:1});
  defItem('infinity_bucket','无尽贪婪桶',{icon:ctx=>{
    ctx.fillStyle='#b46ae8';ctx.fillRect(5,5,6,8);
    ctx.fillStyle='#d8a0ff';ctx.fillRect(6,5,1,8);
    ctx.fillStyle='#e8c8ff';ctx.fillRect(5,5,6,1);
    ctx.strokeStyle='#b46ae8';ctx.beginPath();ctx.arc(8,5,3,Math.PI,0);ctx.stroke();
  },maxStack:1});
  defItem('infinity_water_bucket','无尽贪婪水桶',{icon:ctx=>{
    ctx.fillStyle='#b46ae8';ctx.fillRect(5,5,6,8);
    ctx.fillStyle='#3a7bd5';ctx.fillRect(6,6,4,2);
    ctx.fillStyle='#8ac8ff';ctx.fillRect(7,6,2,1);
    ctx.strokeStyle='#b46ae8';ctx.beginPath();ctx.arc(8,5,3,Math.PI,0);ctx.stroke();
  },maxStack:1}); // 永远倒不完！
  defItem('infinity_bow','无尽贪婪弓',{icon:ctx=>{ // 紫色弯弓+发光白弦
    ctx.strokeStyle='#c576f0';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(5,8,6,-1.1,1.1);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(8,3);ctx.lineTo(8,13);ctx.stroke();
  },type:'tool',toolType:'bow',dmg:8,maxStack:1});
  defItem('gun_pistol','手枪',{icon:ctx=>{ // 黑灰色小手枪
    ctx.fillStyle='#3a3a3a';ctx.fillRect(3,6,10,3);
    ctx.fillStyle='#555';ctx.fillRect(3,6,10,1);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(4,9,3,4);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(12,7,1,2);
  },type:'gun2',maxStack:1}); // 生存模式枪械：射击走 fork 的 gunConf 弹道系统
  defItem('gun_rifle','步枪',{icon:ctx=>{ // 长长的步枪
    ctx.fillStyle='#4a3a2a';ctx.fillRect(2,7,12,2);
    ctx.fillStyle='#3a3a3a';ctx.fillRect(4,5,7,2);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(5,9,2,4);
  },type:'gun2',maxStack:1});
  defItem('gun_shotgun','霰弹枪',{icon:ctx=>{ // 双管霰弹枪，一打一大片
    ctx.fillStyle='#3a3a3a';ctx.fillRect(2,6,11,2);ctx.fillRect(2,8,11,2);
    ctx.fillStyle='#5a4a3a';ctx.fillRect(2,6,3,4);
    ctx.fillStyle='#6a5a3a';ctx.fillRect(11,9,3,3);
  },type:'gun2',maxStack:1});
  defItem('gun_sniper','狙击枪',{icon:ctx=>{ // 带瞄准镜的长枪，超远超痛
    ctx.fillStyle='#2a3a2a';ctx.fillRect(1,7,14,2);
    ctx.fillStyle='#3a3a3a';ctx.fillRect(3,5,2,2);
    ctx.fillStyle='#111';ctx.fillRect(5,4,4,2);
    ctx.fillStyle='#4a3a2a';ctx.fillRect(12,9,3,2);
  },type:'gun2',maxStack:1});
  defItem('gun_mg','机关枪',{icon:ctx=>{ // 一次三发子弹
    ctx.fillStyle='#3a3a3a';ctx.fillRect(1,6,13,3);
    ctx.fillStyle='#555';ctx.fillRect(1,6,13,1);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(5,9,2,4);ctx.fillRect(9,9,2,4);
    ctx.fillStyle='#8a8a8a';ctx.fillRect(2,9,1,3);
  },type:'gun2',maxStack:1});
  defItem('gun_infinity','无尽贪婪枪',{icon:ctx=>{ // 紫色传说枪，不用子弹！
    ctx.fillStyle='#b46ae8';ctx.fillRect(1,6,13,3);
    ctx.fillStyle='#d8a0ff';ctx.fillRect(1,6,13,1);
    ctx.fillStyle='#8a3fd0';ctx.fillRect(4,9,2,4);
    ctx.fillStyle='#ffd94a';ctx.fillRect(12,7,2,1);
  },type:'gun2',maxStack:1});
  defItem('him_egg','HIM刷怪蛋',{icon:ctx=>{ // 白眼睛的蛋，有点吓人
    ctx.fillStyle='#2a2a2a';ctx.fillRect(5,3,6,10);
    ctx.fillStyle='#1a1a1a';ctx.fillRect(5,3,1,10);ctx.fillRect(10,3,1,10);
    ctx.fillStyle='#fff';ctx.fillRect(6,6,2,2);ctx.fillRect(9,6,2,2);
    ctx.fillStyle='#e8e8ff';ctx.fillRect(6,6,1,1);ctx.fillRect(9,6,1,1);
  },mod:'him',maxStack:16});
  defItem('god_core','创世之核',{icon:ctx=>{ // 打败HIM掉的白金色核心
    ctx.fillStyle='#ffe8a0';
    ctx.fillRect(6,2,4,3);ctx.fillRect(4,5,8,6);ctx.fillRect(6,11,4,3);
    ctx.fillStyle='#fff';ctx.fillRect(6,5,2,2);
    ctx.fillStyle='#d8b860';ctx.fillRect(9,8,2,3);
  },mod:'him'});
  defItem('god_sword','创世之剑',{icon:toolIcon('sword','#ffe8a0'),type:'tool',toolType:'sword',speed:1,tier:5,dmg:25,maxStack:1,mod:'him'}); // 比无尽贪婪还厉害！
  defItem('command_book','命令方块之书',{icon:ctx=>{ // 橙色封面小书
    ctx.fillStyle='#c97030';ctx.fillRect(4,3,8,10);
    ctx.fillStyle='#e89050';ctx.fillRect(4,3,2,10);
    ctx.fillStyle='#ffd94a';ctx.fillRect(7,6,3,3);
    ctx.fillStyle='#7a4a20';ctx.fillRect(12,4,1,8);
  },mod:'storm'});
  defItem('storm_heart','风暴之心',{icon:ctx=>{ // 紫色旋风核心
    ctx.fillStyle='#7a4ae8';
    ctx.fillRect(6,3,4,10);ctx.fillRect(4,5,8,6);
    ctx.fillStyle='#a07aff';ctx.fillRect(6,3,2,3);
    ctx.fillStyle='#e0d0ff';ctx.fillRect(7,6,2,2);
  },mod:'storm'});
  defItem('storm_sword','风暴之剑',{icon:toolIcon('sword','#7a4ae8'),type:'tool',toolType:'sword',speed:1,tier:5,dmg:22,maxStack:1,mod:'storm'});
  function iconPotion(color,foam){return ctx=>{
    ctx.fillStyle='rgba(220,230,255,0.9)';ctx.fillRect(5,3,6,10); // 玻璃瓶
    ctx.fillStyle=color;ctx.fillRect(6,6,4,6); // 药水
    ctx.fillStyle=foam||'#ffffff';ctx.fillRect(6,6,4,1); // 泡泡
    ctx.fillStyle='#8a6a4a';ctx.fillRect(6,1,4,2); // 软木塞
  };}
  defItem('potion_heal','治疗药水',{icon:iconPotion('#ff5a7a'),maxStack:16,potion:'heal'}); // 喝一口回血
  defItem('potion_poison','毒药',{icon:iconPotion('#4ac94a','#b0ffb0'),maxStack:16,potion:'poison'}); // 泼出去毒倒怪物
  defItem('potion_jump','跳跃药水',{icon:iconPotion('#7ae8e8'),maxStack:16,potion:'jump'}); // 60秒跳超高
  defItem('potion_speed','速度药水',{icon:iconPotion('#5a9aff'),maxStack:16,potion:'speed'}); // 60秒跑超快
  defItem('potion_harm','伤害药水',{icon:iconPotion('#8a2a8a','#d0a0ff'),maxStack:16,potion:'harm'}); // 泼出去炸伤怪物
  defItem('potion_slowfall','缓降药水',{icon:iconPotion('#f0e8d0','#ffffff'),maxStack:16,potion:'slow'}); // 60秒慢慢飘，摔不伤
  defItem('infinity_sword','无尽贪婪剑',{icon:toolIcon('sword','#b46ae8'),type:'tool',toolType:'sword',speed:1,tier:5,dmg:15,maxStack:1}); // 打怪会天降剑雨！
  defItem('dragon_egg_sword','龙蛋之剑',{icon:toolIcon('sword','#3a2a5e'),type:'tool',toolType:'sword',speed:1,tier:5,dmg:20,maxStack:1}); // 打怪会天上掉龙蛋砸怪！
  defItem('cosmos_sword','寰宇支配之剑',{icon:ctx=>{ // 黑色剑身+绿色点点，像星空一样
    ctx.fillStyle='#1a1a2a';ctx.fillRect(7,1,2,9);
    ctx.fillStyle='#0a0a14';ctx.fillRect(7,1,1,9);
    ctx.fillStyle='#7dff9a';ctx.fillRect(7,3,1,1);ctx.fillRect(8,6,1,1);ctx.fillRect(7,8,1,1);
    ctx.fillStyle='#3a3a4a';ctx.fillRect(5,10,6,1);ctx.fillRect(6,11,4,2);
    ctx.fillStyle='#8a6a3a';ctx.fillRect(7,13,2,2);
  },type:'tool',toolType:'sword',speed:1,tier:5,dmg:18,maxStack:1});
  defItem('infinity_shovel','无尽贪婪铲子',{icon:toolIcon('shovel','#b46ae8'),type:'tool',toolType:'shovel',speed:14,tier:6,dmg:4,maxStack:1});
  defItem('infinity_hoe','无尽贪婪锄头',{icon:toolIcon('hoe','#b46ae8'),type:'tool',toolType:'hoe',speed:2,tier:6,dmg:4,maxStack:1});
  defItem('infinity_axe','无尽贪婪斧子',{icon:toolIcon('axe','#b46ae8'),type:'tool',toolType:'axe',speed:14,tier:6,dmg:6,maxStack:1});
  defItem('infinity_pickaxe','无尽贪婪镐子',{icon:toolIcon('pick','#b46ae8'),type:'tool',toolType:'pick',speed:16,tier:6,dmg:5,maxStack:1}); // 一次挖一大片！
  defItem('wood_spear','木矛',{icon:toolIcon('spear','#a5824d'),type:'tool',toolType:'spear',speed:1,tier:1,dmg:3,maxStack:1});
  defItem('stone_spear','石矛',{icon:toolIcon('spear','#8a8a8a'),type:'tool',toolType:'spear',speed:1,tier:2,dmg:4,maxStack:1});
  defItem('iron_spear','铁矛',{icon:toolIcon('spear','#e8e8e8'),type:'tool',toolType:'spear',speed:1,tier:3,dmg:5,maxStack:1});
  defItem('gold_spear','金矛',{icon:toolIcon('spear','#ffd94a'),type:'tool',toolType:'spear',speed:1,tier:2,dmg:4,maxStack:1});
  defItem('diamond_spear','钻石矛',{icon:toolIcon('spear','#5ad8d8'),type:'tool',toolType:'spear',speed:1,tier:4,dmg:6,maxStack:1});
  defItem('netherite_spear','下界合金矛',{icon:toolIcon('spear','#574b5e'),type:'tool',toolType:'spear',speed:1,tier:5,dmg:7,maxStack:1});
  defItem('infinity_spear','无尽贪婪矛',{icon:toolIcon('spear','#b46ae8'),type:'tool',toolType:'spear',speed:1,tier:6,dmg:10,maxStack:1});
  // 面包改为食物系统（保留物品，加 food 属性）
  if(ITEMS[I.bread])ITEMS[I.bread].food=3;
  if(ITEMS[I.wheat])ITEMS[I.wheat].food=1;
  if(ITEMS[I.rotten_flesh])ITEMS[I.rotten_flesh].food=-2; // 腐肉：吃了掉血
}

// ---------------- 合成配方 ----------------
// shaped: {pat:[行字符串], key:{字符:物品id}, out:{id,count}}
// shapeless: {ing:{物品id:数量}, out:{id,count}}
const RECIPES=[];
let curGroup='基础';
function addShaped(pat,key,outId,outCount,mode){
  RECIPES.push({type:'shaped',pat,key,out:{id:outId,count:outCount||1},group:curGroup,mode:mode||null});
}
function addShapeless(ing,outId,outCount,mode){
  RECIPES.push({type:'shapeless',ing,out:{id:outId,count:outCount||1},group:curGroup,mode:mode||null});
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
  // 🏝️ 空岛专属：浮岛资源稀缺，用碎石"风化"合成泥土/石头，扩展平台
  curGroup='🏝️ 空岛扩展';
  addShapeless({[B_COBBLE]:4},B_DIRT,2,'skyblock');   // 4 圆石 → 2 泥土（"碎石风化"）
  addShapeless({[B_DIRT]:2,[B_COBBLE]:2},B_STONE,2,'skyblock'); // 2 泥土+2 圆石 → 2 石头
  addShapeless({[B_LEAVES]:4},I.sapling,1,'skyblock'); // 4 树叶 → 1 树苗（兜底，树叶掉落不够时）
  // ---------- 分支融合新增配方 ----------
  addShapeless({[I.iron_ingot]:1,[I.redstone]:1},I.bullet,16); // 铁锭+红石=16颗子弹
  addShapeless({[I.iron_ingot]:3,[I.redstone]:1,[B_PLANKS]:1},I.gun_pistol,1); // 3铁锭+1红石+1木板=手枪
  addShapeless({[I.iron_ingot]:5,[I.redstone]:2},I.gun_rifle,1); // 5铁锭+2红石=步枪（要在工作台做）
  addShapeless({[I.iron_ingot]:4,[B_PLANKS]:2,[I.redstone]:1},I.gun_shotgun,1); // 4铁锭+2木板+1红石=霰弹枪
  addShapeless({[I.iron_ingot]:5,[B_GLASS]:1,[I.redstone]:2},I.gun_sniper,1); // 5铁锭+1玻璃+2红石=狙击枪
  addShapeless({[I.iron_ingot]:6,[I.redstone]:3},I.gun_mg,1); // 6铁锭+3红石=机关枪（摆满工作台）
  addShapeless({[I.infinity_ingot]:2,[I.iron_ingot]:3,[I.redstone]:2},I.gun_infinity,1); // 2无尽贪婪锭+3铁锭+2红石=无尽贪婪枪
  addShapeless({[B_SAND]:2,[I.redstone]:2},B_TNT,1); // 2沙子+2红石=TNT
  addShapeless({[B_TNT]:1,[I.blaze_powder]:4},B_SUPER_TNT,1); // TNT+4冶炼粉=超级TNT
  addShapeless({[B_SUPER_TNT]:1,[B_TNT]:4,[I.command_book]:1},B_BOMB,1); // 超级TNT+4TNT+命令方块之书=恐怖炸弹
  addShapeless({[B_OBSIDIAN]:4,[I.diamond]:1,[I.ender_pearl]:2},B_ALTAR,1); // 4黑曜石+1钻石+2末影珍珠=凋零风暴祭坛
  addShapeless({[I.rotten_flesh]:2,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.him_egg,1); // 腐肉+黑曜石+珍珠=HIM刷怪蛋
  addShapeless({[I.storm_heart]:1,[I.stick]:2},I.storm_sword,1); // 风暴之心+2木棍=风暴之剑
  addShapeless({[B_COBBLE]:3,[I.iron_ingot]:1,[I.redstone]:1},B_BREW,1); // 3圆石+1铁锭+1红石=酿造台
  addShaped(['I I',' I '],{I:I.iron_ingot},I.bucket,1); // 3 铁锭做铁桶
  addShaped(['I I',' I '],{I:I.infinity_ingot},I.infinity_bucket,1); // 3 无尽贪婪锭做无尽贪婪桶
  addShaped([' TS','T S',' TS'],{T:I.infinity_ingot,S:I.string},I.infinity_bow,1); // 3无尽贪婪锭+3线=无尽贪婪弓
  addShapeless({[I.diamond]:1,[I.netherite_ingot]:1,[I.gold_ingot]:1,[I.iron_ingot]:1},I.infinity_ingot,1); // 四种宝贝炼成一颗
  addShaped(['M','M','S'],{M:I.infinity_ingot,S:I.stick},I.infinity_sword,1); // 无尽贪婪剑：打怪天降剑雨
  addShaped(['E','M','S'],{E:I.dragon_egg,M:I.infinity_ingot,S:I.stick},I.dragon_egg_sword,1); // 龙蛋+无尽贪婪锭=龙蛋之剑
  addShaped(['M','S','S'],{M:I.infinity_ingot,S:I.stick},I.infinity_shovel,1); // 铲子：1锭+2棍
  addShaped(['  M',' S ','S  '],{M:I.infinity_ingot,S:I.stick},I.infinity_spear,1); // 🔱 无尽贪婪矛
  addShaped(['MMM',' S ',' S '],{M:I.infinity_ingot,S:I.stick},I.infinity_pickaxe,1);
  addShaped(['MM',' S',' S'],{M:I.infinity_ingot,S:I.stick},I.infinity_hoe,1); // 锄头：2锭+2棍
  addShaped(['MM','MS',' S'],{M:I.infinity_ingot,S:I.stick},I.infinity_axe,1); // 斧子：3锭+2棍
  addShaped([' B ','EBE',' S '],{B:B_INFINITY_BLOCK,E:I.dragon_egg,S:I.stick},I.cosmos_sword,1); // 2无尽贪婪块+龙蛋=寰宇支配之剑
  addShaped(['GGG','GRG','GGG'],{G:I.gold_ingot,R:I.redstone},B_LUCKY,1); // 金锭围红石
  addShaped(['GGG','GLG','GGG'],{G:B_GOLD_BLOCK,L:B_LUCKY},B_LUCKY_SUPER,1); // 金块围幸运方块
  addShapeless({[B_LUCKY]:1,[I.rotten_flesh]:1},B_UNLUCKY,1); // 幸运方块+腐肉=倒霉方块
  addShaped(['DDD','DLD','DDD'],{D:I.diamond,L:B_LUCKY},B_LUCKY_DIAMOND,1); // 💎 钻石围一圈幸运方块
  addShapeless({[B_LUCKY]:1,[I.emerald]:1,[I.redstone]:1,[I.slimeball]:1},B_LUCKY_RAINBOW,1); // 🌈 彩虹材料大杂烩
  addShapeless({[B_LUCKY]:1,[B_TNT]:1},B_LUCKY_TNT,1); // 🧨 幸运方块+TNT
  addShapeless({[B_LUCKY]:1,[I.rotten_flesh]:1,[I.slimeball]:1},B_LUCKY_MOB,1); // 👾 幸运方块+腐肉+黏液球
  // 长矛：材料+2棍斜着摆（全材质）
  for(const tm of [['wood',B_PLANKS],['stone',B_COBBLE],['iron',I.iron_ingot],['gold',I.gold_ingot],['diamond',I.diamond],['netherite',I.netherite_ingot]])
    addShaped(['  M',' S ','S  '],{M:tm[1],S:I.stick},I[tm[0]+'_spear'],1);
  // ---------- yangcraft 移植配方 ----------
  addShapeless({[I.stick]:1,[I.coal]:1},B_TORCH,4); // 🔥 火把：木棍+煤炭
  addShapeless({[I.iron_ingot]:1,[I.coal]:1},I.flint_steel,1); // 🔥 铁锭+煤炭=打火石
  addShapeless({[I.gold_ingot]:4,[I.bread]:1},I.golden_apple,1); // 🍎 4个金锭+1个面包=金苹果！
  addShaped(['IGI','GRG','IGI'],{I:I.iron_ingot,G:B_GLASS,R:I.redstone},B_COPIER,2); // 📋 十字形=2个复制方块
  addShaped(['C','C','C'],{C:I.copper_ingot},B_ROD,1); // ⚡ 3个铜锭竖着摆=避雷针！
  addShaped(['C','C','C'],{C:I.copper_ingot},B_ROD,1);
  addShapeless({[B_TNT]:1,[B_SUPER_TNT]:1},B_TNT_BIG,1); // 🧨 更多TNT
  addShapeless({[B_TNT]:1,[B_TORCH]:1},B_TNT_FIRE,1);
  addShapeless({[B_TNT]:1,[B_GLASS]:1},B_TNT_ICE,1);
  addShapeless({[B_TNT]:1,[B_GLOWSTONE]:1},B_TNT_LIGHTNING,1);
  addShapeless({[B_TNT]:1,[I.rotten_flesh]:1},B_TNT_MOB,1);
  addShapeless({[B_TNT]:1,[I.wheat]:1},B_TNT_ANIMAL,1);
  addShapeless({[B_TNT]:1,[I.diamond]:1},B_TNT_DIAMOND,1);
  addShapeless({[B_TNT]:1,[B_PLANKS]:1},B_TNT_HOUSE,1);
  addShapeless({[B_TNT]:1,[B_FLOWER]:1,[B_GLOWSTONE]:1},B_TNT_RAINBOW,1); // 🌈 花+萤石=彩虹！
  addShapeless({[B_TNT]:1,[I.water_bucket]:1},B_TNT_FLOOD,1); // 🌊 水桶（铁桶点水获得）
  addShapeless({[B_TNT]:1,[B_NETHERRACK]:1},B_TNT_LAVA,1); // 🌋 下界岩（下界挖的）
  addShapeless({[B_TNT]:1,[B_OBSIDIAN]:1},B_TNT_HOLE,1);
  addShapeless({[B_TNT]:1,[I.redstone]:1,[B_GLOWSTONE]:1},B_TNT_FIREWORK,1); // 🎆 红石+萤石=烟花！
  addShapeless({[B_TNT]:1,[I.bread]:1},B_TNT_FOOD,1);
  addShapeless({[B_TNT]:1,[B_CHEST]:1},B_TNT_CHEST,1);
  addShapeless({[B_TNT]:1,[I.ender_pearl]:1},B_TNT_TP,1); // 🌀 传送TNT
  addShaped(['MMM','MMM','MMM'],{M:I.copper_ingot},B_COPPER_BLOCK,1); // 🟠 铜块
  addShapeless({[B_COPPER_BLOCK]:1},I.copper_ingot,9);
  addShaped(['MMM','MMM','MMM'],{M:I.lapis},B_LAPIS_BLOCK,1); // 🔵 青金石块
  addShapeless({[B_LAPIS_BLOCK]:1},I.lapis,9);
  addShaped(['MMM','MMM','MMM'],{M:I.redstone},B_REDSTONE_BLOCK,1); // 🟥 红石块
  addShapeless({[B_REDSTONE_BLOCK]:1},I.redstone,9);
  // 新材料工具+护甲（armor/obsidian/bedrock/titan 系列）
  {
    const tm2=[[I.redstone,'redstone'],[I.coal,'coal'],[I.emerald,'emerald'],[I.copper_ingot,'copper'],[I.lapis,'lapis'],[B_OBSIDIAN,'obsidian'],[B_BEDROCK,'bedrock'],[I.titan_soul,'titan']];
    for(const [mat,key] of tm2){
      addShaped(['MMM',' S ',' S '],{M:mat,S:I.stick},I[key+'_pickaxe'],1);
      addShaped(['MM','MS',' S'],{M:mat,S:I.stick},I[key+'_axe'],1);
      addShaped(['M','M','S'],{M:mat,S:I.stick},I[key+'_sword'],1);
      addShaped(['M','S','S'],{M:mat,S:I.stick},I[key+'_shovel'],1);
      addShaped(['MM',' S',' S'],{M:mat,S:I.stick},I[key+'_hoe'],1);
    }
    const pats2=[['MMM','M M'],['M M','MMM','MMM'],['MMM','M M','M M'],['M M','M M']];
    const kinds2=['helmet','chest','legs','boots'];
    for(const [mat,key] of tm2)for(let k=0;k<4;k++)addShaped(pats2[k],{M:mat},I[key+'_'+kinds2[k]],1);
  }
  // 泰坦刷怪蛋：材料3+黑曜石2+末影珍珠1
  addShapeless({[I.coal]:3,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.titan_zombie_egg,1);
  addShapeless({[I.arrow]:3,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.titan_skeleton_egg,1);
  addShapeless({[I.slimeball]:3,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.titan_creeper_egg,1);
  addShapeless({[I.string]:3,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.titan_spider_egg,1);
  addShapeless({[I.iron_ingot]:3,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.titan_golem_egg,1);
  addShapeless({[I.titan_soul]:1,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.titan_warden_egg,1);
  addShapeless({[I.titan_soul]:3,[B_OBSIDIAN]:2,[I.ender_pearl]:1},I.witherzilla_egg,1);
  addShaped(['M','M','S'],{M:I.titan_soul,S:I.stick},I.titan_sword,1); // 💜 泰坦之剑

  // 金属块：3x3 材料压缩/解压
  for(const bp of [[I.iron_ingot,B_IRON_BLOCK],[I.gold_ingot,B_GOLD_BLOCK],[I.diamond,B_DIAMOND_BLOCK],[I.netherite_ingot,B_NETHERITE_BLOCK],[I.infinity_ingot,B_INFINITY_BLOCK],[I.emerald,B_EMERALD_BLOCK]]){
    addShaped(['MMM','MMM','MMM'],{M:bp[0]},bp[1],1);
    addShapeless({[bp[1]]:1},bp[0],9);
  }
  // 无尽贪婪盔甲（用 infinity_ingot 直接做）
  {
    const pats={helmet:['MMM','M M'],chest:['M M','MMM','MMM'],legs:['MMM','M M','M M'],boots:['M M','M M']};
    const kinds=['helmet','chest','legs','boots'];
    for(const k of kinds)addShaped(pats[k],{M:I.infinity_ingot},I['infinity_'+k],1);
  }
}
// 熔炉烧炼表
const SMELT={};
function buildSmelt(){
  SMELT[B_IRON_ORE]=I.iron_ingot;
  SMELT[B_COPPER_ORE]=I.copper_ingot; // 🟠 铜矿也能烧成铜锭
  SMELT[B_LAPIS_ORE]=I.lapis;
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

