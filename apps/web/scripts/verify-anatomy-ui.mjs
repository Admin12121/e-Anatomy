import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const atlas=JSON.parse(read('public/models/atlas-v2.json'));
const schema=read('components/anatomy/atlas/anatomy.ts');
const scene=read('components/anatomy/atlas/scene.tsx');
const stage=read('components/anatomy/anatomy-stage.tsx');
const compact=read('components/content/compact-anatomy-model.tsx');
const home=read('app/(app)/(client)/page.tsx');
const footer=read('app/(app)/(client)/_components/footer.tsx');
const provider=read('components/layout/provider.tsx');
const known=new Set([...schema.matchAll(/\{id:'([^']+)',name:/g)].map(m=>m[1]));
const actual=new Set(atlas.parts.map(p=>p.system));
assert.equal(known.size,15,'UI should expose all 15 systems');
for(const system of actual)assert(known.has(system),`Missing system ${system}`);
assert(stage.includes('All 15 anatomical systems')&&stage.includes('overflow-y-auto'),'Parts controls scroll area');
assert(scene.includes('body.visible=visibleSet.size>0'),'Hide all must also hide the parent group');
assert(scene.includes('mesh.visible=visibleSet.has(system)'),'Late loading meshes must respect visibility');
assert(compact.includes('cameraTargetY={0.67}'),'Slug preview camera is vertically offset');
// The footer tucks under the last screen of the atlas or catalogue, which
// slides up to reveal it; an extra runway screen made users scroll past nothing.
assert(!home.includes('data-footer-reveal-runway'),'View All must not add an empty screen before the footer');
assert(footer.includes('md:mt-[calc(-1*var(--hfc-viewport,100dvh))]'),'Footer tucks under the last screen to be revealed');
assert(home.includes('relative z-10 min-h-[100svh] bg-[#141414]'),'Catalogue sits above the footer it reveals');
assert(!footer.includes('staticVisible'),'Footer reveal animation must not be bypassed');
assert(footer.includes('animationLerp = 0.09'),'Original footer reveal interpolation is preserved');
assert(provider.includes('{isStructuresRoute ? ('),'Structure document owns a native scroller');
assert(!provider.includes('isStructuresRoute || isHomeRoute'),'Home must not bypass Lenis');
assert(provider.includes('duration: 1.2'),'Original desktop Lenis duration is preserved');
assert(provider.includes('lerp: 0.1'),'Original desktop Lenis lerp is preserved');
assert(provider.includes('duration: 0.8'),'Original mobile Lenis duration is preserved');
assert(provider.includes('lerp: 0.09'),'Original mobile Lenis lerp is preserved');
assert(provider.includes('ROUTE_TRANSITION_SETTLED_EVENT'),'Lenis limits refresh after route transitions');
assert(provider.includes('resyncAfterRoute'),'Route recovery is isolated from normal wheel momentum');
// Lenis is only resized as the page grows and scrolls to a catalogue region on
// request; switching views keeps the original browser scroll reset.
assert(home.includes('window.scrollTo(0, 0)'),'View changes use the original browser scroll reset');
assert((home.match(/lenis\.scrollTo\(/g)??[]).length===1&&home.includes('lenis.scrollTo(section'),'Lenis only scrolls to a requested catalogue region');
assert(stage.includes('data-lenis-prevent'),'Parts list must remain independently scrollable');
console.log(`PASS: ${actual.size} systems, ${atlas.parts.length} structures, visibility, footer, navigation and preview checks`);
