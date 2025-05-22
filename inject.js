// inject.js (完全な修正案 2025-05-22)

// デバッグフラグ
const DEBUG_THIS_ISSUE = false; // 問題解析時に true にする (通常は false)
const VERBOSE_LOGGING = false;  // 詳細ログが必要な場合に true にする (通常は false)

if (window.codecInfoInjectListenerAttached) {
    if (VERBOSE_LOGGING) console.log("[Inject] Listener already attached. Skipping setup.");
} else {
    window.codecInfoInjectListenerAttached = true;
    if (VERBOSE_LOGGING) console.log("[Inject] Script running (VP9 Fix Attempt). Setting up listener.");

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data || event.data.type !== "GET_CODEC_INFO") {
            return;
        }

        if (VERBOSE_LOGGING) console.log("[Inject] Received GET_CODEC_INFO request.");

        let codecInfo = null;
        const player = document.getElementById('movie_player');

        try {
            if (!player) {
                console.warn("[Inject] Movie player element (#movie_player) not found.");
                window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "Player element not found" }, "*");
                return;
            }

            // --- Player Response Acquisition ---
            let playerResponse = null;
            if (typeof player.getPlayerResponse === 'function') {
                playerResponse = player.getPlayerResponse();
            }
            if (!playerResponse && window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.player_response) {
                try {
                    playerResponse = typeof window.ytplayer.config.args.player_response === 'string'
                        ? JSON.parse(window.ytplayer.config.args.player_response)
                        : window.ytplayer.config.args.player_response;
                } catch (e) {
                    console.error("[Inject] Error parsing ytplayer.config.args.player_response:", e);
                    playerResponse = null;
                }
            }
            // --- End Player Response Acquisition ---

            if (!playerResponse) {
                 console.warn("[Inject] Could not retrieve playerResponse data.");
                 window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "Could not retrieve playerResponse" }, "*");
                 return;
            }

            if (playerResponse && playerResponse.streamingData) {
                const videoDetails = playerResponse.videoDetails;
                const streamingData = playerResponse.streamingData;
                const adaptiveFormats = streamingData.adaptiveFormats || [];
                const formats = streamingData.formats || [];
                const allFormats = [...adaptiveFormats, ...formats];

                if (allFormats.length === 0) {
                     console.warn("[Inject] No formats found in streamingData.");
                     window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "No formats found" }, "*");
                     return;
                }

                // --- Get Current Playback State ---
                let currentQualityLabel = null;
                let currentHeight = null; // Prefer null if not reliably obtainable
                let currentItag = null;

                if (typeof player.getPlaybackQuality === 'function') {
                    currentQualityLabel = player.getPlaybackQuality(); // e.g., "hd2160", "hd1080"
                }
                if (typeof player.getVideoData === 'function') {
                    const videoData = player.getVideoData();
                    if (videoData) {
                        currentItag = videoData.itag; // Can be undefined
                        // player.getVideoHeight() might return 0, videoData.height might be more reliable if available
                        const playerHeight = (typeof player.getVideoHeight === 'function') ? player.getVideoHeight() : 0;
                        currentHeight = playerHeight > 0 ? playerHeight : (videoData.height || null);
                    }
                }
                if (currentHeight === null && typeof player.getVideoHeight === 'function') {
                    currentHeight = player.getVideoHeight(); // Fallback, but could be 0
                    if (currentHeight === 0) currentHeight = null; // Treat 0 as unreliable
                }
                // --- End Playback State ---

                if (DEBUG_THIS_ISSUE) {
                    console.log('%c[Inject DEBUG] --- Current Playback State ---', 'color: yellow; font-weight: bold;');
                    console.log(`%c[Inject DEBUG] Itag (from getVideoData): ${currentItag}`, 'color: yellow;');
                    console.log(`%c[Inject DEBUG] QualityLabel (from getPlaybackQuality): ${currentQualityLabel}`, 'color: yellow;');
                    console.log(`%c[Inject DEBUG] Height (processed): ${currentHeight}px`, 'color: yellow;');
                    console.log('%c[Inject DEBUG] --- Available Adaptive Formats for Matching ---', 'color: violet; font-weight: bold;');
                    adaptiveFormats.forEach((format, index) => {
                         console.log(`%c[Inject DEBUG] adaptiveFormat[${index}]: itag=${format.itag}, mime=${format.mimeType}, qualityLabel=${format.qualityLabel}, height=${format.height}`, 'color: violet;');
                    });
                }

                // --- Video Format Estimation ---
                currentVideoFormat = null; // Initialize

                // 1. Try to find by currentItag if available
                if (currentItag) {
                    currentVideoFormat = allFormats.find(f => f.itag === currentItag && f.mimeType?.startsWith('video/'));
                    if (VERBOSE_LOGGING && currentVideoFormat) console.log(`[Inject] Matched by itag: ${currentItag} -> ${currentVideoFormat.mimeType}`);
                }

                // 2. If not found by itag, try by qualityLabel and/or height
                if (!currentVideoFormat && (currentQualityLabel || currentHeight)) {
                    const normalizeQualityForComparison = (label) => {
                        if (!label) return null;
                        // "hd2160" -> "2160", "1080p" -> "1080", "2160p" -> "2160"
                        return String(label).toLowerCase().replace(/^hd/, '').replace(/p$/, '');
                    };
                    const targetQualityNumber = normalizeQualityForComparison(currentQualityLabel); // e.g., "2160" or "1440"

                    const filterAndSelect = (formatList) => {
                        let candidates = [];
                        if (targetQualityNumber) { // Prefer matching by quality number if currentQualityLabel is available
                            candidates = formatList.filter(f => {
                                if (!f.mimeType?.startsWith('video/')) return false;
                                const formatQualityNumber = normalizeQualityForComparison(f.qualityLabel);
                                if (formatQualityNumber === targetQualityNumber) return true;
                                // As a fallback for quality, check if height matches the number derived from qualityLabel (e.g. 2160p vs height 2160)
                                if (f.height && String(f.height) === targetQualityNumber) return true;
                                return false;
                            });
                             if (VERBOSE_LOGGING || DEBUG_THIS_ISSUE) console.log(`[Inject DEBUG] Candidates by targetQualityNumber (${targetQualityNumber}):`, candidates.map(c => ({itag:c.itag, qL:c.qualityLabel, h:c.height,mime:c.mimeType})));
                        }

                        // If no candidates by quality OR if currentQualityLabel was not available, AND currentHeight is valid
                        if (candidates.length === 0 && currentHeight && currentHeight > 0) {
                            candidates = formatList.filter(f => f.mimeType?.startsWith('video/') && f.height === currentHeight);
                            if (VERBOSE_LOGGING || DEBUG_THIS_ISSUE) console.log(`[Inject DEBUG] Candidates by currentHeight (${currentHeight}):`, candidates.map(c => ({itag:c.itag, qL:c.qualityLabel, h:c.height,mime:c.mimeType})));
                        }
                        
                        if (candidates.length > 0) {
                            return candidates.find(f => f.mimeType?.toLowerCase().includes('av01')) ||
                                   candidates.find(f => f.mimeType?.toLowerCase().includes('vp09') || f.mimeType?.toLowerCase().includes('vp9')) ||
                                   candidates.find(f => f.mimeType?.toLowerCase().includes('avc1')) ||
                                   candidates[0]; // Fallback to the first candidate if no preferred codec found
                        }
                        return null;
                    };

                    currentVideoFormat = filterAndSelect(adaptiveFormats);
                    if (!currentVideoFormat) { // If not in adaptive, try regular formats
                        currentVideoFormat = filterAndSelect(formats);
                    }
                     if (VERBOSE_LOGGING && currentVideoFormat) console.log(`[Inject] Matched by quality/height logic -> ${currentVideoFormat.mimeType}`);
                }

                // 3. Absolute Fallback (if still no format is selected)
                if (!currentVideoFormat) {
                    if (VERBOSE_LOGGING) console.warn("[Inject] No specific format matched. Using general codec preference fallback.");
                    currentVideoFormat =
                        allFormats.find(f => f.mimeType?.toLowerCase().includes('av01') && f.mimeType?.startsWith('video/')) ||
                        allFormats.find(f => (f.mimeType?.toLowerCase().includes('vp09') || f.mimeType?.toLowerCase().includes('vp9')) && f.mimeType?.startsWith('video/')) ||
                        allFormats.find(f => f.mimeType?.toLowerCase().includes('avc1') && f.mimeType?.startsWith('video/')) ||
                        allFormats.find(f => f.mimeType?.startsWith('video/')); // Last resort: any video format
                    if (VERBOSE_LOGGING && currentVideoFormat) console.log(`[Inject] Matched by general fallback -> ${currentVideoFormat.mimeType}`);
                }
                // --- End Video Format Estimation ---


                // --- Audio Format Estimation (no changes from previous logic) ---
                let currentAudioFormat = null;
                const allAudioFormats = allFormats.filter(f => f.mimeType?.startsWith('audio/'));
                if (allAudioFormats.length > 0) {
                    const opusFormats = allAudioFormats.filter(f => f.mimeType?.includes('opus'));
                    const aacFormats = allAudioFormats.filter(f => f.mimeType?.includes('mp4a'));
                    const otherAudioFormats = allAudioFormats.filter(f => !f.mimeType?.includes('opus') && !f.mimeType?.includes('mp4a'));
                    let bestOpus = null;
                    if (opusFormats.length > 0) { opusFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)); bestOpus = opusFormats[0]; }
                    let bestAac = null;
                    if (aacFormats.length > 0) { aacFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)); bestAac = aacFormats[0]; }
                    let bestOther = null;
                    if (otherAudioFormats.length > 0) { otherAudioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)); bestOther = otherAudioFormats[0]; }
                    if (bestOpus) { currentAudioFormat = bestOpus; }
                    else if (bestAac) { currentAudioFormat = bestAac; }
                    else if (bestOther){ currentAudioFormat = bestOther; }
                }
                // --- End Audio Format Estimation ---

                const videoCodecString = currentVideoFormat?.mimeType?.match(/codecs="([^,"]+)/)?.[1] ||
                                     (currentVideoFormat?.mimeType?.includes('vp9') || currentVideoFormat?.mimeType?.includes('vp09') ? 'vp9' : null) ||
                                     (currentVideoFormat?.mimeType?.includes('av01') ? 'av01' : null) ||
                                     (currentVideoFormat?.mimeType?.includes('avc1') ? 'avc1' : null);


                const audioCodecString = currentAudioFormat?.mimeType?.match(/codecs="([^"]+)"/)?.[1];

                codecInfo = {
                    videoCodec: videoCodecString ? videoCodecString.split('.')[0] : (currentVideoFormat ? 'N/A' : null),
                    audioCodec: audioCodecString ? audioCodecString.split('.')[0] : (currentAudioFormat ? 'N/A' : null),
                    qualityLabel: currentVideoFormat?.qualityLabel,
                    resolution: currentVideoFormat?.width && currentVideoFormat?.height ? `${currentVideoFormat.width}x${currentVideoFormat.height}` : null,
                    width: currentVideoFormat?.width,
                    height: currentVideoFormat?.height,
                    fps: currentVideoFormat?.fps,
                    // bitrate: currentVideoFormat?.bitrate, // ビットレートは現在表示していない
                    // audioBitrate: currentAudioFormat?.bitrate,
                    // itag: currentVideoFormat?.itag,
                    // audioItag: currentAudioFormat?.itag,
                    // mimeType: currentVideoFormat?.mimeType, // デバッグ用
                    // audioMimeType: currentAudioFormat?.mimeType, // デバッグ用
                    audioSampleRate: currentAudioFormat?.audioSampleRate,
                    audioChannels: currentAudioFormat?.audioChannels,
                    colorInfo: currentVideoFormat?.colorInfo,
                    isLive: videoDetails?.isLive || false,
                    isDash: streamingData.dashManifestUrl !== undefined,
                    isMsl: streamingData.hlsManifestUrl !== undefined,
                };

                if (DEBUG_THIS_ISSUE || VERBOSE_LOGGING) console.log("[Inject] Final determined codecInfo:", JSON.stringify(codecInfo, null, 2));

            } else {
                console.warn("[Inject] streamingData not found in playerResponse.");
                window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "streamingData not found" }, "*");
                return;
            }
        } catch (error) {
            console.error("[Inject] Error in GET_CODEC_INFO processing:", error, error.stack);
            window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: error.message }, "*");
            return; // return を忘れない
        }
        window.postMessage({ type: "CODEC_INFO_RESULT", payload: codecInfo }, "*");
    }, false);
}