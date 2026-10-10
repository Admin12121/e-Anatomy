// Re-packs the 3D anatomy model into meshopt-compressed chunks.
//
//   bun run scripts/pack-anatomy-model.mjs <v1-model-dir> [output-dir]
//
// Input is the earlier per-part uint16 pack (atlas.json + body-packed-N.bin).
// That pack is kept in git history: apps/web/public/models at d4b2dd0.
// The geometry is unchanged apart from two steps far below screen resolution:
// positions snap to a 0.03 mm grid shared by the whole body, and normals use
// 8-bit octahedral encoding. Every part is decoded again with the decoder
// three.js ships and must match exactly before anything is written.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { MeshoptEncoder } from "meshoptimizer/encoder";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// The finest step that still fits the body's height in 16 bits.
const GRID_METRES = 0.00003;
const TARGET_CHUNK_BYTES = 1_500_000;
// Transparent layers blend in triangle order; theirs is kept as authored.
const KEEP_TRIANGLE_ORDER = new Set(["integumentary"]);

const [source, output = source] = process.argv.slice(2);
if (!source || !existsSync(join(source, "atlas.json"))) {
  console.error("usage: bun run scripts/pack-anatomy-model.mjs <v1-model-dir> [output-dir]");
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const v1 = JSON.parse(readFileSync(join(source, "atlas.json"), "utf8"));
const chunks = v1.chunks.map((chunk) => readFileSync(join(source, chunk.url.split("/").pop())));
const slice = (part, offset, length) => {
  const buffer = chunks[part.chunk];
  return buffer.buffer.slice(buffer.byteOffset + offset, buffer.byteOffset + offset + length);
};

// v1 parts each had their own uint16 range; decode them to metres first.
const parts = v1.parts.map((part) => {
  if (part.positionBytes !== 2 || part.normalBytes !== 1 || part.indexBytes !== 2) {
    throw new Error("unexpected v1 part encoding");
  }
  const packed = new Uint16Array(slice(part, part.positions, part.vertexCount * 6));
  const positions = new Float64Array(packed.length);
  for (let n = 0; n < packed.length; n += 1) {
    positions[n] = part.positionMin[n % 3] + packed[n] * part.positionScale[n % 3];
  }
  return {
    part,
    positions,
    normals: new Int8Array(slice(part, part.normals, part.vertexCount * 3)),
    indices: Uint32Array.from(new Uint16Array(slice(part, part.indices, part.indexCount * 2))),
  };
});

// Rounded down to 0.1 µm so the stored origin is exactly the one used.
const origin = [0, 1, 2].map((axis) => {
  let min = Infinity;
  for (const { positions } of parts) {
    for (let n = axis; n < positions.length; n += 3) min = Math.min(min, positions[n]);
  }
  return Math.floor(min * 1e7) / 1e7;
});
const snap = (value, axis) => {
  const step = Math.round((value - origin[axis]) / GRID_METRES);
  if (step < 0 || step > 65535) throw new Error("body does not fit the shared grid");
  return step;
};

const vertexVersion = pickVertexVersion();
let maxShift = 0;
let maxNormalDegrees = 0;

function pickVertexVersion() {
  // Prefer the newer, smaller codec only if three's decoder reads it.
  const probe = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  try {
    const encoded = MeshoptEncoder.encodeVertexBufferLevel(probe, 2, 4, 2, 1);
    const decoded = new Uint8Array(8);
    MeshoptDecoder.decodeVertexBuffer(decoded, 2, 4, encoded);
    if (decoded.every((value, index) => value === probe[index])) return 1;
  } catch {
    // Older decoders reject version 1 streams.
  }
  return 0;
}

function encodePart({ part, positions, normals, indices }) {
  let order = null;
  let count = part.vertexCount;
  let triangles = indices;
  if (!KEEP_TRIANGLE_ORDER.has(part.system)) {
    // Same triangles, reordered for the GPU vertex cache and for compression.
    triangles = Uint32Array.from(indices);
    const [remap, unique] = MeshoptEncoder.reorderMesh(triangles, true, true);
    order = remap;
    count = unique;
  }
  const quantized = new Uint16Array(count * 4);
  const directions = new Float32Array(count * 4);
  for (let v = 0; v < part.vertexCount; v += 1) {
    const target = order ? order[v] : v;
    if (target === 0xffffffff) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[v * 3 + axis];
      const step = snap(value, axis);
      quantized[target * 4 + axis] = step;
      maxShift = Math.max(maxShift, Math.abs(origin[axis] + step * GRID_METRES - value));
    }
    const x = normals[v * 3] / 127;
    const y = normals[v * 3 + 1] / 127;
    const z = normals[v * 3 + 2] / 127;
    const length = Math.hypot(x, y, z) || 1;
    directions.set([x / length, y / length, z / length, 0], target * 4);
  }
  const indexBytes = new Uint8Array(Uint16Array.from(triangles).buffer);
  const streams = {
    position: MeshoptEncoder.encodeVertexBufferLevel(new Uint8Array(quantized.buffer), count, 8, 2, vertexVersion),
    normal: MeshoptEncoder.encodeVertexBufferLevel(
      MeshoptEncoder.encodeFilterOct(directions, count, 4, 8), count, 4, 2, vertexVersion,
    ),
    index: MeshoptEncoder.encodeIndexBuffer(indexBytes, triangles.length, 2),
  };
  verify(streams, count, triangles.length, quantized, indexBytes, directions);
  return { count, streams, quantized };
}

