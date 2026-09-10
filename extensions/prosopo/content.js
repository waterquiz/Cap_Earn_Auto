;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initProsopo = () => {
        if (window.hasCaptchaKingsProsopo) return;
        window.hasCaptchaKingsProsopo = true;

        if (!document.documentElement.innerHTML.includes('prosopo')) {
            return; 
        }

        function showIndicator() {
            // Buat style untuk indikator
            const styles = `
                #ck-indicator-prosopo {
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    background-color: rgba(10, 10, 20, 0.9);
                    color: #00ffff;
                    padding: 8px 15px;
                    border-radius: 5px;
                    border: 1px solid #00ffff;
                    font-size: 14px;
                    font-family: sans-serif;
                    z-index: 999999;
                    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
                    animation: ck-pulse-prosopo 2s infinite;
                    user-select: none;
                }
                @keyframes ck-pulse-prosopo { 
                    0% { opacity: 1; } 
                    50% { opacity: 0.8; } 
                    100% { opacity: 1; } 
                }
            `;
            
            const styleSheet = document.createElement("style");
            styleSheet.id = 'ck-indicator-style';
            styleSheet.innerText = styles;
            document.head.appendChild(styleSheet);
            
            const indicator = document.createElement('div');
            indicator.id = 'ck-indicator-prosopo';
            indicator.textContent = 'CaptchaKings Mencari Target...';
            document.body.appendChild(indicator);
        }

        function hideIndicator() {
            const indicator = document.getElementById('ck-indicator-prosopo');
            if (indicator) indicator.remove();
            
            const styleSheet = document.getElementById('ck-indicator-style');
            if (styleSheet) styleSheet.remove();
        }

        const findAndClick = () => {
            showIndicator();

            const maxAttempts = 50; 
            let attempt = 0;

            const interval = setInterval(() => {
                attempt++;
                if (attempt > maxAttempts) {
                    console.error('[Prosopo] Gagal menemukan target setelah 25 detik.');
                    hideIndicator();
                    clearInterval(interval);
                    return;
                }
                const host = document.querySelector('prosopo-procaptcha')?.shadowRoot;
                if (host) {
                    const checkbox = host.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        console.log('%c[Prosopo] Checkbox ditemukan! Melakukan klik.', 'color: #28a745; font-weight: bold;');
                        checkbox.click();
                        hideIndicator();
                        clearInterval(interval);
                    }
                }
            }, 500);
        }
        findAndClick();
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [Prosopo Content] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [Prosopo Content] DOM ready, initializing...')
            initProsopo()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [Prosopo Content] DOM already ready, initializing immediately...')
        initProsopo()
    }
})();
