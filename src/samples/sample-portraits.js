/**
 * Built-in Sample Portrait Generator
 * Generates crisp, high-contrast portraits on demand so the user can test the pipeline instantly.
 */

export class SamplePortraits {
  static getSamples() {
    return [
      {
        id: 'sample_female',
        name: 'Studio Portrait (Woman)',
        render: (ctx, w, h) => this.drawFemalePortrait(ctx, w, h)
      },
      {
        id: 'sample_male',
        name: 'Dramatic Lighting (Man)',
        render: (ctx, w, h) => this.drawMalePortrait(ctx, w, h)
      },
      {
        id: 'sample_anime',
        name: 'Anime / Comic Line Face',
        render: (ctx, w, h) => this.drawAnimePortrait(ctx, w, h)
      }
    ];
  }

  static getSampleDataUrl(sampleId, w = 600, h = 600) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const sample = this.getSamples().find(s => s.id === sampleId) || this.getSamples()[0];
    sample.render(ctx, w, h);
    return canvas.toDataURL('image/png');
  }

  static drawFemalePortrait(ctx, w, h) {
    // Soft studio backdrop
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 50, w * 0.5, h * 0.5, w * 0.7);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.45;

    // Body / shoulders
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(cx - 160, h);
    ctx.quadraticCurveTo(cx - 130, cy + 180, cx - 40, cy + 140);
    ctx.lineTo(cx + 40, cy + 140);
    ctx.quadraticCurveTo(cx + 130, cy + 180, cx + 160, h);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = '#fbd5bc';
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 80);
    ctx.lineTo(cx - 35, cy + 150);
    ctx.lineTo(cx + 35, cy + 150);
    ctx.lineTo(cx + 35, cy + 80);
    ctx.closePath();
    ctx.fill();

    // Neck shadow
    ctx.fillStyle = '#e2b395';
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 85);
    ctx.quadraticCurveTo(cx, cy + 115, cx + 35, cy + 85);
    ctx.lineTo(cx + 35, cy + 95);
    ctx.quadraticCurveTo(cx, cy + 125, cx - 35, cy + 95);
    ctx.closePath();
    ctx.fill();

    // Hair back volume
    ctx.fillStyle = '#2d1810';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 10, 140, 160, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face oval
    ctx.fillStyle = '#fce4d6';
    ctx.beginPath();
    ctx.moveTo(cx - 85, cy - 40);
    ctx.quadraticCurveTo(cx - 90, cy + 40, cx - 55, cy + 85);
    ctx.quadraticCurveTo(cx, cy + 120, cx + 55, cy + 85);
    ctx.quadraticCurveTo(cx + 90, cy + 40, cx + 85, cy - 40);
    ctx.quadraticCurveTo(cx, cy - 110, cx - 85, cy - 40);
    ctx.closePath();
    ctx.fill();

    // Face shading
    ctx.fillStyle = '#f3cbb4';
    ctx.beginPath();
    ctx.moveTo(cx + 55, cy + 85);
    ctx.quadraticCurveTo(cx + 90, cy + 40, cx + 85, cy - 40);
    ctx.quadraticCurveTo(cx + 65, cy + 20, cx + 45, cy + 70);
    ctx.closePath();
    ctx.fill();

    // Eyebrows
    ctx.strokeStyle = '#2d1810';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    // Left eyebrow
    ctx.beginPath();
    ctx.moveTo(cx - 65, cy - 25);
    ctx.quadraticCurveTo(cx - 45, cy - 38, cx - 20, cy - 28);
    ctx.stroke();
    // Right eyebrow
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy - 28);
    ctx.quadraticCurveTo(cx + 45, cy - 38, cx + 65, cy - 25);
    ctx.stroke();

    // Eyes
    // Left Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 62, cy - 12);
    ctx.quadraticCurveTo(cx - 42, cy - 25, cx - 22, cy - 12);
    ctx.quadraticCurveTo(cx - 42, cy - 2, cx - 62, cy - 12);
    ctx.fill();
    ctx.strokeStyle = '#1e100a';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Left Iris & Pupil
    ctx.fillStyle = '#452b1f';
    ctx.beginPath();
    ctx.arc(cx - 42, cy - 13, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx - 42, cy - 13, 4, 0, Math.PI * 2);
    ctx.fill();
    // Catchlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 44, cy - 15, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Right Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + 22, cy - 12);
    ctx.quadraticCurveTo(cx + 42, cy - 25, cx + 62, cy - 12);
    ctx.quadraticCurveTo(cx + 42, cy - 2, cx + 22, cy - 12);
    ctx.fill();
    ctx.strokeStyle = '#1e100a';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Right Iris & Pupil
    ctx.fillStyle = '#452b1f';
    ctx.beginPath();
    ctx.arc(cx + 42, cy - 13, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx + 42, cy - 13, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 40, cy - 15, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.strokeStyle = '#c58b68';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 15);
    ctx.lineTo(cx - 6, cy + 22);
    ctx.quadraticCurveTo(cx - 1, cy + 28, cx + 4, cy + 26);
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = '#8e563a';
    ctx.beginPath();
    ctx.arc(cx - 10, cy + 25, 2, 0, Math.PI * 2);
    ctx.arc(cx + 10, cy + 25, 2, 0, Math.PI * 2);
    ctx.fill();

    // Lips
    // Top Lip
    ctx.fillStyle = '#be434f';
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy + 54);
    ctx.quadraticCurveTo(cx - 16, cy + 45, cx, cy + 50);
    ctx.quadraticCurveTo(cx + 16, cy + 45, cx + 32, cy + 54);
    ctx.quadraticCurveTo(cx, cy + 55, cx - 32, cy + 54);
    ctx.fill();

    // Bottom Lip
    ctx.fillStyle = '#dd5563';
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy + 55);
    ctx.quadraticCurveTo(cx, cy + 57, cx + 30, cy + 55);
    ctx.quadraticCurveTo(cx, cy + 74, cx - 30, cy + 55);
    ctx.fill();

    // Lip line
    ctx.strokeStyle = '#7c1d27';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy + 54);
    ctx.quadraticCurveTo(cx, cy + 56, cx + 32, cy + 54);
    ctx.stroke();

    // Front Hair & Waves
    ctx.fillStyle = '#3d2218';
    ctx.beginPath();
    ctx.moveTo(cx - 120, cy - 20);
    ctx.bezierCurveTo(cx - 90, cy - 120, cx + 80, cy - 130, cx + 120, cy - 10);
    ctx.bezierCurveTo(cx + 110, cy + 70, cx + 95, cy + 130, cx + 130, cy + 220);
    ctx.bezierCurveTo(cx + 80, cy + 150, cx + 70, cy + 60, cx + 60, cy - 20);
    ctx.bezierCurveTo(cx + 30, cy - 65, cx - 50, cy - 65, cx - 75, cy - 10);
    ctx.bezierCurveTo(cx - 85, cy + 60, cx - 95, cy + 140, cx - 130, cy + 220);
    ctx.bezierCurveTo(cx - 105, cy + 130, cx - 115, cy + 60, cx - 120, cy - 20);
    ctx.closePath();
    ctx.fill();

    // Hair strands & highlights
    ctx.strokeStyle = '#5a3525';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 40, cy - 90);
    ctx.quadraticCurveTo(cx - 80, cy - 30, cx - 100, cy + 80);
    ctx.moveTo(cx + 10, cy - 95);
    ctx.quadraticCurveTo(cx + 65, cy - 40, cx + 85, cy + 80);
    ctx.moveTo(cx - 10, cy - 95);
    ctx.quadraticCurveTo(cx - 5, cy - 40, cx + 30, cy - 20);
    ctx.stroke();
  }

  static drawMalePortrait(ctx, w, h) {
    // Dramatic dark background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#334155');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.44;

    // Strong shoulders / jacket
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(cx - 190, h);
    ctx.lineTo(cx - 140, cy + 170);
    ctx.lineTo(cx - 50, cy + 135);
    ctx.lineTo(cx + 50, cy + 135);
    ctx.lineTo(cx + 140, cy + 170);
    ctx.lineTo(cx + 190, h);
    ctx.closePath();
    ctx.fill();

    // Collar
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy + 135);
    ctx.lineTo(cx, cy + 180);
    ctx.lineTo(cx + 50, cy + 135);
    ctx.stroke();

    // Neck
    ctx.fillStyle = '#dfaf8e';
    ctx.fillRect(cx - 40, cy + 70, 80, 80);

    // Chiseled Face
    ctx.fillStyle = '#f4c7a6';
    ctx.beginPath();
    ctx.moveTo(cx - 85, cy - 50);
    ctx.lineTo(cx - 80, cy + 30);
    ctx.lineTo(cx - 55, cy + 85);
    ctx.lineTo(cx, cy + 105);
    ctx.lineTo(cx + 55, cy + 85);
    ctx.lineTo(cx + 80, cy + 30);
    ctx.lineTo(cx + 85, cy - 50);
    ctx.closePath();
    ctx.fill();

    // Half shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 60);
    ctx.lineTo(cx, cy + 105);
    ctx.lineTo(cx + 55, cy + 85);
    ctx.lineTo(cx + 80, cy + 30);
    ctx.lineTo(cx + 85, cy - 50);
    ctx.closePath();
    ctx.fill();

    // Short styled hair
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.moveTo(cx - 95, cy - 40);
    ctx.lineTo(cx - 90, cy - 90);
    ctx.lineTo(cx - 50, cy - 120);
    ctx.lineTo(cx + 40, cy - 125);
    ctx.lineTo(cx + 95, cy - 95);
    ctx.lineTo(cx + 95, cy - 35);
    ctx.lineTo(cx + 80, cy - 45);
    ctx.lineTo(cx + 60, cy - 55);
    ctx.lineTo(cx - 70, cy - 55);
    ctx.closePath();
    ctx.fill();

    // Thick Eyebrows
    ctx.fillStyle = '#1c1917';
    // Left brow
    ctx.beginPath();
    ctx.moveTo(cx - 70, cy - 25);
    ctx.lineTo(cx - 45, cy - 32);
    ctx.lineTo(cx - 20, cy - 24);
    ctx.lineTo(cx - 45, cy - 27);
    ctx.closePath();
    ctx.fill();
    // Right brow
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy - 24);
    ctx.lineTo(cx + 45, cy - 32);
    ctx.lineTo(cx + 70, cy - 25);
    ctx.lineTo(cx + 45, cy - 27);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 3.5;
    // Left eye
    ctx.beginPath();
    ctx.moveTo(cx - 65, cy - 12);
    ctx.lineTo(cx - 25, cy - 12);
    ctx.stroke();
    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.arc(cx - 45, cy - 11, 6, 0, Math.PI * 2);
    ctx.fill();

    // Right eye
    ctx.beginPath();
    ctx.moveTo(cx + 25, cy - 12);
    ctx.lineTo(cx + 65, cy - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 45, cy - 11, 6, 0, Math.PI * 2);
    ctx.fill();

    // Sharp Nose
    ctx.strokeStyle = '#9a5e3d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 20);
    ctx.lineTo(cx - 6, cy + 24);
    ctx.lineTo(cx + 6, cy + 24);
    ctx.stroke();

    // Mouth
    ctx.strokeStyle = '#833939';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy + 55);
    ctx.lineTo(cx + 30, cy + 55);
    ctx.stroke();

    // Under-lip shadow
    ctx.strokeStyle = '#9a5e3d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 68);
    ctx.lineTo(cx + 14, cy + 68);
    ctx.stroke();
  }

  static drawAnimePortrait(ctx, w, h) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.45;

    // Anime line style: crisp ink outlines
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Face / Chin V-shape
    ctx.beginPath();
    ctx.moveTo(cx - 75, cy - 20);
    ctx.lineTo(cx - 70, cy + 40);
    ctx.lineTo(cx, cy + 105);
    ctx.lineTo(cx + 70, cy + 40);
    ctx.lineTo(cx + 75, cy - 20);
    ctx.stroke();

    // Huge Anime Eyes
    // Left Eye Top
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx - 42, cy - 8, 22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // Left Eye Bottom
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx - 42, cy - 8, 16, Math.PI * 0.3, Math.PI * 0.7);
    ctx.stroke();
    // Left Pupil
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.ellipse(cx - 42, cy - 5, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 46, cy - 10, 5, 0, Math.PI * 2);
    ctx.arc(cx - 38, cy + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Right Eye Top
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx + 42, cy - 8, 22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // Right Eye Bottom
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx + 42, cy - 8, 16, Math.PI * 0.3, Math.PI * 0.7);
    ctx.stroke();
    // Right Pupil
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.ellipse(cx + 42, cy - 5, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 38, cy - 10, 5, 0, Math.PI * 2);
    ctx.arc(cx + 46, cy + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Brows
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - 62, cy - 35);
    ctx.quadraticCurveTo(cx - 42, cy - 42, cx - 22, cy - 32);
    ctx.moveTo(cx + 22, cy - 32);
    ctx.quadraticCurveTo(cx + 42, cy - 42, cx + 62, cy - 35);
    ctx.stroke();

    // Cute Nose Dot
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(cx, cy + 22, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Smiling Mouth
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + 50);
    ctx.quadraticCurveTo(cx, cy + 62, cx + 20, cy + 50);
    ctx.stroke();

    // Spiky Anime Hair
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 85, cy + 10);
    ctx.lineTo(cx - 105, cy - 45);
    ctx.lineTo(cx - 80, cy - 35);
    ctx.lineTo(cx - 95, cy - 95);
    ctx.lineTo(cx - 55, cy - 75);
    ctx.lineTo(cx - 45, cy - 130);
    ctx.lineTo(cx - 15, cy - 90);
    ctx.lineTo(cx + 10, cy - 135);
    ctx.lineTo(cx + 35, cy - 85);
    ctx.lineTo(cx + 70, cy - 120);
    ctx.lineTo(cx + 65, cy - 70);
    ctx.lineTo(cx + 105, cy - 90);
    ctx.lineTo(cx + 85, cy - 30);
    ctx.lineTo(cx + 110, cy - 20);
    ctx.lineTo(cx + 80, cy + 20);
    ctx.stroke();

    // Bangs over forehead
    ctx.beginPath();
    ctx.moveTo(cx - 65, cy - 40);
    ctx.lineTo(cx - 45, cy + 2);
    ctx.lineTo(cx - 30, cy - 35);
    ctx.lineTo(cx - 10, cy + 8);
    ctx.lineTo(cx + 5, cy - 32);
    ctx.lineTo(cx + 25, cy + 5);
    ctx.lineTo(cx + 38, cy - 30);
    ctx.lineTo(cx + 60, cy + 2);
    ctx.stroke();
  }
}
