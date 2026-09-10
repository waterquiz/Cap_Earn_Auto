;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initHelper = () => {
        // Cegah double initialization
        if (window.__fcHelperInitialized) {
            console.log('⚠️ [FC Helper] Already initialized, skipping...')
            return;
        }
        window.__fcHelperInitialized = true;
        
        console.log('detect-active-trigger')
        const attribKey = 'mt_inj';
        const canvasId = 'FunCAPTCHA';
        setInterval(() => {
            const element = document.getElementById(canvasId);
            if(element && !element.getAttribute(attribKey))
            {
                element.addEventListener('click', () => {
                    console.log('detect-active');
                });
                element.setAttribute(attribKey,'true');
            }else if(!element)
                console.log('detect-active');

        },1500)
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [FC Helper] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [FC Helper] DOM ready, initializing...')
            initHelper()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [FC Helper] DOM already ready, initializing immediately...')
        initHelper()
    }
})()
