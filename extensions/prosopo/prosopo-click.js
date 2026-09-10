;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initProsopoClick = () => {
        // Cegah double initialization
        if (window.__prosopoClickInitialized) {
            console.log('⚠️ [Prosopo Click] Already initialized, skipping...')
            return;
        }
        window.__prosopoClickInitialized = true;
        
        const maxApiWait = 10000;
        const maxElementWait = 15000;
        let apiWaitTime = 0;

        const apiReadyInterval = setInterval(() => {
            apiWaitTime += 200;

            if (window.procaptcha && typeof window.procaptcha.render === 'function') {
                clearInterval(apiReadyInterval);
                
                findAndClickCheckbox();
                return;
            }

            if (apiWaitTime >= maxApiWait) {
                clearInterval(apiReadyInterval);
            }
        }, 200);

        function findAndClickCheckbox() {
            let elementWaitTime = 0;
            const elementInterval = setInterval(() => {
                elementWaitTime += 500;
                
                const host = document.querySelector('prosopo-procaptcha')?.shadowRoot;
                if (host) {
                    const checkbox = host.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.click();
                        clearInterval(elementInterval);
                        return;
                    }
                }
                
                if (elementWaitTime >= maxElementWait) {
                    clearInterval(elementInterval);
                }
            }, 500);
        }
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [Prosopo Click] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [Prosopo Click] DOM ready, initializing...')
            initProsopoClick()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [Prosopo Click] DOM already ready, initializing immediately...')
        initProsopoClick()
    }
})();
