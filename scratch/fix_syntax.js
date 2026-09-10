const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let mainJs = fs.readFileSync(mainJsPath, 'utf8');

// Fix the corrupted fetchRemotePanelLimit / getEffectivePanelLimit section
const brokenSnippetStart = "appConfig=loadConfig();async function fetchRemotePanelLimit(){";
const brokenSnippetEnd = "setInterval(async()=>{const _0x20b751=_0x4cf37b,";

const startIdx = mainJs.indexOf(brokenSnippetStart);
const endIdx = mainJs.indexOf(brokenSnippetEnd);

if (startIdx !== -1 && endIdx !== -1) {
    const cleanReplacement = "appConfig=loadConfig();async function fetchRemotePanelLimit(){ remotePanelLimit = 100; return 100; }function getEffectivePanelLimit(){ return 100; }";
    mainJs = mainJs.substring(0, startIdx) + cleanReplacement + mainJs.substring(endIdx);
    fs.writeFileSync(mainJsPath, mainJs, 'utf8');
    console.log("Cleaned up fetchRemotePanelLimit syntax error!");
} else {
    console.error("Could not find start/end markers:", startIdx, endIdx);
}
