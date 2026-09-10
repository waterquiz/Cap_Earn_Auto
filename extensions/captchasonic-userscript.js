// ==UserScript==
// @name         Captcha Solver – CaptchaSonic hCaptcha
// @namespace    https://captchasonic.com/
// @version      1.1.0
// @description  CaptchaSonic-powered hCaptcha auto-solver for Electron injection
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  if (window.__captchasonic_full_injected) return;
  window.__captchasonic_full_injected = true;

  console.log('[CaptchaSonic] ⚡ hCaptcha Solver Engine Loaded (v1.1.0)');

  // ──────────────────────────────────────────────
  // CONFIG
  // ──────────────────────────────────────────────
  const API_KEY = 'sonic_PAHeLt2tkyyoKxYTSw41fosL';
  const API_URL = 'https://api.captchasonic.com/createTask';
  const VERSION = '1.1.0';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => Math.floor(Math.random() * (b - a) + a);
  const $     = (s) => document.querySelector(s);
  const $$    = (s) => Array.from(document.querySelectorAll(s));

  // ──────────────────────────────────────────────
  // API CLIENT
  // ──────────────────────────────────────────────
  async function callCaptchaSonicAPI(taskData) {
    const body = JSON.stringify({
      apiKey:  API_KEY,
      source:  'tampermonkey',
      version: VERSION,
      appID:   0,
      task:    taskData
    });

    console.log('[CaptchaSonic] 🚀 Sending to API:', taskData.type, taskData.questionType || '', `(${taskData.queries ? taskData.queries.length : 0} images)`);

    try {
      const resp = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    body
      });

      const text = await resp.text();
      console.log('[CaptchaSonic] 📥 Raw API response:', text.substring(0, 500));

      try { return JSON.parse(text); } catch(e) {
        console.error('[CaptchaSonic] ❌ Non-JSON response:', text.substring(0, 200));
        return null;
      }
    } catch (err) {
      console.error('[CaptchaSonic] ❌ fetch() error:', err.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // IMAGE / VIDEO HELPERS
  // ──────────────────────────────────────────────
  async function urlToBase64(url) {
    if (!url) return null;
    if (url.startsWith('data:')) return url.replace(/^data:[^,]+,/, '');
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    } catch(e) {
      console.warn('[CaptchaSonic] urlToBase64 failed:', url, e.message);
      return null;
    }
  }

  function extractBgUrl(el) {
    if (!el) return null;
    const bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
    const m = bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : null;
  }

  function captureCanvasSnapshot() {
    const c = $('canvas');
    if (!c || c.width <= 0 || c.height <= 0) return null;
    try {
      return c.toDataURL('image/jpeg', 0.90).replace(/^data:[^,]+,/, '');
    } catch(e) { return null; }
  }

  // Record canvas or video element for durationMs, return base64 webm
  async function recordVideoChallenge(durationMs = 3000) {
    console.log('[CaptchaSonic] 🎥 Recording video challenge for', durationMs, 'ms...');

    // 1. Try to get video element src URL directly (fastest)
    const vidEl = $('video');
    if (vidEl) {
      const src = vidEl.src || vidEl.currentSrc || (vidEl.querySelector('source') ? vidEl.querySelector('source').src : '');
      if (src && src.startsWith('http') && !src.startsWith('blob:')) {
        console.log('[CaptchaSonic] 🎥 Fetching video URL directly:', src);
        const b64 = await urlToBase64(src);
        if (b64) return { video: b64, isVideo: true };
      }
      // Try blob URL via fetch
      if (src && src.startsWith('blob:')) {
        try {
          const r = await fetch(src);
          const buf = await r.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          if (b64 && b64.length > 100) {
            console.log('[CaptchaSonic] 🎥 Got blob video via fetch, size:', b64.length);
            return { video: b64, isVideo: true };
          }
        } catch(e) {}
      }
    }

    // 2. Record video element using MediaRecorder
    if (vidEl && (vidEl.captureStream || vidEl.mozCaptureStream)) {
      try {
        const stream = (vidEl.captureStream || vidEl.mozCaptureStream).call(vidEl);
        if (stream && stream.getVideoTracks().length > 0) {
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8' : 'video/webm';
          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks = [];
          recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
          recorder.start(100);
          vidEl.currentTime = 0;
          await vidEl.play().catch(() => {});
          await sleep(durationMs);
          recorder.stop();
          await new Promise(r => recorder.onstop = r);
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (blob.size > 500) {
            const dataUrl = await new Promise(resolve => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror  = () => resolve(null);
              reader.readAsDataURL(blob);
            });
            if (dataUrl) {
              console.log('[CaptchaSonic] 🎥 MediaRecorder video captured, size:', blob.size);
              return { video: dataUrl.replace(/^data:[^,]+,/, ''), isVideo: true };
            }
          }
        }
      } catch(e) {
        console.warn('[CaptchaSonic] MediaRecorder video capture failed:', e.message);
      }
    }

    // 3. Record canvas using captureStream
    const canvas = $('canvas');
    if (canvas && canvas.captureStream) {
      try {
        const stream = canvas.captureStream(30);
        const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.start(100);
        await sleep(durationMs);
        recorder.stop();
        await new Promise(r => recorder.onstop = r);
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size > 500) {
          const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror  = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) {
            console.log('[CaptchaSonic] 🎥 Canvas stream recorded, size:', blob.size);
            return { video: dataUrl.replace(/^data:[^,]+,/, ''), isVideo: true };
          }
        }
      } catch(e) {
        console.warn('[CaptchaSonic] Canvas captureStream failed:', e.message);
      }
    }

    // 4. Fallback: just send a canvas snapshot image
    const snap = captureCanvasSnapshot();
    if (snap) {
      console.log('[CaptchaSonic] 🎥 Fallback to canvas snapshot for video challenge');
      return { video: null, snapshot: snap, isVideo: false };
    }

    return null;
  }

  // Check Resource Timing API for a video URL
  function findVideoUrlInResourceTiming() {
    try {
      const resources = performance.getEntriesByType('resource');
      const match = resources.slice().reverse().find(r => {
        const n = (r.name || '').toLowerCase();
        return n.includes('.webm') || n.includes('.mp4') || (n.includes('hcaptcha') && n.includes('video'));
      });
      return match ? match.name : null;
    } catch(e) { return null; }
  }

  // ──────────────────────────────────────────────
  // CHALLENGE DETECTION
  // ──────────────────────────────────────────────
  function getPromptText() {
    const el = $('.prompt-text') || $('#prompt-question') || $('.challenge-prompt') || $('h2');
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }

  function isVideoChallenge(prompt) {
    const p = (prompt || '').toLowerCase();
    const hasVideo = $$('video').some(v => v.getBoundingClientRect().width > 30);
    const isMotionPrompt = /grow|jump|highest|shape that|star|faster|click on the/.test(p);
    const hasVideoUrl = !!findVideoUrlInResourceTiming();
    return hasVideo || isMotionPrompt || hasVideoUrl;
  }

  function detectChallengeType(prompt) {
    // Video/Motion challenge
    if (isVideoChallenge(prompt)) return 'video';

    // Traditional 3×3 image grid (.task-image tiles with background images)
    if ($$('.task-image .image').length >= 4) return 'grid_traditional';
    if ($$('.task-image').length >= 4) return 'grid_traditional';

    // New-style grid (.task-grid .task)
    if ($$('.task-grid .task, .task[role="button"]').length >= 4) return 'grid_new';

    // Canvas challenge
    if ($('canvas')) return 'canvas';

    // Multi-choice
    if ($('.task-answers')) return 'multi';

    return null;
  }

  // ──────────────────────────────────────────────
  // TILE CLICKING
  // ──────────────────────────────────────────────
  async function clickTile(index) {
    // Traditional grid: clickable parent is .task-image
    const traditional = $$('.task-image');
    if (traditional.length > 0 && index < traditional.length) {
      const tile = traditional[index];
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2 + rand(-5, 5);
      const cy = rect.top  + rect.height / 2 + rand(-5, 5);
      const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
      tile.dispatchEvent(new PointerEvent('pointerover',  { ...opts, pointerId: 1 }));
      tile.dispatchEvent(new MouseEvent('mouseover', opts));
      await sleep(rand(40, 80));
      tile.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1 }));
      tile.dispatchEvent(new MouseEvent('mousedown', opts));
      await sleep(rand(60, 130));
      tile.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, buttons: 0 }));
      tile.dispatchEvent(new MouseEvent('mouseup',  { ...opts, buttons: 0 }));
      tile.dispatchEvent(new MouseEvent('click',    { ...opts, buttons: 0 }));
      console.log(`[CaptchaSonic] ✅ Clicked .task-image tile #${index}`);
      return true;
    }

    // New-style grid
    const newStyle = $$('.task-grid .task, .task[role="button"]');
    if (newStyle.length > 0 && index < newStyle.length) {
      const tile = newStyle[index];
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
      tile.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1 }));
      tile.dispatchEvent(new MouseEvent('mousedown', opts));
      await sleep(rand(60, 120));
      tile.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, buttons: 0 }));
      tile.dispatchEvent(new MouseEvent('mouseup',  { ...opts, buttons: 0 }));
      tile.dispatchEvent(new MouseEvent('click',    { ...opts, buttons: 0 }));
      console.log(`[CaptchaSonic] ✅ Clicked new-style tile #${index}`);
      return true;
    }

    return false;
  }

  // Click canvas/video at API coordinates
  async function clickAt(x, y, resW, resH) {
    const target = $('canvas[role="img"], canvas[aria-label*="CAPTCHA"], .challenge-interface canvas, canvas') || $('video') || $('.challenge-view') || $('body');
    if (!target) {
      console.warn('[CaptchaSonic] ⚠️ No video/canvas to click on');
      return;
    }
    const rect = target.getBoundingClientRect();
    let normX = (x > 1) ? (x / 1000) : x;
    let normY = (y > 1) ? (y / 1000) : y;
    normX = Math.max(0.01, Math.min(0.99, normX));
    normY = Math.max(0.01, Math.min(0.99, normY));

    const cx = rect.left + normX * rect.width + rand(-2, 2);
    const cy = rect.top  + normY * rect.height + rand(-2, 2);
    console.log(`[CaptchaSonic] 🎯 Click at norm(${normX.toFixed(3)}, ${normY.toFixed(3)}) → client(${Math.round(cx)}, ${Math.round(cy)})`);

    const hitEl = (typeof document.elementFromPoint === 'function' && document.elementFromPoint(cx, cy)) || target;
    const targets = [hitEl, target, $('.challenge-view')].filter(Boolean);

    const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
    
    for (const t of targets) {
      t.dispatchEvent(new PointerEvent('pointerover',  { ...opts, pointerId: 1, buttons: 0 }));
      t.dispatchEvent(new MouseEvent('mouseover',  { ...opts, buttons: 0 }));
      t.dispatchEvent(new PointerEvent('pointermove',  { ...opts, pointerId: 1, buttons: 0 }));
      t.dispatchEvent(new MouseEvent('mousemove',  { ...opts, buttons: 0 }));
    }
    await sleep(rand(40, 80));
    for (const t of targets) {
      t.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1 }));
      t.dispatchEvent(new MouseEvent('mousedown', opts));
    }
    await sleep(rand(90, 150));
    for (const t of targets) {
      t.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, buttons: 0 }));
      t.dispatchEvent(new MouseEvent('mouseup',  { ...opts, buttons: 0 }));
      t.dispatchEvent(new MouseEvent('click',    { ...opts, buttons: 0 }));
    }
  }

  // Click Verify / Next button
  async function clickVerify() {
    await sleep(rand(500, 900));
    const btn = $('.verify-btn')
      || $('[data-cy="submit"]')
      || $('button.button-submit')
      || $('.button-submit')
      || $('.submit-button')
      || $('.verify-button')
      || $('button[type="submit"]')
      || $('[aria-label*="Verify"]')
      || $('[aria-label*="Next"]')
      || $$('button, div[role="button"], div, span, a').find(b => {
          const t = (b.innerText || b.textContent || '').toLowerCase().trim();
          return t === 'verify' || t === 'submit' || t === 'next' || t === 'skip';
        });
    if (btn) {
      console.log('[CaptchaSonic] 🚀 Clicking Verify/Next button in DOM...');
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0 };
      const targets = [btn, btn.parentElement, btn.querySelector('*')].filter(Boolean);
      for (let t of targets) {
        ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'pointerdown', 'mousedown'].forEach(evt => {
          try { t.dispatchEvent(new (evt.startsWith('pointer') ? PointerEvent : MouseEvent)(evt, opts)); } catch(e){}
        });
        ['pointerup', 'mouseup', 'click'].forEach(evt => {
          try { t.dispatchEvent(new (evt.startsWith('pointer') ? PointerEvent : MouseEvent)(evt, opts)); } catch(e){}
        });
      }
      try { btn.click(); } catch(e) {}
    } else {
      console.warn('[CaptchaSonic] ⚠️ Verify button not found');
    }
  }

  // ──────────────────────────────────────────────
  // COLLECT CHALLENGE DATA
  // ──────────────────────────────────────────────
  async function collectChallengeData() {
    const promptText = getPromptText();
    if (!promptText) return null;

    const challengeType = detectChallengeType(promptText);
    if (!challengeType) return null;

    console.log(`[CaptchaSonic] 🧩 Challenge: "${promptText}" | Type: ${challengeType}`);

    let questionType = 'objectClassify';
    let images = [];
    let examples = [];
    let videoB64 = null;

    if (challengeType === 'grid_traditional' || challengeType === 'grid_new') {
      questionType = 'objectClassify';

      // Traditional: background-image tiles
      const tileDivs = $$('.task-image .image');
      if (tileDivs.length > 0) {
        for (const div of tileDivs) {
          const url = extractBgUrl(div);
          const b64 = await urlToBase64(url);
          if (b64) images.push(b64);
        }
      } else {
        // New-style: img tags inside tasks
        const newTileImgs = $$('.task-grid .task img, .task[role="button"] img');
        for (const img of newTileImgs) {
          const b64 = await urlToBase64(img.src || img.currentSrc);
          if (b64) images.push(b64);
        }
      }

      // Example / reference image
      const exampleDiv = $('.challenge-example .image-wrapper .image, .example-image .image, .challenge-example .image');
      if (exampleDiv) {
        const b64 = await urlToBase64(extractBgUrl(exampleDiv));
        if (b64) examples.push(b64);
      }

    } else if (challengeType === 'video') {
      questionType = 'objectClick';

      // Record the video challenge
      const result = await recordVideoChallenge(3000);
      if (result) {
        if (result.video)    videoB64 = result.video;
        if (result.snapshot) images.push(result.snapshot);
      }

      // Also grab a canvas snapshot as fallback image
      const snap = captureCanvasSnapshot();
      if (snap && !images.includes(snap)) images.push(snap);

      // If we have no image at all, we can't proceed
      if (!videoB64 && images.length === 0) {
        console.warn('[CaptchaSonic] ⚠️ No video or image captured for video challenge');
        return null;
      }

    } else if (challengeType === 'canvas') {
      questionType = 'objectClick';
      const b64 = captureCanvasSnapshot();
      if (b64) images.push(b64);

    } else if (challengeType === 'multi') {
      questionType = 'objectTag';
      const b64 = captureCanvasSnapshot();
      if (b64) images.push(b64);
    }

    // For video with no static image, still proceed with video
    if (images.length === 0 && !videoB64) {
      console.warn('[CaptchaSonic] ⚠️ No images extracted. Cannot send to API.');
      return null;
    }

    return { promptText, questionType, images, examples, videoB64, challengeType };
  }

  // ──────────────────────────────────────────────
  // PARSE API RESPONSE — handles multiple formats
  // ──────────────────────────────────────────────
  function parseAPIAnswers(response) {
    if (!response) return null;
    // Format A: { data: { code: 200, answers: [...] } }
    if (response.data && response.data.answers != null) return response.data.answers;
    // Format B: { solution: { answers: [...] } }
    if (response.solution && response.solution.answers != null) return response.solution.answers;
    // Format C: { answers: [...] }
    if (response.answers != null) return response.answers;
    // Format D: direct array
    if (Array.isArray(response)) return response;
    console.warn('[CaptchaSonic] ⚠️ Unknown API response format:', JSON.stringify(response).substring(0, 300));
    return null;
  }

  function isAPIError(response) {
    if (!response) return true;
    if (response.errorId != null && response.errorId !== 0) return true;
    if (response.error) return true;
    if (response.data && response.data.code && response.data.code !== 200) return true;
    return false;
  }

  // ──────────────────────────────────────────────
  // MAIN SOLVE PIPELINE
  // ──────────────────────────────────────────────
  let isSolving = false;
  let lastSolveAttempt = 0;

  async function solve() {
    // Guard: only run inside a challenge frame (has prompt text)
    const promptText = getPromptText();
    if (!promptText) return;

    // Guard: challenge view must be visible
    const hasChallenge = !!(
      $('.challenge-view') ||
      $('canvas') ||
      $$('video').some(v => v.getBoundingClientRect().width > 30) ||
      $$('.task-image').length > 0 ||
      $$('.task-grid').length > 0
    );
    if (!hasChallenge) return;

    // Rate limit — don't retry more than once every 5 seconds
    if (Date.now() - lastSolveAttempt < 5000) return;

    if (isSolving) return;
    isSolving = true;
    lastSolveAttempt = Date.now();

    try {
      console.log('[CaptchaSonic] 🔍 Challenge detected, collecting data...');
      const challengeData = await collectChallengeData();
      if (!challengeData) {
        isSolving = false;
        return;
      }

      // Build API payload
      const sitekey = new URLSearchParams(location.hash.replace('#', '?') || location.search).get('sitekey') || '';
      const host    = new URLSearchParams(location.hash.replace('#', '?') || location.search).get('host') || location.hostname || '';

      const taskPayload = {
        type:         'PopularCaptchaImage',
        queries:      challengeData.images.length > 0 ? challengeData.images : [''],
        examples:     challengeData.examples || [],
        question:     challengeData.promptText,
        questionType: challengeData.questionType,
        websiteURL:   host,
        websiteKEY:   sitekey,
        choices:      []
      };

      // Video challenge: attach recorded video
      if (challengeData.videoB64) {
        taskPayload.canvasVideo = true;
        taskPayload.video       = [challengeData.videoB64];
        console.log('[CaptchaSonic] 🎥 Attached video to API payload, size:', challengeData.videoB64.length);
      }

      const response = await callCaptchaSonicAPI(taskPayload);

      if (isAPIError(response)) {
        console.warn('[CaptchaSonic] ⚠️ API error:', JSON.stringify(response || {}).substring(0, 300));
        isSolving = false;
        return;
      }

      const answers = parseAPIAnswers(response);
      if (!answers) {
        console.warn('[CaptchaSonic] ⚠️ No answers in response');
        isSolving = false;
        return;
      }

      console.log('[CaptchaSonic] ✅ Answers received:', JSON.stringify(answers).substring(0, 300));
      await sleep(rand(150, 300));

      // ── Execute answers ─────────────────────────────
      if (challengeData.questionType === 'objectClassify') {
        // Grid answers: boolean[] (true = click this tile)
        if (Array.isArray(answers) && typeof answers[0] === 'boolean') {
          for (let i = 0; i < answers.length; i++) {
            if (answers[i]) {
              await clickTile(i);
              await sleep(rand(180, 350));
            }
          }
        }
        // Grid answers: number[] (1-based card indexes)
        else if (Array.isArray(answers) && typeof answers[0] === 'number') {
          for (const cardNum of answers) {
            await clickTile(Math.max(0, cardNum - 1));
            await sleep(rand(180, 350));
          }
        }
        // Grid answers: object[] with { selected, card }
        else if (Array.isArray(answers) && typeof answers[0] === 'object' && answers[0] !== null) {
          for (const item of answers) {
            if (item.selected === true || item.selected === 'true') {
              const idx = (typeof item.card === 'number' ? item.card : parseInt(item.card, 10)) - 1;
              if (!isNaN(idx) && idx >= 0) {
                await clickTile(idx);
                await sleep(rand(180, 350));
              }
            }
          }
        }

      } else if (challengeData.questionType === 'objectClick') {
        // Coordinates: [[x,y], ...] or [{x,y}, ...]
        const canvas  = $('canvas');
        const vidEl   = $('video');
        const refEl   = vidEl || canvas;
        const resW = refEl ? (vidEl ? (vidEl.videoWidth  || refEl.getBoundingClientRect().width)  : canvas.width)  : 1000;
        const resH = refEl ? (vidEl ? (vidEl.videoHeight || refEl.getBoundingClientRect().height) : canvas.height) : 1000;

        const coordList = Array.isArray(answers) ? answers : [answers];
        for (const coord of coordList) {
          let x, y;
          if (Array.isArray(coord)) { x = coord[0]; y = coord[1]; }
          else if (coord && typeof coord.x === 'number') { x = coord.x; y = coord.y; }
          else continue;
          await clickAt(x, y, resW, resH);
          await sleep(rand(200, 400));
        }

      } else if (challengeData.questionType === 'objectTag') {
        for (const ansText of (Array.isArray(answers) ? answers : [])) {
          const el = $$('.answer-text').find(e => (e.innerText || e.textContent || '').trim() === ansText);
          if (el) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            await sleep(rand(100, 200));
          }
        }
      }

      // Click Verify
      await clickVerify();

    } catch (err) {
      console.error('[CaptchaSonic] ❌ Solve error:', err.message);
    } finally {
      await sleep(3500);
      isSolving = false;
    }
  }

  // ──────────────────────────────────────────────
  // POLLING LOOP — every 2.5 seconds
  // ──────────────────────────────────────────────
  setInterval(() => {
    solve().catch(err => console.error('[CaptchaSonic] Loop error:', err));
  }, 2500);

  console.log('[CaptchaSonic] ✅ v1.1.0 — Watching for hCaptcha challenge (image + video)');
})();
