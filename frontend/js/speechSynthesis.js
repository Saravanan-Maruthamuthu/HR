/* =====================================================================
   speechSynthesis.js — TTS (AI Voice Reads Questions)
   ===================================================================== */

window.SpeechSyn = (() => {
    let currentUtterance = null;
    let voices = [];
    let preferredVoice = null;

    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        // Prefer a natural English voice
        const preferred = ['Google US English', 'Microsoft David', 'Alex', 'Samantha', 'Karen'];
        for (const name of preferred) {
            const v = voices.find(v => v.name.includes(name));
            if (v) { preferredVoice = v; break; }
        }
        if (!preferredVoice) {
            preferredVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        }
    }

    // Voices may load async
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    function speak(text, onEnd = null) {
        cancel();
        currentUtterance = new SpeechSynthesisUtterance(text);
        if (preferredVoice) currentUtterance.voice = preferredVoice;
        currentUtterance.rate = 0.92;
        currentUtterance.pitch = 1.0;
        currentUtterance.volume = 1.0;
        if (onEnd) currentUtterance.onend = onEnd;
        window.speechSynthesis.speak(currentUtterance);
    }

    function cancel() {
        window.speechSynthesis.cancel();
        currentUtterance = null;
    }

    function isSpeaking() {
        return window.speechSynthesis.speaking;
    }

    return { speak, cancel, isSpeaking };
})();
