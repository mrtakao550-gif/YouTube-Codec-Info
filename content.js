// content.js (Release v3.5.3 - Cleaned)
console.log("YouTube Codec Info extension loaded. v3.5.3");

let infoDisplay = null;
let lastVideoId = null;
let checkInterval = null;
let observer = null;
let isLoading表示 = false;

// Default settings
let currentSettings = {
    isVisible: true,
    overlaySize: 13,
    showVideoCodec: true,
    showResolutionFps: true,
    showAudioCodec: true,
    showAudioDetails: true,
    showColorSpace: true,
    showStreamStatus: true,
};
let lastReceivedData = null;

function injectScript(filePath) {
  const existingScript = document.getElementById('codec-info-injector-script');
  if (existingScript) return;
  const script = document.createElement('script');
  script.id = 'codec-info-injector-script';
  script.src = chrome.runtime.getURL(filePath);
  script.onerror = function() { console.error(`[Content] Failed to load ${filePath}`); };
  (document.head || document.documentElement).appendChild(script);
}

function getOrCreateOverlay() {
    const existingOverlay = document.getElementById('youtube-codec-info-overlay');
    if (existingOverlay) {
        infoDisplay = existingOverlay;
        const playerContainer = document.querySelector('#movie_player, .html5-video-player');
        if (playerContainer && !playerContainer.contains(infoDisplay)) {
            playerContainer.appendChild(infoDisplay);
        }
        if (infoDisplay) {
             infoDisplay.style.fontSize = `${currentSettings.overlaySize}px`;
             const hasContent = infoDisplay.innerHTML.trim() !== '' && infoDisplay.innerHTML !== '読み込み中...';
             infoDisplay.style.display = currentSettings.isVisible && (hasContent || isLoading表示) ? 'block' : 'none';
             if (infoDisplay.style.display === 'block') {
                  requestAnimationFrame(adjustOverlayPosition);
             }
        }
        return infoDisplay;
    }

    const playerContainer = document.querySelector('#movie_player, .html5-video-player');
    if (!playerContainer) return null;

    infoDisplay = document.createElement('div');
    infoDisplay.id = 'youtube-codec-info-overlay';
    infoDisplay.style.fontSize = `${currentSettings.overlaySize}px`;

    if (currentSettings.isVisible && isLoading表示) {
        infoDisplay.innerHTML = '読み込み中...';
        infoDisplay.style.display = 'block';
    } else {
        infoDisplay.innerHTML = '';
        infoDisplay.style.display = 'none';
    }
    playerContainer.appendChild(infoDisplay);
    return infoDisplay;
  }

