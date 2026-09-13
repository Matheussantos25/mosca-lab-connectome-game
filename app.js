"use strict";

const gameCanvas = document.querySelector("#gameCanvas");
const gameCtx = gameCanvas.getContext("2d");
const brainCanvas = document.querySelector("#brainCanvas");
const brainCtx = brainCanvas.getContext("2d");

const ui = {
  toggle: document.querySelector("#toggleButton"),
  toggleLabel: document.querySelector("#toggleLabel"),
  playIcon: document.querySelector(".play-icon"),
  reset: document.querySelector("#resetButton"),
  speed: document.querySelector("#speedControl"),
  speedOutput: document.querySelector("#speedOutput"),
  learning: document.querySelector("#learningToggle"),
  score: document.querySelector("#scoreValue"),
  time: document.querySelector("#timeValue"),
  decision: document.querySelector("#decisionValue"),
  rate: document.querySelector("#spikeRate"),
  status: document.querySelector("#sessionStatus"),
  statusLight: document.querySelector("#statusLight"),
  arenaMessage: document.querySelector("#arenaMessage"),
  dialog: document.querySelector("#helpDialog"),
  datasetStatus: document.querySelector("#datasetStatus"),
  datasetStats: document.querySelector("#datasetStats"),
  neuronCount: document.querySelector("#neuronCount"),
  fruitRate: document.querySelector("#fruitRateValue"),
  efficiency: document.querySelector("#efficiencyValue"),
  collisions: document.querySelector("#collisionValue"),
  samples: document.querySelector("#sampleValue"),
  exportButton: document.querySelector("#exportButton"),
  copyPostButton: document.querySelector("#copyPostButton"),
  copyStatus: document.querySelector("#copyStatus")
};

const WORLD = { width: gameCanvas.width, height: gameCanvas.height, margin: 38 };
const TAU = Math.PI * 2;
const sensors = [0, 0, 0, 0, 0, 0];
const sensorNames = ["VIS.E", "VIS.C", "VIS.D", "ODOR", "RIS.E", "RIS.D"];
const motorNames = ["VIRAR E", "AVANÇAR", "VIRAR D"];

let running = false;
let speed = 1;
let score = 0;
let elapsed = 0;
let lastTime = performance.now();
let accumulator = 0;
let fruitFlash = 0;
let collisionFlash = 0;
let recentSpikeCount = 0;
let spikeWindow = 0;
let displayedRate = 0;
let controllerMode = "connectome";
let collisionCount = 0;
let traveledDistance = 0;
let usefulDistance = 0;
let lastNearestDistance = null;
let telemetry = [];
let telemetryClock = 0;
let dangerCooldown = 0;
let randomClock = 0;
let randomMotors = [0, .5, 0, 0, 0];
let lastMotors = [0, 0, 0, 0, 0];

const fly = { x: WORLD.width * .46, y: WORLD.height * .53, angle: -.5, speed: 0, trail: [] };
let fruits = [];
let dangers = [];

function randomBetween(min, max) { return min + Math.random() * (max - min); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function wrapAngle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function openPosition(radius, existing = []) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const point = {
      x: randomBetween(WORLD.margin + radius, WORLD.width - WORLD.margin - radius),
      y: randomBetween(WORLD.margin + radius, WORLD.height - WORLD.margin - radius),
      radius
    };
    if (distance(point, fly) > 130 && existing.every(item => distance(point, item) > radius + item.radius + 45)) return point;
  }
  return { x: WORLD.width * .75, y: WORLD.height * .25, radius };
}

function populateWorld() {
  fruits = [];
  dangers = [];
  for (let i = 0; i < 5; i += 1) fruits.push(openPosition(11, [...fruits, ...dangers]));
  for (let i = 0; i < 4; i += 1) dangers.push(openPosition(18, [...fruits, ...dangers]));
}

