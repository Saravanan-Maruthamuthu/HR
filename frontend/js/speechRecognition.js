/* =====================================================================
   speechRecognition.js — Web Speech API Wrapper
   ===================================================================== */

window.SpeechRec = (() => {
    let recognition = null;
    let isListening = false;
    let silenceTimer = null;
    let finalTranscript = '';
    let interimTranscript = '';

    const SILENCE_TIMEOUT = 6000; // ms before auto-advance
    let onWordCb = null;
    let onFinalCb = null;
    let onSilenceCb = null;
    let onErrorCb = null;
    let onInterimCb = null;

    function isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    function init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return false;

        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript + ' ';
                    if (onFinalCb) onFinalCb(finalTranscript.trim());
                } else {
                    interimTranscript += result[0].transcript;
                    if (onInterimCb) onInterimCb(interimTranscript);
                }
                if (onWordCb) onWordCb(result[0].transcript);
            }
            resetSilenceTimer();
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech') resetSilenceTimer();
            else if (onErrorCb) onErrorCb(event.error);
        };

        recognition.onend = () => {
            // Auto-restart if we're still supposed to be listening
            if (isListening) {
                try { recognition.start(); } catch { /* already starting */ }
            }
        };

        return true;
    }

    function start(options = {}) {
        if (!recognition && !init()) return false;
        if (options.onWord) onWordCb = options.onWord;
        if (options.onFinal) onFinalCb = options.onFinal;
        if (options.onSilence) onSilenceCb = options.onSilence;
        if (options.onError) onErrorCb = options.onError;
        if (options.onInterim) onInterimCb = options.onInterim;

        finalTranscript = '';
        interimTranscript = '';
        isListening = true;

        try {
            recognition.start();
        } catch {
            // May throw if already running
        }
        resetSilenceTimer();
        return true;
    }

    function stop() {
        isListening = false;
        clearTimeout(silenceTimer);
        if (recognition) {
            try { recognition.stop(); } catch { /* ignore */ }
        }
        return finalTranscript.trim();
    }

    function reset() {
        finalTranscript = '';
        interimTranscript = '';
    }

    function resetSilenceTimer() {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            if (onSilenceCb && isListening) onSilenceCb(finalTranscript.trim());
        }, SILENCE_TIMEOUT);
    }

    function getTranscript() {
        return finalTranscript.trim();
    }

    function getInterim() {
        return interimTranscript;
    }

    return { isSupported, init, start, stop, reset, getTranscript, getInterim };
})();
