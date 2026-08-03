import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  auth = inject(AuthService);

  showPassword = signal(false);
  error = signal('');
  loading = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  get email() { return this.form.get('email'); }
  get password() { return this.form.get('password'); }

  togglePassword() { this.showPassword.update(v => !v); }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');

    const result = await this.auth.login(
      this.form.value.email!,
      this.form.value.password!
    );

    this.loading.set(false);
    if (result.success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.error.set(result.error ?? 'Error al iniciar sesión.');
    }
  }

  // Quick login para testing
  async loginAs(email: string, password: string) {
    this.form.setValue({ email, password });
    await this.onSubmit();
  }
}
