/* ============================================================================
   voice-bind.js — a mikrofon-gomb bekötése a kérdésmezőhöz.

   A PR #1 (buildwiseautomation) bindMic() logikája, önálló fájlba emelve:
   így az app.js-hez nem kell hozzányúlni, és az index-voice.html az eredeti
   index.html mellett, azt nem érintve fut.

   Az app.js után töltődik be, tehát a globális ask() és a CONFIG már létezik.
   ============================================================================ */

(function () {
  "use strict";

  function bindMic() {
    var micBtn = document.getElementById("micBtn");
    var micStatus = document.getElementById("micStatus");
    if (!micBtn || !micStatus) return;

    /* A Beállítások nézet "Hangfelismerés" sora: külső VOICE_ENDPOINT nélkül is
       igazat mond, mert a böngésző-natív felismerés be van kötve. */
    var stateVoice = document.getElementById("stateVoice");
    var hasEndpoint = !!(window.CONFIG && window.CONFIG.VOICE_ENDPOINT);

    if (!window.VoiceWidget || !window.VoiceWidget.isSupported()) {
      micBtn.disabled = true;
      micBtn.title = "Ez a böngésző nem támogatja a hangfelismerést";
      return;
    }
    if (stateVoice && !hasEndpoint) {
      stateVoice.textContent = "bekötve (böngésző)";
      stateVoice.className = "";
    }

    var recording = false;

    function onUnexpectedEnd() {
      // A böngésző csendre magától leállította a hallgatást, mielőtt a
      // felhasználó rákattintott volna a leállításra — a gomb ne ragadjon
      // "felvétel" állapotban.
      recording = false;
      micBtn.classList.remove("recording");
    }

    micBtn.addEventListener("click", function () {
      micStatus.hidden = true;

      if (!recording) {
        window.VoiceWidget.startRecording(onUnexpectedEnd, function (interimText) {
          document.getElementById("q").value = interimText;
        }).then(function () {
          recording = true;
          micBtn.classList.add("recording");
        }).catch(function (err) {
          recording = false;
          micBtn.classList.remove("recording");
          micStatus.textContent = err.message || "Nem sikerült elérni a mikrofont.";
          micStatus.hidden = false;
        });
        return;
      }

      recording = false;
      micBtn.classList.remove("recording");
      micBtn.disabled = true;
      window.VoiceWidget.stopAndTranscribe().then(function (text) {
        document.getElementById("q").value = text;
        if (typeof window.ask === "function") window.ask();
      }).catch(function (err) {
        micStatus.textContent = err.message || "Nem sikerült felismerni a beszédet.";
        micStatus.hidden = false;
      }).then(function () {
        micBtn.disabled = false;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMic);
  } else {
    bindMic();
  }
})();
