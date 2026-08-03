import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CertificatesService, CertificateVerification } from '../../core/services/certificates.service';

@Component({
  selector: 'app-verify-certificate',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-certificate.html',
  styleUrl: './verify-certificate.css',
})
export class VerifyCertificateComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(CertificatesService);

  reference = signal('');
  loading = signal(false);
  searched = signal(false);
  result = signal<CertificateVerification | null>(null);

  ngOnInit() {
    const fromUrl = this.route.snapshot.paramMap.get('ref');
    if (fromUrl) {
      this.reference.set(fromUrl);
      this.verify();
    }
  }

  onInput(e: Event) {
    this.reference.set((e.target as HTMLInputElement).value);
  }

  async verify() {
    const ref = this.reference().trim();
    if (!ref) return;
    this.loading.set(true);
    this.searched.set(true);
    this.result.set(await this.svc.verify(ref));
    this.loading.set(false);
  }

  statusLabel(status?: string): string {
    const map: Record<string, string> = {
      active: 'Vigente', expired: 'Vencido', revoked: 'Revocado',
    };
    return status ? (map[status] ?? status) : '';
  }
}
