// Tier 1 verification (§4). Runs entirely client-side, in the teacher's
// own browser — never on the server (AGENTS.md). Static checks (DOM
// contract, external refs, size, language) run first and short-circuit
// the rest on a contract failure, since a contract failure makes every
// later check meaningless (§4). Dynamic checks load the artifact into a
// hidden, off-screen sandboxed iframe once, then resize that SAME iframe
// through the three target viewports without reloading it.

export type CheckResult = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type Tier1Result = {
  passed: boolean;
  checks: CheckResult[];
};

const REQUIRED_ROLES = [
  "meta",
  "artifact",
  "scene",
  "chrome",
  "controls",
  "prediction",
  "reveal",
  "explanation",
] as const;

const VIEWPORTS = [
  { id: "360x640", label: "360×640", width: 360, height: 640 },
  { id: "1024x768", label: "1024×768", width: 1024, height: 768 },
  { id: "1920x1080", label: "1920×1080", width: 1920, height: 1080 },
] as const;

const MAX_BYTES = 2 * 1024 * 1024;
const MALAYALAM_RANGE = /[ഀ-ൿ]/;

function checkStructure(doc: Document): CheckResult {
  const problems: string[] = [];
  for (const role of REQUIRED_ROLES) {
    const count = doc.querySelectorAll(`[data-role="${role}"]`).length;
    if (count !== 1) problems.push(`data-role="${role}" appears ${count} times`);
  }
  const scene = doc.querySelector('[data-role="scene"]');
  if (scene) {
    const aspect = scene.getAttribute("data-intrinsic-aspect");
    const minAspect = scene.getAttribute("data-min-aspect");
    if (!aspect || Number.isNaN(Number(aspect))) problems.push("scene missing data-intrinsic-aspect");
    if (!minAspect || Number.isNaN(Number(minAspect))) problems.push("scene missing data-min-aspect");
  }
  const reveal = doc.querySelector('[data-role="reveal"]');
  if (reveal && !reveal.hasAttribute("hidden")) {
    problems.push('data-role="reveal" is not hidden on load');
  }
  return {
    id: "structure",
    label: "structure",
    passed: problems.length === 0,
    detail: problems.join("; ") || undefined,
  };
}

function checkOffline(html: string): CheckResult {
  const match = html.match(/https?:\/\/|<link\b|@import\b/i);
  return {
    id: "offline",
    label: "offline",
    passed: !match,
    detail: match ? `found "${match[0]}"` : undefined,
  };
}

function checkSize(html: string): CheckResult {
  const bytes = new TextEncoder().encode(html).length;
  return {
    id: "size",
    label: "size",
    passed: bytes <= MAX_BYTES,
    detail: bytes > MAX_BYTES ? `${(bytes / 1024 / 1024).toFixed(2)}MB, over 2MB` : `${(bytes / 1024).toFixed(0)}KB`,
  };
}

function checkLanguage(doc: Document, language: "ml" | "en"): CheckResult {
  const text = doc.body?.textContent ?? "";
  const meaningful = text.replace(/\s+/g, "");
  const malayalamCount = (meaningful.match(new RegExp(MALAYALAM_RANGE, "g")) ?? []).length;
  const ratio = meaningful.length > 0 ? malayalamCount / meaningful.length : 0;
  const passed = language === "ml" ? ratio >= 0.1 : ratio < 0.05;
  return {
    id: "language",
    label: "language",
    passed,
    detail: `${(ratio * 100).toFixed(0)}% Malayalam characters`,
  };
}

function checkNoHoverOnly(html: string): CheckResult {
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const css = styleBlocks.join("\n");
  const hoverRules = [...css.matchAll(/:hover\s*{([^}]*)}/gi)];
  const suspicious = hoverRules.filter((m) => /display\s*:\s*(?!none)|visibility\s*:\s*visible|opacity\s*:\s*1/i.test(m[1]));
  return {
    id: "no-hover-only",
    label: "no hover-only controls",
    passed: suspicious.length === 0,
    detail: suspicious.length ? `${suspicious.length} :hover rule(s) toggle visibility (heuristic)` : undefined,
  };
}

function runStaticChecks(html: string, language: "ml" | "en"): CheckResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [
    checkStructure(doc),
    checkOffline(html),
    checkSize(html),
    checkLanguage(doc, language),
    checkNoHoverOnly(html),
  ];
}

