// content.js (Release v3.5.3 - Debug Flags Clarified)
console.log("YouTube Codec Info extension loaded. v3.5.3 - Debug Flags Clarified");

// --- デバッグフラグ (問題解析時に true に設定してください) ---
const DEBUG_STORAGE = false;   // ストレージ関連の詳細ログを有効にするか
const VERBOSE_LOGGING = false; // 動作全般の詳細ログを有効にするか

let infoDisplay = null;
let lastVideoId = null;
let checkInterval = null;
let observer = null;
let isLoading表示 = false;

// Default settings including display toggles
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
  if (existingScript) {
    if (VERBOSE_LOGGING) console.log(`[Content] Inject script ${filePath} already exists.`);
    return;
  }
  const script = document.createElement('script');
  script.id = 'codec-info-injector-script';
  script.src = chrome.runtime.getURL(filePath);
  script.onload = function() { if (VERBOSE_LOGGING) console.log(`[Content] ${filePath} injected and loaded.`); };
  script.onerror = function() { console.error(`[Content] Failed to load ${filePath}`); };
  (document.head || document.documentElement).appendChild(script);
}

function getOrCreateOverlay() {
    const existingOverlay = document.getElementById('youtube-codec-info-overlay');
    if (existingOverlay) {
        infoDisplay = existingOverlay;
        const playerContainer = document.querySelector('#movie_player, .html5-video-player'); // プレーヤーの代替セレクタも考慮
        if (playerContainer && !playerContainer.contains(infoDisplay)) {
            if (VERBOSE_LOGGING) console.log("[Content] Appending existing overlay to player container.");
            playerContainer.appendChild(infoDisplay);
        }
        // スタイルは常に適用する可能性があるため、毎回設定
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
    if (!playerContainer) {
        if (VERBOSE_LOGGING) console.log("[Content] Player container not found for new overlay.");
        return null;
    }

    if (VERBOSE_LOGGING) console.log("[Content] Creating new overlay.");
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
        if (VERBOSE_LOGGING) console.log(`[AdjustPos] Adjusting overlay bottom to: ${targetBottom}`);
        overlay.style.bottom = targetBottom;
    }
}

function updateCodecInfo() {
  if (VERBOSE_LOGGING) console.log("[Content] updateCodecInfo called.");
  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  let overlay = getOrCreateOverlay(); // getOrCreateOverlayはinfoDisplayを更新する

  if (!player) {
    if (VERBOSE_LOGGING) console.log("[Content] updateCodecInfo: Player not found, cannot update.");
    return;
  }
  if (!overlay) { // まれにoverlayが作成できない場合
    if (VERBOSE_LOGGING) console.log("[Content] updateCodecInfo: Overlay could not be created/retrieved.");
    overlay = getOrCreateOverlay(); // 再試行
    if (!overlay) return;
  }


  const currentVideoId = getCurrentVideoId();

  if (currentVideoId && currentVideoId !== lastVideoId) {
      if (VERBOSE_LOGGING) console.log(`[Content] New video detected (or first load on video page). Old: ${lastVideoId}, New: ${currentVideoId}`);
      lastVideoId = currentVideoId;
      lastReceivedData = null;
      isLoading表示 = true;

      if (currentSettings.isVisible) {
          overlay.innerHTML = '読み込み中...';
          overlay.style.fontSize = `${currentSettings.overlaySize}px`;
          overlay.style.display = 'block';
          requestAnimationFrame(adjustOverlayPosition);
      } else {
          overlay.innerHTML = '';
          overlay.style.display = 'none';
      }
  }
  // 常に情報取得を試みる
  try {
    if (VERBOSE_LOGGING) console.log("[Content] Posting GET_CODEC_INFO message to inject script.");
    window.postMessage({ type: "GET_CODEC_INFO" }, "*");
  } catch (e) {
    console.error("[Content] Error posting message to inject script:", e);
    injectScript('inject.js'); // 念のため再注入を試みる
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
    if (VERBOSE_LOGGING) console.log("[Content] Building Info HTML with data:", data);
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
            } else { // BT表記でない場合もそのまま表示試行
                 colorSpaceName = colorPrimaries.replace('COLOR_PRIMARIES_', '').replace('_', '.');
            }
        }
        let eotfName = '';
        if (transferCharacteristics) {
            const lowerCaseTransfer = transferCharacteristics.toLowerCase();
            if (lowerCaseTransfer.includes('smpte_st2084') || lowerCaseTransfer.includes('smptest2084') ) { eotfName = 'PQ'; }
            else if (lowerCaseTransfer.includes('arib_std_b67')) { eotfName = 'HLG'; }
            // 他のEOTFも必要ならここに追加
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
        return "表示エラー"; // よりユーザーフレンドリーなエラーメッセージ
    }
}

