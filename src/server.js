const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const QRCode = require('qrcode');
const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

// 创建Express应用
const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 加载中文字体
const yaheiFont = fs.readFileSync(path.join(__dirname, '../assets/fonts/yahei.ttf'));

// 添加一个简单的请求队列管理
const requestQueue = {
  active: 0,
  maxConcurrent: 5, // 最大并发处理数
  queue: [],
  
  // 添加请求到队列
  add(task) {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          this.active++;
          console.log(`当前活跃任务: ${this.active}, 队列中等待: ${this.queue.length}`);
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.active--;
          this.processNext();
        }
      };
      
      if (this.active < this.maxConcurrent) {
        // 直接执行任务
        wrappedTask();
      } else {
        // 添加到队列
        console.log(`队列已满，请求排队等待。当前队列长度: ${this.queue.length + 1}`);
        this.queue.push(wrappedTask);
      }
    });
  },
  
  // 处理队列中的下一个请求
  processNext() {
    if (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const nextTask = this.queue.shift();
      nextTask();
    }
  }
};

// API健康检查
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: '时丰标签码打印系统API服务正常运行'
  });
});

// 处理标签生成请求 - 支持GET和POST两种方式
app.all('/api/generate-labels', async (req, res) => {
  try {
    // 将请求处理包装为任务，添加到队列
    await requestQueue.add(async () => {
      console.log('开始处理标签生成请求');
      // 获取参数（支持GET和POST）
      const params = req.method === 'POST' ? req.body : req.query;
      
      // 获取输出模式参数，默认为 'json'（返回文件路径），可选 'download'（直接下载）
      const outputMode = params.output_mode || 'json';
      console.log('输出模式:', outputMode);
      
      // 获取自定义文件名参数
      const customFilename = params.filename || '';
      console.log('自定义文件名:', customFilename || '未提供');
      
      // 获取API URL参数
      let apiUrl = params.api_url;
      
      if (!apiUrl) {
        return res.status(400).json({
          status: 400,
          message: 'error',
          data: { msg: 'API 地址未提供' }
        });
      }

      // 处理编码过的URL
      try {
        // 解码URL
        apiUrl = decodeURIComponent(apiUrl);
        console.log('解码后的URL:', apiUrl);
        
        // 处理API URL中的双问号
        apiUrl = apiUrl.replace('??', '?');

        // 创建URL对象处理apiUrl
        const apiUrlObj = new URL(apiUrl);
        const apiParams = new URLSearchParams(apiUrlObj.search);

        // 从请求中获取所有参数并添加到API URL
        for (const [key, value] of Object.entries(params)) {
          if (key !== 'api_url') {
            apiParams.set(key, value);
          }
        }

        // 重建API URL
        apiUrlObj.search = apiParams.toString();
        apiUrl = apiUrlObj.toString();

        console.log('最终处理的URL:', apiUrl);
      } catch (error) {
        console.error('URL处理失败:', error);
        return res.status(400).json({
          status: 400,
          message: 'error',
          data: { msg: '无效的URL格式' }
        });
      }

      // 设置请求头
      const headers = {
        'Content-Type': 'application/json'
      };

      // 发送请求获取数据
      console.log('开始请求外部API数据');
      const response = await fetch(apiUrl, { 
        method: 'GET',
        headers: headers,
        timeout: 30000 // 设置30秒超时
      });

      console.log('外部API响应状态:', response.status);
      if (!response.ok) {
        return res.status(response.status).json({
          status: response.status,
          message: 'error',
          data: { msg: `HTTP error! status: ${response.status}` }
        });
      }

      console.log('开始解析API响应数据');
      const data = await response.json();
      console.log('API响应数据解析完成');
      
      if (data.status === 200 && data.message === "success") {
        if (!data.data || !data.data.data || data.data.data.length === 0) {
          return res.status(200).json({
            status: 200,
            message: "success",
            data: { msg: "获取到的数据为空", data: [] }
          });
        }
        
        console.log('开始生成标签，数据条数:', data.data.data.length);
        // 生成标签
        const labels = await generateBulkLabels(data.data.data);
        console.log('标签生成完成');
        
        // 生成PDF
        console.log('开始生成PDF');
        const pdfBuffer = await generatePDF(labels);
        console.log('PDF生成完成，大小:', pdfBuffer.length);
        
        // 根据输出模式决定如何处理生成的PDF
        if (outputMode === 'download') {
          // 直接下载模式 - 设置响应头并发送PDF
          console.log('使用直接下载模式');
          res.setHeader('Content-Type', 'application/pdf');
          
          // 使用自定义文件名或默认文件名
          const downloadFilename = customFilename ? `${customFilename}.pdf` : '时丰标签码下载.pdf';
          // 对文件名进行编码
          const encodedFilename = encodeURIComponent(downloadFilename).replace(/%20/g, ' ');
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
          return res.send(pdfBuffer);
        } else {
          // JSON模式 - 保存文件并返回路径
          console.log('使用JSON返回模式');
          // 创建保存文件的目录
          const uploadDir = path.join(__dirname, '../uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          
          // 生成文件名：使用自定义文件名或默认文件名
          const timestamp = new Date().getTime();
          const filename = customFilename 
            ? `${customFilename}.pdf` 
            : `时丰标签码下载_${timestamp}.pdf`;
          const filePath = path.join(uploadDir, filename);
          
          // 如果文件已存在，则删除它（允许覆盖）
          if (fs.existsSync(filePath)) {
            console.log('文件已存在，将覆盖:', filePath);
            fs.unlinkSync(filePath);
          }
          
          // 保存文件到磁盘
          console.log('开始保存文件到磁盘:', filePath);
          fs.writeFileSync(filePath, pdfBuffer);
          console.log('文件保存完成');
          
          // 返回文件路径
          console.log('返回响应数据');
          return res.status(200).json({
            status: 200,
            message: 'success',
            data: {
              filePath: `/uploads/${filename}`,
              absolutePath: filePath,
              downloadUrl: `/download/${filename}`
            }
          });
        }
      } else {
        return res.status(500).json({
          status: 500,
          message: 'error',
          data: { msg: data.message || '接口响应失败' }
        });
      }
    });
  } catch (error) {
    console.error('处理失败:', error);
    return res.status(500).json({
      status: 500,
      message: 'error',
      data: { msg: error.message || '处理失败' }
    });
  }
});

// 生成条形码
function generateBarcode(code) {
  const canvas = createCanvas(300, 100);
  const encodedCode = encodeForBarcode(code);
  JsBarcode(canvas, encodedCode, {
    format: "CODE128",
    width: 2,
    height: 60,
    displayValue: false
  });
  return canvas.toDataURL("image/png");
}

// 生成二维码
async function generateQRCode(data) {
  try {
    return await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 80,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR Code生成错误', err);
    return '';
  }
}

// 批量生成标签
async function generateBulkLabels(data) {
  console.time('生成标签');
  
  const labels = [];
  const totalLabels = data.length;
  console.log(`开始处理${totalLabels}个标签`);
  
  // 使用批处理方式处理大量数据
  const batchSize = 20; // 每批处理的标签数量
  
  for (let i = 0; i < totalLabels; i += batchSize) {
    const batch = data.slice(i, Math.min(i + batchSize, totalLabels));
    console.log(`处理批次 ${i/batchSize + 1}/${Math.ceil(totalLabels/batchSize)}`);
    
    // 并行处理每批数据
    const batchLabels = await Promise.all(
      batch.map(item => generateLabel(item))
    );
    
    labels.push(...batchLabels);
    
    // 让出事件循环，避免阻塞
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  console.timeEnd('生成标签');
  console.log('标签生成完成，总数:', labels.length);
  
  return labels;
}

// 生成单个标签
async function generateLabel(item) {
  const isNoQRCode = String(item.type || '') === 'noqrcode';
  const isNone = String(item.type || '') === 'none';
  return {
    barcodeUrl: isNone ? null : generateBarcode(String(item.key || '')),
    qrcodeUrl: isNoQRCode ? null : await generateQRCode(String(item.csku || '')),
    filtered: String(item.filtered || ''),
    csku: String(item.csku || ''),
    key: String(item.key || ''),
    from: String(item.from || ''),
    orderDesc: String(item.order_desc || ''),
    cardId: String(item.card_id || ''),
    createTime: String(item.create_time || ''),
    merName: String(item.mer_name || ''),
    type: String(item.type || 'none')
  };
}

// 生成PDF
async function generatePDF(labels) {
  console.time('生成PDF');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [50, 30]
  });

  // 添加中文字体
  pdf.addFileToVFS('yahei.ttf', yaheiFont.toString('base64'));
  pdf.addFont('yahei.ttf', 'Yahei', 'normal');
  pdf.addFont('yahei.ttf', 'Yahei', 'bold');

  const totalLabels = labels.length;
  console.log(`开始生成${totalLabels}页PDF`);
  
  // 使用批处理方式处理大量页面
  const batchSize = 20; // 每批处理的页面数量
  
  for (let i = 0; i < totalLabels; i++) {
    if (i > 0) {
      pdf.addPage([50, 30], 'landscape');
    }

    const label = labels[i];
    const isLeft = label.type === 'left';
    const isNone = label.type === 'none';
    const isNoQRCode = label.type === 'noqrcode';

    // 只有在非 none 类型且有条形码时才添加条形码
    if (!isNone && label.barcodeUrl) {
      pdf.addImage(label.barcodeUrl, 'PNG', 0, 0, 50, 10);
    }

    // 修改 filtered 的显示位置，根据是否有条形码调整
    pdf.setFont('Yahei', 'bold');
    pdf.setFontSize(8);
    const filteredY = isNone ? 5 : 12;
    pdf.text(String(label.filtered || ''), 2, filteredY, { maxWidth: 46, lineHeightFactor: 1.2 });

    // 根据是否有条形码调整其他文本的位置
    const textStartY = isNone ? 11 : 18.5;
    const textX = isLeft ? 14 : 2;

    pdf.setFont('Yahei', 'bold');
    pdf.setFontSize(8);
    pdf.text(String(label.from || ''), textX, textStartY);

    pdf.setFont('Yahei', 'normal');
    pdf.setFontSize(5);
    pdf.text(String(label.csku || ''), textX, textStartY + 2.5);
    pdf.text(String(label.key || ''), textX, textStartY + 4.5);
    pdf.text(String(label.orderDesc || ''), textX, textStartY + 6.5);
    
    // 将 card_id 和 createTime 放在一起
    pdf.text(`${label.cardId || ''} ${label.createTime || ''}`, textX, textStartY + 8.5);
    
    pdf.text(String(label.merName || ''), textX, textStartY + 10.5);

    // 调整 QR 码的位置
    const qrCodeX = isNone ? 37 : (isLeft ? 1 : 37);
    const qrCodeY = isNone ? 10 : 17;

    // 只有在非noqrcode类型且二维码URL存在时添加二维码
    if (!isNoQRCode && label.qrcodeUrl) {
      pdf.addImage(label.qrcodeUrl, 'PNG', qrCodeX, qrCodeY, 12, 12);
    }

    // 每处理一批页面后，让出事件循环
    if (i % batchSize === 0 && i > 0) {
      console.log(`PDF处理进度: ${i}/${totalLabels}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  console.timeEnd('生成PDF');
  return Buffer.from(pdf.output('arraybuffer'));
}

// 编码中文字符
function encodeForBarcode(code) {
  // 如果code包含中文字符，进行base64编码
  if (/[\u4e00-\u9fa5]/.test(code)) {
    return 'CN' + Buffer.from(encodeURIComponent(code)).toString('base64');
  }
  return code;
}

// 添加静态文件服务中间件
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 添加一个新的路由来处理PDF文件的直接下载
app.get('/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // 防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        status: 400,
        message: 'error',
        data: { msg: '无效的文件名' }
      });
    }
    
    const filePath = path.join(__dirname, '../uploads', filename);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: 404,
        message: 'error',
        data: { msg: '文件不存在' }
      });
    }
    
    // 设置响应头并发送文件
    res.setHeader('Content-Type', 'application/pdf');
    // 对中文文件名进行编码
    const encodedFilename = encodeURIComponent(filename).replace(/%20/g, ' ');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    
    // 发送文件
    res.sendFile(filePath);
  } catch (error) {
    console.error('下载文件失败:', error);
    return res.status(500).json({
      status: 500,
      message: 'error',
      data: { msg: error.message || '下载文件失败' }
    });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`时丰标签码打印系统API服务运行在 http://localhost:${port}`);
}); 