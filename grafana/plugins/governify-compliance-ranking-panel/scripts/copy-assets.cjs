const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const destination = path.join(pluginRoot, 'dist');

fs.mkdirSync(path.join(destination, 'img'), { recursive: true });
fs.copyFileSync(path.join(pluginRoot, 'plugin.json'), path.join(destination, 'plugin.json'));
fs.copyFileSync(
    path.join(pluginRoot, 'src', 'img', 'logo.svg'),
    path.join(destination, 'img', 'logo.svg'),
);