window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "CODEC_INFO_RESULT") return;

    if (VERBOSE_LOGGING) console.log("[Content] Received message from inject script:", event.data);

    const overlay = getOrCreateOverlay(); // infoDisplayがここで設定されることを期待
    if (!overlay) { // まれにoverlayが取得できないケースへの対応
        if (VERBOSE_LOGGING) console.warn("[Content] Overlay not available in message event listener.");
        return;
    }


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
        console.warn(`[Content] Error payload from inject: ${event.data.error}`);
        if (!isLoading表示) {
            overlay.innerHTML = `エラー: ${event.data.error}`;
            overlay.style.display = currentSettings.isVisible ? 'block' : 'none';
        }
        // isLoading表示がtrueの場合、"読み込み中..." のままにする
        lastReceivedData = null;
    } else { // payloadもerrorもない場合
        if (VERBOSE_LOGGING) console.log("[Content] Received empty payload and no error from inject.");
        if (!isLoading表示) {
            overlay.innerHTML = '';
            overlay.style.display = 'none';
        }
        lastReceivedData = null;
    }
}, false);

function applySettings(settings) {
  if (VERBOSE_LOGGING || DEBUG_STORAGE) console.log("[Content] applySettings called with:", settings);
  currentSettings = { ...currentSettings, ...settings };
  const overlay = getOrCreateOverlay(); // infoDisplayがここで設定されることを期待
  if (!overlay) {
    if (VERBOSE_LOGGING || DEBUG_STORAGE) console.warn("[Content] applySettings: Overlay not available.");
    return;
  }

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
          if (VERBOSE_LOGGING) console.log("[Content] applySettings: Visible, no data, requesting update.");
          setTimeout(() => updateCodecInfo(), 250);
      }
  } else { // Not visible
      isLoading表示 = false;
      overlay.innerHTML = '';
      overlay.style.display = 'none';
  }
}

function loadInitialSettings() {
  const keysToGet = Object.keys(currentSettings);
  if (DEBUG_STORAGE) console.log("[Content] loadInitialSettings: Attempting to load for keys:", keysToGet);

  chrome.storage.sync.get(keysToGet, (items) => {
    if (chrome.runtime.lastError) {
      console.error("[Content] loadInitialSettings: Error loading from chrome.storage:", chrome.runtime.lastError.message);
      if (DEBUG_STORAGE) console.log("[Content] loadInitialSettings: Applying default settings due to storage error.");
      applySettings({ ...currentSettings }); // Use a copy of defaults
      return;
    }

    if (DEBUG_STORAGE) console.log("[Content] loadInitialSettings: Settings loaded from storage:", items);

    const loadedSettings = {};
    let appliedAtLeastOneFromStorage = false;
    for (const key of keysToGet) {
      if (items && items.hasOwnProperty(key) && items[key] !== undefined) {
        loadedSettings[key] = items[key];
        appliedAtLeastOneFromStorage = true;
      } else {
        loadedSettings[key] = currentSettings[key]; // Default value if not in storage or undefined
      }
    }
    if (DEBUG_STORAGE && !appliedAtLeastOneFromStorage) console.log("[Content] loadInitialSettings: No settings found in storage, all default values were used.");
    
    if (DEBUG_STORAGE) console.log("[Content] loadInitialSettings: Applying final settings:", loadedSettings);
    applySettings(loadedSettings);

    if (getCurrentVideoId()) {
      if (DEBUG_STORAGE || VERBOSE_LOGGING) console.log("[Content] loadInitialSettings: Video page detected, scheduling initial updateCodecInfo.");
      setTimeout(updateCodecInfo, 600); // Initial data fetch with a slight delay
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SETTINGS_UPDATED") {
        if (DEBUG_STORAGE || VERBOSE_LOGGING) console.log("[Content] Received SETTINGS_UPDATED message:", request.payload);
        applySettings(request.payload);
        sendResponse({ status: "Settings applied by content script (v3.5.3)" }); //バージョン情報更新
    }
    return true;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (DEBUG_STORAGE || VERBOSE_LOGGING) console.log("[Content] chrome.storage.onChanged detected in 'sync' namespace:", changes);
    const changedKeys = Object.keys(changes);
    // currentSettings に存在するキーが変更された場合のみ再読み込み
    if (changedKeys.some(key => currentSettings.hasOwnProperty(key))) {
        if (DEBUG_STORAGE || VERBOSE_LOGGING) console.log("[Content] Relevant settings changed in storage, reloading all settings.");
        loadInitialSettings();
    }
  }
});

