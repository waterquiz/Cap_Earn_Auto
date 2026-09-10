const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.currentProxyIndex = 0;
        this.proxyMode = 'none'; // 'none' | 'manual'
        this.manualProxies = [];
        this.rhythm = {
            current: 1,
            min: 1,
            max: 10000,
            increase: 1,
            decrease: 3
        };
    }

    async loadProxies() {
        if (this.proxyMode === 'manual') {
            this.proxies = [...this.manualProxies];
            return true;
        }
        this.proxies = [];
        this.proxyMode = 'none';
        return false;
    }

    loadLocalProxies() {
        try {
            const filePath = path.join(__dirname, 'proxies.txt');
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                this.setManualProxies(content);
                console.log('[ProxyManager] Loaded ' + this.proxies.length + ' proxies from local file');
                return true;
            }
        } catch (err) {
            console.error('[ProxyManager] Failed to load local proxies:', err);
        }
        this.proxies = [];
        return false;
    }

    getProxyForPanel(panelIndex) {
        if (this.proxyMode === 'none' || !this.proxies || this.proxies.length === 0) {
            return null;
        }
        const pIndex = parseInt(panelIndex, 10) || 0;
        const idx = ((pIndex % this.proxies.length) + this.proxies.length) % this.proxies.length;
        const proxyStr = this.proxies[idx];
        const proxyObj = this.getProxyObject(proxyStr);
        return proxyObj;
    }

    getNextProxy() {
        if (this.proxyMode === 'none' || !this.proxies || this.proxies.length === 0) {
            return null;
        }
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
        const proxyStr = this.proxies[this.currentProxyIndex];
        console.log('[ProxyManager] Rotated to proxy index ' + this.currentProxyIndex + ': ' + proxyStr);
        return this.getProxyObject(proxyStr);
    }

    getRandomProxy() {
        if (this.proxyMode === 'none' || !this.proxies || this.proxies.length === 0) {
            return null;
        }
        this.currentProxyIndex = Math.floor(Math.random() * this.proxies.length);
        const proxyStr = this.proxies[this.currentProxyIndex];
        console.log('[ProxyManager] Selected random proxy index ' + this.currentProxyIndex + ': ' + proxyStr);
        return this.getProxyObject(proxyStr);
    }

    getProxyObject(proxyStr) {
        if (!proxyStr || typeof proxyStr !== 'string') return null;
        let clean = proxyStr.trim();
        if (!clean) return null;

        // Remove protocol if present
        let protocol = 'http';
        if (clean.startsWith('http://')) {
            protocol = 'http';
            clean = clean.substring(7);
        } else if (clean.startsWith('https://')) {
            protocol = 'https';
            clean = clean.substring(8);
        } else if (clean.startsWith('socks5://')) {
            protocol = 'socks5';
            clean = clean.substring(9);
        } else if (clean.startsWith('socks4://')) {
            protocol = 'socks4';
            clean = clean.substring(9);
        }

        let host = '';
        let port = 80;
        let username = '';
        let password = '';

        // Check if user:pass@host:port format
        if (clean.includes('@')) {
            const [authPart, hostPart] = clean.split('@');
            if (authPart.includes(':')) {
                const [u, ...p] = authPart.split(':');
                username = u;
                password = p.join(':');
            } else {
                username = authPart;
            }
            if (hostPart.includes(':')) {
                const [h, prt] = hostPart.split(':');
                host = h;
                port = parseInt(prt, 10) || 80;
            } else {
                host = hostPart;
            }
        } else {
            // host:port:user:pass OR host:port format
            const parts = clean.split(':');
            host = parts[0] || '';
            port = parseInt(parts[1], 10) || 80;
            username = parts[2] || '';
            password = parts.slice(3).join(':') || '';
        }

        if (!host) return null;

        const auth = (username && password) ? `${username}:${password}` : '';
        const proxyRules = `${host}:${port}`;
        return { host, port, username, password, auth, proxyRules, protocol, full: proxyStr.trim() };
    }

    getProxyAgent(panelIndex = 0) {
        if (this.proxyMode === 'none' || !this.proxies || this.proxies.length === 0) {
            return null;
        }
        const pObj = this.getProxyForPanel(panelIndex);
        if (!pObj) return null;
        const proxyUrl = pObj.auth 
            ? `http://${pObj.auth}@${pObj.host}:${pObj.port}`
            : `http://${pObj.host}:${pObj.port}`;
        try {
            return new HttpsProxyAgent(proxyUrl);
        } catch(e) {
            return null;
        }
    }

    increaseRhythm() {
        this.rhythm.current = Math.min(this.rhythm.current + this.rhythm.increase, this.rhythm.max);
        console.log('[ProxyManager] Rhythm increased to: ' + this.rhythm.current + 'ms (task found)');
    }

    decreaseRhythm() {
        this.rhythm.current = Math.max(this.rhythm.current - this.rhythm.decrease, this.rhythm.min);
        console.log('[ProxyManager] Rhythm decreased to: ' + this.rhythm.current + 'ms (no task)');
    }

    getCurrentRhythm() {
        return this.rhythm.current;
    }

    setRhythm(config) {
        if (!config) return;
        if (config.current !== undefined) this.rhythm.current = config.current;
        if (config.min !== undefined) this.rhythm.min = config.min;
        if (config.max !== undefined) this.rhythm.max = config.max;
        if (config.increase !== undefined) this.rhythm.increase = config.increase;
        if (config.decrease !== undefined) this.rhythm.decrease = config.decrease;
        console.log('[ProxyManager] Rhythm configured:', this.rhythm);
    }

    getProxyCount() {
        if (this.proxyMode === 'none') return 0;
        return this.proxies ? this.proxies.length : 0;
    }

    getCurrentProxyIndex() {
        return this.currentProxyIndex;
    }

    async setProxyMode(mode) {
        if (mode === 'manual') {
            this.proxyMode = 'manual';
            this.proxies = [...this.manualProxies];
            console.log('[ProxyManager] Proxy mode set to: manual (' + this.proxies.length + ' manual proxies loaded)');
            return true;
        }
        
        // 'none' or default
        this.proxyMode = 'none';
        this.proxies = [];
        console.log('[ProxyManager] Proxy mode set to: none (No Proxies)');
        return true;
    }

    setManualProxies(input) {
        if (Array.isArray(input)) {
            this.manualProxies = input.map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
        } else if (typeof input === 'string') {
            this.manualProxies = input.trim().split('\n').map(p => p.trim()).filter(Boolean);
        } else {
            this.manualProxies = [];
        }
        console.log('[ProxyManager] Manual proxies configured: ' + this.manualProxies.length + ' proxies');
        if (this.proxyMode === 'manual') {
            this.proxies = [...this.manualProxies];
        }
        return this.manualProxies.length;
    }

    getManualProxies() {
        return this.manualProxies;
    }

    getProxyMode() {
        return this.proxyMode;
    }

    async testProxy(proxyStr) {
        try {
            const pObj = this.getProxyObject(proxyStr);
            if (!pObj) {
                return { success: false, error: 'Invalid proxy format', proxy: proxyStr };
            }
            const auth = pObj.auth ? `${pObj.auth}@` : '';
            const proxyUrl = `http://${auth}${pObj.host}:${pObj.port}`;
            const agent = new HttpsProxyAgent(proxyUrl);
            console.log('[ProxyManager] Testing proxy: ' + pObj.host + ':' + pObj.port);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            const res = await fetch('https://api.ipify.org?format=json', {
                agent,
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (res.ok) {
                const data = await res.json();
                console.log('[ProxyManager] Proxy ' + pObj.host + ':' + pObj.port + ' is ACTIVE (IP: ' + data.ip + ')');
                return { success: true, ip: data.ip, proxy: `${pObj.host}:${pObj.port}` };
            } else {
                console.log('[ProxyManager] Proxy ' + pObj.host + ':' + pObj.port + ' returned status: ' + res.status);
                return { success: false, error: 'HTTP ' + res.status, proxy: `${pObj.host}:${pObj.port}` };
            }
        } catch (err) {
            console.error('[ProxyManager] Proxy test failed:', err.message);
            return { success: false, error: err.message, proxy: proxyStr };
        }
    }

    async testAllProxies(limit = 10) {
        if (this.proxyMode === 'none' || !this.proxies || this.proxies.length === 0) {
            return { total: 0, active: 0, results: [] };
        }
        console.log('[ProxyManager] Testing ' + Math.min(limit, this.proxies.length) + ' proxies...');
        const results = [];
        const toTest = this.proxies.slice(0, limit);
        for (const p of toTest) {
            const r = await this.testProxy(p);
            results.push(r);
        }
        const active = results.filter(r => r.success).length;
        console.log('[ProxyManager] Test complete: ' + active + '/' + results.length + ' proxies active');
        return { total: results.length, active, results };
    }
}

module.exports = new ProxyManager();
console.log('[ProxyManager] ProxyManager ready');






