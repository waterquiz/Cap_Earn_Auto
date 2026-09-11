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

@app.route('/logo.png', methods=['GET'])
@app.route('/favicon.ico', methods=['GET'])
def serve_logo():
    return send_from_directory(APP2_DIR, 'logo.png')

import base64
import re

def get_co_for_domain(domain):
    domain = domain.replace('https://', '').replace('http://', '').strip('/')
    if ':' not in domain:
        origin_str = f"https://{domain}:443"
    else:
        origin_str = f"https://{domain}"
    return base64.b64encode(origin_str.encode('utf-8')).decode('utf-8').rstrip('=').replace('+', '-').replace('/', '_')

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"}), 200

@app.route('/version', methods=['GET'])
def version():
    return jsonify({"version": "v1.2-universal-regex"}), 200

@app.route('/store_captcha_frame', methods=['POST'])
def store_captcha_frame():
    data = request.get_json() or {}
    frame_id = data.get('id')
    html = data.get('html', '')
    domain = data.get('domain', 'worker.captchatypers.com')
    domain_clean = domain.replace('https://', '').replace('http://', '').strip('/')
    if frame_id:
        if len(CAPTCHA_FRAMES) > 500:
            keys_to_delete = list(CAPTCHA_FRAMES.keys())[:-250]
            for k in keys_to_delete:
                CAPTCHA_FRAMES.pop(k, None)
        CAPTCHA_FRAMES[frame_id] = {'html': html, 'domain': domain_clean}
        return jsonify({'success': True})
    return jsonify({'error': 'Missing frame id'}), 400

@app.route('/recaptcha_proxy/<domain>/<path:endpoint>', methods=['GET', 'POST', 'OPTIONS'])
def recaptcha_proxy(domain, endpoint):
    if request.method == 'OPTIONS':
        resp = Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        return resp

    ref_domain = f"https://{domain}/"
    co_val = get_co_for_domain(domain)
    
    qs = request.query_string.decode('utf-8', errors='ignore')
    if 'co=' in qs:
        qs = re.sub(r'co=[^&]+', f'co={co_val}', qs)

    if endpoint.startswith('releases/'):
        target_url = f"https://www.gstatic.com/recaptcha/{endpoint}"
    else:
        target_url = f"https://www.google.com/recaptcha/{endpoint}"
    if qs:
        target_url += f"?{qs}"

    req_headers = {
        'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
        'Referer': ref_domain,
        'Origin': f"https://{domain}"
    }

    if request.method == 'POST':
        body = request.get_data()
        ct = request.headers.get('Content-Type')
        if ct:
            req_headers['Content-Type'] = ct
        req = urllib.request.Request(target_url, data=body, headers=req_headers, method='POST')
    else:
        req = urllib.request.Request(target_url, headers=req_headers)

    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            status_code = resp.status
            content_type = resp.headers.get('Content-Type', 'text/html')
            
            if 'javascript' in content_type or 'html' in content_type or 'json' in content_type:
                content_text = content.decode('utf-8', errors='ignore')
                # Remove SRI integrity check
                content_text = re.sub(r'po\.integrity\s*=\s*[\'"][^\'"]*[\'"];?', '', content_text)
                
                # Rewrite Google endpoints
                content_text = content_text.replace('https://www.google.com/recaptcha/', f'/recaptcha_proxy/{domain}/')
                content_text = content_text.replace('https://www.gstatic.com/recaptcha/', f'/gstatic_proxy/{domain}/')

                # In JS scripts (recaptcha__en.js), ensure cross-window postMessage handshake uses targetOrigin '*'
                if 'javascript' in content_type:
                    content_text = re.sub(r'(\.postMessage\([^,]+,).*?(,\[\w+\.port2\]\))', r'\1"*"\2', content_text)
                    content_text = re.sub(r'([a-zA-Z0-9_$]+)=function\([a-zA-Z0-9_$,\s]+\)\{return\s+[\s\S]*?contentWindow[\s\S]*?:null\}(?=,\s*[a-zA-Z0-9_$]+=new Promise\()', r'\1=function(e){try{var p=(e.ports&&e.ports[0])||(e.O5&&e.O5.ports&&e.O5.ports[0])||(e.Iz&&e.Iz.ports&&e.Iz.ports[0]);if(p)return p;}catch(x){}return null;}', content_text)
                    content_text = content_text.replace('N&&k&&C&&u.ports.length>B', 'N&&C&&u.ports.length>B')
                    content_text = content_text.replace('Z.R(N.origin)', 'true')

                # In HTML pages (anchor, bframe), shim Window.prototype.postMessage so targetOrigin '*' is used safely
                if 'html' in content_type:
                    pm_shim = '<script>(function(){try{var o=Window.prototype.postMessage;Window.prototype.postMessage=function(m,t,tr){if(typeof t==="object"&&t!==null){t.targetOrigin="*";return o.call(this,m,t);}return o.call(this,m,"*",tr);};}catch(e){}})();</script>'
                    if '<head>' in content_text:
                        content_text = content_text.replace('<head>', '<head>' + pm_shim)
                    elif '<html>' in content_text:
                        content_text = content_text.replace('<html>', '<html><head>' + pm_shim + '</head>')
                    else:
                        content_text = pm_shim + content_text

                content = content_text.encode('utf-8')
            
            r = Response(content, status=status_code, content_type=content_type)
            r.headers['Access-Control-Allow-Origin'] = '*'
            r.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            r.headers['Access-Control-Allow-Headers'] = '*'
            r.headers.pop('X-Frame-Options', None)
            r.headers.pop('Content-Security-Policy', None)
            return r
    except Exception as e:
        print(f"Proxy error for {target_url}: {e}")
        return (f"Proxy error: {e}", 500)

