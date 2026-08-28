/* ============================================================================
   voice-widget.js — böngésző-natív hangdiktálás (Web Speech API)

   A hang a böngésző (Chrome/Edge esetén Google) szerverére megy felismerésre
   — ez NEM "100%-ban helyben marad" megoldás. Egy korábban kipróbált,
   teljesen helyi (WASM Whisper) verzió éles teszten magyarra és zajos
   környezetben lassú (percekig tartott) és pontatlan volt, ezért erre az
   egyszerűbb, gyors és pontos megoldásra váltottunk. Éles bevezetésnél ez
   lecserélhető egy GDPR-szerződéssel (DPA) fedett, EU-s feldolgozású
   szolgáltatásra.

   Nincs build-lépés, nincs npm — a többi fájlhoz (app.js, common.js) hasonlóan
   sima <script>-ként tölthető be, window.VoiceWidget-et definiál.
   ============================================================================ */

(function (global) {
  "use strict";

  function VoiceWidgetError(code, message) {
    var err = new Error(message);
    err.name = "VoiceWidgetError";
    err.code = code;
    return err;
  }

  var recognition = null;
  var transcriptPromise = null;
  var stopRequested = false;
  var onUnexpectedEnd = null;

  function isSupported() {
    return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function mapRecognitionError(errorCode) {
    switch (errorCode) {
      case "not-allowed":
      case "service-not-allowed":
        return VoiceWidgetError(
          "permission-denied",
          "Nincs engedélyezve a mikrofon. Engedélyezd a böngésző címsorában, majd próbáld újra."
        );
      case "no-speech":
        return VoiceWidgetError(
          "no-speech",
          "Nem hallottunk beszédet a felvételen. Próbáld közelebbről, hangosabban."
        );
      case "audio-capture":
        return VoiceWidgetError("no-microphone", "Nem található mikrofon ezen az eszközön.");
      case "network":
        return VoiceWidgetError(
          "network-error",
          "A felismeréshez internetkapcsolat kell. Ellenőrizd a hálózatot, és próbáld újra."
        );
      case "aborted":
        return VoiceWidgetError("aborted", "A felvétel megszakadt. Próbáld újra.");
      default:
        return VoiceWidgetError(
          "recognition-error",
          "Nem sikerült felismerni a beszédet. Próbáld újra, vagy írd be a kérdést kézzel."
        );
    }
  }

  /**
   * Elindítja a felvételt. A promise csak akkor oldódik fel, amikor a
   * felismerés TÉNYLEGESEN elkezdett hallgatni (onstart) — ha a mikrofon-
   * engedély megtagadva, vagy bármilyen más hiba történik MÉG a hallgatás
   * megkezdése előtt, ez a promise elutasítja, konkrét hibaüzenettel. Így a
   * hívó UI soha nem ragad "felvétel" állapotban egy meghiúsult indítás után.
   *
   * `unexpectedEndCallback` opcionális: akkor hívódik meg, ha a felismerés
   * magától befejeződik (pl. a böngésző csendre automatikusan leállítja),
   * mielőtt a hívó explicit stopAndTranscribe()-ot hívott volna — így a
   * hívó felület vissza tudja állítani a gomb állapotát.
   */
  function startRecording(unexpectedEndCallback) {
    return new Promise(function (resolveStart, rejectStart) {
      if (!isSupported()) {
        rejectStart(
          VoiceWidgetError(
            "unsupported",
            "Ez a böngésző nem támogatja a hangfelismerést. Írd be inkább a kérdést kézzel."
          )
        );
        return;
      }
      if (recognition) {
        rejectStart(VoiceWidgetError("busy", "Már folyamatban van egy felvétel."));
        return;
      }

      onUnexpectedEnd = unexpectedEndCallback || null;
      stopRequested = false;

      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      var rec = new SpeechRecognition();
      rec.lang = "hu-HU";
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      var startSettled = false;
      var transcriptSettled = false;
      var transcriptResolve, transcriptReject;

      transcriptPromise = new Promise(function (resolve, reject) {
        transcriptResolve = resolve;
        transcriptReject = reject;
      });
      // Amíg a hívó nem éri el a stopAndTranscribe()-ot, ne fusson bele a
      // konzol "Uncaught (in promise)" hibába, ha időközben elutasítódna.
      transcriptPromise.catch(function () {});

      rec.onstart = function () {
        if (!startSettled) {
          startSettled = true;
          resolveStart();
        }
      };

      rec.onresult = function (event) {
        if (transcriptSettled) return;
        transcriptSettled = true;
        var transcript = (event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript) || "";
        transcriptResolve(transcript.trim());
      };

      rec.onerror = function (event) {
        var err = mapRecognitionError(event.error);
        if (!startSettled) {
          startSettled = true;
          recognition = null;
          rejectStart(err);
        }
        if (!transcriptSettled) {
          transcriptSettled = true;
          transcriptReject(err);
        }
      };

      rec.onend = function () {
        if (!transcriptSettled) {
          transcriptSettled = true;
          transcriptReject(
            VoiceWidgetError(
              "no-speech",
              "Nem hallottunk beszédet a felvételen. Próbáld közelebbről, hangosabban."
            )
          );
        }
        if (!startSettled) {
          startSettled = true;
          recognition = null;
          rejectStart(VoiceWidgetError("start-failed", "Nem sikerült elindítani a hangfelismerést. Próbáld újra."));
          return;
        }
        // Ha a felismerés magától ért véget (nem a hívó állította le),
        // jelezzük neki, hogy vissza tudja állítani a gomb állapotát.
        if (!stopRequested && onUnexpectedEnd) {
          var cb = onUnexpectedEnd;
          onUnexpectedEnd = null;
          cb();
        }
      };

      try {
        rec.start();
      } catch (e) {
        rejectStart(VoiceWidgetError("start-failed", "Nem sikerült elindítani a hangfelismerést. Próbáld újra."));
        return;
      }
      recognition = rec;
    });
  }

  /** Leállítja a felvételt, és visszaadja a felismert magyar szöveget. */
  function stopAndTranscribe() {
    if (!recognition) {
      return Promise.reject(VoiceWidgetError("not-recording", "Nincs folyamatban felvétel."));
    }
    stopRequested = true;
    onUnexpectedEnd = null;
    var pending = transcriptPromise;
    try {
      recognition.stop();
    } catch (e) {
      // már leállt — a pending promise ekkor is a végleges eredményt tartalmazza
    }
    recognition = null;

    return pending.then(function (text) {
      if (!text) {
        throw VoiceWidgetError("empty-result", "Nem sikerült szöveget felismerni. Próbáld újra, érthetőbben.");
      }
      return text;
    });
  }

  global.VoiceWidget = {
    isSupported: isSupported,
    startRecording: startRecording,
    stopAndTranscribe: stopAndTranscribe,
  };
})(window);