function startChecking() {
    if (checkInterval) {
        if (VERBOSE_LOGGING) console.log("[Content] startChecking: Periodic check already running.");
        return;
    }
    if (VERBOSE_LOGGING) console.log("[Content] startChecking: Starting periodic check logic...");

    const checkInjectLoadedInterval = setInterval(() => {
        const injectorScript = document.getElementById('codec-info-injector-script');
        if (injectorScript && typeof window.postMessage === 'function') {
            clearInterval(checkInjectLoadedInterval);
            if (VERBOSE_LOGGING) console.log("[Content] Inject script confirmed. Starting main update interval.");
            checkInterval = setInterval(() => {
                try {
                    if(getCurrentVideoId() && document.querySelector('#movie_player, .html5-video-player')) { // プレーヤー存在確認も追加
                        if (VERBOSE_LOGGING) console.log("[Content] Interval: Calling updateCodecInfo & adjustOverlayPosition");
                        updateCodecInfo();
                        adjustOverlayPosition();
                    } else if (VERBOSE_LOGGING && getCurrentVideoId()){
                        if (VERBOSE_LOGGING) console.log("[Content] Interval: On video page but player not found. Skipping update.");
                    }
                } catch (error) {
                    console.error("[Content] Error inside main update interval:", error);
                }
            }, 200); // 更新間隔を少し長く（例: 200ms）
        } else {
             if (VERBOSE_LOGGING && !injectorScript) console.log("[Content] Inject script not found by checkInjectLoadedInterval, attempting to inject...");
             if (!injectorScript) injectScript('inject.js'); // まだなら注入
        }
    }, 500);

    // タイムアウト監視 (10秒以内に inject.js がロードされなければエラー)
    setTimeout(() => {
       if (!checkInterval && checkInjectLoadedInterval) { // checkInjectLoadedInterval がまだアクティブな場合のみクリア
           clearInterval(checkInjectLoadedInterval);
           console.error("[Content] Timeout: Inject script did not load or postMessage not ready within 10s. Periodic checks not started.");
       }
    }, 10000);
}

function stopChecking() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        if (VERBOSE_LOGGING) console.log("[Content] Stopped periodic checks.");
    }
}

