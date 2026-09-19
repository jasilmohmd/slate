// Reference artifact (§6 step 2): hand-verified Band B, class 9,
// parallel/series circuits, satisfying §2/§2a/§2b/§2d in full. Drafted by
// Astra (gpt-6-astra), then repaired (a landscape scene/chrome stretch bug
// in the shared base CSS) and verified in-browser at 360x640, 1024x768 and
// 1920x1080 before being checked in. This is the structural template every
// later generation must match the shape of.
export const REFERENCE_ARTIFACT_HTML = `<!doctype html>
<html lang="ml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ക്ലാസ് 9 • Series–Parallel circuits</title>
<style>

:root {
  /* Colour — high contrast, projection-safe (§2a). Never the only signal:
     pair every colour with shape, label or position in the markup. */
  --ink: #17211f;
  --ink-soft: #3f4a47;
  --paper: #faf8f2;
  --paper-well: #eeece2;
  --accent-blue: #1c4f8c;
  --accent-amber: #8a4a10;
  --accent-violet: #4a3170;
  --correct: #1e6b3a;
  --incorrect: #a02638;

  /* Type scale — handheld default, axis 1 of §2a (<900px) */
  --text-label: 14px;
  --text-body: 16px;
  --text-heading: 20px;
  --text-title: 24px;

  /* Stroke weight — handheld default */
  --stroke: 1.5px;

  /* Touch targets (§2a) */
  --control-min: 48px;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
}

/* Axis 1 — size. Above 900px is always projection-safe, unconditionally:
   a laptop driving a projector reports as an ordinary desktop viewport, so
   there is no projector-detection branch anywhere in this file (§2a). This
   floor applies to ALL text, including in-scene axis labels and units. */
@media (min-width: 900px) {
  :root {
    --text-label: 28px;
    --text-body: 28px;
    --text-heading: 40px;
    --text-title: 56px;
    --stroke: 3px;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--paper);
  color: var(--ink);
  /* System stack only — artifacts cannot load webfonts (§2). Manjari is
     builder UI only; Malayalam falls back to whatever the OS ships. */
  font-family: -apple-system, "Noto Sans Malayalam", "Noto Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

body {
  font-size: var(--text-body);
  line-height: 1.4;
}

[data-role="meta"] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--paper-well);
  border-bottom: var(--stroke) solid var(--ink);
  font-size: var(--text-label);
  color: var(--ink-soft);
}

[data-role="artifact"] {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Axis 2 — aspect, independent of axis 1 (§2a). Portrait stacks the scene
   above the chrome; landscape puts the scene beside a side rail. */
@media (orientation: landscape) {
  [data-role="artifact"] {
    flex-direction: row;
    align-items: flex-start;
  }
  [data-role="scene"] {
    flex: 1 1 60%;
    min-width: 0;
  }
  [data-role="chrome"] {
    flex: 0 0 40%;
    max-width: 480px;
    overflow-y: auto;
  }
}

[data-role="scene"] {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
  overflow: hidden;
}

[data-role="scene"] svg {
  width: 100%;
  height: auto;
  display: block;
}

[data-role="chrome"] {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}

/* Controls cluster in one region and never need hover to be usable (§2a). */
[data-role="controls"] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

[data-control] {
  min-width: var(--control-min);
  min-height: var(--control-min);
  font-size: var(--text-body);
  border: var(--stroke) solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  border-radius: 6px;
  padding: var(--space-xs) var(--space-sm);
}

[data-role="prediction"],
[data-role="reveal"],
[data-role="explanation"] {
  padding: var(--space-md);
  border: var(--stroke) solid var(--ink);
  border-radius: 6px;
  background: var(--paper-well);
}

[data-role="reveal"][hidden] {
  display: none;
}

/* Units, axis labels and tick values (§2d) share the same projection floor
   as body text (§2a). */
[data-text="label"] {
  font-size: var(--text-label);
  fill: var(--ink);
  color: var(--ink);
}

/* Circuit-specific additions. SVG labels are unscaled HTML overlays. */
[hidden] { display: none !important; }
h1, h2, p { margin: 0 0 var(--space-sm); }
h1 { font-size: var(--text-title); line-height: 1.25; }
h2 { font-size: var(--text-heading); line-height: 1.3; }
button, select, input, summary { font-family: inherit; }
button, summary { cursor: pointer; }
button:disabled, select:disabled { cursor: default; opacity: .65; }
:focus { outline: 3px solid var(--accent-blue); outline-offset: 3px; }
[data-role="scene"] {
  flex-direction: column;
  justify-content: flex-start;
  padding: var(--space-md);
}
.scene-heading { width: 100%; }
.diagram { position: relative; width: 100%; }
.overlay {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 2px 6px;
  background: var(--paper);
  font-weight: 700;
  white-space: nowrap;
}
.r1-label { left: 50%; top: 12%; }
.r2-label { left: 50%; top: 54%; }
.source-label { left: 50%; top: 97%; }
.diagram.series .source-label { left: 16%; top: 54%; }
.wire, .battery, .resistor, .direction {
  fill: none;
  stroke: var(--ink);
  stroke-width: 3px;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.resistor { stroke-width: 4px; fill: var(--paper-well); }
.first { stroke: var(--accent-blue); }
.second { stroke: var(--accent-amber); }
.direction { stroke-width: 3px; }
.scene-note { width: 100%; margin-top: var(--space-lg); color: var(--ink-soft); }
.field { width: 100%; }
.field label { display: block; margin-bottom: var(--space-xs); }
input[type="range"] {
  display: block;
  width: 100%;
  padding: 0;
  accent-color: var(--accent-blue);
}
.range-ends { display: flex; justify-content: space-between; }
.mode-row { display: flex; flex-wrap: wrap; gap: var(--space-sm); width: 100%; }
.mode-row button { flex: 1; }
button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.full { width: 100%; }
select { width: 100%; margin: var(--space-sm) 0; }
details p { margin-top: var(--space-sm); }
summary { line-height: 1.4; }
#commit { background: var(--accent-blue); color: var(--paper); }
#commit:disabled { background: var(--ink-soft); }
#feedback { border-left: 5px solid var(--ink); padding-left: var(--space-sm); }
#feedback.correct { border-color: var(--correct); }
#feedback.incorrect { border-color: var(--incorrect); }
.readouts { margin: var(--space-md) 0; }
.readout-row {
  padding: var(--space-sm) 0;
  border-bottom: 3px solid var(--ink-soft);
}
.readout-row strong { display: block; }
.readout-row span { display: inline-block; margin-right: var(--space-sm); }
.equation { font-weight: 700; overflow-wrap: anywhere; }
#hint { margin: var(--space-sm) 0; }
#phase { font-weight: 700; }
@media (min-width: 900px) {
  .scene-note { font-size: var(--text-label); }
}
</style>
</head>
<body>
<header data-role="meta">
  <span>ക്ലാസ് 9 • ഭൗതികശാസ്ത്രം</span>
  <span>വൈദ്യുതി • Series &amp; Parallel circuits</span>
</header>

<main data-role="artifact">
  <section data-role="scene" data-intrinsic-aspect="1.3333" data-min-aspect="1.2" aria-labelledby="scene-title">
    <div class="scene-heading">
      <h1 id="scene-title">Parallel circuit</h1>
      <p id="scene-status">ആദ്യം പ്രവചിക്കൂ; പിന്നെ current കാണാം.</p>
    </div>

    <div class="diagram" id="diagram">
      <svg viewBox="0 0 640 480" role="img" aria-labelledby="svg-title svg-description">
        <title id="svg-title">രണ്ട് resistors ഉള്ള Parallel circuit</title>
        <desc id="svg-description">മുകളിലെ resistor R₁, താഴെയുള്ളത് R₂. സ്ഥിര വോൾട്ടേജുള്ള battery ആണ് ഉറവിടം. അളവുകൾ പ്രവചനം ഉറപ്പിച്ച ശേഷം താഴെയുള്ള പാനലിൽ കാണാം.</desc>

        <g id="parallel-wires">
          <path class="wire" vector-effect="non-scaling-stroke" d="M265 100 H100 V430 H310 M330 430 H540 V100 H375 M100 300 H265 M375 300 H540"/>
          <path class="battery" vector-effect="non-scaling-stroke" d="M310 400 V460 M330 412 V448"/>
          <path class="battery" vector-effect="non-scaling-stroke" d="M282 411 V425 M275 418 H289 M349 418 H363"/>
          <circle cx="100" cy="300" r="6" fill="var(--ink)" stroke="var(--ink)" stroke-width="3" vector-effect="non-scaling-stroke"/>
          <circle cx="540" cy="300" r="6" fill="var(--ink)" stroke="var(--ink)" stroke-width="3" vector-effect="non-scaling-stroke"/>
        </g>

        <g id="series-wires" style="display:none">
          <path class="wire" vector-effect="non-scaling-stroke" d="M265 100 H100 V210 M100 230 V300 H265 M375 100 H540 V300 H375"/>
          <path class="battery" vector-effect="non-scaling-stroke" d="M70 210 H130 M82 230 H118"/>
          <path class="battery" vector-effect="non-scaling-stroke" d="M62 186 V200 M55 193 H69 M55 243 H69"/>
        </g>

        <rect class="resistor first" x="265" y="82" width="110" height="36" vector-effect="non-scaling-stroke"/>
        <rect class="resistor second" x="265" y="282" width="110" height="36" vector-effect="non-scaling-stroke"/>

        <g id="current-arrows" style="display:none">
          <path id="arrow1" class="direction first" vector-effect="non-scaling-stroke" d="M402 143 H483"/>
          <path class="direction first" vector-effect="non-scaling-stroke" d="M468 131 L483 143 L468 155"/>
          <path id="arrow2" class="direction second" vector-effect="non-scaling-stroke" d="M402 343 H483"/>
          <path id="arrow2-head" class="direction second" vector-effect="non-scaling-stroke" d="M468 331 L483 343 L468 355"/>
        </g>
      </svg>
      <span class="overlay r1-label" data-text="label">R₁</span>
      <span class="overlay r2-label" data-text="label">R₂</span>
      <span class="overlay source-label" data-text="label">12 V</span>
    </div>

    <p class="scene-note" id="arrow-note">R₁ മുകളിൽ • R₂ താഴെ. Battery വോൾട്ടേജ് സ്ഥിരമാണ്.</p>
  </section>

  <section data-role="chrome">
    <div data-role="controls">
      <h2 class="full">പരീക്ഷണം സജ്ജമാക്കൂ</h2>
      <div class="mode-row" aria-label="Circuit തരം">
        <button type="button" data-control="parallel-mode" id="parallel-mode" aria-pressed="true">Parallel</button>
        <button type="button" data-control="series-mode" id="series-mode" aria-pressed="false">Series</button>
      </div>

      <div class="field">
        <label for="r1">മുകളിലെ resistance <span data-text="label">R₁ = </span><output id="r1-value" for="r1" data-text="label">12 Ω</output></label>
        <input type="range" id="r1" data-control="resistance-r1" min="0.5" max="60" step="0.5" value="12">
        <div class="range-ends"><span data-text="label">0.5 Ω</span><span data-text="label">60 Ω</span></div>
      </div>
      <div class="field">
        <label for="r2">താഴെയുള്ള resistance <span data-text="label">R₂ = </span><output id="r2-value" for="r2" data-text="label">6 Ω</output></label>
        <input type="range" id="r2" data-control="resistance-r2" min="0.5" max="60" step="0.5" value="6">
        <div class="range-ends"><span data-text="label">0.5 Ω</span><span data-text="label">60 Ω</span></div>
      </div>
      <p id="phase" class="full">ഘട്ടം 1: പ്രവചനം</p>
      <button type="button" id="reset" data-control="new-prediction" class="full">പുതിയ പ്രവചനം തുടങ്ങൂ</button>
    </div>

    <div data-role="prediction">
      <h2>R₂-യിലെ current എന്താകും?</h2>
      <p id="question" data-text="label">R₂ = 6 Ω ആയി നിലനിർത്തുന്നു. R₁ മാത്രം 6 Ω → 12 Ω ആക്കിയാൽ, R₂-യിലെ current I₂ എങ്ങനെ മാറും?</p>
      <label for="prediction-choice">എന്റെ പ്രവചനം:</label>
      <select id="prediction-choice" data-control="prediction-choice">
        <option value="">ഒന്ന് തിരഞ്ഞെടുക്കൂ…</option>
        <option value="up">കൂടും</option>
        <option value="same">മാറില്ല</option>
        <option value="down">കുറയും</option>
      </select>
      <button type="button" id="commit" data-control="commit-prediction" class="full" disabled>ഉറപ്പിച്ച് ഫലം കാണൂ</button>
      <p id="prediction-status" role="status">തിരഞ്ഞെടുത്ത ശേഷം ഉറപ്പിക്കൂ. അതുവരെ ഫലം മറച്ചിരിക്കും.</p>
    </div>

    <div data-role="reveal" id="reveal" hidden>
      <h2>പ്രവചനത്തിന്റെ ഫലം</h2>
      <p id="feedback" role="status" data-text="label"></p>
      <p id="snapshot" data-text="label"></p>

      <details class="responsive-details" open>
        <summary data-control="prediction-reasoning">എന്തുകൊണ്ട്?</summary>
        <p id="reason"></p>
      </details>

      <button type="button" id="hint-button" data-control="request-hint" class="full" aria-expanded="false" aria-controls="hint">ഒരു സൂചന വേണം</button>
      <p id="hint" hidden></p>

      <div class="readouts" aria-label="ഇപ്പോഴത്തെ current, voltage അളവുകൾ">
        <h2>ഇപ്പോൾ: Live അളവുകൾ</h2>
        <p id="live-settings" data-text="label"></p>
        <div class="readout-row">
          <strong data-text="label">മുകളിൽ • R₁</strong>
          <span id="i1-value" data-text="label"></span>
          <span id="v1-value" data-text="label"></span>
        </div>
        <div class="readout-row">
          <strong data-text="label">താഴെ • R₂</strong>
          <span id="i2-value" data-text="label"></span>
          <span id="v2-value" data-text="label"></span>
        </div>
        <div class="readout-row">
          <strong>Battery / മൊത്തം</strong>
          <span id="total-value" data-text="label"></span>
          <span data-text="label">V = 12 V</span>
          <span id="equivalent-value" data-text="label"></span>
        </div>
        <p class="equation" id="live-law" data-text="label"></p>
      </div>
      <p>ഇനി sliders നീക്കൂ: അളവുകളും current അമ്പുകളും ഉടൻ മാറും. മുകളിലെ പ്രവചനഫലം ആദ്യ പരീക്ഷണത്തിന്റേതായി തുടരും.</p>
    </div>

    <div data-role="explanation">
      <details class="responsive-details" open>
        <summary data-control="learning-guide">ചെയ്യേണ്ടത് / ആശയം</summary>
        <p>ആദ്യം ഒരു circuit തിരഞ്ഞെടുക്കൂ. Sliders ഉപയോഗിച്ച് resistances നിശ്ചയിക്കൂ. ചോദ്യത്തിൽ പറഞ്ഞ മാറ്റത്തിനുള്ള പ്രവചനം തിരഞ്ഞെടുക്കുകയും ഉറപ്പിക്കുകയും ചെയ്യൂ.</p>
        <p>ഫലം കണ്ടശേഷം R₂ മാറ്റാതെ R₁ നീക്കൂ. പിന്നെ R₁ മാറ്റാതെ R₂ നീക്കൂ. മറ്റേ circuit-ലും പ്രവചിച്ച് വ്യത്യാസം കണ്ടെത്തൂ.</p>

        <div id="concept" hidden>
          <p><strong>Ohm’s law:</strong> ഒരു resistor-ലെ current, അതിന്റെ രണ്ടറ്റത്തുമുള്ള വോൾട്ടേജിനെയും resistance-നെയും ആശ്രയിക്കുന്നു.</p>
          <p class="equation" data-text="label">I = V/R • I: A, V: V, R: Ω</p>
          <p><strong>Series:</strong> current-ന് ഒരേയൊരു പാത. രണ്ടു resistors-ലും ഒരേ current; battery വോൾട്ടേജ് അവയ്ക്കിടയിൽ വിഭജിക്കപ്പെടുന്നു.</p>
          <p class="equation" data-text="label">R = R₁ + R₂<br>I = I₁ = I₂<br>V = V₁ + V₂</p>
          <p><strong>Parallel:</strong> ഓരോ branch-ഉം battery-യുടെ അതേ രണ്ട് terminal-കളിൽ ബന്ധിപ്പിച്ചിരിക്കുന്നു. അതിനാൽ ഓരോ branch-ലും battery വോൾട്ടേജ് ലഭിക്കും. Branch currents ചേർന്നതാണ് battery current.</p>
          <p class="equation" data-text="label">V = V₁ = V₂<br>I₁ = V/R₁ • I₂ = V/R₂<br>I = I₁ + I₂<br>1/R = 1/R₁ + 1/R₂</p>
          <p>Parallel-ൽ ഒരു branch-ന്റെ resistance കൂട്ടുമ്പോൾ ആ branch-ലെ current കുറയും. മറ്റേ branch-ലെ current മാറില്ല; battery നൽകുന്ന മൊത്തം current ആണ് മാറുന്നത്. Battery current സ്ഥിരമാണെന്ന് കരുതരുത്.</p>
        </div>

        <p>ഇത് ideal model ആണ്: battery വോൾട്ടേജ് സ്ഥിരം; wire resistance-ഉം battery internal resistance-ഉം അവഗണിക്കുന്നു. Sliders പൂജ്യത്തിൽ എത്തില്ല; short circuit ഇവിടെ കാണിക്കുന്നില്ല.</p>
        <p>ഇത് screen-ലെ പരീക്ഷണം മാത്രം. വീട്ടിലെ mains supply-യിൽ പരീക്ഷിക്കരുത്. ഈ ഫയൽ offline-ൽ പ്രവർത്തിക്കും; വിവരങ്ങൾ ശേഖരിക്കുകയോ അയയ്ക്കുകയോ ചെയ്യുന്നില്ല.</p>
      </details>
    </div>
    <noscript>ഈ simulation പ്രവർത്തിക്കാൻ browser-ൽ JavaScript അനുവദിക്കണം. Internet ആവശ്യമില്ല.</noscript>
  </section>
</main>

<script>
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  var mode = 'parallel';
  var committed = false;
  var r1 = el('r1');
  var r2 = el('r2');
  var choice = el('prediction-choice');
  var commit = el('commit');
  var reveal = el('reveal');
  var projection = window.matchMedia('(min-width: 900px)');

  function resistance(value) {
    return Number(value).toFixed(1).replace(/\\.0$/, '');
  }

  function measure(value) {
    return Number(value).toFixed(2);
  }

  function model(a, b) {
    var i1, i2, v1, v2, total, eq;
    if (mode === 'parallel') {
      i1 = 12 / a;
      i2 = 12 / b;
      v1 = 12;
      v2 = 12;
      total = i1 + i2;
      eq = 1 / (1 / a + 1 / b);
    } else {
      total = 12 / (a + b);
      i1 = total;
      i2 = total;
      v1 = total * a;
      v2 = total * b;
      eq = a + b;
    }
    return { i1: i1, i2: i2, v1: v1, v2: v2, total: total, eq: eq };
  }

  function setInstructionDensity() {
    var sections = document.querySelectorAll('.responsive-details');
    for (var i = 0; i < sections.length; i++) {
      sections[i].open = !projection.matches;
    }
  }

  function updateInputs() {
    var a = Number(r1.value);
    var b = Number(r2.value);
    el('r1-value').textContent = resistance(a) + ' Ω';
    el('r2-value').textContent = resistance(b) + ' Ω';
    r1.setAttribute('aria-valuetext', resistance(a) + ' Ω');
    r2.setAttribute('aria-valuetext', resistance(b) + ' Ω');
    if (!committed) {
      el('question').textContent = 'R₂ = ' + resistance(b) +
        ' Ω ആയി നിലനിർത്തുന്നു. R₁ മാത്രം 6 Ω → ' +
        resistance(a) + ' Ω ആക്കിയാൽ, R₂-യിലെ current I₂ എങ്ങനെ മാറും?';
      commit.disabled = !choice.value;
    }
  }

  function drawMode() {
    var parallel = mode === 'parallel';
    el('parallel-wires').style.display = parallel ? '' : 'none';
    el('series-wires').style.display = parallel ? 'none' : '';
    el('diagram').className = parallel ? 'diagram' : 'diagram series';
    el('scene-title').textContent = parallel ? 'Parallel circuit' : 'Series circuit';
    el('svg-title').textContent = 'രണ്ട് resistors ഉള്ള ' + (parallel ? 'Parallel' : 'Series') + ' circuit';
    el('svg-description').textContent = parallel ?
      'R₁ മുകളിലെ branch-ലും R₂ താഴെയുള്ള branch-ലും. രണ്ട് branches-ഉം battery-യുടെ രണ്ട് terminal-കളിൽ ബന്ധിപ്പിച്ചിരിക്കുന്നു.' :
      'R₁ മുകളിലും R₂ താഴെയും ഒരേ അടഞ്ഞ പാതയിൽ battery-യുമായി ബന്ധിപ്പിച്ചിരിക്കുന്നു.';
    el('parallel-mode').setAttribute('aria-pressed', parallel ? 'true' : 'false');
    el('series-mode').setAttribute('aria-pressed', parallel ? 'false' : 'true');
    el('arrow2-head').setAttribute('d', parallel ?
      'M468 331 L483 343 L468 355' : 'M417 331 L402 343 L417 355');
  }

  function updateLive() {
    if (!committed) { return; }
    var a = Number(r1.value);
    var b = Number(r2.value);
    var m = model(a, b);
    el('live-settings').textContent = 'R₁ = ' + resistance(a) + ' Ω • R₂ = ' + resistance(b) + ' Ω';
    el('i1-value').textContent = 'I₁ = ' + measure(m.i1) + ' A';
    el('i2-value').textContent = 'I₂ = ' + measure(m.i2) + ' A';
    el('v1-value').textContent = 'V₁ = ' + measure(m.v1) + ' V';
    el('v2-value').textContent = 'V₂ = ' + measure(m.v2) + ' V';
    el('total-value').textContent = 'I = ' + measure(m.total) + ' A';
    el('equivalent-value').textContent = 'R = ' + measure(m.eq) + ' Ω';
    el('live-law').textContent = mode === 'parallel' ?
      'I = I₁ + I₂ = ' + measure(m.i1) + ' A + ' + measure(m.i2) + ' A ≈ ' + measure(m.total) + ' A' :
      'V = V₁ + V₂ = ' + measure(m.v1) + ' V + ' + measure(m.v2) + ' V ≈ 12 V';
    /* Identical bounded mapping for both arrows; numeric values remain authoritative. */
    el('arrow1').style.strokeWidth = (3 + 2.3 * Math.log(1 + m.i1)) + 'px';
    el('arrow2').style.strokeWidth = (3 + 2.3 * Math.log(1 + m.i2)) + 'px';
  }

  function lockOutcome() {
    committed = false;
    reveal.hidden = true;
    el('concept').hidden = true;
    el('current-arrows').style.display = 'none';
    el('hint').hidden = true;
    el('hint-button').setAttribute('aria-expanded', 'false');
    choice.disabled = false;
    choice.value = '';
    commit.disabled = true;
    el('feedback').textContent = '';
    el('snapshot').textContent = '';
    el('reason').textContent = '';
    el('hint').textContent = '';
    el('phase').textContent = 'ഘട്ടം 1: പ്രവചനം';
    el('prediction-status').textContent = 'തിരഞ്ഞെടുത്ത ശേഷം ഉറപ്പിക്കൂ. അതുവരെ ഫലം മറച്ചിരിക്കും.';
    el('scene-status').textContent = 'ആദ്യം പ്രവചിക്കൂ; പിന്നെ current കാണാം.';
    el('arrow-note').textContent = 'R₁ മുകളിൽ • R₂ താഴെ. Battery വോൾട്ടേജ് സ്ഥിരമാണ്.';
    updateInputs();
  }

  function changeMode(next) {
    if (mode === next) { return; }
    mode = next;
    drawMode();
    lockOutcome();
  }

  el('parallel-mode').addEventListener('click', function () { changeMode('parallel'); });
  el('series-mode').addEventListener('click', function () { changeMode('series'); });

  function onSlider() {
    if (!committed) {
      choice.value = '';
      el('prediction-status').textContent = 'സജ്ജീകരണം മാറി. ഈ ചോദ്യത്തിനുള്ള പ്രവചനം തിരഞ്ഞെടുക്കൂ.';
    }
    updateInputs();
    updateLive();
  }

  r1.addEventListener('input', onSlider);
  r2.addEventListener('input', onSlider);
  choice.addEventListener('change', function () {
    commit.disabled = committed || !choice.value;
  });

  commit.addEventListener('click', function () {
    if (committed || !choice.value) { return; }
    var a = Number(r1.value);
    var b = Number(r2.value);
    var before = model(6, b);
    var after = model(a, b);
    var expected = Math.abs(after.i2 - before.i2) < 0.0000001 ?
      'same' : (after.i2 > before.i2 ? 'up' : 'down');
    var words = { up: 'കൂടും', same: 'മാറില്ല', down: 'കുറയും' };
    var correct = choice.value === expected;

    committed = true;
    choice.disabled = true;
    commit.disabled = true;

    el('feedback').className = correct ? 'correct' : 'incorrect';
    el('feedback').textContent =
      'കണ്ടത്: I₂ = ' + measure(before.i2) + ' A → ' + measure(after.i2) +
      ' A. ' + (correct ? '✓ പ്രവചനം ശരി: ' : '✗ പ്രവചനം പൊരുത്തപ്പെട്ടില്ല: ') +
      'നിങ്ങൾ “' + words[choice.value] + '” എന്ന് തിരഞ്ഞെടുത്തു; ഫലം “' + words[expected] + '”.';

    el('snapshot').textContent = 'ഉറപ്പിച്ച പരീക്ഷണം: ' +
      (mode === 'parallel' ? 'Parallel' : 'Series') +
      ' • R₁: 6 Ω → ' + resistance(a) + ' Ω • R₂: ' + resistance(b) + ' Ω (സ്ഥിരം).';

    if (mode === 'parallel') {
      el('reason').textContent = 'Parallel-ൽ R₂-യുടെ രണ്ടറ്റത്തുമുള്ള വോൾട്ടേജ് battery വോൾട്ടേജ് തന്നെയാണ്. R₂-യും ഈ വോൾട്ടേജും മാറ്റിയിട്ടില്ല. അതിനാൽ I₂ മാറില്ല. R₁ മാറ്റുമ്പോൾ I₁-ഉം battery നൽകുന്ന മൊത്തം current-ഉം മാറാം.';
    } else if (a === 6) {
      el('reason').textContent = 'R₁-ന്റെ തുടക്കത്തിലെയും അവസാനത്തിലെയും resistance ഒരുപോലെയാണ്. R₂-യും മാറിയിട്ടില്ല. അതിനാൽ മൊത്തം resistance-ഉം ഒരേ പാതയിലൂടെ ഒഴുകുന്ന current-ഉം മാറില്ല.';
    } else {
      el('reason').textContent = 'Series-ൽ രണ്ട് resistors-ഉം ഒരേ പാതയിലാണ്; I₁ = I₂. R₁ ' +
        (a > 6 ? 'കൂട്ടിയപ്പോൾ മൊത്തം resistance കൂടി. സ്ഥിര battery വോൾട്ടേജിൽ current കുറഞ്ഞു.' :
          'കുറച്ചപ്പോൾ മൊത്തം resistance കുറഞ്ഞു. സ്ഥിര battery വോൾട്ടേജിൽ current കൂടി.') +
        ' അതിനാൽ R₂ മാറ്റിയില്ലെങ്കിലും അതിലൂടെ ഒഴുകുന്ന current മാറി.';
    }

    el('reason').setAttribute('data-text', 'label');
    el('concept').hidden = false;
    reveal.hidden = false;
    el('current-arrows').style.display = '';
    el('phase').textContent = 'ഘട്ടം 2: sliders നീക്കി അന്വേഷിക്കൂ';
    el('prediction-status').textContent = 'പ്രവചനം ഉറപ്പിച്ചു. താഴെ ഫലവും കാരണവും കാണാം.';
    el('scene-status').textContent = 'Live circuit • sliders നീക്കി നോക്കൂ';
    el('arrow-note').textContent = 'അമ്പ്: conventional current-ന്റെ ദിശ. കട്ടിയേറിയ അമ്പ് കൂടുതൽ current സൂചിപ്പിക്കുന്നു; കൃത്യമായ അളവ് Live പാനലിൽ. അളവുകൾ രണ്ട് decimal സ്ഥാനങ്ങളിലേക്ക് round ചെയ്തവയാണ്.';
    updateLive();
  });

  el('hint-button').addEventListener('click', function () {
    if (!committed) { return; }
    var open = el('hint').hidden;
    if (open) {
      el('hint').textContent = mode === 'parallel' ?
        'R₂-യുടെ രണ്ട് അറ്റങ്ങളിൽനിന്നും wires പിന്തുടരൂ. രണ്ടും battery terminal-കളിലേക്കാണോ എത്തുന്നത്? അപ്പോൾ R₂-യിലെ വോൾട്ടേജ് മാറേണ്ടതുണ്ടോ?' :
        'Battery-യിൽനിന്ന് പുറപ്പെട്ട current-ന് R₂ ഒഴിവാക്കി മടങ്ങാൻ മറ്റൊരു പാതയുണ്ടോ? മൊത്തം resistance മാറ്റിയാൽ ഒരേയൊരു പാതയിലെ current എന്താകും?';
    }
    el('hint').hidden = !open;
    el('hint-button').setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  el('reset').addEventListener('click', function () {
    r1.value = '12';
    r2.value = '6';
    lockOutcome();
  });

  if (projection.addEventListener) {
    projection.addEventListener('change', setInstructionDensity);
  } else {
    projection.addListener(setInstructionDensity);
  }

  drawMode();
  updateInputs();
  setInstructionDensity();
}());
</script>
</body>
</html>`;
