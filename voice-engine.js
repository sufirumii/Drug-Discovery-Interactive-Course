/*
 * Shared narration voice engine for the Excelra Drug Discovery Course.
 *
 * Every Module N.html presentation loads this one file. That means any
 * future tweak to voice selection, warmth, pace, etc. only needs to
 * happen HERE — every module picks it up automatically the next time
 * it's opened, instead of needing 11 separate edits.
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
 */
(function () {
  const synth = window.speechSynthesis;
  let selectedVoice = null;

  // Ordered by preference. Google's network voices come first because
  // they render identically across operating systems in Chrome/Edge.
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

  function pickVoice() {
    const voices = synth.getVoices();
    if (!voices.length) return null;

    for (const pref of preferredVoices) {
      const found = voices.find(v => v.name.includes(pref) && v.lang.startsWith('en'));
      if (found) return found;
    }
    const english = voices.filter(v => v.lang.startsWith('en'));
    return (
      english.find(v => /female|woman|zira|samantha|karen|moira|fiona/i.test(v.name)) ||
      english[0] ||
      voices[0]
    );
  }

  function refreshVoice() {
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

  window.presentationVoice = {
    synth,
    getVoice: () => selectedVoice,
    delivery: DELIVERY
  };
})();
