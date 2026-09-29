/**
 * 端侧等比智能图像压缩工具
 *
 * 利用 HTML5 Canvas，自动等比缩放至最大宽高 (默认 1280px)，
 * 导出 image/webp (fallback image/jpeg)，
 * 将原本 5MB~12MB 手机照片无损视觉降至 150KB~300KB Base64 data url，
 * 大幅加速多模态识图的网络传输与大模型解析耗时。
 */

export interface CompressOptions {
  maxDim?: number;
  quality?: number;
}

/**
 * 等比压缩图片并输出 Base64 Data URL
 * @param file 原始图像文件 (File 或 Blob)
 * @param maxDim 最大宽高（默认 1280px）
 * @param quality 导出压缩画质 0.0 ~ 1.0（默认 0.82）
 * @returns Base64 Data URL 字符串
 */
export async function compressImage(
  file: File | Blob,
  maxDim: number = 1280,
  quality: number = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    // 兼容非浏览器环境
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('compressImage 仅能在浏览器环境中执行'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // 成功加载后立即释放 Object URL，避免内存泄漏
      URL.revokeObjectURL(objectUrl);

      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // 计算等比缩放后的宽高
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 2D 绘图上下文'));
          return;
        }

        // 平滑缩放绘制
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // 优先导出 WebP 格式；若浏览器不支持则降级回退至 JPEG
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('图片压缩过程发生异常'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片加载失败，请检查文件格式是否有效'));
    };

    img.src = objectUrl;
  });
}

/**
 * 将 Base64 Data URL 转换回 File 对象（方便后续需要 File 的场景）
 */
export function dataUrlToFile(dataUrl: string, filename: string = 'compressed.webp'): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