@app.route('/gstatic_proxy/<domain>/<path:endpoint>', methods=['GET', 'OPTIONS'])
def gstatic_proxy(domain, endpoint):
    if request.method == 'OPTIONS':
        resp = Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        return resp

    ref_domain = f"https://{domain}/"
    qs = request.query_string.decode('utf-8', errors='ignore')
    target_url = f"https://www.gstatic.com/recaptcha/{endpoint}"
    if qs:
        target_url += f"?{qs}"

    req_headers = {
        'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
        'Referer': ref_domain
    }

    req = urllib.request.Request(target_url, headers=req_headers)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            status_code = resp.status
            content_type = resp.headers.get('Content-Type', 'text/html')
            
            if 'javascript' in content_type or 'html' in content_type or 'css' in content_type:
                content_text = content.decode('utf-8', errors='ignore')
                content_text = re.sub(r'po\.integrity\s*=\s*[\'"][^\'"]*[\'"];?', '', content_text)
                content_text = content_text.replace('https://www.google.com/recaptcha/', f'/recaptcha_proxy/{domain}/')
                content_text = content_text.replace('https://www.gstatic.com/recaptcha/', f'/gstatic_proxy/{domain}/')
                if 'javascript' in content_type:
                    content_text = re.sub(r'(\.postMessage\([^,]+,).*?(,\[\w+\.port2\]\))', r'\1"*"\2', content_text)
                    content_text = re.sub(r'([a-zA-Z0-9_$]+)=function\([a-zA-Z0-9_$,\s]+\)\{return\s+[\s\S]*?contentWindow[\s\S]*?:null\}(?=,\s*[a-zA-Z0-9_$]+=new Promise\()', r'\1=function(e){try{var p=(e.ports&&e.ports[0])||(e.O5&&e.O5.ports&&e.O5.ports[0])||(e.Iz&&e.Iz.ports&&e.Iz.ports[0]);if(p)return p;}catch(x){}return null;}', content_text)
                    content_text = content_text.replace('N&&k&&C&&u.ports.length>B', 'N&&C&&u.ports.length>B')
                    content_text = content_text.replace('Z.R(N.origin)', 'true')
                content = content_text.encode('utf-8')
            
            r = Response(content, status=status_code, content_type=content_type)
            r.headers['Access-Control-Allow-Origin'] = '*'
            r.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            r.headers['Access-Control-Allow-Headers'] = '*'
            r.headers.pop('X-Frame-Options', None)
            r.headers.pop('Content-Security-Policy', None)
            return r
    except Exception as e:
        print(f"Gstatic proxy error for {target_url}: {e}")
        return (f"Proxy error: {e}", 500)

