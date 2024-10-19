/* eslint-disable */
<template>
  <div>
    <!-- 添加错误信息显示 -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>
    
    <!-- 保留总体进度条 -->
    <div v-if="isProcessing" class="progress-bar">
      <div :style="{ width: `${overallProgress}%` }"></div>
    </div>
    <div v-if="isProcessing" class="progress-text">
      {{ progressText }}
    </div>
    
    <!-- 移除生成标签的专用进度条 -->
    
    <!-- 优化按钮显示 -->
    <div class="button-container">
      <button @click="exportPDF" :disabled="labels.length === 0 || isExporting" class="action-button">
        {{ isExporting ? '正在导出...' : '导出PDF' }}
      </button>
      <button @click="restart" v-if="isProcessing && overallProgress === 100" class="action-button">重新开始</button>
    </div>

    <div v-if="isExporting" class="export-progress">
      正在导出: {{ exportProgress }}%
    </div>

    <!-- 隐藏标签码预览 -->
    <!--
    <div v-for="(label, index) in displayedLabels" :key="index" class="label-preview">
      ...
    </div>
    -->
  </div>
</template>

<script>
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// 导入中文字体
import yaheiFont from '@/assets/fonts/yahei.ttf';

export default {
  data() {
    return {
      labels: [],
      displayedLabels: [],
      isExporting: false,
      exportProgress: 0,
      templateLabel: {
        productName: '模板标签',
        productCode: 'TEMPLATE',
        productDate: '2023-01-01',
        extraInfo: '模板信息'
      },
      // 添加新的数据属性
      isProcessing: false,
      overallProgress: 0,
      progressText: '',
      isGeneratingLabels: false,
      generateProgress: 0,
      errorMessage: '', // 添加错误信息属性
    }
  },
  methods: {
    generateBarcode(code) {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, code, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false
      });
      return canvas.toDataURL("image/png");
    },
    async generateQRCode(data) {
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
        console.error('QR Code generation error', err);
        return '';
      }
    },
    async generateBulkLabels(data) {
      console.time('生成标签');
      
      this.labels = [];
      this.displayedLabels = [];

      const totalLabels = data.length;
      for (let i = 0; i < totalLabels; i++) {
        const item = data[i];
        const label = await this.generateLabel(item);
        this.labels.push(label);
        
        if (this.displayedLabels.length < 100) {
          this.displayedLabels.push(label);
        }

        this.overallProgress = Math.round((i + 1) / totalLabels * 50);
        this.progressText = `正在生成标签... (${this.overallProgress}%)`;
        
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.timeEnd('生成标签');
      console.log('标签生成完成，总数:', this.labels.length);
    },
    async generateLabel(item) {
      const isNoQRCode = String(item.type || '') === 'noqrcode';
      return {
        barcodeUrl: this.generateBarcode(String(item.key || '')),
        qrcodeUrl: isNoQRCode ? null : await this.generateQRCode(String(item.csku || '')),
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
    },
    async exportPDF() {
      if (this.labels.length === 0) {
        console.warn('没有标签可以导出');
        return;
      }

      this.isExporting = true;
      this.exportProgress = 0;

      try {
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: [50, 30]
        });

        // 添加中文字体
        pdf.addFont(yaheiFont, 'Yahei', 'normal');
        pdf.addFont(yaheiFont, 'Yahei', 'bold');

        for (let i = 0; i < this.labels.length; i++) {
          if (i > 0) {
            pdf.addPage([50, 30], 'landscape');
          }

          const label = this.labels[i];
          const isLeft = label.type === 'left';
          const isNone = label.type === 'none';
          const isNoQRCode = label.type === 'noqrcode';

          // 只有在非 none 时添加条形码
          if (!isNone) {
            const barcodeImage = await this.createBarcodeImage(label.key);
            pdf.addImage(barcodeImage, 'PNG', 0, 0, 50, 10);
          }

          // 修改 filtered 的显示方式
          pdf.setFont('Yahei', 'bold');
          pdf.setFontSize(8);
          const filteredY = isNone ? 5 : 12;
          pdf.text(String(label.filtered || ''), 2, filteredY, { maxWidth: 46, lineHeightFactor: 1.2 });

          // 调整文本元素的位置和大小
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

          this.exportProgress = Math.round(((i + 1) / this.labels.length) * 100);
          this.overallProgress = 50 + Math.round(this.exportProgress / 2);
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        pdf.save('时丰标签码下载.pdf');
      } catch (error) {
        console.error('PDF导出错误:', error);
      } finally {
        this.isExporting = false;
      }
    },

    async createBarcodeImage(code) {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, code, {
        format: "CODE128",
        width: 2,
        height: 80,  // 减小高度
        displayValue: false
      });
      return canvas.toDataURL('image/png');
    },

    async createQRCodeImage(data) {
      return await QRCode.toDataURL(data, {
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 180  // 减小二维码大小
      });
    },

    printLabels() {
      const printWindow = window.open('', '_blank');
      printWindow.document.write('<html><head><title>打印标签</title>');
      printWindow.document.write('<style>');
      printWindow.document.write(`
        @page {
          size: 50mm 30mm landscape;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
        }
        .product-label {
          width: 50mm;
          height: 30mm;
          position: relative;
          box-sizing: border-box;
          padding: 1mm;
          page-break-after: always;
        }
        .barcode {
          width: 46mm;
          height: 10mm;
          position: absolute;
          top: 1mm;
          left: 2mm;
        }
        .product-info {
          font-size: 2mm;
          line-height: 1.2;
          position: absolute;
          top: 12mm;
          left: 2mm;
        }
        .qrcode {
          width: 10mm;
          height: 10mm;
          position: absolute;
          right: 1mm;
          bottom: 1mm;
        }
      `);
      printWindow.document.write('</style></head><body>');

      this.labels.forEach(label => {
        printWindow.document.write(`
          <div class="product-label">
            <img src="${label.barcodeUrl}" alt="条形码" class="barcode" />
            <div class="product-info">
              <p>${label.filtered}</p>
              <p>${label.csku}</p>
              <p>${label.key}</p>
              <p>${label.from}</p>
              <p>${label.orderDesc}</p>
              <p>${label.createTime}</p>
              <p>${label.merName}</p>
              <p>${label.cardId}</p>
            </div>
            <img src="${label.qrcodeUrl}" alt="二维码" class="qrcode" />
          </div>
        `);
      });

      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.onload = function() {
        printWindow.print();
        printWindow.close();
      };
    },

    async fetchData() {
      try {
        // 获取完整的URL
        const fullUrl = window.location.href;
        
        // 使用 URL 对象解析 URL
        const url = new URL(fullUrl);
        
        // 获取 api_url 参数
        let apiUrl = url.searchParams.get('api_url');
        
        if (!apiUrl) {
          throw new Error('API 地址未提供');
        }

        // 处理 api_url 中的双问号
        apiUrl = apiUrl.replace('??', '?');

        // 创建一个新的 URL 对象来处理 apiUrl
        const apiUrlObj = new URL(apiUrl);

        // 获取原始 apiUrl 中的所有参数
        const apiParams = new URLSearchParams(apiUrlObj.search);

        // 从原始 URL 获取所有参数
        for (const [key, value] of url.searchParams.entries()) {
          if (key !== 'api_url') {
            apiParams.set(key, value);
          }
        }

        // 重建 apiUrl
        apiUrlObj.search = apiParams.toString();
        apiUrl = apiUrlObj.toString();

        console.log('Fetching data from:', apiUrl);  // 用于调试

        // 从 cookie 中获取 Token
        const token = this.getTokenFromCookie();

        if (!token) {
          throw new Error('未找到授权令牌，请确保您已登录');
        }

        // 设置请求头
        const headers = new Headers({
          'X-Token': token,
          'Content-Type': 'application/json'
        });

        const response = await fetch(apiUrl, { 
          method: 'GET',
          headers: headers,
          credentials: 'include' // 确保包含 cookies
        });

        if (response.status === 401) {
          throw new Error('授权失败，请重新登录');
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.status === 200 && data.message === "success") {
          this.errorMessage = ''; // 清除错误信息
          if (!data.data || !data.data.data || data.data.data.length === 0) {
            this.errorMessage = '获取到的数据为空';
            return {
              status: 200,
              message: "success",
              data: {
                msg: "获取到的数据为空",
                data: []
              }
            };
          }
          return data;
        } else {
          throw new Error(data.message || '接口响应失败');
        }
      } catch (error) {
        console.error('获取数据失败:', error);
        this.errorMessage = error.message || '获取数据失败';
        return {
          status: error.status || 500,
          message: "error",
          data: {
            msg: error.message || "获取SKU列表失败",
            data: []
          }
        };
      }
    },

    // 新增方法：从 cookie 中获取 Token
    getTokenFromCookie() {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'Token') {
          return value;
        }
      }
      return null;
    },

    // 添加新的方法
    async autoProcess() {
      this.isProcessing = true;
      this.overallProgress = 0;
      this.progressText = '正在获取数据...';
      this.errorMessage = '';

      try {
        const response = await this.fetchData();
        if (response.status !== 200) {
          throw new Error(response.data.msg || '处理失败');
        }

        this.progressText = '正在生成标签...';
        await this.generateBulkLabels(response.data.data);
        this.progressText = '正在导出PDF...';

        await this.exportPDF();
        this.overallProgress = 100;
        this.progressText = '处理完成';
      } catch (error) {
        this.errorMessage = error.message;
        console.error('处理失败:', error);
      } finally {
        this.isProcessing = false;
      }
    },

    restart() {
      this.labels = [];
      this.displayedLabels = [];
      this.isExporting = false;
      this.exportProgress = 0;
      this.overallProgress = 0;
      this.progressText = '';
      this.autoProcess();
    },
  },
  // 添加 mounted 生命周期钩子
  mounted() {
    // 更改页面标题
    document.title = '时丰标签码打印系统';
    this.autoProcess();
  }
}
</script>