class ConnectomeNetwork {
  constructor(data) {
    this.neurons = data.neurons;
    this.edges = data.edges;
    this.count = this.neurons.length;
    this.potential = new Float32Array(this.count);
    this.spiked = new Uint8Array(this.count);
    this.activity = new Float32Array(this.count);
    this.current = new Float32Array(this.count);
    this.plastic = new Float32Array(this.edges.length).fill(1);
    this.outgoing = Array.from({ length: this.count }, () => []);
    this.lastActiveInputs = new Float32Array(6);
    this.groups = new Map();
    this.neurons.forEach((neuron, index) => {
      if (!this.groups.has(neuron.role)) this.groups.set(neuron.role, []);
      this.groups.get(neuron.role).push(index);
    });

    const incoming = new Uint16Array(this.count);
    this.edges.forEach(edge => { incoming[edge[1]] += 1; });
    this.edges.forEach((edge, edgeIndex) => {
      const [from, to, synapses] = edge;
      const sign = Math.sign(synapses) || 1;
      const strength = Math.log1p(Math.abs(synapses)) / 5;
      const normalized = sign * strength * (1.8 / Math.sqrt(Math.max(1, incoming[to])));
      this.outgoing[from].push({ to, weight: normalized, edgeIndex });
    });
  }

  groupMean(role, side = null) {
    const indices = this.groups.get(role) || [];
    let total = 0;
    let count = 0;
    for (const index of indices) {
      if (side && this.neurons[index].side !== side) continue;
      total += this.activity[index];
      count += 1;
    }
    return count ? total / count : 0;
  }

  step(input) {
    const previous = this.spiked.slice();
    this.spiked.fill(0);
    this.current.fill(0);
    for (let i = 0; i < 6; i += 1) this.lastActiveInputs[i] = this.lastActiveInputs[i] * .93 + input[i] * .07;

    for (let source = 0; source < this.count; source += 1) {
      if (!previous[source]) continue;
      for (const edge of this.outgoing[source]) {
        this.current[edge.to] += edge.weight * this.plastic[edge.edgeIndex];
      }
    }

    const loom = Math.max(input[4], input[5], collisionFlash * .7);
    const odor = input[3];
    const leftVisual = input[0];
    const rightVisual = input[2];
    for (const index of this.groups.get("lc4") || []) this.current[index] += loom * .28 + Math.max(leftVisual, rightVisual) * .035;
    for (const index of this.groups.get("lplc2") || []) this.current[index] += loom * .34 + Math.max(leftVisual, rightVisual) * .045;
    for (const index of this.groups.get("dnp09") || []) this.current[index] += odor * .11 + .025;
    for (const index of this.groups.get("dna01") || []) {
      this.current[index] += (this.neurons[index].side === "left" ? rightVisual : leftVisual) * .13;
    }
    for (const index of this.groups.get("dna02") || []) {
      this.current[index] += (this.neurons[index].side === "left" ? rightVisual : leftVisual) * .11;
    }

    for (let target = 0; target < this.count; target += 1) {
      const noise = randomBetween(-.012, .018);
      this.potential[target] = this.potential[target] * .91 + this.current[target] + noise;
      const threshold = 1.0;
      if (this.potential[target] >= threshold) {
        this.spiked[target] = 1;
        this.potential[target] = 0;
      }
    }

    for (let i = 0; i < this.count; i += 1) {
      this.activity[i] = Math.max(this.spiked[i], this.activity[i] * .88);
      if (this.spiked[i]) recentSpikeCount += 1;
    }
    const left = (this.groupMean("dna01", "right") + this.groupMean("dna02", "right")) * .5;
    const right = (this.groupMean("dna01", "left") + this.groupMean("dna02", "left")) * .5;
    const forward = this.groupMean("dnp09");
    const escape = this.groupMean("gf");
    const backward = this.groupMean("mdn");
    return [left, forward, right, escape, backward];
  }

  reward(amount) {
    if (!ui.learning.checked) return;
    this.edges.forEach((edge, index) => {
      if (this.activity[edge[0]] > .3 && this.activity[edge[1]] > .2) {
        this.plastic[index] = clamp(this.plastic[index] + amount, .82, 1.18);
      }
    });
  }

  reset() {
    this.potential.fill(0);
    this.spiked.fill(0);
    this.activity.fill(0);
    this.plastic.fill(1);
  }
}

let brain = null;
let positions = [];
let brainBackdrop = null;

