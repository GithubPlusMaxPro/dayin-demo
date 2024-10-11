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
      <div :class="['product-label', label.type]">
        <img v-if="label.type !== 'none'" :src="label.barcodeUrl" alt="条形码" class="barcode" />
        <p class="filtered">{{ label.filtered }}</p>
        <div class="product-info">
          <p class="csku">{{ label.csku }}</p>
          <p class="key">{{ label.key }}</p>
          <p class="from">{{ label.from }}</p>
          <p class="order-desc">{{ label.orderDesc }}</p>
          <p class="create-time">{{ label.createTime }}</p>
          <p class="mer-name">{{ label.merName }}</p>
        </div>
        <p class="card-id">{{ label.cardId }}</p>
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
      console.time('生成标签');
      
      // 模拟API调用获取数据
      const response = await this.fetchData();
      const data = response.data.data;

      this.labels = [];
      this.displayedLabels = [];

      for (let item of data) {
        const label = await this.generateLabel(item);
        this.labels.push(label);
        
        // 只显示前100个标签
        if (this.displayedLabels.length < 100) {
          this.displayedLabels.push(label);
        }
      }

      console.timeEnd('生成标签');
      console.log('标签生成完成，总数:', this.labels.length);
    },
    async generateLabel(item) {
      return {
        barcodeUrl: this.generateBarcode(item.key),
        qrcodeUrl: await this.generateQRCode(item.csku),
        filtered: item.filtered,
        csku: item.csku,
        key: item.key,
        from: item.from,
        orderDesc: item.order_desc,
        cardId: item.card_id,
        createTime: item.create_time,
        merName: item.mer_name,
        type: item.type  // 添加 type 字段
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

          // 只有在非 none 类型时添加条形码
          if (!isNone) {
            const barcodeImage = await this.createBarcodeImage(label.key);
            pdf.addImage(barcodeImage, 'PNG', 0, 0, 50, 10);
          }

          // 添加 filtered（允许两行）
          pdf.setFont('Yahei', 'bold');
          pdf.setFontSize(7);
          const filteredY = isNone ? 5 : 12; // 调整 none 类型时 filtered 的位置
          pdf.text(label.filtered, 2, filteredY, { maxWidth: 33, lineHeightFactor: 1.2 });

          // 调整其他文本元素的位置和大小
          pdf.setFontSize(5);
          const textStartY = isNone ? 10 : 17; // 调整 none 类型时文本的起始位置
          const textX = isLeft ? 14 : 2;
          const textAlign = 'left';

          pdf.text(label.csku, textX, textStartY, { align: textAlign });
          pdf.text(label.key, textX, textStartY + 2, { align: textAlign });
          pdf.text(label.from, textX, textStartY + 4, { align: textAlign });
          pdf.text(label.orderDesc, textX, textStartY + 6, { align: textAlign });
          pdf.text(label.createTime, textX, textStartY + 8, { align: textAlign });
          pdf.text(label.merName, textX, textStartY + 10, { align: textAlign });

          // 调整 card_id 和二维码的位置
          pdf.setFontSize(4);
          const qrCodeX = isNone ? 37 : (isLeft ? 1 : 37);
          const cardIdY = isNone ? 9.5 : 16.5; // 调整 none 类型时 card_id 的位置
          pdf.text(label.cardId, qrCodeX, cardIdY, { align: 'left' });

          const qrCodeImage = await this.createQRCodeImage(label.csku);
          const qrCodeY = isNone ? 10 : 17; // 调整 none 类型时二维码的位置
          pdf.addImage(qrCodeImage, 'PNG', qrCodeX, qrCodeY, 12, 12);

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

    // 模拟API调用
    async fetchData() {
      // 这里应该是实际的API调用，现在我们直接返回模板数据
      return {
        status: 200,
        message: "success",
        data: {
          msg: "查询SKU列表成功",
          data: [
            {
              'type':'right',
              "filtered": "地垫-戈雅-40-60cm水晶绒",
              "from": "王马帮-A",
              "order_desc": "总单:8/1 子单:8/1  26768",
              "csku": "SDGDN000294008",
              "mer_name": "智能时代",
              "key": "ceshifenzhang001",
              "card_id": "刘平",
              "create_time": "2024-09-27 09:24:42"
            },
            {
              'type':'left',
              "filtered": "地垫-戈雅-40-60cm水晶绒",
              "from": "王马帮-A",
              "order_desc": "总单:8/1 子单:8/1  26768",
              "csku": "SDGDN000294008",
              "mer_name": "智能时代",
              "key": "ceshifenzhang001",
              "card_id": "刘平",
              "create_time": "2024-09-27 09:24:42"
            },
            {
              'type':'none',
              "filtered": "地垫-戈雅-40-60cm水晶绒",
              "from": "王马帮-A",
              "order_desc": "总单:8/1 子单:8/1  26768",
              "csku": "SDGDN000294008",
              "mer_name": "智能时代",
              "key": "ceshifenzhang001",
              "card_id": "刘平",
              "create_time": "2024-09-27 09:24:42"
            },
            // ... 其他数据项
          ]
        }
      };
    },
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
    font-size: 2mm;  /* 按比例调整 */
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
</style>