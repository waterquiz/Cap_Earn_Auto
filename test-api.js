const fetch = require('node-fetch'); // or use undici if node 18+
const fs = require('fs');
(async () => {
    try {
        const url = 'https://api-inference.huggingface.co/models/DannyLuna/recaptcha-classification-57k';
        const headers = {
            'Authorization': 'Bearer ' + (process.env.HF_TOKEN || 'YOUR_HF_TOKEN'),
            'Content-Type': 'application/json'
        };
        const body = JSON.stringify({ inputs: 'https://huggingface.co/front/assets/huggingface_logo-noborder.svg' });
        
        // Node 18+ native fetch
        const res = await globalThis.fetch(url, { method: 'POST', headers, body });
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Response:', text);
    } catch (e) {
        console.error(e);
    }
})();
