/* =====================================================================
   speechSynthesis.js — TTS (AI Voice Reads Questions)
   Uses backend Edge TTS (/api/tts) for fast, high-quality speech.
   Falls back to browser SpeechSynthesis if backend is unreachable.
   ===================================================================== */

window.SpeechSyn = (() => {
    let currentAudio = null;
    let currentUtterance = null;
    let voices = [];
    let preferredVoice = null;
    let lipSyncInterval = null;

    // ── Browser TTS fallback voices ─────────────────────────────────
    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        const preferred = ['Google US English', 'Microsoft David', 'Alex', 'Samantha', 'Karen'];
        for (const name of preferred) {
            const v = voices.find(v => v.name.includes(name));
            if (v) { preferredVoice = v; break; }
        }
        if (!preferredVoice) {
            preferredVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        }
    }

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    // ── Lip-sync helpers ────────────────────────────────────────────
    function startLipSyncLoop() {
        if (lipSyncInterval) clearInterval(lipSyncInterval);
        lipSyncInterval = setInterval(() => {
            if (window.AvatarPlayer) {
                window.AvatarPlayer.startProceduralLipSync();
            }
        }, 50);
    }

    function stopLipSyncLoop() {
        if (lipSyncInterval) {
            clearInterval(lipSyncInterval);
            lipSyncInterval = null;
        }
        if (window.AvatarPlayer) window.AvatarPlayer.stopLipSync();
    }

    // ── Primary: Backend Edge TTS (fast, high quality) ──────────────
    async function speakViaBackend(text, onEnd) {
        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, provider: 'azure' }),
            });
            if (!res.ok) throw new Error('TTS endpoint returned ' + res.status);

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);

            currentAudio.onplay = () => startLipSyncLoop();

            currentAudio.onended = () => {
                stopLipSyncLoop();
                URL.revokeObjectURL(url);
                currentAudio = null;
                if (onEnd) onEnd();
            };

            currentAudio.onerror = () => {
                stopLipSyncLoop();
                URL.revokeObjectURL(url);
                currentAudio = null;
                // Fallback to browser TTS on audio playback error
                speakViaBrowser(text, onEnd);
            };

            await currentAudio.play();
        } catch (err) {
            console.warn('Backend TTS failed, falling back to browser TTS:', err.message);
            speakViaBrowser(text, onEnd);
        }
    }

    // ── Fallback: Browser SpeechSynthesis ────────────────────────────
    function speakViaBrowser(text, onEnd) {
        window.speechSynthesis.cancel();
        currentUtterance = new SpeechSynthesisUtterance(text);
        if (preferredVoice) currentUtterance.voice = preferredVoice;
        currentUtterance.rate = 0.92;
        currentUtterance.pitch = 1.0;
        currentUtterance.volume = 1.0;

        currentUtterance.onstart = () => startLipSyncLoop();

        currentUtterance.onend = () => {
            stopLipSyncLoop();
            currentUtterance = null;
            if (onEnd) onEnd();
        };

        window.speechSynthesis.speak(currentUtterance);
    }

    // ── Public API ──────────────────────────────────────────────────
    function speak(text, onEnd = null) {
        cancel();
        speakViaBackend(text, onEnd);
    }

    function cancel() {
        // Cancel backend audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.src = '';
            currentAudio = null;
        }
        // Cancel browser TTS
        window.speechSynthesis.cancel();
        currentUtterance = null;
        stopLipSyncLoop();
    }

    function isSpeaking() {
        return !!(currentAudio && !currentAudio.paused) || window.speechSynthesis.speaking;
    }

    return { speak, cancel, isSpeaking };
})();
