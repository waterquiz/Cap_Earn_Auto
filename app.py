import os
import urllib.request
import urllib.parse
from flask import Flask, render_template, request, jsonify, Response, render_template_string
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CAPTCHA_FRAMES = {}

PURE_SOLVER_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pure Solver</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
        body {
            background-color: #080c14;
            color: #d1d5db;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow-x: hidden;
            overflow-y: auto;
            min-height: 100vh;
        }

        /* Top Title Bar */
        #ct-title-bar {
            height: 48px;
            background: #0d131f;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            border-bottom: 2px solid #1e293b;
            position: sticky;
            top: 0;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }

        .ct-logo-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .ct-shield-logo {
            width: 28px;
            height: 28px;
            background: linear-gradient(135deg, #00f0ff, #0077ff);
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #080c14;
            font-size: 14px;
            font-weight: 900;
            box-shadow: 0 0 12px rgba(0, 240, 255, 0.6);
        }

        .ct-logo-container h1 {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: #ffffff;
            margin: 0;
        }

        .typer-text {
            color: #00e5ff;
            text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
        }

        .ct-center-container {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .ct-settings-group {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
        }

        .ct-settings-group input[type="number"], .ct-settings-group select {
            background: #151d2e;
            border: 1px solid #334155;
            color: #00f0ff;
            font-weight: 700;
            font-size: 14px;
            padding: 4px 8px;
            border-radius: 6px;
            width: 60px;
            text-align: center;
            outline: none;
            transition: all 0.2s;
        }

        .ct-settings-group input[type="number"]:focus, .ct-settings-group select:focus {
            border-color: #00f0ff;
            box-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
        }

        #ct-create-panels-btn {
            background: #0284c7;
            color: #ffffff;
            border: none;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 700;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
        }

        #ct-create-panels-btn:hover {
            background: #0369a1;
            transform: translateY(-1px);
        }

        .ct-window-actions-container {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .ct-control-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }

        .ct-control-btn:hover {
            background: #1e293b;
            color: #ffffff;
        }

        /* Multi-panel Grid Container */
        #panels-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            padding: 10px;
            background: #060911;
        }

        /* Individual Captcha Panel Card */
        .ct-panel {
            background: #ffffff;
            border: 1px solid #1e293b;
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            height: 480px;
        }

        /* Panel Header */
        .panel-header {
            background: #006699;
            color: #ffffff;
            padding: 6px 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 700;
        }

        .panel-title {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .panel-status-dot {
            width: 8px;
            height: 8px;
            background: #22c55e;
            border-radius: 50%;
            box-shadow: 0 0 6px #22c55e;
        }

        .panel-tools {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #bae6fd;
            font-size: 11px;
        }

        .panel-tools i {
            cursor: pointer;
            transition: color 0.2s;
        }

        .panel-tools i:hover {
            color: #ffffff;
        }

        /* Action bar below header */
        .panel-action-bar {
            background: #f8fafc;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e2e8f0;
        }

        .panel-checkbox-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #64748b;
            cursor: pointer;
        }

        .panel-timer {
            font-size: 18px;
            font-weight: 800;
            color: #0284c7;
            display: flex;
            align-items: center;
            gap: 4px;
            font-family: 'Segoe UI', Tahoma, sans-serif;
        }

        .panel-timer.warning {
            color: #ef4444;
            animation: timerBlink 1s infinite alternate;
        }

        @keyframes timerBlink {
            0% { opacity: 1; }
            100% { opacity: 0.6; }
        }

        .skip-btn {
            background: #f59e0b;
            color: #ffffff;
            font-weight: 800;
            font-size: 10px;
            padding: 4px 10px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 4px rgba(245, 158, 11, 0.4);
            transition: all 0.2s;
        }

        .skip-btn:hover {
            background: #d97706;
            transform: scale(1.05);
        }

        /* Captcha Content Box */
        .captcha-challenge-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 10px;
            background: #ffffff;
            overflow: hidden;
        }

        /* reCAPTCHA Blue Header Banner */
        .recaptcha-header-banner {
            background: #1d4ed8;
            color: #ffffff;
            width: 100%;
            max-width: 250px;
            padding: 8px 12px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            text-align: left;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        .recaptcha-header-banner .recaptcha-prompt {
            font-size: 11px;
            line-height: 1.2;
        }

        .recaptcha-header-banner .recaptcha-target {
            font-size: 18px;
            font-weight: 800;
            text-transform: lowercase;
            margin: 2px 0;
            display: block;
        }

        .recaptcha-header-banner .recaptcha-sub {
            font-size: 10px;
            opacity: 0.9;
        }

        /* 3x3 Tile Grid */
        .tiles-grid {
            width: 100%;
            max-width: 250px;
            height: 250px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 2px;
            background: #e2e8f0;
            padding: 2px;
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }

        .tile {
            position: relative;
            background-size: cover;
            background-position: center;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
            border-radius: 2px;
            overflow: hidden;
        }

        .tile:hover {
            opacity: 0.9;
        }

        .tile.selected::after {
            content: '?';
            position: absolute;
            bottom: 4px;
            right: 4px;
            width: 20px;
            height: 20px;
            background: #2563eb;
            color: #ffffff;
            border-radius: 50%;
            font-size: 12px;
            font-weight: 900;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }

        .tile.selected {
            outline: 3px solid #2563eb;
            outline-offset: -3px;
        }

        /* hCaptcha Alternate Challenge */
        .hcaptcha-challenge {
            width: 100%;
            max-width: 250px;
            height: 290px;
            background: #007a87;
            border-radius: 6px;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }

        .hcaptcha-top {
            padding: 12px;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.3;
        }

        .hcaptcha-body {
            flex: 1;
            background: radial-gradient(circle at center, #0284c7 0%, #0369a1 50%, #0c4a6e 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .hcaptcha-graphic {
            width: 140px;
            height: 140px;
            border: 2px dashed rgba(255,255,255,0.4);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            color: #ffffff;
            cursor: pointer;
            transition: all 0.3s;
        }

        .hcaptcha-graphic:hover {
            background: rgba(255,255,255,0.1);
            transform: scale(1.05);
        }

        /* Panel Footer */
        .panel-footer {
            background: #006699;
            color: #e0f2fe;
            padding: 4px 8px;
            font-size: 9px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid #0284c7;
        }

        .rate-notice {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            max-width: 78%;
        }

        .worker-id {
            background: rgba(0, 0, 0, 0.25);
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 800;
            color: #38bdf8;
            font-size: 10px;
        }

        /* Settings Modal */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(4px);
            z-index: 2000;
            align-items: center;
            justify-content: center;
        }

        .modal-card {
            background: #0d131f;
            border: 1px solid #1e293b;
            border-radius: 12px;
            width: 90%;
            max-width: 480px;
            padding: 24px;
            color: #e2e8f0;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        }

        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            border-bottom: 1px solid #1e293b;
            padding-bottom: 12px;
        }

        .modal-header h2 { font-size: 18px; color: #00f0ff; }
        .modal-close { background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
        .form-row { margin-bottom: 16px; }
        .form-row label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; }
        .form-row select, .form-row input {
            width: 100%;
            background: #151d2e;
            border: 1px solid #334155;
            color: #ffffff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
        }
        .btn-save-modal {
            background: #0284c7;
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 700;
            width: 100%;
            cursor: pointer;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <!-- Top Header Bar -->
    <header id="ct-title-bar">
        <div class="ct-logo-container">
            <div class="ct-shield-logo">PS</div>
            <h1>Pure<span class="typer-text"> Solver</span></h1>
        </div>

        <div class="ct-center-container">
            <div class="ct-settings-group">
                <label for="ct-panel-count">Panels:</label>
                <input type="number" id="ct-panel-count" value="12" min="1" max="100">
                <button id="ct-create-panels-btn">Set & Relaunch</button>
            </div>

            <div class="ct-settings-group">
                <label for="ct-columns">Columns:</label>
                <select id="ct-columns">
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4" selected>4</option>
                    <option value="6">6</option>
                </select>
            </div>
        </div>

        <div class="ct-window-actions-container">
            <button id="ct-settings-btn" class="ct-control-btn" title="Settings"><i class="fas fa-cog"></i></button>
            <button id="ct-fullscreen-btn" class="ct-control-btn" title="Fullscreen"><i class="fas fa-expand"></i></button>
        </div>
    </header>

    <!-- Multi-panel Grid -->
    <div id="panels-grid"></div>

    <!-- Settings Modal -->
    <div class="modal-overlay" id="settings-modal">
        <div class="modal-card">
            <div class="modal-header">
                <h2><i class="fas fa-sliders-h"></i> Pure Solver Settings</h2>
                <button class="modal-close" id="close-modal-btn">&times;</button>
            </div>
            <div class="form-row">
                <label>Active Solver Engine</label>
                <select>
                    <option selected>CaptchaSonic / CaptchaAI</option>
                    <option>JA Enabled (Auto Solve)</option>
                    <option>Custom Qwen URL AI</option>
                </select>
            </div>
            <div class="form-row">
                <label>Proxy Mode</label>
                <select>
                    <option selected>No Proxies (Direct)</option>
                    <option>Manual Proxies (Round Robin)</option>
                </select>
            </div>
            <div class="form-row">
                <label>Audio Notifications</label>
                <select>
                    <option selected>Enabled</option>
                    <option>Disabled</option>
                </select>
            </div>
            <button class="btn-save-modal" id="save-modal-btn">Save & Apply</button>
        </div>
    </div>

    <script>
        const CHALLENGE_TARGETS = [
            'bus',
            'motorcycles',
            'crosswalks',
            'bicycles',
            'traffic lights',
            'a fire hydrant',
            'tractors',
            'cars'
        ];

        const TILE_IMAGES = [
            'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1558980664-769d59546b3d?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1508974239320-0a029497e820?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1558981803-33924f0c62b6?w=200&h=200&fit=crop',
            'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=200&h=200&fit=crop'
        ];

        const WORKER_IDS = ['ada1', 'ada2', 'ada3', 'fraz1', 'fraz2', 'fraz3', 'fraz4', 'ada4', 'ada5', 'pay1', 'pay2', 'pay3', 'pay4', 'fraz5', 'ada6', 'pay5'];

        function createPanelElement(index) {
            const panel = document.createElement('div');
            panel.className = 'ct-panel';
            panel.id = `panel-${index}`;

            const workerName = WORKER_IDS[index % WORKER_IDS.length];
            const isHcaptcha = (index === 7 || index === 10);
            const targetWord = CHALLENGE_TARGETS[index % CHALLENGE_TARGETS.length];
            let timerValue = Math.floor(40 + Math.random() * 75);
            if (index === 2) timerValue = 16; // As in screenshot
            if (index === 6) timerValue = 26;

            let challengeContent = '';
            if (isHcaptcha) {
                challengeContent = `
                    <div class="hcaptcha-challenge">
                        <div class="hcaptcha-top">
                            Click the object that breaks the column pattern
                        </div>
                        <div class="hcaptcha-body">
                            <div class="hcaptcha-graphic" onclick="this.innerHTML='?'">
                                <i class="fas fa-shapes"></i>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                let tilesHtml = '';
                for (let t = 0; t < 9; t++) {
                    const imgUrl = TILE_IMAGES[(index * 3 + t) % TILE_IMAGES.length];
                    const isPreselected = (t === 2 || t === 7 || t === 8) && (index % 2 === 0);
                    tilesHtml += `<div class="tile ${isPreselected ? 'selected' : ''}" style="background-image: url('${imgUrl}')" onclick="this.classList.toggle('selected')"></div>`;
                }

                challengeContent = `
                    <div class="recaptcha-header-banner">
                        <div class="recaptcha-prompt">Select all squares with</div>
                        <span class="recaptcha-target">${targetWord}</span>
                        <div class="recaptcha-sub">Click verify once there are none left.</div>
                    </div>
                    <div class="tiles-grid">
                        ${tilesHtml}
                    </div>
                `;
            }

            panel.innerHTML = `
                <div class="panel-header">
                    <div class="panel-title">
                        <span class="panel-status-dot"></span>
                        <span>CaptchaTypersOR <small style="font-size: 10px; opacity: 0.8;">v0.6.0</small></span>
                    </div>
                    <div class="panel-tools">
                        <i class="fas fa-volume-up" title="Audio"></i>
                        <i class="fas fa-minus" title="Minimize"></i>
                        <i class="fas fa-sync-alt" title="Reload" onclick="reloadPanel(${index})"></i>
                        <i class="fas fa-times" title="Close"></i>
                    </div>
                </div>

                <div class="panel-action-bar">
                    <label class="panel-checkbox-label">
                        <input type="checkbox" checked>
                        <span>I'm not a robot</span>
                    </label>
                    <div class="panel-timer ${timerValue < 30 ? 'warning' : ''}" id="timer-${index}">
                        <span>${timerValue}</span>
                        <i class="far fa-clock" style="font-size: 15px;"></i>
                    </div>
                    <button class="skip-btn" onclick="reloadPanel(${index})">SKIP</button>
                </div>

                <div class="captcha-challenge-container" id="challenge-${index}">
                    ${challengeContent}
                </div>

                <div class="panel-footer">
                    <span class="rate-notice">$1.25 per 1k for 5 hours daily between 12am to 5am IST or 1pm to 6pm EST or 3pm to 8pm caracas time</span>
                    <span class="worker-id">${workerName}</span>
                </div>
            `;

            return { element: panel, timer: timerValue };
        }

        const panelTimers = {};

        function renderGrid(count = 12) {
            const grid = document.getElementById('panels-grid');
            grid.innerHTML = '';
            
            // Clear existing intervals
            Object.values(panelTimers).forEach(clearInterval);

            for (let i = 0; i < count; i++) {
                const { element, timer } = createPanelElement(i);
                grid.appendChild(element);

                // Run countdown
                let timeLeft = timer;
                panelTimers[i] = setInterval(() => {
                    timeLeft--;
                    if (timeLeft <= 0) timeLeft = 120;
                    const timerEl = document.getElementById(`timer-${i}`);
                    if (timerEl) {
                        timerEl.querySelector('span').textContent = timeLeft;
                        if (timeLeft < 30) timerEl.classList.add('warning');
                        else timerEl.classList.remove('warning');
                    }
                }, 1000);
            }
        }

        function reloadPanel(index) {
            const targetWord = CHALLENGE_TARGETS[Math.floor(Math.random() * CHALLENGE_TARGETS.length)];
            const challengeEl = document.getElementById(`challenge-${index}`);
            if (challengeEl) {
                let tilesHtml = '';
                for (let t = 0; t < 9; t++) {
                    const imgUrl = TILE_IMAGES[Math.floor(Math.random() * TILE_IMAGES.length)];
                    tilesHtml += `<div class="tile" style="background-image: url('${imgUrl}')" onclick="this.classList.toggle('selected')"></div>`;
                }
                challengeEl.innerHTML = `
                    <div class="recaptcha-header-banner">
                        <div class="recaptcha-prompt">Select all squares with</div>
                        <span class="recaptcha-target">${targetWord}</span>
                        <div class="recaptcha-sub">Click verify once there are none left.</div>
                    </div>
                    <div class="tiles-grid">
                        ${tilesHtml}
                    </div>
                `;
            }
            const timerEl = document.getElementById(`timer-${index}`);
            if (timerEl) {
                timerEl.querySelector('span').textContent = '120';
                timerEl.classList.remove('warning');
            }
        }

        // Set & Relaunch button
        document.getElementById('ct-create-panels-btn').addEventListener('click', () => {
            const count = parseInt(document.getElementById('ct-panel-count').value) || 12;
            renderGrid(count);
        });

        // Column selector
        document.getElementById('ct-columns').addEventListener('change', (e) => {
            document.getElementById('panels-grid').style.gridTemplateColumns = `repeat(${e.target.value}, 1fr)`;
        });

        // Settings modal
        const modal = document.getElementById('settings-modal');
        document.getElementById('ct-settings-btn').addEventListener('click', () => {
            modal.style.display = 'flex';
        });
        document.getElementById('close-modal-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        document.getElementById('save-modal-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Fullscreen toggle
        document.getElementById('ct-fullscreen-btn').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // Initial render
        renderGrid(12);
    </script>
</body>
</html>
"""

@app.route('/', methods=['GET'])
@app.route('/gui', methods=['GET'])
def index():
    if 'text/html' in request.headers.get('Accept', '') or request.args.get('gui') == '1' or not request.is_json:
        return render_template_string(PURE_SOLVER_HTML)
    return jsonify({
        "status": "online",
        "service": "CaptchaTyper Proxy Server",
        "endpoints": [
            "/health",
            "/proxy_captcha",
            "/store_captcha_frame",
            "/render_captcha_frame"
        ]
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"}), 200

@app.route('/proxy_captcha', methods=['GET', 'POST'])
def proxy_captcha():
    target_url = request.args.get('target_url')
    ref_domain = request.args.get('domain', 'https://worker.captchatypers.com/')
    
    if not target_url:
        return ("Missing target_url parameter", 400)
    if not ref_domain.startswith('http'):
        ref_domain = 'https://' + ref_domain
    req_headers = {
        'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'),
        'Referer': ref_domain,
        'Origin': ref_domain
    }
    try:
        req = urllib.request.Request(target_url, headers=req_headers)
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            status_code = resp.status
            content_type = resp.headers.get('Content-Type', 'text/html')
            
            if 'javascript' in content_type or 'html' in content_type:
                encoded_domain = urllib.parse.quote(ref_domain)
                content_text = content.decode('utf-8', errors='ignore')
                content_text = content_text.replace('https://www.google.com/recaptcha/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://www.google.com/recaptcha/')
                content_text = content_text.replace('https://www.gstatic.com/recaptcha/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://www.gstatic.com/recaptcha/')
                content_text = content_text.replace('https://js.hcaptcha.com/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://js.hcaptcha.com/')
                content_text = content_text.replace('https://assets.hcaptcha.com/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://assets.hcaptcha.com/')
                content = content_text.encode('utf-8')
            return Response(content, status=status_code, content_type=content_type)
    except Exception as e:
        return (f"Proxy error: {e}", 500)

@app.route('/store_captcha_frame', methods=['POST'])
def store_captcha_frame():
    data = request.get_json() or {}
    frame_id = data.get('id')
    html = data.get('html', '')
    domain = data.get('domain', 'https://worker.captchatypers.com/')
    if frame_id:
        if len(CAPTCHA_FRAMES) > 500:
            keys_to_delete = list(CAPTCHA_FRAMES.keys())[:-250]
            for k in keys_to_delete:
                CAPTCHA_FRAMES.pop(k, None)
        CAPTCHA_FRAMES[frame_id] = {'html': html, 'domain': domain}
        return jsonify({'success': True})
    return jsonify({'error': 'Missing frame id'}), 400

@app.route('/render_captcha_frame', methods=['GET'])
def render_captcha_frame():
    frame_id = request.args.get('id')
    frame_data = CAPTCHA_FRAMES.get(frame_id) if frame_id else None
    
    if not frame_data:
        raw_html = request.args.get('html', '')
        ref_domain = request.args.get('domain', 'https://worker.captchatypers.com/')
    else:
        raw_html = frame_data['html']
        ref_domain = frame_data['domain']
        
    if not raw_html:
        return ("No HTML provided", 400)
        
    if not ref_domain.startswith('http'):
        ref_domain = 'https://' + ref_domain
        
    encoded_domain = urllib.parse.quote(ref_domain)
    
    raw_html = raw_html.replace('https://www.google.com/recaptcha/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://www.google.com/recaptcha/')
    raw_html = raw_html.replace('https://www.gstatic.com/recaptcha/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://www.gstatic.com/recaptcha/')
    raw_html = raw_html.replace('https://js.hcaptcha.com/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://js.hcaptcha.com/')
    raw_html = raw_html.replace('https://assets.hcaptcha.com/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://assets.hcaptcha.com/')
    raw_html = raw_html.replace('https://{Domain}/recaptcha/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://www.google.com/recaptcha/')
    raw_html = raw_html.replace('https://{Domain}/1/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://js.hcaptcha.com/1/')
    raw_html = raw_html.replace('https://{Domain}/', f'/proxy_captcha?domain={encoded_domain}&target_url=https://js.hcaptcha.com/')
    if '<base' not in raw_html:
        if '<head>' in raw_html:
            raw_html = raw_html.replace('<head>', f'<head><base href="{ref_domain}">')
        else:
            raw_html = f'<base href="{ref_domain}">' + raw_html
            
    console_forwarder = """<script>
    (function() {
        var _log = console.log;
        console.log = function() {
            _log.apply(console, arguments);
            var str = Array.from(arguments).join(" ");
            try { window.parent.postMessage({ type: "ctor-console-event", iframeId: window.name, msg: str }, "*"); } catch(e){}
        };
        setTimeout(function() {
            console.log("frame-onload");
            console.log("frame loaded !");
            console.log("detect-active");
        }, 200);
    })();
    </script>"""
    if '<head>' in raw_html:
        raw_html = raw_html.replace('<head>', '<head>' + console_forwarder)
    else:
        raw_html = console_forwarder + raw_html
    return Response(raw_html, status=200, content_type='text/html; charset=utf-8')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1')
    app.run(host='0.0.0.0', port=port, debug=debug)
