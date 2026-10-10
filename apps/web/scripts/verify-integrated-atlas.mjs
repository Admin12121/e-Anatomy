// Run: bun run scripts/verify-integrated-atlas.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const root = new URL("../public/models/", import.meta.url);
const atlas = JSON.parse(fs.readFileSync(new URL("atlas-v2.json", root)));
assert.equal(atlas.version, "2");
assert.equal(atlas.parts.length, 2234);
assert.equal(Object.values(atlas.systemCounts).reduce((total, count) => total + count, 0), 2234);
assert.deepEqual([...new Set(atlas.parts.map((part) => part.region))].sort(), [0, 1, 2, 3, 4, 5, 6]);

await MeshoptDecoder.ready;
const data = [];
for (const chunk of atlas.chunks) {
  const compressed = fs.readFileSync(new URL(path.basename(chunk.gzip), root));
  const raw = fs.readFileSync(new URL(path.basename(chunk.url), root));
  assert.equal(raw.length, chunk.bytes);
  assert.equal(compressed.length, chunk.gzipBytes);
  assert.deepEqual(gunzipSync(compressed), raw);
  data.push(new Uint8Array(raw));
}

let triangles = 0;
for (const part of atlas.parts) {
  const chunk = atlas.chunks[part.chunk];
  assert.equal(chunk.system, part.system, "each chunk holds one system");
  assert.ok(Number.isInteger(part.region) && part.region >= 0 && part.region < 7);
  const stream = ([offset, length]) => {
    assert.ok(offset + length <= data[part.chunk].length);
    return data[part.chunk].subarray(offset, offset + length);
  };
  const index = new Uint16Array(part.indexCount);
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(index.buffer), part.indexCount, 2, stream(part.index));
  assert.ok(index.every((value) => value < part.vertexCount), "indices stay inside the part");
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(part.vertexCount * 8), part.vertexCount, 8, stream(part.position));
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(part.vertexCount * 4), part.vertexCount, 4, stream(part.normal), "OCTAHEDRAL");
  triangles += part.indexCount / 3;
}
assert.equal(triangles, atlas.triangles);
console.log(`PASS: 7 canonical regions, ${atlas.parts.length} parts decoded, ${atlas.chunks.length} verified gzip+raw files, ${triangles} triangles`);
