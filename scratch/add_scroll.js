const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let mainJs = fs.readFileSync(mainJsPath, 'utf8');

const ctScrollHelperCode = `
let ctCurrentScrollY = 0;

function repositionCTPanels(scrollY) {
    if (!ctAppWindow || ctAppWindow.isDestroyed()) return;
    if (typeof scrollY === 'number') {
        ctCurrentScrollY = scrollY;
    }
    const bounds = ctAppWindow.getContentBounds ? ctAppWindow.getContentBounds() : { width: ctAppWindow.getSize()[0], height: ctAppWindow.getSize()[1] };
    const winWidth = bounds.width;
    const winHeight = bounds.height;
    const headerHeight = 33;
    
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
    
    ctPanelViews.forEach((v, index) => {
        if (v && v.webContents && !v.webContents.isDestroyed()) {
            const row = Math.floor(index / columns);
            const col = index % columns;
            const panelX = col * panelGridWidth;
            const panelY = headerHeight + row * panelGridHeight - ctCurrentScrollY;
            v.setBounds({ x: panelX, y: panelY, width: panelGridWidth, height: panelGridHeight });
        }
    });
}

ipcMain.on('scroll-ct-panels', (_event, data) => {
    const deltaY = (data && typeof data.deltaY === 'number') ? data.deltaY : (typeof data === 'number' ? data : 150);
    repositionCTPanels(ctCurrentScrollY + deltaY);
});
`;

if (!mainJs.includes('function repositionCTPanels')) {
    mainJs = mainJs.replace('async function createAndAttachCTPanels()', ctScrollHelperCode + '\nasync function createAndAttachCTPanels()');
}

// Hook ctAppWindow resize event to call repositionCTPanels()
mainJs = mainJs.replace(
    /ctAppWindow\['on'\]\(_0x315e44\(0x584\),[^}]+\}\}\);/g,
    `ctAppWindow.on('resize', () => { repositionCTPanels(); });`
);

// In createAndAttachCTPanels: call repositionCTPanels(0) when finished
if (!mainJs.includes('repositionCTPanels(0)')) {
    mainJs = mainJs.replace(
        'ctHeaderView&&ctAppWindow[',
        'ctCurrentScrollY = 0;\nrepositionCTPanels(0);\nctHeaderView&&ctAppWindow['
    );
}

fs.writeFileSync(mainJsPath, mainJs, 'utf8');
console.log('Successfully injected CT panel scrolling logic into main.js!');
