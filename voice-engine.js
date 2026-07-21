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
 * SAME VOICE ON WINDOWS AND macOS
 * ----------------------------------------
 * Windows and macOS expose completely different local voice engines
 * (SAPI vs. the macOS speech engine), so two local voices can never
 * truly sound identical across the two. The one kind of voice that
 * DOES render identically on any OS is a network voice — Chrome/Edge
 * stream the audio from Google's TTS service rather than synthesizing
 * it on-device, so "Google UK English Female" sounds exactly the same
 * whether Chrome is running on a MacBook or a Windows laptop. That's
 * why it's first in the preference list below: as long as Chrome can
 * reach it, both platforms independently land on the exact same voice.
 *
 * Why the female voice sometimes went silent specifically on Mac
 * Chrome: on some Mac + Chrome combinations, that network request
 * silently fails to produce audio (a long-standing Chromium bug),
 * while the exact same voice works fine on Windows Chrome. Because the
 * failure is silent — no error event, speechSynthesis just never
 * actually speaks — naive code has no way to notice and react.
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

  // Ordered by preference. Google's network voice comes first because it
  // renders identically across operating systems in Chrome/Edge — see
  // the header comment above for why that matters more than it might
  // seem. Anything in this list that has previously failed to actually
  // produce audio (markVoiceFailed above) is skipped.
  const preferredVoices = [
    'Google UK English Female',
    'Google US English',
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Samantha',
    'Microsoft Zira',
    'Microsoft Hazel',
    'Microsoft Susan',
    'Karen',
    'Moira',
    'Fiona',
    'Tessa',
    'Victoria',
    'Zira',
    'Samantha (Enhanced)',
    'Female',
    'Woman'
  ];

  function bestMatch(voices) {
    if (!voices.length) return null;
    const failed = getFailedVoiceNames();
    const usable = voices.filter(v => failed.indexOf(v.name) === -1);
    for (const pref of preferredVoices) {
      const found = usable.find(v => v.name.includes(pref) && v.lang.startsWith('en'));
      if (found) return found;
    }
    const english = usable.filter(v => v.lang.startsWith('en'));
    return (
      english.find(v => /female|woman|zira|samantha|karen|moira|fiona/i.test(v.name)) ||
      english[0] || usable[0] || voices[0] || null
    );
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
  function resolveVoice() {
    if (lockedVoice) return Promise.resolve(lockedVoice);
    if (resolvingPromise) return resolvingPromise;

    resolvingPromise = (async () => {
      let storedName = null;
      try { storedName = localStorage.getItem(LOCK_KEY); } catch (e) {}
      const failed = getFailedVoiceNames();

      if (storedName && failed.indexOf(storedName) === -1) {
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
  // Change these two numbers here and every module updates together.
  const DELIVERY = {
    rate: 0.94,
    pitch: 1.08
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
  function speak(rawText, opts, retriesLeft) {
    opts = opts || {};
    if (retriesLeft === undefined) retriesLeft = 2;
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

        // If the locked-in voice is genuinely broken on this device
        // (the Mac/Google network-voice failure mode), the browser
        // never fires onstart/onboundary at all. Give it a short
        // window to prove it's alive; if it doesn't, blacklist it,
        // re-lock to the next candidate, and retry THIS SAME line —
        // the learner hears a beat of silence, never total silence.
        const proofTimer = setTimeout(function () {
          if (started || settled) return;
          try { synth.cancel(); } catch (e) {}
          if (voice) markVoiceFailed(voice.name);
          if (retriesLeft <= 0) { finish(); return; }
          resolveVoice().then(function (nextVoice) {
            if (settled) return;
            if (nextVoice && voice && nextVoice.name === voice.name) { finish(); return; }
            speak(rawText, opts, retriesLeft - 1).then(finish);
          });
        }, 1400);

        utter.onend = function () { clearTimeout(proofTimer); finish(); };
        utter.onerror = function () {
          clearTimeout(proofTimer);
          if (!started && voice) markVoiceFailed(voice.name);
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
