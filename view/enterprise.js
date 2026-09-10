['head','body'].forEach(tag => {
    const q = document.querySelector(tag)
    q.parentNode.removeChild(q)
})

const scriptLoadError = () => {
    console.log('frame-load-error')
}

const dom = document.querySelector('html')
const body = document.createElement('body')
const head = document.createElement('head')

// Add styling to make captcha visible
const style = document.createElement('style')
style.textContent = `
    body {
        margin: 0;
        padding: 20px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #f9f9f9;
    }
    #recaptcha_render {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        transform: scale(1) !important;
    }
`
head.appendChild(style)

dom.appendChild(head)
dom.appendChild(body)

const div = document.createElement('div')
div.id = 'recaptcha_render'
body.appendChild(div)

// Strategy configuration: Domain, Script File, Render Param
const strategies = [
    { domain: '${Domain}', script: 'enterprise.js', render: '${GoogleKey}' },
    { domain: 'www.google.com', script: 'enterprise.js', render: '${GoogleKey}' },
    { domain: 'www.google.com', script: 'enterprise.js', render: 'explicit' },       // Fallback: Explicit render (avoids 400 Bad Request)
    { domain: 'recaptcha.net', script: 'enterprise.js', render: 'explicit' },        // Fallback: Alternative domain
    { domain: 'www.recaptcha.net', script: 'enterprise.js', render: 'explicit' },    // Fallback: Another alternative
    { domain: 'www.google.com', script: 'api.js', render: 'explicit' },              // Fallback: Standard API (v2/v3 compatible)
    { domain: 'www.gstatic.com', script: 'enterprise.js', render: 'explicit' }       // Last resort
];

// Deduplicate strategies based on actual values (in case ${Domain} is same as others)
const uniqueStrategies = strategies.filter((s, index, self) => 
    index === self.findIndex((t) => (
        t.domain === s.domain && t.script === s.script && t.render === s.render
    ))
);

const loadRecaptchaScript = (index) => {
    if (index >= uniqueStrategies.length) {
        console.error('All reCAPTCHA strategies failed.');
        scriptLoadError();
        return;
    }

    const strategy = uniqueStrategies[index];
    console.log(`Attempting to load reCAPTCHA (Strategy ${index + 1}/${uniqueStrategies.length}): Domain=${strategy.domain}, Script=${strategy.script}, Render=${strategy.render}`);

    const script = document.createElement('script');
    script.src = `https://${strategy.domain}/recaptcha/${strategy.script}?render=${strategy.render}&onload=onloadCallback`;
    script.async = true;
    script.defer = true;
    
    script.onerror = (e) => {
        console.warn(`Failed to load reCAPTCHA from ${strategy.domain} (${strategy.script}):`, e);
        
        // Diagnostic: Fetch the URL to see what's actually returned
        fetch(script.src)
            .then(res => {
                console.log(`[Diagnostic] Fetch status:`, res.status);
                console.log(`[Diagnostic] Content-Type:`, res.headers.get('content-type'));
                return res.text();
            })
            .then(text => {
                console.log(`[Diagnostic] Body preview:`, text.substring(0, 200));
            })
            .catch(err => console.error(`[Diagnostic] Fetch failed:`, err))
            .finally(() => {
                // Try next strategy
                try { head.removeChild(script); } catch(err) {}
                loadRecaptchaScript(index + 1);
            });
    };

    head.appendChild(script);
}

var onloadCallback = function()
{
    console.log('enterprise-script-loaded')
    try {
        if (!grecaptcha || !grecaptcha.enterprise) {
            console.log('captcha-load-error')
            return
        }
        
        console.log('enterprise-rendering')
        const tryFallback = () => {
            console.log('Render failed (callback/catch), trying execute (Invisible/V3)...');
            // Clear the error message if any
            const container = document.getElementById('recaptcha_render');
            if (container) {
                container.innerHTML = '<div style="text-align:center; padding:20px; font-family:sans-serif;"><h3>Solving Invisible Captcha...</h3><p>Please wait.</p></div>';
            }
            
            console.log('Executing with key: ${GoogleKey}');
            
            grecaptcha.enterprise.ready(function() {
                console.log('grecaptcha.enterprise is ready');
                
                const options = {};
                const action = '${ActionValue}';
                const dataS = '${DataSValue}';
                
                if (action) options.action = action;
                // Only add 's' if it's really needed and valid. Some docs say 's' is for secure token.
                // If previous error was "Invalid parameters", 's' might also be invalid for execute if not supported.
                // But let's try adding it if present, as it was in render.
                if (dataS) options.s = dataS;
                
                console.log('Execution options:', JSON.stringify(options));
                
                // Create a timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Execution timed out after 300s')), 300000);
                });

                // Fallback for Policy-based keys (V3) which cannot be rendered
                try {
                    Promise.race([
                        grecaptcha.enterprise.execute('${GoogleKey}', options),
                        timeoutPromise
                    ]).then(function(token) {
                        console.log('token:' + token);
                        if (container) container.innerHTML = '<div style="text-align:center; padding:20px; color:green; font-family:sans-serif;"><h3>Solved!</h3></div>';
                    }).catch(function(err) {
                        console.log('captcha-load-error');
                        console.error('Execute error:', err);
                        if (container) container.innerHTML = '<div style="text-align:center; padding:20px; color:red; font-family:sans-serif;"><h3>Error!</h3><p>' + err.message + '</p></div>';
                    });
                } catch (syncErr) {
                    console.log('captcha-load-error');
                    console.error('Execute synchronous error:', syncErr);
                    if (container) container.innerHTML = '<div style="text-align:center; padding:20px; color:red; font-family:sans-serif;"><h3>Error!</h3><p>' + syncErr.message + '</p></div>';
                }
            });
        };
        
        // Expose tryFallback globally so it can be called from tab-renderer.js
        window.tryFallback = tryFallback;

        console.log('enterprise-rendering')
        try {
            grecaptcha.enterprise.render('recaptcha_render', {
                'sitekey': '${GoogleKey}'
                ${DataS}
                ${Action}
                ,'callback': function(token) {
                    console.log('token:' + token);
                }
                ,'error-callback': function() {
                    console.log('captcha-load-error detected in callback');
                    tryFallback();
                }
                ,'expired-callback': function() {
                    console.log('captcha-expired');
                    console.log('[reCAPTCHA] ⏰ Challenge EXPIRED - Auto-resetting...');
                    
                    // Auto-reset after short delay
                    setTimeout(function() {
                        try {
                            if (grecaptcha && grecaptcha.enterprise && grecaptcha.enterprise.reset) {
                                console.log('[reCAPTCHA] 🔄 Calling grecaptcha.enterprise.reset()...');
                                grecaptcha.enterprise.reset();
                                console.log('[reCAPTCHA] ✅ Captcha reset complete - checkbox should reappear');
                            }
                        } catch (e) {
                            console.error('[reCAPTCHA] Reset error:', e);
                        }
                    }, 500);
                }
            })
            console.log('enterprise-rendered')
        } catch (e) {
            tryFallback();
        }
        
        const int = setInterval(function () {
            const tx = document.getElementById('g-recaptcha-response');
            if (!tx || !tx.value)
                return;
            console.log('token:' + tx.value);
            clearInterval(int);
        }, 1000);
    } catch (error) {
        console.log('captcha-load-error')
        console.error('Enterprise render error:', error)
    }
}

loadRecaptchaScript(0);