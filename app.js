const TRACKS = [
  { id: "kick", label: "KICK", color: "#ff7417" },
  { id: "snare", label: "SNARE", color: "#ff4b3e" },
  { id: "hat", label: "HAT", color: "#ffd05a" },
  { id: "open", label: "OPEN", color: "#f7a33a" },
  { id: "clap", label: "CLAP", color: "#80dd72" },
  { id: "perc", label: "PERC", color: "#5aa8ff" },
  { id: "sample", label: "SAMPLE", color: "#bc82ff" },
  { id: "bass", label: "BASS", color: "#ff8cc8" },
];

const MAX_STEPS = 128;
const LENGTH_OPTIONS = [16, 32, 64, 128];
const SAVE_KEY = "gr4600_clean_project_v1";
const TEMPLATE_KEY = "gr4600_clean_templates_v1";
const PATTERN_BANK_KEY = "gr4600_pattern_bank_v1";

const model = {
  tempo: 140,
  swing: 58,
  masterPitch: 0,
  playing: false,
  recording: false,
  step: 0,
  length: 16,
  pattern: Object.fromEntries(TRACKS.map(t => [t.id, new Array(MAX_STEPS).fill(false)])),
  master: 0.82,
  volumes: Object.fromEntries(TRACKS.map(t => [t.id, ({
    kick: 0.68,
    snare: 0.72,
    hat: 0.36,
    open: 0.42,
    clap: 0.58,
    perc: 0.54,
    sample: 0.64,
    bass: 0.62,
  }[t.id] ?? 0.58)])),
  tunes: Object.fromEntries(TRACKS.map(t => [t.id, 0])),
  decays: Object.fromEntries(TRACKS.map(t => [t.id, t.id === "hat" ? 0.22 : 0.7])),
  tones: Object.fromEntries(TRACKS.map(t => [t.id, 0.72])),
  sampleRun: true,
  sampleStretch: false,
  sampleTimeStretch: true,
  sampleCutSelf: true,
  samplePitch: 0,
  sampleStart: 0,
  sampleEnd: 1,
  sampleName: "",
  sampleDataUrl: "",
  soundNames: Object.fromEntries(TRACKS.map(t => [t.id, t.label])),
  customSoundData: Object.fromEntries(TRACKS.map(t => [t.id, ""])),
  selectedPad: "kick",
  selectedTrack: "kick",
  muted: Object.fromEntries(TRACKS.map(t => [t.id, false])),
  fx: { slice: false, stutter: false, repeat: false, glitch: false, depth: 0.55, sliceTiming: "1/4" },
  channelFx: Object.fromEntries(TRACKS.map(t => [t.id, { eq: false, chorus: false, reverb: false, phaser: false, softClip: false }])),
  masterFx: { eq: false, chorus: false, reverb: false, phaser: false, softClip: false },
  fxParams: { eqLow: 2, eqHigh: -1.5, chorusWet: 0.18, reverbWet: 0.2, clipDrive: 2.4 },
  channelEq: Object.fromEntries(TRACKS.map(t => [t.id, {
    hp: 20,
    low: 0,
    lowFreq: 120,
    lowMid: 0,
    lowMidFreq: 420,
    lowMidQ: 1.05,
    highMid: 0,
    highMidFreq: 2200,
    highMidQ: 1.05,
    high: 0,
    highFreq: 7600,
    lp: 20000,
  }])),
};

let audioCtx = null;
let masterGain = null;
let sampleBuffer = null;
let sampleSource = null;
const kitBuffers = Object.fromEntries(TRACKS.map(t => [t.id, []]));
let timer = null;
let nextNoteTime = 0;
let recorderDest = null;
let mediaRecorder = null;
let recordChunks = [];
let fxPulse = 0;
let copiedTrack = null;
let contextStep = null;
let contextTarget = { type: "machine", trackId: "kick", step: 0 };
let previewSource = null;
let granularTimer = null;
let sampleChopSources = [];
let renderingDryStems = false;
let kitManifest = null;
let soundBrowserTrack = "kick";
let fxDisplayState = { touched: "READY", target: "MASTER", detail: "DRY", accent: "#7edbff" };
let copiedPattern = null;
const undoStack = [];
const redoStack = [];

const KEY_MAP = {
  KeyA: -12, KeyW: -11, KeyS: -10, KeyE: -9, KeyD: -8, KeyF: -7, KeyT: -6,
  KeyG: -5, KeyY: -4, KeyH: -3, KeyU: -2, KeyJ: -1, KeyK: 0, KeyO: 1,
  KeyL: 2, KeyP: 3, Semicolon: 4, Quote: 5,
};

const KEY_LABELS = Object.fromEntries(Object.entries(KEY_MAP).map(([code, semi]) => [
  semi,
  ({ Semicolon: ";", Quote: "'" }[code] || code.replace("Key", "")),
]));

const PAD_KEY_MAP = {
  Digit1: "kick", Digit2: "snare", Digit3: "hat", Digit4: "open",
  Digit5: "clap", Digit6: "perc", Digit7: "sample", Digit8: "bass",
  Numpad1: "kick", Numpad2: "snare", Numpad3: "hat", Numpad4: "open",
  Numpad5: "clap", Numpad6: "perc", Numpad7: "sample", Numpad8: "bass",
};

const EQ_BANDS = [
  { key: "hp", label: "HPF", color: "#a56bff", freqKey: "hp", filter: true },
  { key: "low", label: "LOW", color: "#ff4ca3", freqKey: "lowFreq" },
  { key: "lowMid", label: "LOW MID", color: "#ff7b4a", freqKey: "lowMidFreq", qKey: "lowMidQ" },
  { key: "highMid", label: "HIGH MID", color: "#f5df35", freqKey: "highMidFreq", qKey: "highMidQ" },
  { key: "high", label: "HIGH", color: "#30e56b", freqKey: "highFreq" },
  { key: "lp", label: "LPF", color: "#34c8ff", freqKey: "lp", filter: true },
];

const PIANO_KEYS = Array.from({ length: 25 }, (_, i) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitones = i - 12;
  const midi = 60 + semitones;
  const note = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return [`${names[note]}${octave}`, semitones, names[note].includes("#")];
});

const els = {
  machine: document.querySelector(".machine"),
  tempo: document.getElementById("tempo"),
  tempoNumber: document.getElementById("tempoNumber"),
  tempoKnob: document.getElementById("tempoKnob"),
  swing: document.getElementById("swing"),
  swingKnob: document.getElementById("swingKnob"),
  swingReadout: document.getElementById("swingReadout"),
  master: document.getElementById("master"),
  masterKnob: document.getElementById("masterKnob"),
  masterReadout: document.getElementById("masterReadout"),
  masterPitch: document.getElementById("masterPitch"),
  masterPitchKnob: document.getElementById("masterPitchKnob"),
  masterPitchReadout: document.getElementById("masterPitchReadout"),
  screenTempo: document.getElementById("screenTempo"),
  screenState: document.getElementById("screenState"),
  screenInfo: document.getElementById("screenInfo"),
  screenStep: document.getElementById("screenStep"),
  screenTempoMini: document.getElementById("screenTempoMini"),
  screenKey: document.getElementById("screenKey"),
  screenPattern: document.getElementById("screenPattern"),
  screenMode: document.getElementById("screenMode"),
  tracks: document.getElementById("tracks"),
  grid: document.getElementById("grid"),
  seqZoom: document.getElementById("seqZoom"),
  sequencerPanel: document.querySelector(".sequencer-panel"),
  playBtn: document.getElementById("playBtn"),
  stopBtn: document.getElementById("stopBtn"),
  recordBtn: document.getElementById("recordBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  exportBtn: document.getElementById("exportBtn"),
  helpBtn: document.getElementById("helpBtn"),
  exportDialog: document.getElementById("exportDialog"),
  helpDialog: document.getElementById("helpDialog"),
  confirmExport: document.getElementById("confirmExport"),
  stemsToggle: document.getElementById("stemsToggle"),
  stemsFxToggle: document.getElementById("stemsFxToggle"),
  fxTarget: document.getElementById("fxTarget"),
  mixFxStatus: document.getElementById("mixFxStatus"),
  eqLow: document.getElementById("eqLow"),
  eqHigh: document.getElementById("eqHigh"),
  chorusWet: document.getElementById("chorusWet"),
  reverbWet: document.getElementById("reverbWet"),
  clipDrive: document.getElementById("clipDrive"),
  sampleInput: document.getElementById("sampleInput"),
  sampleName: document.getElementById("sampleName"),
  sampleRunBtn: document.getElementById("sampleRunBtn"),
  sampleStretchBtn: document.getElementById("sampleStretchBtn"),
  sampleTimeStretch: document.getElementById("sampleTimeStretch"),
  sampleCutSelf: document.getElementById("sampleCutSelf"),
  samplePitch: document.getElementById("samplePitch"),
  samplePitchDown: document.getElementById("samplePitchDown"),
  samplePitchUp: document.getElementById("samplePitchUp"),
  samplePitchReadout: document.getElementById("samplePitchReadout"),
  sampleStart: document.getElementById("sampleStart"),
  sampleEnd: document.getElementById("sampleEnd"),
  sampleLevel: document.getElementById("sampleLevel"),
  sampleStartReadout: document.getElementById("sampleStartReadout"),
  sampleEndReadout: document.getElementById("sampleEndReadout"),
  sampleLevelReadout: document.getElementById("sampleLevelReadout"),
  sampleKeyReadout: document.getElementById("sampleKeyReadout"),
  sampleTempoReadout: document.getElementById("sampleTempoReadout"),
  sampleShiftReadout: document.getElementById("sampleShiftReadout"),
  sampleModeReadout: document.getElementById("sampleModeReadout"),
  sampleClearBtn: document.getElementById("sampleClearBtn"),
  templateName: document.getElementById("templateName"),
  templateStatus: document.getElementById("templateStatus"),
  templateSaveBtn: document.getElementById("templateSaveBtn"),
  templateSelect: document.getElementById("templateSelect"),
  templateLoadBtn: document.getElementById("templateLoadBtn"),
  templateDeleteBtn: document.getElementById("templateDeleteBtn"),
  copyTrackBtn: document.getElementById("copyTrackBtn"),
  pasteTrackBtn: document.getElementById("pasteTrackBtn"),
  patternBuilderBtn: document.getElementById("patternBuilderBtn"),
  patternDialog: document.getElementById("patternDialog"),
  patternSlot: document.getElementById("patternSlot"),
  patternStatus: document.getElementById("patternStatus"),
  patternSaveBtn: document.getElementById("patternSaveBtn"),
  patternLoadBtn: document.getElementById("patternLoadBtn"),
  patternDuplicateBtn: document.getElementById("patternDuplicateBtn"),
  patternAppendBtn: document.getElementById("patternAppendBtn"),
  patternChain: document.getElementById("patternChain"),
  patternChainBtn: document.getElementById("patternChainBtn"),
  patternOneSaveBtn: document.getElementById("patternOneSaveBtn"),
  patternOneLoadBtn: document.getElementById("patternOneLoadBtn"),
  patternTwoSaveBtn: document.getElementById("patternTwoSaveBtn"),
  patternTwoLoadBtn: document.getElementById("patternTwoLoadBtn"),
  patternOneTwoBtn: document.getElementById("patternOneTwoBtn"),
  patternSplitBtn: document.getElementById("patternSplitBtn"),
  patternMenu: document.getElementById("patternMenu"),
  stepMenu: document.getElementById("stepMenu"),
  unitMenu: document.getElementById("unitMenu"),
  soundEqCanvas: document.getElementById("soundEqCanvas"),
  fxPanel: document.querySelector(".fx-panel"),
  fxCollapseBtn: document.getElementById("fxCollapseBtn"),
  fxDepth: document.getElementById("fxDepth"),
  fxDepthKnob: document.getElementById("fxDepthKnob"),
  fxDepthReadout: document.getElementById("fxDepthReadout"),
  sliceTiming: document.getElementById("sliceTiming"),
  fxDisplay: document.getElementById("fxDisplay"),
  fxReadout: document.getElementById("fxReadout"),
  wave: document.getElementById("wave"),
  soundBrowser: document.getElementById("soundBrowser"),
  soundBrowserTitle: document.getElementById("soundBrowserTitle"),
  soundBrowserKey: document.getElementById("soundBrowserKey"),
  soundBrowserClose: document.getElementById("soundBrowserClose"),
  soundPianoRoll: document.getElementById("soundPianoRoll"),
  soundKeys: document.getElementById("soundKeys"),
  soundEq: document.getElementById("soundEq"),
  soundList: document.getElementById("soundList"),
};

function ensureAudio() {
  if (audioCtx) return audioCtx;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = model.master;
  masterGain.connect(audioCtx.destination);
  return audioCtx;
}

async function unlockAudio() {
  const ctx = ensureAudio();
  if (ctx.state !== "running") {
    await ctx.resume();
  }
  return ctx;
}

function stepDuration() {
  return 60 / model.tempo / stepSubdivision();
}

function stepSubdivision() {
  return model.length === 128 ? 32 : 4;
}

function swingOffset(step) {
  if (step % 2 === 0) return 0;
  return stepDuration() * ((model.swing - 50) / 50) * 0.5;
}

function setInfo(text) {
  els.screenInfo.textContent = text;
  setFxScope("SYSTEM", text, "#7edbff");
}

function setFxScope(target = "SYSTEM", detail = "READY", accent = "#7edbff") {
  fxDisplayState = { target, detail, touched: detail, accent };
}

function remember(action = "EDIT") {
  try {
    undoStack.push(JSON.stringify(snapshot()));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    setInfo(`${action} READY`);
  } catch (error) {
    console.warn("History save failed", error);
  }
}

async function applyHistoryState(raw, label) {
  if (!raw) {
    setInfo(`NO ${label}`);
    return;
  }
  await restore(JSON.parse(raw));
  setInfo(label);
}

async function undoLast() {
  if (!undoStack.length) {
    setInfo("NOTHING TO UNDO");
    return;
  }
  redoStack.push(JSON.stringify(snapshot()));
  await applyHistoryState(undoStack.pop(), "UNDO");
}

async function redoLast() {
  if (!redoStack.length) {
    setInfo("NOTHING TO REDO");
    return;
  }
  undoStack.push(JSON.stringify(snapshot()));
  await applyHistoryState(redoStack.pop(), "REDO");
}

function refreshScreen() {
  els.screenTempo.textContent = `BPM ${model.tempo}`;
  els.screenState.textContent = model.playing ? "PLAY" : "STOP";
  els.screenStep.textContent = `STEP ${model.step + 1} / ${model.length}`;
  if (els.screenTempoMini) els.screenTempoMini.textContent = String(model.tempo);
  if (els.screenKey) els.screenKey.textContent = sampleBuffer ? pitchName(model.samplePitch) : "C MIN";
  if (els.screenPattern) els.screenPattern.textContent = `${Math.floor(model.step / 16) + 1} / ${Math.max(1, model.length / 16)}`;
  if (els.screenMode) els.screenMode.textContent = sampleBuffer && model.selectedTrack === "sample" ? "CHOP" : model.recording ? "REC" : "BEAT";
  els.swingReadout.textContent = `${model.swing}%`;
  els.masterReadout.textContent = String(Math.round(model.master * 100));
  els.masterPitchReadout.textContent = `${model.masterPitch} ST`;
  if (els.samplePitchReadout) els.samplePitchReadout.textContent = `${pitchName(model.samplePitch)} ${model.samplePitch >= 0 ? "+" : ""}${model.samplePitch}`;
  if (els.sampleTempoReadout) els.sampleTempoReadout.textContent = sampleBuffer ? `TEMPO ${model.tempo}` : "TEMPO --";
  if (els.sampleKeyReadout) els.sampleKeyReadout.textContent = sampleBuffer ? `KEY ${pitchName(model.samplePitch)}` : "KEY --";
  if (els.sampleShiftReadout) els.sampleShiftReadout.textContent = `${model.samplePitch >= 0 ? "+" : ""}${model.samplePitch} ST`;
  if (els.sampleModeReadout) els.sampleModeReadout.textContent = model.sampleStretch ? "STRETCH" : model.sampleTimeStretch ? "KEY LOCK" : "CLASSIC";
  if (masterGain) masterGain.gain.value = model.master;
  els.playBtn.classList.toggle("on", model.playing);
  els.recordBtn.classList.toggle("on", model.recording);
  els.machine?.classList.toggle("playing", model.playing);
  els.sampleRunBtn.classList.toggle("on", model.sampleRun);
  els.sampleStretchBtn.classList.toggle("on", model.sampleStretch);
  if (els.sampleTimeStretch) els.sampleTimeStretch.checked = model.sampleTimeStretch;
}

function pitchName(semitones = 0) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[((semitones % 12) + 12) % 12];
}

