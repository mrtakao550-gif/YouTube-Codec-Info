// popup.js (Realtime Update Added)

const visibilityToggle = document.getElementById('toggle-visibility');
const sizeSlider = document.getElementById('size-slider');
const sizeValueSpan = document.getElementById('size-value');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValueSpan = document.getElementById('opacity-value');
const explanationArea = document.getElementById('explanation-area');

const infoToggles = {
  showVideoCodec: document.getElementById('toggle-video-codec'),
  showResolutionFps: document.getElementById('toggle-resolution-fps'),
  showAudioCodec: document.getElementById('toggle-audio-codec'),
  showAudioDetails: document.getElementById('toggle-audio-details'),
  showColorSpace: document.getElementById('toggle-color-space'),
  showStreamStatus: document.getElementById('toggle-stream-status'),
};

const defaultSettings = {
    isVisible: true,
    overlaySize: 13,
    overlayOpacity: 0.85,
    showVideoCodec: true,
    showResolutionFps: true,
    showAudioCodec: true,
    showAudioDetails: true,
    showColorSpace: true,
    showStreamStatus: true,
};

const explanations = {
  showOverlay: { text: "オーバーレイ全体の表示・非表示を切り替えます。", wikiLink: null },
  fontSize: { text: "オーバーレイに表示される文字の大きさを調整します。", wikiLink: null },
  overlayOpacity: { text: "オーバーレイ全体の不透明度を調整します。0%で完全に透明、100%で完全に不透明になります。背景だけでなく文字も影響を受けます。", wikiLink: null },
  videoCodec: { text: "動画を圧縮・展開する技術。(例: AV1, VP9, AVC)", wikiLink: "https://ja.wikipedia.org/wiki/%E3%82%B3%E3%83%BC%E3%83%87%E3%83%83%E3%82%AF" },
  resolutionFps: { text: "解像度は動画の精細さ、FPSは滑らかさを示します。", wikiLink: "https://ja.wikipedia.org/wiki/%E7%94%BB%E9%9D%A2%E8%A7%A3%E5%83%8F%E5%BA%A6", fpsWikiLink: "https://ja.wikipedia.org/wiki/%E3%83%95%E3%83%AC%E3%83%BC%E3%83%A0%E3%83%AC%E3%83%BC%E3%83%88" },
  audioCodec: { text: "音声を圧縮・展開する技術。(例: Opus, AAC)", wikiLink: "https://ja.wikipedia.org/wiki/%E9%9F%B3%E5%A3%B0%E3%82%B3%E3%83%BC%E3%83%87%E3%83%83%E3%82%AF" },
  audioDetails: { text: "サンプルレート(kHz)とチャンネル数(ch)。", wikiLink: "https://ja.wikipedia.org/wiki/%E6%A8%99%E6%9C%AC%E5%8C%96%E5%91%A8%E6%B3%A2%E6%95%B0", channelWikiLink: "https://ja.wikipedia.org/wiki/%E3%82%B5%E3%83%A9%E3%82%A6%E3%83%B3%E3%83%89" },
  colorSpace: { text: "色空間(BT.709/BT.2020)と伝達特性(EOTF)。", wikiLink: "https://ja.wikipedia.org/wiki/Rec._2020", eotfWikiLink: "https://ja.wikipedia.org/wiki/%E3%83%8F%E3%82%A4%E3%83%80%E3%82%A4%E3%83%8A%E3%83%9F%E3%83%83%E3%82%AF%E3%83%AC%E3%83%B3%E3%82%B8%E6%98%A0%E5%83%8F#EOTF" },
  streamStatus: { text: "LIVEは生放送。DASH/HLSは配信技術。", wikiLink: "https://ja.wikipedia.org/wiki/Dynamic_Adaptive_Streaming_over_HTTP", hlsWikiLink: "https://ja.wikipedia.org/wiki/HTTP_Live_Streaming" }
};

