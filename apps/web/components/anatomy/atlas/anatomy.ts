export type SystemId = 'skeletal'|'muscular'|'arterial'|'venous'|'nervous'|'digestive'|'respiratory'|'urinary'|'reproductive'|'lymphatic'|'endocrine'|'integumentary'|'connective'|'sensory'|'cardiac';
export const SYSTEMS:{id:SystemId;name:string;color:string}[]=[
 {id:'skeletal',name:'Skeleton',color:'#e2d9ba'},
 {id:'muscular',name:'Muscles',color:'#a85b50'},
 {id:'cardiac',name:'Heart',color:'#b96760'},
 {id:'sensory',name:'Sensory organs',color:'#b0c8ce'},
 {id:'arterial',name:'Arteries',color:'#c05245'},
 {id:'venous',name:'Veins',color:'#527c9f'},
 {id:'nervous',name:'Nervous system',color:'#d8b565'},
 {id:'respiratory',name:'Respiratory',color:'#b98991'},
 {id:'digestive',name:'Digestive',color:'#b8916b'},
 {id:'urinary',name:'Urinary',color:'#b47961'},
 {id:'lymphatic',name:'Lymphatic',color:'#879f7c'},
 {id:'endocrine',name:'Endocrine',color:'#c5a09a'},
 {id:'reproductive',name:'Reproductive',color:'#bda098'},
 {id:'integumentary',name:'Body surface',color:'#ba9b7d'},
 {id:'connective',name:'Connective tissue',color:'#aec3bb'},
];
/** One source structure; [offset, length] ranges point into its chunk. */
export interface Part {system:SystemId;region:number;chunk:number;vertexCount:number;indexCount:number;bounds:[number[],number[]];position:[number,number];normal:[number,number];index:[number,number]}
/** Meshopt-packed model (scripts/pack-anatomy-model.mjs); one system per chunk. */
export interface Atlas {version:'2';sex?:'male';source?:string;scope?:string;parts:Part[];chunks:{url:string;bytes:number;gzip?:string;gzipBytes?:number;system:SystemId}[];quantization:{origin:[number,number,number];step:number};triangles:number;systemCounts?:Partial<Record<SystemId,number>>}
// Every system except muscles starts visible.
export const DEFAULT_VISIBLE:SystemId[]=['cardiac','sensory','skeletal','arterial','venous','nervous','respiratory','digestive','urinary','lymphatic','endocrine','reproductive','integumentary','connective'];
