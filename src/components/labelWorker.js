import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

self.onmessage = async function(e) {
  if (e.data.action === 'generateLabels') {
    const count = e.data.count;
    const batchSize = 100;

    for (let i = 0; i < count; i += batchSize) {
      const batchLabels = [];
      for (let j = 0; j < batchSize && i + j < count; j++) {
        const label = await generateLabel(i + j);
        batchLabels.push(label);
      }
      self.postMessage({ type: 'labelBatch', labels: batchLabels });
    }

    self.postMessage({ type: 'complete' });
  }
};

async function generateLabel(index) {
  const productCode = `7145YSJA${index.toString().padStart(4, '0')}`;
  const qrData = productCode;
  
  return {
    id: index,
    barcodeUrl: generateBarcode(productCode),
    qrcodeUrl: await generateQRCode(qrData),
    productName: `模板标签`,
    productCode: productCode,
    productDate: '2024-10-11\n2023-01-01',
    extraInfo: `中文测试123-${index}`
  };
}

function generateBarcode(code) {
  const canvas = new OffscreenCanvas(200, 100);
  JsBarcode(canvas, code, {
    format: "CODE128",
    width: 2,
    height: 60,
    displayValue: false
  });
  return canvas.convertToBlob().then(blob => URL.createObjectURL(blob));
}

async function generateQRCode(data) {
  try {
    const canvas = new OffscreenCanvas(80, 80);
    await QRCode.toCanvas(canvas, data, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 80,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return canvas.convertToBlob().then(blob => URL.createObjectURL(blob));
  } catch (err) {
    console.error('QR Code generation error', err);
    return '';
  }
}