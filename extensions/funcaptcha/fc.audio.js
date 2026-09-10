;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initAudio = () => {
        // Cegah double initialization
        if (window.__fcAudioInitialized) {
            console.log('⚠️ [FC Audio] Already initialized, skipping...')
            return;
        }
        window.__fcAudioInitialized = true;
        
        setInterval(() => {
            const element = document.getElementById('audio')
            if(element && element.style.display != 'none')
                console.log('detect-active');
        },1000)
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [FC Audio] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [FC Audio] DOM ready, initializing...')
            initAudio()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [FC Audio] DOM already ready, initializing immediately...')
        initAudio()
    }
})()