function verify(streams, count, indexCount, quantized, indexBytes, directions) {
  const position = new Uint16Array(count * 4);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(position.buffer), count, 8, streams.position);
  const index = new Uint8Array(indexCount * 2);
  MeshoptDecoder.decodeIndexBuffer(index, indexCount, 2, streams.index);
  const normal = new Int8Array(count * 4);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(normal.buffer), count, 4, streams.normal, "OCTAHEDRAL");
  for (let n = 0; n < count * 4; n += 1) {
    if (n % 4 !== 3 && position[n] !== quantized[n]) throw new Error("position round trip failed");
  }
  // The index codec may rotate a triangle's corners; winding and shape stay.
  const sent = new Uint16Array(indexBytes.buffer);
  const got = new Uint16Array(index.buffer);
  for (let t = 0; t < indexCount; t += 3) {
    const [a, b, c] = [sent[t], sent[t + 1], sent[t + 2]];
    const same = [[a, b, c], [b, c, a], [c, a, b]].some(
      ([x, y, z]) => got[t] === x && got[t + 1] === y && got[t + 2] === z,
    );
    if (!same) throw new Error("index round trip failed");
  }
  for (let v = 0; v < count; v += 1) {
    const [x, y, z] = [normal[v * 4], normal[v * 4 + 1], normal[v * 4 + 2]];
    const length = Math.hypot(x, y, z) || 1;
    const dot = (x * directions[v * 4] + y * directions[v * 4 + 1] + z * directions[v * 4 + 2]) / length;
    maxNormalDegrees = Math.max(maxNormalDegrees, (Math.acos(Math.min(1, dot)) * 180) / Math.PI);
  }
}

// One system per chunk run, so a hidden system can load later on its own.
const encoded = parts.map((entry) => ({ entry, ...encodePart(entry) }));
const bySystem = new Map();
encoded.forEach((item, index) => {
  const list = bySystem.get(item.entry.part.system) ?? [];
  list.push({ ...item, index });
  bySystem.set(item.entry.part.system, list);
});

mkdirSync(output, { recursive: true });
const manifestParts = new Array(parts.length);
const manifestChunks = [];
for (const [system, items] of bySystem) {
  let pending = [];
  let pendingBytes = 0;
  const flush = () => {
    if (!pending.length) return;
    const buffers = [];
    let offset = 0;
    const chunk = manifestChunks.length;
    for (const item of pending) {
      const ranges = {};
      for (const name of ["position", "normal", "index"]) {
        ranges[name] = [offset, item.streams[name].length];
        buffers.push(item.streams[name]);
        offset += item.streams[name].length;
      }
      const { part } = item.entry;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < item.count; v += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
          const value = origin[axis] + item.quantized[v * 4 + axis] * GRID_METRES;
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
      const round = (value) => Math.round(value * 1e6) / 1e6;
      manifestParts[item.index] = {
        system: part.system,
        region: part.region,
        chunk,
        vertexCount: item.count,
        indexCount: part.indexCount,
        bounds: [min.map(round), max.map(round)],
        ...ranges,
      };
    }
    const bytes = Buffer.concat(buffers.map((buffer) => Buffer.from(buffer)));
    const gzip = gzipSync(bytes, { level: 9 });
    const name = `anatomy-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.bin`;
    writeFileSync(join(output, name), bytes);
    writeFileSync(join(output, `${name}.gz`), gzip);
    manifestChunks.push({ url: `/models/${name}`, bytes: bytes.length, gzip: `/models/${name}.gz`, gzipBytes: gzip.length, system });
    pending = [];
    pendingBytes = 0;
  };
  for (const item of items) {
    const size = item.streams.position.length + item.streams.normal.length + item.streams.index.length;
    if (pendingBytes && pendingBytes + size > TARGET_CHUNK_BYTES) flush();
    pending.push(item);
    pendingBytes += size;
  }
  flush();
}

const manifest = {
  version: "2",
  source: v1.source,
  sex: v1.sex,
  scope: v1.scope,
  triangles: v1.triangles,
  sourceTriangles: v1.sourceTriangles,
  optimized: v1.optimized,
  systemCounts: v1.systemCounts,
  encoding: {
    method: "meshopt",
    vertexVersion,
    positions: "uint16 x4 on a shared grid (origin + step * value, metres)",
    normals: "octahedral snorm8 x4",
    indices: "uint16 triangles",
  },
  quantization: { origin, step: GRID_METRES },
  chunks: manifestChunks,
  parts: manifestParts,
};
writeFileSync(join(output, "atlas-v2.json"), `${JSON.stringify(manifest)}\n`);

const total = manifestChunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
console.log(
  `${manifestChunks.length} chunks, ${(total / 1e6).toFixed(2)} MB gzip, codec v${vertexVersion}, ` +
    `max position shift ${(maxShift * 1000).toFixed(3)} mm, max normal change ${maxNormalDegrees.toFixed(2)} deg`,
);
