// Run: node scripts/verify-integrated-atlas.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const root = new URL("../public/models/", import.meta.url);
const atlas = JSON.parse(fs.readFileSync(new URL("atlas.json", root)));
assert.equal(atlas.parts.length, 2234);
assert.equal(atlas.chunks.length, 11);
assert.equal(Object.values(atlas.systemCounts).reduce((total, count) => total + count, 0), 2234);
assert.deepEqual([...new Set(atlas.parts.map(part => part.region))].sort(), [0,1,2,3,4,5,6]);
const data = [];
for (const chunk of atlas.chunks) {
  const compressed = fs.readFileSync(new URL(path.basename(chunk.gzip), root));
  const raw = fs.readFileSync(new URL(path.basename(chunk.url), root));
  assert.equal(raw.length, chunk.bytes);
  assert.equal(compressed.length, chunk.gzipBytes);
  assert.deepEqual(gunzipSync(compressed), raw);
  data.push(raw);
}
let triangles = 0;
for (const part of atlas.parts) {
  assert.ok(Number.isInteger(part.region) && part.region >= 0 && part.region < 7);
  assert.ok(part.indices + part.indexCount * part.indexBytes <= data[part.chunk].length);
  assert.ok(part.positions + part.vertexCount * 3 * part.positionBytes <= data[part.chunk].length);
  assert.ok(part.normals + part.vertexCount * 3 * part.normalBytes <= data[part.chunk].length);
  triangles += part.indexCount / 3;
}
assert.equal(triangles, atlas.triangles);
console.log(`PASS: 7 canonical regions, ${atlas.parts.length} parts, ${atlas.chunks.length} verified gzip+raw files, ${triangles} triangles`);