function senseWorld() {
  const nearestFruit = fruits.reduce((best, item) => !best || distance(fly, item) < distance(fly, best) ? item : best, null);
  const fruitDistance = nearestFruit ? distance(fly, nearestFruit) : 999;
  const fruitAngle = nearestFruit ? wrapAngle(Math.atan2(nearestFruit.y - fly.y, nearestFruit.x - fly.x) - fly.angle) : 0;
  const visualStrength = nearestFruit && fruitDistance < 410 ? (1 - fruitDistance / 410) : 0;

  sensors[0] = fruitAngle < -.12 && fruitAngle > -1.65 ? visualStrength : 0;
  sensors[1] = Math.abs(fruitAngle) <= .42 ? visualStrength * 1.2 : 0;
  sensors[2] = fruitAngle > .12 && fruitAngle < 1.65 ? visualStrength : 0;
  sensors[3] = clamp(1 - fruitDistance / 690, 0, 1) * .9;

  sensors[4] = 0;
  sensors[5] = 0;
  for (const danger of dangers) {
    const d = distance(fly, danger);
    if (d > 150) continue;
    const relative = wrapAngle(Math.atan2(danger.y - fly.y, danger.x - fly.x) - fly.angle);
    const strength = 1 - d / 150;
    if (relative < 0) sensors[4] = Math.max(sensors[4], strength);
    else sensors[5] = Math.max(sensors[5], strength);
  }
  return nearestFruit;
}

function update(dt) {
  if (!brain) return;
  elapsed += dt;
  dangerCooldown = Math.max(0, dangerCooldown - dt);
  fruitFlash = Math.max(0, fruitFlash - dt * 2.5);
  collisionFlash = Math.max(0, collisionFlash - dt * 3);
  const nearestFruit = senseWorld();
  let motors = [0, 0, 0];
  if (controllerMode === "connectome") {
    const neuralSteps = Math.max(1, Math.round(5 * speed));
    for (let i = 0; i < neuralSteps; i += 1) motors = brain.step(sensors);
  } else {
    randomClock -= dt;
    if (randomClock <= 0) {
      randomClock = randomBetween(.3, .85);
      const turn = randomBetween(-1, 1);
      randomMotors = [Math.max(0, -turn), randomBetween(.25, .9), Math.max(0, turn), 0, 0];
    }
    motors = randomMotors;
    brain.activity.forEach((value, i) => { brain.activity[i] = value * .95; });
  }
  lastMotors = motors;

  const biasTowardFruit = nearestFruit
    ? clamp(wrapAngle(Math.atan2(nearestFruit.y - fly.y, nearestFruit.x - fly.x) - fly.angle), -1, 1)
    : 0;
  const turnSignal = (motors[2] - motors[0]) * 2.4 + biasTowardFruit * .2;
  const escapeDrive = motors[3];
  const backwardDrive = motors[4];
  const forwardSignal = .3 + motors[1] * .8 - backwardDrive * .35;
  fly.angle += turnSignal * dt * 2.4;
  fly.speed += (72 + forwardSignal * 78 + escapeDrive * 50 - fly.speed) * dt * 2.2;
  fly.x += Math.cos(fly.angle) * fly.speed * dt;
  fly.y += Math.sin(fly.angle) * fly.speed * dt;
  traveledDistance += Math.abs(fly.speed * dt);
  if (nearestFruit) {
    const nearestDistance = distance(fly, nearestFruit);
    if (lastNearestDistance !== null && nearestDistance < lastNearestDistance) usefulDistance += lastNearestDistance - nearestDistance;
    lastNearestDistance = nearestDistance;
  }

  let decision = "Avançar";
  if (turnSignal < -.25) decision = "Virar à esquerda";
  if (turnSignal > .25) decision = "Virar à direita";
  if (sensors[4] > .45 || sensors[5] > .45) decision = "Evitar perigo";
  if (escapeDrive > .55) decision = "Resposta de fuga";
  if (backwardDrive > .6) decision = "Recuar";
  ui.decision.textContent = decision;

  const bounced = fly.x < WORLD.margin || fly.x > WORLD.width - WORLD.margin || fly.y < WORLD.margin || fly.y > WORLD.height - WORLD.margin;
  if (bounced) {
    fly.x = clamp(fly.x, WORLD.margin, WORLD.width - WORLD.margin);
    fly.y = clamp(fly.y, WORLD.margin, WORLD.height - WORLD.margin);
    fly.angle += Math.PI * .7 + randomBetween(-.35, .35);
    brain.reward(-.008);
    collisionFlash = .7;
    collisionCount += 1;
  }

  for (let i = fruits.length - 1; i >= 0; i -= 1) {
    if (distance(fly, fruits[i]) < 24) {
      fruits.splice(i, 1);
      score += 1;
      brain.reward(.045);
      fruitFlash = 1;
      ui.score.textContent = score;
      fruits.push(openPosition(11, [...fruits, ...dangers]));
      lastNearestDistance = null;
    }
  }

  for (const danger of dangers) {
    if (distance(fly, danger) < danger.radius + 11 && dangerCooldown === 0) {
      fly.angle += Math.PI + randomBetween(-.5, .5);
      fly.x -= Math.cos(fly.angle) * 18;
      fly.y -= Math.sin(fly.angle) * 18;
      brain.reward(-.02);
      collisionFlash = 1;
      collisionCount += 1;
      dangerCooldown = .7;
    }
  }

  fly.trail.push({ x: fly.x, y: fly.y });
  if (fly.trail.length > 85) fly.trail.shift();
  ui.time.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;

  const efficiency = traveledDistance > 0 ? clamp(usefulDistance / traveledDistance * 100, 0, 100) : 0;
  ui.fruitRate.textContent = elapsed > 0 ? (score / elapsed * 60).toFixed(1).replace(".", ",") : "0,0";
  ui.efficiency.textContent = `${Math.round(efficiency)}%`;
  ui.collisions.textContent = collisionCount;

  telemetryClock += dt;
  if (telemetryClock >= .5) {
    telemetryClock = 0;
    telemetry.push({
      tempo_s: Number(elapsed.toFixed(2)), modo: controllerMode, frutas: score,
      colisoes: collisionCount, eficiencia_pct: Number(efficiency.toFixed(2)),
      spikes_hz: displayedRate, decisao: decision,
      visao_esquerda: Number(sensors[0].toFixed(4)), visao_centro: Number(sensors[1].toFixed(4)),
      visao_direita: Number(sensors[2].toFixed(4)), odor: Number(sensors[3].toFixed(4)),
      risco_esquerda: Number(sensors[4].toFixed(4)), risco_direita: Number(sensors[5].toFixed(4)),
      motor_esquerda: Number((motors[0] || 0).toFixed(4)), motor_frente: Number((motors[1] || 0).toFixed(4)),
      motor_direita: Number((motors[2] || 0).toFixed(4))
    });
    ui.samples.textContent = telemetry.length;
  }

  spikeWindow += dt;
  if (spikeWindow >= .5) {
    displayedRate = Math.round(recentSpikeCount / spikeWindow);
    recentSpikeCount = 0;
    spikeWindow = 0;
    ui.rate.textContent = displayedRate;
  }

  if (elapsed >= 60) finishRound();
}

