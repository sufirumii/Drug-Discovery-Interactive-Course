/*
 * Shared narration voice engine for the Excelra Drug Discovery Course.
 *
 * Every Module N.html presentation loads this one file. That means any
 * future tweak to voice selection, warmth, pace, pronunciation, etc. only
 * needs to happen HERE — every module picks it up automatically the next
 * time it's opened, instead of needing 11 separate edits.
 *
 * ONE VOICE, LOCKED IN, REUSED EVERYWHERE
 * ----------------------------------------
 * The narrator used to be re-picked from the browser's live voice list
 * on every single spoken line. That's exactly what caused two visible
 * bugs: the voice could change mid-presentation (Chrome loads its
 * network voices like "Google UK English Female" in asynchronously,
 * a beat after local ones — so the first sentence would grab whatever
 * local voice was available yet, and a later sentence would grab the
 * nicer Google voice the moment it finished loading), and the voice
 * could differ module to module (each Module N.html is a fresh page
 * load, so "pick again" could land on a different candidate each time
 * depending on exactly how far the voice list had loaded at that
 * moment).
 *
 * The fix: decide on ONE voice, once, the first time any module needs
 * to speak — after giving the browser a short grace period to finish
 * populating its voice list, so the decision isn't made prematurely
 * against an incomplete list — and then remember that exact choice
 * (by name, in localStorage) so every subsequent module simply reuses
 * it instead of re-deciding. Nothing changes again after that unless
 * the chosen voice actually proves broken (see below), which is the
 * only case where switching mid-course is actually correct.
 *
 * VOICE CONSISTENCY ACROSS DIFFERENT LAPTOPS/BROWSERS
 * ----------------------------------------
 * Windows and macOS expose completely different local voice engines
 * (SAPI vs. the macOS speech engine), which is exactly why the same
 * course used to sound like a different narrator (sometimes even a
 * different gender) depending on which laptop or browser opened it.
 * The one kind of voice that DOES render byte-for-byte identically on
 * any OS is a network voice — Chrome/Edge/Brave stream the audio from
 * Google's TTS service instead of synthesizing it on-device — so
 * "Google UK English Female" is listed FIRST below and is what should
 * end up narrating on the large majority of machines (any Chromium-
 * based browser, online, on Windows/Mac/Linux/ChromeOS all get this
 * exact same voice). The delivery tuning further down (raised pitch,
 * slightly slower rate) is what keeps this specific voice sounding
 * warm and pleasant rather than flat/robotic.
 *
 * The remaining entries only exist as a fallback for the minority of
 * cases where that first voice genuinely isn't available (offline, or
 * a non-Chromium browser like Firefox/Safari that doesn't expose
 * Google's network voice) — Edge's neural "Online (Natural)" voice,
 * then macOS's Samantha, then a last-resort local Windows voice. Once
 * ANY of these is locked in on a given device it is reused every time
 * (see "ONE VOICE, LOCKED IN" above), so the only way to still see two
 * different voices across two laptops is if one of them can't reach
 * the network voice at all — a limitation of the Web Speech API itself
 * (each browser only exposes the voices actually installed/reachable
 * on that device), not something a page can fully override.
 *
 * Why the female voice sometimes went silent specifically on Mac
 * Chrome: on some Mac + Chrome combinations, Google's network voice
 * request silently fails to produce audio (a long-standing Chromium
 * bug), while the exact same voice works fine on Windows Chrome.
 * Because the failure is silent — no error event, speechSynthesis
 * just never actually speaks — naive code has no way to notice and
 * react.
 *
 * The fix here: speak() verifies a voice actually started producing
 * audio (via the utterance's own onstart/onboundary events) within a
 * short window. If it didn't, that voice is blacklisted (remembered in
 * localStorage) and the narrator re-locks to the next best candidate —
 * still just ONE voice, still reused consistently everywhere from then
 * on, just a different one on whichever device the original pick
 * doesn't actually work on.
 */
