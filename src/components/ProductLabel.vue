/* eslint-disable */
<template>
  <div>
    <button @click="generateBulkLabels">生成1000份标签</button>
    <button @click="exportPDF" :disabled="labels.length === 0">导出PDF</button>
    <button @click="printLabels" :disabled="labels.length === 0">打印标签</button>
    <div v-if="isExporting" class="export-progress">
      正在导出: {{ exportProgress }}%
    </div>
    <div id="labelTemplate" class="label-preview" style="display: none;">
      <div class="product-label">
        <img id="barcodeTemplate" alt="条形码" class="barcode" />
        <div class="product-info">
          <p class="product-name">{{ templateLabel.productName }}</p>
          <p class="product-code">{{ templateLabel.productCode }}</p>
          <p class="product-date">{{ templateLabel.productDate }}</p>
          <p class="extra-info">{{ templateLabel.extraInfo }}</p>
        </div>
        <img id="qrcodeTemplate" alt="二维码" class="qrcode" />
      </div>
    </div>
    <!-- 预览区域 -->
    <div v-for="(label, index) in displayedLabels" :key="index" class="label-preview">
      <div class="product-label">
        <img :src="label.barcodeUrl" alt="条形码" class="barcode" />
        <div class="product-info">
          <p class="product-name">{{ label.productName }}</p>
          <p class="product-code">{{ label.productCode }}</p>
          <p class="product-date">{{ label.productDate }}</p>
          <p class="extra-info">{{ label.extraInfo }}</p>
        </div>
        <img v-if="label.qrcodeUrl" :src="label.qrcodeUrl" alt="二维码" class="qrcode" />
      </div>
    </div>
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
      }
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
    async generateBulkLabels() {
      console.time('生成1000份标签');
      const batchSize = 100;
      const totalLabels = 1000;

      this.labels = [];
      this.displayedLabels = [];

      for (let i = 0; i < totalLabels; i += batchSize) {
        const batchPromises = [];
        for (let j = 0; j < batchSize && i + j < totalLabels; j++) {
          const index = i + j;
          batchPromises.push(this.generateLabel(index));
        }
        const batchResults = await Promise.all(batchPromises);
        this.labels.push(...batchResults);
        
        // 只显示前100个标签
        if (this.displayedLabels.length < 100) {
          this.displayedLabels.push(...batchResults.slice(0, 100 - this.displayedLabels.length));
        }
      }

      console.timeEnd('生成1000份标签');
      console.log('标签生成完成，总数:', this.labels.length);
    },
    async generateLabel(index) {
      const productCode = `7145YSJA${index.toString().padStart(4, '0')}`;
      const qrData = productCode;
      
      return {
        barcodeUrl: this.generateBarcode(productCode),
        qrcodeUrl: await this.generateQRCode(qrData),
        productName: `模板标签`,
        productCode: productCode,
        productDate: '2024-10-11\n2023-01-01',
        extraInfo: `中文测试123-${index}`
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
        pdf.setFont('Yahei');

        for (let i = 0; i < this.labels.length; i++) {
          if (i > 0) {
            pdf.addPage([50, 30], 'landscape');
          }

          // 添加条形码（靠上且更大）
          const barcodeImage = await this.createBarcodeImage(this.labels[i].productCode);
          pdf.addImage(barcodeImage, 'PNG', 2, 1, 46, 10);

          // 添加文本
          pdf.setFontSize(6);
          pdf.text(this.labels[i].productCode, 2, 14);
          pdf.setFontSize(5);
          pdf.text(this.labels[i].productDate.split('\n')[0], 2, 18);
          pdf.text(this.labels[i].productDate.split('\n')[1], 2, 22);
          pdf.setFontSize(4);
          pdf.text(this.labels[i].extraInfo, 2, 26);

          // 添加二维码
          const qrCodeImage = await this.createQRCodeImage(this.labels[i].productCode);
          pdf.addImage(qrCodeImage, 'PNG', 38, 18, 10, 10);

          this.exportProgress = Math.round(((i + 1) / this.labels.length) * 100);
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        pdf.save('bulk_labels.pdf');
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
        height: 40,  // 增加高度
        displayValue: false
      });
      return canvas.toDataURL('image/png');
    },

    async createQRCodeImage(data) {
      return await QRCode.toDataURL(data, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 100
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
              <p>${label.productCode}</p>
              <p>${label.productDate.split('\n')[0]}</p>
              <p>${label.productDate.split('\n')[1]}</p>
              <p>${label.extraInfo}</p>
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
  }
}
</script>

<style scoped>
.label-preview {
  margin: 20px auto;
  width: 150mm; /* 放大3倍以便于预览 */
  height: 90mm; /* 放大3倍以便于预览 */
}

.product-label {
  padding: 3mm;
  border: 0.3mm solid #000;
  width: 150mm; /* 放大3倍以便于预览 */
  height: 90mm; /* 放大3倍以便于预览 */
  font-size: 6mm; /* 放大3倍以便于预览 */
  position: relative;
}

.barcode {
  width: 90%;
  height: 30mm; /* 放大3倍 */
  margin: 3mm auto;
}

.product-info {
  font-size: 6mm; /* 放大3倍 */
  line-height: 1.2;
  padding-left: 3mm;
  text-align: left;
}

.product-name {
  font-size: 6.6mm; /* 放大3倍 */
}

.product-code, .product-date, .extra-info {
  font-size: 6mm; /* 放大3倍 */
}

.qrcode {
  width: 30mm; /* 放大3倍 */
  height: 30mm; /* 放大3倍 */
  position: absolute;
  right: 3mm;
  bottom: 3mm;
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
}
</style>