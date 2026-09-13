"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "data", "flywire-circuit.json");
const bytes = fs.readFileSync(file);
const data = JSON.parse(bytes.toString("utf8"));
const expectedHash = "DA53640E4DC7071C26892870EC5B28984C4CFC74C1C44D3A3CDE0A2913579D0F";

assert.equal(crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase(), expectedHash);
assert.equal(data.neurons.length, 668);
assert.equal(data.edges.length, 18968);
assert.match(data.source, /FlyWire Codex FAFB v783/);

const requiredRoles = ["lc4", "lplc2", "gf", "dna01", "dna02", "dnp09", "dng11", "mdn"];
const roles = new Set(data.neurons.map(neuron => neuron.role));
for (const role of requiredRoles) assert.ok(roles.has(role), `população ausente: ${role}`);

const ids = new Set();
for (const neuron of data.neurons) {
  assert.match(neuron.id, /^\d{15,20}$/);
  assert.equal(neuron.pos.length, 3);
  assert.ok(neuron.pos.every(Number.isFinite));
  assert.ok(!ids.has(neuron.id), `root_id duplicado: ${neuron.id}`);
  ids.add(neuron.id);
}

let excitatory = 0;
let inhibitory = 0;
for (const [from, to, synapses] of data.edges) {
  assert.ok(Number.isInteger(from) && from >= 0 && from < data.neurons.length);
  assert.ok(Number.isInteger(to) && to >= 0 && to < data.neurons.length);
  assert.ok(Number.isFinite(synapses) && synapses !== 0);
  if (synapses > 0) excitatory += 1;
  else inhibitory += 1;
}
assert.ok(excitatory > 0 && inhibitory > 0, "o recorte deve preservar ambos os sinais");

console.log(`OK: ${data.neurons.length} neurônios, ${data.edges.length} conexões, ${excitatory} excitatórias, ${inhibitory} inibitórias.`);