function finishRound() {
  setRunning(false);
  const rate = elapsed > 0 ? score / elapsed * 60 : 0;
  const efficiency = traveledDistance > 0 ? usefulDistance / traveledDistance * 100 : 0;
  ui.arenaMessage.querySelector("strong").textContent = `${score} frutas em 60 segundos`;
  ui.arenaMessage.querySelector("span").textContent = `${rate.toFixed(1).replace(".", ",")} frutas/min · ${Math.round(efficiency)}% de eficiência · ${collisionCount} colisões`;
  ui.arenaMessage.classList.remove("hidden");
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawGrid() {
  gameCtx.strokeStyle = "rgba(150, 180, 155, .055)";
  gameCtx.lineWidth = 1;
  for (let x = 0; x <= WORLD.width; x += 40) {
    gameCtx.beginPath(); gameCtx.moveTo(x, 0); gameCtx.lineTo(x, WORLD.height); gameCtx.stroke();
  }
  for (let y = 0; y <= WORLD.height; y += 40) {
    gameCtx.beginPath(); gameCtx.moveTo(0, y); gameCtx.lineTo(WORLD.width, y); gameCtx.stroke();
  }
}

function drawArena() {
  gameCtx.clearRect(0, 0, WORLD.width, WORLD.height);
  gameCtx.fillStyle = collisionFlash > 0 ? `rgba(224,123,104,${.035 * collisionFlash})` : "#0d110e";
  gameCtx.fillRect(0, 0, WORLD.width, WORLD.height);
  drawGrid();

  gameCtx.strokeStyle = "rgba(156,219,100,.11)";
  gameCtx.lineWidth = 1;
  gameCtx.beginPath();
  fly.trail.forEach((point, index) => index ? gameCtx.lineTo(point.x, point.y) : gameCtx.moveTo(point.x, point.y));
  gameCtx.stroke();

  const nearestFruit = fruits.reduce((best, item) => !best || distance(fly, item) < distance(fly, best) ? item : best, null);
  if (nearestFruit) {
    gameCtx.setLineDash([4, 8]);
    gameCtx.strokeStyle = "rgba(156,219,100,.22)";
    gameCtx.beginPath(); gameCtx.moveTo(fly.x, fly.y); gameCtx.lineTo(nearestFruit.x, nearestFruit.y); gameCtx.stroke();
    gameCtx.setLineDash([]);
  }

  gameCtx.save();
  gameCtx.translate(fly.x, fly.y);
  gameCtx.rotate(fly.angle);
  const vision = 150;
  gameCtx.fillStyle = "rgba(156,219,100,.035)";
  gameCtx.strokeStyle = "rgba(156,219,100,.14)";
  gameCtx.beginPath(); gameCtx.moveTo(6, 0); gameCtx.arc(0, 0, vision, -.58, .58); gameCtx.closePath(); gameCtx.fill(); gameCtx.stroke();
  gameCtx.restore();

  for (const fruit of fruits) {
    gameCtx.shadowColor = "rgba(156,219,100,.42)";
    gameCtx.shadowBlur = 12 + fruitFlash * 10;
    gameCtx.fillStyle = "#9cdb64";
    gameCtx.beginPath(); gameCtx.arc(fruit.x, fruit.y, fruit.radius, 0, TAU); gameCtx.fill();
    gameCtx.shadowBlur = 0;
    gameCtx.strokeStyle = "#0b0e0c";
    gameCtx.lineWidth = 2;
    gameCtx.beginPath(); gameCtx.moveTo(fruit.x + 1, fruit.y - 10); gameCtx.quadraticCurveTo(fruit.x + 3, fruit.y - 18, fruit.x + 9, fruit.y - 17); gameCtx.stroke();
  }

  for (const danger of dangers) {
    gameCtx.strokeStyle = "rgba(224,123,104,.76)";
    gameCtx.lineWidth = 1.5;
    gameCtx.beginPath(); gameCtx.arc(danger.x, danger.y, danger.radius, 0, TAU); gameCtx.stroke();
    gameCtx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = i * TAU / 8;
      gameCtx.moveTo(danger.x + Math.cos(a) * (danger.radius - 4), danger.y + Math.sin(a) * (danger.radius - 4));
      gameCtx.lineTo(danger.x + Math.cos(a) * (danger.radius + 7), danger.y + Math.sin(a) * (danger.radius + 7));
    }
    gameCtx.stroke();
  }

  gameCtx.save();
  gameCtx.translate(fly.x, fly.y);
  gameCtx.rotate(fly.angle);
  gameCtx.fillStyle = "rgba(220,231,222,.34)";
  gameCtx.beginPath(); gameCtx.ellipse(-2, -9, 12, 6, -.35, 0, TAU); gameCtx.fill();
  gameCtx.beginPath(); gameCtx.ellipse(-2, 9, 12, 6, .35, 0, TAU); gameCtx.fill();
  gameCtx.fillStyle = "#dce7de";
  gameCtx.beginPath(); gameCtx.ellipse(0, 0, 12, 7, 0, 0, TAU); gameCtx.fill();
  gameCtx.fillStyle = "#9cdb64";
  gameCtx.beginPath(); gameCtx.arc(10, 0, 5, 0, TAU); gameCtx.fill();
  gameCtx.restore();

  gameCtx.strokeStyle = "rgba(115,135,120,.28)";
  gameCtx.lineWidth = 2;
  roundedRect(gameCtx, WORLD.margin / 2, WORLD.margin / 2, WORLD.width - WORLD.margin, WORLD.height - WORLD.margin, 13);
  gameCtx.stroke();
}

