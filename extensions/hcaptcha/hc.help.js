;(() => {
    // Fungsi utama yang akan dijalankan setelah DOM ready
    const initHelper = () => {
        // Cegah double initialization
        if (window.__hcHelperInitialized) {
            console.log('⚠️ [HC Helper] Already initialized, skipping...')
            return;
        }
        window.__hcHelperInitialized = true;
        
        console.log('frame-onload')
        if(location.hash.indexOf('frame=challenge') == -1)
            return
        console.log('detect-active-trigger')
        const attribKey = 'mt_inj';

        setInterval(() => {
            const input = document.querySelector('input.input-field[name="captcha"]');
            let images = document.querySelectorAll('.task-image');
            let button = document.querySelector('.button-submit');
            if(input && !input.getAttribute(attribKey))
            {
                input.setAttribute(attribKey,'true');
                input.addEventListener('input',() => {
                    console.log('detect-active');
                });
            }else if(!input && !images.length)
                console.log('detect-active');
            
            images.forEach(image => {
                if(image.getAttribute(attribKey))
                    return;
                image.setAttribute(attribKey,'true');
                image.addEventListener('click',() => {
                    console.log('detect-active');
                });
                /*
                image.addEventListener('contextmenu',function() {
                    verifyClick(this);
                    verifyClick(button);
                });
                */
                image.addEventListener('mouseenter',function(event)
                {
                    if(IsVerifyClick)
                        return true;
                    if(event.buttons)
                        verifyClick(this.querySelector('*'));
                });
                
                image.addEventListener('mousedown',function(event){
                    if(IsVerifyClick || !event.buttons)
                        return true;
                    console.log('mousedown');
                    verifyClick(this.querySelector('*'));
                });
                
                image.addEventListener('mouseup',function(){
                    if(IsVerifyClick)
                        return true;
                    console.log('mouseup');
                    verifyClick(this);
                });
            });
            if(button && !button.getAttribute(attribKey))
            {
                button.setAttribute(attribKey,'true');
                button.addEventListener('click',() => {
                    console.log('button-click');
                });
            }
        },1000);
    }
    
    // Tunggu hingga DOM siap sebelum menjalankan
    if (document.readyState === 'loading') {
        // DOM belum siap, tunggu event DOMContentLoaded
        console.log('⏳ [HC Helper] Waiting for DOM to be ready...')
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ [HC Helper] DOM ready, initializing...')
            initHelper()
        })
    } else {
        // DOM sudah siap, jalankan langsung
        console.log('✅ [HC Helper] DOM already ready, initializing immediately...')
        initHelper()
    }
})();
