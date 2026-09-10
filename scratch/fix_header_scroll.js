const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let mainJs = fs.readFileSync(mainJsPath, 'utf8');

// Replace headerHeight = 33 with headerHeight = 50
mainJs = mainJs.replace(/const headerHeight = 33;/g, 'const headerHeight = 50;');

// Update repositionCTPanels to smoothly step target scroll and avoid lag
const smoothScrollHelper = `
let ctCurrentScrollY = 0;
let ctTargetScrollY = 0;
let ctScrollAnimationId = null;

function repositionCTPanels(scrollY) {
    if (!ctAppWindow || ctAppWindow.isDestroyed()) return;
    if (typeof scrollY === 'number') {
        ctTargetScrollY = scrollY;
    } else {
        ctTargetScrollY = ctCurrentScrollY;
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
    
    if (ctTargetScrollY > maxScrollY) ctTargetScrollY = maxScrollY;
    if (ctTargetScrollY < 0) ctTargetScrollY = 0;
    
    // Smooth interpolation to prevent lag feeling
    ctCurrentScrollY += (ctTargetScrollY - ctCurrentScrollY) * 0.45;
    if (Math.abs(ctTargetScrollY - ctCurrentScrollY) < 0.5) {
        ctCurrentScrollY = ctTargetScrollY;
    }
    
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
    
    if (Math.abs(ctTargetScrollY - ctCurrentScrollY) >= 0.5) {
        clearTimeout(ctScrollAnimationId);
        ctScrollAnimationId = setTimeout(() => repositionCTPanels(), 16);
    }
}

ipcMain.on('scroll-ct-panels', (_event, data) => {
    const deltaY = (data && typeof data.deltaY === 'number') ? data.deltaY : (typeof data === 'number' ? data : 150);
    repositionCTPanels(ctTargetScrollY + deltaY);
});
`;

let startIdx = mainJs.indexOf('let ctCurrentScrollY = 0;');
let endIdx = mainJs.indexOf('async function createAndAttachCTPanels()');

if (startIdx !== -1 && endIdx !== -1) {
    mainJs = mainJs.substring(0, startIdx) + smoothScrollHelper + '\n' + mainJs.substring(endIdx);
}

fs.writeFileSync(mainJsPath, mainJs, 'utf8');
console.log('Fixed headerHeight to 50px and added smooth scroll interpolation in main.js!');
