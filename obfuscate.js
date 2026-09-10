const fs = require('fs-extra');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify } = require('html-minifier-terser');
const CleanCSS = require('clean-css');

// Konfigurasi obfuscator (Dioptimalkan untuk Performa & Stabilitas)
const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    simplify: true,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: [],
    stringArrayRotate: true,
    selfDefending: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    unicodeEscapeSequence: false,
    splitStrings: false,
    target: 'node',
    reservedNames: [
        'Vue', 'component', 'data', 'methods', 'computed',
        'watch', 'mounted', 'created', 'props', 'template',
        'el', 'render', 'components', 'name', 'filters',
        'directives', 'mixins', 'provide', 'inject', 'setup'
    ]
};

const skipFolders = [
    'node_modules', 'funcaptcha', 'hcaptcha', 'prosopo',
    'template', 'build', '.git', 'release', 'app-obfuscated', 'view'
];

// Folder yang akan diabaikan sepenuhnya (tidak disalin sama sekali)
const ignoreFolders = [
    'Captchakings.com',
    'External',
    'release',
    'app-obfuscated'
];

const skipFiles = [
    'package.json', 'package-lock.json', 'obfuscate.js',
    '.gitignore', 'ui-helpers.js', 'recaptcha-credentials.js',
    'credentials-server-template.json', 'SERVER-SETUP-GUIDE.md',
    'IMPLEMENTATION-GUIDE.md', 'CREDENTIALS-README.md'
];

const outputDir = 'app-obfuscated';

const cleanCSS = new CleanCSS({
    level: 1,
    inline: false,
    rebase: false
});

async function obfuscateFile(filePath, outputPath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.js') {
            const obfuscated = JavaScriptObfuscator.obfuscate(content, obfuscatorOptions);
            await fs.writeFile(outputPath, obfuscated.getObfuscatedCode());
            console.log(`✓ Obfuscated JS: ${filePath}`);

        } else if (ext === '.html') {
            const minified = await minify(content, {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                useShortDoctype: true,
                minifyCSS: false,
                minifyJS: false,
                removeEmptyAttributes: true,
                removeOptionalTags: false
            });
            await fs.writeFile(outputPath, minified);
            console.log(`✓ Minified HTML: ${filePath}`);

        } else if (ext === '.css') {
            const result = cleanCSS.minify(content);
            await fs.writeFile(outputPath, result.styles);
            console.log(`✓ Minified CSS: ${filePath}`);

        } else {
            await fs.copy(filePath, outputPath);
            console.log(`✓ Copied: ${filePath}`);
        }

    } catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
        await fs.copy(filePath, outputPath);
    }
}

async function processDirectory(srcDir, destDir) {
    const items = await fs.readdir(srcDir);

    for (const item of items) {
        const srcPath = path.join(srcDir, item);
        const destPath = path.join(destDir, item);

        if (path.basename(srcPath) === outputDir) continue;

        const stats = await fs.stat(srcPath);

        if (stats.isDirectory()) {
            const folderName = path.basename(srcPath);
            if (ignoreFolders.includes(folderName)) {
                console.log(`🚫 Ignored: ${srcPath}`);
                continue;
            }
            if (skipFolders.includes(folderName)) {
                await fs.copy(srcPath, destPath);
                console.log(`⚠ Copied as-is: ${srcPath}`);
            } else {
                await fs.ensureDir(destPath);
                await processDirectory(srcPath, destPath);
            }
        } else {
            const fileName = path.basename(srcPath);
            if (skipFiles.includes(fileName)) {
                await fs.copy(srcPath, destPath);
                console.log(`⚠ Copied as-is: ${srcPath}`);
            } else {
                await obfuscateFile(srcPath, destPath);
            }
        }
    }
}

async function createProductionPackageJson(outputDir) {
    console.log('Membaca package.json asli...');
    const originalPackage = await fs.readJson(path.join(__dirname, 'package.json'));

    delete originalPackage.devDependencies;
    delete originalPackage.scripts;
    delete originalPackage.build;

    const packageJsonPath = path.join(outputDir, 'package.json');
    await fs.writeJson(packageJsonPath, originalPackage, { spaces: 2 });
    console.log(`✓ Membuat package.json versi produksi di ${outputDir}`);
}

async function main() {
    console.log('🚀 Starting optimized obfuscation process...');

    try {
        const currentDir = process.cwd();
        const outputPath = path.resolve(currentDir, outputDir);

        if (currentDir.startsWith(outputPath)) {
            console.error('❌ Error: Cannot run from output directory');
            process.exit(1);
        }

        if (await fs.pathExists(outputDir)) {
            await fs.remove(outputDir);
            console.log('🧹 Cleaned output directory');
        }

        await fs.ensureDir(outputDir);

        console.log('📂 Processing files...');
        const items = await fs.readdir('.');

        for (const item of items) {
            const srcPath = path.join('.', item);
            const destPath = path.join(outputDir, item);

            if (item === outputDir) continue;

            const stats = await fs.stat(srcPath);

            if (stats.isDirectory()) {
                if (ignoreFolders.includes(item)) {
                    console.log(`🚫 Ignored: ${srcPath}`);
                    continue;
                }
                if (skipFolders.includes(item)) {
                    await fs.copy(srcPath, destPath);
                    console.log(`⚠ Copied as-is: ${srcPath}`);
                } else {
                    await fs.ensureDir(destPath);
                    await processDirectory(srcPath, destPath);
                }
            } else {
                if (skipFiles.includes(item)) {
                    await fs.copy(srcPath, destPath);
                    console.log(`⚠ Copied as-is: ${srcPath}`);
                } else {
                    await obfuscateFile(srcPath, destPath);
                }
            }
        }

        await createProductionPackageJson(outputDir);

        console.log('\n✅ Optimized obfuscation completed successfully!');
        console.log(`📦 Output: ${outputDir}`);

    } catch (error) {
        console.error('❌ Obfuscation failed:', error.message);
        process.exit(1);
    }
}

main();