function injectErrorShim(html: string): string {
  const shim = `<script>window.__slateErrors=[];window.addEventListener('error',function(e){window.__slateErrors.push(e.message||String(e.error));});window.addEventListener('unhandledrejection',function(e){window.__slateErrors.push('unhandledrejection: '+e.reason);});</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + shim);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => m + shim);
  }
  return shim + html;
}

function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = value.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const chan = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function effectiveBackground(win: Window, el: Element): { r: number; g: number; b: number } {
  let node: Element | null = el;
  while (node) {
    const bg = parseColor(win.getComputedStyle(node).backgroundColor);
    if (bg && bg.a > 0) return bg;
    node = node.parentElement;
  }
  return { r: 255, g: 255, b: 255 };
}

function checkContrast(win: Window, doc: Document): CheckResult {
  const candidates = [...doc.querySelectorAll("p, span, h1, h2, h3, label, button, li, td, strong, summary, output")].filter(
    (el) => (el.textContent ?? "").trim().length > 0 && el.getClientRects().length > 0
  );
  const sample = candidates.slice(0, 60);
  let worst = Infinity;
  let failures = 0;
  for (const el of sample) {
    const style = win.getComputedStyle(el);
    const fg = parseColor(style.color);
    if (!fg) continue;
    const bg = effectiveBackground(win, el);
    const ratio = contrastRatio(fg, bg);
    if (ratio < worst) worst = ratio;
    if (ratio < 4.5) failures++;
  }
  return {
    id: "contrast",
    label: "contrast",
    passed: failures === 0,
    detail: failures ? `${failures}/${sample.length} sampled elements below 4.5:1 (worst ${worst.toFixed(1)}:1)` : undefined,
  };
}

function checkOverflow(doc: Document): CheckResult {
  const html = doc.documentElement;
  const overflowing = html.scrollWidth > html.clientWidth + 1;
  return {
    id: "overflow",
    label: "no overflow",
    passed: !overflowing,
    detail: overflowing ? `scrollWidth ${html.scrollWidth} > clientWidth ${html.clientWidth}` : undefined,
  };
}

// §2a: "Reframe, never squash." A container aspect BELOW the scene's
// declared data-min-aspect is not a defect — it is precisely the condition
// that is supposed to trigger reframing, and it happens on every phone in
// portrait. What is checkable, and what the spec actually forbids, is the
// scene being COMPRESSED: the rendered SVG no longer matching its own
// viewBox ratio. data-min-aspect stays part of the §2d contract (its
// presence is checked in checkStructure) and drives the artifact's own
// reframe logic; Tier 1 does not assert against it.
function checkSceneAspect(doc: Document): CheckResult {
  const scene = doc.querySelector('[data-role="scene"]') as HTMLElement | null;
  if (!scene) return { id: "scene-aspect", label: "scene aspect", passed: false, detail: "scene not found" };

  const problems: string[] = [];
  const declaredIntrinsic = Number(scene.getAttribute("data-intrinsic-aspect"));
  const svgs = [...scene.querySelectorAll("svg")];
  let checked = 0;

  for (const svg of svgs) {
    const viewBox = svg.getAttribute("viewBox");
    if (!viewBox) continue;
    const parts = viewBox.trim().split(/[s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) continue;
    const [, , vbWidth, vbHeight] = parts;
    if (vbWidth <= 0 || vbHeight <= 0) continue;

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const intrinsic = vbWidth / vbHeight;
    const rendered = rect.width / rect.height;
    checked++;

    // 5% tolerance absorbs sub-pixel layout rounding without letting a
    // genuinely squashed scene through.
    if (Math.abs(rendered / intrinsic - 1) > 0.05) {
      problems.push(
        `svg rendered ${rendered.toFixed(2)} vs viewBox ${intrinsic.toFixed(2)} (squashed)`
      );
    }

    // §2d requires the declared intrinsic aspect to match the SVG it
    // describes; a wrong value misinforms the artifact's own reframe logic.
    if (
      checked === 1 &&
      Number.isFinite(declaredIntrinsic) &&
      declaredIntrinsic > 0 &&
      Math.abs(declaredIntrinsic / intrinsic - 1) > 0.05
    ) {
      problems.push(
        `data-intrinsic-aspect ${declaredIntrinsic} does not match viewBox ${intrinsic.toFixed(2)}`
      );
    }
  }

  return {
    id: "scene-aspect",
    label: "scene aspect",
    passed: problems.length === 0,
    detail: problems.join("; ") || (checked === 0 ? "no measurable SVG scene" : undefined),
  };
}

function checkProjectionText(win: Window, doc: Document): CheckResult {
  const labels = [...doc.querySelectorAll('[data-text="label"]')];
  const bodySize = parseFloat(win.getComputedStyle(doc.body).fontSize);
  const tooSmall = labels.filter((el) => parseFloat(win.getComputedStyle(el).fontSize) < 27.5);
  const passed = tooSmall.length === 0 && bodySize >= 27.5;
  return {
    id: "projection-text",
    label: "projection text ≥28px",
    passed,
    detail: passed ? undefined : `${tooSmall.length} label(s) below 28px, body ${bodySize.toFixed(0)}px`,
  };
}

function checkProjectionStroke(win: Window, doc: Document): CheckResult {
  const shapes = [...doc.querySelectorAll("svg [vector-effect='non-scaling-stroke'], svg path, svg line, svg rect, svg circle")];
  if (shapes.length === 0) return { id: "projection-stroke", label: "projection stroke ≥3px", passed: true, detail: "no SVG strokes" };
  const tooThin = shapes.filter((el) => {
    const w = parseFloat(win.getComputedStyle(el).strokeWidth || "0");
    return w > 0 && w < 2.9;
  });
  return {
    id: "projection-stroke",
    label: "projection stroke ≥3px",
    passed: tooThin.length === 0,
    detail: tooThin.length ? `${tooThin.length} stroke(s) below 3px` : undefined,
  };
}

function dispatchOnControls(doc: Document) {
  // Tag-name checks, not `instanceof` — these elements belong to the
  // iframe's own realm, and even with allow-same-origin, `instanceof
  // HTMLSelectElement` (the PARENT window's constructor) silently fails
  // across that boundary because each browsing context has its own
  // globals. el.click() is just a method call, so it's realm-agnostic.
  const controls = [...doc.querySelectorAll("[data-control]")];
  for (const el of controls) {
    try {
      const tag = el.tagName;
      if (tag === "SELECT") {
        const select = el as HTMLSelectElement;
        const options = [...select.options].filter((o) => o.value !== "");
        if (options.length) select.value = options[options.length - 1].value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (tag === "INPUT") {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        (el as HTMLElement).click();
      }
    } catch {
      // recorded via the injected window error handler
    }
  }
}

async function nextFrame() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function runTier1(
  html: string,
  language: "ml" | "en",
  onProgress?: (check: CheckResult) => void
): Promise<Tier1Result> {
  const emit = (check: CheckResult) => {
    onProgress?.(check);
    return check;
  };

  const staticChecks = runStaticChecks(html, language).map(emit);
  const structureCheck = staticChecks.find((c) => c.id === "structure");
  if (!structureCheck?.passed) {
    return { passed: false, checks: staticChecks };
  }

  const checks: CheckResult[] = [...staticChecks];
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  iframe.style.cssText = "position:fixed;top:-10000px;left:-10000px;border:0;";
  document.body.appendChild(iframe);

  try {
    const loaded = new Promise<void>((resolve) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
    });
    iframe.style.width = "1024px";
    iframe.style.height = "768px";
    iframe.srcdoc = injectErrorShim(html);
    await loaded;
    await nextFrame();

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) throw new Error("verification iframe did not load");

    dispatchOnControls(doc);
    await nextFrame();

    const errors: string[] = (win as unknown as { __slateErrors?: string[] }).__slateErrors ?? [];
    checks.push(
      emit({
        id: "no-js-errors",
        label: "no script errors",
        passed: errors.length === 0,
        detail: errors.slice(0, 3).join("; ") || undefined,
      })
    );

    const reveal = doc.querySelector('[data-role="reveal"]') as HTMLElement | null;
    checks.push(
      emit({
        id: "prediction-unlocks",
        label: "prediction unlocks",
        passed: !!reveal && !reveal.hidden,
        detail: reveal?.hidden ? "reveal still hidden after exercising controls" : undefined,
      })
    );

    for (const vp of VIEWPORTS) {
      iframe.style.width = `${vp.width}px`;
      iframe.style.height = `${vp.height}px`;
      await nextFrame();

      const vpChecks = [checkOverflow(doc), checkSceneAspect(doc)];
      if (vp.width >= 900) {
        vpChecks.push(checkContrast(win, doc), checkProjectionText(win, doc), checkProjectionStroke(win, doc));
      } else {
        vpChecks.push(checkContrast(win, doc));
      }

      const failed = vpChecks.filter((c) => !c.passed);
      checks.push(
        emit({
          id: `viewport-${vp.id}`,
          label: vp.label,
          passed: failed.length === 0,
          detail: failed.length ? failed.map((c) => `${c.label}: ${c.detail}`).join("; ") : undefined,
        })
      );
    }
  } finally {
    iframe.remove();
  }

  return { passed: checks.every((c) => c.passed), checks };
}
