/**
 * Procedural and API-assisted Image Generator for AI Designer Studio (PRD §3.4.1)
 * Generates high-resolution data URLs with artistic themes, color harmony, and composition.
 */

export interface ImageGenOptions {
  prompt: string;
  style: 'photo' | '3d' | 'vector' | 'flat';
  aspectRatio: '1:1' | '16:9' | '4:3' | '9:16';
  width?: number;
  height?: number;
}

export class ImageGenerator {
  public static getDimensions(aspectRatio: '1:1' | '16:9' | '4:3' | '9:16'): { width: number; height: number } {
    switch (aspectRatio) {
      case '16:9': return { width: 960, height: 540 };
      case '4:3': return { width: 800, height: 600 };
      case '9:16': return { width: 540, height: 960 };
      case '1:1':
      default:
        return { width: 800, height: 800 };
    }
  }

  public static generateProceduralImage(options: ImageGenOptions): string {
    const canvas = document.createElement('canvas');
    const { width: w, height: h } = this.getDimensions(options.aspectRatio);

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Deterministic hash from prompt
    let hash = 0;
    for (let i = 0; i < options.prompt.length; i++) {
      hash = (hash << 5) - hash + options.prompt.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);

    // Color palettes based on prompt and seed
    const hues = [
      (seed % 360),
      ((seed + 45) % 360),
      ((seed + 120) % 360),
      ((seed + 200) % 360)
    ];

    // Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    if (options.style === '3d') {
      bgGrad.addColorStop(0, `hsl(${hues[0]}, 60%, 12%)`);
      bgGrad.addColorStop(0.5, `hsl(${hues[1]}, 70%, 20%)`);
      bgGrad.addColorStop(1, `hsl(${hues[2]}, 80%, 8%)`);
    } else if (options.style === 'photo') {
      bgGrad.addColorStop(0, `hsl(${hues[0]}, 25%, 92%)`);
      bgGrad.addColorStop(1, `hsl(${hues[1]}, 30%, 80%)`);
    } else {
      bgGrad.addColorStop(0, `hsl(${hues[0]}, 75%, 55%)`);
      bgGrad.addColorStop(1, `hsl(${hues[2]}, 80%, 45%)`);
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Dynamic geometric & lighting shapes
    const numBlobs = options.style === '3d' ? 6 : 4;
    for (let i = 0; i < numBlobs; i++) {
      const bx = (w * ((seed * (i + 1) * 31) % 100)) / 100;
      const by = (h * ((seed * (i + 2) * 53) % 100)) / 100;
      const br = Math.min(w, h) * (0.2 + 0.25 * ((seed * (i + 3)) % 10) / 10);

      const radGrad = ctx.createRadialGradient(bx, by, br * 0.1, bx, by, br);
      const colorHue = hues[(i + 1) % hues.length];
      radGrad.addColorStop(0, `hsla(${colorHue}, 85%, 65%, 0.65)`);
      radGrad.addColorStop(0.7, `hsla(${colorHue}, 75%, 45%, 0.25)`);
      radGrad.addColorStop(1, `hsla(${colorHue}, 75%, 35%, 0)`);

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overlay stylish card / visual framing
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    const cardPad = 40;
    const cardR = 24;

    // Rounded card background
    ctx.beginPath();
    ctx.roundRect(cardPad, cardPad, w - cardPad * 2, h - cardPad * 2, cardR);
    ctx.fill();
    ctx.stroke();

    // Subtle Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const step = 48;
    for (let x = cardPad; x < w - cardPad; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, cardPad);
      ctx.lineTo(x, h - cardPad);
      ctx.stroke();
    }
    for (let y = cardPad; y < h - cardPad; y += step) {
      ctx.beginPath();
      ctx.moveTo(cardPad, y);
      ctx.lineTo(w - cardPad, y);
      ctx.stroke();
    }

    // Centered Typography & Concept Badge
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cleanPrompt = options.prompt.trim().slice(0, 32);
    ctx.fillText(cleanPrompt, w / 2, h / 2 - 12);

    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText(`AI Studio Asset · ${options.style.toUpperCase()} · ${w}×${h}`, w / 2, h / 2 + 28);

    ctx.restore();

    return canvas.toDataURL('image/png');
  }
}
