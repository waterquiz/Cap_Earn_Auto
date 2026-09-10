'use strict';

/**
 * Menampilkan overlay yang elegan dan menutupi seluruh layar.
 * @param {string} message - Pesan yang akan ditampilkan.
 * @param {boolean} [isError=false] - Apakah overlay untuk pesan error.
 * @param {Document} [targetDoc=document] - Dokumen target untuk menampilkan overlay.
 */
function showGlobalOverlay(message, isError = false, targetDoc = document) {
    let overlay = targetDoc.getElementById('global-solver-overlay');
    if (!overlay) {
        overlay = targetDoc.createElement('div');
        overlay.id = 'global-solver-overlay';

        // Menggunakan array.join() untuk kejelasan dan kompatibilitas
        overlay.innerHTML = [
            '<style>',
            '#global-solver-overlay {',
            'position: fixed; top: 0; left: 0;',
            'width: 100vw; height: 100vh;',
            'background-color: rgba(0, 0, 0, 0.6);',
            'backdrop-filter: blur(1px);',
            '-webkit-backdrop-filter: blur(1px);',
            'z-index: 2147483647 !important;', // z-index maksimal dengan !important
            'display: flex; justify-content: center; align-items: center;',
            "font-family: 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;",
            'color: #fff; text-align: center;',
            'transition: opacity 0.3s ease;',
            'opacity: 0;',
            '}',
            '.gso-content { padding: 30px; border-radius: 10px; max-width: 90%; }',
            '.gso-spinner {',
            'width: 50px; height: 50px;',
            'border: 5px solid rgba(255, 255, 255, 0.3);',
            'border-top-color: #00ffff;', // Warna cyan untuk loading
            'border-radius: 50%;',
            'animation: gso-spin 1s linear infinite;',
            'margin: 0 auto 20px auto;',
            '}',
            ".gso-title { font-size: 2.2em; font-weight: 200; margin: 0; letter-spacing: 2px; text-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }",
            ".gso-subtitle { font-size: 1em; font-weight: 300; margin: 5px 0 20px 0; opacity: 0.8; }",
            ".gso-message { font-size: 1.1em; font-weight: 400; min-height: 25px; transition: all 0.3s ease; }",
            ".gso-content.error .gso-spinner { border-top-color: #ff5252; }", // Warna merah untuk error
            "@keyframes gso-spin { to { transform: rotate(360deg); } }",
            '</style>',
            '<div class="gso-content">',
            '<div class="gso-spinner"></div>',
            '<h1 class="gso-title">CAPTCHA KINGS</h1>',
            '<p class="gso-subtitle">Auto Solver</p>',
            '<p class="gso-message"></p>',
            '</div>'
        ].join('');

        targetDoc.body.appendChild(overlay);
        setTimeout(() => { overlay.style.opacity = '1'; }, 10);
    }

    overlay.querySelector('.gso-message').textContent = message;
    const contentEl = overlay.querySelector('.gso-content');
    if (isError) {
        contentEl.classList.add('error');
    } else {
        contentEl.classList.remove('error');
    }
}

/**
 * Menyembunyikan overlay global.
 * @param {Document} [targetDoc=document] - Dokumen target tempat overlay berada.
 */
function hideGlobalOverlay(targetDoc = document) {
    const overlay = targetDoc.getElementById('global-solver-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); }, 300); // 2x lebih cepat (dari 300ms ke 150ms)
    }
}

// Menetapkan fungsi ke objek global agar bisa diakses dari mana saja
window.CaptchaKingsUI = {
    showOverlay: showGlobalOverlay,
    hideOverlay: hideGlobalOverlay
};