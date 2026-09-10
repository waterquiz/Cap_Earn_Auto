/**
 * popup.js
 * Handles UI interactions and status checking for the extension popup.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("[reCAPTCHA Solver] Popup initialized.");
    
    const refreshBtn = document.getElementById('refreshBtn');
    const mainPulse = document.getElementById('mainPulse');
    const mainStatusText = document.getElementById('mainStatusText');
    const status3x3 = document.getElementById('status3x3');
    const status4x4 = document.getElementById('status4x4');

    async function checkStatus() {
        // Set UI to checking state
        mainPulse.className = 'pulse checking';
        mainStatusText.textContent = 'Checking...';
        status3x3.textContent = '...';
        status4x4.textContent = '...';

        try {
            // Request space status from background.js
            const response = await chrome.runtime.sendMessage({ action: 'check_spaces' });
            
            if (response && response.online) {
                const spaces = response.online;
                
                // Update 3x3 status
                status3x3.textContent = spaces['3x3'] ? 'Online' : 'Offline';
                status3x3.style.color = spaces['3x3'] ? '#22c55e' : '#ef4444';
                
                // Update 4x4 status
                status4x4.textContent = spaces['4x4'] ? 'Online' : 'Offline';
                status4x4.style.color = spaces['4x4'] ? '#22c55e' : '#ef4444';

                // Update Main status
                if (spaces['3x3'] && spaces['4x4']) {
                    mainPulse.className = 'pulse online';
                    mainStatusText.textContent = 'All Nodes Ready';
                } else if (spaces['3x3'] || spaces['4x4']) {
                    mainPulse.className = 'pulse checking'; // Orange for partial
                    mainStatusText.textContent = 'Partial Service';
                } else {
                    mainPulse.className = 'pulse offline';
                    mainStatusText.textContent = 'Offline';
                }
            } else {
                setOffline();
            }
        } catch (err) {
            console.error("[reCAPTCHA Solver] Error checking status:", err);
            setOffline();
        }
    }

    function setOffline() {
        mainPulse.className = 'pulse offline';
        mainStatusText.textContent = 'Connection Error';
        status3x3.textContent = 'Offline';
        status4x4.textContent = 'Offline';
        status3x3.style.color = '#ef4444';
        status4x4.style.color = '#ef4444';
    }

    refreshBtn.addEventListener('click', checkStatus);

    // Initial check
    checkStatus();
});