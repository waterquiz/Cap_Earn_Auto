
// Helper to turn overlay border from RED to BLACK on unsolvable / error
const setOverlayUnsolvable = async (targetFrame) => {
    try {
        if (!targetFrame) return;
        await targetFrame.executeJavaScript(`
            (function() {
                const outerBorder = document.getElementById('hca-outer-red-border');
                if (outerBorder) {
                    outerBorder.style.border = '3px solid #000000';
                    outerBorder.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.9)';
                } else {
                    const mainContainer = document.querySelector('.challenge-view')
                        || document.querySelector('.challenge-container')
                        || document.querySelector('canvas')
                        || document.body;
                    if (mainContainer) {
                        const cr = mainContainer.getBoundingClientRect();
                        const b = document.createElement('div');
                        b.id = 'hca-outer-red-border';
                        b.setAttribute('data-hca-overlay', '1');
                        b.style.cssText = [
                            'position:fixed',
                            'z-index:2147483646',
                            'pointer-events:none',
                            'box-sizing:border-box',
                            'border:3px solid #000000',
                            'box-shadow:0 0 12px rgba(0, 0, 0, 0.9)',
                            'border-radius:4px',
                            'background:transparent',
                            'left:' + Math.round(cr.left) + 'px',
                            'top:' + Math.round(cr.top) + 'px',
                            'width:' + Math.round(cr.width) + 'px',
                            'height:' + Math.round(cr.height) + 'px'
                        ].join(';');
                        document.body.appendChild(b);
                    }
                }
            })();
        `).catch(() => {});
    } catch(e) {}
};
const { app, webFrameMain, net, ipcMain, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// Load CaptchaSonic / CaptchaAI Userscript
let captchaSonicUserscript = '';
try {
    const csScriptPath = path.join(__dirname, 'extensions', 'captchasonic-userscript.js');
    if (fs.existsSync(csScriptPath)) {
        captchaSonicUserscript = fs.readFileSync(csScriptPath, 'utf8');
        console.log("[Force-Inject] ⚡ Loaded CaptchaSonic Userscript for hCaptcha solving.");
    }
} catch(e) {
    console.warn("[Force-Inject] Failed to read CaptchaSonic script:", e.message);
}

// Load JA CAPTCHA reCAPTCHA v2 Local AI Solver Userscript
let recaptchaV2LocalUserscript = '';
try {
    const rv2ScriptPath = path.join(__dirname, 'extensions', 'recaptcha_v2_solver.user.js');
    if (fs.existsSync(rv2ScriptPath)) {
        recaptchaV2LocalUserscript = fs.readFileSync(rv2ScriptPath, 'utf8');
        console.log("[Force-Inject] 🤖 Loaded JA CAPTCHA reCAPTCHA v2 Local AI Solver Userscript.");
    } else {
        console.warn("[Force-Inject] recaptcha_v2_solver.user.js not found in extensions/");
    }
} catch(e) {
    console.warn("[Force-Inject] Failed to read reCAPTCHA v2 Local solver script:", e.message);
}

let isAutoSolveEnabled = true;
let autoSolveMode = 'recaptcha_v2_local'; // 'recaptcha_v2_local' | 'audio' | 'false'
let solverEngine = 'captchasonic'; // 'captchasonic' (Default: CaptchaSonic/CaptchaAI for hCaptcha) | 'custom_url' (Custom Qwen API URL solv// Helper to trigger SKIP button specifically on the target captcha slot within the panel / webContents
const triggerGlobalSkip = async (frame, contents) => {
    // Cooldown check per-frame (minimum 1.5s between skip clicks on the same frame to prevent duplicate clicks)
    if (frame && frame.__lastSkipTime && (Date.now() - frame.__lastSkipTime < 1500)) {
        console.log("[Force-Inject] ⏳ Skip trigger cooldown active on this captcha slot, waiting for reload...");
        return false;
    }

    console.log("[Force-Inject] ⚡ Attempting to click corresponding amber/yellow SKIP button for this captcha slot...");
    
    const targetFrameUrl = (frame && frame.url) ? frame.url : '';

    // Script to execute inside the panel DOM
    const skipScript = `
        (() => {
            try {
                const targetFrameUrl = ${JSON.stringify(targetFrameUrl)};
                const targetWcId = ${contents ? contents.id : 'null'};
                
                // Helper to extract 'c' token from URL
                function getCToken(url) {
                    if (!url) return '';
                    const m = url.match(/[?&]c=([^&#]+)/);
                    return m ? decodeURIComponent(m[1]) : '';
                }
                const targetC = getCToken(targetFrameUrl);

                // 1. Locate the exact error webview or iframe in the main document
                let slotCenterX = null;
                
                // A. Try finding by matching webContents ID
                if (targetWcId) {
                    const allWebviews = Array.from(document.querySelectorAll('webview'));
                    const matchingWv = allWebviews.find(wv => {
                        try { return wv.getWebContentsId() === targetWcId; } catch(e){ return false; }
                    });
                    if (matchingWv) {
                        const wvRect = matchingWv.getBoundingClientRect();
                        slotCenterX = wvRect.left + (wvRect.width > 0 ? wvRect.width / 2 : 0);
                        console.log("[Force-Inject] Matched error <webview> by webContentsId=" + targetWcId + " at x=" + Math.round(slotCenterX));
                    }
                }

                // B. Try finding by matching iframe in document
                if (slotCenterX === null) {
                    const allIframes = Array.from(document.querySelectorAll('iframe'));
                    let matchingIframe = null;
                    if (targetC) {
                        matchingIframe = allIframes.find(f => f.src && f.src.includes('c=' + targetC));
                    }
                    if (!matchingIframe && targetFrameUrl) {
                        matchingIframe = allIframes.find(f => f.src && (f.src === targetFrameUrl || f.src.split('#')[0] === targetFrameUrl.split('#')[0]));
                    }
                    if (!matchingIframe) {
                        matchingIframe = allIframes.find(f => f.src && (f.src.includes('bframe') || f.src.includes('frame=challenge') || f.src.includes('recaptcha')));
                    }
                    if (matchingIframe) {
                        const ifrRect = matchingIframe.getBoundingClientRect();
                        slotCenterX = ifrRect.left + (ifrRect.width > 0 ? ifrRect.width / 2 : 0);
                        console.log("[Force-Inject] Matched error <iframe> at x=" + Math.round(slotCenterX));
                    }
                }

                // 2. Collect all candidate elements representing a SKIP button
                const allCandidateElements = [
                    ...Array.from(document.querySelectorAll('span[data-v-678938c8] button, button[data-v-678938c8], [data-v-678938c8] button, button.amber, button.lighten-2, button.v-btn.amber, .amber.lighten-2')),
                    ...Array.from(document.querySelectorAll('button, .v-btn, [role="button"]'))
                ];

                const allSkipButtons = [];
                for (let el of allCandidateElements) {
                    const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
                    const isAmber = el.classList && (el.classList.contains('amber') || el.classList.contains('lighten-2') || (typeof el.className === 'string' && el.className.includes('amber')));
                    const hasAttr = el.hasAttribute && (el.hasAttribute('data-v-678938c8') || el.closest('[data-v-678938c8]'));
                    if (txt === 'SKIP' || txt.startsWith('SKIP') || txt.includes('SKIP') || isAmber || (hasAttr && el.tagName === 'BUTTON')) {
                        const btn = el.closest('button') || el.closest('.v-btn') || el;
                        if (btn && !allSkipButtons.includes(btn)) {
                            allSkipButtons.push(btn);
                        }
                    }
                }

                // Sort all skip buttons from left to right
                allSkipButtons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

                console.log("[Force-Inject] Found " + allSkipButtons.length + " candidate Skip button(s) on panel");

                let targetBtn = null;

                // Match the Skip button closest horizontally to the error slot (slotCenterX)
                if (allSkipButtons.length === 1) {
                    targetBtn = allSkipButtons[0];
                } else if (allSkipButtons.length > 1) {
                    if (slotCenterX !== null) {
                        let minDistance = Infinity;
                        for (let btn of allSkipButtons) {
                            const bRect = btn.getBoundingClientRect();
                            const btnCenterX = bRect.left + bRect.width / 2;
                            const distance = Math.abs(btnCenterX - slotCenterX);
                            console.log("[Force-Inject] Skip button at x=" + Math.round(btnCenterX) + " (distance=" + Math.round(distance) + "px to error slot)");
                            if (distance < minDistance) {
                                minDistance = distance;
                                targetBtn = btn;
                            }
                        }
                    } else {
                        console.warn("[Force-Inject] ⚠️ Multiple skip buttons found but error slot position is undetermined. Avoiding blind click to protect working slots.");
                        return { success: false, reason: 'undetermined_slot' };
                    }
                }

                if (targetBtn) {
                    const btn = targetBtn.closest('button') || targetBtn.closest('.v-btn') || targetBtn;
                    
                    // Force-enable if disabled
                    try {
                        btn.removeAttribute('disabled');
                        btn.disabled = false;
                        btn.classList.remove('v-btn--disabled', 'disabled');
                        btn.removeAttribute('aria-disabled');
                        btn.style.pointerEvents = 'auto';
                    } catch(e){}

                    const rect = btn.getBoundingClientRect();
                    const cx = rect.left + (rect.width > 0 ? rect.width / 2 : 10);
                    const cy = rect.top + (rect.height > 0 ? rect.height / 2 : 10);

                    console.log("[Force-Inject] 🎯 Clicking single target Skip button at (" + Math.round(cx) + ", " + Math.round(cy) + ")");

                    const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0 };
                    
                    // Dispatch events on the button and wrapper span
                    const targets = [btn, btn.parentElement, btn.querySelector('.v-btn__content')].filter(Boolean);
                    for (let t of targets) {
                        ['mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'mousemove', 'mousedown', 'pointerdown'].forEach(evt => {
                            try { t.dispatchEvent(new PointerEvent(evt, opts)); } catch(e){}
                            try { t.dispatchEvent(new MouseEvent(evt, opts)); } catch(e){}
                        });
                        ['mouseup', 'pointerup', 'click'].forEach(evt => {
                            try { t.dispatchEvent(new PointerEvent(evt, opts)); } catch(e){}
                            try { t.dispatchEvent(new MouseEvent(evt, opts)); } catch(e){}
                        });
                        try { t.click(); } catch(e){}
                    }

                    // Trigger Vue component handlers ONLY on target button hierarchy
                    let p = btn;
                    while (p && p !== document.body) {
                        if (p.__vue__) {
                            const vm = p.__vue__;
                            try { vm.disabled = false; } catch(e){}
                            try { vm.$emit('click', new MouseEvent('click', opts)); } catch(e){}
                            const methods = ['skipCaptcha', 'skip', 'onSkip', 'btnSkip', 'skipHandler', 'nextCaptcha', 'next'];
                            for (let m of methods) {
                                if (typeof vm[m] === 'function') {
                                    try {
                                        console.log("[Force-Inject] Calling Vue component method on slot: " + m);
                                        vm[m]();
                                    } catch(e){}
                                }
                            }
                            break; // Stop at this slot component, never bubble to other slots
                        }
                        p = p.parentElement;
                    }

                    return { success: true, action: 'amber_skip_clicked', x: cx, y: cy, width: rect.width, height: rect.height };
                }
            } catch(err) {
                return { success: false, error: err.message };
            }
            return { success: false, reason: 'skip_button_not_found' };
        })()
    `;

    let clicked = false;

    // Collect ONLY the specific WebContents for this panel
    const targetWebContents = [];
    if (contents) {
        if (contents.hostWebContents && !contents.hostWebContents.isDestroyed()) {
            targetWebContents.push(contents.hostWebContents);
        }
        if (!contents.isDestroyed() && !targetWebContents.includes(contents)) {
            targetWebContents.push(contents);
        }
    }

    for (let targetWc of targetWebContents) {
        if (targetWc && targetWc.mainFrame && !targetWc.isDestroyed()) {
            try {
                const res = await targetWc.mainFrame.executeJavaScript(skipScript).catch(() => null);
                console.log("[Force-Inject] 🎯 SKIP execution on webContents result:", res);
                if (res && res.success) {
                    if (frame) frame.__lastSkipTime = Date.now();
                    if (res.x && res.y) {
                        try {
                            const zoom = (targetWc && typeof targetWc.getZoomFactor === 'function') ? targetWc.getZoomFactor() : 1.0;
                            const sx = Math.floor(res.x * zoom);
                            const sy = Math.floor(res.y * zoom);
                            targetWc.sendInputEvent({ type: 'mouseMove', x: sx, y: sy });
                            targetWc.sendInputEvent({ type: 'mouseDown', x: sx, y: sy, button: 'left', clickCount: 1 });
                            await new Promise(r => setTimeout(r, 50));
                            targetWc.sendInputEvent({ type: 'mouseUp', x: sx, y: sy, button: 'left', clickCount: 1 });
                        } catch(e){}
                    }
                    clicked = true;
                    break;
                }
            } catch(e){}
        }
    }

    return clicked;
};

// Initialize isAutoSolveEnabled and solverEngine from saved config if present
try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Load autoSolveMode — new string-based mode
        const rawMode = cfg.autoSolveChallenge;
        if (rawMode === 'false' || rawMode === false) {
            autoSolveMode = 'false';
            isAutoSolveEnabled = false;
        } else if (rawMode === 'audio') {
            autoSolveMode = 'audio';
            isAutoSolveEnabled = true;
        } else {
            // 'recaptcha_v2_local', true, undefined → JA CAPTCHA mode (default)
            autoSolveMode = 'recaptcha_v2_local';
            isAutoSolveEnabled = true;
        }

        // Load solverEngine (hCaptcha engine selector)
        const validEngines = ['captchasonic', 'custom_url'];
        if (cfg && cfg.solverEngine && validEngines.includes(cfg.solverEngine)) {
            solverEngine = cfg.solverEngine;
        } else {
            solverEngine = 'captchasonic'; // Default: CaptchaSonic for hCaptcha
        }
        console.log(`[Force-Inject] ⚙️ Initialized Config: autoSolveMode=${autoSolveMode}, isAutoSolveEnabled=${isAutoSolveEnabled}, solverEngine=${solverEngine}`);
    }
} catch(e){}

ipcMain.on('save-advanced-settings', (e, config) => {
    if (config) {
        // Handle new string-based autoSolveChallenge mode
        if (typeof config.autoSolveChallenge !== 'undefined') {
            const rawMode = config.autoSolveChallenge;
            if (rawMode === 'false' || rawMode === false) {
                autoSolveMode = 'false';
                isAutoSolveEnabled = false;
            } else if (rawMode === 'audio') {
                autoSolveMode = 'audio';
                isAutoSolveEnabled = true;
            } else {
                autoSolveMode = 'recaptcha_v2_local';
                isAutoSolveEnabled = true;
            }
            console.log('[Force-Inject] ⚙️ autoSolveMode updated to:', autoSolveMode, '| isAutoSolveEnabled:', isAutoSolveEnabled);
        }
        if (config.solverEngine && ['captchasonic', 'custom_url'].includes(config.solverEngine)) {
            solverEngine = config.solverEngine;
            console.log('[Force-Inject] ⚙️ solverEngine setting updated to:', solverEngine);
        }
    }
});

ipcMain.on('recaptcha-auto-solver-setting-changed', (e, isDisabled) => {
    isAutoSolveEnabled = !isDisabled;
    if (!isAutoSolveEnabled) autoSolveMode = 'false';
    console.log('[Force-Inject] ⚙️ autoSolveChallenge updated via setting-changed:', isAutoSolveEnabled);
});

ipcMain.on('trigger-global-skip', async (e) => {
    console.log("[Force-Inject] ⚡ Received 'trigger-global-skip' IPC signal!");
    try {
        if (e && e.sender && !e.sender.isDestroyed()) {
            await triggerGlobalSkip(null, e.sender);
            try { e.sender.send('trigger-panel-skip'); } catch(err){}
        }
    } catch(err) {
        console.error("[Force-Inject] Error in trigger-global-skip IPC handler:", err);
    }
});

// --- HIDE ELECTRON FOOTPRINT & BYPASS SSL CERTIFICATE ERRORS ---
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('excludeSwitches', 'enable-automation');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('test-type');

// Natively trust all certificates (bypasses SSL errors for proxies/mitm)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
});
// ---------------------------------------------------------------

const SPACE_URLS = {
    '3x3': 'https://autoblog128-recaptcha-solver-3x3.hf.space',
    '4x4': 'https://autoblog128-recaptcha-solver-4x4.hf.space'
};

const HF_TOKEN = process.env.HF_TOKEN || 'YOUR_HF_TOKEN';

console.log("[Force-Inject] Loaded successfully! Listening for web contents...");

