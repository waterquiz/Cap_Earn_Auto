import os
import urllib.request
import urllib.parse
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CAPTCHA_FRAMES = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP2_DIR = os.path.join(BASE_DIR, 'app2')
TEMPLATE_DIR = os.path.join(BASE_DIR, 'template')

@app.route('/', methods=['GET'])
@app.route('/index.html', methods=['GET'])
def index():
    if request.headers.get('Accept') == 'application/json' and request.args.get('gui') != '1':
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
    return send_from_directory(APP2_DIR, 'index.html')

@app.route('/panel.html', methods=['GET'])
@app.route('/app2/panel.html', methods=['GET'])
def panel():
    return send_from_directory(APP2_DIR, 'panel.html')

@app.route('/css/<path:filename>', methods=['GET'])
def serve_css(filename):
    return send_from_directory(os.path.join(APP2_DIR, 'css'), filename)

@app.route('/js/<path:filename>', methods=['GET'])
def serve_js(filename):
    return send_from_directory(os.path.join(APP2_DIR, 'js'), filename)

@app.route('/fonts/<path:filename>', methods=['GET'])
def serve_fonts(filename):
    p1 = os.path.join(APP2_DIR, 'fonts')
    if os.path.exists(os.path.join(p1, filename)):
        return send_from_directory(p1, filename)
    return send_from_directory(os.path.join(APP2_DIR, 'css', 'fonts'), filename)

@app.route('/img/<path:filename>', methods=['GET'])
def serve_img(filename):
    return send_from_directory(os.path.join(APP2_DIR, 'img'), filename)

@app.route('/template/<path:filename>', methods=['GET'])
def serve_template(filename):
    return send_from_directory(TEMPLATE_DIR, filename)

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