function setSamplePitch(value) {
  model.samplePitch = Math.max(-12, Math.min(12, Math.round(Number(value) || 0)));
  if (els.samplePitch) els.samplePitch.value = String(model.samplePitch);
  if (model.playing && model.sampleRun) startSampleLoop();
  setFxScope("SAMPLER KEY", `${pitchName(model.samplePitch)} ${model.samplePitch >= 0 ? "+" : ""}${model.samplePitch}`, "#7edbff");
  refreshScreen();
}

function mountKnob(host, opts) {
  if (!host) return null;
  host.innerHTML = `
    <div class="knob-scale" aria-hidden="true">
      ${Array.from({ length: 9 }, (_, i) => `<i style="--tick:${i}"></i>`).join("")}
    </div>
    <div class="knob" role="slider" tabindex="0" aria-label="${opts.label}" aria-valuemin="${opts.min}" aria-valuemax="${opts.max}">
      <div class="knob-cap"><span></span></div>
    </div>
    <div class="knob-label">${opts.label}</div>
    <div class="knob-value"></div>
  `;
  const knob = host.querySelector(".knob");
  const valueEl = host.querySelector(".knob-value");
  let value = opts.value;
  const commit = next => {
    value = Math.max(opts.min, Math.min(opts.max, next));
    setKnobVisual(knob, value, opts.min, opts.max);
    valueEl.textContent = formatKnobValue(value, opts);
    knob.setAttribute("aria-valuenow", String(Math.round(value * 100) / 100));
    opts.onChange(value);
  };
  let startY = 0;
  let startValue = value;
  knob.addEventListener("pointerdown", event => {
    event.preventDefault();
    knob.setPointerCapture(event.pointerId);
    startY = event.clientY;
    startValue = value;
  });
  knob.addEventListener("pointermove", event => {
    if (!knob.hasPointerCapture(event.pointerId)) return;
    const span = opts.max - opts.min;
    commit(startValue + ((startY - event.clientY) / 120) * span);
  });
  knob.addEventListener("keydown", event => {
    const span = opts.max - opts.min;
    const step = event.shiftKey ? span / 40 : span / 100;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      commit(value + step);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      commit(value - step);
    }
  });
  commit(value);
  return { set: commit };
}

function setKnobVisual(knob, value, min, max) {
  if (!knob) return;
  const pct = (value - min) / (max - min || 1);
  const deg = -135 + pct * 270;
  knob.style.setProperty("--angle", `${deg}deg`);
}

function formatKnobValue(value, opts) {
  if (opts.unit === "st") return `${Math.round(value)}`;
  if (opts.max <= 1) return String(Math.round(value * 100));
  return String(Math.round(value));
}

function buildMixer() {
  els.tracks.innerHTML = "";
  TRACKS.forEach((track, index) => {
    const wrap = document.createElement("div");
    wrap.className = "track";
    wrap.dataset.track = track.id;
    wrap.style.setProperty("--track-color", track.color);
    wrap.innerHTML = `
      <button class="track-name" type="button"><i class="lane-led"></i><span>${model.soundNames[track.id] || track.label}</span></button>
      <button class="lane-power ${model.muted[track.id] ? "" : "on"}" type="button" aria-label="${track.label} on off"></button>
      <div class="channel-main-knob" data-kind="level"></div>
      <div class="fader-wrap pitch-fader-wrap">
        <input class="pitch-fader fader" type="range" min="-12" max="12" step="1" value="${model.tunes[track.id]}">
      </div>
      <select class="kit-select" aria-label="${track.label} sound kit">
        <option value="">KIT</option>
      </select>
      <button class="sound-load" type="button">PAD ${index + 1}</button>
      <input class="sound-file" type="file" accept="audio/*">
    `;
    const pitchInput = wrap.querySelector(".pitch-fader");
    pitchInput.addEventListener("input", event => {
      model.tunes[track.id] = Number(event.target.value);
      setInfo(`${track.label} PITCH ${model.tunes[track.id]} ST`);
    });
    pitchInput.addEventListener("change", () => remember(`${track.label} PITCH`));
    const trackNameBtn = wrap.querySelector(".track-name");
    trackNameBtn.addEventListener("click", async () => {
      await unlockAudio();
      selectTrack(track.id);
      auditionTrackPitch(track.id, 0);
      openSoundBrowser(track.id);
    });
    trackNameBtn.addEventListener("contextmenu", event => {
      event.preventDefault();
      selectTrack(track.id);
      contextTarget = { type: "track", trackId: track.id, step: 0 };
      openPianoRoll(track.id);
      showUnitMenu(event.clientX, event.clientY, "track");
    });
    wrap.querySelector(".lane-power").addEventListener("click", event => {
      event.stopPropagation();
      remember(`${track.label} MUTE`);
      model.muted[track.id] = !model.muted[track.id];
      event.currentTarget.classList.toggle("on", !model.muted[track.id]);
      setInfo(`${track.label} ${model.muted[track.id] ? "MUTED" : "ON"}`);
    });
    const soundBtn = wrap.querySelector(".sound-load");
    const soundFile = wrap.querySelector(".sound-file");
    const kitSelect = wrap.querySelector(".kit-select");
    populateKitSelect(kitSelect, track.id);
    kitSelect.addEventListener("change", () => {
      remember(`${track.label} SOUND`);
      if (kitSelect.value) loadKitSound(track.id, kitSelect.value);
    });
    kitSelect.addEventListener("mouseenter", () => {
      if (kitSelect.value) previewKitSound(kitSelect.value);
    });
    soundBtn.addEventListener("click", () => {
      selectTrack(track.id);
      soundFile.click();
    });
    soundFile.addEventListener("change", event => {
      loadTrackSound(track.id, event.target.files[0], soundBtn);
      event.target.value = "";
    });
    wrap.addEventListener("contextmenu", event => {
      event.preventDefault();
      selectTrack(track.id);
      contextTarget = { type: "track", trackId: track.id, step: 0 };
      showUnitMenu(event.clientX, event.clientY, "track");
    });
    soundBtn.addEventListener("dragover", event => {
      event.preventDefault();
      soundBtn.classList.add("drop-ready");
    });
    soundBtn.addEventListener("dragleave", () => soundBtn.classList.remove("drop-ready"));
    soundBtn.addEventListener("drop", event => {
      event.preventDefault();
      soundBtn.classList.remove("drop-ready");
      loadTrackSound(track.id, event.dataTransfer.files[0], soundBtn);
    });
    els.tracks.appendChild(wrap);
    mountKnob(wrap.querySelector('.channel-main-knob'), {
      label: "LEVEL", min: 0, max: 1, value: model.volumes[track.id], unit: "",
      onChange: value => {
        model.volumes[track.id] = value;
        setFxScope(`${track.label} LEVEL`, `${Math.round(value * 100)} · MIX GAIN`, track.color);
      }
    });
  });
  syncTrackSelection();
}

function buildGrid() {
  els.grid.innerHTML = "";
  updateSequencerViewport();
  els.grid.appendChild(cell("TRACK", "grid-label"));
  for (let i = 0; i < model.length; i++) {
    const label = cell(String(i + 1), "grid-label step-label");
    label.dataset.group = String(Math.floor(i / 4) % 2);
    label.addEventListener("contextmenu", event => {
      event.preventDefault();
      contextStep = { trackId: model.selectedTrack, step: i };
      showStepMenu(event.clientX, event.clientY);
    });
    els.grid.appendChild(label);
  }
  TRACKS.forEach(track => {
    const label = cell("", "grid-label track-row-label");
    label.dataset.track = track.id;
    label.style.setProperty("--track-color", track.color);
    const soundName = model.soundNames[track.id] || track.label;
    label.innerHTML = `<button class="row-select" type="button" title="Double-click to replace ${soundName}">${soundName}</button>`;
    const rowSelect = label.querySelector(".row-select");
    rowSelect.addEventListener("click", () => {
      selectTrack(track.id);
      setInfo(`${soundName} SELECTED`);
    });
    rowSelect.addEventListener("dblclick", event => {
      event.preventDefault();
      selectTrack(track.id);
      contextTarget = { type: "track", trackId: track.id, step: 0 };
      const fileInput = document.querySelector(`.track[data-track="${track.id}"] .sound-file`);
      if (fileInput) {
        setInfo(`${track.label} REPLACE SOUND`);
        fileInput.click();
      } else {
        openSoundBrowser(track.id);
      }
    });
    rowSelect.addEventListener("contextmenu", event => {
      event.preventDefault();
      selectTrack(track.id);
      contextStep = { trackId: track.id, step: 0 };
      showStepMenu(event.clientX, event.clientY);
    });
    els.grid.appendChild(label);
    for (let i = 0; i < model.length; i++) {
      const btn = cell("", "step");
      btn.dataset.track = track.id;
      btn.dataset.step = String(i);
      btn.dataset.group = String(Math.floor(i / 4) % 2);
      if (i % 4 === 0) btn.classList.add("bar-start");
      if ((i + 1) % 4 === 0) btn.classList.add("bar-end");
      btn.style.setProperty("--track-color", track.color);
      btn.addEventListener("click", () => {
        selectTrack(track.id);
        remember(`${track.label} STEP`);
        model.pattern[track.id][i] = !model.pattern[track.id][i];
        drawGrid();
      });
      btn.addEventListener("contextmenu", event => {
        event.preventDefault();
        selectTrack(track.id);
        contextStep = { trackId: track.id, step: i };
        showStepMenu(event.clientX, event.clientY);
      });
      els.grid.appendChild(btn);
    }
  });
  drawGrid();
}

function updateSequencerViewport() {
  const width = Number(els.seqZoom?.value || (model.length >= 128 ? 52 : model.length >= 64 ? 44 : 36));
  els.grid?.style.setProperty("--steps", String(model.length));
  els.grid?.style.setProperty("--step-w", `${width}px`);
}

function followPlayhead() {
  if (!model.playing || !els.grid) return;
  const active = els.grid.querySelector(".step.playing");
  if (!active) return;
  const left = active.offsetLeft;
  const right = left + active.offsetWidth;
  const pad = 96;
  if (left < els.grid.scrollLeft + pad) {
    els.grid.scrollLeft = Math.max(0, left - pad);
  } else if (right > els.grid.scrollLeft + els.grid.clientWidth - pad) {
    els.grid.scrollLeft = right - els.grid.clientWidth + pad;
  }
}

function cell(text, className) {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return el;
}

function drawGrid() {
  els.grid.querySelectorAll(".step").forEach(el => {
    const track = el.dataset.track;
    const step = Number(el.dataset.step);
    el.classList.toggle("on", !!model.pattern[track][step]);
    el.classList.toggle("playing", model.playing && step === model.step);
    el.classList.toggle("track-selected", track === model.selectedTrack);
    if (model.pattern[track][step]) {
      const cfg = TRACKS.find(t => t.id === track);
      el.style.background = cfg.color;
      el.style.borderColor = cfg.color;
    } else {
      el.style.background = "";
      el.style.borderColor = "";
    }
  });
}

function outputGain(ctx, when, level = 1, out = masterGain) {
  const g = ctx.createGain();
  const shaped = Math.pow(Math.max(0, Math.min(1, level)), 1.65) * 1.22;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, shaped), when + 0.006);
  g.connect(out);
  return g;
}

function noiseBuffer(ctx, seconds = 1) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function trigger(trackId, when = null, ctx = ensureAudio(), out = masterGain) {
  if (model.muted[trackId]) return;
  const t = when ?? ctx.currentTime;
  const vol = model.volumes[trackId] ?? 0.8;
  fxPulse = Math.min(1, fxPulse + vol * 0.55);
  triggerCore(trackId, t, ctx, out, vol);
  scheduleFx(trackId, t, ctx, out, vol);
}

function triggerCore(trackId, t, ctx, out, vol) {
  if (trackId === "sample") return playSample(t, ctx, out, vol);
  const kit = getKitBuffer(trackId);
  if (kit) return playKitBuffer(ctx, out, kit, t, vol, trackId);
  if (trackId === "kick") return drumKick(ctx, out, t, vol);
  if (trackId === "snare") return drumSnare(ctx, out, t, vol);
  if (trackId === "hat") return drumHat(ctx, out, t, vol, 0.065);
  if (trackId === "open") return drumHat(ctx, out, t, vol, 0.32);
  if (trackId === "clap") return drumClap(ctx, out, t, vol);
  if (trackId === "perc") return drumPerc(ctx, out, t, vol);
  if (trackId === "bass") return drumBass(ctx, out, t, vol);
}

function scheduleFx(trackId, t, ctx, out, vol) {
  const depth = model.fx.depth;
  if (model.fx.repeat) {
    const gap = stepDuration() / 4;
    triggerCore(trackId, t + gap, ctx, out, vol * depth * 0.75);
    triggerCore(trackId, t + gap * 2, ctx, out, vol * depth * 0.55);
  }
  if (model.fx.stutter) {
    const gap = stepDuration() / 8;
    for (let i = 1; i <= 4; i++) triggerCore(trackId, t + gap * i, ctx, out, vol * depth * (0.9 - i * 0.13));
  }
  if (model.fx.glitch && Math.random() < 0.5 + depth * 0.4) {
    triggerCore(trackId, t + stepDuration() * 0.03, ctx, out, vol * 0.35);
  }
}

function getKitBuffer(trackId) {
  const bank = kitBuffers[trackId];
  if (!bank || !bank.length) return null;
  return bank[0];
}

