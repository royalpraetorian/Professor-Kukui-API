import fs from 'fs';
import path from 'path';
import webpack from 'webpack';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserJSPlugin from 'terser-webpack-plugin';

import { env, paths } from './utils/index.js';
import { getDefinedVars } from './env.loader.js';

const { isDev, isProd } = env;
const sourceMap = isProd;

const scriptsPath = `${paths.assets}/scripts`;
const stylesPath = `${paths.assets}/styles`;

// populate respective module JS and SCSS files as entry points
const getModuleEntry = () => {
  const entryFiles = {};
  const excludeScriptFiles = [];
  const excludeStyleFiles = [];
  const targetDirectory = `${paths.assets}/scripts`;

  fs.readdirSync(targetDirectory).filter(file => {
    // check javascript file for pages, if any
    const { name, ext } = path.parse(file);
    if (ext === '.js' && !excludeScriptFiles.includes(name)) {
      entryFiles[name] = [`${scriptsPath}/${file}`];
    }

    // check if companion module has .scss file as well
    // if there is, push as part of the module entry point
    const moduleScss = `${stylesPath}/${name}.scss`;
    if (fs.existsSync(moduleScss) && !excludeStyleFiles.includes(name)) {
      entryFiles[name].push(moduleScss);
    }
  });

  return entryFiles;
};

const webpackConfig = {
  watch: isDev,
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'cheap-module-source-map' : 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.css', '.scss']
  },
  entry: {
    main: `${stylesPath}/main.scss`,
    ...getModuleEntry()
  },
  output: {
    publicPath: process.env.PUBLIC_PATH,
    path: `${paths.public}/static`,
    filename: isDev ? 'scripts/[name].js' : 'scripts/[id].[contenthash:8].js',
    chunkFilename: isDev
      ? 'scripts/[name].chunk.js'
      : 'scripts/[id].chunk.[contenthash:8].js'
  },
  optimization: {
    // @see: https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
    // @see: https://webpack.js.org/plugins/css-minimizer-webpack-plugin/#options
    minimizer: [new TerserJSPlugin(), new CssMinimizerPlugin()],
    splitChunks: {
      cacheGroups: {
        vendor: {
          reuseExistingChunk: true,
          test: /node_modules/,
          chunks: 'all',
          name: 'vendor'
        }
      }
    }
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: !!isDev,
            configFile: true
          }
        }
      },
      {
        test: /\.(sass|scss|css)$/,
        exclude: ['/node_modules/'],
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: { importLoaders: 2, sourceMap }
          },
          {
            loader: 'postcss-loader',
            options: { sourceMap }
          },
          {
            loader: 'sass-loader',
            options: { sourceMap }
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin(getDefinedVars().stringified),
    new MiniCssExtractPlugin({
      filename: isDev
        ? 'styles/[name].css'
        : 'styles/[name].[contenthash:8].css',
      chunkFilename: isDev
        ? 'styles/[id].css'
        : 'styles/[id].chunk.[contenthash:8].css'
    })
  ]
};

export default webpackConfig;
