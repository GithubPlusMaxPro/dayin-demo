const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true
})
module.exports = {
  publicPath: process.env.NODE_ENV === 'production' ? '/print_sku/' : '/',
  outputDir: 'dist/print_sku',
  assetsDir: '',
  indexPath: 'index.html',
  filenameHashing: true,
  productionSourceMap: false,
}