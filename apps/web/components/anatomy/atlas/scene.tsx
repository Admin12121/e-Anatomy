"use client";
import {useEffect,useRef} from 'react';
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {decodeModelResponse} from './model-download';
import {SYSTEMS,type Atlas,type SystemId} from './anatomy';

type BodyRegion='Head'|'Neck'|'Chest'|'Abdomen & Pelvis'|'Upper Limbs'|'Lower Limbs'|'Spine';
interface Props {atlas:Atlas;visible:SystemId[];selectedRegion:number;modelZoom?:number;cameraTargetY?:number;onRegionClick?:(region:number)=>void;onRegionHover?:(region:number|null)=>void;onReady?:()=>void;onProgress:(n:number)=>void;onError:(s:string)=>void;transparent?:boolean}
interface SceneController {setVisible:(visible:SystemId[])=>void;setSelected:(region:number)=>void}

const REGIONS:BodyRegion[]=['Head','Neck','Chest','Abdomen & Pelvis','Upper Limbs','Lower Limbs','Spine'];
const regionId=(region:BodyRegion)=>REGIONS.indexOf(region);
const neutralColor=(hex:string)=>{
 const c=new T.Color(hex);
 // Preserve detailed surface normals by avoiding the washed-out white base
 // materials of the old rendering (especially with multiple systems enabled).
 const l=T.MathUtils.clamp(c.r*.2126+c.g*.7152+c.b*.0722,.30,.48);
 return new T.Color(l,l,l);
};
const deviceProfile=()=>{
 const nav=navigator as Navigator&{deviceMemory?:number;connection?:{effectiveType?:string;saveData?:boolean}};
 const type=nav.connection?.effectiveType??'';
 const slow=nav.connection?.saveData||type==='slow-2g'||type==='2g'||type==='3g';
 const lowMemory=!!nav.deviceMemory&&nav.deviceMemory<=4;
 const compact=matchMedia('(max-width: 767px)').matches||matchMedia('(max-height: 600px)').matches;
 return {slow,lowMemory,compact,concurrency:slow?1:(lowMemory||compact?2:3)};
};