<style scoped>
.label-preview {
  margin: 10px auto;
  width: 150mm; /* 3倍于PDF的50mm */
  height: 90mm; /* 3倍于PDF的30mm */
}

.product-label {
  padding: 0;
  border: 0.3mm solid #000;
  width: 150mm;
  height: 90mm;
  position: relative;
  box-sizing: border-box;
}

.barcode {
  width: 100%;
  height: 30mm; /* 3倍于PDF中的10mm */
  margin-bottom: 0;
}

.filtered {
  font-size: 4.5mm; /* 保持原有大小 */
  font-weight: bold;
  position: absolute;
  left: 6mm;
  right: 6mm;
  text-align: left;
}

.product-label.right .filtered,
.product-label.left .filtered {
  top: 31mm;
}

.product-label.none .filtered {
  top: 15mm;
}

.product-info {
  font-size: 3mm;
  line-height: 1.2;
  text-align: left;
  position: absolute;
  left: 6mm;
  right: 45mm;
}

.product-label.right .product-info,
.product-label.left .product-info {
  top: 42mm;
}

.product-label.none .product-info {
  top: 30mm;
}

.card-id {
  position: absolute;
  font-size: 2mm;
  font-weight: bold;
}

.product-label.right .card-id,
.product-label.left .card-id {
  bottom: 45mm;
}

