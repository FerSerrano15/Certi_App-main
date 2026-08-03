import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LandingContentService, LandingContent, DEFAULT_LANDING_CONTENT } from '../../core/services/landing-content.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit {
  private router = inject(Router);
  private landingSvc = inject(LandingContentService);
  auth = inject(AuthService);

  isScrolled = false;
  mobileMenuOpen = false;

  /** Contenido del landing — editable desde el panel de Super Admin (WordPress-style, low-code). */
  content: LandingContent = DEFAULT_LANDING_CONTENT;

  async ngOnInit(): Promise<void> {
    this.content = await this.landingSvc.getContent();
  }

  /** Convierte el índice del paso (0-based) al formato "01", "02", etc. usado en la UI. */
  stepNumber(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  @HostListener('window:scroll', [])
  onWindowScroll() { this.isScrolled = window.scrollY > 50; }

  toggleMobileMenu() { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu() { this.mobileMenuOpen = false; }

  scrollTo(section: string) {
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.closeMobileMenu();
  }

  goToLogin() { this.router.navigate(['/login']); }
  goToRegister() { this.router.navigate(['/registro']); }
  goToDashboard() { this.router.navigate(['/dashboard']); }
  async logout() { await this.auth.logout(); }
}