function observePlayerAndNavigation() {
     if (observer) {
        if (VERBOSE_LOGGING) console.log("[Content] Disconnecting existing MutationObserver.");
        observer.disconnect();
     }
     const targetNode = document.body;
     const config = { childList: true, subtree: true };
     let currentHref = document.location.href;
     let navigationDebounceTimer = null;
     let playerCheckDebounceTimer = null;

     observer = new MutationObserver((mutationsList, obs) => {
         // URL変更によるナビゲーション検知
         clearTimeout(navigationDebounceTimer);
         navigationDebounceTimer = setTimeout(() => {
             if (document.location.href !== currentHref) {
                 currentHref = document.location.href;
                 if (VERBOSE_LOGGING) console.log("[Content] MutationObserver: Navigation detected by href change to:", currentHref);
                 handleNavigation();
             }
         }, 150); // 少しデバウンス時間を長く

         // プレーヤーの追加・削除検知
         let playerStateChanged = false;
         for(const mutation of mutationsList) {
             if (mutation.type === 'childList') {
                 mutation.addedNodes.forEach(node => {
                     if (node.nodeType === 1 && (node.id === 'movie_player' || (node.classList && node.classList.contains('html5-video-player')) || (node.querySelector && (node.querySelector('#movie_player') || node.querySelector('.html5-video-player'))))) {
                        playerStateChanged = true;
                        if (VERBOSE_LOGGING) console.log("[Content] MutationObserver: Player element potentially added.");
                     }
                 });
                 if (playerStateChanged) break; // 追加が見つかればその回のループは抜ける
                 mutation.removedNodes.forEach(node => {
                     // 削除されたノードが実際にプレーヤーだったか、またはそのコンテナだったかを慎重に判断
                     // id 'movie_player' が消えたら確実性が高い
                     if (node.nodeType === 1 && node.id === 'movie_player') {
                        playerStateChanged = true;
                        if (VERBOSE_LOGGING) console.log("[Content] MutationObserver: Player element (#movie_player) removed.");
                     }
                 });
             }
             if (playerStateChanged) break;
         }

         if (playerStateChanged) {
             clearTimeout(playerCheckDebounceTimer);
             playerCheckDebounceTimer = setTimeout(() => {
                 if (VERBOSE_LOGGING) console.log("[Content] MutationObserver: Player DOM state change detected. Triggering handleNavigation.");
                 handleNavigation(); // プレーヤーの状態が変わったらナビゲーション処理を再実行
             }, 250); // 少しデバウンス
         }
     });
     observer.observe(targetNode, config);
     if (VERBOSE_LOGGING) console.log("[Content] MutationObserver for player and navigation started/restarted.");
 }

 function handleNavigation() {
     const isOnWatchPage = getCurrentVideoId();
     const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');

     if (VERBOSE_LOGGING) console.log(`[Content] handleNavigation: isOnWatchPage: ${!!isOnWatchPage}, player found: ${!!player}`);

     if (isOnWatchPage && player) {
         if (!checkInterval) { // 初回または動画ページに戻ってきた場合
            if (VERBOSE_LOGGING) console.log("[Content] handleNavigation: On watch page with player, and checks not running. Starting init sequence.");
            injectScript('inject.js');
            isLoading表示 = true;
            const overlay = getOrCreateOverlay(); // 先に DOM 要素を確保
            if (overlay && currentSettings.isVisible) {
                overlay.innerHTML = '読み込み中...';
                overlay.style.display = 'block';
                requestAnimationFrame(adjustOverlayPosition); // 位置調整も行う
            }
            loadInitialSettings(); // 設定を読み込み、applySettingsが呼ばれる
            startChecking();
         } else { // 既にチェックが実行中の場合 (例: ページ内遷移だが動画は変わらない、など)
            if (VERBOSE_LOGGING) console.log("[Content] handleNavigation: On watch page with player, checks already running. Calling updateCodecInfo.");
            updateCodecInfo(); // これで新しい動画IDならisLoading表示がtrueになる
            requestAnimationFrame(adjustOverlayPosition);
         }
     } else { // 動画ページではない、またはプレーヤーがない
        if (VERBOSE_LOGGING) console.log("[Content] handleNavigation: Not on watch page or player not found. Cleaning up.");
        if (checkInterval) { stopChecking(); }
        const overlay = document.getElementById('youtube-codec-info-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = ''; // 内容もクリア
        }
        lastVideoId = null;
        lastReceivedData = null;
        isLoading表示 = false;
     }
 }

// --- Initialization ---
if (VERBOSE_LOGGING || DEBUG_STORAGE) console.log("[Content] Initializing content script (v3.5.3)...");
loadInitialSettings(); // まず設定を読み込む

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (VERBOSE_LOGGING) console.log("[Content] DOMContentLoaded event fired.");
        observePlayerAndNavigation();
        // DOMContentLoaded直後にも現在の状態を確認してhandleNavigationを呼ぶ
        // これにより、拡張機能が有効になった時点で既に動画ページにいる場合に対応
        handleNavigation();
    });
} else {
    if (VERBOSE_LOGGING) console.log("[Content] DOM already loaded, proceeding with initialization.");
    observePlayerAndNavigation();
    handleNavigation(); // 同上
}

window.addEventListener('beforeunload', () => {
    if (VERBOSE_LOGGING) console.log("[Content] beforeunload event. Stopping checks and observer.");
    stopChecking();
    if(observer) observer.disconnect();
});