.product-label.none .card-id {
  bottom: 33mm;
}

.product-label.right .card-id {
  right: 42mm;
}

.product-label.left .card-id {
  left: 6mm;
}

.product-label.none .card-id {
  right: 42mm;
}

.qrcode {
  width: 36mm;
  height: 36mm;
  position: absolute;
  bottom: 9mm;
}

.product-label.right .qrcode,
.product-label.none .qrcode {
  right: 6mm;
}

.product-label.left .qrcode {
  left: 6mm;
}

.product-label.left .product-info {
  left: 45mm;
  right: 6mm;
}

@media print {
  @page {
    size: 50mm 30mm landscape;
    margin: 0;
  }
  body {
    margin: 0;
    padding: 0;
  }
  .product-label {
    width: 50mm;
    height: 30mm;
    padding: 0;
  }
  .barcode {
    width: 50mm;
    height: 10mm; /* 增加打印时的高度 */
  }
  .filtered {
    font-size: 2.7mm;  /* 按比例调整 */
    top: 10.5mm;
    left: 1.5mm;
    right: 14mm;
  }
  .product-info {
    font-size: 2mm;  /* 比例调整 */
    line-height: 1;
    top: 13mm;
    left: 1.5mm;
    right: 14mm;
  }
  .card-id {
    font-size: 1.5mm; /* 进一步减小打印时的字体大小 */
  }

  .product-label.right .card-id {
    right: 0.5mm;
    bottom: 15.3mm; /* 紧贴二维码上方 */
  }

  .product-label.left .card-id {
    left: 0.5mm;
    bottom: 15.3mm; /* 紧贴二维码上方 */
  }
  .qrcode {
    width: 12mm;
    height: 12mm;
    right: 0.5mm;
    bottom: 3.3mm;
  }
  .product-label.left .product-info {
    left: 14mm; /* 调整为从右侧开始 */
    right: 1.5mm;
    text-align: left; /* 改为左对齐 */
  }

  .product-label.left .qrcode {
    left: 0.5mm;
    right: auto;
  }
}

/* 添加进度条样式 */
.progress-bar {
  width: 100%;
  height: 20px;
  background-color: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-bar > div {
  height: 100%;
  background-color: #4CAF50;
  transition: width 0.5s;
}

.progress-text {
  text-align: center;
  margin-top: 10px;
  font-weight: bold;
}

/* 添加新的样式 */
.button-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.action-button {
  padding: 10px 20px;
  margin: 0 10px;
  font-size: 16px;
  color: white;
  background-color: #4CAF50;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.action-button:hover {
  background-color: #45a049;
}

.action-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.export-progress {
  text-align: center;
  margin-top: 10px;
  font-weight: bold;
}

/* 可以为生成标签的进度条添加特定样式,如果需要的话 */
.progress-bar.generate-progress {
  /* 特定样式 */
}

/* 添加错误信息样式 */
.error-message {
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 15px;
  text-align: center;
  font-weight: bold;
}

/* 添加 from 字段的特殊样式 */
.from-field {
  font-size: 3.5mm;
  font-weight: bold;  /* 加粗 */
  color: #0066cc;
  margin-bottom: 1mm;
}
</style>
