// ---------------- 世界数据（无限世界：按区块动态生成） ----------------
const H=64,SEA=24,CH=16;
const chunks={};       // "cx,cz" -> Uint8Array(CH*H*CH)
const blockDiff={};    // "x,y,z" -> 方块id（玩家改动，存档用）
const facings={};      // "x,y,z" -> 0..3 (熔炉朝向)
function ck(cx,cz){return cx+','+cz;}
function lidx(x,y,z){return x+z*CH+y*CH*CH;} // x,z 为区块内局部坐标
function inW(x,y,z){return y>=0&&y<H;}
// 生态（两路噪声：b1=湿度决定森林种类，b2=温度决定冷热带）
// 0=橡树平原 1=小山 2=白桦林 3=花林 4=云杉林 5=丛林 6=金合欢草原 7=深色森林 8=樱花林
function biomeAt(x,z){
  const b1=fbm(x*0.006+500,z*0.006+500,3);
  const b2=fbm(x*0.005+900,z*0.005+900,3);
  if(b1<0.30)return 1;
  if(b2<0.24)return 4;
  if(b2>0.74)return b1>0.6?5:6;
  if(b1>0.72)return 2;
  if(b1>0.60)return 3;
  if(b1>0.48)return 7;
  if(b2>0.55)return 8;
  return 0;
}
function biomeName(b){return ['橡树平原','小山 ⛰️','白桦林 🌳','花林 🌸','云杉林 🌲','丛林 🌴','金合欢草原 🌾','深色森林 🌑','樱花林 🌸'][b]||'未知';}
function terrainH(x,z){
  const h1=fbm(x*0.025,z*0.025,4);
  const h2=fbm(x*0.09+100,z*0.09+100,2);
  if(biomeAt(x,z)===1){ // 小山：更高、起伏更大
    const m=fbm(x*0.02+300,z*0.02+300,4);
    return clamp(Math.floor(22+m*26+h2*5),8,H-16);
  }
  return clamp(Math.floor(13+h1*20+h2*4),8,H-20);
}
function veinRng(ocx,ocz,k){
  let s=(Math.imul(ocx,73856093)^Math.imul(ocz,19349663)^Math.imul(k,83492791)^SEED)>>>0;
  return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
// [矿石, 每区块脉数, 最高y, 最小团, 最大团]
const VEINS=[
  [B_COAL_ORE,15,40,5,9],
  [B_IRON_ORE,13,28,4,8],
  [B_GOLD_ORE,6,20,3,6],
  [B_DIAMOND_ORE,3,16,3,6],
  [B_REDSTONE_ORE,8,22,4,8],
  [B_DEBRIS,2,12,2,4],
  [B_OBSIDIAN,4,10,2,5] // 黑曜石：最深处，做传送门用
];
// ---------------- 维度：主世界 / 下界 / 末地 ----------------
let curDim='overworld';
const DIM_NAMES={overworld:'主世界 🌍',nether:'下界 🔥',end:'末地 🌌'};
// 每个维度记住自己的改动和离开时的位置
const DIMS={
  overworld:{diff:{},fac:{},furn:{},chest:{},pos:null},
  nether:{diff:{},fac:{},furn:{},chest:{},pos:null},
  end:{diff:{},fac:{},furn:{},chest:{},pos:null}
};
function genNetherChunk(cx,cz){ // 下界：下界岩丘陵 + 岩浆湖 + 荧石 + 远古残骸
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const NSEA=18; // 岩浆湖面
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    let h=clamp(Math.floor(13+fbm(x*0.012,z*0.012,3)*30+fbm(x*0.05,z*0.05,2)*4),8,H-20);
    if(fbm(x*0.006+300,z*0.006+300,2)<0.42)h=Math.max(6,h-24); // 低洼盆地→岩浆湖
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0||y===H-1)b=B_BEDROCK;
      else if(y<h)b=B_NETHERRACK;
      else if(y<=NSEA)b=B_LAVA;
      arr[lidx(lx,y,lz)]=b;
    }
    // 地表荧石簇
    if(hash2(x*3+5,z*7+9)<0.02&&h+2<H-1){
      arr[lidx(lx,h+1,lz)]=B_GLOWSTONE;
      if(hash2(x,z*3)<0.5)arr[lidx(lx,h+2,lz)]=B_GLOWSTONE;
    }
  }
  // 下界矿脉：远古残骸多 + 石英用荧石代替
  for(let ox=cx-1;ox<=cx+1;ox++)for(let oz=cz-1;oz<=cz+1;oz++){
    const rnd=veinRng(ox,oz,7);
    for(let i=0;i<5;i++){
      let x=ox*CH+((rnd()*CH)|0),z=oz*CH+((rnd()*CH)|0),y=2+((rnd()*26)|0);
      const size=2+((rnd()*3)|0);
      for(let j=0;j<size;j++){
        const lx=x-x0,lz=z-z0;
        if(lx>=0&&lx<CH&&lz>=0&&lz<CH&&y>=1&&y<H-1&&arr[lidx(lx,y,lz)]===B_NETHERRACK)arr[lidx(lx,y,lz)]=B_DEBRIS;
        const d=(rnd()*6)|0;
        if(d===0)x++;else if(d===1)x--;else if(d===2)y++;else if(d===3)y--;else if(d===4)z++;else z--;
        y=clamp(y,1,H-2);
      }
    }
  }
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
function genEndChunk(cx,cz){ // 末地：末地石浮岛 + 黑曜石柱子 + 中央返回传送门
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const BASE=30; // 岛面高度
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    const r=Math.hypot(x,z);
    if(r<42){
      const dome=Math.cos(r/42*Math.PI/2); // 中央高边缘低
      const top=BASE+Math.floor(dome*4+fbm(x*0.08,z*0.08,2)*1.5);
      const depth=Math.max(1,Math.floor(dome*5));
      for(let y=top;y>top-depth&&y>0;y--)arr[lidx(lx,y,lz)]=B_ENDSTONE;
    }
    // 黑曜石柱子（环绕岛的 6 根）
    for(let k=0;k<6;k++){
      const pa=k/6*Math.PI*2+0.5;
      const px2=Math.round(Math.cos(pa)*28),pz2=Math.round(Math.sin(pa)*28);
      if(Math.abs(x-px2)<=1&&Math.abs(z-pz2)<=1){
        const ph=14+((k*7)%6);
        for(let y=BASE+4;y<BASE+4+ph&&y<H;y++)arr[lidx(lx,y,lz)]=B_OBSIDIAN;
        if(x===px2&&z===pz2&&BASE+4+ph<H)arr[lidx(lx,BASE+4+ph,lz)]=B_GLOWSTONE; // 柱顶荧石"水晶"
      }
    }
  }
  // 岛中心：3x3 平台（打败末影龙后才会在这里开启回家的传送门）
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    if(Math.abs(x)<=1&&Math.abs(z)<=1)arr[lidx(lx,BASE+5,lz)]=B_ENDSTONE;
  }
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
// ---------------- 枪战竞技场（shooter 模式，多场景可选，64x64 固定边界） ----------------
const ARENA_SEED=20260802; // 枪战世界固定种子
const ARENA_HALF=32, ARENA_GROUND=32, ARENA_WALL_H=6;
let arenaScene='classic'; // 当前枪战场景（建房时选择，welcome 同步给客人）
// 场景定义：id / 名称 / 描述 / 出生点 / 材质（地面/墙/掩体）/ 掩体列表 / 特殊地形生成器
const ARENA_SCENES=[
  {id:'classic',name:'经典竞技场',icon:'⚔️',desc:'对称四象限 · 均衡开战',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_STONE,cover:B_COBBLE},
   covers:[
     [0,0,0,0,3], // 中央柱
     [-7,-5,-7,-5,2],[-7,-5,5,7,2],[5,7,-7,-5,2],[5,7,5,7,2], // 四象限小房
     [-16,-13,-16,-13,2],[-16,-13,13,16,2],[13,16,-16,-13,2],[13,16,13,16,2], // 四角掩体
     [-24,-21,-4,-1,1],[-24,-21,1,4,1],[21,24,-4,-1,1],[21,24,1,4,1], // 左右长条
     [-4,-1,-24,-21,1],[-4,-1,21,24,1],[1,4,-24,-21,1],[1,4,21,24,1], // 上下长条
     [-13,-12,-13,-12,2],[12,13,-13,-12,2],[-13,-12,12,13,2],[12,13,12,13,2], // 内角堡垒
   ]},
  {id:'ruins',name:'废墟小镇',icon:'🏚️',desc:'空心小楼+断墙 · 巷战密集',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_COBBLE,cover:B_COBBLE},
   covers:[
     [-4,4,-1,1,2], // 中央断墙
     [-24,-21,-24,-21,2],[-24,-21,21,24,2],[21,24,-24,-21,2],[21,24,21,24,2], // 四角残墙
     [-16,-15,-16,-15,2],[15,16,-16,-15,2],[-16,-15,15,16,2],[15,16,15,16,2], // 小掩体
   ],
   build:function(x,y,z){ // 5 座空心小楼（圆石墙+木板地+门洞），内部可躲
     const bs=[[-20,-20],[20,-20],[-20,20],[20,20],[0,26]];
     for(const [bx,bz] of bs){
       const dx=Math.abs(x-bx),dz=Math.abs(z-bz);
       if(dx<=2&&dz<=2){
         const isDoor=(dx===0&&dz===2&&y<=ARENA_GROUND+1)||(dz===0&&dx===2&&y<=ARENA_GROUND+1);
         if(isDoor)return B_AIR; // 门洞（南北各开一门，贯通）
         const wall=(dx===2||dz===2);
         if(wall&&y<=ARENA_GROUND+1)return B_COBBLE; // 外墙下两层圆石
         if(wall&&y===ARENA_GROUND+2)return B_STONE; // 墙顶石头（风化分层）
         if(!wall&&y===ARENA_GROUND)return B_PLANKS; // 室内木板地板
         return B_AIR;
       }
     }
     return undefined;
   }},
  {id:'maze',name:'迷宫',icon:'🌀',desc:'木板矮墙 · 转角遇敌',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_STONE,cover:B_PLANKS},
   build:function(x,y,z){ // 棋盘格木板墙 2 格（木迷宫），每 4 格留缺口连通
     if((x+z)%2===0){
       const gx=((x%4)+4)%4,gz=((z%4)+4)%4;
       if(!(gx===0&&gz===0)&&y<=ARENA_GROUND+2)return B_PLANKS;
     }
     return undefined;
   }},
  {id:'towers',name:'高台要塞',icon:'🏰',desc:'错落平台 · 高低差狙击',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_STONE,cover:B_COBBLE},
   build:function(x,y,z){ // 石头中央高塔（萤石塔顶）+ 圆石错落平台
     const dx=Math.abs(x),dz=Math.abs(z);
     if(dx<=2&&dz<=2){ // 中央塔：石身 + 萤石塔顶（发光灯塔）
       if(y<=ARENA_GROUND+4)return B_STONE;
       if(y===ARENA_GROUND+5)return B_GLOWSTONE;
       return B_AIR;
     }
     if(dx>=6&&dx<=10&&dz>=6&&dz<=10&&y<=ARENA_GROUND+3)return B_COBBLE; // 东南高台 3 格
     if(dx>=6&&dx<=10&&dz>=20&&dz<=24&&y<=ARENA_GROUND+1)return B_COBBLE; // 东北平台 1 格
     if(dx>=20&&dx<=24&&dz>=6&&dz<=10&&y<=ARENA_GROUND+1)return B_COBBLE; // 西南平台 1 格
     if(dx>=20&&dx<=24&&dz>=20&&dz<=24&&y<=ARENA_GROUND+3)return B_COBBLE; // 西北高台 3 格
     if(dx>=28&&dz>=28&&y<=ARENA_GROUND+1)return B_COBBLE; // 四角出生点高台
     return undefined;
   }},
];
function curArenaScene(){return ARENA_SCENES.find(s=>s.id===arenaScene)||ARENA_SCENES[0];}
function genArenaChunk(cx,cz){
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const scene=curArenaScene();
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const inArena=(x,z)=>x>=-ARENA_HALF&&x<ARENA_HALF&&z>=-ARENA_HALF&&z<ARENA_HALF;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    if(!inArena(x,z))continue; // 竞技场外 = 虚空
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0)b=B_BEDROCK;
      else if(y<ARENA_GROUND)b=B_STONE;                       // 实心底座
      else if(y===ARENA_GROUND){ // 地面：build 可定制（如废墟楼内木板地），否则棋盘拼花
        let sb=undefined;if(scene.build)sb=scene.build(x,y,z);
        b=(sb!==undefined)?sb:(((x+z)&1)?B_STONE:B_COBBLE);
      }
      else if(y<ARENA_GROUND+ARENA_WALL_H&&(Math.abs(x)===ARENA_HALF-1||Math.abs(z)===ARENA_HALF-1))b=(scene.mat&&scene.mat.wall)||B_STONE; // 边界墙（场景材质）
      else{
        // 掩体与高台（场景材质）
        let cover=0;
        for(const c of scene.covers||[]){
          if(x>=c[0]&&x<=c[1]&&z>=c[2]&&z<=c[3]){
            const top=ARENA_GROUND+c[4];
            if(y<=top){b=(scene.mat&&scene.mat.cover)||B_COBBLE;cover=1;}
            break;
          }
        }
        if(!cover&&scene.build){
          const sb=scene.build(x,y,z);
          if(sb!==undefined)b=sb;
        }
        if(!cover&&!b){
          // 经典场景专属：四角高台（3x3 平台）
          if(scene.id==='classic'){
            const dx=Math.abs(x),dz=Math.abs(z);
            if(dx>=23&&dx<=25&&dz>=23&&dz<=25&&y<=ARENA_GROUND+1)b=B_STONE;
          }
        }
      }
      arr[lidx(lx,y,lz)]=b;
    }
  }
  // blockDiff 叠加（玩家改动保留）
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
function genChunkData(cx,cz){
  if(curDim==='nether')return genNetherChunk(cx,cz);
  if(curDim==='end')return genEndChunk(cx,cz);
  if(gameMode==='shooter'&&curDim==='overworld')return genArenaChunk(cx,cz); // 枪战模式：竞技场
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  // 1) 地形
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz,h=terrainH(x,z);
    const rocky=biomeAt(x,z)===1&&h>=38; // 高山岩石峰顶
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0)b=B_BEDROCK;
      else if(y<h-3)b=B_STONE;
      else if(y<h)b=rocky?B_STONE:((h<=SEA+1)?B_SAND:B_DIRT);
      else if(y===h)b=rocky?B_STONE:((h<=SEA+1)?B_SAND:B_GRASS);
      else if(y<=SEA)b=B_WATER;
      arr[lidx(lx,y,lz)]=b;
    }
  }
  // 2) 矿脉（邻近9区块为脉源，确定性生成，跨区块无缝）
  for(let k=0;k<VEINS.length;k++){
    const V=VEINS[k];
    for(let ox=cx-1;ox<=cx+1;ox++)for(let oz=cz-1;oz<=cz+1;oz++){
      const rnd=veinRng(ox,oz,k);
      for(let i=0;i<V[1];i++){
        let x=ox*CH+((rnd()*CH)|0),z=oz*CH+((rnd()*CH)|0),y=1+((rnd()*V[2])|0);
        const size=V[3]+((rnd()*(V[4]-V[3]+1))|0);
        for(let j=0;j<size;j++){
          const lx=x-x0,lz=z-z0;
          if(lx>=0&&lx<CH&&lz>=0&&lz<CH&&y>=1&&y<H&&arr[lidx(lx,y,lz)]===B_STONE)arr[lidx(lx,y,lz)]=V[0];
          const d=(rnd()*6)|0;
          if(d===0)x++;else if(d===1)x--;else if(d===2)y++;else if(d===3)y--;else if(d===4)z++;else z--;
          y=clamp(y,1,H-1);
        }
      }
    }
  }
  // 3) 树（按生态选树种：橡树/白桦/云杉/丛林/金合欢/深色橡木/樱花）
  // 树种表: [原木, 树叶, 密度, 基础高, 高度浮动, 树冠样式]
  const TREE_SP={
    oak:[B_LOG,B_LEAVES,0.012,4,3,'oak'],
    birch:[B_BIRCH_LOG,B_LEAVES,0.022,6,3,'oak'],
    spruce:[B_SPRUCE_LOG,B_SPRUCE_LEAVES,0.02,7,3,'spruce'],
    jungle:[B_JUNGLE_LOG,B_LEAVES,0.02,10,4,'jungle'],
    acacia:[B_ACACIA_LOG,B_LEAVES,0.01,3,2,'acacia'],
    dark:[B_DARK_LOG,B_DARK_LEAVES,0.024,5,2,'dark'],
    cherry:[B_CHERRY_LOG,B_CHERRY_LEAVES,0.018,4,3,'oak']
  };
  function spOf(bio){
    if(bio===1)return [B_LOG,B_LEAVES,0.005,4,3,'oak'];        // 小山：稀疏橡树
    if(bio===2)return TREE_SP.birch;
    if(bio===3)return [B_LOG,B_LEAVES,0.016,4,3,'oak'];        // 花林：橡树+花
    if(bio===4)return TREE_SP.spruce;
    if(bio===5)return TREE_SP.jungle;
    if(bio===6)return TREE_SP.acacia;
    if(bio===7)return TREE_SP.dark;
    if(bio===8)return TREE_SP.cherry;
    return TREE_SP.oak;
  }
  function canopyLayers(style,th){
    if(style==='spruce'){ // 云杉：锥形，层层收窄
      const L=[];
      for(let dy=2;dy<=th;dy++){
        const r=Math.max(1,Math.round((th-dy)/th*2.4));
        if(dy%2===0||dy>=th-1)L.push([dy,r,true]);
      }
      L.push([th+1,0,false]);
      return L;
    }
    if(style==='jungle')return [[th-1,2,true],[th,2,true],[th+1,1,false]]; // 高杆小冠
    if(style==='acacia')return [[th,3,true],[th+1,1,false]];               // 平顶伞盖
    if(style==='dark')return [[th-2,2,false],[th-1,2,false],[th,2,false],[th+1,1,false]]; // 浓密
    return [[th-2,2,true],[th-1,2,true],[th,1,true],[th+1,1,true]];        // oak/樱花
  }
  const isLeafB=b=>b===B_LEAVES||b===B_SPRUCE_LEAVES||b===B_DARK_LEAVES||b===B_CHERRY_LEAVES;
  for(let tx=x0-3;tx<x0+CH+3;tx++)for(let tz=z0-3;tz<z0+CH+3;tz++){
    const sp=spOf(biomeAt(tx,tz));
    if(hash2(tx*7+1,tz*13+3)>=sp[2])continue;
    const ty=terrainH(tx,tz);
    if(ty<=SEA+1)continue; // 只长在草地上
    if(biomeAt(tx,tz)===1&&ty>=38)continue; // 岩石峰顶不长树
    const th=sp[3]+Math.floor(hash2(tx,tz*31)*sp[4]);
    if(ty+th+2>=H)continue;
    const leafB=sp[1];
    for(const layer of canopyLayers(sp[5],th)){
      const dy=layer[0],r=layer[1],sparse=layer[2];
      if(r===0){ // 顶端单叶
        const px2=tx-x0,py2=ty+1+dy,pz2=tz-z0;
        if(px2>=0&&px2<CH&&pz2>=0&&pz2<CH&&py2>=0&&py2<H&&arr[lidx(px2,py2,pz2)]===B_AIR)arr[lidx(px2,py2,pz2)]=leafB;
        continue;
      }
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(dx===0&&dz===0&&dy<th)continue;
        if(sparse&&Math.abs(dx)===r&&Math.abs(dz)===r&&hash2(tx+dx,tz+dz+dy)<0.5)continue;
        const px2=tx+dx-x0,py2=ty+1+dy,pz2=tz+dz-z0;
        if(px2>=0&&px2<CH&&pz2>=0&&pz2<CH&&py2>=0&&py2<H&&arr[lidx(px2,py2,pz2)]===B_AIR)arr[lidx(px2,py2,pz2)]=leafB;
      }
    }
    const txl=tx-x0,tzl=tz-z0;
    if(txl>=0&&txl<CH&&tzl>=0&&tzl<CH){
      for(let dy=1;dy<=th;dy++){
        const cur=arr[lidx(txl,ty+dy,tzl)];
        if(cur===B_AIR||isLeafB(cur))arr[lidx(txl,ty+dy,tzl)]=sp[0];
      }
    }
  }
  // 3b) 花林生态：草地上点缀花丛
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    if(biomeAt(x,z)!==3)continue;
    const ty=terrainH(x,z);
    if(ty<=SEA+1||ty+1>=H)continue;
    if(hash2(x*3+7,z*5+11)<0.05&&arr[lidx(lx,ty,lz)]===B_GRASS&&arr[lidx(lx,ty+1,lz)]===B_AIR)
      arr[lidx(lx,ty+1,lz)]=B_FLOWER;
  }
  // 3c) 村庄：平坦草地上偶尔出现，有小木屋、村民和铁傀儡
  const vcx=x0+8,vcz=z0+8;
  const vh=terrainH(vcx,vcz);
  const svc=getSpawnVillage(); // 出生点附近保证有一个村庄
  const nearSpawn=Math.hypot(vcx-spawnPoint.x,vcz-spawnPoint.z)<400; // 出生点 400 格内村庄更常见
  const isVillage=(cx===svc.cx&&cz===svc.cz)||
    (hash2(cx*7+3,cz*11+5)<(nearSpawn?0.09:0.05)&&vh>SEA+2&&vh<34&&biomeAt(vcx,vcz)!==1);
  if(isVillage)buildVillage(arr,x0,z0);
  // 4) 应用玩家改动
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  // 村庄刷村民和铁傀儡（区块先缓存好再刷，不然会套娃）；联机客人由房主广播驱动
  if(isVillage&&started&&(NET.isHost||!NET.roomId)&&curDim==='overworld'&&Math.hypot(player.pos.x-vcx,player.pos.z-vcz)<80){
    const golems=mobs.filter(m=>!m.dead&&m.type==='golem').length;
    const villagers=mobs.filter(m=>!m.dead&&m.type==='villager').length;
    if(golems<2&&villagers<6){
      spawnMob('villager',vcx+2,vcz+2);spawnMob('villager',vcx-3,vcz-2);spawnMob('villager',vcx+1,vcz-3);
      spawnMob('golem',vcx,vcz+5);
    }
    if(!foundVillage){foundVillage=true;updateTasks();showToast('🏠 发现村庄！村民和铁傀儡住在这里，别打村民哦！');}
  }
  return arr;
}
// 离出生点最近的、适合建村的区块（保证出生点附近必有一个村庄）
let _spawnVillage=null;
function getSpawnVillage(){
  if(_spawnVillage)return _spawnVillage;
  const sx=Math.floor(spawnPoint.x/16),sz=Math.floor(spawnPoint.z/16);
  outer:
  for(let r=3;r<=28;r++){
    for(let cx=sx-r;cx<=sx+r;cx++)for(let cz=sz-r;cz<=sz+r;cz++){
      if(Math.max(Math.abs(cx-sx),Math.abs(cz-sz))!==r)continue;
      const vx=cx*16+8,vz=cz*16+8,vh=terrainH(vx,vz);
      if(vh>SEA+2&&vh<34&&biomeAt(vx,vz)!==1){_spawnVillage={cx,cz};break outer;}
    }
  }
  if(!_spawnVillage)_spawnVillage={cx:sx+6,cz:sz+6};
  return _spawnVillage;
}
// 村庄小屋：三种房子（木屋/石屋/高塔屋）+ 麦田
function buildVillage(arr,x0,z0){
  const spots=[[2,2],[9,9],[9,2],[2,9]];
  let n=0;
  for(const sp of spots){
    const hx=sp[0],hz=sp[1];
    if(n>0&&hash2(x0+hx*3+n,z0+hz*5+n)<0.25)continue; // 有些位置空着，村子更自然
    n++;
    const wx=x0+hx+2,wz=z0+hz+2;
    const base=terrainH(wx,wz);
    // 填平地基，清空上方
    for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
      for(let y=base+1;y<base+8&&y<H;y++)arr[lidx(hx+dx,y,hz+dz)]=B_AIR;
      arr[lidx(hx+dx,base,hz+dz)]=B_GRASS;
      for(let y=Math.max(1,base-3);y<base;y++){
        const b=arr[lidx(hx+dx,y,hz+dz)];
        if(b===B_AIR||b===B_WATER)arr[lidx(hx+dx,y,hz+dz)]=B_DIRT;
      }
    }
    const style=Math.floor(hash2(x0+hx*7+n,z0+hz*11+n)*4); // 0木屋 1石屋 2高塔屋 3麦田
    if(style===3){ // 麦田：水渠+耕地+金灿灿的小麦
      for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
        if(dx===2){arr[lidx(hx+dx,base,hz+dz)]=B_WATER;continue;} // 中间水渠
        arr[lidx(hx+dx,base,hz+dz)]=B_FARMLAND;
        const hh=hash3(x0+hx+dx,base,z0+hz+dz);
        const st=hh<0.55?3:Math.floor(hh*4); // 一半多是金黄熟麦，其他随机阶段
        arr[lidx(hx+dx,base+1,hz+dz)]=B_CROPS;
        facings[(x0+hx+dx)+','+(base+1)+','+(z0+hz+dz)]=st;
      }
      // 田边围一圈原木桩
      for(let dx=-1;dx<=5;dx++){
        if(hash3(x0+hx+dx,1,z0+hz-1)>0.4)arr[lidx(hx+dx,base+1,hz-1)]=B_LOG;
        if(hash3(x0+hx+dx,1,z0+hz+5)>0.4)arr[lidx(hx+dx,base+1,hz+5)]=B_LOG;
      }
      continue;
    }
    const wall=style===1?B_COBBLE:B_PLANKS; // 石屋用圆石墙
    const tall=style===2?4:3;               // 高塔屋更高
    // 墙、门、屋顶
    for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
      const edge=dx===0||dx===4||dz===0||dz===4;
      const corner=(dx===0||dx===4)&&(dz===0||dz===4);
      for(let dy=1;dy<=tall;dy++){
        if(!edge)continue;
        if(dz===0&&dx===2&&dy<=2){arr[lidx(hx+dx,base+dy,hz+dz)]=B_DOOR;continue;} // 木门
        arr[lidx(hx+dx,base+dy,hz+dz)]=corner?B_LOG:wall;
      }
      // 屋顶：铺满整个房子（修bug：以前只有边上有屋顶）
      arr[lidx(hx+dx,base+tall+1,hz+dz)]=B_PLANKS;
    }
    arr[lidx(hx+2,base+tall+1,hz+2)]=B_GLOWSTONE; // 屋顶灯
    if(style===1)arr[lidx(hx+3,base+1,hz+3)]=B_FURNACE; // 石屋有熔炉
    else if(style===2)arr[lidx(hx+3,base+1,hz+3)]=B_CHEST; // 高塔屋有箱子
    else arr[lidx(hx+3,base+1,hz+3)]=B_TABLE; // 木屋有合成台
  }
}
function getBlock(x,y,z){
  if(y<0||y>=H)return B_AIR;
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  const arr=genChunkData(cx,cz);
  return arr[lidx(x-cx*CH,y,z-cz*CH)];
}
function isOpaque(b){return b!==B_AIR&&BLOCKS[b]&&BLOCKS[b].opaque;}
function isSolidBlock(b){return b!==B_AIR&&BLOCKS[b]&&BLOCKS[b].solid;}
function surfaceY(x,z){
  for(let y=H-2;y>0;y--){const b=getBlock(x,y,z);if(b!==B_AIR&&b!==B_WATER&&b!==B_LAVA&&!(y>=H-2&&b===B_BEDROCK))return y;}
  return 1;
}