function updateTrackSoundLabels(trackId) {
  const track = TRACKS.find(t => t.id === trackId);
  const name = model.soundNames[trackId] || track?.label || trackId.toUpperCase();
  document.querySelectorAll(`.track[data-track="${trackId}"] .track-name span`).forEach(label => {
    label.textContent = name;
  });
  document.querySelectorAll(`.track-row-label[data-track="${trackId}"] .row-select`).forEach(label => {
    label.textContent = name;
    label.title = `Double-click to replace ${name}`;
  });
  if (trackId === soundBrowserTrack) renderSoundBrowser(trackId);
}

async function loadTrackSound(trackId, file, button) {
  if (!file) return;
  await unlockAudio();
  remember(`${(TRACKS.find(t => t.id === trackId)?.label || trackId).toUpperCase()} SOUND`);
  const dataUrl = await readFileAsDataUrl(file);
  const res = await fetch(dataUrl);
  const arr = await res.arrayBuffer();
  const buffer = await audioCtx.decodeAudioData(arr.slice(0));
  kitBuffers[trackId] = [buffer];
  model.customSoundData[trackId] = dataUrl;
  model.soundNames[trackId] = file.name.replace(/\.[^.]+$/, "").slice(0, 18).toUpperCase();
  if (button) button.textContent = button.textContent || "PAD";
  updateTrackSoundLabels(trackId);
  setInfo(`${TRACKS.find(t => t.id === trackId)?.label || trackId} SOUND LOADED`);
}

function populateKitSelect(select, trackId) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">KIT</option>`;
  const urls = kitManifest?.tracks?.[trackId] || [];
  urls.forEach((url, index) => {
    const option = document.createElement("option");
    option.value = url;
    option.textContent = `${index + 1} ${soundNameFromUrl(url)}`;
    select.appendChild(option);
  });
  select.value = previous && urls.includes(previous) ? previous : "";
}

function refreshKitSelects() {
  document.querySelectorAll(".track").forEach(trackEl => {
    populateKitSelect(trackEl.querySelector(".kit-select"), trackEl.dataset.track);
  });
}

function soundNameFromUrl(url) {
  return url.split("/").pop().replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").toUpperCase();
}

async function loadKitSound(trackId, url) {
  if (!url) return;
  const ctx = ensureAudio();
  const arr = await fetch(url).then(r => r.arrayBuffer());
  const buffer = await ctx.decodeAudioData(arr.slice(0));
  kitBuffers[trackId] = [buffer];
  model.customSoundData[trackId] = "";
  model.soundNames[trackId] = soundNameFromUrl(url).slice(0, 18);
  updateTrackSoundLabels(trackId);
  selectTrack(trackId);
  setInfo(`${TRACKS.find(t => t.id === trackId)?.label || trackId} KIT SOUND LOADED`);
}

async function previewKitSound(url) {
  if (!url) return;
  const ctx = ensureAudio();
  try { previewSource?.stop(); } catch {}
  try { previewSource?.disconnect(); } catch {}
  const arr = await fetch(url).then(r => r.arrayBuffer());
  const buffer = await ctx.decodeAudioData(arr.slice(0));
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = 0.42;
  src.buffer = buffer;
  src.connect(g).connect(masterGain || ctx.destination);
  src.start();
  src.stop(ctx.currentTime + Math.min(buffer.duration, 1.1));
  previewSource = src;
  setInfo(`AUDITION ${soundNameFromUrl(url)}`);
}

function openSoundBrowser(trackId = model.selectedTrack) {
  if (!els.soundBrowser) return;
  soundBrowserTrack = trackId;
  selectTrack(trackId);
  renderSoundBrowser(trackId);
  els.soundBrowser.hidden = false;
}

function openPianoRoll(trackId = model.selectedTrack) {
  openSoundBrowser(trackId);
  els.soundBrowser?.classList.add("piano-mode");
  setFxScope(`${trackId.toUpperCase()} PIANO ROLL`, "A W S E D F T G Y H U J K · PITCH PREVIEW", TRACKS.find(t => t.id === trackId)?.color || "#7edbff");
  setInfo(`${trackId.toUpperCase()} PIANO ROLL READY`);
}

function renderSoundBrowser(trackId = soundBrowserTrack) {
  const track = TRACKS.find(t => t.id === trackId) || TRACKS[0];
  const name = model.soundNames[track.id] || track.label;
  if (els.soundBrowserTitle) els.soundBrowserTitle.textContent = `${track.label} · ${name}`;
  if (els.soundBrowserKey) els.soundBrowserKey.textContent = `ROOT C3 · ${pitchName(model.tunes[track.id] || 0)} · 24 SEMITONE RANGE · A/W/S KEYS PREVIEW`;
  renderSoundKeys(track.id);
  renderSoundList(track.id);
  syncSoundEq(track.id);
  drawSoundPianoRoll(track.id);
}

function renderSoundKeys(trackId) {
  if (!els.soundKeys) return;
  els.soundKeys.innerHTML = "";
  PIANO_KEYS.forEach(([label, semitones, isBlack]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isBlack ? "black" : "";
    btn.classList.toggle("selected", semitones === (model.tunes[trackId] || 0));
    btn.innerHTML = `<span>${label}</span>${KEY_LABELS[semitones] ? `<small>${KEY_LABELS[semitones]}</small>` : ""}`;
    btn.addEventListener("mouseenter", () => auditionTrackPitch(trackId, semitones));
    btn.addEventListener("click", () => setTrackPitchFromPiano(trackId, semitones));
    els.soundKeys.appendChild(btn);
  });
}

function setTrackPitchFromPiano(trackId, semitones) {
  remember(`${trackId.toUpperCase()} PIANO NOTE`);
  model.tunes[trackId] = Math.max(-12, Math.min(12, Number(semitones) || 0));
  const trackEl = document.querySelector(`.track[data-track="${trackId}"]`);
  const fader = trackEl?.querySelector(".pitch-fader");
  if (fader) fader.value = String(model.tunes[trackId]);
  auditionTrackPitch(trackId, 0);
  renderSoundBrowser(trackId);
  drawSoundPianoRoll(trackId);
  setInfo(`${trackId.toUpperCase()} NOTE ${pitchName(model.tunes[trackId])} ${model.tunes[trackId] >= 0 ? "+" : ""}${model.tunes[trackId]} ST`);
}

function renderSoundList(trackId) {
  if (!els.soundList) return;
  els.soundList.innerHTML = "";
  const urls = kitManifest?.tracks?.[trackId] || [];
  urls.forEach(url => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = soundNameFromUrl(url);
    btn.addEventListener("mouseenter", () => previewKitSound(url));
    btn.addEventListener("click", async () => {
      await previewKitSound(url);
      remember(`${trackId.toUpperCase()} SOUND`);
      await loadKitSound(trackId, url);
    });
    els.soundList.appendChild(btn);
  });
  if (!urls.length) {
    const note = document.createElement("button");
    note.type = "button";
    note.textContent = "DROP OR LOAD YOUR OWN SOUND";
    note.disabled = true;
    els.soundList.appendChild(note);
  }
}

function syncSoundEq(trackId = soundBrowserTrack) {
  if (!els.soundEq) return;
  const eq = model.channelEq[trackId];
  els.soundEq.querySelectorAll("[data-eq-param]").forEach(input => {
    const key = input.dataset.eqParam;
    if (eq[key] === undefined) return;
    input.value = String(eq[key]);
    const readout = input.nextElementSibling;
    if (readout) readout.textContent = eqLabel(key, eq[key]);
  });
  drawSoundEqGraph(trackId);
}

