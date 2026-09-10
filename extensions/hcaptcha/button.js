;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initButton = () => {
        // Cegah double initialization
        if (window.__hcButtonInitialized) {
            console.log('⚠️ [HC Button] Already initialized, skipping...')
            return;
        }
        window.__hcButtonInitialized = true;
        
        if(location.hash.indexOf('frame=checkbox') == -1)
            return

        const btn = document.getElementById('anchor')

        setTimeout(() => {
            if(btn && btn.getAttribute('aria-hidden') == 'false') {
                console.log(location.href)
                verifyClick(btn)
            }
                    
            //setTimeout(() => console.log('frame-onload'),2000)
        },2000)

        setInterval(() => {
            const confError = document.getElementById('config-error')
            const confWarning = document.getElementById('config-warning')
            if(
                (confError && confError.innerText) ||
                (confWarning && confWarning.innerText)
            )
                console.log('captcha-load-error')
         
        },1000)
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [HC Button] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [HC Button] DOM ready, initializing...')
            initButton()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [HC Button] DOM already ready, initializing immediately...')
        initButton()
    }
})()