// ---------------- 区块网格化 ----------------
const FACES=[
  {d:[-1,0,0], t:'side',  c:[[0,1,0,0,1],[0,0,0,0,0],[0,1,1,1,1],[0,0,1,1,0]]},
  {d:[1,0,0],  t:'side',  c:[[1,1,1,0,1],[1,0,1,0,0],[1,1,0,1,1],[1,0,0,1,0]]},
  {d:[0,-1,0], t:'bottom',c:[[1,0,1,1,0],[0,0,1,0,0],[1,0,0,1,1],[0,0,0,0,1]]},
  {d:[0,1,0],  t:'top',   c:[[0,1,1,0,0],[1,1,1,1,0],[0,1,0,0,1],[1,1,0,1,1]]},
  {d:[0,0,-1], t:'side',  c:[[1,0,0,0,0],[0,0,0,1,0],[1,1,0,0,1],[0,1,0,1,1]]},
  {d:[0,0,1],  t:'side',  c:[[0,0,1,0,0],[1,0,1,1,0],[0,1,1,0,1],[1,1,1,1,1]]}
];
function faceTile(b,faceType,dir,facing){
  if(b===B_CROPS)return T.crops[clamp(facing||0,0,3)]; // 小麦按生长阶段显示
  const t=BLOCKS[b].tiles;
  if((b===B_FURNACE||b===B_PISTON)&&faceType==='side'){
    const fi=(dir[0]===1)?1:(dir[0]===-1)?3:(dir[2]===1)?2:0;
    if(facing!==undefined&&fi===facing)return t.front;
  }
  if(faceType==='top')return t.top;
  if(faceType==='bottom')return t.bottom;
  return t.side;
}
function shouldDraw(b,n){
  if(b===B_WATER)return n===B_AIR||n===B_GLASS;
  if(b===B_LAVA)return n===B_AIR||n===B_GLASS||n===B_WATER;
  if(b===B_GLASS)return n!==B_GLASS&&!isOpaque(n);
  return !isOpaque(n);
}
const chunkGroup=new THREE.Group();
const chunkMeshes={};
const dirtyChunks=new Set();
function markDirty(x,z){
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  dirtyChunks.add(cx+','+cz);
  const lx=((x%CH)+CH)%CH,lz=((z%CH)+CH)%CH;
  if(lx===0)dirtyChunks.add((cx-1)+','+cz);
  if(lx===CH-1)dirtyChunks.add((cx+1)+','+cz);
  if(lz===0)dirtyChunks.add(cx+','+(cz-1));
  if(lz===CH-1)dirtyChunks.add(cx+','+(cz+1));
}
let solidMat=null,waterMat=null;
function buildChunk(cx,cz){
  const key=cx+','+cz;
  const arr=genChunkData(cx,cz);
  const sp={p:[],n:[],u:[],i:[]},wp={p:[],n:[],u:[],i:[]};
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=cx*CH+lx,z=cz*CH+lz;
    for(let y=0;y<H;y++){
      const b=arr[lidx(lx,y,lz)];
      if(b===B_AIR)continue;
      const isWater=b===B_WATER||b===B_LAVA;
      const G=isWater?wp:sp;
      const facing=facings[x+','+y+','+z];
      for(const f of FACES){
        const n=getBlock(x+f.d[0],y+f.d[1],z+f.d[2]);
        if(!shouldDraw(b,n))continue;
        const ti=faceTile(b,f.t,f.d,facing);
        const uv=tileUV(ti);
        const base=G.p.length/3;
        for(const cr of f.c){
          let vy=cr[1];
          if(isWater&&vy===1&&getBlock(x,y+1,z)!==B_WATER)vy=0.875;
          G.p.push(x+cr[0],y+vy,z+cr[2]);
          G.n.push(f.d[0],f.d[1],f.d[2]);
          G.u.push(cr[3]?uv[2]:uv[0],cr[4]?uv[3]:uv[1]);
        }
        G.i.push(base,base+1,base+2,base+2,base+1,base+3);
      }
    }
  }
  const old=chunkMeshes[key];
  if(old){for(const m of old){chunkGroup.remove(m);m.geometry.dispose();}}
  const meshes=[];
  function mk(G,mat){
    if(G.i.length===0)return;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(G.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(G.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(G.u,2));
    g.setIndex(G.i);
    const m=new THREE.Mesh(g,mat);
    meshes.push(m);chunkGroup.add(m);
  }
  mk(sp,solidMat);mk(wp,waterMat);
  chunkMeshes[key]=meshes;
}
function processDirty(maxN){
  let n=0;
  for(const key of dirtyChunks){
    const parts=key.split(',');
    buildChunk(+parts[0],+parts[1]);
    dirtyChunks.delete(key);
    if(++n>=maxN)break;
  }
}
function setBlock(x,y,z,b){
  if(y<0||y>=H)return;
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  const arr=genChunkData(cx,cz);
  arr[lidx(x-cx*CH,y,z-cz*CH)]=b;
  blockDiff[x+','+y+','+z]=b;
  if(b!==B_FURNACE&&b!==B_PISTON)delete facings[x+','+y+','+z];
  markDirty(x,z);
  if(typeof NET!=='undefined'&&NET.open&&!NET_APPLYING&&started)NET.diffQ.push([x,y,z,b]);
}

