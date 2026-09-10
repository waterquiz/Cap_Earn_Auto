const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let mainJs = fs.readFileSync(mainJsPath, 'utf8');

// 1. Override fetchRemotePanelLimit to always set remotePanelLimit = 100
mainJs = mainJs.replace(
    /async function fetchRemotePanelLimit\(\)\{[^}]*\}/g,
    `async function fetchRemotePanelLimit(){ remotePanelLimit = 100; return 100; }`
);

// 2. Override getEffectivePanelLimit to always return 100
mainJs = mainJs.replace(
    /function getEffectivePanelLimit\(\)\{[^}]*\}/g,
    `function getEffectivePanelLimit(){ return 100; }`
);

// 3. Update repositionCTPanels implementation for clean & instant smooth scrolling
const updatedScrollCode = `
let ctCurrentScrollY = 0;

function repositionCTPanels(scrollY) {
    if (!ctAppWindow || ctAppWindow.isDestroyed()) return;
    if (typeof scrollY === 'number') {
        ctCurrentScrollY = scrollY;
    }
    
    const bounds = ctAppWindow.getContentBounds ? ctAppWindow.getContentBounds() : { width: ctAppWindow.getSize()[0], height: ctAppWindow.getSize()[1] };
    const winWidth = bounds.width;
    const winHeight = bounds.height;
    const headerHeight = 50;
    
    if (ctHeaderView && ctHeaderView.webContents && !ctHeaderView.webContents.isDestroyed()) {
        ctHeaderView.setBounds({ x: 0, y: 0, width: winWidth, height: headerHeight });
    }
    
    const panels = ctPanelViews.length;
    const columns = (ctAppConfig && ctAppConfig.columns) ? ctAppConfig.columns : 4;
    const panelGridHeight = parseInt((ctAppConfig && ctAppConfig.viewHeight) || 300, 10);
    const panelGridWidth = Math.floor(winWidth / columns);
    
    const totalRows = Math.ceil(panels / columns);
    const totalContentHeight = headerHeight + totalRows * panelGridHeight;
    const maxScrollY = Math.max(0, totalContentHeight - winHeight);
    
    if (ctCurrentScrollY > maxScrollY) ctCurrentScrollY = maxScrollY;
    if (ctCurrentScrollY < 0) ctCurrentScrollY = 0;
    
    const displayScrollY = Math.round(ctCurrentScrollY);
    
    ctPanelViews.forEach((v, index) => {
        if (v && v.webContents && !v.webContents.isDestroyed()) {
            const row = Math.floor(index / columns);
            const col = index % columns;
            const panelX = col * panelGridWidth;
            const panelY = headerHeight + row * panelGridHeight - displayScrollY;
            v.setBounds({ x: panelX, y: panelY, width: panelGridWidth, height: panelGridHeight });
        }
    });
}

ipcMain.on('scroll-ct-panels', (_event, data) => {
    const deltaY = (data && typeof data.deltaY === 'number') ? data.deltaY : (typeof data === 'number' ? data : 120);
    repositionCTPanels(ctCurrentScrollY + deltaY);
});
`;

let startIdx = mainJs.indexOf('let ctCurrentScrollY = 0;');
let endIdx = mainJs.indexOf('async function createAndAttachCTPanels()');

if (startIdx !== -1 && endIdx !== -1) {
    mainJs = mainJs.substring(0, startIdx) + updatedScrollCode + '\n' + mainJs.substring(endIdx);
}

fs.writeFileSync(mainJsPath, mainJs, 'utf8');
console.log('Successfully removed remote limit override and updated scroll logic in main.js!');