function eqLabel(key, value) {
  if (key === "hp" || key === "lowFreq" || key === "lowMidFreq") return `${Math.round(value)} HZ`;
  if (key === "highMidFreq" || key === "highFreq" || key === "lp") return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K` : `${Math.round(value)} HZ`;
  if (key.endsWith("Q")) return `${Number(value).toFixed(2)} Q`;
  return `${value > 0 ? "+" : ""}${Number(value).toFixed(Number(value) % 1 ? 1 : 0)} DB`;
}

function eqX(freq, width) {
  const min = Math.log10(20);
  const max = Math.log10(20000);
  return ((Math.log10(Math.max(20, Math.min(20000, freq))) - min) / (max - min)) * width;
}

function eqY(gain, height) {
  return height * 0.5 - (Math.max(-18, Math.min(18, gain)) / 18) * height * 0.46;
}

function eqFreqFromX(x, width) {
  const min = Math.log10(20);
  const max = Math.log10(20000);
  return Math.pow(10, min + Math.max(0, Math.min(1, x / width)) * (max - min));
}

function eqGainFromY(y, height) {
  return Math.max(-12, Math.min(12, ((height * 0.5 - y) / (height * 0.46)) * 18));
}

function drawSoundEqGraph(trackId = soundBrowserTrack) {
  const canvas = els.soundEqCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const eq = model.channelEq[trackId];
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07161d";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(126,219,255,0.1)";
  ctx.lineWidth = 1;
  [40, 80, 160, 320, 640, 1250, 2500, 5000, 10000].forEach(freq => {
    const x = eqX(freq, w);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  });
  for (let db = -12; db <= 12; db += 6) {
    const y = eqY(db, h);
    ctx.strokeStyle = db === 0 ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(216,247,255,0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const freq = eqFreqFromX(x, w);
    let gain = 0;
    gain += eq.low * Math.exp(-Math.pow(Math.log(freq / (eq.lowFreq || 120)), 2) / 3.8);
    gain += eq.lowMid * Math.exp(-Math.pow(Math.log(freq / (eq.lowMidFreq || 420)), 2) * (eq.lowMidQ || 1.05) / 1.6);
    gain += eq.highMid * Math.exp(-Math.pow(Math.log(freq / (eq.highMidFreq || 2200)), 2) * (eq.highMidQ || 1.05) / 1.6);
    gain += eq.high * Math.exp(-Math.pow(Math.log(freq / (eq.highFreq || 7600)), 2) / 3.8);
    if (freq < eq.hp) gain -= Math.min(18, (eq.hp - freq) / Math.max(10, eq.hp) * 18);
    if (freq > eq.lp) gain -= Math.min(18, (freq - eq.lp) / Math.max(100, eq.lp) * 18);
    const y = eqY(gain, h);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  EQ_BANDS.forEach((band, index) => {
    const freq = eq[band.freqKey] || (band.key === "lp" ? 20000 : 20);
    const gain = band.filter ? 0 : eq[band.key] || 0;
    const x = eqX(freq, w);
    const y = eqY(gain, h);
    ctx.fillStyle = band.color;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#061018";
    ctx.font = "900 9px Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), x, y);
  });
}

function eqBandFromPoint(trackId, x, y) {
  const canvas = els.soundEqCanvas;
  const eq = model.channelEq[trackId];
  if (!canvas || !eq) return null;
  let best = null;
  let bestDist = Infinity;
  EQ_BANDS.forEach(band => {
    const bx = eqX(eq[band.freqKey] || 20, canvas.width);
    const by = eqY(band.filter ? 0 : eq[band.key] || 0, canvas.height);
    const dist = Math.hypot(x - bx, y - by);
    if (dist < bestDist) {
      bestDist = dist;
      best = band;
    }
  });
  return bestDist <= 34 ? best : null;
}

function applyEqPoint(trackId, band, x, y) {
  const canvas = els.soundEqCanvas;
  if (!canvas || !band) return;
  const eq = model.channelEq[trackId];
  const freq = eqFreqFromX(x, canvas.width);
  const gain = eqGainFromY(y, canvas.height);
  if (band.freqKey === "hp") eq.hp = Math.max(20, Math.min(600, Math.round(freq / 5) * 5));
  else if (band.freqKey === "lp") eq.lp = Math.max(1800, Math.min(20000, Math.round(freq / 100) * 100));
  else {
    eq[band.freqKey] = Math.round(freq);
    eq[band.key] = Math.round(gain * 2) / 2;
  }
  syncSoundEq(trackId);
  setInfo(`${trackId.toUpperCase()} EQ ${band.label}`);
}

function bindSoundEqCanvas() {
  const canvas = els.soundEqCanvas;
  if (!canvas) return;
  let activeBand = null;
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  canvas.addEventListener("pointerdown", event => {
    const p = point(event);
    activeBand = eqBandFromPoint(soundBrowserTrack, p.x, p.y);
    if (!activeBand) return;
    canvas.setPointerCapture?.(event.pointerId);
    applyEqPoint(soundBrowserTrack, activeBand, p.x, p.y);
  });
  canvas.addEventListener("pointermove", event => {
    if (!activeBand) return;
    const p = point(event);
    applyEqPoint(soundBrowserTrack, activeBand, p.x, p.y);
  });
  canvas.addEventListener("pointerup", event => {
    if (activeBand) remember(`${soundBrowserTrack.toUpperCase()} EQ`);
    activeBand = null;
    canvas.releasePointerCapture?.(event.pointerId);
  });
}

function drawSoundPianoRoll(trackId = soundBrowserTrack) {
  const c = els.soundPianoRoll;
  if (!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#081018";
  ctx.fillRect(0, 0, c.width, c.height);
  const keyCount = 25;
  for (let i = 0; i < keyCount; i++) {
    const semi = i - 12;
    const x = i * c.width / keyCount;
    const w = c.width / keyCount - 1;
    ctx.fillStyle = semi === 0 ? "rgba(255,116,23,0.18)" : "rgba(255,255,255,0.045)";
    ctx.fillRect(x, 0, 1, c.height);
    if (semi === (model.tunes[trackId] || 0)) {
      ctx.fillStyle = "rgba(0,168,255,0.42)";
      ctx.fillRect(x + 1, 20, w, c.height - 42);
    }
  }
  const row = TRACKS.findIndex(t => t.id === trackId);
  ctx.fillStyle = TRACKS[row]?.color || "#00a8ff";
  model.pattern[trackId].slice(0, model.length).forEach((on, i) => {
    if (!on) return;
    const x = i * c.width / model.length + 3;
    const y = 12 + (row % 4) * 14;
    ctx.fillRect(x, y, Math.max(8, c.width / model.length - 6), 9);
  });
  ctx.fillStyle = "#92d8ff";
  ctx.font = "10px Helvetica, Arial";
  ctx.fillText(`${TRACKS[row]?.label || "PAD"} · ROOT C3 · NOTE ${pitchName(model.tunes[trackId] || 0)} · ${model.tunes[trackId] >= 0 ? "+" : ""}${model.tunes[trackId] || 0} ST`, 10, c.height - 10);
}

function auditionTrackPitch(trackId, semitones = 0) {
  const ctx = ensureAudio();
  try { previewSource?.stop(); } catch {}
  try { previewSource?.disconnect(); } catch {}
  const buffer = getKitBuffer(trackId);
  if (buffer) {
    previewSource = playKitBufferPitch(ctx, masterGain, buffer, ctx.currentTime, trackId === "snare" ? 0.9 : 0.66, trackId, semitones);
  } else {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const destination = mixerFxChain(ctx, g, trackId);
    osc.type = trackId === "bass" ? "sine" : "square";
    osc.frequency.value = 130.81 * Math.pow(2, semitones / 12);
    g.gain.value = 0.4;
    osc.connect(destination);
    g.connect(masterGain || ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
    previewSource = osc;
  }
  setInfo(`${(model.soundNames[trackId] || trackId).toUpperCase()} PREVIEW ${semitones >= 0 ? "+" : ""}${semitones} ST`);
}

function playKitBuffer(ctx, out, buffer, t, vol, activeTrack = "") {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g = outputGain(ctx, t, vol, out);
  const tune = model.tunes[activeTrack] || 0;
  const tone = model.tones[activeTrack] ?? 0.72;
  const decay = model.decays[activeTrack] ?? 0.7;
  src.buffer = buffer;
  const rate = Math.pow(2, (tune + model.masterPitch) / 12);
  src.playbackRate.value = rate;
  filter.type = "lowpass";
  filter.frequency.value = Math.min(600 + tone * 15000, spNyquist(activeTrack, rate));
  filter.Q.value = 0.55;
  const spOut = sp1200OutputFilter(ctx, activeTrack, rate);
  const mixIn = mixerFxChain(ctx, g, activeTrack, t);
  src.connect(filter);
  filter.connect(spOut.input);
  spOut.output.connect(mixIn);
  const hardCap = activeTrack === "hat" ? 0.075 : activeTrack === "open" ? 0.55 : 3.5;
  const stopAt = t + Math.min(buffer.duration * Math.max(0.18, decay), hardCap);
  g.gain.setValueAtTime(vol, Math.max(t + 0.008, stopAt - 0.035));
  g.gain.linearRampToValueAtTime(0, stopAt);
  src.start(t);
  src.stop(stopAt + 0.02);
}

function playKitBufferPitch(ctx, out, buffer, t, vol, activeTrack = "", semitones = 0) {
  const src = ctx.createBufferSource();
  const g = outputGain(ctx, t, vol, out);
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, (semitones + (model.tunes[activeTrack] || 0) + model.masterPitch) / 12);
  src.connect(mixerFxChain(ctx, g, activeTrack, t));
  const stopAt = t + Math.min(buffer.duration / Math.max(0.25, src.playbackRate.value), 2.5);
  src.start(t);
  src.stop(stopAt + 0.02);
  return src;
}

function spChannel(trackId) {
  return Math.max(1, TRACKS.findIndex(t => t.id === trackId) + 1);
}

function spNyquist(trackId, rate) {
  const effectiveRate = 26040 * Math.max(0.25, rate);
  const nyquist = effectiveRate / 2;
  const ch = spChannel(trackId);
  if (ch <= 2) return Math.min(nyquist, 7200);
  if (ch <= 6) return Math.min(nyquist, 10500);
  return Math.min(nyquist * 1.12, 18000);
}

function sp1200OutputFilter(ctx, trackId, rate) {
  const ch = spChannel(trackId);
  const input = ctx.createGain();
  const drive = ctx.createWaveShaper();
  drive.curve = crushCurve(ch >= 7 ? 10 : 7);
  drive.oversample = "none";
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = ch <= 2 ? 0.9 : 0.35;
  lp.frequency.value = ch <= 2 ? Math.min(6200, spNyquist(trackId, rate)) : ch <= 6 ? Math.min(9800, spNyquist(trackId, rate)) : 18000;
  input.connect(drive);
  if (ch <= 6) {
    drive.connect(lp);
    return { input, output: lp };
  }
  return { input, output: drive };
}

function crushCurve(amount) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const steps = Math.pow(2, amount);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function mixerFxChain(ctx, destination, trackId, t = ctx.currentTime) {
  if (renderingDryStems) {
    const dryInput = ctx.createGain();
    dryInput.connect(destination);
    return dryInput;
  }
  const fx = combinedFx(trackId);
  let input = ctx.createGain();
  let node = input;
  node = connectChannelEq(ctx, node, trackId);
  if (fx.eq) {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;
    low.gain.value = model.fxParams.eqLow;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 6400;
    high.gain.value = model.fxParams.eqHigh;
    node.connect(low).connect(high);
    node = high;
  }
  if (fx.chorus) {
    const delay = ctx.createDelay(0.04);
    const wet = ctx.createGain();
    delay.delayTime.value = 0.018;
    wet.gain.value = model.fxParams.chorusWet;
    node.connect(delay).connect(wet);
    wet.connect(destination);
  }
  if (fx.phaser) {
    const phaser = ctx.createBiquadFilter();
    phaser.type = "allpass";
    phaser.frequency.setValueAtTime(650, t);
    phaser.frequency.linearRampToValueAtTime(1800, t + 0.24);
    phaser.Q.value = 4;
    node.connect(phaser);
    node = phaser;
  }
  if (fx.reverb) {
    const delay = ctx.createDelay(0.18);
    const fb = ctx.createGain();
    const wet = ctx.createGain();
    delay.delayTime.value = 0.115;
    fb.gain.value = 0.28;
    wet.gain.value = model.fxParams.reverbWet;
    delay.connect(fb).connect(delay);
    node.connect(delay).connect(wet);
    wet.connect(destination);
  }
  if (fx.softClip) {
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = "2x";
    node.connect(clip);
    node = clip;
  }
  node.connect(destination);
  return input;
}

function connectChannelEq(ctx, node, trackId) {
  const eq = model.channelEq[trackId];
  if (!eq) return node;
  const filters = [];
  if (eq.hp > 25) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = eq.hp;
    hp.Q.value = 0.7;
    filters.push(hp);
  }
  [
    ["lowshelf", eq.lowFreq || 120, eq.low, 0.7],
    ["peaking", eq.lowMidFreq || 420, eq.lowMid, eq.lowMidQ || 1.05],
    ["peaking", eq.highMidFreq || 2200, eq.highMid, eq.highMidQ || 1.05],
    ["highshelf", eq.highFreq || 7600, eq.high, 0.7],
  ].forEach(([type, freq, gain, q]) => {
    if (Math.abs(gain) < 0.01) return;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.gain.value = gain;
    if (type === "peaking") f.Q.value = q;
    filters.push(f);
  });
  if (eq.lp < 19800) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = eq.lp;
    lp.Q.value = 0.7;
    filters.push(lp);
  }
  filters.forEach(filter => {
    node.connect(filter);
    node = filter;
  });
  return node;
}

function combinedFx(trackId) {
  const ch = model.channelFx[trackId] || {};
  return {
    eq: !!(model.masterFx.eq || ch.eq),
    chorus: !!(model.masterFx.chorus || ch.chorus),
    reverb: !!(model.masterFx.reverb || ch.reverb),
    phaser: !!(model.masterFx.phaser || ch.phaser),
    softClip: !!(model.masterFx.softClip || ch.softClip),
  };
}

function softClipCurve() {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * model.fxParams.clipDrive);
  }
  return curve;
}

function drumKick(ctx, out, t, vol) {
  const osc = ctx.createOscillator();
  const click = ctx.createOscillator();
  const g = outputGain(ctx, t, vol * 1.25, out);
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  click.type = "triangle";
  click.frequency.setValueAtTime(260, t);
  click.frequency.exponentialRampToValueAtTime(80, t + 0.035);
  osc.connect(g);
  click.connect(g);
  osc.start(t);
  click.start(t);
  osc.stop(t + 0.44);
  click.stop(t + 0.05);
}

function drumSnare(ctx, out, t, vol) {
  const src = ctx.createBufferSource();
  const filt = ctx.createBiquadFilter();
  const g = outputGain(ctx, t, vol * 1.05, out);
  src.buffer = noiseBuffer(ctx, 0.24);
  filt.type = "bandpass";
  filt.frequency.value = 1800;
  filt.Q.value = 0.8;
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(filt).connect(g);
  src.start(t);
  src.stop(t + 0.22);
  const tone = ctx.createOscillator();
  const tg = outputGain(ctx, t, vol * 0.26, out);
  tone.type = "triangle";
  tone.frequency.value = 190;
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  tone.connect(tg);
  tone.start(t);
  tone.stop(t + 0.14);
}

function drumHat(ctx, out, t, vol, decay) {
  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const g = outputGain(ctx, t, vol * 0.44, out);
  src.buffer = noiseBuffer(ctx, decay);
  hp.type = "highpass";
  hp.frequency.value = 6200;
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(hp).connect(g);
  src.start(t);
  src.stop(t + decay + 0.01);
}

function drumClap(ctx, out, t, vol) {
  [0, 0.018, 0.035].forEach(offset => {
    const src = ctx.createBufferSource();
    const bp = ctx.createBiquadFilter();
    const g = outputGain(ctx, t + offset, vol * 0.42, out);
    src.buffer = noiseBuffer(ctx, 0.12);
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 1.1;
    g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.09);
    src.connect(bp).connect(g);
    src.start(t + offset);
    src.stop(t + offset + 0.11);
  });
}

function drumPerc(ctx, out, t, vol) {
  const osc = ctx.createOscillator();
  const g = outputGain(ctx, t, vol * 0.62, out);
  osc.type = "square";
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(210, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + 0.15);
}

function drumBass(ctx, out, t, vol) {
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = outputGain(ctx, t, vol * 0.7, out);
  osc.type = "sawtooth";
  osc.frequency.value = 55;
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  osc.connect(lp).connect(g);
  osc.start(t);
  osc.stop(t + 0.3);
}

function playSample(t, ctx = ensureAudio(), out = masterGain, vol = model.volumes.sample) {
  if (!sampleBuffer) return;
  if (model.sampleStretch) {
    return playGranularSample(t, ctx, out, vol);
  }
  const region = sampleRegion();
  const src = ctx.createBufferSource();
  const g = outputGain(ctx, t, vol, out);
  src.buffer = sampleBuffer;
  src.playbackRate.value = model.sampleTimeStretch ? 1 : samplePlaybackRate() * samplePitchRate();
  src.connect(mixerFxChain(ctx, g, "sample", t));
  const sliceDur = model.fx.slice ? Math.max(0.04, Math.min(region.duration, sliceDurationFromTiming())) : region.duration;
  const maxOffset = Math.max(region.start, region.end - sliceDur);
  const offset = model.fx.slice ? region.start + Math.random() * Math.max(0, maxOffset - region.start) : region.start;
  src.start(t, offset, sliceDur);
  src.stop(t + sliceDur + 0.02);
}

function stopSampleChops() {
  sampleChopSources.forEach(src => {
    try { src.stop(); } catch {}
    try { src.disconnect(); } catch {}
  });
  sampleChopSources = [];
}

function playSampleChop(index = 0, t = ensureAudio().currentTime) {
  if (!sampleBuffer) return;
  const ctx = ensureAudio();
  const region = sampleRegion();
  const chopCount = 8;
  const chopIndex = Math.max(0, Math.min(chopCount - 1, Number(index) || 0));
  const chopDur = region.duration / chopCount;
  const start = region.start + chopDur * chopIndex;
  const duration = Math.max(0.035, chopDur);
  if (model.sampleCutSelf) stopSampleChops();
  const src = ctx.createBufferSource();
  const g = outputGain(ctx, t, model.volumes.sample, masterGain);
  src.buffer = sampleBuffer;
  src.playbackRate.value = model.sampleTimeStretch ? samplePitchRate() : samplePlaybackRate() * samplePitchRate();
  src.connect(mixerFxChain(ctx, g, "sample", t));
  src.start(t, start, duration);
  src.stop(t + duration + 0.02);
  sampleChopSources.push(src);
  src.onended = () => {
    sampleChopSources = sampleChopSources.filter(item => item !== src);
  };
  setInfo(`SAMPLE CHOP ${chopIndex + 1} / ${chopCount}`);
}

function samplePitchRate() {
  return Math.pow(2, ((model.samplePitch || 0) + (model.tunes.sample || 0) + model.masterPitch) / 12);
}

function sampleRegion() {
  if (!sampleBuffer) return { start: 0, end: 0, duration: 0 };
  const startPct = Math.max(0, Math.min(0.99, Number(model.sampleStart || 0)));
  const endPct = Math.max(startPct + 0.01, Math.min(1, Number(model.sampleEnd || 1)));
  const start = sampleBuffer.duration * startPct;
  const end = Math.min(sampleBuffer.duration, Math.max(start + 0.03, sampleBuffer.duration * endPct));
  return { start, end, duration: Math.max(0.03, end - start) };
}

function playGranularSample(t, ctx = ensureAudio(), out = masterGain, vol = model.volumes.sample) {
  const region = sampleRegion();
  const g = outputGain(ctx, t, vol, out);
  const destination = mixerFxChain(ctx, g, "sample", t);
  const duration = model.fx.slice
    ? Math.max(0.04, Math.min(region.duration, sliceDurationFromTiming()))
    : model.sampleStretch
      ? Math.min(region.duration, stepDuration() * Math.max(1, model.length))
      : region.duration;
  const pitchRate = samplePitchRate();
  const grain = 0.075;
  const hop = 0.035;
  const maxOffset = Math.max(region.start, region.end - grain * pitchRate);
  for (let elapsed = 0; elapsed < duration; elapsed += hop) {
    const src = ctx.createBufferSource();
    const eg = ctx.createGain();
    src.buffer = sampleBuffer;
    src.playbackRate.value = pitchRate;
    const offset = model.fx.slice ? region.start + Math.random() * Math.max(0, maxOffset - region.start) : Math.min(maxOffset, region.start + elapsed);
    const start = t + elapsed;
    eg.gain.setValueAtTime(0.0001, start);
    eg.gain.linearRampToValueAtTime(1, start + 0.01);
    eg.gain.linearRampToValueAtTime(0.0001, start + grain);
    src.connect(eg).connect(destination);
    src.start(start, offset, Math.min(grain * pitchRate, sampleBuffer.duration - offset));
    src.stop(start + grain + 0.01);
  }
  g.gain.setValueAtTime(vol, t + Math.max(0.01, duration - 0.03));
  g.gain.linearRampToValueAtTime(0.0001, t + duration + 0.01);
}

function sliceDurationFromTiming() {
  const beatsPerBar = 4;
  const timing = model.fx.sliceTiming || "1/4";
  const denom = Number(timing.split("/")[1]) || 4;
  return stepDuration() * (16 / denom) * beatsPerBar / 4;
}

function startSampleLoop(t = audioCtx.currentTime) {
  stopSampleLoop();
  if (!sampleBuffer || !model.sampleRun || !model.playing) return;
  if (model.sampleStretch) {
    scheduleGranularLoop(t);
    return;
  }
  sampleSource = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  sampleSource.buffer = sampleBuffer;
  sampleSource.loop = true;
  const region = sampleRegion();
  sampleSource.loopStart = region.start;
  sampleSource.loopEnd = region.end;
  sampleSource.playbackRate.value = model.sampleTimeStretch ? 1 : samplePlaybackRate() * samplePitchRate();
  g.gain.value = model.volumes.sample;
  sampleSource.connect(mixerFxChain(audioCtx, g, "sample"));
  g.connect(masterGain);
  sampleSource.start(t, region.start);
}

function scheduleGranularLoop(startAt = audioCtx.currentTime) {
  let next = startAt;
  const region = sampleRegion();
  const loopDur = model.sampleStretch ? Math.max(stepDuration() * model.length, 0.1) : Math.max(region.duration, 0.1);
  const schedule = () => {
    if (!model.playing || !model.sampleRun || !sampleBuffer) return;
    while (next < audioCtx.currentTime + 0.4) {
      playGranularSample(next, audioCtx, masterGain, model.volumes.sample);
      next += loopDur;
    }
  };
  schedule();
  granularTimer = setInterval(schedule, 80);
}

function samplePlaybackRate() {
  if (!sampleBuffer || !model.sampleStretch) return 1;
  const target = Math.max(stepDuration() * model.length, 0.1);
  return Math.max(0.25, Math.min(4, sampleRegion().duration / target));
}

function stopSampleLoop() {
  if (granularTimer) clearInterval(granularTimer);
  granularTimer = null;
  if (!sampleSource) return;
  try { sampleSource.stop(); } catch {}
  try { sampleSource.disconnect(); } catch {}
  sampleSource = null;
}

function scheduleStep(step, when) {
  TRACKS.forEach(track => {
    if (!model.muted[track.id] && model.pattern[track.id][step]) {
      trigger(track.id, when, audioCtx, masterGain);
      flashTrack(track.id);
    }
  });
}

function flashTrack(trackId) {
  const trackEl = document.querySelector(`.track[data-track="${trackId}"]`);
  const padEl = document.querySelector(`[data-pad="${trackId}"]`);
  trackEl?.classList.add("hit");
  padEl?.classList.add("hit");
  window.setTimeout(() => {
    trackEl?.classList.remove("hit");
    padEl?.classList.remove("hit");
  }, 110);
}

function setSequenceLength(length) {
  if (!LENGTH_OPTIONS.includes(length)) return;
  const wasPlaying = model.playing;
  if (wasPlaying) stop();
  model.length = length;
  model.step = 0;
  if (els.seqZoom) {
    els.seqZoom.value = String(length >= 128 ? 52 : length >= 64 ? 44 : 36);
  }
  buildGrid();
  updateLengthButtons();
  setInfo(`SEQUENCE LENGTH ${length}`);
}

function updateLengthButtons() {
  document.querySelectorAll(".length-btn").forEach(btn => {
    btn.classList.toggle("on", Number(btn.dataset.length) === model.length);
  });
}

function scheduler() {
  const lookAhead = 0.12;
  while (nextNoteTime < audioCtx.currentTime + lookAhead) {
    const scheduledStep = model.step;
    scheduleStep(scheduledStep, nextNoteTime + swingOffset(scheduledStep));
    model.step = (model.step + 1) % model.length;
    if (model.step === 0 && model.sampleCutSelf) {
      stopSampleChops();
    }
    nextNoteTime += stepDuration();
  }
  refreshScreen();
  drawGrid();
  followPlayhead();
}

async function play() {
  await unlockAudio();
  if (model.playing) return;
  model.playing = true;
  model.step = 0;
  nextNoteTime = audioCtx.currentTime + 0.05;
  startSampleLoop(nextNoteTime);
  timer = setInterval(scheduler, 25);
  setInfo("PLAYING");
  refreshScreen();
}

function stop() {
  model.playing = false;
  model.step = 0;
  if (timer) clearInterval(timer);
  timer = null;
  stopSampleLoop();
  refreshScreen();
  drawGrid();
  setInfo("STOPPED");
}

function clearProject(keepDrums = true) {
  TRACKS.forEach(track => model.pattern[track.id].fill(false));
  if (keepDrums) makeBeat();
  stop();
  setInfo(keepDrums ? "NEW BEAT READY" : "EMPTY PROJECT");
  drawGrid();
}

function makeBeat() {
  TRACKS.forEach(track => model.pattern[track.id].fill(false));
  const bars = model.length / 16;
  for (let b = 0; b < bars; b++) {
    const o = b * 16;
    [0, 7, 10].forEach(i => { if (o + i < model.length) model.pattern.kick[o + i] = true; });
    [4, 12].forEach(i => { if (o + i < model.length) model.pattern.snare[o + i] = true; });
    for (let i = 0; i < 16; i += 2) if (o + i < model.length) model.pattern.hat[o + i] = true;
    if (o + 14 < model.length) model.pattern.open[o + 14] = true;
    if (o + 12 < model.length) model.pattern.clap[o + 12] = true;
    if (o + 3 < model.length) model.pattern.perc[o + 3] = true;
    if (o + 11 < model.length) model.pattern.perc[o + 11] = true;
    if (o < model.length) model.pattern.bass[o] = true;
    if (o + 8 < model.length) model.pattern.bass[o + 8] = true;
  }
  drawGrid();
}

function snapshot() {
  return {
    tempo: model.tempo,
    swing: model.swing,
    master: model.master,
    masterPitch: model.masterPitch,
    length: model.length,
    pattern: model.pattern,
    volumes: model.volumes,
    tunes: model.tunes,
    decays: model.decays,
    tones: model.tones,
    soundNames: model.soundNames,
  customSoundData: model.customSoundData,
  selectedPad: model.selectedPad,
  selectedTrack: model.selectedTrack,
  muted: model.muted,
  fx: model.fx,
  channelFx: model.channelFx,
  masterFx: model.masterFx,
  fxParams: model.fxParams,
  channelEq: model.channelEq,
  sampleRun: model.sampleRun,
  sampleStretch: model.sampleStretch,
  sampleTimeStretch: model.sampleTimeStretch,
  sampleCutSelf: model.sampleCutSelf,
  samplePitch: model.samplePitch,
  sampleStart: model.sampleStart,
  sampleEnd: model.sampleEnd,
    sampleName: model.sampleName,
    sampleDataUrl: model.sampleDataUrl,
  };
}

async function restore(data) {
  if (!data) return;
  model.tempo = Number(data.tempo || 140);
  model.swing = Number(data.swing || 58);
  model.master = Number(data.master ?? model.master);
  model.masterPitch = Number(data.masterPitch || 0);
  model.length = LENGTH_OPTIONS.includes(Number(data.length)) ? Number(data.length) : 16;
  model.pattern = Object.fromEntries(TRACKS.map(t => {
    const src = [...(data.pattern?.[t.id] || [])].slice(0, MAX_STEPS);
    while (src.length < MAX_STEPS) src.push(false);
    return [t.id, src];
  }));
  model.volumes = { ...model.volumes, ...(data.volumes || {}) };
  model.tunes = { ...model.tunes, ...(data.tunes || {}) };
  model.decays = { ...model.decays, ...(data.decays || {}) };
  model.tones = { ...model.tones, ...(data.tones || {}) };
  model.soundNames = { ...model.soundNames, ...(data.soundNames || {}) };
  model.customSoundData = { ...model.customSoundData, ...(data.customSoundData || {}) };
  model.selectedPad = data.selectedPad || model.selectedPad;
  model.selectedTrack = data.selectedTrack || model.selectedTrack;
  model.muted = { ...model.muted, ...(data.muted || {}) };
  model.fx = { ...model.fx, ...(data.fx || {}) };
  model.channelFx = Object.fromEntries(TRACKS.map(t => [t.id, { ...model.channelFx[t.id], ...(data.channelFx?.[t.id] || {}) }]));
  model.masterFx = { ...model.masterFx, ...(data.masterFx || {}) };
  model.fxParams = { ...model.fxParams, ...(data.fxParams || {}) };
  model.channelEq = Object.fromEntries(TRACKS.map(t => [t.id, { ...model.channelEq[t.id], ...(data.channelEq?.[t.id] || {}) }]));
  await restoreCustomTrackSounds();
  model.sampleRun = data.sampleRun !== false;
  model.sampleStretch = !!data.sampleStretch;
  model.sampleTimeStretch = data.sampleTimeStretch !== false;
  model.sampleCutSelf = data.sampleCutSelf !== false;
  model.samplePitch = Number(data.samplePitch || 0);
  model.sampleStart = Math.max(0, Math.min(0.98, Number(data.sampleStart || 0)));
  model.sampleEnd = Math.max(model.sampleStart + 0.01, Math.min(1, Number(data.sampleEnd || 1)));
  model.sampleName = data.sampleName || "";
  model.sampleDataUrl = data.sampleDataUrl || "";
  if (model.sampleDataUrl) await decodeSampleDataUrl(model.sampleDataUrl, model.sampleName);
  syncControls();
  buildMixer();
  buildGrid();
  drawWave();
  setInfo("PROJECT LOADED");
}

function saveProject() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
  setInfo("SAVED IN BROWSER");
}

async function loadProject() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    setInfo("NO SAVE FOUND");
    return;
  }
  await restore(JSON.parse(raw));
}

function syncControls() {
  els.tempo.value = String(model.tempo);
  els.tempoNumber.value = String(model.tempo);
  els.swing.value = String(model.swing);
  els.master.value = String(model.master);
  els.masterPitch.value = String(model.masterPitch);
  if (els.samplePitch) els.samplePitch.value = String(model.samplePitch);
  if (els.sampleStart) els.sampleStart.value = String(Math.round((model.sampleStart || 0) * 100));
  if (els.sampleEnd) els.sampleEnd.value = String(Math.round((model.sampleEnd || 1) * 100));
  if (els.sampleLevel) els.sampleLevel.value = String(model.volumes.sample);
  if (els.sampleStartReadout) els.sampleStartReadout.textContent = `${Math.round((model.sampleStart || 0) * 100)}%`;
  if (els.sampleEndReadout) els.sampleEndReadout.textContent = `${Math.round((model.sampleEnd || 1) * 100)}%`;
  if (els.sampleLevelReadout) els.sampleLevelReadout.textContent = String(Math.round(model.volumes.sample * 100));
  if (els.sampleCutSelf) els.sampleCutSelf.checked = model.sampleCutSelf !== false;
  if (els.sliceTiming) els.sliceTiming.value = model.fx.sliceTiming || "1/4";
  ["eqLow", "eqHigh", "chorusWet", "reverbWet", "clipDrive"].forEach(key => {
    if (els[key]) els[key].value = String(model.fxParams[key]);
  });
  els.sampleName.textContent = model.sampleName || "No sample loaded";
  updateLengthButtons();
  if (window._mainKnobs) {
    window._mainKnobs.tempo?.set(model.tempo);
    window._mainKnobs.swing?.set(model.swing);
    window._mainKnobs.master?.set(model.master);
    window._mainKnobs.masterPitch?.set(model.masterPitch);
    window._mainKnobs.fxDepth?.set(model.fx.depth);
  }
  syncFxButtons();
  syncMixFxButtons();
  syncPadSelection();
  syncTrackSelection();
  refreshScreen();
}

function templateStore() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTemplate() {
  const name = (els.templateName.value || "GR4600 TEMPLATE").trim().slice(0, 28);
  const store = templateStore();
  store[name] = {
    savedAt: new Date().toISOString(),
    type: model.selectedTrack === "sample" ? "sample-template" : "beat-template",
    undo: [...undoStack],
    redo: [...redoStack],
    data: snapshot()
  };
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(store));
  els.templateStatus.textContent = `${name} SAVED`;
  setInfo(`${store[name].type.toUpperCase().replace("-", " ")} SAVED`);
  refreshTemplates(name);
}

async function loadTemplate() {
  const name = els.templateSelect.value;
  const entry = templateStore()[name];
  if (!entry) {
    els.templateStatus.textContent = "NO TEMPLATE SELECTED";
    return;
  }
  await restore(entry.data);
  undoStack.length = 0;
  redoStack.length = 0;
  (entry.undo || []).slice(-100).forEach(item => undoStack.push(item));
  (entry.redo || []).slice(-100).forEach(item => redoStack.push(item));
  els.templateName.value = name;
  els.templateStatus.textContent = `${name} LOADED`;
  setInfo("TEMPLATE LOADED");
}

function deleteTemplate() {
  const name = els.templateSelect.value;
  if (!name) return;
  const store = templateStore();
  delete store[name];
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(store));
  els.templateStatus.textContent = `${name} DELETED`;
  refreshTemplates();
}

function refreshTemplates(selected = "") {
  const store = templateStore();
  const names = Object.keys(store).sort();
  els.templateSelect.innerHTML = "";
  if (!names.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "NO SAVED TEMPLATES";
    els.templateSelect.appendChild(option);
    return;
  }
  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === selected) option.selected = true;
    els.templateSelect.appendChild(option);
  });
}

function patternBank() {
  try {
    return JSON.parse(localStorage.getItem(PATTERN_BANK_KEY) || "{}");
  } catch {
    return {};
  }
}

function currentPatternSnapshot() {
  return {
    savedAt: new Date().toISOString(),
    length: model.length,
    tempo: model.tempo,
    swing: model.swing,
    pattern: Object.fromEntries(TRACKS.map(track => [track.id, [...model.pattern[track.id]]])),
  };
}

function restorePatternSnapshot(entry) {
  if (!entry) return false;
  remember("PATTERN LOAD");
  model.length = LENGTH_OPTIONS.includes(Number(entry.length)) ? Number(entry.length) : model.length;
  if (entry.tempo) model.tempo = Number(entry.tempo);
  if (entry.swing) model.swing = Number(entry.swing);
  TRACKS.forEach(track => {
    const src = [...(entry.pattern?.[track.id] || [])].slice(0, MAX_STEPS);
    while (src.length < MAX_STEPS) src.push(false);
    model.pattern[track.id] = src;
  });
  syncControls();
  drawGrid();
  return true;
}

function savePatternSlot() {
  const slot = els.patternSlot?.value || "1";
  savePatternToSlot(slot);
}

function savePatternToSlot(slot = "1", snapshot = currentPatternSnapshot()) {
  const bank = patternBank();
  bank[slot] = snapshot;
  localStorage.setItem(PATTERN_BANK_KEY, JSON.stringify(bank));
  if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} SAVED · ${model.length} STEPS`;
  setInfo(`PATTERN SLOT ${slot} SAVED`);
}

