;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initScreen = () => {
        // Cegah double initialization
        if (window.__fcScreenInitialized) {
            console.log('⚠️ [FC Screen] Already initialized, skipping...')
            return;
        }
        window.__fcScreenInitialized = true;
        
        // Set screen dimensions directly tanpa inline script
        window.outerWidth = window.screen.availWidth;
        window.outerHeight = window.screen.availHeight;
        
        console.log('inj', location.href)
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [FC Screen] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [FC Screen] DOM ready, initializing...')
            initScreen()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [FC Screen] DOM already ready, initializing immediately...')
        initScreen()
    }
})()
