import os
import urllib.request
import urllib.parse
from flask import Flask, render_template, request, jsonify, Response, render_template_string
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CAPTCHA_FRAMES = {}

DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CaptchaTyper - Railway Cloud Server</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0b0f19;
            color: #e2e8f0;
            min-height: 100vh;
            padding: 30px 20px;
        }
        .container {
            max-width: 960px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 30px;
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9));
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            margin-bottom: 24px;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .logo-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }
        h1 { font-size: 22px; font-weight: 700; color: #fff; }
        .subtitle { font-size: 13px; color: #94a3b8; margin-top: 2px; }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 20px;
            background: rgba(34, 197, 94, 0.12);
            color: #4ade80;
            border: 1px solid rgba(34, 197, 94, 0.3);
            font-size: 13px;
            font-weight: 600;
        }
        .dot {
            width: 8px;
            height: 8px;
            background: #22c55e;
            border-radius: 50%;
            box-shadow: 0 0 10px #22c55e;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.85); }
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 18px;
            margin-bottom: 24px;
        }
        .card {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 14px;
            padding: 22px;
            backdrop-filter: blur(10px);
        }
        .card-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        .card-value { font-size: 24px; font-weight: 700; color: #fff; margin-top: 8px; font-family: 'JetBrains Mono', monospace; }
        .card-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
        .section-title {
            font-size: 17px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .endpoints {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .endpoint-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            background: rgba(30, 41, 59, 0.4);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 10px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
        }
        .method {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            margin-right: 10px;
        }
        .get { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
        .post { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
        .both { background: rgba(234, 179, 8, 0.2); color: #facc15; }
        .ep-url { color: #f8fafc; font-weight: 500; }
        .btn-test {
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            border: 1px solid rgba(99, 102, 241, 0.3);
            padding: 5px 12px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 12px;
            font-family: 'Inter', sans-serif;
            font-weight: 500;
            transition: all 0.2s;
        }
        .btn-test:hover {
            background: rgba(99, 102, 241, 0.35);
            color: #fff;
        }
        .instructions {
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(99, 102, 241, 0.25);
            border-radius: 14px;
            padding: 24px;
            margin-top: 24px;
        }
        .step {
            display: flex;
            gap: 14px;
            margin-top: 14px;
        }
        .step-num {
            width: 28px;
            height: 28px;
            background: #4f46e5;
            color: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 13px;
            flex-shrink: 0;
        }
        .step-content { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
        pre {
            background: #030712;
            border: 1px solid rgba(148, 163, 184, 0.15);
            padding: 10px 14px;
            border-radius: 8px;
            margin-top: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #38bdf8;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand">
                <div class="logo-icon">⚡</div>
                <div>
                    <h1>CaptchaTyper Cloud Service</h1>
                    <div class="subtitle">Hosted on Railway &bull; Python Proxy & Frame Engine</div>
                </div>
            </div>
            <div class="badge">
                <span class="dot"></span>
                <span>ONLINE & ACTIVE</span>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-label">Service Status</div>
                <div class="card-value" style="color: #4ade80;">Operational</div>
                <div class="card-sub">All healthchecks passing</div>
            </div>
            <div class="card">
                <div class="card-label">Active Cached Frames</div>
                <div class="card-value">{{ frames_count }}</div>
                <div class="card-sub">Memory managed automatically</div>
            </div>
            <div class="card">
                <div class="card-label">Host Domain</div>
                <div class="card-value" style="font-size: 14px; word-break: break-all;">{{ host }}</div>
                <div class="card-sub">Railway Public Gateway</div>
            </div>
        </div>

        <div class="card">
            <div class="section-title">📡 Active Server Endpoints</div>
            <ul class="endpoints">
                <li class="endpoint-item">
                    <div>
                        <span class="method get">GET</span>
                        <span class="ep-url">/health</span>
                    </div>
                    <a class="btn-test" href="/health" target="_blank">Test &rarr;</a>
                </li>
                <li class="endpoint-item">
                    <div>
                        <span class="method both">GET / POST</span>
                        <span class="ep-url">/proxy_captcha</span>
                    </div>
                    <span style="font-size: 12px; color: #64748b;">Proxy reCAPTCHA / hCaptcha</span>
                </li>
                <li class="endpoint-item">
                    <div>
                        <span class="method post">POST</span>
                        <span class="ep-url">/store_captcha_frame</span>
                    </div>
                    <span style="font-size: 12px; color: #64748b;">Store HTML frame memory</span>
                </li>
                <li class="endpoint-item">
                    <div>
                        <span class="method get">GET</span>
                        <span class="ep-url">/render_captcha_frame</span>
                    </div>
                    <span style="font-size: 12px; color: #64748b;">Render cached frame</span>
                </li>
            </ul>
        </div>

        <div class="instructions">
            <div class="section-title">💻 How to Open the Windows GUI Software</div>
            
            <div class="step">
                <div class="step-num">1</div>
                <div class="step-content">
                    <strong>Launch the Windows App Locally:</strong>
                    The Windows GUI panel is an Electron desktop app that runs on your Windows desktop. Open your terminal in the project folder and start it:
                    <pre>npm start</pre>
                    Or double-click <code>launch_test.bat</code> on your desktop.
                </div>
            </div>

            <div class="step">
                <div class="step-num">2</div>
                <div class="step-content">
                    <strong>Connected to this Railway Server:</strong>
                    Your local Windows desktop software is configured to connect to this Railway cloud URL:
                    <pre>{{ host }}</pre>
                    All captcha frame handling and proxy requests from your desktop windows will route through this Railway server!
                </div>
            </div>
        </div>
    </div>
</body>
</html>
"""

@app.route('/', methods=['GET'])
def index():
    if 'text/html' in request.headers.get('Accept', '') or request.args.get('gui') == '1':
        return render_template_string(DASHBOARD_HTML, frames_count=len(CAPTCHA_FRAMES), host=request.host_url)
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
