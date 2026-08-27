/* ════════════════════════════════════════════════════════════════════
 * presentation-enhance.js — Excelra Drug Discovery Course
 * Loaded by every Module N.html (right before </body>).
 *
 * 1. STRICT FORWARD LOCK
 *    While a learner sits at their furthest-reached section (the
 *    "frontier"), every MANUAL forward input is blocked:
 *      • the Next button,
 *      • the ArrowRight key,
 *      • dragging / clicking the progress bar forward.
 *    The current section must play out — auto-advance is the only way
 *    the frontier moves. Backward navigation is never blocked, and on
 *    replays (behind the frontier) skipping within already-watched
 *    sections stays free. This runs BESIDE the module's own
 *    maxSectionReached guard (which remains fully intact) and closes
 *    the last gap: skipping forward through the section you are
 *    currently supposed to be watching.
 *
 * 2. Richer "locked" hint — a lock-icon pill that explains WHY the
 *    button did nothing, instead of a bare text flash.
 *
 * 3. AVATAR MOTION ENRICHMENT — the Doctor avatar already repositions
 *    per slide type; this adds index-based variety (so consecutive
 *    content slides alternate corners), a gesture pulse each time a
 *    new narration segment starts, and a soft pulse when a new slide
 *    appears — making the guide feel like it is actively presenting.
 * ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────
   * Guard: this file shares the page's global scope with the module's
   * own inline script (that is how it reads currentSection,
   * maxSectionReached, slides, etc. — the avatar script already relies
   * on exactly this). If anything is unexpectedly missing, degrade
   * silently: never break the presentation itself.
   * ────────────────────────────────────────────────────────────────── */
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 1 + 2. STRICT FORWARD LOCK + enhanced hint
   * ══════════════════════════════════════════════════════════════════ */

  function cs() { try { return currentSection; } catch (e) { return 0; } }
  function msr() { try { return maxSectionReached; } catch (e) { return 0; } }
  function ts() { try { return totalSections; } catch (e) { return 1; } }

  // May the learner manually move to `target`?
  //   backward            → always allowed
  //   forward, past       → always blocked
  //   forward, within     → allowed only when NOT at the frontier
  //                           (i.e. replaying already-watched material)
  function manualForwardBlocked(target) {
    try {
      if (target <= cs()) return false;
      if (target > msr()) return true;
      return cs() >= msr(); // sitting at the frontier → must watch
    } catch (e) {
      return false;
    }
  }

  // Section index a pointer x-position maps to (same math as the
  // module's own scrub code — kept local so it can't drift).
  function sectionFromClientX(clientX) {
    try {
      var track = document.getElementById('progressTrack');
      if (!track) return null;
      var rect = track.getBoundingClientRect();
      if (!rect.width) return null;
      var pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(pct * (ts() - 1));
    } catch (e) {
      return null;
    }
  }

  // ── Enhanced lock hint pill ────────────────────────────────────────
  var lockHintTimer = null;
  function showLockHint(customText) {
    try {
      var old = document.getElementById('penhLockHint');
      if (old) old.remove();
      clearTimeout(lockHintTimer);

      var total = ts();
      var cur = cs() + 1;
      var text = customText ||
        ('Watch this section to unlock the next \u2014 section ' + cur + ' of ' + total);

      var pill = document.createElement('div');
      pill.className = 'penh-lock-hint';
      pill.id = 'penhLockHint';
      pill.innerHTML =
        '<span class="plh-ico"><svg viewBox="0 0 24 24"><path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2zm-8-2a3 3 0 0 1 6 0v2H9V7z"/></svg></span>' +
        '<span>' + text + '</span>';
      document.body.appendChild(pill);
      requestAnimationFrame(function () { pill.classList.add('show'); });
      lockHintTimer = setTimeout(function () {
        pill.classList.remove('show');
        setTimeout(function () { if (pill.parentNode) pill.remove(); }, 300);
      }, 2400);
    } catch (e) {}
  }

  function nudgeNextButton() {
    try {
      var btn = document.getElementById('btnNext');
      if (!btn) return;
      btn.classList.remove('penh-blocked');
      // force reflow so the shake animation restarts
      void btn.offsetWidth;
      btn.classList.add('penh-blocked');
      setTimeout(function () { btn.classList.remove('penh-blocked'); }, 500);
    } catch (e) {}
  }

  function blockForwardFeedback(target) {
    if (target >= ts() - 1 && cs() >= ts() - 1) {
      showLockHint('Final section \u2014 let the outro finish to complete the module');
    } else {
      showLockHint();
    }
    nudgeNextButton();
  }

  // ── Interception: Next button (capture-phase click) ────────────────
  document.addEventListener('click', function (e) {
    try {
      var btn = e.target && e.target.closest ? e.target.closest('#btnNext') : null;
      if (!btn) return;
      if (manualForwardBlocked(cs() + 1)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        blockForwardFeedback(cs() + 1);
      }
    } catch (err) {}
  }, true);

  // ── Interception: ArrowRight key (capture-phase keydown) ───────────
  document.addEventListener('keydown', function (e) {
    try {
      if (e.code !== 'ArrowRight') return;
      if (manualForwardBlocked(cs() + 1)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        blockForwardFeedback(cs() + 1);
      }
    } catch (err) {}
  }, true);

  // ── Interception: progress-bar scrub (capture-phase pointer events) ─
  // The module's own scrub code already clamps to maxSectionReached; this
  // adds the frontier rule + the rich hint, and stops the drag before it
  // begins when the pointer starts on a blocked forward position.
  ['mousedown', 'touchstart', 'click'].forEach(function (evtName) {
    document.addEventListener(evtName, function (e) {
      try {
        var track = e.target && e.target.closest ? e.target.closest('#progressTrack') : null;
        if (!track) return;
        var x = (evtName === 'touchstart' && e.touches && e.touches.length)
          ? e.touches[0].clientX : e.clientX;
        if (x === undefined || x === null) return;
        var target = sectionFromClientX(x);
        if (target !== null && manualForwardBlocked(target)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          blockForwardFeedback(target);
        }
      } catch (err) {}
    }, { capture: true, passive: false });
  });

  // Give the module's own hint function the upgraded UI too, so any
  // internal call (e.g. its scrub-clamp path) shows the nice pill.
  try {
    if (typeof window.showSeekBlockedHint === 'function') {
      window.showSeekBlockedHint = function () { showLockHint(); };
    }
  } catch (e) {}

  /* ══════════════════════════════════════════════════════════════════
   * 3. AVATAR MOTION ENRICHMENT
   * ══════════════════════════════════════════════════════════════════ */
  ready(function () {
    try {
      var AV = window.__doctorAvatar;
      if (!AV) return;

      var POS_CLASSES = ['pos-bottom-right', 'pos-bottom-left', 'pos-left-center', 'pos-right-center', 'pos-top-right'];
      var GESTURE_CLASSES = ['gesture-point-right', 'gesture-point-left', 'gesture-welcome'];

      function rawSetPosition(posClass) {
        var av = document.getElementById('moduleAvatar');
        if (!av) return;
        POS_CLASSES.forEach(function (c) { av.classList.remove(c); });
        av.classList.add(posClass);
      }
      function rawSetGesture(gestureClass) {
        var av = document.getElementById('moduleAvatar');
        if (!av) return;
        GESTURE_CLASSES.forEach(function (c) { av.classList.remove(c); });
        if (gestureClass) av.classList.add(gestureClass);
      }
      function currentPos() {
        var av = document.getElementById('moduleAvatar');
        if (!av) return 'pos-bottom-right';
        for (var i = 0; i < POS_CLASSES.length; i++) {
          if (av.classList.contains(POS_CLASSES[i])) return POS_CLASSES[i];
        }
        return 'pos-bottom-right';
      }

      // Slide-entry variety: alternate the avatar's corner/side per slide
      // index so it visibly travels around the stage as the deck
      // progresses, instead of standing in the same two spots.
      var origOnSlideEnter = AV.onSlideEnter;
      AV.onSlideEnter = function (slideType) {
        if (origOnSlideEnter) origOnSlideEnter.call(AV, slideType);
        try {
          var idx = 0;
          try { idx = currentSlide || 0; } catch (e) {}
          var pos;
          switch (slideType) {
            case 'title':
            case 'closing':
              pos = (idx % 2 === 0) ? 'pos-bottom-right' : 'pos-bottom-left';
              break;
            case 'concept':
            case 'diagram':
              // stand beside the diagram, alternating sides
              pos = (idx % 2 === 0) ? 'pos-left-center' : 'pos-right-center';
              break;
            case 'summary':
              pos = 'pos-right-center';
              break;
            default:
              pos = (idx % 2 === 0) ? 'pos-bottom-right' : 'pos-bottom-left';
          }
          rawSetPosition(pos);
          rawSetGesture(slideType === 'title' || slideType === 'closing' ? 'gesture-welcome' : null);
          // soft arrival pulse
          var av = document.getElementById('moduleAvatar');
          if (av) {
            av.classList.remove('penh-pulse');
            void av.offsetWidth;
            av.classList.add('penh-pulse');
            setTimeout(function () { av.classList.remove('penh-pulse'); }, 600);
          }
        } catch (e) {}
      };

      // Segment gesture pulse: each time a narration segment begins, the
      // avatar gestures toward the content it is describing — alternating
      // with a neutral stance so the motion reads as natural emphasis.
      var origShowSegment = window.showSegment;
      if (typeof origShowSegment === 'function') {
        window.showSegment = function (i) {
          var r = origShowSegment.apply(this, arguments);
          try {
            var pos = currentPos();
            var onLeft = pos === 'pos-left-center' || pos === 'pos-bottom-left';
            // gesture toward the slide content, then relax
            rawSetGesture(i % 2 === 0 ? (onLeft ? 'gesture-point-right' : 'gesture-point-left') : null);
          } catch (e) {}
          return r;
        };
      }
    } catch (e) {}
  });

})();
