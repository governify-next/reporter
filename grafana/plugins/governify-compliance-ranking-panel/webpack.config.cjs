const path = require('node:path');

const resolveDependency = (dependency) => require.resolve(dependency, { paths: [__dirname] });

module.exports = {
    mode: 'production',
    entry: path.resolve(__dirname, 'src/module.tsx'),
    devtool: 'source-map',
    externals: {
        '@grafana/data': '@grafana/data',
        react: 'react',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: resolveDependency('babel-loader'),
                    options: {
                        presets: [
                            resolveDependency('@babel/preset-typescript'),
                            [resolveDependency('@babel/preset-react'), { runtime: 'classic' }],
                        ],
                    },
                },
            },
        ],
    },
    optimization: {
        minimize: true,
    },
    output: {
        filename: 'module.js',
        libraryTarget: 'amd',
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
};