app.on('web-contents-created', (e, contents) => {

    const humanMouseMoveAndClick = async (targetContents, targetX, targetY, options = {}) => {
        if (!targetContents || targetContents.isDestroyed()) return false;
        try {
            const {
                startOffsetX = Math.round((Math.random() - 0.5) * 30),
                startOffsetY = -50 - Math.round(Math.random() * 20), // Start ~50px above target
                steps = 15 + Math.floor(Math.random() * 6), // 15-20 Bézier movement steps
                holdTime = 80 + Math.floor(Math.random() * 60) // 80-140ms mouse click hold
            } = options;

            const startX = Math.round(targetX + startOffsetX);
            const startY = Math.round(targetY + startOffsetY);

            // Bézier control points for natural curved human hand movement
            const cp1X = startX + (targetX - startX) * 0.3 + (Math.random() - 0.5) * 12;
            const cp1Y = startY + (targetY - startY) * 0.3 + (Math.random() - 0.5) * 12;
            const cp2X = startX + (targetX - startX) * 0.7 + (Math.random() - 0.5) * 8;
            const cp2Y = startY + (targetY - startY) * 0.7 + (Math.random() - 0.5) * 8;

            // Move mouse along human trajectory from 50px above down to the target
            for (let i = 0; i <= steps; i++) {
                if (targetContents.isDestroyed()) return false;
                const t = i / steps;
                const curX = Math.round(
                    Math.pow(1 - t, 3) * startX +
                    3 * Math.pow(1 - t, 2) * t * cp1X +
                    3 * (1 - t) * Math.pow(t, 2) * cp2X +
                    Math.pow(t, 3) * targetX
                );
                const curY = Math.round(
                    Math.pow(1 - t, 3) * startY +
                    3 * Math.pow(1 - t, 2) * t * cp1Y +
                    3 * (1 - t) * Math.pow(t, 2) * cp2Y +
                    Math.pow(t, 3) * targetY
                );

                targetContents.sendInputEvent({ type: 'mouseMove', x: curX, y: curY });
                await new Promise(r => setTimeout(r, 12 + Math.random() * 8));
            }

            if (targetContents.isDestroyed()) return false;

            // Brief human settling hover
            await new Promise(r => setTimeout(r, 40 + Math.random() * 30));
            if (targetContents.isDestroyed()) return false;

            // Mouse Down
            targetContents.sendInputEvent({ type: 'mouseDown', x: targetX, y: targetY, button: 'left', clickCount: 1 });
            await new Promise(r => setTimeout(r, holdTime));
            if (targetContents.isDestroyed()) return false;

            // Mouse Up
            targetContents.sendInputEvent({ type: 'mouseUp', x: targetX, y: targetY, button: 'left', clickCount: 1 });
            await new Promise(r => setTimeout(r, 30 + Math.random() * 30));
            return true;
        } catch(e) {
            console.warn("[Force-Inject] humanMouseMoveAndClick error:", e.message);
            return false;
        }
    };

    const doNativeClick = async (frame, selector, isAnchor = false) => {
        try {
            // 1. Get the target's bounding box inside the iframe
            const rect = await frame.executeJavaScript(`
                (() => {
                    const el = document.querySelector('${selector}');
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { x: r.left, y: r.top, width: r.width, height: r.height };
                })()
            `);
            if (!rect) return false;

            // 2. Get the iframe's bounding box in the main frame
            let globalOffsetX = 0;
            let globalOffsetY = 0;
            try {
                const targetUrl = (frame && frame.url) ? frame.url : '';
                const keyword = isAnchor ? 'anchor' : 'bframe';
                const iframeOffset = await contents.mainFrame.executeJavaScript(`
                    (() => {
                        const targetUrl = ${JSON.stringify(targetUrl)};
                        const iframes = Array.from(document.querySelectorAll('iframe'));
                        // 1. Try exact or hash-stripped match
                        let match = iframes.find(f => f.src && (f.src === targetUrl || f.src.split('#')[0] === targetUrl.split('#')[0]));
                        if (!match && ${isAnchor}) {
                            // Find anchor / checkbox iframe specifically
                            match = iframes.find(f => f.src && (f.src.includes('frame=checkbox') || f.src.includes('frame=anchor') || f.src.includes('anchor')));
                        }
                        if (!match && !${isAnchor}) {
                            // Find challenge iframe specifically
                            match = iframes.find(f => f.src && (f.src.includes('frame=challenge') || f.src.includes('bframe') || f.src.includes('frame=task')));
                        }
                        if (!match) {
                            match = iframes.find(f => f.src && (f.src.includes('${keyword}') || f.src.includes('hcaptcha') || f.src.includes('recaptcha') || f.src.includes('captcha')));
                        }
                        if (match) {
                            const r = match.getBoundingClientRect();
                            return { x: r.left, y: r.top };
                        }
                        return { x: 0, y: 0 };
                    })()
                `);
                if (iframeOffset) {
                    globalOffsetX = iframeOffset.x;
                    globalOffsetY = iframeOffset.y;
                }
            } catch(err) {}

            // Also dispatch DOM click directly!
            await frame.executeJavaScript(`
                (() => {
                    const el = document.querySelector('${selector}');
                    if (el) {
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
                        ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                            try { el.dispatchEvent(new (evt.startsWith('pointer') ? PointerEvent : MouseEvent)(evt, opts)); } catch(e){}
                        });
                        if (typeof el.click === 'function') el.click();
                    }
                })()
            `).catch(() => {});

            // 3. Calculate absolute center with some jitter
            const paddingX = rect.width * 0.2;
            const paddingY = rect.height * 0.2;
            const zoom = (contents && typeof contents.getZoomFactor === 'function') ? contents.getZoomFactor() : 1.0;
            const finalX = Math.floor((globalOffsetX + rect.x + paddingX + Math.random() * (rect.width - paddingX*2)) * zoom);
            const finalY = Math.floor((globalOffsetY + rect.y + paddingY + Math.random() * (rect.height - paddingY*2)) * zoom);

            // 4. Dispatch humanized mouse movement from 50px above down into the button
            await humanMouseMoveAndClick(contents, finalX, finalY, { startOffsetY: -40 });
            return true;
        } catch(err) {
            console.error("[Force-Inject] nativeClick error:", err);
            return false;
        }
    };

    const transcribeAudio = async (audioUrl, lang) => {
        const serversList = [
            "https://engageub.pythonanywhere.com",
            "https://engageub1.pythonanywhere.com"
        ];

        const cleanAudioUrl = audioUrl.replace("recaptcha.net", "google.com");
        const cleanLang = lang.length < 1 ? "en-US" : lang;
        
        for (const server of serversList) {
            console.log(`[Force-Inject] Sending audio URL to transcription server: ${server}...`);
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per server
                
                const response = await fetch(server, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    body: `input=${encodeURIComponent(cleanAudioUrl)}&lang=${cleanLang}`,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const text = (await response.text()).trim();
                    console.log(`[Force-Inject] Server ${server} returned response: "${text}"`);
                    if (text && text !== "0" && !text.includes("<") && !text.includes(">") && text.length >= 2 && text.length <= 50) {
                        return text;
                    }
                } else {
                    console.log(`[Force-Inject] Server ${server} returned HTTP error: ${response.status}`);
                }
            } catch (err) {
                console.log(`[Force-Inject] Server ${server} failed:`, err.message);
            }
        }
        return null;
    };

    const runImageSolver = async (frame) => {
        try {
            const data = await frame.executeJavaScript(`window.getChallengeData()`);
            if (!data || !data.imageData) {
                console.log("[Force-Inject] Failed to get challenge data.");
                await frame.executeJavaScript(`window.isSolving = false;`);
                return;
            }

            let { gridType, challengeTitle, imageData } = data;
            console.log("[Force-Inject] Grid:", gridType, "Title:", challengeTitle);
            
            // Convert URL to Base64 if it fell back to URL
            if (imageData && imageData.startsWith('http')) {
                try {
                    console.log("[Force-Inject] Downloading tainted image URL via Electron net...");
                    const imgRes = await net.fetch(imageData);
                    if (imgRes.ok) {
                        const buffer = await imgRes.arrayBuffer();
                        imageData = "data:image/jpeg;base64," + Buffer.from(buffer).toString('base64');
                        console.log("[Force-Inject] Successfully converted image to Base64 via net.fetch.");
                    } else {
                        throw new Error("Failed to download image: HTTP " + imgRes.status);
                    }
                } catch (downloadErr) {
                    console.error("[Force-Inject] Image Download Error:", downloadErr);
                    await frame.executeJavaScript(`window.isSolving = false;`);
                    return;
                }
            }

            let solvingIteration = true;
            while (solvingIteration) {
                let predictData = null;

                try {
                    if (solverEngine === 'huggingface' || solverEngine === 'auto_switch') {
                        console.log("[Force-Inject] Routing to HuggingFace Inference API...");
                        try {
                            const numTiles = gridType === '4x4' ? 16 : 9;
                            const cols = gridType === '4x4' ? 4 : 3;
                            
                            // Execute logic inside the frame to draw tiles and call API directly from browser context
                            const hfPredictData = await frame.executeJavaScript(`
                                (async () => {
                                    const tileImages = [];
                                    const cols = ${cols};
                                    const numTiles = ${numTiles};
                                    for (let i = 0; i < numTiles; i++) {
                                        const tempCanvas = document.createElement('canvas');
                                        tempCanvas.width = 100;
                                        tempCanvas.height = 100;
                                        const ctx = tempCanvas.getContext('2d');
                                        
                                        const x = (i % cols) * 100;
                                        const y = Math.floor(i / cols) * 100;
                                        
                                        if (window.canvas) {
                                            ctx.drawImage(window.canvas, x, y, 100, 100, 0, 0, 100, 100);
                                        } else {
                                            let img = document.querySelector('.rc-imageselect-payload img');
                                            if (img) ctx.drawImage(img, x, y, 100, 100, 0, 0, 100, 100);
                                        }
                                        
                                        const dataUrl = tempCanvas.toDataURL('image/jpeg');
                                        const res = await fetch(dataUrl);
                                        const blob = await res.blob();
                                        tileImages.push({ index: i, blob });
                                    }
                                    
                                    const myToken = process.env.HF_TOKEN || 'YOUR_HF_TOKEN';
                                    const targetWord = "${challengeTitle}".toLowerCase();
                                    // reCAPTCHA objects dictionary mapping to generic terms
                                    const wordMap = {
                                        "bicycles": "bicycle", "crosswalks": "crosswalk", "motorcycles": "motorcycle",
                                        "traffic lights": "traffic light", "fire hydrants": "fire hydrant", "vehicles": "car",
                                        "buses": "bus", "stairs": "stairs", "chimneys": "chimney", "bridges": "bridge",
                                        "cars": "car", "taxis": "taxi", "tractors": "tractor", "palm trees": "palm tree"
                                    };
                                    
                                    let mappedTarget = targetWord;
                                    for (const [key, val] of Object.entries(wordMap)) {
                                        if (targetWord.includes(key)) mappedTarget = val;
                                    }
                                    
                                    let toClick = [];
                                    const fetchPromises = tileImages.map(async (tile) => {
                                        try {
                                            const response = await fetch('https://api-inference.huggingface.co/models/DannyLuna/recaptcha-classification-57k', {
                                                method: 'POST',
                                                headers: { 'Authorization': 'Bearer ' + myToken },
                                                body: tile.blob
                                            });
                                            if (response.ok) {
                                                const result = await response.json();
                                                if (result && result.length > 0) {
                                                    const topLabel = result[0].label.toLowerCase();
                                                    if (mappedTarget.includes(topLabel) || topLabel.includes(mappedTarget)) {
                                                        toClick.push(tile.index);
                                                    }
                                                }
                                            }
                                        } catch(e) {
                                            console.error("HF Inference error on tile", tile.index, e);
                                        }
                                    });
                                    await Promise.all(fetchPromises);
                                    toClick.sort((a,b) => a - b);
                                    return { tiles_to_click: toClick };
                                })()
                            `);
                            if (hfPredictData && hfPredictData.tiles_to_click) {
                                predictData = hfPredictData;
                            } else {
                                throw new Error("Invalid HF predict format");
                            }
                        } catch (err) {
                            console.error("[Force-Inject] HuggingFace API logic failed, falling back if auto_switch.", err);
                            if (solverEngine === 'auto_switch') {
                                predictData = null; // will fallback to sonic below
                            } else {
                                throw err;
                            }
                        }
                    }

                    if (!predictData) {
                        const url = SPACE_URLS[gridType];
                        console.log("[Force-Inject] Requesting prediction from Space API...", url);
                        
                        const response = await fetch(url + "/predict", {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + HF_TOKEN
                            },
                            body: JSON.stringify({ image: imageData, challenge_title: challengeTitle })
                        });
                        
                        const text = await response.text();
                        
                        if (!response.ok) {
                            console.log("[Force-Inject] API HTTP Error:", response.status);
                            if (text.includes("Preparing Space") || response.status === 503) {
                                console.log("[Force-Inject] Hugging Face Space is waking up. Waiting 5s before retry...");
                                await new Promise(r => setTimeout(r, 5000));
                                continue;
                            }
                            throw new Error("HTTP " + response.status);
                        }

                        try {
                            predictData = JSON.parse(text);
                        } catch (e) {
                            if (text.includes("Preparing Space") || text.includes("<!DOCTYPE")) {
                                console.log("[Force-Inject] Hugging Face Space is waking up (returned HTML). Waiting 5s before retry...");
                                await new Promise(r => setTimeout(r, 5000));
                                continue;
                            }
                            throw new Error("Invalid JSON response from API: " + e.message);
                        }
                    }
                    console.log("[Force-Inject] Prediction received:", predictData);

                    const tilesToClick = predictData.tiles_to_click || [];
                    if (tilesToClick.length === 0) {
                        console.log("[Force-Inject] No more tiles to click. Finalizing...");
                        // Native-click the verify button
                        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
                        await frame.executeJavaScript(`window.clickTile('#recaptcha-verify-button')`);
                        await frame.executeJavaScript(`window.isSolving = false;`);
                        solvingIteration = false;
                        break;
                    }

                    console.log("[Force-Inject] Clicking tiles:", tilesToClick);
                    
                    const cols = gridType === '4x4' ? 4 : 3;
                    for (const index of tilesToClick) {
                        // Build the selector for this tile
                        const tileSelector = await frame.executeJavaScript(
                            `window.getTileSelector(${index}, ${cols})`
                        );
                        if (!tileSelector) {
                            console.log('[Force-Inject] Could not find tile selector for index', index);
                            continue;
                        }

                        // Capture oldSrc before click
                        const oldSrc = await frame.executeJavaScript(`
                            (() => {
                                const tile = document.querySelector('${tileSelector}');
                                if (!tile) return null;
                                const img = tile.querySelector('img');
                                return img ? img.src : null;
                            })()
                        `);

                        // JS click inside bframe (isTrusted overridden — no coord offset needed)
                        console.log('[Force-Inject] Clicking tile', index, 'selector:', tileSelector);
                        await frame.executeJavaScript(`window.clickTile('${tileSelector}')`);

                        if (gridType === '3x3') {
                            await frame.executeJavaScript(`window.waitForNewTile(${index}, "${oldSrc || ''}")`);
                            await frame.executeJavaScript(`window.stitchTile(${index})`);
                        }
                        
                        // Human-paced inter-tile delay: 700–1400 ms
                        await new Promise(r => setTimeout(r, 700 + Math.random() * 700));
                    }

                    // Capture the final state for the next AI prediction
                    if (gridType === "4x4") {
                        console.log("[Force-Inject] Batch complete. Finalizing...");
                        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
                        await frame.executeJavaScript(`window.clickTile('#recaptcha-verify-button')`);
                        await frame.executeJavaScript(`window.isSolving = false;`);
                        isBframeSolving = false;
                        solvingIteration = false;
                    } else {
                        imageData = await frame.executeJavaScript(`window.canvas.toDataURL('image/jpeg')`);
                    }
                } catch (fetchErr) {
                    if (fetchErr.message && (fetchErr.message.includes('disposed') || fetchErr.message.includes('destroyed'))) {
                        console.log("[Force-Inject] 🎉 SUCCESS! Captcha challenge window was closed by Google, meaning it was solved perfectly!");
                    } else {
                        console.error("[Force-Inject] Fetch Error:", fetchErr);
                    }
                    try { await frame.executeJavaScript(`window.isSolving = false;`); } catch(e){}
                    isBframeSolving = false;
                    solvingIteration = false;
                }
            }
        } catch (err) {
            console.error("[Force-Inject] runImageSolver Error:", err);
            try { await frame.executeJavaScript(`window.isSolving = false;`); } catch(e){}
            isBframeSolving = false;
        }
    };

    // Shared flag: true while the bframe challenge is being solved
    let isBframeSolving = false;
    let audioAttemptCount = 0;
    let lastAudioUrl = "";
    let isSolving = false;

    contents.on('did-frame-finish-load', (e, isMainFrame, frameProcessId, frameRoutingId) => {
        try {
            let frame = null;
            if (webFrameMain && webFrameMain.fromId) {
                frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
            }
            
            if (!frame || !frame.url) return;

            // Remove Node/Electron globals for external HTTP/HTTPS frames to hide automation
            if (frame.url.startsWith('http')) {
                frame.executeJavaScript(`
                    (() => {
                        try {
                            if (navigator.webdriver !== undefined) {
                                Object.defineProperty(navigator, 'webdriver', {
                                    get: () => undefined,
                                    configurable: true
                                });
                            }
                        } catch(e) {}
                        try {
                            delete window.require;
                            delete window.process;
                            delete window.Buffer;
                            delete window.module;
                            delete window.exports;
                            delete window.electron;
                            delete window.ipcRenderer;
                        } catch(e) {}
                    })()
                `).catch(() => {});

                // NOTE: CaptchaSonic solver is injected specifically into hCaptcha challenge frames
                // below in the isHcaptchaChallenge block — not here for all HTTP frames.
            }

            // --- 0.0 AUTO-DETECT "TRY AGAIN LATER" / AUTOMATED QUERIES / DOSCAPTCHA BLOCK IN ALL FRAMES ---
            frame.executeJavaScript(`
                (() => {
                    if (window.__blockSkipWatcherAttached) return;
                    window.__blockSkipWatcherAttached = true;

                    function notifyBlocked() {
                        try {
                            const hasDoscaptcha = !!(
                                document.querySelector('.rc-doscaptcha') ||
                                document.querySelector('.rc-doscaptcha-body') ||
                                document.querySelector('.rc-doscaptcha-header') ||
                                document.querySelector('.rc-doscaptcha-footer')
                            );
                            const text = (document.body ? (document.body.innerText || document.body.textContent) : '') || '';
                            const isBlockedText = !!(
                                text.includes('Try again later') ||
                                text.includes('automated queries') ||
                                text.includes("can't process your request") ||
                                text.includes('Coba lagi nanti') ||
                                text.includes('Se ha detectado tráfico inusual') ||
                                text.includes('Scan this QR code') ||
                                text.includes('with your mobile device to verify') ||
                                text.includes('Pindai kode QR') ||
                                text.includes('Escanea este código QR') ||
                                text.includes('Scanne diesen QR-Code') ||
                                (text.includes('QR code') && text.includes('reCAPTCHA'))
                            );
                            if (hasDoscaptcha || isBlockedText) {
                                try { window.parent.postMessage({ type: 'CAPTCHA_AUTO_SKIP', reason: 'blocked' }, '*'); } catch(e){}
                                try { window.top.postMessage({ type: 'CAPTCHA_AUTO_SKIP', reason: 'blocked' }, '*'); } catch(e){}
                            }
                        } catch(e){}
                    }

                    setInterval(notifyBlocked, 500);
                    if (document.documentElement) {
                        new MutationObserver(notifyBlocked).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
                    }
                    notifyBlocked();
                })()
            `).catch(() => {});

            // --- 0. WHEEL SCROLL FORWARDING FOR PANELS ---
            frame.executeJavaScript(`
                (() => {
                    if (window.__panelWheelAttached) return;
                    window.__panelWheelAttached = true;
                    window.addEventListener('wheel', (e) => {
                        if (e && e.deltaY) {
                            try {
                                const { ipcRenderer } = require('electron');
                                ipcRenderer.send('scroll-ct-panels', { deltaY: e.deltaY > 0 ? 150 : -150 });
                                ipcRenderer.send('scroll-panels', e.deltaY > 0 ? 'down' : 'up');
                            } catch(err) {}
                        }
                    }, { passive: true });
                })()
            `).catch(() => {});

            // --- 0.1 AUTO-RESUME ON "TIMED OUT" (WAIT 5-10s RANDOM THEN CLICK GREEN PLAY ICON) ---
            if (isMainFrame || frame.url.includes('panel.html') || frame.url.includes('app2') || frame.url.startsWith('file://')) {
                frame.executeJavaScript(`
                    (() => {
                        if (window.__timedOutWatcherAttached) return;
                        window.__timedOutWatcherAttached = true;
                        
                        let isTimeoutPending = false;
                        let timeoutTimer = null;
                        let lastActionTime = 0;

                        function checkTimeoutAndAutoPlay() {
                            try {
                                const timeoutIcon = document.querySelector('.mdi-clock-alert-outline, [title="Solving timeout"], .yellow--text.mdi-clock-alert-outline');
                                let isTimedOut = false;

                                if (timeoutIcon && (timeoutIcon.offsetParent !== null || timeoutIcon.getBoundingClientRect().width > 0)) {
                                    isTimedOut = true;
                                } else {
                                    const headings = document.querySelectorAll('h1, h2, h3, div');
                                    for (let i = 0; i < headings.length; i++) {
                                        const el = headings[i];
                                        if (el.children.length === 0 && (el.textContent || '').trim().toLowerCase() === 'timed out') {
                                            if (el.offsetParent !== null || el.getBoundingClientRect().width > 0) {
                                                isTimedOut = true;
                                                break;
                                            }
                                        }
                                    }
                                }

                                if (isTimedOut) {
                                    if (!isTimeoutPending && (Date.now() - lastActionTime > 3000)) {
                                        isTimeoutPending = true;
                                        // Random delay between 5 to 10 seconds (5000ms - 10000ms)
                                        const waitMs = Math.floor(5000 + Math.random() * 5000);
                                        console.log("[Auto-Play] ⏳ 'Timed out' detected! Waiting " + (waitMs / 1000).toFixed(1) + "s (random 5-10s) before clicking green Start/Play icon...");

                                        if (timeoutTimer) clearTimeout(timeoutTimer);
                                        timeoutTimer = setTimeout(() => {
                                            clickPlayButton();
                                        }, waitMs);
                                    }
                                } else {
                                    if (isTimeoutPending && (Date.now() - lastActionTime > 2000)) {
                                        if (timeoutTimer) {
                                            clearTimeout(timeoutTimer);
                                            timeoutTimer = null;
                                        }
                                        isTimeoutPending = false;
                                    }
                                }
                            } catch(e) {}
                        }

                        function clickPlayButton() {
                            try {
                                const playIcon = document.querySelector('i.mdi-play-circle, .mdi-play-circle, [class*="mdi-play-circle"]');
                                let playBtn = playIcon ? (playIcon.closest('button') || playIcon.closest('.v-btn') || playIcon) : null;

                                if (!playBtn) {
                                    playBtn = document.querySelector('button .green--text, button.v-btn--icon');
                                }

                                if (playBtn) {
                                    console.log("[Auto-Play] ▶️ Found green Start/Play button! Clicking now...");
                                    const rect = playBtn.getBoundingClientRect();
                                    const x = rect.left + (rect.width > 0 ? rect.width / 2 : 10);
                                    const y = rect.top + (rect.height > 0 ? rect.height / 2 : 10);

                                    ['mouseover', 'mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((evtName, i) => {
                                        setTimeout(() => {
                                            try {
                                                playBtn.dispatchEvent(new MouseEvent(evtName, {
                                                    bubbles: true,
                                                    cancelable: true,
                                                    view: window,
                                                    clientX: x,
                                                    clientY: y
                                                }));
                                            } catch(e) {}
                                        }, i * 20);
                                    });

                                    setTimeout(() => {
                                        try {
                                            if (typeof playBtn.click === 'function') {
                                                playBtn.click();
                                            }
                                        } catch(e) {}
                                        lastActionTime = Date.now();
                                        isTimeoutPending = false;
                                        console.log("[Auto-Play] ✅ Clicked Start/Play button successfully.");
                                    }, 160);
                                } else {
                                    console.warn("[Auto-Play] ⚠️ Could not find Start/Play button on panel.");
                                    lastActionTime = Date.now();
                                    isTimeoutPending = false;
                                }
                            } catch(err) {
                                console.error("[Auto-Play] Error while clicking Start/Play button:", err);
                                lastActionTime = Date.now();
                                isTimeoutPending = false;
                            }
                        }

                        setInterval(checkTimeoutAndAutoPlay, 1000);
                        if (document.documentElement) {
                            new MutationObserver(checkTimeoutAndAutoPlay).observe(document.documentElement, { childList: true, subtree: true });
                        }
                    })()
                `).catch(() => {});
            }

            // --- 1. HANDLE ANCHOR FRAME (CHECKBOX - reCAPTCHA & hCaptcha) ---
            const isRecaptchaAnchor = (frame.url.includes('recaptcha') && (frame.url.includes('anchor') || frame.url.includes('frame=checkbox') || frame.url.includes('api2/anchor') || frame.url.includes('enterprise/anchor'))) && !frame.url.includes('bframe');
            const isHcaptchaAnchor = (frame.url.includes('hcaptcha.com') || frame.url.includes('assets.hcaptcha.com')) && (frame.url.includes('frame=checkbox') || frame.url.includes('frame=anchor')) && !frame.url.includes('frame=challenge') && !frame.url.includes('frame=task');

            if (isRecaptchaAnchor || isHcaptchaAnchor) {
                console.log("[Force-Inject] 🎯 Injecting into Captcha anchor iframe (reCAPTCHA/hCaptcha):", frame.url);

                // --- Inject JA CAPTCHA reCAPTCHA v2 Local AI Solver into anchor frame (auto-open) ---
                // Active when "JA Enabled (Auto Solve)" is selected
                if (isRecaptchaAnchor && autoSolveMode === 'recaptcha_v2_local' && recaptchaV2LocalUserscript) {
                    console.log("[Force-Inject] 🤖 Injecting JA CAPTCHA Local AI solver into reCAPTCHA anchor frame...");
                    frame.executeJavaScript(recaptchaV2LocalUserscript).catch(e => {
                        console.warn("[Force-Inject] JA CAPTCHA anchor injection error:", e.message);
                    });
                }

                let lastSolvedTime = 0;
                let lastClickTime  = 0;
                let isRunning      = false; // Prevents concurrent ticks

                let anchorInterval = setInterval(async () => {
                    try {
                        if (!frame || !frame.url || (typeof frame.isDestroyed === 'function' && frame.isDestroyed())) {
                            clearInterval(anchorInterval);
                            return;
                        }

                        // Prevent concurrent ticks
                        if (isRunning) return;
                        isRunning = true;

                        // If reCAPTCHA bframe is solving, skip
                        if (isBframeSolving) {
                            isRunning = false;
                            return;
                        }

                        // Cooldown after last checkbox click (4 seconds) — wait for challenge to open
                        if (Date.now() - lastClickTime < 4000) {
                            isRunning = false;
                            return;
                        }

                        // Check if hCaptcha or reCAPTCHA challenge popup is currently open and VISIBLE
                        const isChallengePopupOpen = await contents.mainFrame.executeJavaScript(`
                            (() => {
                                const iframes = Array.from(document.querySelectorAll('iframe'));
                                return iframes.some(f => {
                                    if (!f || !f.src) return false;
                                    const src = f.src.toLowerCase();
                                    const isChallenge = src.includes('bframe') ||
                                                        src.includes('frame=challenge') ||
                                                        src.includes('frame=task') ||
                                                        src.includes('hcaptcha-challenge') ||
                                                        (src.includes('hcaptcha.com') && (src.includes('challenge') || src.includes('task')));
                                    if (!isChallenge) return false;
                                    const rect = f.getBoundingClientRect();
                                    const style = window.getComputedStyle(f);
                                    const isVisible = rect.width > 50 && rect.height > 50 &&
                                                      style.display !== 'none' &&
                                                      style.visibility !== 'hidden' &&
                                                      parseFloat(style.opacity || '1') > 0.1 &&
                                                      rect.top >= -50 && rect.left >= -50;
                                    return isVisible;
                                });
                            })()
                        `).catch(() => false);

                        if (isChallengePopupOpen) {
                            isRunning = false;
                            return; // Challenge is open — don't click checkbox again
                        }

                        // Check if cooldown after a successful solve
                        if (lastSolvedTime > 0 && Date.now() - lastSolvedTime < 5000) {
                            isRunning = false;
                            return;
                        }

                        const isChecked = await frame.executeJavaScript(`
                            (() => {
                                const cb = document.getElementById('checkbox') ||
                                           document.getElementById('anchor') ||
                                           document.getElementById('recaptcha-anchor') ||
                                           document.querySelector('.recaptcha-checkbox') ||
                                           document.querySelector('.checkbox') ||
                                           document.querySelector('[aria-checked]');
                                if (!cb) return false;
                                const checkEl = document.querySelector('div.check');
                                const isCheckDivVisible = checkEl && window.getComputedStyle(checkEl).display === 'block';
                                return cb.getAttribute('aria-checked') === 'true' ||
                                       cb.getAttribute('aria-hidden') === 'true' ||
                                       cb.classList.contains('recaptcha-checkbox-checked') ||
                                       isCheckDivVisible;
                            })()
                        `).catch(() => false);

                        if (isChecked) {
                            if (lastSolvedTime === 0) {
                                console.log("[Force-Inject] Checkbox is checked! Starting 5s cooldown.");
                                lastSolvedTime = Date.now();
                            }
                        } else {
                            lastSolvedTime = 0;
                            lastClickTime  = Date.now(); // Set cooldown BEFORE clicking
                            console.log("[Force-Inject] Clicking Captcha Checkbox natively...", frame.url);
                            
                            // 1. Native OS-level click
                            await doNativeClick(frame, '#checkbox, #anchor, #recaptcha-anchor, .recaptcha-checkbox, .checkbox, [aria-checked]', true);
                            
                            // 2. Direct JS click fallback with full pointer & mouse events inside iframe
                            await frame.executeJavaScript(`
                                (() => {
                                    const cb = document.getElementById('checkbox') ||
                                               document.getElementById('anchor') ||
                                               document.getElementById('recaptcha-anchor') ||
                                               document.querySelector('.recaptcha-checkbox') ||
                                               document.querySelector('.checkbox') ||
                                               document.querySelector('[aria-checked]');
                                    if (cb) {
                                        const r = cb.getBoundingClientRect();
                                        const cx = r.left + r.width / 2;
                                        const cy = r.top + r.height / 2;
                                        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
                                        ['pointerover', 'pointerenter', 'mousemove', 'mousedown'].forEach(t => {
                                            cb.dispatchEvent(new PointerEvent(t, opts));
                                            cb.dispatchEvent(new MouseEvent(t, opts));
                                        });
                                        ['pointerup', 'mouseup', 'click'].forEach(t => {
                                            cb.dispatchEvent(new PointerEvent(t, { ...opts, buttons: 0 }));
                                            cb.dispatchEvent(new MouseEvent(t, { ...opts, buttons: 0 }));
                                        });
                                        cb.click();
                                        const inner = cb.querySelector('div, span, input') || cb;
                                        if (inner && inner !== cb) {
                                            inner.click();
                                        }
                                    }
                                })()
                            `).catch(() => {});
                        }

                        isRunning = false;
                    } catch(e) {
                        isRunning = false;
                    }
                }, 2000); // Poll every 2 seconds (was 1.5s — slightly slower to reduce spam)
            }
            
            // --- 2. HANDLE HCAPTCHA CHALLENGE FRAME & AUTO-SOLVER API ---
            const isHcaptchaChallenge = (frame.url.includes('hcaptcha.com') || frame.url.includes('assets.hcaptcha.com')) && (frame.url.includes('frame=challenge') || frame.url.includes('frame=task') || frame.url.includes('hcaptcha-challenge'));
            if (isHcaptchaChallenge) {
                console.log("[Force-Inject] 🎯 Injecting hCaptcha Auto-Solver & Coordinate Listener:", frame.url);
                
                // Inject coordinate click handler and video format check into frame
                frame.executeJavaScript(`
                    (() => {
                        window.__isHCaptchaChallengeActive = true;
                        
                        // Check if challenge contains .webm video elements, .webm network requests, or video prompts
                        window.checkIsWebmVideoChallenge = function() {
                            // 1. Check for visible video elements in DOM
                            try {
                                const videoEls = Array.from(document.querySelectorAll('video'));
                                for (const v of videoEls) {
                                    if (!v) continue;
                                    const rect = v.getBoundingClientRect();
                                    const style = window.getComputedStyle(v);
                                    const isVisible = rect.width > 30 && rect.height > 30 && style.display !== 'none' && style.visibility !== 'hidden';
                                    if (isVisible) return true;
                                }
                            } catch(e){}

                            // 2. Check network resources loaded in frame via Resource Timing API
                            try {
                                const resources = performance.getEntriesByType('resource');
                                const hasWebmResource = resources.some(r => {
                                    const name = (r.name || '').toLowerCase();
                                    const initiator = (r.initiatorType || '').toLowerCase();
                                    return name.includes('.webm') || name.includes('.mp4') || initiator === 'video';
                                });
                                if (hasWebmResource) return true;
                            } catch(e){}

                            // 3. Check challenge header prompt text (e.g. "grow", "grows", "jump", "jumps", "highest")
                            try {
                                const bodyText = (document.body ? document.body.innerText || document.body.textContent || '' : '').toLowerCase();
                                const isKnownVideoPrompt = bodyText.includes('grow') || 
                                                           bodyText.includes('jump') || 
                                                           bodyText.includes('highest') ||
                                                           bodyText.includes('star') ||
                                                           bodyText.includes('shape that') ||
                                                           bodyText.includes('.webm');
                                if (isKnownVideoPrompt) return true;
                            } catch(e){}

                            return false;
                        };

                        // Helper to extract base64 video data or video URL from challenge frame (latest/new video only)
                        window.getHCaptchaVideoData = async function(excludeUrls = []) {
                            for (let attempt = 0; attempt < 10; attempt++) {
                                try {
                                    // 1. Check network resources loaded in frame via Resource Timing API (newest entries first)
                                    try {
                                        const resources = performance.getEntriesByType('resource');
                                        const videoRes = resources.slice().reverse().find(r => {
                                            const name = (r.name || '').toLowerCase();
                                            const isVid = name.includes('.webm') || name.includes('.mp4') || (name.includes('hcaptcha') && name.includes('video'));
                                            return isVid && !excludeUrls.includes(r.name);
                                        });
                                        if (videoRes && videoRes.name) {
                                            console.log("[getHCaptchaVideoData] 🌐 Found NEW video URL in Resource Timing:", videoRes.name);
                                            return { url: videoRes.name };
                                        }
                                    } catch(resErr){}

                                    const videoEl = document.querySelector('video');
                                    const canvasEl = document.querySelector('canvas');
                                    const targetEl = videoEl || canvasEl || document.querySelector('.challenge-view');

                                    if (videoEl) {
                                        const src = videoEl.src || videoEl.currentSrc || (videoEl.querySelector('source') ? videoEl.querySelector('source').src : '');

                                        if (src && !excludeUrls.includes(src)) {
                                            if (src.startsWith('data:video/')) {
                                                return src;
                                            }

                                            // In-frame fetch for blob: or http(s) URLs
                                            if (src.startsWith('blob:') || src.startsWith('http') || src.includes('://')) {
                                                try {
                                                    const res = await fetch(src);
                                                    const blob = await res.blob();
                                                    if (blob && blob.size > 100) {
                                                        const dataUrl = await new Promise((resolve) => {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => resolve(reader.result);
                                                            reader.onerror = () => resolve(null);
                                                            reader.readAsDataURL(blob);
                                                        });
                                                        if (dataUrl) {
                                                            if (dataUrl.startsWith('data:application/octet-stream;base64,')) {
                                                                return dataUrl.replace('data:application/octet-stream;base64,', 'data:video/webm;base64,');
                                                            }
                                                            return dataUrl;
                                                        }
                                                    }
                                                } catch (e) {}

                                                if (src.startsWith('http://') || src.startsWith('https://')) {
                                                    return { url: src };
                                                }
                                            }
                                        }

                                        // MediaRecorder capture live video element stream
                                        if (videoEl.captureStream || videoEl.mozCaptureStream) {
                                            try {
                                                const stream = (videoEl.captureStream || videoEl.mozCaptureStream).call(videoEl);
                                                if (stream && stream.getVideoTracks().length > 0) {
                                                    const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))
                                                        ? 'video/webm;codecs=vp8'
                                                        : ((typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm')) ? 'video/webm' : 'video/mp4');
                                                    
                                                    const recorder = new MediaRecorder(stream, { mimeType });
                                                    const chunks = [];
                                                    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
                                                    recorder.start(100);

                                                    videoEl.currentTime = 0;
                                                    await videoEl.play().catch(() => {});

                                                    await new Promise(r => setTimeout(r, 1800));
                                                    recorder.stop();
                                                    await new Promise(r => recorder.onstop = r);

                                                    const recordedBlob = new Blob(chunks, { type: 'video/webm' });
                                                    if (recordedBlob.size > 500) {
                                                        const dataUrl = await new Promise((resolve) => {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => resolve(reader.result);
                                                            reader.onerror = () => resolve(null);
                                                            reader.readAsDataURL(recordedBlob);
                                                        });
                                                        if (dataUrl) return dataUrl;
                                                    }
                                                }
                                            } catch (recErr) {}
                                        }
                                    }

                                    // Universal offscreen canvas stream capture for video/canvas/DOM elements
                                    if (targetEl && typeof MediaRecorder !== 'undefined') {
                                        try {
                                            const canvas = document.createElement('canvas');
                                            const rect = targetEl.getBoundingClientRect();
                                            canvas.width = rect.width || (videoEl ? videoEl.videoWidth : 380) || 380;
                                            canvas.height = rect.height || (videoEl ? videoEl.videoHeight : 380) || 380;
                                            const ctx = canvas.getContext('2d');
                                            if (ctx && canvas.captureStream) {
                                                const stream = canvas.captureStream(20);
                                                const mimeType = (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))
                                                    ? 'video/webm;codecs=vp8'
                                                    : 'video/webm';
                                                const recorder = new MediaRecorder(stream, { mimeType });
                                                const chunks = [];
                                                recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
                                                recorder.start(100);

                                                if (videoEl) {
                                                    videoEl.currentTime = 0;
                                                    await videoEl.play().catch(() => {});
                                                }

                                                const startTime = Date.now();
                                                while (Date.now() - startTime < 1800) {
                                                    const curVideo = document.querySelector('video');
                                                    const curCanvas = document.querySelector('canvas');
                                                    if (curVideo) {
                                                        try { ctx.drawImage(curVideo, 0, 0, canvas.width, canvas.height); } catch(e){}
                                                    } else if (curCanvas && curCanvas !== canvas) {
                                                        try { ctx.drawImage(curCanvas, 0, 0, canvas.width, canvas.height); } catch(e){}
                                                    }
                                                    await new Promise(r => setTimeout(r, 60));
                                                }

                                                recorder.stop();
                                                await new Promise(r => recorder.onstop = r);

                                                const recordedBlob = new Blob(chunks, { type: 'video/webm' });
                                                if (recordedBlob.size > 500) {
                                                    const dataUrl = await new Promise((resolve) => {
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => resolve(reader.result);
                                                        reader.onerror = () => resolve(null);
                                                        reader.readAsDataURL(recordedBlob);
                                                    });
                                                    if (dataUrl) return dataUrl;
                                                }
                                            }
                                        } catch (canvasRecErr) {}
                                    }
                                } catch(e){}

                                if (attempt < 9) {
                                    await new Promise(r => setTimeout(r, 200));
                                }
                            }
                            return null;
                        };

                        // Capture hCaptcha canvas content as base64 image
                        window.captureHCaptchaCanvas = function() {
                            try {
                                const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], canvas');
                                if (canvas) {
                                    return canvas.toDataURL('image/jpeg', 0.90);
                                }
                                return null;
                            } catch(e) {
                                console.error('[hCaptcha] Canvas capture error:', e.message);
                                return null;
                            }
                        };

                        // Get canvas info (display rect + internal resolution) for coord scaling
                        window.getHCaptchaCanvasInfo = function() {
                            const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], canvas');
                            if (!canvas) return null;
                            const rect = canvas.getBoundingClientRect();
                            return {
                                displayX: rect.left,
                                displayY: rect.top,
                                displayW: rect.width,
                                displayH: rect.height,
                                internalW: canvas.width,
                                internalH: canvas.height
                            };
                        };

                        // Universal click handler — targets video, canvas, or challenge view DOM elements
                        window.clickHCaptchaAtPosition = function(apiX, apiY) {
                            const target = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], .challenge-interface canvas, canvas')
                                || document.querySelector('video') 
                                || document.querySelector('.challenge-view')
                                || document.body;
                            if (!target) return false;
                            const rect = target.getBoundingClientRect();

                            const absX = rect.left + (apiX > 100 ? (apiX / 1000) * rect.width : (apiX <= 1 ? apiX * rect.width : (apiX / 100) * rect.width));
                            const absY = rect.top  + (apiY > 100 ? (apiY / 1000) * rect.height : (apiY <= 1 ? apiY * rect.height : (apiY / 100) * rect.height));
                            const offX = Math.round(absX - rect.left);
                            const offY = Math.round(absY - rect.top);

                            const eventTypes = ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
                            eventTypes.forEach(type => {
                                const isDown = type.includes('down');
                                const isMove = type.includes('move');
                                const buttons = isDown ? 1 : 0;
                                let evt;
                                if (type.startsWith('pointer')) {
                                    evt = new PointerEvent(type, {
                                        bubbles: true,
                                        cancelable: true,
                                        composed: true,
                                        view: window,
                                        clientX: absX,
                                        clientY: absY,
                                        screenX: absX,
                                        screenY: absY,
                                        pageX: absX,
                                        pageY: absY,
                                        button: isDown ? 0 : (isMove ? -1 : 0),
                                        buttons: buttons,
                                        pointerId: 1,
                                        pointerType: 'mouse',
                                        isPrimary: true,
                                        pressure: isDown ? 0.5 : 0
                                    });
                                } else {
                                    evt = new MouseEvent(type, {
                                        bubbles: true,
                                        cancelable: true,
                                        composed: true,
                                        view: window,
                                        clientX: absX,
                                        clientY: absY,
                                        screenX: absX,
                                        screenY: absY,
                                        pageX: absX,
                                        pageY: absY,
                                        button: isDown ? 0 : (isMove ? -1 : 0),
                                        buttons: buttons
                                    });
                                }
                                try {
                                    Object.defineProperty(evt, 'offsetX', { get: () => offX });
                                    Object.defineProperty(evt, 'offsetY', { get: () => offY });
                                } catch(e) {}
                                target.dispatchEvent(evt);
                            });

                            console.log('[Force-Inject] 🎯 Element click at API(', apiX, apiY, ') -> Display(', absX.toFixed(1), absY.toFixed(1), ') on', target.tagName);
                            return true;
                        };

                        // Drag handler — dispatches pointer, touch, and mouse events on canvas, scales API internal coords to display
                        window.dragHCaptchaShape = async function(startApiX, startApiY, targetApiX, targetApiY) {
                            const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], canvas')
                                || document.querySelector('.challenge-view')
                                || document.body;
                            if (!canvas) return false;
                            const rect = canvas.getBoundingClientRect();
                            const normSx = (startApiX > 1) ? (startApiX / 1000) : startApiX;
                            const normSy = (startApiY > 1) ? (startApiY / 1000) : startApiY;
                            const normTx = (targetApiX > 1) ? (targetApiX / 1000) : targetApiX;
                            const normTy = (targetApiY > 1) ? (targetApiY / 1000) : targetApiY;

                            const startX  = rect.left + normSx * rect.width;
                            const startY  = rect.top  + normSy * rect.height;
                            const targetX = rect.left + normTx * rect.width;
                            const targetY = rect.top  + normTy * rect.height;

                            console.log('[Force-Inject] 🎯 Initiating Canvas Drag:', { startApiX, startApiY, targetApiX, targetApiY, startX, startY, targetX, targetY });

                            // 1. Move to start position (Hover)
                            const hoverOpts = { bubbles: true, cancelable: true, view: window, clientX: startX, clientY: startY, button: 0, buttons: 0 };
                            canvas.dispatchEvent(new PointerEvent('pointerover', { ...hoverOpts, pointerId: 1, isPrimary: true }));
                            canvas.dispatchEvent(new PointerEvent('pointerenter', { ...hoverOpts, pointerId: 1, isPrimary: true }));
                            canvas.dispatchEvent(new PointerEvent('pointermove', { ...hoverOpts, pointerId: 1, isPrimary: true }));
                            canvas.dispatchEvent(new MouseEvent('mousemove', hoverOpts));
                            await new Promise(r => setTimeout(r, 60));

                            // 2. Touch/Pointer/Mouse Down on shape (Hold to grab)
                            const downOpts = { bubbles: true, cancelable: true, view: window, clientX: startX, clientY: startY, button: 0, buttons: 1, pressure: 0.5, isPrimary: true };
                            canvas.dispatchEvent(new PointerEvent('pointerdown', { ...downOpts, pointerId: 1 }));
                            canvas.dispatchEvent(new MouseEvent('mousedown', downOpts));
                            try {
                                const touch = new Touch({ identifier: 1, target: canvas, clientX: startX, clientY: startY, pageX: startX, pageY: startY });
                                canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
                            } catch(e){}
                            await new Promise(r => setTimeout(r, 120));

                            // 3. Move step-by-step while HOLDING (buttons: 1)
                            const steps = 30;
                            for (let i = 1; i <= steps; i++) {
                                const cx = startX + (targetX - startX) * (i / steps);
                                const cy = startY + (targetY - startY) * (i / steps);
                                const moveOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1, pressure: 0.5, isPrimary: true };
                                canvas.dispatchEvent(new PointerEvent('pointermove', { ...moveOpts, pointerId: 1 }));
                                canvas.dispatchEvent(new MouseEvent('mousemove', moveOpts));
                                document.dispatchEvent(new PointerEvent('pointermove', { ...moveOpts, pointerId: 1 }));
                                document.dispatchEvent(new MouseEvent('mousemove', moveOpts));
                                window.dispatchEvent(new PointerEvent('pointermove', { ...moveOpts, pointerId: 1 }));
                                window.dispatchEvent(new MouseEvent('mousemove', moveOpts));
                                try {
                                    const moveTouch = new Touch({ identifier: 1, target: canvas, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
                                    canvas.dispatchEvent(new TouchEvent('touchmove', { touches: [moveTouch], targetTouches: [moveTouch], changedTouches: [moveTouch], bubbles: true, cancelable: true }));
                                } catch(e){}
                                await new Promise(r => setTimeout(r, 20));
                            }

                            // 4. Hold at target position briefly
                            await new Promise(r => setTimeout(r, 150));

                            // 5. Release at target position
                            const upOpts = { bubbles: true, cancelable: true, view: window, clientX: targetX, clientY: targetY, button: 0, buttons: 0, pressure: 0, isPrimary: true };
                            canvas.dispatchEvent(new PointerEvent('pointermove', { ...upOpts, pointerId: 1 }));
                            canvas.dispatchEvent(new MouseEvent('mousemove', upOpts));
                            canvas.dispatchEvent(new PointerEvent('pointerup', { ...upOpts, pointerId: 1 }));
                            canvas.dispatchEvent(new MouseEvent('mouseup', upOpts));
                            document.dispatchEvent(new PointerEvent('pointerup', { ...upOpts, pointerId: 1 }));
                            document.dispatchEvent(new MouseEvent('mouseup', upOpts));
                            window.dispatchEvent(new PointerEvent('pointerup', { ...upOpts, pointerId: 1 }));
                            window.dispatchEvent(new MouseEvent('mouseup', upOpts));
                            canvas.dispatchEvent(new MouseEvent('click', upOpts));
                            try {
                                const endTouch = new Touch({ identifier: 1, target: canvas, clientX: targetX, clientY: targetY, pageX: targetX, pageY: targetY });
                                canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [endTouch], bubbles: true, cancelable: true }));
                            } catch(e){}

                            console.log('[Force-Inject] 🎯 Canvas Drag Completed successfully!');
                            return true;
                        };
                    })()
                `).catch(() => {});

                // Use frame URL or routing token to ensure each hCaptcha challenge window executes for its own specific frame
                if (!frame.__hcaptchaIntervalStarted) {
                    frame.__hcaptchaIntervalStarted = true;

                    async function runHcaptchaAutoSolveNative() {
                        if (contents.isDestroyed()) return;
                        if (!isAutoSolveEnabled) return;
                        if (frame.__isSolvingHcaptchaNative) return;
                        frame.__isSolvingHcaptchaNative = true;

                        try {
                            // 1. Initial wait for frame to load
                            await new Promise(r => setTimeout(r, 1200));
                            if (contents.isDestroyed()) return;

                            // Poll for the prompt text to load (up to 4 seconds)
                            let headerText = "";
                            for (let i = 0; i < 20; i++) {
                                if (contents.isDestroyed()) return;
                                headerText = await frame.executeJavaScript(`
                                    (() => {
                                        const el = document.querySelector('.prompt-text')
                                            || document.querySelector('#prompt-question')
                                            || document.querySelector('.challenge-prompt')
                                            || document.querySelector('.prompt-padding')
                                            || document.querySelector('h2');
                                        return el ? (el.innerText || el.textContent || '').trim() : '';
                                    })()
                                `).catch(() => '');
                                if (headerText) break;
                                await new Promise(r => setTimeout(r, 200));
                            }
                            console.log("[hCaptcha Auto-Solver] 🏷️ Extracted Header Text:", headerText);

                            // Detect video format
                            if (contents.isDestroyed()) return;
                            const isWebm = await frame.executeJavaScript(`
                                (typeof window.checkIsWebmVideoChallenge === 'function') ? window.checkIsWebmVideoChallenge() : false
                            `).catch(() => false);

                            let isGridChallenge = false;
                            let sentImgWidth = 300;
                            let sentImgHeight = 400;
                            let elementRect = { x: 0, y: 0, w: 380, h: 500 };
                            let postResponse = null;

                            if (isWebm) {
                                console.log("[hCaptcha Auto-Solver] 🎥 Video Format challenge detected! Requesting video payload...");
                                
                                // Wait 2000ms for video buffer to load
                                await new Promise(r => setTimeout(r, 2000));
                                if (contents.isDestroyed()) return;

                                frame.__usedVideoUrls = frame.__usedVideoUrls || [];
                                const excludeList = frame.__usedVideoUrls;

                                const videoData = await frame.executeJavaScript(`
                                    (typeof window.getHCaptchaVideoData === 'function') ? window.getHCaptchaVideoData(${JSON.stringify(excludeList)}) : null
                                `).catch(() => null);

                                let rawBuffer = null;
                                let videoExt = 'webm';
                                let resolvedVideoUrl = null;

                                if (typeof videoData === 'string' && videoData.length > 50) {
                                    let b64Str = videoData;
                                    if (b64Str.includes('base64,')) {
                                        b64Str = b64Str.split('base64,')[1];
                                    }
                                    try {
                                        rawBuffer = Buffer.from(b64Str, 'base64');
                                    } catch(e) {}
                                } else if (videoData && typeof videoData === 'object' && videoData.url) {
                                    resolvedVideoUrl = videoData.url;
                                    console.log("[hCaptcha Auto-Solver] 📥 Fetching NEW video URL directly from Node.js:", videoData.url);
                                    try {
                                        const videoRes = await fetch(videoData.url);
                                        if (videoRes.ok) {
                                            const arrayBuffer = await videoRes.arrayBuffer();
                                            rawBuffer = Buffer.from(arrayBuffer);
                                            videoExt = videoData.url.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm';
                                        }
                                    } catch (err) {
                                        console.error("[hCaptcha Auto-Solver] ❌ Failed to fetch video URL in Node:", err.message);
                                    }
                                }

                                if (!rawBuffer || rawBuffer.length < 500) {
                                    console.log("[hCaptcha Auto-Solver] 🔄 Querying latest Resource Timing entry from Node...");
                                    const resUrl = await frame.executeJavaScript(`
                                        (() => {
                                            try {
                                                const exclude = ${JSON.stringify(excludeList)};
                                                const resources = performance.getEntriesByType('resource');
                                                // Newest resources first
                                                const match = resources.slice().reverse().find(r => {
                                                    const n = (r.name || '').toLowerCase();
                                                    const isVid = n.includes('.webm') || n.includes('.mp4') || (n.includes('hcaptcha') && (n.includes('asset') || n.includes('video')));
                                                    return isVid && !exclude.includes(r.name);
                                                });
                                                if (match) return match.name;
                                                const latest = resources.slice().reverse().find(r => {
                                                    const n = (r.name || '').toLowerCase();
                                                    return n.includes('.webm') || n.includes('.mp4') || (n.includes('hcaptcha') && (n.includes('asset') || n.includes('video')));
                                                });
                                                return latest ? latest.name : null;
                                            } catch(e) { return null; }
                                        })()
                                    `).catch(() => null);

                                    if (resUrl) {
                                        resolvedVideoUrl = resUrl;
                                        console.log("[hCaptcha Auto-Solver] 📥 Node.js fetching latest Resource Timing video URL:", resUrl);
                                        try {
                                            const videoRes = await fetch(resUrl);
                                            if (videoRes.ok) {
                                                const arrayBuffer = await videoRes.arrayBuffer();
                                                rawBuffer = Buffer.from(arrayBuffer);
                                                videoExt = resUrl.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm';
                                            }
                                        } catch (err) {
                                            console.error("[hCaptcha Auto-Solver] ❌ Failed to fetch Resource Timing video URL:", err.message);
                                        }
                                    }
                                }

                                if (resolvedVideoUrl && !frame.__usedVideoUrls.includes(resolvedVideoUrl)) {
                                    frame.__usedVideoUrls.push(resolvedVideoUrl);
                                    console.log(`[hCaptcha Auto-Solver] 📝 Recorded video URL into session history (Total used: ${frame.__usedVideoUrls.length})`);
                                }

                                if (!rawBuffer || rawBuffer.length < 500) {
                                    console.warn("[hCaptcha Auto-Solver] ⚠️ Could not extract valid video payload.");
                                    contents.__isSolvingHcaptchaNative = false;
                                    return;
                                }

                                // METHOD: 1. Save video file to local PC folder
                                const fs = require('fs');
                                const path = require('path');
                                const tempDir = path.join(process.cwd(), 'temp_videos');
                                if (!fs.existsSync(tempDir)) {
                                    fs.mkdirSync(tempDir, { recursive: true });
                                }

                                const savedFilePath = path.join(tempDir, `captcha_video_${Date.now()}.${videoExt}`);
                                fs.writeFileSync(savedFilePath, rawBuffer);
                                console.log("[hCaptcha Auto-Solver] 💾 Saved video file to PC folder:", savedFilePath);

                                // 2. Read saved video back from PC folder to construct API payload
                                const diskBuffer = fs.readFileSync(savedFilePath);
                                const videoPayload = `data:video/${videoExt};base64,` + diskBuffer.toString('base64');

                                const videoInstruction = headerText || "Please click on the shape that grows";

                                if (solverEngine === 'captchasonic') {
                                    const sitekey = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('sitekey') || ''`).catch(() => '');
                                    const host = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('host') || location.hostname || ''`).catch(() => '');
                                    
                                    // Extract canvas snapshot for queries array (required by CaptchaSonic API)
                                    let canvasSnapshot = await frame.executeJavaScript(`
                                        (() => {
                                            try {
                                                const canvas = document.querySelector('canvas');
                                                if (canvas && canvas.width > 0 && canvas.height > 0) {
                                                    return canvas.toDataURL('image/jpeg', 0.90).replace(/^data:[^,]+,/, '');
                                                }
                                                return null;
                                            } catch(e) { return null; }
                                        })()
                                    `).catch(() => null);

                                    // Fallback: if no canvas, use capturePage crop or placeholder
                                    if (!canvasSnapshot) {
                                        try {
                                            const pagePic = await contents.capturePage().catch(() => null);
                                            if (pagePic && !pagePic.isEmpty()) {
                                                canvasSnapshot = pagePic.toJPEG(85).toString('base64');
                                            }
                                        } catch(e) {}
                                    }

                                    const queryImage = canvasSnapshot || diskBuffer.toString('base64');

                                    const csPayload = {
                                        apiKey: "sonic_PAHeLt2tkyyoKxYTSw41fosL",
                                        source: "chrome",
                                        version: "1.2.0",
                                        appID: 0,
                                        task: {
                                            type: "PopularCaptchaImage",
                                            queries: [queryImage],
                                            examples: [],
                                            question: videoInstruction,
                                            questionType: "objectClick",
                                            canvasVideo: true,
                                            format: "video",
                                            video: [diskBuffer.toString('base64')],
                                            websiteURL: host,
                                            websiteKEY: sitekey,
                                            choices: []
                                        }
                                    };
                                    console.log("[hCaptcha Auto-Solver] 🚀 [CaptchaSonic] Sending video challenge (format: video) to CaptchaSonic API...");
                                    postResponse = await fetch("https://api.captchasonic.com/createTask", {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            "Connection": "close",
                                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                                        },
                                        body: JSON.stringify(csPayload)
                                    }).catch((err) => {
                                        console.error("[hCaptcha Auto-Solver] ❌ [CaptchaSonic] Video POST failed:", err.message);
                                        return null;
                                    });
                                } else {
                                    const apiUrl = "https://qwen.bilimod.com/send/video_text";
                                    console.log("[hCaptcha Auto-Solver] 🚀 Sending POST to API URL:", apiUrl, "| Instruction:", videoInstruction, `(${videoPayload.length} bytes)`);

                                    postResponse = await fetch(apiUrl, {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            "X-API-Key": "sk-qwen2-5-vl-custom-key"
                                        },
                                        body: JSON.stringify({
                                            video: videoPayload,
                                            instruction: videoInstruction
                                        })
                                    }).catch((err) => {
                                        console.error("[hCaptcha Auto-Solver] ❌ POST to send/video_text failed:", err.message);
                                        return null;
                                    });
                                }

                            } else {
                                // Image challenge
                                console.log("[hCaptcha Auto-Solver] 🖼️ Image Format challenge detected!");
                                
                                // Wait 2300ms for animations/renderings to settle (total ~3500ms)
                                await new Promise(r => setTimeout(r, 2300));
                                if (contents.isDestroyed()) return;

                                let b64Data = null;
                                sentImgWidth = 0;
                                sentImgHeight = 0;
                                let canvasInfo = null;

                                // Capture standard canvas directly if possible
                                const canvasData = await frame.executeJavaScript(`
                                    (typeof window.captureHCaptflowCanvas === 'function') ? window.captureHCaptflowCanvas() : ((typeof window.captureHCaptchaCanvas === 'function') ? window.captureHCaptchaCanvas() : null)
                                `).catch(() => null);

                                if (canvasData) {
                                    canvasInfo = await frame.executeJavaScript(`
                                        (typeof window.getHCaptchaCanvasInfo === 'function') ? window.getHCaptchaCanvasInfo() : null
                                    `).catch(() => null);
                                    if (canvasInfo) {
                                        sentImgWidth = canvasInfo.internalW;
                                        sentImgHeight = canvasInfo.internalH;
                                        b64Data = canvasData;
                                        console.log("[hCaptcha Auto-Solver] 📷 Canvas captured:", `${canvasInfo.internalW}x${canvasInfo.internalH}`);
                                    }
                                }

                                if (contents.isDestroyed()) return;
                                if (!b64Data) {
                                    // Fallback to capturePage crop
                                    let captureRect = null;
                                    try {
                                        const targetFrameUrl = frame.url;
                                        iframeOffset = await contents.mainFrame.executeJavaScript(`
                                            (() => {
                                                const targetUrl = ${JSON.stringify(targetFrameUrl)};
                                                const iframes = document.querySelectorAll('iframe');
                                                for (const f of iframes) {
                                                    if (f.src && (f.src === targetUrl || targetUrl.includes(f.src) || f.src.includes(targetUrl) || (f.src.includes('frame=challenge') && targetUrl.includes('frame=challenge')))) {
                                                        const r = f.getBoundingClientRect();
                                                        return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
                                                    }
                                                }
                                                return null;
                                            })()
                                        `).catch(() => null);

                                        if (iframeOffset) {
                                            elementRect = await frame.executeJavaScript(`
                                                (() => {
                                                    const el = document.querySelector('.challenge-view')
                                                        || document.querySelector('canvas')
                                                        || document.querySelector('.challenge-container')
                                                        || document.querySelector('.challenge')
                                                        || document.querySelector('#challenge')
                                                        || document.body;
                                                    if (!el) return null;
                                                    const r = el.getBoundingClientRect();
                                                    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
                                                })()
                                            `).catch(() => null) || { x: 0, y: 0, w: iframeOffset.width, h: iframeOffset.height };

                                            const zoom = (contents && typeof contents.getZoomFactor === 'function') ? contents.getZoomFactor() : 1.0;
                                            captureRect = {
                                                x: Math.round((iframeOffset.x + elementRect.x) * zoom),
                                                y: Math.round((iframeOffset.y + elementRect.y) * zoom),
                                                width: Math.round(elementRect.w * zoom),
                                                height: Math.round(elementRect.h * zoom)
                                            };
                                        }
                                    } catch(e) {}

                                    if (contents.isDestroyed()) return;
                                    const nativeImg = captureRect && captureRect.width > 0 && captureRect.height > 0
                                        ? await contents.capturePage(captureRect).catch(() => null)
                                        : await contents.capturePage().catch(() => null);

                                    if (contents.isDestroyed()) return;
                                    if (!nativeImg || nativeImg.isEmpty()) {
                                        contents.__isSolvingHcaptchaNative = false;
                                        return;
                                    }
                                    const imgSize = nativeImg.getSize();
                                    sentImgWidth = imgSize.width;
                                    sentImgHeight = imgSize.height;
                                    b64Data = 'data:image/jpeg;base64,' + nativeImg.toJPEG(85).toString('base64');
                                    console.log("[hCaptcha Auto-Solver] 📷 Fallback capturePage:", captureRect ? `rect ${captureRect.x},${captureRect.y} ${captureRect.width}x${captureRect.height}` : 'full window');
                                }

                                if (contents.isDestroyed()) return;
                                if (!b64Data) {
                                    contents.__isSolvingHcaptchaNative = false;
                                    return;
                                }

                                // Detect if hCaptcha is Code Image 2 (Grid challenge)
                                // Traditional hCaptcha grids use .task-image .image tiles (9 background-image divs)
                                // New-style hCaptcha grids use .task-grid .task elements
                                const gridInfo = await frame.executeJavaScript(`
                                    (() => {
                                        const canvas = document.querySelector('canvas');
                                        const taskGrid = document.querySelector('.task-grid');
                                        const tasks = Array.from(document.querySelectorAll('.task, .task-image, .task[role="button"]'));
                                        
                                        // Traditional 3x3 grid: .task-image .image tiles
                                        const taskImageTiles = Array.from(document.querySelectorAll('.task-image .image, .task .image, .task-grid .image'));
                                        
                                        // Example image for prompt context
                                        const exampleEl = document.querySelector('.challenge-example .image-wrapper .image, .example-image .image');
                                        let exampleBg = null;
                                        if (exampleEl) {
                                            exampleBg = (exampleEl.style.backgroundImage || '').replace(/url\\(["']?(.*?)["']?\\)/, '$1');
                                        }

                                        // Extract tile background image URLs if available
                                        const allTileEls = taskImageTiles.length >= 4 ? taskImageTiles : tasks;
                                        const tileUrls = allTileEls.map(el => {
                                            const bg = el.style.backgroundImage || (el.querySelector && el.querySelector('.image') && el.querySelector('.image').style.backgroundImage) || '';
                                            const match = bg.match(/url\\(["']?(.*?)["']?\\)/);
                                            return match ? match[1] : null;
                                        }).filter(Boolean);

                                        if (tasks.length >= 4 || taskImageTiles.length >= 4 || taskGrid) {
                                            return {
                                                isGrid: true,
                                                gridType: taskImageTiles.length >= 4 ? 'task_image_tiles' : 'task_grid',
                                                tileCount: Math.max(tasks.length, taskImageTiles.length),
                                                tileUrls: tileUrls.length >= 4 ? tileUrls : [],
                                                exampleBg
                                            };
                                        }

                                        return { isGrid: false, gridType: 'canvas', tileCount: 0, exampleBg };
                                    })()
                                `).catch(() => ({ isGrid: false, gridType: 'canvas', tileCount: 0 }));

                                isGridChallenge = gridInfo && gridInfo.isGrid;

                                if (isGridChallenge) {
                                    console.log(`[hCaptcha Auto-Solver] 🧩 Grid Challenge detected! Type: ${gridInfo.gridType}, Tiles: ${gridInfo.tileCount}. Engine: ${solverEngine}`);

                                    if (solverEngine === 'captchasonic') {
                                        const sitekey = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('sitekey') || ''`).catch(() => '');
                                        const host = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('host') || location.hostname || ''`).catch(() => '');
                                        
                                        const tileBase64List = [];
                                        if (gridInfo.tileUrls && gridInfo.tileUrls.length > 0) {
                                            for (const tUrl of gridInfo.tileUrls) {
                                                try {
                                                    const r = await fetch(tUrl);
                                                    if (r.ok) {
                                                        const ab = await r.arrayBuffer();
                                                        tileBase64List.push(Buffer.from(ab).toString('base64'));
                                                    }
                                                } catch(e) {}
                                            }
                                        }
                                        if (tileBase64List.length === 0 && b64Data) {
                                            tileBase64List.push(b64Data.replace(/^data:[^,]+,/, ''));
                                        }

                                        let exampleBase64List = [];
                                        if (gridInfo.exampleBg) {
                                            try {
                                                const r = await fetch(gridInfo.exampleBg);
                                                if (r.ok) {
                                                    const ab = await r.arrayBuffer();
                                                    exampleBase64List.push(Buffer.from(ab).toString('base64'));
                                                }
                                            } catch(e) {}
                                        }

                                        const csPayload = {
                                            apiKey: "sonic_PAHeLt2tkyyoKxYTSw41fosL",
                                            source: "tampermonkey",
                                            version: "0.3.3",
                                            appID: 0,
                                            task: {
                                                type: "PopularCaptchaImage",
                                                queries: tileBase64List,
                                                examples: exampleBase64List,
                                                question: headerText,
                                                questionType: "objectClassify",
                                                websiteURL: host,
                                                websiteKEY: sitekey,
                                                choices: []
                                            }
                                        };
                                        console.log(`[hCaptcha Auto-Solver] 🚀 [CaptchaSonic] Sending ${tileBase64List.length} grid tiles to CaptchaSonic API...`);
                                        postResponse = await fetch("https://api.captchasonic.com/createTask", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify(csPayload)
                                        }).catch((err) => {
                                            console.error("[hCaptcha Auto-Solver] ❌ [CaptchaSonic] Grid POST failed:", err.message);
                                            return null;
                                        });
                                    } else {
                                        postResponse = await fetch("https://qwen.bilimod.com/send/3x3_grid", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                "X-API-Key": "sk-qwen2-5-vl-custom-key"
                                            },
                                            body: JSON.stringify({
                                                image: b64Data,
                                                instruction: headerText
                                            })
                                        }).catch((err) => {
                                            console.error("[hCaptcha Auto-Solver] ❌ POST to send/3x3_grid failed:", err.message);
                                            return null;
                                        });
                                    }
                                } else {
                                    console.log(`[hCaptcha Auto-Solver] 🖼️ Single Canvas Challenge detected! Engine: ${solverEngine}`);

                                    if (solverEngine === 'captchasonic') {
                                        const sitekey = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('sitekey') || ''`).catch(() => '');
                                        const host = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('host') || location.hostname || ''`).catch(() => '');
                                        const cleanB64 = b64Data ? b64Data.replace(/^data:[^,]+,/, '') : '';

                                        const csPayload = {
                                            apiKey: "sonic_PAHeLt2tkyyoKxYTSw41fosL",
                                            source: "tampermonkey",
                                            version: "0.3.3",
                                            appID: 0,
                                            task: {
                                                type: "PopularCaptchaImage",
                                                queries: [cleanB64],
                                                examples: [],
                                                question: headerText,
                                                questionType: "objectClick",
                                                websiteURL: host,
                                                websiteKEY: sitekey,
                                                choices: []
                                            }
                                        };
                                        console.log("[hCaptcha Auto-Solver] 🚀 [CaptchaSonic] Sending canvas challenge to CaptchaSonic API...");
                                        postResponse = await fetch("https://api.captchasonic.com/createTask", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify(csPayload)
                                        }).catch((err) => {
                                            console.error("[hCaptcha Auto-Solver] ❌ [CaptchaSonic] Canvas POST failed:", err.message);
                                            return null;
                                        });
                                    } else {
                                        postResponse = await fetch("https://qwen.bilimod.com/send/image_text", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                "X-API-Key": "sk-qwen2-5-vl-custom-key"
                                            },
                                            body: JSON.stringify({
                                                image: b64Data,
                                                text: headerText
                                            })
                                        }).catch((err) => {
                                            console.error("[hCaptcha Auto-Solver] ❌ POST to send/image_text failed:", err.message);
                                            return null;
                                        });
                                    }
                                }
                            }

                            if (contents.isDestroyed()) return;

                            // Retrieve JSON Response directly (no polling needed)
                            let resJson = null;
                            if (postResponse && postResponse.ok) {
                                try {
                                    resJson = await postResponse.json();
                                    console.log("[hCaptcha Auto-Solver] 📥 API Response Payload:", resJson);
                                } catch (e) {
                                    console.error("[hCaptcha Auto-Solver] ❌ Failed to parse API JSON response:", e.message);
                                }
                            } else {
                                const status = postResponse ? postResponse.status : "NO_RESPONSE";
                                const errBody = postResponse ? await postResponse.text().catch(() => "") : "";
                                console.warn(`[hCaptcha Auto-Solver] ⚠️ API response failed or was empty (Status: ${status}). Details:`, errBody);
                            }

                            if (resJson && (resJson.code === 404 || resJson.code === 500 || (resJson.msg && typeof resJson.msg === 'string' && (resJson.msg.includes('UNSOLVABLE') || resJson.msg.includes('ERROR') || resJson.msg.includes('FAILED'))))) {
                                console.warn("[hCaptcha Auto-Solver] ⚠️ CaptchaSonic reported error/unsolvable:", resJson.msg);
                                await setOverlayUnsolvable(frame);
                            }
                            if (contents.isDestroyed()) return;
                            if (!resJson) {
                                await setOverlayUnsolvable(frame);
                                contents.__isSolvingHcaptchaNative = false;
                                return;
                            }

                            // Dynamic retry for CaptchaSonic video challenges if initial attempt returned 400 ERROR_VIDEO_PAYLOAD_REQUIRED
                            if (resJson.code === 400 && resJson.msg === 'ERROR_VIDEO_PAYLOAD_REQUIRED' && solverEngine === 'captchasonic') {
                                console.log("[hCaptcha Auto-Solver] 🔄 CaptchaSonic requested video payload with canvasParams, recording and retrying with format: 'video'...");
                                try {
                                    const sitekey = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('sitekey') || ''`).catch(() => '');
                                    const host = await frame.executeJavaScript(`new URLSearchParams(location.hash.replace('#', '?') || location.search).get('host') || location.hostname || ''`).catch(() => '');
                                    
                                    // Get video data
                                    const vidInfo = await frame.executeJavaScript(`window.getHCaptchaVideoData ? window.getHCaptchaVideoData() : null`).catch(() => null);
                                    let retryVidB64 = vidInfo ? vidInfo.base64 : null;
                                    if (!retryVidB64 && vidInfo && vidInfo.url) {
                                        try {
                                            const r = await fetch(vidInfo.url);
                                            const ab = await r.arrayBuffer();
                                            retryVidB64 = Buffer.from(ab).toString('base64');
                                        } catch(e) {}
                                    }

                                    // Canvas snapshot
                                    let snapB64 = await frame.executeJavaScript(`
                                        (() => {
                                            try {
                                                const c = document.querySelector('canvas');
                                                return c ? c.toDataURL('image/jpeg', 0.90).replace(/^data:[^,]+,/, '') : null;
                                            } catch(e) { return null; }
                                        })()
                                    `).catch(() => null);

                                    if (retryVidB64) {
                                        const retryPayload = {
                                            apiKey: "sonic_PAHeLt2tkyyoKxYTSw41fosL",
                                            source: "chrome",
                                            version: "1.2.0",
                                            appID: 0,
                                            task: {
                                                type: "PopularCaptchaImage",
                                                queries: [snapB64 || retryVidB64],
                                                examples: [],
                                                question: resJson.question || headerText,
                                                questionType: resJson.questionType || "objectClick",
                                                canvasVideo: true,
                                                format: "video",
                                                video: [retryVidB64],
                                                websiteURL: host,
                                                websiteKEY: sitekey,
                                                choices: []
                                            }
                                        };
                                        const retryRes = await fetch("https://api.captchasonic.com/createTask", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                "Connection": "close",
                                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                                            },
                                            body: JSON.stringify(retryPayload)
                                        }).catch(() => null);
                                        if (retryRes) {
                                            const retryJson = await retryRes.json().catch(() => null);
                                            if (retryJson && (retryJson.code === 200 || retryJson.answers || retryJson.data)) {
                                                console.log("[hCaptcha Auto-Solver] 📥 CaptchaSonic Video Retry Success:", JSON.stringify(retryJson));
                                                resJson = retryJson;
                                            }
                                        }
                                    }
                                } catch(e) {
                                    console.error("[hCaptcha Auto-Solver] ❌ Error in video retry:", e.message);
                                }
                            }

                            // Get challenge iframe position inside main page to map click offsets for this exact frame
                            const targetFrameUrl = frame.url;
                            const iframePos = await contents.mainFrame.executeJavaScript(`
                                (() => {
                                    const targetUrl = ${JSON.stringify(targetFrameUrl)};
                                    const iframes = Array.from(document.querySelectorAll('iframe'));
                                    // 1. Find visible challenge iframe by exact URL or frame=challenge
                                    let matchedFrame = iframes.find(f => f.src === targetUrl && f.getBoundingClientRect().width > 200);
                                    if (!matchedFrame) {
                                        matchedFrame = iframes.find(f => (f.src.includes('frame=challenge') || (f.title && f.title.toLowerCase().includes('challenge'))) && f.getBoundingClientRect().width > 200);
                                    }
                                    if (!matchedFrame) {
                                        matchedFrame = iframes.filter(f => {
                                            const r = f.getBoundingClientRect();
                                            return r.width > 250 && r.height > 250 && r.top >= 0;
                                        }).sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];
                                    }
                                    if (matchedFrame) {
                                        const r = matchedFrame.getBoundingClientRect();
                                        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
                                    }
                                    return null;
                                })()
                            `).catch(() => null) || { x: 0, y: 0, w: 380, h: 500 };

                            // Fetch accurate element rect (canvas, challenge-view, or body) for exact coordinate scaling
                            const actualElemRect = await frame.executeJavaScript(`
                                (() => {
                                    const header = document.querySelector('.challenge-header') || document.querySelector('.prompt-text');
                                    const headerH = header ? header.getBoundingClientRect().height : 95;

                                    const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], .challenge-interface canvas, .task-image canvas, canvas');
                                    if (canvas && canvas.getBoundingClientRect().height > 50) {
                                        const r = canvas.getBoundingClientRect();
                                        if (r.top >= headerH * 0.7) {
                                            return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
                                        }
                                    }

                                    const container = document.querySelector('.challenge-view')
                                        || document.querySelector('.challenge-container')
                                        || document.querySelector('.task-container')
                                        || document.body;
                                    if (container) {
                                        const r = container.getBoundingClientRect();
                                        const footer = document.querySelector('.challenge-toolbar') || document.querySelector('.button-submit');
                                        const footerH = footer ? footer.getBoundingClientRect().height : 50;
                                        return {
                                            x: Math.round(r.left + 5),
                                            y: Math.round(r.top + headerH),
                                            w: Math.round(r.width - 10),
                                            h: Math.round(Math.max(r.height - headerH - footerH, 180))
                                        };
                                    }
                                    return null;
                                })()
                            `).catch(() => null);

                            if (actualElemRect && actualElemRect.w > 50) {
                                elementRect = actualElemRect;
                            }

                            // Determine elements scaling based on captured image resolution
                            const scaleX = elementRect.w / (sentImgWidth || 1000);
                            const scaleY = elementRect.h / (sentImgHeight || 1000);
                            const offsetX = elementRect.x;
                            const offsetY = elementRect.y;

                            const clicks = [];
                            let isDrag = false;

                            // Check CaptchaSonic answers format
                            let csAnswers = (resJson.data && resJson.data.answers != null)
                                ? resJson.data.answers
                                : ((resJson.solution && resJson.solution.answers != null)
                                    ? resJson.solution.answers
                                    : (resJson.answers != null ? resJson.answers : null));

                            if (csAnswers) {
                                console.log("[hCaptcha Auto-Solver] 🎯 CaptchaSonic raw answers received:", JSON.stringify(csAnswers));
                                
                                // Recursively flatten nested arrays while preserving objects and coord pairs
                                function flattenDeep(arr) {
                                    if (!Array.isArray(arr)) return [arr];
                                    let res = [];
                                    for (const val of arr) {
                                        if (Array.isArray(val)) {
                                            // Check if it is a single coord pair like [x, y]
                                            if (val.length === 2 && typeof val[0] === 'number' && typeof val[1] === 'number') {
                                                res.push(val);
                                            } else {
                                                res = res.concat(flattenDeep(val));
                                            }
                                        } else {
                                            res.push(val);
                                        }
                                    }
                                    return res;
                                }

                                const flatAnswers = flattenDeep(csAnswers);
                                console.log("[hCaptcha Auto-Solver] 📋 Flattened CaptchaSonic items:", flatAnswers);

                                for (let idx = 0; idx < flatAnswers.length; idx++) {
                                    const item = flatAnswers[idx];
                                    if (item === null || item === undefined) continue;

                                    // 1. Drag & Drop format: { start: [x,y], end: [x,y] } or { start: {x,y}, end: {x,y} }
                                    if (typeof item === 'object' && (item.start || item.source) && (item.end || item.target || item.destination)) {
                                        const s = item.start || item.source;
                                        const e = item.end || item.target || item.destination;
                                        const sx = Array.isArray(s) ? s[0] : (s.x != null ? s.x : null);
                                        const sy = Array.isArray(s) ? s[1] : (s.y != null ? s.y : null);
                                        const tx = Array.isArray(e) ? e[0] : (e.x != null ? e.x : null);
                                        const ty = Array.isArray(e) ? e[1] : (e.y != null ? e.y : null);
                                        if (sx !== null && sy !== null && tx !== null && ty !== null) {
                                            clicks.push({ x: Number(sx), y: Number(sy) });
                                            clicks.push({ x: Number(tx), y: Number(ty) });
                                            isDrag = true;
                                            console.log(`[hCaptcha Auto-Solver] 🏗️ CaptchaSonic Drag: [${sx}, ${sy}] ➔ [${tx}, ${ty}]`);
                                        }
                                    }
                                    // 2. Boolean value in array (grid tile)
                                    else if (typeof item === 'boolean') {
                                        if (item === true) {
                                            const cardNum = idx + 1;
                                            const row = Math.floor((cardNum - 1) / 3);
                                            const col = (cardNum - 1) % 3;
                                            const cardX = Math.round((col + 0.5) * (1000 / 3));
                                            const cardY = Math.round((row + 0.5) * (1000 / 3));
                                            clicks.push({ x: cardX, y: cardY, cardNum, isGridCard: true });
                                        }
                                    }
                                    // 3. Number (grid card index or single coord)
                                    else if (typeof item === 'number') {
                                        const cardNum = (item >= 1 && item <= 9) ? item : (item + 1);
                                        const row = Math.floor((cardNum - 1) / 3);
                                        const col = (cardNum - 1) % 3;
                                        const cardX = Math.round((col + 0.5) * (1000 / 3));
                                        const cardY = Math.round((row + 0.5) * (1000 / 3));
                                        clicks.push({ x: cardX, y: cardY, cardNum, isGridCard: true });
                                    }
                                    // 4. Coordinate array: [x, y]
                                    else if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
                                        let resolvedCardNum = 0;
                                        if (isGridChallenge && !isWebm) {
                                            const imgW = sentImgWidth || 300;
                                            const imgH = sentImgHeight || 400;
                                            const normX = Number(item[0]) / imgW;
                                            let normY;
                                            if (imgH > imgW && Number(item[1]) > 90) {
                                                normY = (Number(item[1]) - 95) / Math.max(imgH - 95 - 50, 150);
                                            } else {
                                                normY = Number(item[1]) / imgH;
                                            }
                                            const col = Math.min(2, Math.max(0, Math.floor(normX * 3)));
                                            const row = Math.min(2, Math.max(0, Math.floor(normY * 3)));
                                            resolvedCardNum = row * 3 + col + 1;
                                            console.log(`[hCaptcha Auto-Solver] 🧩 Mapped coords [${item[0]}, ${item[1]}] ➔ Grid Tile #${resolvedCardNum} (Row ${row}, Col ${col})`);
                                        }
                                        clicks.push({ x: Number(item[0]), y: Number(item[1]), cardNum: resolvedCardNum, isVideo: isWebm, isGridCard: isGridChallenge });
                                    }
                                    // 5. Object with card / selected: { card: 1, selected: true }
                                    else if (typeof item === 'object' && (item.card != null || item.selected != null)) {
                                        if (item.selected === true || item.selected === 'true' || item.selected == null) {
                                            const c = typeof item.card === 'number' ? item.card : parseInt(item.card, 10);
                                            if (!isNaN(c)) {
                                                const cardNum = (c >= 1 && c <= 9) ? c : (c + 1);
                                                const row = Math.floor((cardNum - 1) / 3);
                                                const col = (cardNum - 1) % 3;
                                                const cardX = Math.round((col + 0.5) * (1000 / 3));
                                                const cardY = Math.round((row + 0.5) * (1000 / 3));
                                                clicks.push({ x: cardX, y: cardY, cardNum, isGridCard: true });
                                            }
                                        }
                                    }
                                    // 6. Object with coordinates: { x: 123, y: 456 }
                                    else if (typeof item === 'object' && item.x != null && item.y != null) {
                                        let resolvedCardNum = 0;
                                        if (isGridChallenge && !isWebm) {
                                            const imgW = sentImgWidth || 300;
                                            const imgH = sentImgHeight || 400;
                                            const normX = Number(item.x) / imgW;
                                            let normY;
                                            if (imgH > imgW && Number(item.y) > 90) {
                                                normY = (Number(item.y) - 95) / Math.max(imgH - 95 - 50, 150);
                                            } else {
                                                normY = Number(item.y) / imgH;
                                            }
                                            const col = Math.min(2, Math.max(0, Math.floor(normX * 3)));
                                            const row = Math.min(2, Math.max(0, Math.floor(normY * 3)));
                                            resolvedCardNum = row * 3 + col + 1;
                                            console.log(`[hCaptcha Auto-Solver] 🧩 Mapped coords (${item.x}, ${item.y}) ➔ Grid Tile #${resolvedCardNum} (Row ${row}, Col ${col})`);
                                        }
                                        clicks.push({ x: Number(item.x), y: Number(item.y), cardNum: resolvedCardNum, isVideo: isWebm, isGridCard: isGridChallenge });
                                    }
                                    // 7. Text string choice
                                    else if (typeof item === 'string') {
                                        await frame.executeJavaScript(`
                                            (() => {
                                                const ans = ${JSON.stringify(item)};
                                                const elements = Array.from(document.querySelectorAll('.answer-text, .task-answer, [role="radio"], [role="checkbox"]'));
                                                const el = elements.find(e => (e.innerText || e.textContent || '').trim().toLowerCase() === ans.toLowerCase());
                                                if (el) el.click();
                                            })()
                                        `).catch(() => {});
                                    }
                                }
                            } else if (resJson.type === "grid_3x3" || resJson.type === "grid" || resJson.endpoint === "/send/3x3_grid" || resJson.endpoint === "/predict/grid" || resJson.grid_objects || (resJson.grid_layout && (resJson.card_indexes || resJson.target_coords))) {
                                console.log("[hCaptcha Auto-Solver] 🧩 3x3 Grid API response received. Checking Card Numbers from JSON...");
                                
                                const selectedCards = [];

                                // 1. Check grid_objects array for items where selected: true
                                if (Array.isArray(resJson.grid_objects)) {
                                    for (const item of resJson.grid_objects) {
                                        if (item && (item.selected === true || item.selected === 'true')) {
                                            const cNum = typeof item.card === 'number' ? item.card : parseInt(item.card, 10);
                                            if (!isNaN(cNum) && cNum >= 1 && cNum <= 9 && !selectedCards.includes(cNum)) {
                                                selectedCards.push(cNum);
                                            }
                                        }
                                    }
                                }

                                // 2. Check card_indexes array for card numbers [3, 5, etc.]
                                if (Array.isArray(resJson.card_indexes)) {
                                    for (const c of resJson.card_indexes) {
                                        const cNum = typeof c === 'number' ? c : parseInt(c, 10);
                                        if (!isNaN(cNum) && cNum >= 1 && cNum <= 9 && !selectedCards.includes(cNum)) {
                                            selectedCards.push(cNum);
                                        }
                                    }
                                }

                                console.log("[hCaptcha Auto-Solver] 📋 Target Selected Cards to Click One-by-One:", selectedCards);

                                for (const cardNum of selectedCards) {
                                    const row = Math.floor((cardNum - 1) / 3);
                                    const col = (cardNum - 1) % 3;
                                    const cardX = Math.round((col + 0.5) * (1000 / 3));
                                    const cardY = Math.round((row + 0.5) * (1000 / 3));
                                    clicks.push({ x: cardX, y: cardY, cardNum, isGridCard: true });
                                }
                            } else if (resJson.captcha_category === "growing_shape" || resJson.growing_shape) {
                                console.log("[hCaptcha Auto-Solver] 🎥 Growing Shape video response received.");
                                const winner = resJson.growing_shape;
                                let targetPt = winner ? (winner.click_target_coords || winner.randomized_click_coords || winner.center_coords) : null;
                                if (!targetPt && Array.isArray(resJson.target_coords) && resJson.target_coords.length > 0) {
                                    const firstItem = resJson.target_coords[0];
                                    if (Array.isArray(firstItem)) {
                                        targetPt = Array.isArray(firstItem[2]) ? firstItem[2] : (typeof firstItem[0] === 'number' ? firstItem : null);
                                    }
                                }
                                if (targetPt && Array.isArray(targetPt) && targetPt.length >= 2) {
                                    let px = targetPt[0];
                                    let py = targetPt[1] + 139; // Add +139 to Y coordinate as specified
                                    clicks.push({ x: px, y: py, isVideo: true, isOffset139: true });
                                    console.log(`[hCaptcha Auto-Solver] 🎯 Video Growing Shape click coords (X: ${px}, Y: ${py} [${targetPt[1]}+139])`);
                                }
                            } else if (resJson.captcha_category === "jumping_animals" || resJson.highest_jump_animal) {
                                console.log("[hCaptcha Auto-Solver] 🎥 Jumping Animals video response received.");
                                const winner = resJson.highest_jump_animal;
                                let targetPt = winner ? (winner.click_target_coords || winner.randomized_click_coords || winner.jump_apex_coords) : null;
                                if (!targetPt && Array.isArray(resJson.target_coords) && resJson.target_coords.length > 0) {
                                    const firstItem = resJson.target_coords[0];
                                    if (Array.isArray(firstItem)) {
                                        targetPt = Array.isArray(firstItem[2]) ? firstItem[2] : (typeof firstItem[0] === 'number' ? firstItem : null);
                                    }
                                }
                                if (targetPt && Array.isArray(targetPt) && targetPt.length >= 2) {
                                    let px = targetPt[0];
                                    let py = targetPt[1] + 139; // Add +139 to Y coordinate as specified
                                    clicks.push({ x: px, y: py, isVideo: true, isOffset139: true });
                                    console.log(`[hCaptcha Auto-Solver] 🎯 Video Jumping Animal click coords (X: ${px}, Y: ${py} [${targetPt[1]}+139])`);
                                }
                            } else if (resJson.type === "block_tower" || resJson.type === "block_drag" || resJson.type === "shape_drag" || resJson.type === "arrow" || resJson.type === "shape" || resJson.type === "block" || resJson.type === "drag" || resJson.type === "slider" || resJson.block_coords || resJson.shape_coords || resJson.start_coords) {
                                console.log("[hCaptcha Auto-Solver] 🏗️ Block/Shape Drag challenge detected:", resJson.type || 'block_tower');
                                const startCoords = resJson.block_coords || resJson.shape_coords || resJson.start_coords || resJson.source_coords;
                                const targetCoords = resJson.target_coords || resJson.destination_coords || resJson.tower_coords;
                                
                                if (Array.isArray(startCoords) && Array.isArray(targetCoords)) {
                                    const sx = typeof startCoords[0] === 'number' ? startCoords[0] : (Array.isArray(startCoords[0]) ? startCoords[0][0] : null);
                                    const sy = typeof startCoords[1] === 'number' ? startCoords[1] : (Array.isArray(startCoords[0]) ? startCoords[0][1] : null);
                                    const tx = typeof targetCoords[0] === 'number' ? targetCoords[0] : (Array.isArray(targetCoords[0]) ? targetCoords[0][0] : null);
                                    const ty = typeof targetCoords[1] === 'number' ? targetCoords[1] : (Array.isArray(targetCoords[0]) ? targetCoords[0][1] : null);
                                    
                                    if (sx !== null && sy !== null && tx !== null && ty !== null) {
                                        clicks.push({ x: sx, y: sy });
                                        clicks.push({ x: tx, y: ty });
                                        isDrag = true;
                                        console.log(`[hCaptcha Auto-Solver] 🎯 Block/Shape Drag path: [${sx}, ${sy}] ➔ [${tx}, ${ty}]`);
                                    }
                                }
                            } else if (resJson.type === "shape_click" || resJson.type === "cross_click" || resJson.type === "multi_point" || (Array.isArray(resJson.target_coords) && resJson.target_coords.length > 0)) {
                                console.log("[hCaptcha Auto-Solver] 🎯 Shape click / Multi-target response received.");
                                if (Array.isArray(resJson.target_coords)) {
                                    if (resJson.target_coords.length === 2 && typeof resJson.target_coords[0] === 'number' && typeof resJson.target_coords[1] === 'number') {
                                        clicks.push({ x: resJson.target_coords[0], y: resJson.target_coords[1] });
                                    } else {
                                        for (const item of resJson.target_coords) {
                                            if (Array.isArray(item)) {
                                                if (item.length >= 3 && Array.isArray(item[2])) {
                                                    clicks.push({ x: item[2][0], y: item[2][1] });
                                                } else if (typeof item[0] === 'number' && typeof item[1] === 'number') {
                                                    clicks.push({ x: item[0], y: item[1] });
                                                }
                                            }
                                        }
                                    }
                                }
                            } else if (resJson.type === "icon_grid") {
                                const targetCoords = resJson.target_coords || [];
                                for (const pt of targetCoords) {
                                    if (Array.isArray(pt)) {
                                        clicks.push({ x: pt[0], y: pt[1] });
                                    }
                                }
                            } else if (resJson.type === "not_found") {
                                console.warn("[hCaptcha Auto-Solver] ⚠️ Image not recognized. Reloading challenge...");
                                await frame.executeJavaScript(`
                                    (() => {
                                        const refreshBtn = document.querySelector('.refresh')
                                            || document.querySelector('[title*="Refresh"]')
                                            || document.querySelector('[aria-label*="Refresh"]')
                                            || document.querySelector('.reload-button')
                                            || document.querySelector('.refresh-button')
                                            || Array.from(document.querySelectorAll('div, span, button')).find(el => {
                                                const txt = (el.innerText || el.textContent || '').toLowerCase().trim();
                                                return txt.includes('refresh') || txt.includes('reload');
                                            });
                                        if (refreshBtn) refreshBtn.click();
                                    })()
                                `).catch(() => {});
                                contents.__isSolvingHcaptchaNative = false;
                                return;
                            } else if (resJson.clicks) {
                                for (const c of resJson.clicks) {
                                    clicks.push(c);
                                }
                                isDrag = clicks.length >= 2 && (
                                    headerText.toLowerCase().includes('drag') ||
                                    headerText.toLowerCase().includes('slide') ||
                                    headerText.toLowerCase().includes('move') ||
                                    headerText.toLowerCase().includes('align')
                                );
                            }

                                        // 2. ONLY a small black dot at the exact click/target position
                            try {
                                const clickPoints = [];

                                for (const pt of clicks) {
                                    let normX = 0;
                                    let normY = 0;

                                    if (pt.isOffset139) {
                                        // Qwen API format
                                        const vResW = (resJson.video_metadata && resJson.video_metadata.resolution && resJson.video_metadata.resolution[0]) || 480;
                                        const vResH = (resJson.video_metadata && resJson.video_metadata.resolution && resJson.video_metadata.resolution[1]) || 330;
                                        normX = pt.x / vResW;
                                        normY = (pt.y - 139) / vResH;
                                    } else if (pt.x > 1 || pt.y > 1) {
                                        // CaptchaSonic 1000x1000 coordinate space
                                        normX = pt.x / 1000;
                                        normY = pt.y / 1000;
                                    } else {
                                        normX = pt.x;
                                        normY = pt.y;
                                    }
                                    normX = Math.max(0.01, Math.min(0.99, normX));
                                    normY = Math.max(0.01, Math.min(0.99, normY));
                                    clickPoints.push({ normX, normY, isVideo: !!pt.isVideo, cardNum: pt.cardNum || 0 });
                                }

                                const pointsJson = JSON.stringify(clickPoints);

                                const overlayScript = `
(function() {
    // Clean up any previous overlays
    document.querySelectorAll('[data-hca-overlay]').forEach(el => el.remove());

    const points = ${pointsJson};

    function renderOverlays() {
        // 1. Find the main challenge container / view for the outer RED border
        const mainContainer = document.querySelector('.challenge-view')
            || document.querySelector('.challenge-container')
            || document.querySelector('canvas')
            || document.body;

        if (mainContainer) {
            const cr = mainContainer.getBoundingClientRect();
            let outerBorder = document.getElementById('hca-outer-red-border');
            if (!outerBorder) {
                outerBorder = document.createElement('div');
                outerBorder.id = 'hca-outer-red-border';
                outerBorder.setAttribute('data-hca-overlay', '1');
                outerBorder.style.cssText = [
                    'position:fixed',
                    'z-index:2147483646',
                    'pointer-events:none',
                    'box-sizing:border-box',
                    'border:3px solid #ff0000',
                    'border-radius:4px',
                    'background:transparent'
                ].join(';');
                document.body.appendChild(outerBorder);
            }
            outerBorder.style.left   = Math.round(cr.left) + 'px';
            outerBorder.style.top    = Math.round(cr.top) + 'px';
            outerBorder.style.width  = Math.round(cr.width) + 'px';
            outerBorder.style.height = Math.round(cr.height) + 'px';
        }

        // 2. Render ONLY black dot(s) at click target coordinates
        points.forEach(function(pt, idx) {
            let cx = 0;
            let cy = 0;

            // If cardNum is set (grid tile), position dot at exact center of tile
            if (pt.cardNum && pt.cardNum >= 1 && pt.cardNum <= 9) {
                let tiles = Array.from(document.querySelectorAll('.task-image'));
                if (tiles.length !== 9) tiles = Array.from(document.querySelectorAll('.task-grid .task, .task[role="button"]'));
                if (tiles.length !== 9) tiles = Array.from(document.querySelectorAll('.task-image .image'));
                if (tiles.length !== 9) tiles = Array.from(document.querySelectorAll('.task'));
                if (tiles[pt.cardNum - 1]) {
                    const tr = tiles[pt.cardNum - 1].getBoundingClientRect();
                    cx = Math.round(tr.left + tr.width / 2);
                    cy = Math.round(tr.top + tr.height / 2);
                }
            }

            if (cx === 0 && cy === 0) {
                const getMediaRect = function() {
                    const header = document.querySelector('.challenge-header') || document.querySelector('.prompt-text');
                    const headerH = header ? header.getBoundingClientRect().height : 95;

                    // 1. Check canvas
                    const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], .challenge-interface canvas, .task-image canvas, canvas');
                    if (canvas && canvas.getBoundingClientRect().height > 50) {
                        const r = canvas.getBoundingClientRect();
                        if (r.top >= headerH * 0.7) {
                            return { x: r.left, y: r.top, w: r.width, h: r.height };
                        }
                    }

                    // 2. Check video
                    const vid = document.querySelector('video') || document.querySelector('.task-image video');
                    if (vid && vid.getBoundingClientRect().height > 50) {
                        const r = vid.getBoundingClientRect();
                        if (r.top >= headerH * 0.7) {
                            return { x: r.left, y: r.top, w: r.width, h: r.height };
                        }
                    }

                    // 3. Check task-image / challenge-interface
                    const taskContent = document.querySelector('.task-image .image')
                        || document.querySelector('.challenge-interface .image')
                        || document.querySelector('.task-image')
                        || document.querySelector('.challenge-interface');
                    if (taskContent && taskContent.getBoundingClientRect().height > 50) {
                        const r = taskContent.getBoundingClientRect();
                        if (r.top >= headerH * 0.7) {
                            return { x: r.left, y: r.top, w: r.width, h: r.height };
                        }
                    }

                    // 4. Container fallback with header & footer deduction
                    const container = document.querySelector('.challenge-view')
                        || document.querySelector('.challenge-container')
                        || document.querySelector('.task-container')
                        || document.body;
                    if (container) {
                        const r = container.getBoundingClientRect();
                        const footer = document.querySelector('.challenge-toolbar') || document.querySelector('.button-submit');
                        const footerH = footer ? footer.getBoundingClientRect().height : 50;
                        return {
                            x: r.left + 5,
                            y: r.top + headerH,
                            w: r.width - 10,
                            h: Math.max(r.height - headerH - footerH, 180)
                        };
                    }
                    return null;
                };

                const mr = getMediaRect();
                if (!mr) return;

                cx = Math.round(mr.x + pt.normX * mr.w);
                cy = Math.round(mr.y + pt.normY * mr.h);
            }

            let dot = document.getElementById('hca-black-dot-' + idx);
            if (!dot) {
                dot = document.createElement('div');
                dot.id = 'hca-black-dot-' + idx;
                dot.setAttribute('data-hca-overlay', '1');
                dot.style.cssText = [
                    'position:fixed',
                    'z-index:2147483647',
                    'pointer-events:none',
                    'width:10px',
                    'height:10px',
                    'border-radius:50%',
                    'background:#000000',
                    'border:2px solid #ffffff',
                    'box-shadow:0 0 4px rgba(0,0,0,0.8)',
                    'transform:translate(-50%, -50%)',
                    'transition:opacity 0.2s ease'
                ].join(';');
                document.body.appendChild(dot);
            }
            dot.style.left = cx + 'px';
            dot.style.top  = cy + 'px';
        });

        // 3. Immediately disappear / remove black dots when clicking Skip, Next, or Verify
        const buttons = document.querySelectorAll('.button-submit, .verify-btn, .verify-button, .submit-button, [data-cy="submit"], button[type="submit"], .refresh-button, .reload-button, .refresh, .skip, [aria-label*="Verify"], [aria-label*="Next"], [aria-label*="Skip"], [aria-label*="Submit"]');
        buttons.forEach(function(btn) {
            if (!btn.__hcaOverlayCleanup) {
                btn.__hcaOverlayCleanup = true;
                btn.addEventListener('click', function() {
                    document.querySelectorAll('[data-hca-overlay]').forEach(function(el) { el.remove(); });
                }, { capture: true });
            }
        });
    }

    // Render immediately
    renderOverlays();

    // Track repositioning on scroll/resize
    const onReposition = function() { renderOverlays(); };
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);

    // Watch for challenge window removal or state change → clean up all overlays
    const observer = new MutationObserver(function() {
        const challenge = document.querySelector('.challenge-view, canvas[role="img"], video');
        if (!challenge) {
            document.querySelectorAll('[data-hca-overlay]').forEach(function(el) { el.remove(); });
            window.removeEventListener('scroll', onReposition, true);
            window.removeEventListener('resize', onReposition);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
                                `;

                                await frame.executeJavaScript(overlayScript).catch(() => {});
                                console.log(`[hCaptcha Auto-Solver] 🔴 Outer red border + black dot(s) overlay injected for ${clickPoints.length} target(s)`);
                            } catch(overlayErr) {
                                console.warn('[hCaptcha Auto-Solver] ⚠️ Overlay draw failed:', overlayErr.message);
                            }
                            // ────────────────────────────────────────────────────────────────────────────


                            if (clicks.length === 0) {
                                console.warn("[hCaptcha Auto-Solver] ⚠️ No clicks/coordinates resolved. Unsolvable -> changing border to black.");
                                await setOverlayUnsolvable(frame);
                                contents.__isSolvingHcaptchaNative = false;
                                return;
                            }

                            if (isDrag) {
                                const dragPairs = [];
                                for (let i = 0; i < clicks.length; i += 2) {
                                    if (i + 1 < clicks.length) {
                                        dragPairs.push({ start: clicks[i], target: clicks[i + 1], index: Math.floor(i / 2) + 1 });
                                    }
                                }

                                console.log(`[hCaptcha Auto-Solver] 🎯 Total drag movements to execute: ${dragPairs.length}`);

                                for (const pair of dragPairs) {
                                    if (contents.isDestroyed()) return;
                                    const startPt  = pair.start;
                                    const targetPt = pair.target;
                                    console.log(`[hCaptcha Auto-Solver] 🎯 Dragging #${pair.index} from: [${startPt.x}, ${startPt.y}] ➔ [${targetPt.x}, ${targetPt.y}]`);

                                    // 1. Dispatch JS dragging events directly (async)
                                    const jsDragOk = await frame.executeJavaScript(`
                                        (async () => {
                                            if (window.dragHCaptchaShape) {
                                                return await window.dragHCaptchaShape(${startPt.x}, ${startPt.y}, ${targetPt.x}, ${targetPt.y});
                                            }
                                            return false;
                                        })()
                                    `).catch(() => false);

                                    // 2. Fallback to native OS inputs ONLY if JS drag dispatch failed
                                    if (!jsDragOk) {
                                        try {
                                            if (contents.isDestroyed()) return;

                                            const zoom = (contents && typeof contents.getZoomFactor === 'function') ? contents.getZoomFactor() : 1.0;
                                            const sx = Math.round((iframePos.x + elementRect.x + normSx * elementRect.w) * zoom);
                                            const sy = Math.round((iframePos.y + elementRect.y + normSy * elementRect.h) * zoom);
                                            const tx = Math.round((iframePos.x + elementRect.x + normTx * elementRect.w) * zoom);
                                            const ty = Math.round((iframePos.y + elementRect.y + normTy * elementRect.h) * zoom);

                                            console.log(`[hCaptcha Auto-Solver] 🖱️ Native drag #${pair.index} coords:`, { sx, sy, tx, ty, zoom });

                                            // Move to start position
                                            contents.sendInputEvent({ type: 'mouseMove', x: sx, y: sy });
                                            await new Promise(r => setTimeout(r, 100));
                                            if (contents.isDestroyed()) return;

                                            // Hold mouse button down
                                            contents.sendInputEvent({ type: 'mouseDown', x: sx, y: sy, button: 'left', clickCount: 1 });
                                            await new Promise(r => setTimeout(r, 200));

                                            // Drag in 30 steps while holding
                                            const dragSteps = 30;
                                            for (let step = 1; step <= dragSteps; step++) {
                                                if (contents.isDestroyed()) return;
                                                const cx = Math.round(sx + (tx - sx) * (step / dragSteps));
                                                const cy = Math.round(sy + (ty - sy) * (step / dragSteps));
                                                contents.sendInputEvent({ type: 'mouseMove', x: cx, y: cy });
                                                await new Promise(r => setTimeout(r, 20));
                                            }
                                            if (contents.isDestroyed()) return;

                                            // Hold at target position briefly before release
                                            await new Promise(r => setTimeout(r, 200));

                                            // Release mouse at target
                                            contents.sendInputEvent({ type: 'mouseUp', x: tx, y: ty, button: 'left', clickCount: 1 });
                                            console.log(`[hCaptcha Auto-Solver] 🖱️ Native drag #${pair.index} complete at: (${tx}, ${ty})`);
                                        } catch(e) {
                                            console.warn(`[hCaptcha Auto-Solver] ⚠️ sendInputEvent drag #${pair.index} failed:`, e.message);
                                        }
                                    } else {
                                        console.log(`[hCaptcha Auto-Solver] ✅ Drag #${pair.index} dispatched via JS canvas events`);
                                    }

                                    // Pause between multiple drags so that the canvas updates
                                    await new Promise(r => setTimeout(r, 700));
                                }
                            } else {
                                // Click challenge — handle video clicks separately from grid/canvas clicks
                                for (const pt of clicks) {
                                    if (contents.isDestroyed()) return;
                                    console.log("[hCaptcha Auto-Solver] 🎯 Executing click:", pt.cardNum ? `Card #${pt.cardNum}` : `coords: ${pt.x}, ${pt.y}`, pt.isVideo ? '(VIDEO)' : '');

                                    if (pt.isVideo) {
                                        // ── VIDEO / CANVAS CLICK ────────────────────────────────────────────────
                                        const videoJsResult = await frame.executeJavaScript(`
                                            (() => {
                                                const header = document.querySelector('.challenge-header') || document.querySelector('.prompt-text');
                                                const headerH = header ? header.getBoundingClientRect().height : 95;

                                                // 1. Check canvas
                                                const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], .challenge-interface canvas, .task-image canvas, canvas');
                                                if (canvas && canvas.getBoundingClientRect().height > 50) {
                                                    const r = canvas.getBoundingClientRect();
                                                    if (r.top >= headerH * 0.7) {
                                                        return { x: r.left, y: r.top, w: r.width, h: r.height, found: true };
                                                    }
                                                }

                                                // 2. Check video
                                                const vid = document.querySelector('video') || document.querySelector('.task-image video');
                                                if (vid && vid.getBoundingClientRect().height > 50) {
                                                    const r = vid.getBoundingClientRect();
                                                    if (r.top >= headerH * 0.7) {
                                                        return { x: r.left, y: r.top, w: r.width, h: r.height, found: true };
                                                    }
                                                }

                                                // 3. Check task-image / challenge-interface
                                                const taskContent = document.querySelector('.task-image .image')
                                                    || document.querySelector('.challenge-interface .image')
                                                    || document.querySelector('.task-image')
                                                    || document.querySelector('.challenge-interface');
                                                if (taskContent && taskContent.getBoundingClientRect().height > 50) {
                                                    const r = taskContent.getBoundingClientRect();
                                                    if (r.top >= headerH * 0.7) {
                                                        return { x: r.left, y: r.top, w: r.width, h: r.height, found: true };
                                                    }
                                                }

                                                // 4. Container fallback with header & footer deduction
                                                const container = document.querySelector('.challenge-view')
                                                    || document.querySelector('.challenge-container')
                                                    || document.querySelector('.task-container')
                                                    || document.body;
                                                if (container) {
                                                    const r = container.getBoundingClientRect();
                                                    const footer = document.querySelector('.challenge-toolbar') || document.querySelector('.button-submit');
                                                    const footerH = footer ? footer.getBoundingClientRect().height : 50;
                                                    return {
                                                        x: r.left + 5,
                                                        y: r.top + headerH,
                                                        w: r.width - 10,
                                                        h: Math.max(r.height - headerH - footerH, 180),
                                                        found: true
                                                    };
                                                }
                                                return null;
                                            })()
                                        `).catch(() => null);

                                        if (!videoJsResult) {
                                            console.warn("[hCaptcha Auto-Solver] ⚠️ Could not find video/canvas element for click. Skipping.");
                                            continue;
                                        }

                                        // Resolve normalized (0.0 - 1.0) coordinates without arbitrary offsets
                                        let normX = 0;
                                        let normY = 0;

                                        if (pt.isOffset139) {
                                            const baseW = (resJson.video_metadata && resJson.video_metadata.resolution && resJson.video_metadata.resolution[0]) || 480;
                                            const baseH = (resJson.video_metadata && resJson.video_metadata.resolution && resJson.video_metadata.resolution[1]) || 330;
                                            normX = pt.x / baseW;
                                            normY = (pt.y - 139) / baseH;
                                        } else if (pt.x > 1 || pt.y > 1) {
                                            // 1000x1000 normalized space from CaptchaSonic
                                            normX = pt.x / 1000;
                                            normY = pt.y / 1000;
                                        } else {
                                            normX = pt.x;
                                            normY = pt.y;
                                        }

                                        normX = Math.max(0.01, Math.min(0.99, normX));
                                        normY = Math.max(0.01, Math.min(0.99, normY));

                                        const localClickX = Math.round(videoJsResult.x + normX * videoJsResult.w);
                                        const localClickY = Math.round(videoJsResult.y + normY * videoJsResult.h);
                                        const zoom = (contents && typeof contents.getZoomFactor === 'function') ? contents.getZoomFactor() : 1.0;
                                        const vidClickX = Math.round((iframePos.x + localClickX) * zoom);
                                        const vidClickY = Math.round((iframePos.y + localClickY) * zoom);

                                        console.log(`[hCaptcha Auto-Solver] 🖱️ Video target click: norm=(${normX.toFixed(3)},${normY.toFixed(3)}) local=(${localClickX},${localClickY}) screen=(${vidClickX},${vidClickY}) [zoom: ${zoom}]`);

                                        // Dispatch native human mouse trajectory from 50px above down to target
                                        let nativeClickOk = false;
                                        try {
                                            if (!contents.isDestroyed()) {
                                                console.log(`[hCaptcha Auto-Solver] 🖱️ humanMouseMoveAndClick video target: (${vidClickX}, ${vidClickY}) [zoom: ${zoom}]`);
                                                nativeClickOk = await humanMouseMoveAndClick(contents, vidClickX, vidClickY, { startOffsetY: -50 });
                                                console.log(`[hCaptcha Auto-Solver] ✅ Video target human click completed at (${vidClickX}, ${vidClickY})`);
                                            }
                                        } catch(e) {
                                            console.warn("[hCaptcha Auto-Solver] ⚠️ Video native click failed:", e.message);
                                        }

                                        // Fallback to DOM event dispatch ONLY if native OS input failed
                                        if (!nativeClickOk) {
                                            await frame.executeJavaScript(`
                                                (() => {
                                                    const cx = ${localClickX};
                                                    const cy = ${localClickY};
                                                    const canvas = document.querySelector('canvas[role="img"], canvas[aria-label*="CAPTCHA"], .challenge-interface canvas, canvas')
                                                        || document.querySelector('video')
                                                        || document.querySelector('.challenge-view')
                                                        || document.body;
                                                    if (!canvas) return false;

                                                    const hitEl = (typeof document.elementFromPoint === 'function' && document.elementFromPoint(cx, cy)) || canvas;
                                                    const targets = [hitEl, canvas, document.querySelector('.challenge-view')].filter(Boolean);

                                                    const eventSequence = ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
                                                    targets.forEach(tgt => {
                                                        const r = tgt.getBoundingClientRect ? tgt.getBoundingClientRect() : { left: 0, top: 0 };
                                                        const offsetX = Math.round(cx - r.left);
                                                        const offsetY = Math.round(cy - r.top);
                                                        eventSequence.forEach(type => {
                                                            const isDown = type.includes('down');
                                                            const buttons = isDown ? 1 : 0;
                                                            let evt;
                                                            if (type.startsWith('pointer')) {
                                                                evt = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: isDown ? 0.5 : 0 });
                                                            } else {
                                                                evt = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons });
                                                            }
                                                            try {
                                                                Object.defineProperty(evt, 'offsetX', { get: () => offsetX });
                                                                Object.defineProperty(evt, 'offsetY', { get: () => offsetY });
                                                            } catch(e) {}
                                                            tgt.dispatchEvent(evt);
                                                        });
                                                    });
                                                    return true;
                                                })()
                                            `).catch(() => false);
                                        }

                                    } else {
                                        // ── GRID / CANVAS CLICK ─────────────────────────────────────────────────

                                        // 1. Click via JS dispatch targeting the exact tile by card number
                                        const jsResult = await frame.executeJavaScript(`
                                            (() => {
                                                let cardNum = ${pt.cardNum || 0};

                                                let tiles = Array.from(document.querySelectorAll('.task-image'));
                                                if (tiles.length !== 9) tiles = Array.from(document.querySelectorAll('.task-grid .task, .task[role="button"]'));
                                                if (tiles.length !== 9) tiles = Array.from(document.querySelectorAll('.task-image .image'));
                                                if (tiles.length !== 9) tiles = Array.from(document.querySelectorAll('.task'));

                                                if (tiles.length >= 4 && cardNum >= 1 && cardNum <= tiles.length) {
                                                    const tile = tiles[cardNum - 1];
                                                    const clickable = tile.querySelector('.image') || tile.querySelector('.border') || tile;
                                                    const rect = clickable.getBoundingClientRect();
                                                    const cx = rect.left + rect.width / 2;
                                                    const cy = rect.top + rect.height / 2;
                                                    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
                                                    clickable.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, buttons: 1 }));
                                                    clickable.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
                                                    clickable.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, pointerId: 1 }));
                                                    clickable.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
                                                    clickable.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
                                                    if (typeof clickable.click === 'function') clickable.click();
                                                    if (tile !== clickable && typeof tile.click === 'function') tile.click();
                                                    console.log('[hCaptcha Auto-Solver] 🧩 Clicked & selected Grid Tile #' + cardNum + ' at (' + Math.round(cx) + ',' + Math.round(cy) + ')');
                                                    return { success: true, x: rect.left, y: rect.top, w: rect.width, h: rect.height, cardNum };
                                                }

                                                if (window.clickHCaptchaAtPosition) {
                                                    const ok = window.clickHCaptchaAtPosition(${pt.x}, ${pt.y});
                                                    return { success: ok };
                                                }
                                                return { success: false };
                                            })()
                                        `).catch(() => ({ success: false }));

                                        // 2. Native OS mouse event ONLY as fallback if DOM tile element wasn't found (prevents double-click deselect)
                                        if (!jsResult || !jsResult.success) {
                                            try {
                                                if (contents.isDestroyed()) return;
                                                const zoom = (contents && typeof contents.getZoomFactor === 'function') ? contents.getZoomFactor() : 1.0;
                                                const wx = Math.round((iframePos.x + offsetX + pt.x * scaleX) * zoom);
                                                const wy = Math.round((iframePos.y + offsetY + pt.y * scaleY) * zoom);
                                                console.log("[hCaptcha Auto-Solver] 🖱️ humanMouseMoveAndClick fallback click:", wx, wy, `(Card #${pt.cardNum || 'coords'}, zoom: ${zoom})`);
                                                await humanMouseMoveAndClick(contents, wx, wy, { startOffsetY: -40 });
                                            } catch(e) {
                                                console.warn("[hCaptcha Auto-Solver] ⚠️ sendInputEvent click failed:", e.message);
                                            }
                                        }

                                        // Humanized delay between target clicks (0.8s to 1.5s)
                                        const targetClickDelay = 800 + Math.floor(Math.random() * 700);
                                        await new Promise(r => setTimeout(r, targetClickDelay));
                                    }
                                }
                            }

                            // Wait for inputs and target pins to register, then click Verify/Next button
                            await new Promise(r => setTimeout(r, 1600));
                            if (contents.isDestroyed()) return;

                            // 1. Find Verify / Next button position inside iframe
                            const btnResult = await frame.executeJavaScript(`
                                (() => {
                                    document.querySelectorAll('[data-hca-overlay]').forEach(el => el.remove());
                                    const btn = document.querySelector('.verify-btn')
                                        || document.querySelector('[data-cy="submit"]')
                                        || document.querySelector('button.submit')
                                        || document.querySelector('.button-submit')
                                        || document.querySelector('.submit-button')
                                        || document.querySelector('.verify-button')
                                        || document.querySelector('button[type="submit"]')
                                        || document.querySelector('[aria-label*="Verify"]')
                                        || document.querySelector('[aria-label*="Next"]')
                                        || Array.from(document.querySelectorAll('button, .v-btn, div[role="button"], div, span, a')).find(b => {
                                            const txt = (b.innerText || b.textContent || '').toLowerCase().trim();
                                            return txt === 'verify' || txt === 'submit' || txt === 'next' || txt === 'skip';
                                        });
                                    if (!btn) return null;
                                    const r = btn.getBoundingClientRect();
                                    return { x: r.left, y: r.top, w: r.width, h: r.height };
                                })()
                            `).catch(() => null);

                            // 2. Primary: dispatch native human mouse movement starting 50px above down to the button
                            let btnNativeOk = false;
                            if (btnResult && !contents.isDestroyed()) {
                                const zoom = (contents && typeof contents.getZoomFactor === 'function') ? contents.getZoomFactor() : 1.0;
                                const btnWx = Math.round((iframePos.x + btnResult.x + btnResult.w / 2) * zoom);
                                const btnWy = Math.round((iframePos.y + btnResult.y + btnResult.h / 2) * zoom);
                                console.log("[hCaptcha Auto-Solver] 🖱️ humanMouseMoveAndClick verify/next button:", btnWx, btnWy, `(zoom: ${zoom})`);
                                
                                btnNativeOk = await humanMouseMoveAndClick(contents, btnWx, btnWy, { startOffsetY: -50 });
                            }

                            // 3. Fallback to DOM click if native click failed
                            if (!btnNativeOk) {
                                await frame.executeJavaScript(`
                                    (() => {
                                        const btn = document.querySelector('.verify-btn')
                                            || document.querySelector('[data-cy="submit"]')
                                            || document.querySelector('button.submit')
                                            || document.querySelector('.button-submit')
                                            || document.querySelector('.submit-button')
                                            || document.querySelector('.verify-button')
                                            || document.querySelector('button[type="submit"]')
                                            || document.querySelector('[aria-label*="Verify"]')
                                            || document.querySelector('[aria-label*="Next"]');
                                        if (btn) {
                                            const r = btn.getBoundingClientRect();
                                            const cx = r.left + r.width / 2;
                                            const cy = r.top + r.height / 2;
                                            const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0 };
                                            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                                                try { btn.dispatchEvent(new (evt.startsWith('pointer') ? PointerEvent : MouseEvent)(evt, opts)); } catch(e){}
                                            });
                                            if (typeof btn.click === 'function') btn.click();
                                        }
                                    })()
                                `).catch(() => {});
                            }

                        } catch (err) {
                            if (contents && !contents.isDestroyed()) {
                                console.error("[hCaptcha Auto-Solver] ❌ Error in native auto-solver:", err);
                            }
                        } finally {
                            try {
                                setTimeout(() => {
                                    try {
                                        if (frame) {
                                            frame.__isSolvingHcaptchaNative = false;
                                        }
                                    } catch(e){}
                                }, 300);
                            } catch(e){}
                        }
                    }

                    // Run solver immediately on frame load and recurring interval
                    setTimeout(() => {
                        if (!frame.__isSolvingHcaptchaNative && isAutoSolveEnabled) {
                            runHcaptchaAutoSolveNative();
                        }
                    }, 500);

                    setInterval(() => {
                        if (!frame.__isSolvingHcaptchaNative && isAutoSolveEnabled) {
                            runHcaptchaAutoSolveNative();
                        }
                    }, 800);
                }
            }

            // --- 3. HANDLE BFRAME (CHALLENGE POPUP - reCAPTCHA) ---
            if (frame.url.includes('bframe') || frame.url.includes('frame=challenge') || frame.url.includes('enterprise/bframe') || frame.url.includes('api2/bframe') || (frame.url.includes('recaptcha') && frame.url.includes('bframe'))) {
                console.log("[Force-Inject] 🧩 Injecting into reCAPTCHA challenge iframe:", frame.url);

                // --- Inject JA CAPTCHA reCAPTCHA v2 Local AI Solver (ONNX/YOLOv5) ---
                // Active when "JA Enabled (Auto Solve)" is selected in settings
                if (autoSolveMode === 'recaptcha_v2_local' && isAutoSolveEnabled && recaptchaV2LocalUserscript) {
                    console.log("[Force-Inject] 🤖 Injecting JA CAPTCHA reCAPTCHA v2 Local AI solver into bframe...");
                    frame.executeJavaScript(recaptchaV2LocalUserscript).catch(e => {
                        console.warn("[Force-Inject] JA CAPTCHA injection error:", e.message);
                    });
                }

                // Set up the helper functions inside the iframe
                frame.executeJavaScript(`
                    // ReCAPTCHA helper scripts
                    try {
                        Object.defineProperty(Event.prototype, 'isTrusted', {
                            get: function() { return true; },
                            configurable: true
                        });
                    } catch(e) {}

                    window.isSolving = false;
                    window.canvas = document.createElement('canvas');
                    window.canvas.width = 300;
                    window.canvas.height = 300;
                    window.ctx = window.canvas.getContext('2d');

                    window.stitchTile = async function(index) {
                        let tileImg = document.querySelector('.rc-imageselect-tile[data-index="' + index + '"] img');
                        if (!tileImg) {
                            const row = Math.floor(index / 3) + 1;
                            const col = (index % 3) + 1;
                            tileImg = document.querySelector('.rc-imageselect-table tr:nth-child(' + row + ') td:nth-child(' + col + ') img');
                        }
                        if (!tileImg) return;
                        
                        const img = new Image();
                        img.src = tileImg.src;
                        await new Promise(r => { img.onload = r; img.onerror = r; });
                        
                        const x = (index % 3) * 100;
                        const y = Math.floor(index / 3) * 100;
                        
                        if (img.naturalWidth >= 290) {
                            // It's a 3x3 sprite, crop the correct 100x100 square
                            window.ctx.drawImage(img, x, y, 100, 100, x, y, 100, 100);
                        } else {
                            // It's a 1x1 image, draw it directly
                            window.ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, y, 100, 100);
                        }
                    };

                    window.waitForNewTile = async function(index, oldSrc) {
                        return new Promise(resolve => {
                            let attempts = 0;
                            const check = () => {
                                let img = document.querySelector('.rc-imageselect-tile[data-index="' + index + '"] img');
                                if (!img) {
                                    const row = Math.floor(index / 3) + 1;
                                    const col = (index % 3) + 1;
                                    img = document.querySelector('.rc-imageselect-table tr:nth-child(' + row + ') td:nth-child(' + col + ') img');
                                }
                                
                                if (img && (img.src !== oldSrc || attempts > 60)) {
                                    if (img.complete) {
                                        resolve();
                                    } else {
                                        img.onload = resolve;
                                        img.onerror = resolve;
                                    }
                                } else {
                                    attempts++;
                                    setTimeout(check, 100);
                                }
                            };
                            check();
                        });
                    };

                    window.initialize3x3Canvas = async function() {
                        const payloadImg = document.querySelector('.rc-imageselect-payload img');
                        if (payloadImg && payloadImg.naturalWidth >= 290) {
                            // Single payload image
                            const img = new Image();
                            img.src = payloadImg.src;
                            await new Promise(r => { img.onload = r; img.onerror = r; });
                            window.ctx.drawImage(img, 0, 0, 300, 300);
                        } else {
                            // Fallback or separated images
                            for (let i = 0; i < 9; i++) {
                                await window.stitchTile(i);
                            }
                        }
                    };
                    
                    window.getChallengeData = async function() {
                        const payload = document.querySelector('.rc-imageselect-payload');
                        if (!payload) return null;
                        
                        const tiles = document.querySelectorAll('.rc-imageselect-tile').length;
                        const tds = document.querySelectorAll('.rc-imageselect-table td').length;
                        const numTiles = tiles || tds || 9; // Fallback to 9
                        const gridType = (numTiles === 16) ? "4x4" : "3x3";
                        const descElement = document.querySelector('.rc-imageselect-desc-wrapper strong');
                        const challengeTitle = descElement ? descElement.innerText : "";
                        
                        let imageData = null;
                        if (gridType === "4x4") {
                            const img = document.querySelector('.rc-imageselect-payload img');
                            if (img) {
                                await new Promise(r => {
                                    if (img.complete) r();
                                    else {
                                        img.onload = r;
                                        img.onerror = r;
                                    }
                                });
                                // Draw 4x4 image to canvas to bypass any CORS/URL downloading issues completely
                                const tempCanvas = document.createElement('canvas');
                                tempCanvas.width = img.naturalWidth || img.width || 454;
                                tempCanvas.height = img.naturalHeight || img.height || 454;
                                const tempCtx = tempCanvas.getContext('2d');
                                tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                                try {
                                    imageData = tempCanvas.toDataURL('image/jpeg');
                                } catch(e) {
                                    // Tainted canvas fallback
                                    imageData = img.src;
                                }
                            }
                        } else {
                            await window.initialize3x3Canvas();
                            imageData = window.canvas.toDataURL('image/jpeg');
                        }
                        return { gridType, challengeTitle, imageData };
                    };
                    
                    // getTileSelector: returns a CSS selector string for a given tile index
                    window.getTileSelector = function(index, cols) {
                        const byAttr = '.rc-imageselect-tile[data-index="' + index + '"]';
                        if (document.querySelector(byAttr)) return byAttr;
                        const row = Math.floor(index / cols) + 1;
                        const col = (index % cols) + 1;
                        return '.rc-imageselect-table tr:nth-child(' + row + ') td:nth-child(' + col + ')';
                    };

                    // clickTile: human-like JS click dispatched inside the bframe (isTrusted overridden)
                    window.clickTile = async function(selector) {
                        const el = document.querySelector(selector);
                        if (!el) { console.log('[Force-Inject] clickTile: element not found:', selector); return false; }
                        const target = el.querySelector('img') || el;
                        const rect = target.getBoundingClientRect();
                        const x = rect.left + rect.width  * (0.2 + Math.random() * 0.6);
                        const y = rect.top  + rect.height * (0.2 + Math.random() * 0.6);
                        const sleep = ms => new Promise(r => setTimeout(r, ms));
                        // approach
                        for (let i = 0; i < 4; i++) {
                            target.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, cancelable:true, view:window, clientX: x+Math.random()*6, clientY: y+Math.random()*6 }));
                            await sleep(20 + Math.random()*35);
                        }
                        target.dispatchEvent(new MouseEvent('mouseover',  { bubbles:true, view:window, clientX:x, clientY:y }));
                        target.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true, view:window, clientX:x, clientY:y }));
                        await sleep(40 + Math.random()*80);
                        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true, view:window, clientX:x, clientY:y, pointerId:1, pointerType:'mouse', button:0, isPrimary:true }));
                        target.dispatchEvent(new MouseEvent('mousedown',    { bubbles:true, cancelable:true, view:window, clientX:x, clientY:y, button:0 }));
                        await sleep(80 + Math.random()*120);
                        target.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, cancelable:true, view:window, clientX:x, clientY:y, pointerId:1, pointerType:'mouse', button:0, isPrimary:true }));
                        target.dispatchEvent(new MouseEvent('mouseup',    { bubbles:true, cancelable:true, view:window, clientX:x, clientY:y, button:0 }));
                        await sleep(10 + Math.random()*20);
                        target.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window, clientX:x, clientY:y, button:0 }));
                        try { target.click(); } catch(e) {}
                        try { el.click();     } catch(e) {}
                        return true;
                    };
                `).catch(err => console.error("[Force-Inject] BFrame Setup JS Error:", err));

                let bframeAudioAttempts = 0;
                let bframeLastAudioUrl = "";
                let bframeIsSolving = false;

                // Polling loop in the Main Process!
                let solveInterval = setInterval(async () => {
                    try {
                        if (!frame || !frame.url || (typeof frame.isDestroyed === 'function' && frame.isDestroyed())) {
                            clearInterval(solveInterval);
                            return;
                        }

                        // Setup state helper in the frame if not already present
                        const hasStateHelper = await frame.executeJavaScript(`typeof window.getChallengeState === 'function'`);
                        if (!hasStateHelper) {
                            await frame.executeJavaScript(`
                                window.getChallengeState = function() {
                                    const isBlocked = !!(
                                        (document.querySelector('.rc-doscaptcha-body') && document.querySelector('.rc-doscaptcha-body').innerText.length > 0) ||
                                        (document.querySelector('.rc-doscaptcha-header') && document.querySelector('.rc-doscaptcha-header').innerText.length > 0) ||
                                        (document.querySelector('.rc-doscaptcha') && document.querySelector('.rc-doscaptcha').offsetWidth > 0) ||
                                        (document.body && document.body.innerText && (
                                            document.body.innerText.includes('Try again later') ||
                                            document.body.innerText.includes('automated queries') ||
                                            document.body.innerText.includes("can't process your request") ||
                                            document.body.innerText.includes('Coba lagi nanti') ||
                                            document.body.innerText.includes('Se ha detectado tráfico inusual') ||
                                            document.body.innerText.includes('Scan this QR code') ||
                                            document.body.innerText.includes('with your mobile device to verify') ||
                                            document.body.innerText.includes('Pindai kode QR') ||
                                            document.body.innerText.includes('Escanea este código QR') ||
                                            document.body.innerText.includes('Scanne diesen QR-Code') ||
                                            (document.body.innerText.includes('QR code') && document.body.innerText.includes('reCAPTCHA'))
                                        ))
                                    );
                                    const hasImageSelect = !!(document.querySelector('#rc-imageselect') && document.querySelector('#rc-imageselect').offsetWidth > 0);
                                    const audioBtn = document.getElementById('recaptcha-audio-button');
                                    const isAudioBtnVisible = audioBtn && audioBtn.offsetWidth > 0 && window.getComputedStyle(audioBtn).display !== 'none';
                                    const audioSource = document.getElementById('audio-source');
                                    const isAudioChallengeActive = !!(audioSource && audioSource.src && audioSource.src.length > 0 && document.querySelector('.rc-audiochallenge-response-field') && document.querySelector('.rc-audiochallenge-response-field').offsetWidth > 0);
                                    const audioErr = document.querySelector('.rc-audiochallenge-error-message');
                                    const hasAudioError = !!(audioErr && audioErr.innerText.trim().length > 0);
                                    const audioVal = document.getElementById('audio-response') ? document.getElementById('audio-response').value : '';

                                    // Detect Mobile Verification screen ("CLICK TO VERIFY")
                                    const verifyBtn = document.getElementById('recaptcha-verify-button') || document.querySelector('.rc-button-default') || document.querySelector('button');
                                    const bodyText = document.body ? document.body.innerText : '';
                                    const hasMobileVerify = !!(
                                        bodyText.includes('Mobile Verification') ||
                                        bodyText.includes('CLICK TO VERIFY') ||
                                        bodyText.includes('Click below to verify') ||
                                        (verifyBtn && verifyBtn.innerText && verifyBtn.innerText.toUpperCase().includes('CLICK TO VERIFY'))
                                    );

                                    return {
                                        isBlocked,
                                        hasImageSelect,
                                        isAudioBtnVisible,
                                        isAudioChallengeActive,
                                        hasAudioError,
                                        hasMobileVerify,
                                        audioUrl: audioSource ? audioSource.src : '',
                                        audioValue: audioVal,
                                        lang: document.documentElement.lang || document.querySelector('html').getAttribute('lang') || 'en-US'
                                    };
                                };
                            `).catch(e => console.error("[Force-Inject] Error injecting state helper:", e));
                        }

                        const state = await frame.executeJavaScript(`window.getChallengeState()`).catch(() => null);
                        if (!state) {
                            isBframeSolving = false;
                            return;
                        }

                        // Check if Google blocked the challenge ("Try again later" / automated queries) - ALWAYS CHECK THIS FIRST!
                        if (state.isBlocked || state.hasAudioError) {
                            console.log("[Force-Inject] ⚠️ Google blocked challenge ('Try again later' / automated queries detected). Auto-clicking amber SKIP button...");
                            bframeAudioAttempts = 0;
                            bframeLastAudioUrl = '';
                            bframeIsSolving = false;
                            isBframeSolving = false;

                            // 1. Click the Skip button on the host page
                            await triggerGlobalSkip(frame, contents);
                            
                            // 2. Also send IPC & postMessage to guarantee Skip is clicked
                            try {
                                if (contents && contents.mainFrame && !contents.isDestroyed()) {
                                    contents.mainFrame.send('trigger-panel-skip');
                                }
                            } catch(e){}

                            await new Promise(r => setTimeout(r, 1500));
                            return;
                        }

                        if (bframeIsSolving) return;

                        // Determine if a challenge popup is currently active
                        const isPopupOpen = state.hasImageSelect || state.isAudioChallengeActive || state.hasMobileVerify;
                        
                        if (isPopupOpen) {
                            isBframeSolving = true; // Tell the anchor frame that the challenge popup is open!
                        } else {
                            isBframeSolving = false; // Popup is closed
                            bframeIsSolving = false;
                            return;
                        }

                        // Check if automatic challenge solving is enabled by user in Settings
                        if (!isAutoSolveEnabled) {
                            console.log(`[Force-Inject] ⏸️ Auto Solve Challenge is DISABLED (mode: ${autoSolveMode}). Challenge popup is paused.`);
                            bframeIsSolving = false;
                            return;
                        }

                        // Handle Mobile Verification screen ("CLICK TO VERIFY")
                        if (state.hasMobileVerify) {
                            console.log("[Force-Inject] 📱 Mobile Verification screen detected. Auto-clicking 'CLICK TO VERIFY' button...");
                            bframeIsSolving = true;
                            isBframeSolving = true;

                            // 1. Click "CLICK TO VERIFY" button inside frame
                            await frame.executeJavaScript(`
                                (() => {
                                    const btn = document.getElementById('recaptcha-verify-button') ||
                                                document.querySelector('.rc-button-default') ||
                                                Array.from(document.querySelectorAll('button, div, span')).find(el => el.innerText && el.innerText.toUpperCase().includes('VERIFY'));
                                    if (btn) {
                                        btn.click();
                                        return true;
                                    }
                                    return false;
                                })()
                            `).catch(() => false);

                            await new Promise(r => setTimeout(r, 2000));

                            // 2. Trigger click on audio button
                            console.log("[Force-Inject] 🎧 Triggering #recaptcha-audio-button after Mobile Verification...");
                            const switched = await frame.executeJavaScript(`
                                (() => {
                                    const audioBtn = document.getElementById('recaptcha-audio-button');
                                    if (audioBtn) {
                                        audioBtn.click();
                                        return true;
                                    }
                                    return false;
                                })()
                            `).catch(() => false);

                            if (!switched) {
                                await doNativeClick(frame, '#recaptcha-audio-button', false);
                            }

                            await new Promise(r => setTimeout(r, 2000));
                            bframeIsSolving = false;
                            return;
                        }

                        // Solve active audio challenge
                        if (state.isAudioChallengeActive && !state.audioValue) {
                            if (state.audioUrl !== bframeLastAudioUrl) {
                                bframeIsSolving = true;
                                isBframeSolving = true;
                                console.log("[Force-Inject] 🎧 Audio challenge detected. URL:", state.audioUrl);
                                
                                bframeLastAudioUrl = state.audioUrl;
                                bframeAudioAttempts++;

                                if (bframeAudioAttempts > 5) {
                                    console.log("[Force-Inject] ⚠️ Exceeded max audio attempts. Switching back to image solver...");
                                    await frame.executeJavaScript(`
                                        const imgBtn = document.getElementById('recaptcha-image-button');
                                        if (imgBtn) imgBtn.click();
                                    `);
                                    await new Promise(r => setTimeout(r, 2000));
                                    bframeIsSolving = false;
                                    return;
                                }

                                const transcription = await transcribeAudio(state.audioUrl, state.lang);
                                if (transcription && transcription !== "0") {
                                    console.log("[Force-Inject] 🎯 Audio transcription received:", transcription);
                                    
                                    await frame.executeJavaScript(`
                                        (() => {
                                            const input = document.getElementById('audio-response');
                                            if (input) {
                                                input.value = ${JSON.stringify(transcription)};
                                                const verifyBtn = document.getElementById('recaptcha-verify-button');
                                                if (verifyBtn) verifyBtn.click();
                                            }
                                        })()
                                    `);
                                    await new Promise(r => setTimeout(r, 2500));
                                } else {
                                    console.log("[Force-Inject] ❌ Failed to get transcription. Reloading audio challenge...");
                                    await frame.executeJavaScript(`
                                        const reloadBtn = document.getElementById('recaptcha-reload-button');
                                        if (reloadBtn) reloadBtn.click();
                                    `);
                                    await new Promise(r => setTimeout(r, 2000));
                                }
                                bframeIsSolving = false;
                                return;
                            }
                        }

                        // Handle audio challenge error message (e.g. "try again later")
                        if (state.hasAudioError) {
                            console.log("[Force-Inject] ⚠️ Audio error message detected ('Try again later' / blocked). Auto-clicking site SKIP button...");
                            bframeIsSolving = true;
                            await triggerGlobalSkip(frame, contents);
                            await new Promise(r => setTimeout(r, 2500));
                            bframeIsSolving = false;
                            return;
                        }

                        // Switch image select challenge to audio solver if possible
                        // Conditions: autoSolveMode is 'audio' OR is default and bframeAudioAttempts < 5
                        if (state.hasImageSelect && autoSolveMode === 'audio' && bframeAudioAttempts < 5) {
                            bframeIsSolving = true;
                            console.log("[Force-Inject] 🎙️ [Audio Mode] Switching from image challenge to audio challenge...");
                            
                            // Try JS click on audio button first inside bframe
                            const switched = await frame.executeJavaScript(`
                                (() => {
                                    const audioBtn = document.getElementById('recaptcha-audio-button');
                                    if (audioBtn) {
                                        audioBtn.click();
                                        return true;
                                    }
                                    return false;
                                })()
                            `).catch(() => false);

                            if (!switched) {
                                await doNativeClick(frame, '#recaptcha-audio-button', false);
                            }

                            await new Promise(r => setTimeout(r, 2000));
                            bframeIsSolving = false;
                            return;
                        }

                        // Fallback to image solver if image select challenge is active and audio is not available/failed
                        // Skip if JA CAPTCHA mode is active — the injected JA script handles it internally
                        if (state.hasImageSelect && autoSolveMode !== 'recaptcha_v2_local') {
                            const isFrameSolving = await frame.executeJavaScript(`window.isSolving`).catch(() => false);
                            if (!isFrameSolving) {
                                bframeIsSolving = true;
                                isBframeSolving = true;
                                console.log("[Force-Inject] 🖼️ Running image solver for reCAPTCHA...");
                                await frame.executeJavaScript(`window.isSolving = true;`);
                                await runImageSolver(frame);
                                bframeIsSolving = false;
                            }
                        }

                    } catch (err) {
                        if (err.message && (err.message.includes('disposed') || err.message.includes('destroyed'))) {
                            // Frame was disposed — clear interval to stop spam, log once
                            clearInterval(solveInterval);
                            console.log("[Force-Inject] 🎉 SUCCESS! Captcha challenge frame was disposed (solved or navigated away).");
                            isBframeSolving = false;
                        } else {
                            console.error("[Force-Inject] Loop Error:", err);
                        }
                        bframeIsSolving = false;
                    }
                }, 2000);
            }
            
        } catch(err) {
            console.error("[Force-Inject] Hook Error:", err);
        }
    });
});
