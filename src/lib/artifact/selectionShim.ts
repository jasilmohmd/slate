/**
 * Correction by pointing (§5 step 3), parent-side half in `page.tsx`.
 *
 * The teacher-facing preview iframe stays at `sandbox="allow-scripts"` —
 * deliberately WITHOUT `allow-same-origin`, unlike the throwaway
 * measurement iframe in `verification/tier1.ts`. Granting same-origin here
 * would let the generated artifact's own script reach into the builder
 * page, and it is not needed: `postMessage` works across an opaque origin.
 *
 * Reporting the click from inside the artifact is also more correct than
 * hit-testing from outside. Artifacts scale their scene through a viewBox,
 * so a listener on the real DOM node resolves the right element at any
 * scale, whereas `elementFromPoint` from the parent would have to redo the
 * artifact's own coordinate maths.
 *
 * Mirrors `injectErrorShim`'s injection strategy. The shim's own script is
 * written in the same conservative style the generation prompt imposes on
 * artifacts (plain `var`/`function`, no template literals) so it never
 * out-modernises the document it is injected into.
 */

const SELECTION_SHIM = `<script>(function () {
  var active = false;
  var box = null;
  var current = null;

  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.setAttribute('data-slate-highlight', '');
    box.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:2147483647',
      'border:3px solid #d9534f',
      'border-radius:4px',
      'box-shadow:0 0 0 3px rgba(255,255,255,.75)',
      'display:none'
    ].join(';');
    document.body.appendChild(box);
    return box;
  }

  function place(el) {
    var b = ensureBox();
    if (!el) { b.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    b.style.display = 'block';
    b.style.left = (r.left - 3) + 'px';
    b.style.top = (r.top - 3) + 'px';
    b.style.width = r.width + 'px';
    b.style.height = r.height + 'px';
  }

  // The label describes what the teacher actually tapped, so it is derived
  // from the original event target first. Deriving it from the resolved
  // container instead picks up whichever [data-text="label"] happens to
  // come first in the subtree — reporting "R1" for a tap on the heading.
  function labelFor(el, target) {
    var t = target && target.nodeType === 1 ? target : el;
    var text = '';

    if (t.getAttribute && t.getAttribute('data-text') === 'label') text = t.textContent;
    if (!text && t.getAttribute) text = t.getAttribute('aria-label') || '';
    if (!text && t.id) {
      var tied = document.querySelector('label[for="' + t.id + '"]');
      if (tied) text = tied.textContent;
    }
    if (!text) text = t.textContent || '';

    // Fall back to something that names the container: its heading first,
    // then any label inside it.
    if (!String(text).trim()) {
      var heading = el.querySelector('h1, h2, h3, legend, summary');
      if (heading) text = heading.textContent;
    }
    if (!String(text).trim()) {
      var anyLabel = el.querySelector('[data-text="label"]');
      if (anyLabel) text = anyLabel.textContent;
    }

    text = String(text).replace(/\\s+/g, ' ').trim();
    return text.slice(0, 120);
  }

  function resolve(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.hasAttribute('data-slate-highlight')) return null;
    return node.closest('[data-control]') || node.closest('[data-role]');
  }

  function report(el, target) {
    var r = el.getBoundingClientRect();
    parent.postMessage({
      type: 'slate-select',
      controlId: el.getAttribute('data-control'),
      role: el.getAttribute('data-role') || (el.closest('[data-role]') ? el.closest('[data-role]').getAttribute('data-role') : null),
      label: labelFor(el, target),
      elementSnippet: String(el.outerHTML || '').slice(0, 400),
      rect: { x: r.left, y: r.top, width: r.width, height: r.height }
    }, '*');
  }

  // Capture phase, and on pointerdown rather than click: preventing the
  // default there is what stops a range input being dragged while the
  // teacher is only trying to point at it.
  function intercept(e) {
    if (!active) return;
    var el = resolve(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'pointerdown' || e.type === 'click') {
      current = el;
      place(el);
      report(el, e.target);
    }
  }

  document.addEventListener('pointerdown', intercept, true);
  document.addEventListener('click', intercept, true);
  document.addEventListener('keydown', function (e) {
    if (active && (e.key === 'Enter' || e.key === ' ')) intercept(e);
  }, true);

  function reposition() { if (active && current) place(current); }
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.type !== 'slate-select-mode') return;
    active = !!data.on;
    document.documentElement.style.cursor = active ? 'crosshair' : '';
    if (!active) { current = null; place(null); }
  });
}());</script>`;

export function injectSelectionShim(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + SELECTION_SHIM);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => m + SELECTION_SHIM);
  }
  return SELECTION_SHIM + html;
}