export default function AnatomyScene({atlas,visible,selectedRegion,modelZoom=1,cameraTargetY=.86,onRegionClick,onRegionHover,onReady,onProgress,onError,transparent=true}:Props){
 const callback=useRef({onRegionClick,onRegionHover,onReady,onProgress,onError});
 useEffect(()=>{callback.current={onRegionClick,onRegionHover,onReady,onProgress,onError};});
 const host=useRef<HTMLDivElement>(null),controller=useRef<SceneController|null>(null);

 useEffect(()=>{controller.current?.setVisible(visible);},[visible]);
 useEffect(()=>{controller.current?.setSelected(selectedRegion);},[selectedRegion]);

 useEffect(()=>{
  const el=host.current!;
  const profile=deviceProfile();
  let disposed=false,ready=false,raf=0,hovered=-1,selected=selectedRegion;
  let currentYaw=0,targetYaw=0,currentPitch=0,targetPitch=0;
  const abort=new AbortController();
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:!profile.compact,alpha:transparent,powerPreference:'high-performance'});}catch{
   callback.current.onError('This browser could not start the 3D viewer. Please try a browser with WebGL enabled.');
   return;
  }

  const preferredDpr=profile.slow||profile.lowMemory?1:profile.compact?1.25:1.75;
  renderer.setPixelRatio(Math.min(devicePixelRatio,preferredDpr));
  renderer.setClearColor('#000000',transparent?0:1);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.78;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Human anatomy. Drag horizontally or vertically to rotate. Hover or click to select a body region.');
  renderer.domElement.style.cursor='grab';
  renderer.domElement.style.touchAction='pan-y';

  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.005,100);
  camera.position.set(0,cameraTargetY,profile.compact?4.8:4);
  camera.lookAt(0,cameraTargetY,0);
  // Preserve the original atlas shading. Geometry/runtime optimisation should
  // not make the anatomy look flatter or lower quality.
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);
  scene.environment=env.texture;scene.environmentIntensity=.35;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0x8f979e,.65));
  const key=new T.DirectionalLight(0xffffff,1.15);key.position.set(-2,4,3);scene.add(key);
  const rim=new T.DirectionalLight(0xe2e7ee,.6);rim.position.set(2,2,-3);scene.add(rim);

  // Rotate around the body's centre, not its feet, for subtle mouse parallax.
  const pivot=new T.Group(),body=new T.Group();
  pivot.position.y=.86;body.position.y=-.86;pivot.add(body);scene.add(pivot);

  const geometries:T.BufferGeometry[]=[],materials:T.MeshStandardMaterial[]=[];
  // Uniforms shared by every material: the highlight crossfades from the
  // previous region to the new one instead of jumping.
  const region={current:{value:-1},previous:{value:-1},fade:{value:1}};
  const fadeMs=matchMedia('(prefers-reduced-motion: reduce)').matches?0:240;
  let fadeStart=0;
  const meshesBySystem=new Map<SystemId,T.Mesh[]>();
  let visibleSet=new Set<SystemId>(visible);

  const hover=document.createElement('div');
  hover.className='region-hover';hover.setAttribute('role','tooltip');hover.hidden=true;el.appendChild(hover);

  const render=()=>{if(!disposed)renderer.render(scene,camera);};
  const schedule=()=>{
   if(raf||disposed)return;
   raf=requestAnimationFrame(()=>{
    raf=0;
    currentYaw=T.MathUtils.lerp(currentYaw,targetYaw,.2);
    currentPitch=T.MathUtils.lerp(currentPitch,targetPitch,.2);
    pivot.rotation.y=currentYaw;
    pivot.rotation.x=currentPitch;
    pivot.updateMatrixWorld(true);
    if(region.fade.value<1){
     const t=fadeMs?Math.min(1,(performance.now()-fadeStart)/fadeMs):1;
     region.fade.value=t*t*(3-2*t);
     if(t<1)schedule();
    }
    render();
    if(Math.abs(currentYaw-targetYaw)>.00025||Math.abs(currentPitch-targetPitch)>.00025)schedule();
   });
  };

  const applyHighlight=()=>{
   const target=hovered>=0?hovered:selected;
   if(target===region.current.value)return;
   // Mid-fade, keep fading out whichever region is still mostly visible.
   if(region.fade.value>=.5)region.previous.value=region.current.value;
   region.current.value=target;region.fade.value=0;fadeStart=performance.now();schedule();
  };
  const setHovered=(id:number,x?:number,y?:number)=>{
   if(id!==hovered){
    hovered=id;
    applyHighlight();callback.current.onRegionHover?.(id>=0?id:null);
   }
   if(id<0){hover.hidden=true;return;}
   hover.hidden=false;hover.textContent=REGIONS[id];
   if(x!==undefined&&y!==undefined){
    hover.style.left=`${Math.max(12,Math.min(x+16,el.clientWidth-150))}px`;
    hover.style.top=`${Math.max(12,Math.min(y+18,el.clientHeight-48))}px`;
   }
  };

  const materialFor=(system:SystemId)=>{
   const original=SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8';
   const m=new T.MeshStandardMaterial({
    color:neutralColor(original),metalness:0,roughness:.82,side:T.DoubleSide,
    transparent:system==='integumentary',opacity:system==='integumentary'?.08:1,depthWrite:system!=='integumentary',
   });
   const highlightColor=new T.Color(original);
   m.onBeforeCompile=shader=>{
    shader.uniforms.hoverRegion=region.current;
    shader.uniforms.previousRegion=region.previous;
    shader.uniforms.regionFade=region.fade;
    shader.uniforms.highlightColor={value:highlightColor};
    shader.vertexShader='attribute float regionId; uniform float hoverRegion; uniform float previousRegion; uniform float regionFade; varying float regionHighlight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace(
     '#include <begin_vertex>',
     '#include <begin_vertex>\nregionHighlight = mix(1.0 - step(0.25, abs(regionId - previousRegion)), 1.0 - step(0.25, abs(regionId - hoverRegion)), regionFade);',
    );
    shader.fragmentShader='uniform vec3 highlightColor; varying float regionHighlight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace(
     '#include <color_fragment>',
     '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, highlightColor, regionHighlight * 0.96);',
    );
   };
   materials.push(m);return m;
  };
  const systemMaterials=new Map(SYSTEMS.map(s=>[s.id,materialFor(s.id)]));

  // Hover picking keeps only tiny AABB metadata for each source structure.
  // We do NOT keep 2,234 hidden geometry meshes in memory. This retains the
  // accurate body-local selection behavior without duplicating the anatomy.
  const partBounds=atlas.parts.map(part=>new T.Box3(new T.Vector3().fromArray(part.bounds[0]),new T.Vector3().fromArray(part.bounds[1])));
  const partsByChunk=atlas.chunks.map(()=>[] as Atlas['parts']);
  atlas.parts.forEach(part=>partsByChunk[part.chunk].push(part));

  // Systems hidden at first (muscles by default) load after the rest, or as
  // soon as they are switched on, so the first view downloads less.
  const queue:number[]=[],started=new Set<number>();
  const initialChunks=atlas.chunks.map((_,i)=>i).filter(i=>visibleSet.has(atlas.chunks[i].system));
  let backgroundAllowed=false,backgroundActive=0;
  const promoteVisible=()=>queue.sort((a,b)=>Number(visibleSet.has(atlas.chunks[b].system))-Number(visibleSet.has(atlas.chunks[a].system)));
  const pumpBackground=()=>{
   while(!disposed&&backgroundActive<1&&queue.length){
    const next=queue[0];
    if(!backgroundAllowed&&!visibleSet.has(atlas.chunks[next].system))return;
    queue.shift();backgroundActive++;
    void loadChunk(next).catch(e=>{if(!disposed)callback.current.onError(e instanceof Error?e.message:'Could not load the anatomy.');}).finally(()=>{backgroundActive--;pumpBackground();});
   }
  };

  const syncVisible=(ids:SystemId[])=>{
   visibleSet=new Set(ids);
   body.visible=visibleSet.size>0;
   for(const [system,meshes] of meshesBySystem)for(const mesh of meshes)mesh.visible=visibleSet.has(system);
   if(!ids.length)setHovered(-1);
   promoteVisible();pumpBackground();
   schedule();
  };
  controller.current={setVisible:syncVisible,setSelected(id){selected=id;applyHighlight();}};
  applyHighlight();

  const {origin,step}=atlas.quantization;
  const addBatch=(system:SystemId,batch:{part:Atlas['parts'][number];position:Uint16Array;normal:Int8Array;index:Uint16Array}[],vertices:number,indexCount:number)=>{
   const position=new Uint16Array(vertices*3),normal=new Int8Array(vertices*3),index=new Uint16Array(indexCount),regions=new Uint8Array(vertices);
   let vertexBase=0,indexBase=0;
   for(const item of batch){
    const count=item.part.vertexCount;
    for(let v=0;v<count;v++){
     const from=v*4,to=(vertexBase+v)*3;
     position[to]=item.position[from];position[to+1]=item.position[from+1];position[to+2]=item.position[from+2];
     normal[to]=item.normal[from];normal[to+1]=item.normal[from+1];normal[to+2]=item.normal[from+2];
    }
    for(let i=0;i<item.index.length;i++)index[indexBase+i]=item.index[i]+vertexBase;
    // Every vertex of a source structure receives the same region id so hover
    // restores colour to complete anatomical pieces.
    regions.fill(item.part.region,vertexBase,vertexBase+count);
    vertexBase+=count;indexBase+=item.index.length;
   }
   const geometry=new T.BufferGeometry();
   // Positions stay 16-bit grid steps on the GPU; the mesh scales them to metres.
   geometry.setAttribute('position',new T.BufferAttribute(position,3));
   geometry.setAttribute('normal',new T.BufferAttribute(normal,3,true));
   geometry.setAttribute('regionId',new T.BufferAttribute(regions,1));
   geometry.setIndex(new T.BufferAttribute(index,1));
   geometry.computeBoundingSphere();geometries.push(geometry);
   const mesh=new T.Mesh(geometry,systemMaterials.get(system)!);
   mesh.scale.setScalar(step);mesh.position.fromArray(origin);
   mesh.visible=visibleSet.has(system);body.add(mesh);
   const list=meshesBySystem.get(system)??[];list.push(mesh);meshesBySystem.set(system,list);
  };

  let loadedInitial=0;
  const loadChunk=async(ci:number)=>{
   if(started.has(ci))return;
   started.add(ci);
   const chunk=atlas.chunks[ci],compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';
   const response=await fetch(compressed?chunk.gzip!:chunk.url,{signal:abort.signal,cache:'force-cache'});
   const bytes=new Uint8Array(await decodeModelResponse(response,chunk.bytes,compressed));
   if(disposed)return;
   const stream=(range:[number,number])=>bytes.subarray(range[0],range[0]+range[1]);
   let batch:Parameters<typeof addBatch>[1]=[],vertices=0,indexCount=0;
   for(const part of partsByChunk[ci]){
    if(batch.length&&vertices+part.vertexCount>65535){addBatch(chunk.system,batch,vertices,indexCount);batch=[];vertices=0;indexCount=0;}
    const position=new Uint16Array(part.vertexCount*4),normal=new Int8Array(part.vertexCount*4),index=new Uint16Array(part.indexCount);
    MeshoptDecoder.decodeVertexBuffer(new Uint8Array(position.buffer),part.vertexCount,8,stream(part.position));
    MeshoptDecoder.decodeVertexBuffer(new Uint8Array(normal.buffer),part.vertexCount,4,stream(part.normal),'OCTAHEDRAL');
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(index.buffer),part.indexCount,2,stream(part.index));
    batch.push({part,position,normal,index});vertices+=part.vertexCount;indexCount+=part.indexCount;
   }
   if(batch.length)addBatch(chunk.system,batch,vertices,indexCount);
   body.visible=visibleSet.size>0;
   if(initialChunks.includes(ci)){loadedInitial++;callback.current.onProgress(Math.round(loadedInitial/initialChunks.length*100));}
   schedule();
  };
  (async()=>{try{
   await MeshoptDecoder.ready;
   if(disposed)return;
   queue.push(...atlas.chunks.map((_,i)=>i).filter(i=>!initialChunks.includes(i)));
   let cursor=0;
   if(!initialChunks.length)callback.current.onProgress(100);
   await Promise.all(Array.from({length:profile.concurrency},async()=>{while(cursor<initialChunks.length){const i=initialChunks[cursor++];await loadChunk(i);}}));
   if(disposed)return;
   ready=true;schedule();callback.current.onReady?.();
   // Slow or data-saving connections fetch hidden systems only on demand.
   backgroundAllowed=!profile.slow;promoteVisible();pumpBackground();
  }catch(e){if(!disposed)callback.current.onError(e instanceof Error?e.message:'Could not load the anatomy.');}})();

  const resize=()=>{
   const compact=el.clientWidth<768||el.clientHeight<600;
   const dpr=profile.slow||profile.lowMemory?1:compact?1.25:1.75;
   renderer.setPixelRatio(Math.min(devicePixelRatio,dpr));
   camera.aspect=Math.max(.2,el.clientWidth/el.clientHeight);camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight,false);
   camera.position.z=(compact?4.8:4)/T.MathUtils.clamp(modelZoom,1,1.42);camera.position.y=cameraTargetY;camera.lookAt(0,cameraTargetY,0);schedule();
  };
  const observer=new ResizeObserver(resize);observer.observe(el);resize();

  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),inverseBody=new T.Matrix4(),localRay=new T.Ray(),boxHit=new T.Vector3();
  let lastHover=0;
  const updatePointer=(clientX:number,clientY:number,allowHover=true,force=false)=>{
   const rect=renderer.domElement.getBoundingClientRect();
   const nx=T.MathUtils.clamp((clientX-rect.left)/rect.width*2-1,-1,1);
   if(!allowHover||!ready||!visibleSet.size)return;
   const now=performance.now();if(!force&&now-lastHover<45)return;lastHover=now;
   pointer.set(nx,-((clientY-rect.top)/rect.height*2-1));raycaster.setFromCamera(pointer,camera);
   pivot.updateMatrixWorld(true);body.updateMatrixWorld(true);
   inverseBody.copy(body.matrixWorld).invert();
   localRay.copy(raycaster.ray).applyMatrix4(inverseBody);
   const hasSolid=atlas.parts.some(p=>p.system!=='integumentary'&&visibleSet.has(p.system));
   let nearest=Infinity,found=false,region=-1;
   const nearestPoint=new T.Vector3();
   for(let i=0;i<atlas.parts.length;i++){
    const part=atlas.parts[i];
    if(!visibleSet.has(part.system)||(hasSolid&&part.system==='integumentary'))continue;
    const box=partBounds[i];if(box.isEmpty()||!localRay.intersectBox(box,boxHit))continue;
    const distance=localRay.origin.distanceToSquared(boxHit);
    if(distance<nearest){nearest=distance;nearestPoint.copy(boxHit);region=part.region??5;found=true;}
   }
   if(!found){setHovered(-1);return;}
   setHovered(region,clientX-rect.left,clientY-rect.top);
  };
  let drag:{id:number;x:number;y:number;yaw:number;pitch:number;moved:boolean}|null=null;
  let suppressClick=false;
  const down=(e:PointerEvent)=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:targetYaw,pitch:targetPitch,moved:false};
   suppressClick=false;
   renderer.domElement.setPointerCapture(e.pointerId);
   renderer.domElement.style.cursor='grabbing';
  };
  const move=(e:PointerEvent)=>{
   if(drag&&drag.id===e.pointerId){
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(Math.hypot(dx,dy)>5)drag.moved=true;
    if(drag.moved){
     targetYaw=drag.yaw+dx*.012;
     targetPitch=T.MathUtils.clamp(drag.pitch+dy*.006,-.4,.4);
     setHovered(-1);schedule();
    }
    return;
   }
   if(e.pointerType!=='touch')updatePointer(e.clientX,e.clientY,true);
  };
  const endDrag=(e:PointerEvent)=>{
   if(!drag||e.pointerId!==drag.id)return;
   suppressClick=drag.moved;
   drag=null;
   renderer.domElement.style.cursor='grab';
   if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
  };
  const leave=()=>setHovered(-1);
  renderer.domElement.addEventListener('pointerdown',down);
  renderer.domElement.addEventListener('pointermove',move,{passive:true});
  renderer.domElement.addEventListener('pointerup',endDrag);
  renderer.domElement.addEventListener('pointercancel',endDrag);
  renderer.domElement.addEventListener('pointerleave',leave,{passive:true});
  const click=(e:MouseEvent)=>{if(suppressClick){suppressClick=false;return;}updatePointer(e.clientX,e.clientY,true,true);if(hovered>=0)callback.current.onRegionClick?.(hovered);};
  renderer.domElement.addEventListener('click',click);

  const contextLost=(e:Event)=>{e.preventDefault();callback.current.onError('The 3D session was paused by your device. Reload to continue.');};
  renderer.domElement.addEventListener('webglcontextlost',contextLost);

  return()=>{
   disposed=true;abort.abort();if(raf)cancelAnimationFrame(raf);observer.disconnect();controller.current=null;
   renderer.domElement.removeEventListener('pointerdown',down);
   renderer.domElement.removeEventListener('pointermove',move);
   renderer.domElement.removeEventListener('pointerup',endDrag);
   renderer.domElement.removeEventListener('pointercancel',endDrag);
   renderer.domElement.removeEventListener('pointerleave',leave);
   renderer.domElement.removeEventListener('click',click);
   geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());env.dispose();hover.remove();renderer.dispose();renderer.domElement.remove();
  };
 },[atlas,modelZoom,cameraTargetY]);

 return <div className="absolute inset-0 overflow-hidden [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full [&>.region-hover]:pointer-events-none [&>.region-hover]:absolute [&>.region-hover]:z-10 [&>.region-hover]:rounded-md [&>.region-hover]:bg-black/80 [&>.region-hover]:px-2 [&>.region-hover]:py-1 [&>.region-hover]:text-xs [&>.region-hover]:text-white" ref={host}/>;
}