function loadPatternSlot() {
  const slot = els.patternSlot?.value || "1";
  loadPatternFromSlot(slot);
}

function loadPatternFromSlot(slot = "1") {
  const entry = patternBank()[slot];
  if (!entry) {
    if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} EMPTY`;
    setInfo("PATTERN SLOT EMPTY");
    return;
  }
  restorePatternSnapshot(entry);
  if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} LOADED`;
  setInfo(`PATTERN SLOT ${slot} LOADED`);
}

function duplicatePatternSlot() {
  remember("PATTERN DUPLICATE");
  const oldLength = model.length;
  const nextLength = LENGTH_OPTIONS.find(len => len > oldLength) || oldLength;
  if (nextLength === oldLength) {
    setInfo("PATTERN ALREADY MAX LENGTH");
    return;
  }
  TRACKS.forEach(track => {
    for (let i = 0; i < oldLength && i + oldLength < nextLength; i++) {
      model.pattern[track.id][i + oldLength] = model.pattern[track.id][i];
    }
  });
  model.length = nextLength;
  syncControls();
  drawGrid();
  if (els.patternStatus) els.patternStatus.textContent = `DUPLICATED TO ${nextLength} STEPS`;
  setInfo(`PATTERN DUPLICATED TO ${nextLength}`);
}