// ---------------- 场景 ----------------
let renderer,scene,camera,hemiLight,sunLight,ambientLight,highlightBox;
let dropsGroup,mobsGroup,particlesGroup;
const clock={last:0};
let dayTime=0.34; // 0..1, 0.25=清晨 0.5=正午

function initScene(){
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(window.innerWidth,window.innerHeight);
  document.getElementById('game').appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x87ceeb);
  scene.fog=new THREE.Fog(0x87ceeb,30,90);
  camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,300);
  scene.add(camera); // 把 camera 加入 scene，camera.add(handGroup) 的子对象才会被渲染遍历（FPS 手持 view model 关键）
  hemiLight=new THREE.HemisphereLight(0xcfe8ff,0x8a6a4a,0.9);
  scene.add(hemiLight);
  ambientLight=new THREE.AmbientLight(0xffffff,0.25);
  scene.add(ambientLight);
  sunLight=new THREE.DirectionalLight(0xffffff,0.9);
  scene.add(sunLight);
  solidMat=new THREE.MeshLambertMaterial({map:atlasTex,alphaTest:0.5});
  waterMat=new THREE.MeshLambertMaterial({map:atlasTex,transparent:true,opacity:0.65,depthWrite:false});
  scene.add(chunkGroup);
  dropsGroup=new THREE.Group();scene.add(dropsGroup);
  mobsGroup=new THREE.Group();scene.add(mobsGroup);
  particlesGroup=new THREE.Group();scene.add(particlesGroup);
  // 选中方块高亮
  const hg=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002));
  highlightBox=new THREE.LineSegments(hg,new THREE.LineBasicMaterial({color:0x000000}));
  highlightBox.visible=false;
  scene.add(highlightBox);
  window.addEventListener('resize',()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  });
}