@app.route('/render_captcha_frame', methods=['GET'])
def render_captcha_frame():
    frame_id = request.args.get('id')
    frame_data = CAPTCHA_FRAMES.get(frame_id) if frame_id else None
    
    if not frame_data:
        raw_html = request.args.get('html', '')
        ref_domain = request.args.get('domain', 'worker.captchatypers.com')
    else:
        raw_html = frame_data['html']
        ref_domain = frame_data['domain']
        
    if not raw_html:
        return ("No HTML provided", 400)
        
    domain_clean = ref_domain.replace('https://', '').replace('http://', '').strip('/')
    
    # Clean template placeholders and route through our recaptcha & gstatic proxies
    raw_html = raw_html.replace('https://{Domain}/recaptcha/', f'/recaptcha_proxy/{domain_clean}/')
    raw_html = raw_html.replace('https://www.google.com/recaptcha/', f'/recaptcha_proxy/{domain_clean}/')
    raw_html = raw_html.replace('https://www.gstatic.com/recaptcha/', f'/gstatic_proxy/{domain_clean}/')
    raw_html = raw_html.replace('https://{Domain}/1/', 'https://js.hcaptcha.com/1/')
    raw_html = raw_html.replace('https://{Domain}/turnstile/', 'https://challenges.cloudflare.com/turnstile/')
    raw_html = raw_html.replace('{Domain}', 'www.google.com')

    console_forwarder = """<script>
    (function() {
        var _log = console.log;
        console.log = function() {
            _log.apply(console, arguments);
            try {
                var str = Array.from(arguments).join(" ");
                if (typeof str === 'string' && (str.indexOf('token:') !== -1 || str.indexOf('client_solution:') !== -1 || str.indexOf('frame loaded') !== -1 || str.indexOf('detect-active') !== -1 || str.indexOf('frame-onload') !== -1 || str.indexOf('captcha-load-error') !== -1)) {
                    if (str.indexOf('ctor-console-event') === -1 && window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: "ctor-console-event", iframeId: window.name, msg: str }, "*");
                    }
                }
            } catch(e){}
        };
        setTimeout(function() {
            console.log("frame-onload");
            console.log("frame loaded !");
            console.log("detect-active");
        }, 150);
    })();
    </script>"""
    if '<head>' in raw_html:
        raw_html = raw_html.replace('<head>', '<head>' + console_forwarder)
    elif '<html>' in raw_html:
        raw_html = raw_html.replace('<html>', '<html><head>' + console_forwarder + '</head>')
    else:
        raw_html = console_forwarder + raw_html

    resp = Response(raw_html, status=200, content_type='text/html; charset=utf-8')
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers.pop('X-Frame-Options', None)
    return resp

@app.route('/proxy_captcha', methods=['GET', 'POST', 'OPTIONS'])
def proxy_captcha():
    if request.method == 'OPTIONS':
        resp = Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        return resp

    target_url = request.args.get('target_url')
    ref_domain = request.args.get('domain', 'https://worker.captchatypers.com/')
    
    if not target_url:
        return ("Missing target_url parameter", 400)
    if not ref_domain.startswith('http'):
        ref_domain = 'https://' + ref_domain
    domain_clean = ref_domain.replace('https://', '').replace('http://', '').strip('/')
    co_val = get_co_for_domain(domain_clean)
    if 'co=' in target_url:
        target_url = re.sub(r'co=[^&]+', f'co={co_val}', target_url)

    req_headers = {
        'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
        'Referer': ref_domain,
        'Origin': f"https://{domain_clean}"
    }
    try:
        if request.method == 'POST':
            body = request.get_data()
            ct = request.headers.get('Content-Type')
            if ct:
                req_headers['Content-Type'] = ct
            req = urllib.request.Request(target_url, data=body, headers=req_headers, method='POST')
        else:
            req = urllib.request.Request(target_url, headers=req_headers)

        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            status_code = resp.status
            content_type = resp.headers.get('Content-Type', 'text/html')
            
            if 'javascript' in content_type or 'html' in content_type or 'json' in content_type:
                content_text = content.decode('utf-8', errors='ignore')
                content_text = re.sub(r'po\.integrity\s*=\s*[\'"][^\'"]*[\'"];?', '', content_text)
                content_text = content_text.replace('https://www.google.com/recaptcha/', f'/recaptcha_proxy/{domain_clean}/')
                content_text = content_text.replace('https://www.gstatic.com/recaptcha/', f'/gstatic_proxy/{domain_clean}/')
                content = content_text.encode('utf-8')
            r = Response(content, status=status_code, content_type=content_type)
            r.headers['Access-Control-Allow-Origin'] = '*'
            r.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            r.headers['Access-Control-Allow-Headers'] = '*'
            r.headers.pop('X-Frame-Options', None)
            r.headers.pop('Content-Security-Policy', None)
            return r
    except Exception as e:
        return (f"Proxy error: {e}", 500)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1')
    app.run(host='0.0.0.0', port=port, debug=debug)
