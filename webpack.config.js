module.exports = {
  entry: './src/tileCorrection', // main.js中的.js可以省略，前面的./不能省
  output: {
    filename: 'tileCorrection.min.js' // dist文件夹不存在时，会自动创建
  }
}
