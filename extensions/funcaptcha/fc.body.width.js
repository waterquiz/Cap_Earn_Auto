;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initBodyWidth = () => {
        // Cegah double initialization
        if (window.__fcBodyWidthInitialized) {
            console.log('⚠️ [FC Body Width] Already initialized, skipping...')
            return;
        }
        window.__fcBodyWidthInitialized = true;
        
        const style = document.createElement('style')
        style.innerHTML = `body { width: 385px !important }`
        document.body.appendChild(style)
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [FC Body Width] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [FC Body Width] DOM ready, initializing...')
            initBodyWidth()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [FC Body Width] DOM already ready, initializing immediately...')
        initBodyWidth()
    }
})()
