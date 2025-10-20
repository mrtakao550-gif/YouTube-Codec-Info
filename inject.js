// inject.js (Release v2.3.1 - Log Level Adjustment)
// console.log("[Inject] Script running (v2.3.1)"); // 必要なら起動ログは残す

const CODECS_LINE_PREFIX = "Codecs";

function extractPlaybackItags(player) {
    if (!player || typeof player.getDebugText !== 'function') {
        return null;
    }
    try {
        const debugText = player.getDebugText();
        if (typeof debugText !== 'string' || !debugText.trim()) {
            return null;
        }
        const codecLine = debugText.split(/\r?\n/).find(line => line.startsWith(CODECS_LINE_PREFIX));
        if (!codecLine) {
            return null;
        }
        const parts = codecLine.replace(/^Codecs\s+/, '').split(/\s*\/\s*/);
        const parsePart = (part) => {
            if (!part) {
                return null;
            }
            const match = part.match(/(.+?)\s*\((\d+)\)/);
            if (!match) {
                return null;
            }
            return {
                codec: match[1].trim(),
                itag: match[2].trim(),
            };
        };
        return {
            video: parsePart(parts[0]),
            audio: parsePart(parts[1]),
        };
    } catch (err) {
        console.debug("[Inject] Failed to parse getDebugText output:", err);
        return null;
    }
}