function buildBrainVisual() {
  if (!brain) return;
  const xs = brain.neurons.map(neuron => neuron.pos[0]);
  const ys = brain.neurons.map(neuron => neuron.pos[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  positions = brain.neurons.map(neuron => ({
    x: 28 + ((neuron.pos[0] - minX) / (maxX - minX || 1)) * 464,
    y: 22 + ((neuron.pos[1] - minY) / (maxY - minY || 1)) * 284
  }));

  brainBackdrop = document.createElement("canvas");
  brainBackdrop.width = brainCanvas.width;
  brainBackdrop.height = brainCanvas.height;
  const ctx = brainBackdrop.getContext("2d");
  ctx.fillStyle = "#0d110e";
  ctx.fillRect(0, 0, brainBackdrop.width, brainBackdrop.height);
  ctx.lineWidth = .38;
  for (const [from, to, synapses] of brain.edges) {
    const alpha = clamp(.012 + Math.log1p(Math.abs(synapses)) * .009, .012, .07);
    ctx.strokeStyle = synapses >= 0 ? `rgba(156,219,100,${alpha})` : `rgba(224,123,104,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(positions[from].x, positions[from].y);
    ctx.lineTo(positions[to].x, positions[to].y);
    ctx.stroke();
  }
}

function drawBrain() {
  brainCtx.clearRect(0, 0, brainCanvas.width, brainCanvas.height);
  if (!brain || !brainBackdrop) {
    brainCtx.fillStyle = "#0d110e";
    brainCtx.fillRect(0, 0, brainCanvas.width, brainCanvas.height);
    brainCtx.fillStyle = "#96a399";
    brainCtx.font = "11px Cascadia Mono, monospace";
    brainCtx.textAlign = "center";
    brainCtx.fillText("CARREGANDO CONECTOMA", brainCanvas.width / 2, brainCanvas.height / 2);
    return;
  }
  brainCtx.drawImage(brainBackdrop, 0, 0);

  positions.forEach((point, index) => {
    const activity = brain.activity[index];
    const role = brain.neurons[index].role;
    const isMotor = ["dna01", "dna02", "dnp09", "gf", "mdn", "dng11"].includes(role);
    const isSensor = role === "lc4" || role === "lplc2";
    brainCtx.shadowColor = "rgba(156,219,100,.8)";
    brainCtx.shadowBlur = activity * 10;
    brainCtx.fillStyle = activity > .35 ? "#c6f59a" : isMotor ? "#5f795f" : isSensor ? "#344735" : "#29342b";
    brainCtx.beginPath(); brainCtx.arc(point.x, point.y, isMotor ? 2.8 : 1.45, 0, TAU); brainCtx.fill();
    brainCtx.shadowBlur = 0;
  });

  const annotatedRoles = ["LC4", "LPLC2", "GF", "DNa", "DNp09", "MDN"];
  brainCtx.font = "8px Cascadia Mono, monospace";
  brainCtx.fillStyle = "rgba(220,231,222,.68)";
  brainCtx.textAlign = "left";
  annotatedRoles.forEach((label, i) => brainCtx.fillText(label, 12 + i * 80, 319));
}

function render() { drawArena(); drawBrain(); }

function frame(now) {
  const rawDelta = Math.min((now - lastTime) / 1000, .05);
  lastTime = now;
  if (running) {
    accumulator += rawDelta * speed;
    while (accumulator >= 1 / 60) {
      update(1 / 60);
      accumulator -= 1 / 60;
    }
  } else {
    if (brain) brain.activity.forEach((value, i) => { brain.activity[i] = value * .96; });
  }
  render();
  requestAnimationFrame(frame);
}

function setRunning(next) {
  running = next;
  ui.toggleLabel.textContent = running ? "Pausar" : "Iniciar";
  ui.playIcon.classList.toggle("pause", running);
  ui.status.textContent = running ? `${controllerMode === "connectome" ? "Conectoma" : "Baseline"} em curso` : "Simulação pausada";
  ui.statusLight.classList.toggle("live", running);
  ui.arenaMessage.classList.toggle("hidden", running || elapsed > 0);
}

function resetSimulation() {
  setRunning(false);
  score = 0;
  elapsed = 0;
  accumulator = 0;
  displayedRate = 0;
  collisionCount = 0;
  traveledDistance = 0;
  usefulDistance = 0;
  lastNearestDistance = null;
  telemetry = [];
  telemetryClock = 0;
  dangerCooldown = 0;
  randomClock = 0;
  fly.x = WORLD.width * .46;
  fly.y = WORLD.height * .53;
  fly.angle = -.5;
  fly.speed = 0;
  fly.trail = [];
  sensors.fill(0);
  if (brain) brain.reset();
  populateWorld();
  ui.score.textContent = "0";
  ui.time.textContent = "00:00";
  ui.rate.textContent = "0";
  ui.decision.textContent = "Aguardando estímulo";
  ui.fruitRate.textContent = "0,0";
  ui.efficiency.textContent = "0%";
  ui.collisions.textContent = "0";
  ui.samples.textContent = "0";
  ui.arenaMessage.classList.remove("hidden");
  ui.arenaMessage.querySelector("strong").textContent = "Pronta para explorar";
  ui.arenaMessage.querySelector("span").textContent = "Inicie a simulação e acompanhe as decisões da rede.";
}

function downloadTelemetry() {
  if (!telemetry.length) {
    ui.copyStatus.textContent = "Execute a simulação primeiro";
    return;
  }
  const columns = Object.keys(telemetry[0]);
  const escapeCell = value => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [columns.join(","), ...telemetry.map(row => columns.map(column => escapeCell(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `mosca-lab-${controllerMode}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  ui.copyStatus.textContent = `${telemetry.length} linhas exportadas`;
}

async function copyLinkedInPost() {
  const rate = elapsed > 0 ? score / elapsed * 60 : 0;
  const efficiency = traveledDistance > 0 ? usefulDistance / traveledDistance * 100 : 0;
  const post = `Transformei 668 neurônios reais de uma mosca em um experimento jogável.\n\nUsei um subconjunto do FlyWire FAFB v783 com 18.968 conexões sinápticas para controlar uma mosca virtual e responder uma pergunta: o conectoma consegue superar uma política aleatória?\n\nResultado desta rodada (${controllerMode === "connectome" ? "conectoma" : "baseline aleatório"}):\n• ${score} frutas coletadas\n• ${rate.toFixed(1)} frutas por minuto\n• ${Math.round(efficiency)}% de eficiência de trajetória\n• ${collisionCount} colisões\n\nO projeto combina análise de redes, simulação LIF, engenharia de dados e visualização interativa. A anatomia e as conexões são reais; os estímulos, a dinâmica neural e o corpo são modelos computacionais.\n\nCódigo e metodologia no GitHub.\n\n#DataScience #DataAnalytics #Neuroscience #Connectome #JavaScript`;
  try {
    await navigator.clipboard.writeText(post);
    ui.copyStatus.textContent = "Post copiado";
  } catch {
    ui.copyStatus.textContent = "Não foi possível copiar";
  }
}

ui.toggle.addEventListener("click", () => setRunning(!running));
ui.reset.addEventListener("click", resetSimulation);
ui.speed.addEventListener("input", event => {
  speed = Number(event.target.value);
  ui.speedOutput.textContent = `${speed.toFixed(1).replace(".", ",")}x`;
});
document.querySelectorAll('input[name="controllerMode"]').forEach(input => {
  input.addEventListener("change", event => {
    controllerMode = event.target.value;
    resetSimulation();
    ui.datasetStatus.textContent = controllerMode === "connectome" ? "FlyWire FAFB v783 verificado" : "Baseline aleatório ativo";
  });
});
ui.exportButton.addEventListener("click", downloadTelemetry);
ui.copyPostButton.addEventListener("click", copyLinkedInPost);

document.querySelector("#helpButton").addEventListener("click", () => ui.dialog.showModal());
document.querySelector("#aboutButton").addEventListener("click", () => ui.dialog.showModal());
document.querySelector("#closeHelp").addEventListener("click", () => ui.dialog.close());
document.querySelector("#understoodButton").addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("click", event => {
  if (event.target === ui.dialog) ui.dialog.close();
});

async function loadConnectome() {
  ui.toggle.disabled = true;
  ui.toggleLabel.textContent = "Carregando";
  try {
    const response = await fetch("data/flywire-circuit.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.neurons) || !Array.isArray(data.edges) || data.neurons.length < 100) {
      throw new Error("Formato de conectoma inválido");
    }
    brain = new ConnectomeNetwork(data);
    buildBrainVisual();
    ui.datasetStatus.textContent = "FlyWire FAFB v783 verificado";
    ui.datasetStats.textContent = `${brain.count} neurônios · ${brain.edges.length.toLocaleString("pt-BR")} conexões`;
    ui.neuronCount.textContent = brain.count.toLocaleString("pt-BR");
    ui.toggle.disabled = false;
    ui.toggleLabel.textContent = "Iniciar";
  } catch (error) {
    ui.datasetStatus.textContent = "Falha ao carregar o conectoma";
    ui.datasetStats.textContent = error.message;
    document.querySelector(".dataset-source").classList.add("error");
    ui.arenaMessage.querySelector("strong").textContent = "Dados indisponíveis";
    ui.arenaMessage.querySelector("span").textContent = "Sirva a pasta por HTTP para carregar o arquivo local.";
  }
}

populateWorld();
render();
loadConnectome();
requestAnimationFrame(frame);