function adjustOverlayPosition() {
    const overlay = document.getElementById('youtube-codec-info-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (!player) return;

    const controls = player.querySelector('.ytp-chrome-bottom');
    const progressBarContainer = player.querySelector('.ytp-progress-bar-container');
    const defaultBottom = '10px';
    const marginAboveControls = 5;
    let targetBottom = defaultBottom;

    if (controls && progressBarContainer) {
        let isControlsVisible = false;
        let controlsHeight = 0;
        try {
            const controlsStyle = window.getComputedStyle(controls);
            const controlsOpacity = parseFloat(controlsStyle.opacity);
            const controlsOffsetHeight = controls.offsetHeight;
            isControlsVisible = controlsOpacity > 0.1 && controlsOffsetHeight > 10;
            if (isControlsVisible) { controlsHeight = controlsOffsetHeight; targetBottom = `${controlsHeight + marginAboveControls}px`; }
        } catch (e) { console.error("[AdjustPos] Error accessing control styles/height:", e); targetBottom = defaultBottom; }
    } else { targetBottom = defaultBottom; }

    if (overlay.style.bottom !== targetBottom) {
        overlay.style.bottom = targetBottom;
    }
}

function updateCodecInfo() {
  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  let overlay = getOrCreateOverlay();

  if (!player || !overlay) return;

  const currentVideoId = getCurrentVideoId();

  if (currentVideoId && currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      lastReceivedData = null;
      isLoading表示 = true;

      if (currentSettings.isVisible) { // overlayはgetOrCreateOverlayで取得済みのはず
          overlay.innerHTML = '読み込み中...';
          overlay.style.fontSize = `${currentSettings.overlaySize}px`;
          overlay.style.display = 'block';
          requestAnimationFrame(adjustOverlayPosition);
      } else {
          overlay.innerHTML = '';
          overlay.style.display = 'none';
      }
  }
  try {
    window.postMessage({ type: "GET_CODEC_INFO" }, "*");
  } catch (e) {
    console.error("[Content] Error posting message to inject script:", e);
    injectScript('inject.js');
  }
}

function getCurrentVideoId() {
  if (window.location.pathname === '/watch') {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }
  return null;
}

function buildInfoHtml(data) {
    if (!data) return '';
    try {
        const videoQuality = data.qualityLabel || data.resolution || (data.height ? `${data.height}p` : '');
        const videoFps = data.fps ? `@${data.fps}` : '';
        const videoCodec = data.videoCodec || 'N/A';
        const audioCodec = data.audioCodec || 'N/A';
        const colorPrimaries = data.colorInfo?.primaries;
        const transferCharacteristics = data.colorInfo?.transferCharacteristics;
        let colorSpaceName = '';
        if (colorPrimaries) {
            if (colorPrimaries.includes('BT')) {
                const match = colorPrimaries.match(/BT\.?(\d+)/i);
                if (match && match[1]) { colorSpaceName = `BT.${match[1]}`; }
                else { colorSpaceName = colorPrimaries.replace('COLOR_PRIMARIES_', '').replace('_', '.');}
            } else {
                 colorSpaceName = colorPrimaries.replace('COLOR_PRIMARIES_', '').replace('_', '.');
            }
        }
        let eotfName = '';
        if (transferCharacteristics) {
            const lowerCaseTransfer = transferCharacteristics.toLowerCase();
            if (lowerCaseTransfer.includes('smpte_st2084') || lowerCaseTransfer.includes('smptest2084') ) { eotfName = 'PQ'; }
            else if (lowerCaseTransfer.includes('arib_std_b67')) { eotfName = 'HLG'; }
        }
        const audioSampleRate = data.audioSampleRate ? `${Math.round(parseInt(data.audioSampleRate) / 1000)}kHz` : '';
        const audioChannels = data.audioChannels ? `${data.audioChannels}ch` : '';
        const isLive = data.isLive || false;
        const isDash = data.isDash || false;
        const isMsl = data.isMsl || false;

        let infoParts = [];
        let statusParts = [];
        if (currentSettings.showVideoCodec && videoCodec !== 'N/A') { infoParts.push(`🎬 ${videoCodec}`); }
        if (currentSettings.showResolutionFps && videoQuality) { const resFpsString = `${videoQuality}${videoFps}`; if (currentSettings.showVideoCodec && infoParts.length > 0 && videoCodec !== 'N/A') { infoParts[infoParts.length - 1] += ` (${resFpsString})`; } else { infoParts.push(`🖼️ ${resFpsString}`); } }
        if (currentSettings.showAudioCodec && audioCodec !== 'N/A') { infoParts.push(`🔊 ${audioCodec}`); }
        if (currentSettings.showAudioDetails && (audioSampleRate || audioChannels)) { const audioDetails = [audioSampleRate, audioChannels].filter(Boolean).join(', '); if (audioDetails) { if (currentSettings.showAudioCodec && infoParts.length > 0 && infoParts[infoParts.length-1].startsWith('🔊')) { infoParts[infoParts.length - 1] += ` (${audioDetails})`; } else { infoParts.push(`👂 ${audioDetails}`); } } }
        if (currentSettings.showColorSpace && colorSpaceName) {
            let colorString = colorSpaceName;
            if (eotfName === 'PQ' || eotfName === 'HLG') { colorString += ` / ${eotfName}`; }
            infoParts.push(`🎨 ${colorString}`);
        }
        if (currentSettings.showStreamStatus) { if (isLive) statusParts.push(`🔴 LIVE`); if (isDash) statusParts.push(`DASH`); else if (isMsl) statusParts.push(`HLS`); }
        let infoText = infoParts.join(' | ');
        if (statusParts.length > 0) { infoText += (infoText ? '<br>' : '') + statusParts.join(' '); }
        return infoText.trim();
    } catch (e) {
        console.error("[Content] Error building info HTML:", e, data);
        return "表示エラー";
    }
}

window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "CODEC_INFO_RESULT") return;

    const overlay = getOrCreateOverlay();
    if (!overlay) return;

    if (event.data.payload) {
        lastReceivedData = event.data.payload;
        isLoading表示 = false;
        const infoText = buildInfoHtml(lastReceivedData);
        overlay.innerHTML = infoText;
        const hasContent = infoText !== '';
        const shouldBeVisible = currentSettings.isVisible && hasContent;
        overlay.style.display = shouldBeVisible ? 'block' : 'none';
        if (shouldBeVisible) { requestAnimationFrame(adjustOverlayPosition); }
    } else if (event.data.error) {
        console.warn(`[Content] Error from inject: ${event.data.error}`);
        if (!isLoading表示) {
            overlay.innerHTML = `エラー: ${event.data.error}`;
            overlay.style.display = currentSettings.isVisible ? 'block' : 'none';
        }
        lastReceivedData = null;
    } else {
        if (!isLoading表示) {
            overlay.innerHTML = '';
            overlay.style.display = 'none';
        }
        lastReceivedData = null;
    }
}, false);

function applySettings(settings) {
  currentSettings = { ...currentSettings, ...settings };
  const overlay = getOrCreateOverlay();
  if (!overlay) return;

  overlay.style.fontSize = `${currentSettings.overlaySize}px`;
  if (lastReceivedData && currentSettings.isVisible) {
      isLoading表示 = false;
      const newHtml = buildInfoHtml(lastReceivedData);
      overlay.innerHTML = newHtml;
      const hasContent = newHtml !== '';
      overlay.style.display = hasContent ? 'block' : 'none';
      if (hasContent) { requestAnimationFrame(adjustOverlayPosition); }
  } else if (currentSettings.isVisible) {
      isLoading表示 = true;
      overlay.innerHTML = '読み込み中...';
      overlay.style.display = 'block';
      requestAnimationFrame(adjustOverlayPosition);
      if (getCurrentVideoId()) {
          setTimeout(() => updateCodecInfo(), 250);
      }
  } else {
      isLoading表示 = false;
      overlay.innerHTML = '';
      overlay.style.display = 'none';
  }
}