// 昼夜循环
const skyStops=[
  [0.0,new THREE.Color(0x0b1026)], // 深夜
  [0.22,new THREE.Color(0x0b1026)],
  [0.27,new THREE.Color(0xff9a5a)], // 日出
  [0.35,new THREE.Color(0x87ceeb)], // 白天
  [0.65,new THREE.Color(0x87ceeb)],
  [0.73,new THREE.Color(0xff8a4a)], // 日落
  [0.8,new THREE.Color(0x0b1026)],
  [1.0,new THREE.Color(0x0b1026)]
];
function skyColorAt(t){
  for(let i=0;i<skyStops.length-1;i++){
    const a=skyStops[i],b=skyStops[i+1];
    if(t>=a[0]&&t<=b[0]){
      const f=(t-a[0])/Math.max(0.0001,b[0]-a[0]);
      return a[1].clone().lerp(b[1],f);
    }
  }
  return skyStops[0][1].clone();
}
function updateDayNight(dt){
  const elevNow=Math.sin((dayTime-0.25)*Math.PI*2);
  if(curDim==='overworld')dayTime=(dayTime+dt/(elevNow>0?900:300))%1; // 白天7.5分钟，夜晚2.5分钟（白天更长）
  if(curDim==='nether'){ // 下界：永远暗红
    scene.background.setHex(0x38100c);scene.fog.color.setHex(0x38100c);scene.fog.near=20;scene.fog.far=70;
    sunLight.intensity=0.25;hemiLight.intensity=0.55;ambientLight.intensity=0.4;
    return;
  }
  if(curDim==='end'){ // 末地：永远黑色星空
    scene.background.setHex(0x07070f);scene.fog.color.setHex(0x07070f);scene.fog.near=30;scene.fog.far=110;
    sunLight.intensity=0.35;hemiLight.intensity=0.6;ambientLight.intensity=0.45;
    return;
  }
  scene.fog.near=30;scene.fog.far=90;
  const sunA=(dayTime-0.25)*Math.PI*2;
  const elev=Math.sin(sunA);
  const c=skyColorAt(dayTime);
  scene.background.copy(c);
  scene.fog.color.copy(c);
  const day=clamp(elev*3+0.3,0.08,1);
  sunLight.intensity=0.95*day;
  hemiLight.intensity=0.25+0.65*day;
  ambientLight.intensity=0.15+0.15*day;
  const px=player.pos.x,pz=player.pos.z;
  sunLight.position.set(px+Math.cos(sunA)*60,Math.sin(sunA)*60+20,pz+30);
  sunLight.target.position.set(px,0,pz);
  sunLight.target.updateMatrixWorld();
}