function appendPatternSlot() {
  const slot = els.patternSlot?.value || "1";
  const entry = patternBank()[slot];
  if (!entry) {
    if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} EMPTY`;
    return;
  }
  remember("PATTERN APPEND");
  const oldLength = model.length;
  const appendLength = Math.min(Number(entry.length || 16), MAX_STEPS - oldLength);
  if (appendLength <= 0) {
    setInfo("NO ROOM TO APPEND");
    return;
  }
  TRACKS.forEach(track => {
    for (let i = 0; i < appendLength; i++) {
      model.pattern[track.id][oldLength + i] = !!entry.pattern?.[track.id]?.[i];
    }
  });
  model.length = LENGTH_OPTIONS.find(len => len >= oldLength + appendLength) || MAX_STEPS;
  syncControls();
  drawGrid();
  if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} APPENDED`;
  setInfo(`PATTERN SLOT ${slot} APPENDED`);
}

function buildPatternChain() {
  const bank = patternBank();
  const slots = String(els.patternChain?.value || "")
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
  if (!slots.length) {
    if (els.patternStatus) els.patternStatus.textContent = "ENTER SLOT NUMBERS";
    return;
  }
  const entries = slots.map(slot => [slot, bank[slot]]).filter(([, entry]) => !!entry);
  if (!entries.length) {
    if (els.patternStatus) els.patternStatus.textContent = "NO VALID CHAIN SLOTS";
    setInfo("NO VALID PATTERN CHAIN");
    return;
  }
  remember("PATTERN CHAIN");
  TRACKS.forEach(track => model.pattern[track.id].fill(false));
  let cursor = 0;
  entries.forEach(([, entry]) => {
    const entryLength = Math.min(Number(entry.length || 16), MAX_STEPS - cursor);
    TRACKS.forEach(track => {
      for (let i = 0; i < entryLength; i++) {
        model.pattern[track.id][cursor + i] = !!entry.pattern?.[track.id]?.[i];
      }
    });
    cursor += entryLength;
  });
  model.length = LENGTH_OPTIONS.find(len => len >= cursor) || MAX_STEPS;
  syncControls();
  drawGrid();
  if (els.patternStatus) els.patternStatus.textContent = `CHAIN ${entries.map(([slot]) => slot).join(" > ")} · ${model.length} STEPS`;
  setInfo("PATTERN CHAIN BUILT");
}

function setPatternSlot(slot = "1") {
  if (els.patternSlot) els.patternSlot.value = String(slot);
}

function savePatternRange(slot, start, length) {
  const snap = currentPatternSnapshot();
  snap.length = length;
  snap.pattern = Object.fromEntries(TRACKS.map(track => {
    const data = new Array(MAX_STEPS).fill(false);
    for (let i = 0; i < length; i++) data[i] = !!model.pattern[track.id][start + i];
    return [track.id, data];
  }));
  savePatternToSlot(String(slot), snap);
}

function makePatternOneTwo() {
  remember("MAKE P1 P2");
  const partLength = Math.min(16, model.length);
  savePatternRange("1", 0, partLength);
  const secondStart = model.length > 16 ? 16 : 0;
  savePatternRange("2", secondStart, partLength);
  if (els.patternChain) els.patternChain.value = "1,2";
  if (els.patternStatus) els.patternStatus.textContent = "P1 / P2 READY · CHAIN 1 > 2";
  setInfo("P1 / P2 READY");
}

function linkPatternOneTwo() {
  if (els.patternChain) els.patternChain.value = "1,2";
  buildPatternChain();
}

function copyCurrentPattern() {
  copiedPattern = currentPatternSnapshot();
  if (els.patternStatus) els.patternStatus.textContent = "CURRENT PATTERN COPIED";
  setInfo("CURRENT PATTERN COPIED");
}