function loadInitialSettings() {
  const keysToGet = Object.keys(currentSettings);
  chrome.storage.sync.get(keysToGet, (items) => {
    if (chrome.runtime.lastError) {
      console.error("[Content] loadInitialSettings: Error loading from chrome.storage:", chrome.runtime.lastError.message);
      applySettings({ ...currentSettings });
      return;
    }
    const loadedSettings = {};
    for (const key of keysToGet) {
      if (items && items.hasOwnProperty(key) && items[key] !== undefined) {
        loadedSettings[key] = items[key];
      } else {
        loadedSettings[key] = currentSettings[key];
      }
    }
    applySettings(loadedSettings);
    if (getCurrentVideoId()) {
      setTimeout(updateCodecInfo, 600);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SETTINGS_UPDATED") {
        applySettings(request.payload);
        sendResponse({ status: "Settings applied by content script" });
    }
    return true;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    const changedKeys = Object.keys(changes);
    if (changedKeys.some(key => currentSettings.hasOwnProperty(key))) {
        loadInitialSettings();
    }
  }
});

function startChecking() {
    if (checkInterval) return;

    const checkInjectLoadedInterval = setInterval(() => {
        const injectorScript = document.getElementById('codec-info-injector-script');
        if (injectorScript && typeof window.postMessage === 'function') {
            clearInterval(checkInjectLoadedInterval);
            checkInterval = setInterval(() => {
                try {
                    if(getCurrentVideoId() && document.querySelector('#movie_player, .html5-video-player')) {
                        updateCodecInfo();
                        adjustOverlayPosition();
                    }
                } catch (error) {
                    console.error("[Content] Error inside main update interval:", error);
                }
            }, 200);
        } else {
             if (!injectorScript) injectScript('inject.js');
        }
    }, 500);

    setTimeout(() => {
       if (!checkInterval && checkInjectLoadedInterval) {
           clearInterval(checkInjectLoadedInterval);
           console.error("[Content] Timeout: Inject script did not load or postMessage not ready within 10s.");
       }
    }, 10000);
}

function stopChecking() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

function observePlayerAndNavigation() {
     if (observer) observer.disconnect();
     const targetNode = document.body;
     const config = { childList: true, subtree: true };
     let currentHref = document.location.href;
     let navigationDebounceTimer = null;
     let playerCheckDebounceTimer = null;

     observer = new MutationObserver((mutationsList, obs) => {
         clearTimeout(navigationDebounceTimer);
         navigationDebounceTimer = setTimeout(() => {
             if (document.location.href !== currentHref) {
                 currentHref = document.location.href;
                 handleNavigation();
             }
         }, 150);

         let playerStateChanged = false;
         for(const mutation of mutationsList) {
             if (mutation.type === 'childList') {
                 mutation.addedNodes.forEach(node => {
                     if (node.nodeType === 1 && (node.id === 'movie_player' || (node.classList && node.classList.contains('html5-video-player')) || (node.querySelector && (node.querySelector('#movie_player') || node.querySelector('.html5-video-player'))))) {
                        playerStateChanged = true;
                     }
                 });
                 if (playerStateChanged) break;
                 mutation.removedNodes.forEach(node => {
                     if (node.nodeType === 1 && node.id === 'movie_player') {
                        playerStateChanged = true;
                     }
                 });
             }
             if (playerStateChanged) break;
         }

         if (playerStateChanged) {
             clearTimeout(playerCheckDebounceTimer);
             playerCheckDebounceTimer = setTimeout(() => {
                 handleNavigation();
             }, 250);
         }
     });
     observer.observe(targetNode, config);
 }

 function handleNavigation() {
     const isOnWatchPage = getCurrentVideoId();
     const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');

     if (isOnWatchPage && player) {
         if (!checkInterval) {
            injectScript('inject.js');
            isLoading表示 = true;
            const overlay = getOrCreateOverlay();
            if (overlay && currentSettings.isVisible) {
                overlay.innerHTML = '読み込み中...';
                overlay.style.display = 'block';
                requestAnimationFrame(adjustOverlayPosition);
            }
            loadInitialSettings();
            startChecking();
         } else {
            updateCodecInfo();
            requestAnimationFrame(adjustOverlayPosition);
         }
     } else {
        if (checkInterval) { stopChecking(); }
        const overlay = document.getElementById('youtube-codec-info-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
        }
        lastVideoId = null;
        lastReceivedData = null;
        isLoading表示 = false;
     }
 }

// --- Initialization ---
loadInitialSettings();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        observePlayerAndNavigation();
        handleNavigation();
    });
} else {
    observePlayerAndNavigation();
    handleNavigation();
}
window.addEventListener('beforeunload', () => {
    stopChecking();
    if(observer) observer.disconnect();
});