/*
 * Shared narration voice engine for the Excelra Drug Discovery Course.
 *
 * Every Module N.html presentation loads this one file. That means any
 * future tweak to voice selection, warmth, pace, pronunciation, etc. only
 * needs to happen HERE — every module picks it up automatically the next
 * time it's opened, instead of needing 11 separate edits.
 *
 * Why voices sounded inconsistent before: the old code just grabbed
 * whichever "female-ish" system voice the OS happened to expose, and
 * Windows and macOS expose completely different voice engines (SAPI
 * vs. the macOS speech engine), so the tone, pace, and robotic-ness
 * varied a lot between them.
 *
 * The fix: prioritize Google's network voices first. In Chrome and
 * Edge, "Google UK English Female" / "Google US English" are served
 * from the same cloud engine regardless of the underlying OS, so they
 * sound identical on Windows and macOS alike, and are noticeably
 * warmer and less robotic than most local system voices. Local voices
 * are kept only as a fallback for browsers that don't expose Google's
 * voices (e.g. Safari).
 *
 * Why the female voice went silent specifically on Mac Chrome: "Google
 * UK English Female" / "Google US English" are NETWORK voices — Chrome
 * streams the audio from Google's TTS service rather than synthesizing
 * it locally. On some Mac + Chrome combinations that network request
 * silently fails to produce audio (a long-standing Chromium bug on
 * macOS), while the exact same voice works fine on Windows Chrome,
 * which doesn't hit that bug. Because the failure is silent — no error
 * event, speechSynthesis just never actually speaks — the old code had
 * no way to notice and react, so playback just sat there mute.
 *
 * The fix here: speak() now verifies a voice actually started producing
 * audio (via the utterance's own onstart/onboundary events) within a
 * short window. If it didn't, that voice is marked broken for the rest
 * of the session (and remembered in localStorage so it's skipped
 * immediately on the next module too), the next candidate voice is
 * picked, and the same line is retried automatically — completely
 * transparent to the learner, on any OS.
 */
(function () {
  const synth = window.speechSynthesis;
  let selectedVoice = null;
  let cachedVoices = [];

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
  }

  // Ordered by preference. Google's network voices come first because
  // they render identically across operating systems in Chrome/Edge —
  // but any name in this list that has previously failed to actually
  // produce audio (see markVoiceFailed above) is skipped.
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

  function candidateVoices() {
    const voices = cachedVoices.length ? cachedVoices : synth.getVoices();
    if (!voices.length) return [];
    const failed = getFailedVoiceNames();
    const usable = voices.filter(v => failed.indexOf(v.name) === -1);
    const ordered = [];
    preferredVoices.forEach(pref => {
      const found = usable.find(v => v.name.includes(pref) && v.lang.startsWith('en'));
      if (found && ordered.indexOf(found) === -1) ordered.push(found);
    });
    const english = usable.filter(v => v.lang.startsWith('en'));
    const femaleish = english.find(v => /female|woman|zira|samantha|karen|moira|fiona/i.test(v.name));
    if (femaleish && ordered.indexOf(femaleish) === -1) ordered.push(femaleish);
    english.forEach(v => { if (ordered.indexOf(v) === -1) ordered.push(v); });
    usable.forEach(v => { if (ordered.indexOf(v) === -1) ordered.push(v); });
    return ordered;
  }

  function pickVoice() {
    const list = candidateVoices();
    return list.length ? list[0] : null;
  }

  function refreshVoice() {
    cachedVoices = synth.getVoices();
    const v = pickVoice();
    if (v) selectedVoice = v;
  }

  synth.addEventListener('voiceschanged', refreshVoice);
  refreshVoice();

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
  // Modules used to build their own SpeechSynthesisUtterance directly.
  // Centralizing it here is what makes the Mac/Google-voice fallback
  // possible without touching all 11 module files' speaking logic every
  // time this needs a tweak.
  function speak(rawText, opts) {
    opts = opts || {};
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

      function attempt(triesLeft) {
        const voice = pickVoice();
        if (voice) selectedVoice = voice;

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

        // If this voice is genuinely broken (the Mac/Google network-voice
        // failure mode), the browser never fires onstart/onboundary at
        // all. Give it a short window to prove it's alive; if it doesn't,
        // blacklist this voice for the rest of the session and retry with
        // the next candidate instead of leaving the learner in silence.
        const proofTimer = setTimeout(function () {
          if (started || settled) return;
          try { synth.cancel(); } catch (e) {}
          if (voice) markVoiceFailed(voice.name);
          if (triesLeft > 0) {
            attempt(triesLeft - 1);
          } else {
            finish();
          }
        }, 1400);

        utter.onend = function () { clearTimeout(proofTimer); finish(); };
        utter.onerror = function () {
          clearTimeout(proofTimer);
          if (!started && voice) markVoiceFailed(voice.name);
          if (!started && triesLeft > 0) { attempt(triesLeft - 1); return; }
          finish();
        };

        if (opts.onUtterance) opts.onUtterance(utter);
        synth.speak(utter);

        // Absolute safety net regardless of the above, matching the old
        // per-module behavior — never let a single line hang forever.
        setTimeout(function () { finish(); }, 30000);
      }

      attempt(candidateVoices().length - 1 >= 0 ? Math.min(3, candidateVoices().length - 1) : 0);
    });
  }

  window.presentationVoice = {
    synth,
    getVoice: () => selectedVoice,
    delivery: DELIVERY,
    speak,
    preprocessText
  };
})();