function showExplanation(key) {
    const explanationData = explanations[key];
    if (!explanationData || !explanationArea) return;
    let labelText = '';
    const helpButton = document.getElementById(`help-${key}`);
    if (helpButton && helpButton.closest('.setting-item')) {
        const labelElement = helpButton.closest('.setting-item').querySelector('.setting-label');
        if (labelElement) {
            labelText = labelElement.innerHTML.replace(/<span class="emoji">.*?<\/span>/g, '').replace(/^[^\w]+/, '').trim();
            const emojiMatch = labelText.match(/^(\S+\s)/);
            if (emojiMatch && emojiMatch[0].length <= 3) {
                labelText = labelText.substring(emojiMatch[0].length).trim();
            }
        }
    }
    if (!labelText) {
        labelText = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (key.startsWith('show')) labelText = labelText.replace('Show ', '');
    }
    let html = `<p><strong>${labelText}:</strong><br>${explanationData.text}</p>`;
    if (explanationData.wikiLink) { html += `<a href="${explanationData.wikiLink}" target="_blank" class="wiki-link">詳細 (Wikipedia)</a>`; }
    if (explanationData.fpsWikiLink) { html += ` | <a href="${explanationData.fpsWikiLink}" target="_blank" class="wiki-link">FPS詳細</a>`; }
    if (explanationData.channelWikiLink) { html += ` | <a href="${explanationData.channelWikiLink}" target="_blank" class="wiki-link">チャンネル詳細</a>`; }
    if (explanationData.eotfWikiLink) { html += ` | <a href="${explanationData.eotfWikiLink}" target="_blank" class="wiki-link">EOTF詳細</a>`; }
    if (explanationData.hlsWikiLink) { html += ` | <a href="${explanationData.hlsWikiLink}" target="_blank" class="wiki-link">HLS詳細</a>`; }
    explanationArea.innerHTML = html;
    explanationArea.style.display = 'block';
    setTimeout(() => { document.addEventListener('click', hideExplanationOnClickOutside, { once: true, capture: true }); }, 0);
}

function hideExplanationOnClickOutside(event) {
    if (!explanationArea) return;
    if (!explanationArea.contains(event.target) && !event.target.classList.contains('help-button')) {
        explanationArea.style.display = 'none';
    } else {
        document.addEventListener('click', hideExplanationOnClickOutside, { once: true, capture: true });
    }
}

function loadSettings() {
  chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
        console.warn("Error loading settings, using defaults:", chrome.runtime.lastError.message);
        items = { ...defaultSettings };
    }
    const settings = { ...defaultSettings, ...items };
    visibilityToggle.checked = settings.isVisible;
    sizeSlider.value = settings.overlaySize;
    sizeValueSpan.textContent = `${settings.overlaySize}px`;
    opacitySlider.value = Math.round(settings.overlayOpacity * 100);
    opacityValueSpan.textContent = `${opacitySlider.value}%`;
    for (const key in infoToggles) {
      if (infoToggles[key] && settings.hasOwnProperty(key)) {
        infoToggles[key].checked = settings[key];
      }
    }
  });
}

// スロットル用のタイマーIDと最終実行時間
let saveSettingsTimer = null;
const THROTTLE_DELAY = 100; // ms単位で間引き時間を設定 (100ms = 0.1秒)

function throttledSaveSettings() {
    if (saveSettingsTimer) {
        clearTimeout(saveSettingsTimer);
    }
    saveSettingsTimer = setTimeout(() => {
        actualSaveSettings();
        saveSettingsTimer = null;
    }, THROTTLE_DELAY);
}

function actualSaveSettings() {
  const isVisible = visibilityToggle.checked;
  const overlaySize = parseInt(sizeSlider.value, 10);
  const overlayOpacity = parseInt(opacitySlider.value, 10) / 100;

  const infoSettings = {};
  for (const key in infoToggles) {
    if (infoToggles[key]) { infoSettings[key] = infoToggles[key].checked; }
  }
  const settingsToSave = { isVisible, overlaySize, overlayOpacity, ...infoSettings };

  chrome.storage.sync.set(settingsToSave, () => {
    if (chrome.runtime.lastError) {
        console.warn("Error saving settings:", chrome.runtime.lastError.message);
    }
    // ストレージへの保存が完了してからcontent scriptに通知
    notifyContentScript({ type: 'SETTINGS_UPDATED', payload: settingsToSave });
  });
}


function notifyContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.youtube.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError && 
            !chrome.runtime.lastError.message.includes("The message port closed before a response was received.") &&
            !chrome.runtime.lastError.message.includes("Could not establish connection. Receiving end does not exist.")) {
            // 無視できる一般的なエラー以外を警告
          console.warn("Error sending message to content script:", chrome.runtime.lastError.message);
        }
      });
    }
  });
}

// Event Listeners
visibilityToggle.addEventListener('change', actualSaveSettings); // トグルは即時保存

sizeSlider.addEventListener('input', () => {
    sizeValueSpan.textContent = `${sizeSlider.value}px`;
    throttledSaveSettings(); // スライダー操作中は間引いて保存・通知
});
// sizeSlider.addEventListener('change', actualSaveSettings); // inputで処理するので通常は不要だが、フォールバックとして残しても良い

opacitySlider.addEventListener('input', () => {
    opacityValueSpan.textContent = `${opacitySlider.value}%`;
    throttledSaveSettings(); // スライダー操作中は間引いて保存・通知
});
// opacitySlider.addEventListener('change', actualSaveSettings); // 同上

for (const key in infoToggles) {
  if (infoToggles[key]) { infoToggles[key].addEventListener('change', actualSaveSettings); } // チェックボックスも即時保存
}

document.querySelectorAll('.help-button').forEach(button => {
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = e.target.id.replace('help-', '');
        showExplanation(key);
    });
});

document.addEventListener('DOMContentLoaded', loadSettings);