(function () {
  const synth = window.speechSynthesis;

  const LOCK_KEY = 'courseNarratorVoiceName';
  const FAILED_VOICES_KEY = 'ttsBrokenVoices';

  // ── One-time migration for devices that already hit the cancel/error
  // bug described above ──────────────────────────────────────────────
  // Before today's fix, an ordinary Pause/Next/Previous/Mute click could
  // get a perfectly good voice wrongly blacklisted (in FAILED_VOICES_KEY)
  // and the course permanently locked onto whatever fallback came next
  // (in LOCK_KEY) — on a real device, that bad state is just sitting in
  // localStorage and the fixed logic below would otherwise keep
  // respecting it forever. This runs once per browser to wipe both keys
  // so the very next resolveVoice() call below makes a completely fresh
  // decision under the corrected rules, then remembers it's done so it
  // never re-wipes a legitimate later blacklist/lock again.
  const MIGRATION_KEY = 'courseNarratorVoiceEngineVersion';
  const CURRENT_ENGINE_VERSION = '2';
  try {
    if (localStorage.getItem(MIGRATION_KEY) !== CURRENT_ENGINE_VERSION) {
      localStorage.removeItem(LOCK_KEY);
      localStorage.removeItem(FAILED_VOICES_KEY);
      localStorage.setItem(MIGRATION_KEY, CURRENT_ENGINE_VERSION);
    }
  } catch (e) {}

  function getFailedVoiceNames() {
    try { return JSON.parse(localStorage.getItem(FAILED_VOICES_KEY)) || []; }
    catch (e) { return []; }
  }
  function markVoiceFailed(name) {
    if (!name) return;
    const failed = getFailedVoiceNames();
    if (failed.indexOf(name) === -1) {
      failed.push(name);
      try { localStorage.setItem(FAILED_VOICES_KEY, JSON.stringify(failed)); } catch (e) {}
    }
    let locked = null;
    try { locked = localStorage.getItem(LOCK_KEY); } catch (e) {}
    if (locked === name) {
      lockedVoice = null;
      try { localStorage.removeItem(LOCK_KEY); } catch (e) {}
    }
  }

  // ONE small, curated shortlist — not a sprawling list of dozens of
  // names. Each entry here covers one major real-world platform/browser
  // case (Windows+Edge, any Chrome/Chromium via the network voice, macOS)
  // so there's still a fallback if the very first choice genuinely isn't
  // installed on a given machine — but every single entry is a definite,
  // well-known, clearly-female voice. Nothing generic, nothing novelty,
  // nothing male, ever.
  const preferredVoices = [
    'Google UK English Female',         // Any Chrome/Chromium, identical on every OS — tried FIRST for consistency
    'Microsoft Aria Online (Natural)',  // Windows + Edge, network voice — fallback if Google's isn't reachable
    'Samantha',                         // macOS / iOS default — fallback for non-Chromium browsers
    'Microsoft Zira'                    // Windows + plain Chrome, no network — last resort
  ];

  // Short, explicit list of common default MALE voice names. This exists
  // purely as a floor: if NONE of the four curated names above exist on a
  // device (rare), this stops the very last "just take whatever's first"
  // fallback from landing on a male voice like "Microsoft David Desktop"
  // (a very common Windows default) or macOS's male "Alex"/"Daniel"/"Fred".
  const AVOID_VOICE_PATTERN = /\b(david|mark|guy|ryan|daniel|james|george|alex|fred|male|man)\b/i;
  const MALE_VOICE_PATTERN = AVOID_VOICE_PATTERN;

  function bestMatch(voices) {
    if (!voices.length) return null;
    const failed = getFailedVoiceNames();
    const usable = voices.filter(v => failed.indexOf(v.name) === -1);
    for (const pref of preferredVoices) {
      const found = usable.find(v => v.name.includes(pref) && v.lang.startsWith('en'));
      if (found) return found;
    }
    const english = usable.filter(v => v.lang.startsWith('en'));
    const englishGood = english.filter(v => !AVOID_VOICE_PATTERN.test(v.name));
    const usableGood = usable.filter(v => !AVOID_VOICE_PATTERN.test(v.name));
    // Only reached if none of the 4 curated names above exist on this
    // device at all — never take a male voice here unless literally
    // nothing else (not even a non-English voice) is available.
    const choice = (
      englishGood.find(v => /female|woman|samantha|karen/i.test(v.name)) ||
      englishGood[0] ||
      usableGood[0] ||
      english[0] || usable[0] || voices[0] || null
    );
    try {
      console.log('[voice-engine] picked:', choice && choice.name, choice && choice.lang,
        '— from', voices.length, 'available voices:', voices.map(v => v.name).join(', '));
    } catch (e) {}
    return choice;
  }

  // Gives the browser a moment to finish populating its voice list
  // before a decision gets locked in — Chrome/Edge frequently report
  // local voices first and add network voices like "Google UK English
  // Female" a beat later. Deciding too early is exactly what used to
  // lock the course onto a lesser local voice unnecessarily.
  function waitForVoices(timeoutMs) {
    return new Promise(resolve => {
      const initial = synth.getVoices();
      if (initial.length) {
        setTimeout(() => resolve(synth.getVoices()), Math.min(400, timeoutMs));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        synth.removeEventListener('voiceschanged', onChange);
        resolve(synth.getVoices());
      }, timeoutMs);
      function onChange() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        synth.removeEventListener('voiceschanged', onChange);
        resolve(synth.getVoices());
      }
      synth.addEventListener('voiceschanged', onChange);
    });
  }

  let lockedVoice = null;
  let resolvingPromise = null;

  // Decides the ONE voice this whole course uses, reusing a prior
  // module's choice (by exact name) whenever one exists rather than
  // re-deciding — that's what keeps every module consistent with the
  // ones before it on the same device.
  //
  // IMPORTANT: a name saved by an older version of this file (before the
  // fallback logic below was tightened up) can already be sitting in
  // localStorage on a returning learner's machine — e.g. "Microsoft David
  // Desktop", picked back when the fallback had no gender check at all.
  // Reusing that saved name forever, unconditionally, is exactly why a
  // logic fix alone wouldn't have changed anything already loaded on a
  // real device: the "ONE VOICE, LOCKED IN" guarantee was working exactly
  // as designed, just locked onto the wrong voice. So a stored name is
  // only reused if it *isn't* one of these known-weak picks; otherwise
  // the lock is discarded and a fresh decision is made (and re-saved),
  // same as if this were a brand-new visitor.
  function isStoredChoiceStillGood(name) {
    if (!name) return false;
    if (MALE_VOICE_PATTERN.test(name)) return false;
    return true;
  }

  function resolveVoice() {
    if (lockedVoice) return Promise.resolve(lockedVoice);
    if (resolvingPromise) return resolvingPromise;

    resolvingPromise = (async () => {
      let storedName = null;
      try { storedName = localStorage.getItem(LOCK_KEY); } catch (e) {}
      const failed = getFailedVoiceNames();

      if (storedName && failed.indexOf(storedName) === -1 && isStoredChoiceStillGood(storedName)) {
        const voices = await waitForVoices(1200);
        const found = voices.find(v => v.name === storedName);
        if (found) {
          lockedVoice = found;
          resolvingPromise = null;
          return lockedVoice;
        }
        // Not available on this device/browser — fall through and
        // decide fresh from what's actually available here.
      }

      const voices = await waitForVoices(1200);
      const choice = bestMatch(voices);
      if (choice) {
        lockedVoice = choice;
        try { localStorage.setItem(LOCK_KEY, choice.name); } catch (e) {}
      }
      resolvingPromise = null;
      return lockedVoice;
    })();

    return resolvingPromise;
  }

  // Re-resolve once the voice list changes shape (e.g. network voices
  // finish loading) ONLY if nothing has been locked in yet — once
  // lockedVoice is set, it's deliberately never swapped out except via
  // the proven-broken path in speak() below.
  synth.addEventListener('voiceschanged', () => {
    if (!lockedVoice) resolveVoice();
  });
  resolveVoice();

  // Shared, tuned delivery settings — softer and slightly slower than
  // a default robotic TTS read, aiming for a warmer, more natural tone.
  // Pitch is nudged up from the voice's default register for a brighter,
  // more pleasant sound (rather than a flat/low robotic read), while
  // staying well short of the point where a raised pitch starts sounding
  // artificial/"chipmunky"; the rate is kept slightly slow for a calmer,
  // less rushed delivery.
  // Change these two numbers here and every module updates together.
  const DELIVERY = {
    rate: 0.94,
    pitch: 1.12
  };

  // ── Pronunciation consistency ────────────────────────────────────
  // Plain SpeechSynthesisUtterance has no SSML support, so the only
  // lever available is respelling text before it's spoken. Left alone,
  // these all-caps industry acronyms get read as an attempted "word"
  // by some voices/OSes and spelled out letter-by-letter by others —
  // which is exactly the "inconsistent pronunciation" learners hit.
  // Forcing every voice to spell them out (by spacing the letters)
  // makes the narration consistent regardless of which voice ends up
  // selected. Acronyms that are already spoken as ordinary words by
  // virtually every TTS engine (ADMET, IC50, FAIR, SEND) are left as-is.
  const SPELL_OUT = [
    'IND', 'EDC', 'CDISC', 'LIMS', 'CFR', 'HL7', 'ELN', 'SDTM', 'HTS',
    'CTMS', 'CDASH', 'GLP', 'FDA', 'SAR', 'SOC', 'ALCOA'
  ];
  const spellOutPattern = new RegExp('\\b(' + SPELL_OUT.join('|') + ')\\b', 'g');

  function preprocessText(text) {
    return text.replace(spellOutPattern, function (match) {
      return match.split('').join(' ');
    });
  }

  // ── Robust speak() with automatic bad-voice fallback ─────────────
  // Modules call this instead of building their own
  // SpeechSynthesisUtterance directly, which is what makes the single
  // locked-in voice (and its Mac/Google-voice fallback) possible
  // without touching all 11 module files every time this needs a tweak.
  //
  // hasFailedOverOnce guards the ONLY case where the voice is allowed to
  // change after being locked in. Two separate bugs used to cause
  // "the narrator changes mid-video/mid-module, sometimes to a
  // different gender", and both are now fixed:
  //
  // 1) The silent-failure check (proofTimer below) used to give a
  //    voice only 1.4s to prove it was producing audio before being
  //    blacklisted — far too tight for a network voice under any real
  //    latency, so a perfectly fine voice could get swapped mid-video.
  //    Fixed with a much more generous 5s window.
  //
  // 2) The bigger one: onerror() used to treat ANY error event as
  //    proof the voice was broken. But every ordinary Pause / Next /
  //    Previous / Mute / Restart click — and every normal auto-advance
  //    from one line to the next — calls synth.cancel() to stop
  //    whatever is currently talking, and cancelling fires this exact
  //    'error' event (reason 'canceled' or 'interrupted'). That's just
  //    routine playback control, not a broken voice — so completely
  //    ordinary use of the player was silently blacklisting a perfectly
  //    working voice and swapping the narrator, repeatedly, throughout
  //    a module. onerror() now only treats a genuine (non-cancellation)
  //    error as proof-of-breakage.
  //
  // On top of both fixes, a hard cap of ONE failover for the entire
  // course still applies — once it has swapped a single time (for an
  // actually broken voice), it never re-evaluates again, so there is no
  // possibility of a second, third, fourth swap cascading through later
  // videos either.
  let hasFailedOverOnce = false;

  function speak(rawText, opts, retriesLeft) {
    opts = opts || {};
    if (retriesLeft === undefined) retriesLeft = 1;
    const text = preprocessText(rawText);

    return new Promise(function (resolve) {
      if (opts.muted || !synth) {
        setTimeout(resolve, opts.fallbackDuration || 0);
        return;
      }

      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }

      resolveVoice().then(function (voice) {
        if (settled) return;

        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        if (voice) utter.voice = voice;
        utter.rate = DELIVERY.rate;
        utter.pitch = DELIVERY.pitch;
        utter.volume = 1;

        let started = false;
        const onProof = function () { started = true; };
        utter.onstart = onProof;
        utter.onboundary = onProof;

        // Only ever fires the fallback path once, ever, for the whole
        // course (see hasFailedOverOnce above) — and only after a
        // genuinely generous 5-second silent window, not a hair-trigger
        // 1.4s one, to avoid mistaking ordinary network latency for a
        // truly broken voice.
        const proofTimer = setTimeout(function () {
          if (started || settled) return;
          if (hasFailedOverOnce || retriesLeft <= 0) { finish(); return; }
          hasFailedOverOnce = true;
          try { synth.cancel(); } catch (e) {}
          if (voice) markVoiceFailed(voice.name);
          resolveVoice().then(function (nextVoice) {
            if (settled) return;
            if (nextVoice && voice && nextVoice.name === voice.name) { finish(); return; }
            speak(rawText, opts, retriesLeft - 1).then(finish);
          });
        }, 5000);

        utter.onend = function () { clearTimeout(proofTimer); finish(); };
        utter.onerror = function (event) {
          clearTimeout(proofTimer);
          // THIS was the actual, most common cause of "the voice changes
          // mid-module, sometimes several times in one video": every
          // Pause / Next / Previous / Mute / Restart click (and every
          // normal auto-advance to the next line) calls synth.cancel()
          // to stop whatever is currently talking. Cancelling an
          // utterance fires this exact 'error' event with
          // event.error === 'canceled' (or 'interrupted' when a new
          // speak() call pre-empts one still in flight) — that is
          // completely normal, constant, expected behaviour, NOT a sign
          // the voice itself is broken. The old code treated any error
          // here as proof-of-breakage, so an ordinary click could
          // permanently blacklist a perfectly working voice and
          // silently swap the narrator for the rest of the course. Only
          // a genuine, non-cancellation error (or total silence, via
          // the proofTimer above) is allowed to trigger a voice change.
          const reason = event && event.error;
          const wasDeliberateCancel = reason === 'canceled' || reason === 'interrupted';
          if (!started && voice && !wasDeliberateCancel) {
            markVoiceFailed(voice.name);
            hasFailedOverOnce = true;
          }
          finish();
        };

        if (opts.onUtterance) opts.onUtterance(utter);
        synth.speak(utter);

        // Absolute safety net regardless of the above — never let a
        // single line hang forever.
        setTimeout(function () { finish(); }, 30000);
      });
    });
  }

  window.presentationVoice = {
    synth,
    getVoice: () => lockedVoice,
    delivery: DELIVERY,
    speak,
    preprocessText
  };
})();