function copySelectedPatternSlot() {
  const slot = els.patternSlot?.value || "1";
  const entry = patternBank()[slot];
  if (!entry) {
    if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} EMPTY`;
    return;
  }
  copiedPattern = structuredClone(entry);
  if (els.patternStatus) els.patternStatus.textContent = `SLOT ${slot} COPIED`;
  setInfo(`PATTERN SLOT ${slot} COPIED`);
}

function pastePatternToSelectedSlot() {
  if (!copiedPattern) {
    if (els.patternStatus) els.patternStatus.textContent = "NO PATTERN COPIED";
    setInfo("NO PATTERN COPIED");
    return;
  }
  const slot = els.patternSlot?.value || "1";
  savePatternToSlot(slot, { ...copiedPattern, savedAt: new Date().toISOString() });
}

function clearCurrentPattern() {
  remember("CLEAR PATTERN");
  TRACKS.forEach(track => model.pattern[track.id].fill(false));
  model.step = 0;
  drawGrid();
  refreshScreen();
  if (els.patternStatus) els.patternStatus.textContent = "CURRENT PATTERN CLEARED";
  setInfo("CURRENT PATTERN CLEARED");
}

function showPatternMenu(x, y) {
  if (!els.patternMenu) return;
  hideStepMenu();
  hideUnitMenu();
  els.patternMenu.hidden = false;
  els.patternMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  els.patternMenu.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
}

function hidePatternMenu() {
  if (els.patternMenu) els.patternMenu.hidden = true;
}

function bindReadyCollapses() {
  document.querySelectorAll(".sampler-head, .seq-head, .template-head, .fx-head").forEach(head => {
    head.addEventListener("contextmenu", event => {
      event.preventDefault();
      head.classList.toggle("ready-collapsed");
      const label = head.querySelector("h2, .seq-title")?.textContent?.trim() || "READY";
      setInfo(`${label} STATUS ${head.classList.contains("ready-collapsed") ? "LAMP" : "LABEL"}`);
    });
  });
}

function applyPatternAction(action) {
  if (action === "copy-current") copyCurrentPattern();
  if (action === "copy-slot") copySelectedPatternSlot();
  if (action === "paste-slot") pastePatternToSelectedSlot();
  if (action === "clear-current") clearCurrentPattern();
  if (action === "save-slot") savePatternSlot();
  if (action === "load-slot") loadPatternSlot();
  if (action === "link-1-2") linkPatternOneTwo();
  hidePatternMenu();
}

async function restoreCustomTrackSounds() {
  if (!audioCtx) ensureAudio();
  for (const track of TRACKS) {
    const dataUrl = model.customSoundData[track.id];
    if (!dataUrl) continue;
    try {
      const res = await fetch(dataUrl);
      const arr = await res.arrayBuffer();
      kitBuffers[track.id] = [await audioCtx.decodeAudioData(arr.slice(0))];
    } catch (error) {
      console.warn("Could not restore custom sound", track.id, error);
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function decodeSampleDataUrl(dataUrl, name) {
  await unlockAudio();
  const res = await fetch(dataUrl);
  const arr = await res.arrayBuffer();
  sampleBuffer = await audioCtx.decodeAudioData(arr.slice(0));
  model.sampleName = name || "Loaded sample";
  model.sampleDataUrl = dataUrl;
  model.sampleStart = 0;
  model.sampleEnd = 1;
  els.sampleName.textContent = model.sampleName;
  syncControls();
  drawWave();
  if (model.playing) startSampleLoop();
}

async function loadSample(file) {
  if (!file) return;
  const dataUrl = await readFileAsDataUrl(file);
  await decodeSampleDataUrl(dataUrl, file.name.replace(/\.[^.]+$/, ""));
  setInfo(model.sampleStretch ? "SAMPLE LOADED · TIME STRETCH" : "SAMPLE LOADED");
}

function clearSample() {
  stopSampleLoop();
  sampleBuffer = null;
  model.sampleName = "";
  model.sampleDataUrl = "";
  model.sampleStart = 0;
  model.sampleEnd = 1;
  els.sampleName.textContent = "No sample loaded";
  syncControls();
  drawWave();
  setInfo("SAMPLE CLEARED");
}

function bindDropZone(zone, handler) {
  zone.addEventListener("dragover", event => {
    event.preventDefault();
    zone.classList.add("drop-ready");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drop-ready"));
  zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("drop-ready");
    handler(event.dataTransfer.files[0]);
  });
}

function drawWave() {
  const c = els.wave;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#2a3140";
  ctx.beginPath();
  ctx.moveTo(0, c.height / 2);
  ctx.lineTo(c.width, c.height / 2);
  ctx.stroke();
  if (!sampleBuffer) {
    ctx.fillStyle = "#747b8d";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LOAD A SAMPLE TO DRAW WAVEFORM", c.width / 2, c.height / 2 - 10);
    return;
  }
  const data = sampleBuffer.getChannelData(0);
  ctx.strokeStyle = "#ff7417";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < c.width; x++) {
    const start = Math.floor((x / c.width) * data.length);
    const end = Math.floor(((x + 1) / c.width) * data.length);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = data[i] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, (1 - max) * c.height / 2);
    ctx.lineTo(x, (1 - min) * c.height / 2);
  }
  ctx.stroke();
  const startX = Math.round((model.sampleStart || 0) * c.width);
  const endX = Math.round((model.sampleEnd || 1) * c.width);
  ctx.fillStyle = "rgba(0, 168, 255, 0.12)";
  ctx.fillRect(startX, 0, Math.max(2, endX - startX), c.height);
  ctx.strokeStyle = "#00a8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(startX, c.height);
  ctx.moveTo(endX, 0);
  ctx.lineTo(endX, c.height);
  ctx.stroke();
}

async function loadFactoryKit() {
  try {
    const ctx = ensureAudio();
    const manifest = await fetch("assets/kit-manifest.json?v=1026").then(r => r.json());
    kitManifest = manifest;
    const entries = Object.entries(manifest.tracks || {});
    for (const [trackId, urls] of entries) {
      kitBuffers[trackId] = [];
      for (const url of urls) {
        const arr = await fetch(url).then(r => r.arrayBuffer());
        const buffer = await ctx.decodeAudioData(arr.slice(0));
        kitBuffers[trackId].push(buffer);
      }
    }
    setInfo(`${manifest.name || "GR4600 KIT"} LOADED`);
    refreshKitSelects();
  } catch (error) {
    console.warn("Factory kit load failed", error);
    setInfo("SYNTH FALLBACK READY");
  }
}

function trackIsUsed(trackId) {
  if (trackId === "sample") return !!(sampleBuffer && model.sampleRun) || model.pattern.sample.slice(0, model.length).some(Boolean);
  return model.pattern[trackId].slice(0, model.length).some(Boolean);
}

function renderTrack(trackId, lengthSec, sampleRate, options = {}) {
  const off = new OfflineAudioContext(2, Math.ceil(lengthSec * sampleRate), sampleRate);
  const out = off.createGain();
  out.gain.value = 0.9;
  out.connect(off.destination);
  const stepSec = stepDuration();
  const previousDry = renderingDryStems;
  renderingDryStems = options.includeFx === false;
  try {
    for (let i = 0; i < model.length; i++) {
      if (model.pattern[trackId][i]) trigger(trackId, i * stepSec + swingOffset(i), off, out);
    }
    if (trackId === "sample" && sampleBuffer && model.sampleRun) {
      const src = off.createBufferSource();
      const g = off.createGain();
      const region = sampleRegion();
      src.buffer = sampleBuffer;
      src.loop = true;
      src.loopStart = region.start;
      src.loopEnd = region.end;
      src.playbackRate.value = model.sampleTimeStretch ? 1 : samplePlaybackRate() * samplePitchRate();
      g.gain.value = model.volumes.sample;
      src.connect(mixerFxChain(off, g, "sample"));
      g.connect(out);
      src.start(0, region.start);
      src.stop(model.length * stepSec);
    }
  } finally {
    renderingDryStems = previousDry;
  }
  return off.startRendering();
}

async function renderMasterAndStems(withStems, options = {}) {
  if (!audioCtx) ensureAudio();
  const sampleRate = audioCtx.sampleRate;
  const lengthSec = model.length * stepDuration() + 0.6;
  const stems = {};
  for (const track of TRACKS) {
    if (!trackIsUsed(track.id)) continue;
    stems[track.id] = await renderTrack(track.id, lengthSec, sampleRate, { includeFx: options.includeStemFx !== false });
  }
  const master = await mixBuffers(Object.values(stems), lengthSec, sampleRate);
  return { master, stems: withStems ? stems : {} };
}

async function mixBuffers(buffers, lengthSec, sampleRate) {
  const off = new OfflineAudioContext(2, Math.ceil(lengthSec * sampleRate), sampleRate);
  const bus = off.createGain();
  const comp = off.createDynamicsCompressor();
  bus.gain.value = 0.9;
  comp.threshold.value = -5;
  comp.ratio.value = 8;
  comp.attack.value = 0.004;
  comp.release.value = 0.12;
  bus.connect(comp).connect(off.destination);
  buffers.forEach(buffer => {
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(bus);
    src.start(0);
  });
  return off.startRendering();
}

function wavBlob(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const arr = new ArrayBuffer(bytes);
  const view = new DataView(arr);
  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + frames * channels * 2, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, frames * channels * 2, true);
  let offset = 44;
  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let s = Math.max(-1, Math.min(1, data[ch][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

function writeText(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

async function mp3BlobFromBuffer(buffer) {
  const mime = MediaRecorder.isTypeSupported("audio/mpeg") ? "audio/mpeg" : "";
  if (!mime) throw new Error("MP3 is not supported in this browser. Use WAV.");
  const ctx = new AudioContext({ sampleRate: buffer.sampleRate });
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  return new Promise((resolve, reject) => {
    const rec = new MediaRecorder(dest.stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    rec.onerror = () => reject(rec.error);
    rec.onstop = async () => {
      await ctx.close();
      resolve(new Blob(chunks, { type: mime }));
    };
    rec.start();
    src.start();
    src.onended = () => rec.stop();
  });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}

async function releaseSelfTest() {
  await unlockAudio();
  const previous = {
    pattern: Object.fromEntries(TRACKS.map(t => [t.id, [...model.pattern[t.id]]])),
    sampleBuffer,
    sampleRun: model.sampleRun,
    sampleStretch: model.sampleStretch,
    sampleName: model.sampleName,
    sampleDataUrl: model.sampleDataUrl,
    fx: { ...model.fx },
    channelFx: Object.fromEntries(TRACKS.map(t => [t.id, { ...model.channelFx[t.id] }])),
    masterFx: { ...model.masterFx },
  };
  try {
    TRACKS.forEach(track => model.pattern[track.id].fill(false));
    [0, 4, 8, 12].forEach(i => { model.pattern.kick[i] = true; });
    [4, 12].forEach(i => { model.pattern.snare[i] = true; });
    [2, 6, 10, 14].forEach(i => { model.pattern.hat[i] = true; });
    model.pattern.sample[0] = true;
    model.sampleRun = true;
    model.sampleStretch = false;
    model.fx.slice = true;
    model.fx.sliceTiming = "1/8";
    model.masterFx.softClip = true;
    model.channelFx.kick.eq = true;
    sampleBuffer = makeTestSampleBuffer(audioCtx);
    const rendered = await renderMasterAndStems(true);
    const masterRms = bufferRms(rendered.master);
    const sampleRms = rendered.stems.sample ? bufferRms(rendered.stems.sample) : 0;
    const stemCount = Object.keys(rendered.stems).length;
    return {
      ok: masterRms > 0.002 && sampleRms > 0.002 && stemCount >= 3,
      masterRms: Number(masterRms.toFixed(5)),
      sampleRms: Number(sampleRms.toFixed(5)),
      stemCount,
      sliceTiming: model.fx.sliceTiming,
    };
  } finally {
    model.pattern = previous.pattern;
    sampleBuffer = previous.sampleBuffer;
    model.sampleRun = previous.sampleRun;
    model.sampleStretch = previous.sampleStretch;
    model.sampleName = previous.sampleName;
    model.sampleDataUrl = previous.sampleDataUrl;
    model.fx = previous.fx;
    model.channelFx = previous.channelFx;
    model.masterFx = previous.masterFx;
    buildGrid();
    syncControls();
    drawWave();
  }
}

function makeTestSampleBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.55);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const env = Math.max(0, 1 - i / length);
    data[i] = Math.sin(i / ctx.sampleRate * Math.PI * 2 * 220) * env * 0.45;
  }
  return buffer;
}

function bufferRms(buffer) {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += 64) {
      sum += data[i] * data[i];
      count++;
    }
  }
  return Math.sqrt(sum / Math.max(1, count));
}

async function exportAudio(format, stemsEnabled) {
  stop();
  setInfo("EXPORT RENDERING");
  const printStemFx = els.stemsFxToggle?.checked !== false;
  const rendered = await renderMasterAndStems(stemsEnabled, { includeStemFx: printStemFx });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (format === "mp3") {
    try {
      download(await mp3BlobFromBuffer(rendered.master), `GR4600_MASTER_${model.tempo}BPM_${stamp}.mp3`);
    } catch (error) {
      setInfo(error.message);
      return;
    }
  } else {
    download(wavBlob(rendered.master), `GR4600_MASTER_${model.tempo}BPM_${stamp}.wav`);
  }
  if (stemsEnabled) {
    const files = Object.entries(rendered.stems).map(([trackId, buffer]) => ({
      name: `GR4600_STEMS_${model.tempo}BPM/${trackId.toUpperCase()}_${printStemFx ? "FX" : "DRY"}.wav`,
      blob: wavBlob(buffer),
    }));
    const zip = await zipBlobs(files);
    download(zip, `GR4600_STEMS_${model.tempo}BPM_${printStemFx ? "FX" : "DRY"}_${stamp}.zip`);
  }
  setInfo(stemsEnabled ? "MASTER + STEMS EXPORTED" : "MASTER EXPORTED");
}

async function zipBlobs(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const write16 = (arr, value) => { arr.push(value & 255, (value >> 8) & 255); };
  const write32 = (arr, value) => { arr.push(value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255); };
  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const name = encoder.encode(file.name);
    const crc = crc32(data);
    const local = [];
    write32(local, 0x04034b50); write16(local, 20); write16(local, 0); write16(local, 0);
    write16(local, 0); write16(local, 0); write32(local, crc); write32(local, data.length); write32(local, data.length);
    write16(local, name.length); write16(local, 0);
    chunks.push(new Uint8Array(local), name, data);
    const entry = [];
    write32(entry, 0x02014b50); write16(entry, 20); write16(entry, 20); write16(entry, 0); write16(entry, 0);
    write16(entry, 0); write16(entry, 0); write32(entry, crc); write32(entry, data.length); write32(entry, data.length);
    write16(entry, name.length); write16(entry, 0); write16(entry, 0); write16(entry, 0); write16(entry, 0); write32(entry, 0); write32(entry, offset);
    central.push(new Uint8Array(entry), name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = [];
  write32(end, 0x06054b50); write16(end, 0); write16(end, 0); write16(end, files.length); write16(end, files.length);
  write32(end, centralSize); write32(end, offset); write16(end, 0);
  return new Blob([...chunks, ...central, new Uint8Array(end)], { type: "application/zip" });
}

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function bindUi() {
  window._mainKnobs = {
    tempo: mountKnob(els.tempoKnob, {
      label: "TEMPO", min: 60, max: 190, value: model.tempo, unit: "",
      onChange: value => {
        model.tempo = Math.round(value);
        els.tempo.value = String(model.tempo);
        els.tempoNumber.value = String(model.tempo);
        refreshScreen();
      }
    }),
    swing: mountKnob(els.swingKnob, {
      label: "SWING", min: 50, max: 75, value: model.swing, unit: "",
      onChange: value => {
        model.swing = Math.round(value);
        els.swing.value = String(model.swing);
        refreshScreen();
      }
    }),
    master: mountKnob(els.masterKnob, {
      label: "MASTER", min: 0, max: 1, value: model.master, unit: "",
      onChange: value => {
        model.master = value;
        els.master.value = String(value);
        refreshScreen();
      }
    }),
    masterPitch: mountKnob(els.masterPitchKnob, {
      label: "PITCH", min: -24, max: 24, value: model.masterPitch, unit: "st",
      onChange: value => {
        model.masterPitch = Math.round(value);
        els.masterPitch.value = String(model.masterPitch);
        refreshScreen();
      }
    }),
    fxDepth: mountKnob(els.fxDepthKnob, {
      label: "DEPTH", min: 0, max: 1, value: model.fx.depth, unit: "",
      onChange: value => {
        model.fx.depth = value;
        els.fxDepth.value = String(value);
        els.fxDepthReadout.textContent = String(Math.round(value * 100));
      }
    }),
  };
  els.tempo.addEventListener("input", () => {
    model.tempo = Number(els.tempo.value);
    els.tempoNumber.value = String(model.tempo);
    window._mainKnobs.tempo.set(model.tempo);
    refreshScreen();
  });
  els.tempoNumber.addEventListener("change", () => {
    model.tempo = Math.max(60, Math.min(190, Number(els.tempoNumber.value) || 140));
    els.tempo.value = String(model.tempo);
    window._mainKnobs.tempo.set(model.tempo);
    refreshScreen();
  });
  els.swing.addEventListener("input", () => {
    model.swing = Number(els.swing.value);
    window._mainKnobs.swing.set(model.swing);
    refreshScreen();
  });
  els.master.addEventListener("input", () => {
    model.master = Number(els.master.value);
    window._mainKnobs.master.set(model.master);
    refreshScreen();
  });
  els.masterPitch.addEventListener("input", () => {
    model.masterPitch = Number(els.masterPitch.value);
    window._mainKnobs.masterPitch.set(model.masterPitch);
    refreshScreen();
  });
  els.samplePitch.addEventListener("input", () => {
    setSamplePitch(els.samplePitch.value);
  });
  els.samplePitchDown?.addEventListener("click", () => setSamplePitch(model.samplePitch - 1));
  els.samplePitchUp?.addEventListener("click", () => setSamplePitch(model.samplePitch + 1));
  els.sampleStart?.addEventListener("input", () => {
    model.sampleStart = Math.min(Number(els.sampleStart.value) / 100, (model.sampleEnd || 1) - 0.01);
    syncControls();
    drawWave();
    if (model.playing && model.sampleRun) startSampleLoop();
  });
  els.sampleEnd?.addEventListener("input", () => {
    model.sampleEnd = Math.max(Number(els.sampleEnd.value) / 100, (model.sampleStart || 0) + 0.01);
    syncControls();
    drawWave();
    if (model.playing && model.sampleRun) startSampleLoop();
  });
  els.sampleLevel?.addEventListener("input", () => {
    model.volumes.sample = Number(els.sampleLevel.value);
    syncControls();
    refreshScreen();
  });
  els.fxDepth.addEventListener("input", () => {
    model.fx.depth = Number(els.fxDepth.value);
    window._mainKnobs.fxDepth.set(model.fx.depth);
  });
  ["eqLow", "eqHigh", "chorusWet", "reverbWet", "clipDrive"].forEach(key => {
    els[key]?.addEventListener("input", () => {
      model.fxParams[key] = Number(els[key].value);
      setInfo(`${key.replace(/[A-Z]/g, m => " " + m).toUpperCase()} ${model.fxParams[key]}`);
    });
  });
  els.sliceTiming?.addEventListener("change", () => {
    model.fx.sliceTiming = els.sliceTiming.value;
    setInfo(`SLICE TIMING ${model.fx.sliceTiming}`);
  });
  els.playBtn.addEventListener("click", () => model.playing ? stop() : play());
  els.stopBtn.addEventListener("click", stop);
  els.undoBtn?.addEventListener("click", undoLast);
  els.redoBtn?.addEventListener("click", redoLast);
  els.recordBtn.addEventListener("click", () => {
    model.recording = !model.recording;
    setInfo(model.recording ? "PAD RECORD ARMED" : "PAD RECORD OFF");
    refreshScreen();
  });
  els.newProjectBtn.addEventListener("click", () => clearProject(false));
  els.saveBtn.addEventListener("click", saveProject);
  els.loadBtn.addEventListener("click", loadProject);
  els.clearBtn.addEventListener("click", () => clearProject(false));
  document.querySelectorAll(".length-btn").forEach(btn => {
    btn.addEventListener("click", () => setSequenceLength(Number(btn.dataset.length)));
  });
  els.seqZoom?.addEventListener("input", () => {
    updateSequencerViewport();
    followPlayhead();
    setInfo(`SEQUENCER ZOOM ${els.seqZoom.value}`);
  });
  document.querySelectorAll(".fx-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.fx;
      model.fx[key] = !model.fx[key];
      btn.classList.toggle("on", model.fx[key]);
      updateFxReadout();
      fxPulse = 1;
    });
  });
  els.fxTarget.addEventListener("change", syncMixFxButtons);
  document.querySelectorAll(".mix-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = els.fxTarget.value;
      const key = btn.dataset.mixFx;
      const bank = target === "master" ? model.masterFx : model.channelFx[target];
      bank[key] = !bank[key];
      syncMixFxButtons();
      setInfo(`${target.toUpperCase()} ${key.toUpperCase()} ${bank[key] ? "ON" : "OFF"}`);
    });
  });
  els.sampleInput.addEventListener("change", event => loadSample(event.target.files[0]));
  els.sampleRunBtn.addEventListener("click", () => {
    model.sampleRun = !model.sampleRun;
    if (model.sampleRun && model.playing) startSampleLoop();
    if (!model.sampleRun) stopSampleLoop();
    setInfo(model.sampleRun ? "SAMPLE RUN ON" : "SAMPLE RUN OFF");
    refreshScreen();
  });
  els.sampleStretchBtn.addEventListener("click", () => {
    model.sampleStretch = !model.sampleStretch;
    if (model.playing && model.sampleRun) startSampleLoop();
    setInfo(model.sampleStretch ? "TIME STRETCH ON" : "TIME STRETCH OFF");
    refreshScreen();
    drawWave();
  });
  els.sampleTimeStretch?.addEventListener("change", () => {
    model.sampleTimeStretch = els.sampleTimeStretch.checked;
    if (model.playing && model.sampleRun) startSampleLoop();
    setInfo(model.sampleTimeStretch ? "TUNE MODE: TIME STRETCH" : "TUNE MODE: CLASSIC VARISPEED");
    refreshScreen();
  });
  els.sampleCutSelf?.addEventListener("change", () => {
    model.sampleCutSelf = els.sampleCutSelf.checked;
    if (model.sampleCutSelf) stopSampleChops();
    setInfo(model.sampleCutSelf ? "CHOPS CUT SELF" : "CHOPS BLEED");
  });
  els.sampleClearBtn.addEventListener("click", clearSample);
  bindDropZone(document.querySelector(".sampler-panel"), file => loadSample(file));
  els.templateSaveBtn.addEventListener("click", saveTemplate);
  els.templateLoadBtn.addEventListener("click", loadTemplate);
  els.templateDeleteBtn.addEventListener("click", deleteTemplate);
  els.patternBuilderBtn?.addEventListener("click", () => els.patternDialog?.showModal());
  els.patternSaveBtn?.addEventListener("click", savePatternSlot);
  els.patternLoadBtn?.addEventListener("click", loadPatternSlot);
  els.patternDuplicateBtn?.addEventListener("click", duplicatePatternSlot);
  els.patternAppendBtn?.addEventListener("click", appendPatternSlot);
  els.patternChainBtn?.addEventListener("click", buildPatternChain);
  els.patternOneSaveBtn?.addEventListener("click", () => { setPatternSlot("1"); savePatternSlot(); });
  els.patternOneLoadBtn?.addEventListener("click", () => { setPatternSlot("1"); loadPatternSlot(); });
  els.patternTwoSaveBtn?.addEventListener("click", () => { setPatternSlot("2"); savePatternSlot(); });
  els.patternTwoLoadBtn?.addEventListener("click", () => { setPatternSlot("2"); loadPatternSlot(); });
  els.patternOneTwoBtn?.addEventListener("click", linkPatternOneTwo);
  els.patternSplitBtn?.addEventListener("click", makePatternOneTwo);
  els.patternBuilderBtn?.addEventListener("contextmenu", event => {
    event.preventDefault();
    showPatternMenu(event.clientX, event.clientY);
  });
  els.sequencerPanel?.addEventListener("contextmenu", event => {
    if (event.target.closest(".step, .grid-label, .row-select")) return;
    event.preventDefault();
    showPatternMenu(event.clientX, event.clientY);
  });
  els.patternSlot?.addEventListener("contextmenu", event => {
    event.preventDefault();
    showPatternMenu(event.clientX, event.clientY);
  });
  els.patternMenu?.querySelectorAll("[data-pattern-action]").forEach(btn => {
    btn.addEventListener("click", () => applyPatternAction(btn.dataset.patternAction));
  });
  els.copyTrackBtn?.addEventListener("click", copySelectedTrack);
  els.pasteTrackBtn?.addEventListener("click", pasteSelectedTrack);
  els.stepMenu?.querySelectorAll("[data-fill]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyStepFill(btn.dataset.fill);
      hideStepMenu();
    });
  });
  bindReadyCollapses();
  bindSoundEqCanvas();
  els.soundBrowserClose?.addEventListener("click", () => {
    if (els.soundBrowser) els.soundBrowser.hidden = true;
  });
  els.soundEq?.querySelectorAll("[data-eq-param]").forEach(input => {
    input.addEventListener("input", () => {
      const key = input.dataset.eqParam;
      model.channelEq[soundBrowserTrack][key] = Number(input.value);
      syncSoundEq(soundBrowserTrack);
      setInfo(`${TRACKS.find(t => t.id === soundBrowserTrack)?.label || "PAD"} EQ ${key.toUpperCase()} ${input.value}`);
    });
  });
  document.querySelectorAll("[data-mini-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.miniToggle;
      model.fx[key] = !model.fx[key];
      syncMiniFxButtons();
      syncFxButtons();
      updateFxReadout();
    });
  });
  document.querySelectorAll("[data-stutter-template]").forEach(btn => {
    btn.addEventListener("click", () => {
      model.fx.stutter = true;
      model.fx.depth = btn.dataset.stutterTemplate === "triplet" ? 0.72 : 0.48;
      window._mainKnobs.fxDepth?.set(model.fx.depth);
      syncMiniFxButtons();
      syncFxButtons();
      updateFxReadout();
      setInfo(`STUTTER ${btn.dataset.stutterTemplate.toUpperCase()}`);
    });
  });
  document.querySelectorAll("[data-repeat-template]").forEach(btn => {
    btn.addEventListener("click", () => {
      model.fx.repeat = true;
      model.fx.depth = btn.dataset.repeatTemplate === "four" ? 0.7 : 0.45;
      window._mainKnobs.fxDepth?.set(model.fx.depth);
      syncMiniFxButtons();
      syncFxButtons();
      updateFxReadout();
      setInfo(`REPEAT ${btn.dataset.repeatTemplate.toUpperCase()}`);
    });
  });
  document.querySelectorAll("[data-glitch-template]").forEach(btn => {
    btn.addEventListener("click", () => {
      model.fx.glitch = true;
      if (btn.dataset.glitchTemplate === "crush") model.fx.depth = 0.82;
      window._mainKnobs.fxDepth?.set(model.fx.depth);
      syncMiniFxButtons();
      syncFxButtons();
      updateFxReadout();
      setInfo(`GLITCH ${btn.dataset.glitchTemplate.toUpperCase()}`);
    });
  });
  document.querySelector("[data-mini-fx='sliceTiming']")?.addEventListener("change", event => {
    model.fx.slice = true;
    model.fx.sliceTiming = event.target.value;
    if (els.sliceTiming) els.sliceTiming.value = model.fx.sliceTiming;
    syncMiniFxButtons();
    syncFxButtons();
    updateFxReadout();
  });
  window.addEventListener("click", () => {
    hideStepMenu();
    hideUnitMenu();
    hidePatternMenu();
  });
  els.exportBtn.addEventListener("click", () => els.exportDialog.showModal());
  els.helpBtn.addEventListener("click", () => els.helpDialog.showModal());
  els.confirmExport.addEventListener("click", event => {
    event.preventDefault();
    const format = els.exportDialog.querySelector("input[name='format']:checked").value;
    const stems = els.stemsToggle.checked;
    els.exportDialog.close();
    exportAudio(format, stems);
  });
  document.querySelectorAll("[data-pad]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await unlockAudio();
      const id = btn.dataset.pad;
      if (model.selectedTrack === "sample" && sampleBuffer) {
        selectPad("sample");
        playSampleChop(Number(btn.dataset.chop || 0));
        btn.classList.add("hit");
        setTimeout(() => btn.classList.remove("hit"), 110);
        return;
      }
      selectPad(id);
      trigger(id);
      if (model.recording) {
        remember(`${id.toUpperCase()} RECORD`);
        model.pattern[id][model.step] = true;
        drawGrid();
      }
    });
    btn.addEventListener("contextmenu", event => {
      event.preventDefault();
      const id = btn.dataset.pad;
      selectPad(id);
      contextTarget = { type: "pad", trackId: id, step: model.step };
      showUnitMenu(event.clientX, event.clientY, "pad");
    });
  });
  els.unitMenu?.querySelectorAll("[data-unit-action]").forEach(btn => {
    btn.addEventListener("click", () => applyUnitAction(btn.dataset.unitAction));
  });
  els.fxCollapseBtn?.addEventListener("click", () => {
    const collapsed = els.machine.classList.toggle("rack-collapsed");
    els.fxPanel.classList.toggle("collapsed", collapsed);
    els.fxCollapseBtn.setAttribute("aria-expanded", String(!collapsed));
    els.fxCollapseBtn.textContent = collapsed ? "OPEN RACK" : "FX PANEL";
    setInfo(collapsed ? "MASTER / FX RACK COLLAPSED" : "MASTER / FX RACK OPEN");
  });
  window.addEventListener("keydown", async event => {
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.repeat) return;
    if (event.code === "Space") {
      event.preventDefault();
      model.playing ? stop() : play();
      return;
    }
    if (KEY_MAP[event.code] !== undefined) {
      event.preventDefault();
      await unlockAudio();
      auditionTrackPitch(els.soundBrowser?.hidden ? model.selectedTrack : soundBrowserTrack, KEY_MAP[event.code]);
      return;
    }
    if (PAD_KEY_MAP[event.code]) {
      event.preventDefault();
      await unlockAudio();
      const id = PAD_KEY_MAP[event.code];
      selectPad(id);
      trigger(id);
      if (model.recording) {
        remember(`${id.toUpperCase()} RECORD`);
        model.pattern[id][model.step] = true;
        drawGrid();
      }
    }
  });
}

function selectPad(trackId) {
  model.selectedPad = trackId;
  model.selectedTrack = trackId;
  if (els.fxTarget && TRACKS.some(t => t.id === trackId)) {
    els.fxTarget.value = trackId;
    syncMixFxButtons();
  }
  syncPadSelection();
  syncTrackSelection();
  const label = TRACKS.find(t => t.id === trackId)?.label || trackId;
  setFxScope(`${label} PAD`, "PAD TOUCHED", TRACKS.find(t => t.id === trackId)?.color || "#7edbff");
  setInfo(`${label} SELECTED · QUICK FX READY`);
}

function syncPadSelection() {
  document.querySelectorAll("[data-pad]").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.pad === model.selectedPad);
  });
}

function selectTrack(trackId) {
  if (!TRACKS.some(t => t.id === trackId)) return;
  model.selectedTrack = trackId;
  model.selectedPad = trackId;
  if (els.fxTarget) els.fxTarget.value = trackId;
  syncPadSelection();
  syncTrackSelection();
  syncMixFxButtons();
  setFxScope(`${TRACKS.find(t => t.id === trackId).label} TRACK`, "TRACK SELECTED", TRACKS.find(t => t.id === trackId)?.color || "#7edbff");
  setInfo(`${TRACKS.find(t => t.id === trackId).label} TRACK SELECTED`);
}

function syncTrackSelection() {
  document.querySelectorAll(".track").forEach(el => {
    const id = el.dataset.track;
    el.classList.toggle("selected", id === model.selectedTrack);
    el.classList.toggle("muted", !!model.muted[id]);
    el.querySelector(".lane-power")?.classList.toggle("on", !model.muted[id]);
  });
  document.querySelectorAll(".track-row-label").forEach(el => {
    const id = el.dataset.track;
    el.classList.toggle("selected", id === model.selectedTrack);
    el.classList.toggle("muted", !!model.muted[id]);
  });
  drawGrid();
}

function copySelectedTrack() {
  copiedTrack = [...model.pattern[model.selectedTrack]];
  setInfo(`${model.selectedTrack.toUpperCase()} TRACK COPIED`);
}

function pasteSelectedTrack() {
  if (!copiedTrack) {
    setInfo("NO TRACK COPIED");
    return;
  }
  model.pattern[model.selectedTrack] = [...copiedTrack].slice(0, MAX_STEPS);
  while (model.pattern[model.selectedTrack].length < MAX_STEPS) model.pattern[model.selectedTrack].push(false);
  drawGrid();
  setInfo(`PASTED TO ${model.selectedTrack.toUpperCase()}`);
}

function showStepMenu(x, y) {
  if (!els.stepMenu) return;
  hideUnitMenu();
  hidePatternMenu();
  els.stepMenu.hidden = false;
  els.stepMenu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
  els.stepMenu.style.top = `${Math.min(y, window.innerHeight - 180)}px`;
}

function hideStepMenu() {
  if (els.stepMenu) els.stepMenu.hidden = true;
}

function showUnitMenu(x, y, type = "track") {
  if (!els.unitMenu) return;
  hideStepMenu();
  els.unitMenu.hidden = false;
  els.unitMenu.dataset.type = type;
  els.unitMenu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
  els.unitMenu.style.top = `${Math.min(y, window.innerHeight - 230)}px`;
}

function hideUnitMenu() {
  if (els.unitMenu) els.unitMenu.hidden = true;
}

async function applyUnitAction(action) {
  const trackId = contextTarget.trackId || model.selectedTrack;
  if (action === "mute") {
    remember(`${trackId.toUpperCase()} MUTE`);
    model.muted[trackId] = !model.muted[trackId];
    syncTrackSelection();
    setInfo(`${trackId.toUpperCase()} ${model.muted[trackId] ? "MUTED" : "ON"}`);
  } else if (action === "browser") {
    openSoundBrowser(trackId);
  } else if (action === "piano-roll") {
    openPianoRoll(trackId);
  } else if (action === "browse-file") {
    document.querySelector(`.track[data-track="${trackId}"] .sound-file`)?.click();
  } else if (action === "mixer") {
    if (els.fxTarget) {
      els.fxTarget.value = trackId;
      syncMixFxButtons();
    }
    setInfo(`${trackId.toUpperCase()} MIXER READY`);
  } else if (action === "copy") {
    model.selectedTrack = trackId;
    copySelectedTrack();
  } else if (action === "paste") {
    remember(`${trackId.toUpperCase()} PASTE`);
    model.selectedTrack = trackId;
    pasteSelectedTrack();
  } else if (action === "undo") {
    await undoLast();
  } else if (action === "redo") {
    await redoLast();
  }
  hideUnitMenu();
}

function applyStepFill(value) {
  if (!contextStep) return;
  const { trackId, step } = contextStep;
  remember(`${trackId.toUpperCase()} EDIT`);
  if (value === "clear") {
    model.pattern[trackId].fill(false);
  } else if (value === "delete-step") {
    model.pattern[trackId][step] = false;
  } else if (value === "copy") {
    model.selectedTrack = trackId;
    copySelectedTrack();
  } else if (value === "paste") {
    model.selectedTrack = trackId;
    pasteSelectedTrack();
  } else {
    const gap = Number(value);
    for (let i = step; i < model.length; i += gap) model.pattern[trackId][i] = true;
  }
  drawGrid();
  if (!["copy", "paste"].includes(value)) {
    setInfo(`${trackId.toUpperCase()} ${value === "clear" ? "TRACK CLEARED" : value === "delete-step" ? "STEP DELETED" : "FILL EVERY " + value}`);
  }
}

function syncFxButtons() {
  document.querySelectorAll(".fx-btn").forEach(btn => {
    btn.classList.toggle("on", !!model.fx[btn.dataset.fx]);
  });
  syncMiniFxButtons();
  updateFxReadout();
}

function syncMiniFxButtons() {
  document.querySelectorAll("[data-mini-toggle]").forEach(btn => {
    btn.classList.toggle("on", !!model.fx[btn.dataset.miniToggle]);
  });
  const sliceSelect = document.querySelector("[data-mini-fx='sliceTiming']");
  if (sliceSelect) sliceSelect.value = model.fx.sliceTiming || "1/4";
}

function syncMixFxButtons() {
  const target = els.fxTarget.value;
  const bank = target === "master" ? model.masterFx : model.channelFx[target];
  document.querySelectorAll(".mix-btn").forEach(btn => {
    btn.classList.toggle("on", !!bank[btn.dataset.mixFx]);
  });
  const label = target === "master" ? "MASTER" : `${TRACKS.find(t => t.id === target)?.label || target} CHANNEL`;
  const active = Object.entries(bank).filter(([, value]) => value).map(([key]) => key.toUpperCase());
  els.mixFxStatus.textContent = `${label}: ${active.length ? active.join(" + ") : "DRY"}`;
  setFxScope(label, active.length ? active.join(" + ") : "DRY", target === "master" ? "#ff7417" : (TRACKS.find(t => t.id === target)?.color || "#7edbff"));
}

function updateFxReadout() {
  const active = activeFxNames();
  els.fxReadout.textContent = active.length ? active.join(" + ") : "FX OFF";
  const target = els.fxTarget?.value || model.selectedTrack;
  const label = target === "master" ? "MASTER" : `${TRACKS.find(t => t.id === target)?.label || model.selectedTrack} BUS`;
  const perf = active.length ? active.join(" + ") : "PERFORMANCE DRY";
  setFxScope(label, `${perf} · DEPTH ${Math.round(model.fx.depth * 100)} · ${model.fx.sliceTiming || "1/4"}`, target === "master" ? "#ff7417" : (TRACKS.find(t => t.id === target)?.color || "#7edbff"));
}

function activeFxNames() {
  return Object.entries(model.fx)
    .filter(([key, value]) => ["slice", "stutter", "repeat", "glitch"].includes(key) && value)
    .map(([key]) => key.toUpperCase());
}

function drawFxDisplay() {
  const canvas = els.fxDisplay;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const active = activeFxNames();
  const depth = Math.round(model.fx.depth * 100);
  const now = performance.now() * 0.001;
  fxPulse *= 0.92;

  const accent = fxDisplayState.accent || "#7edbff";
  ctx.fillStyle = "#071019";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(126, 219, 255, 0.08)";
  for (let y = 4; y < h; y += 8) ctx.fillRect(0, y, w, 1);
  ctx.fillStyle = "rgba(255, 116, 23, 0.08)";
  for (let x = 10; x < w; x += 22) ctx.fillRect(x, 0, 1, h);

  ctx.font = "700 12px Courier New, monospace";
  ctx.fillStyle = "#d8f7ff";
  ctx.fillText("GR4600 FX MODULE", 12, 18);
  ctx.fillStyle = accent;
  ctx.fillRect(12, 23, Math.max(28, Math.min(150, depth * 1.5)), 3);
  ctx.font = "700 10px Courier New, monospace";
  ctx.fillStyle = "#7edbff";
  ctx.fillText(`TARGET ${String(fxDisplayState.target || "MASTER").slice(0, 22)}`, 12, 39);
  ctx.fillStyle = "#a8dff1";
  ctx.fillText(`TOUCH  ${String(fxDisplayState.touched || fxDisplayState.detail || "READY").slice(0, 28)}`, 12, 54);
  ctx.fillStyle = "#ffb36e";
  ctx.fillText(`DEPTH ${String(depth).padStart(3, "0")}  TIMING ${model.fx.sliceTiming || "1/4"}  STEP ${String(model.step + 1).padStart(2, "0")}`, 12, 69);
  ctx.fillStyle = "#d8f7ff";
  ctx.fillText(`${active.length ? active.join("/") : "PERF DRY"}  ${model.sampleStretch ? "STRETCH" : "CLASSIC"}`, 182, 18);

  const meterBase = 82;
  for (let i = 0; i < 24; i++) {
    const phase = Math.sin(now * 6 + i * 0.48) * 0.22 + 0.78;
    const activeLift = active.length ? 0.25 : 0;
    const level = Math.min(1, fxPulse + activeLift) * phase;
    const barH = 5 + Math.round(level * 27 * ((i % 5) / 5 + 0.35));
    ctx.fillStyle = i % 8 === 7 ? "#ff7417" : i % 3 === 0 ? accent : "#7edbff";
    ctx.fillRect(12 + i * 13, meterBase - barH, 8, barH);
  }

  ctx.fillStyle = model.playing ? "#ff7417" : "#5f743a";
  ctx.fillRect(w - 28, 12, 12, 8);
  requestAnimationFrame(drawFxDisplay);
}

function init() {
  bindUi();
  buildMixer();
  buildGrid();
  syncControls();
  drawWave();
  drawFxDisplay();
  setInfo("EMPTY · LOAD OR PROGRAM A BEAT");
  syncFxButtons();
  refreshTemplates();
  loadFactoryKit();
}

window.GR4600_RELEASE_TEST = releaseSelfTest;
init();
