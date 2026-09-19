import { Component, ElementRef, ViewChild, signal, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Lienzo de firma reutilizable (mismo patrón que ya usaba
 * ficha-registro-page.component.ts, extraído para reusarlo también en el
 * expediente de certificación). Emite el dataURL PNG cada vez que cambia.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signature-pad.component.html',
  styleUrl: './signature-pad.component.css',
})
export class SignaturePadComponent {
  label = input('Firma');

  changed = output<string | null>();

  @ViewChild('sigCanvas') sigCanvas!: ElementRef<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  signatureData = signal<string | null>(null);
  canvasReady = signal(false);

  initCanvas() {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas || this.canvasReady()) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.scale(dpr, dpr);
    this.ctx.strokeStyle = '#1a1a2e';
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.canvasReady.set(true);

    const getPos = (e: MouseEvent | Touch) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault(); this.drawing = true;
      const p = getPos(e); this.ctx!.beginPath(); this.ctx!.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.drawing) return;
      const p = getPos(e); this.ctx!.lineTo(p.x, p.y); this.ctx!.stroke();
    });
    canvas.addEventListener('mouseup', () => { this.drawing = false; this.capture(); });
    canvas.addEventListener('mouseleave', () => { this.drawing = false; });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.drawing = true;
      const p = getPos(e.touches[0]); this.ctx!.beginPath(); this.ctx!.moveTo(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.drawing) return;
      const p = getPos(e.touches[0]); this.ctx!.lineTo(p.x, p.y); this.ctx!.stroke();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.drawing = false; this.capture(); });
  }

  private capture() {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    this.signatureData.set(dataUrl);
    this.changed.emit(dataUrl);
  }

  clear() {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    this.signatureData.set(null);
    this.changed.emit(null);
  }
}
