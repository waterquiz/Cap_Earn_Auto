const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Advanced Settings Renderer Loaded');

    // Elements
    const columnSlider = document.getElementById('column-slider');
    const columnInput = document.getElementById('column-input');
    const heightSlider = document.getElementById('height-slider');
    const heightInput = document.getElementById('height-input');
    const autoSolveSelect = document.getElementById('auto-solve-select');
    const solverEngineSelect = document.getElementById('solver-engine-select');
    const proxyModeSelect = document.getElementById('proxy-mode-select');
    const manualProxySection = document.getElementById('manual-proxy-section');
    const manualProxyInput = document.getElementById('manual-proxy-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    let currentConfig = {};

    // Helper: Sync slider and input and apply live updates
    function setupSync(slider, input, isColumn) {
        if (!slider || !input) return;
        
        function applyLiveUpdate() {
            const columns = parseInt(columnSlider ? columnSlider.value : 2);
            const viewHeight = parseInt(heightSlider ? heightSlider.value : 300);
            ipcRenderer.send('update-view-layout', { columns, viewHeight });
        }

        // When slider moves, update number input and apply live
        slider.addEventListener('input', () => {
            input.value = slider.value;
            applyLiveUpdate();
        });

        // When number input changes, update slider (with validation) and apply live
        input.addEventListener('input', () => {
            let val = parseInt(input.value);
            const min = parseInt(input.min) || 1;
            const max = parseInt(input.max) || 10000;
            
            if (isNaN(val)) return; // Allow typing
            
            if (val < min) val = min;
            if (val > max) val = max;
            
            slider.value = val;
            applyLiveUpdate();
        });
        
        // Final validation on blur/change
        input.addEventListener('change', () => {
            let val = parseInt(input.value);
            const min = parseInt(input.min) || 1;
            const max = parseInt(input.max) || 10000;
            
            if (isNaN(val) || val < min) val = min;
            if (val > max) val = max;
            
            input.value = val;
            slider.value = val;
            applyLiveUpdate();
        });
    }

    setupSync(columnSlider, columnInput, true);
    setupSync(heightSlider, heightInput, false);

    // Proxy Mode Visibility Toggle
    function refreshProxyUI() {
        const mode = proxyModeSelect ? proxyModeSelect.value : 'none';
        if (mode === 'manual') {
            if (manualProxySection) manualProxySection.style.display = 'flex';
        } else {
            if (manualProxySection) manualProxySection.style.display = 'none';
        }
    }

    if (proxyModeSelect) {
        proxyModeSelect.addEventListener('change', () => {
            console.log('Proxy mode changed to:', proxyModeSelect.value);
            refreshProxyUI();
        });
    }

    // Load initial settings
    async function loadSettings() {
        try {
            console.log('Loading settings via IPC...');
            const config = await ipcRenderer.invoke('get-config');
            console.log('Settings received:', config);
            
            if (config) {
                currentConfig = config;
                if (columnSlider) columnSlider.value = config.columns || 2;
                if (columnInput) columnInput.value = config.columns || 2;
                if (heightSlider) heightSlider.value = config.viewHeight || 300;
                if (heightInput) heightInput.value = config.viewHeight || 300;
                
                if (autoSolveSelect) {
                    const raw = config.autoSolveChallenge;
                    if (raw === false || raw === 'false') {
                        autoSolveSelect.value = 'false';
                    } else if (raw === 'audio') {
                        autoSolveSelect.value = 'audio';
                    } else {
                        autoSolveSelect.value = 'recaptcha_v2_local';
                    }
                }

                if (solverEngineSelect) {
                    const savedEngine = config.solverEngine;
                    solverEngineSelect.value = (savedEngine === 'custom_url') ? 'custom_url' : 'captchasonic';
                }

                if (proxyModeSelect) {
                    proxyModeSelect.value = (config.proxyMode === 'manual') ? 'manual' : 'none';
                }
                
                if (manualProxyInput) {
                    manualProxyInput.value = config.manualProxies || '';
                }
            }

            refreshProxyUI();
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            console.log('Saving settings...');
            const autoSolveVal = autoSolveSelect ? autoSolveSelect.value : 'recaptcha_v2_local';
            const settingsUpdate = {
                columns: parseInt(columnInput ? columnInput.value : 2),
                viewHeight: parseInt(heightInput ? heightInput.value : 300),
                // autoSolveChallenge stores the mode: 'recaptcha_v2_local' | 'audio' | 'false'
                autoSolveChallenge: autoSolveVal,
                // isAutoSolveEnabled: boolean flag derived from the mode (false only when 'false')
                isAutoSolveEnabled: autoSolveVal !== 'false',
                solverEngine: solverEngineSelect ? solverEngineSelect.value : 'captchasonic',
                proxyMode: proxyModeSelect ? proxyModeSelect.value : 'none',
                manualProxies: manualProxyInput ? manualProxyInput.value : ''
            };

            const finalSettings = { ...currentConfig, ...settingsUpdate };
            console.log('Data to save:', finalSettings);
            
            // Send settings to main process
            ipcRenderer.send('save-advanced-settings', finalSettings);
            
            // Close the window
            ipcRenderer.send('close-advanced-settings');
        });
    }

    // Start Initialization
    loadSettings();
});