if (window.codecInfoInjectListenerAttached) {
    // Listener already attached.
} else {
    window.codecInfoInjectListenerAttached = true;

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data || event.data.type !== "GET_CODEC_INFO") {
            return;
        }

        let codecInfo = null;
        const player = document.getElementById('movie_player');

        try {
            if (!player) {
                // この警告は重要なので残す
                console.warn("[Inject] Movie player element (#movie_player) not found.");
                window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "Player element not found" }, "*");
                return;
            }

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

            if (!playerResponse) {
                 // ★変更箇所: console.warn から console.debug に変更
                 console.debug("[Inject] Could not retrieve playerResponse data. This can be normal during page load or transitions.");
                 window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "Could not retrieve playerResponse" }, "*");
                 return;
            }

            // ... (以降のフォーマット解析、コーデック情報生成ロジックは変更なし) ...
            if (playerResponse && playerResponse.streamingData) {
                const videoDetails = playerResponse.videoDetails;
                const streamingData = playerResponse.streamingData;
                const adaptiveFormats = streamingData.adaptiveFormats || [];
                const formats = streamingData.formats || [];
                const allFormats = [...adaptiveFormats, ...formats];

                if (allFormats.length === 0) {
                     console.warn("[Inject] No formats found in streamingData."); // これは重要な警告なので残す
                     window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "No formats found" }, "*");
                     return;
                }

                let currentQualityLabel = null;
                let currentHeight = null;
                let currentItag = null;
                let debugVideoItag = null;
                let debugAudioItag = null;
                let debugVideoCodec = null;
                let debugAudioCodec = null;

                if (typeof player.getPlaybackQuality === 'function') {
                    currentQualityLabel = player.getPlaybackQuality();
                }
                if (typeof player.getVideoData === 'function') {
                    const videoData = player.getVideoData();
                    if (videoData) {
                        currentItag = videoData.itag;
                        const playerHeight = (typeof player.getVideoHeight === 'function') ? player.getVideoHeight() : 0;
                        currentHeight = playerHeight > 0 ? playerHeight : (videoData.height || null);
                    }
                }
                if (currentHeight === null && typeof player.getVideoHeight === 'function') {
                    currentHeight = player.getVideoHeight();
                    if (currentHeight === 0) currentHeight = null;
                }

                const playbackFromDebug = extractPlaybackItags(player);
                if (playbackFromDebug) {
                    if (playbackFromDebug.video) {
                        debugVideoItag = playbackFromDebug.video.itag || null;
                        debugVideoCodec = playbackFromDebug.video.codec || null;
                    }
                    if (playbackFromDebug.audio) {
                        debugAudioItag = playbackFromDebug.audio.itag || null;
                        debugAudioCodec = playbackFromDebug.audio.codec || null;
                    }
                }

                let currentVideoFormat = null;

                if (debugVideoItag) {
                    currentVideoFormat = allFormats.find(f => String(f.itag) === String(debugVideoItag) && f.mimeType?.startsWith('video/'));
                    if (!currentVideoFormat) {
                        currentVideoFormat = allFormats.find(f => String(f.itag) === String(debugVideoItag));
                    }
                }

                if (!currentVideoFormat && currentItag) {
                    currentVideoFormat = allFormats.find(f => String(f.itag) === String(currentItag) && f.mimeType?.startsWith('video/'));
                    if (!currentVideoFormat) {
                        currentVideoFormat = allFormats.find(f => String(f.itag) === String(currentItag));
                    }
                }

                if (!currentVideoFormat && (currentQualityLabel || currentHeight)) {
                    const normalizeQualityForComparison = (label) => {
                        if (!label) return null;
                        return String(label).toLowerCase().replace(/^hd/, '').replace(/p$/, '');
                    };
                    const targetQualityNumber = normalizeQualityForComparison(currentQualityLabel);

                    const filterAndSelect = (formatList) => {
                        let candidates = [];
                        if (targetQualityNumber) {
                            candidates = formatList.filter(f => {
                                if (!f.mimeType?.startsWith('video/')) return false;
                                const formatQualityNumber = normalizeQualityForComparison(f.qualityLabel);
                                if (formatQualityNumber === targetQualityNumber) return true;
                                if (f.height && String(f.height) === targetQualityNumber) return true;
                                return false;
                            });
                        }
                        if (candidates.length === 0 && currentHeight && currentHeight > 0) {
                            candidates = formatList.filter(f => f.mimeType?.startsWith('video/') && f.height === currentHeight);
                        }
                        if (candidates.length > 0) {
                            return candidates.find(f => f.mimeType?.toLowerCase().includes('av01')) ||
                                   candidates.find(f => f.mimeType?.toLowerCase().includes('vp09') || f.mimeType?.toLowerCase().includes('vp9')) ||
                                   candidates.find(f => f.mimeType?.toLowerCase().includes('avc1')) ||
                                   candidates[0];
                        }
                        return null;
                    };
                    currentVideoFormat = filterAndSelect(adaptiveFormats);
                    if (!currentVideoFormat) {
                        currentVideoFormat = filterAndSelect(formats);
                    }
                }

                if (!currentVideoFormat) {
                    currentVideoFormat =
                        allFormats.find(f => f.mimeType?.toLowerCase().includes('av01') && f.mimeType?.startsWith('video/')) ||
                        allFormats.find(f => (f.mimeType?.toLowerCase().includes('vp09') || f.mimeType?.toLowerCase().includes('vp9')) && f.mimeType?.startsWith('video/')) ||
                        allFormats.find(f => f.mimeType?.toLowerCase().includes('avc1') && f.mimeType?.startsWith('video/')) ||
                        allFormats.find(f => f.mimeType?.startsWith('video/'));
                }

                let currentAudioFormat = null;
                const allAudioFormats = allFormats.filter(f => f.mimeType?.startsWith('audio/'));
                if (debugAudioItag) {
                    currentAudioFormat =
                        allAudioFormats.find(f => String(f.itag) === String(debugAudioItag)) ||
                        allFormats.find(f => String(f.itag) === String(debugAudioItag));
                }
                if (!currentAudioFormat && allAudioFormats.length > 0) {
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

                const videoCodecString =
                    currentVideoFormat?.mimeType?.match(/codecs="([^,"]+)/)?.[1] ||
                    debugVideoCodec ||
                    (currentVideoFormat?.mimeType?.includes('vp9') || currentVideoFormat?.mimeType?.includes('vp09') ? 'vp9' : null) ||
                    (currentVideoFormat?.mimeType?.includes('av01') ? 'av01' : null) ||
                    (currentVideoFormat?.mimeType?.includes('avc1') ? 'avc1' : null);
                const audioCodecString =
                    currentAudioFormat?.mimeType?.match(/codecs="([^"]+)"/)?.[1] ||
                    debugAudioCodec;

                codecInfo = {
                    videoCodec: videoCodecString ? videoCodecString.split('.')[0] : (currentVideoFormat ? 'N/A' : null),
                    audioCodec: audioCodecString ? audioCodecString.split('.')[0] : (currentAudioFormat ? 'N/A' : null),
                    qualityLabel: currentVideoFormat?.qualityLabel,
                    resolution: currentVideoFormat?.width && currentVideoFormat?.height ? `${currentVideoFormat.width}x${currentVideoFormat.height}` : null,
                    width: currentVideoFormat?.width,
                    height: currentVideoFormat?.height,
                    fps: currentVideoFormat?.fps,
                    audioSampleRate: currentAudioFormat?.audioSampleRate,
                    audioChannels: currentAudioFormat?.audioChannels,
                    colorInfo: currentVideoFormat?.colorInfo,
                    isLive: videoDetails?.isLive || false,
                    isDash: streamingData.dashManifestUrl !== undefined,
                    isMsl: streamingData.hlsManifestUrl !== undefined,
                };

            } else {
                console.warn("[Inject] streamingData not found in playerResponse."); // これは重要な警告なので残す
                window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: "streamingData not found" }, "*");
                return;
            }
        } catch (error) {
            console.error("[Inject] Error in GET_CODEC_INFO processing:", error, error.stack); // 致命的なエラーは残す
            window.postMessage({ type: "CODEC_INFO_RESULT", payload: null, error: error.message }, "*");
            return;
        }
        window.postMessage({ type: "CODEC_INFO_RESULT", payload: codecInfo }, "*");
    }, false);
}