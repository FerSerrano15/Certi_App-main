import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

function passwordMatch(control: AbstractControl) {
  const p = control.get('password')?.value;
  const c = control.get('confirmarPassword')?.value;
  return p === c ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-registro-evaluador',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro-evaluador.html',
  styleUrl: './registro-evaluador.css'
})
export class RegistroEvaluadorComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private auth = inject(AuthService);

  showPassword = signal(false);
  showConfirm  = signal(false);
  error  = signal('');
  loading = signal(false);

  form = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    email:     ['', [Validators.required, Validators.email]],
    phone:     ['', [Validators.pattern(/^\d{10}$/)]],
    password:  ['', [Validators.required, Validators.minLength(8)]],
    confirmarPassword: ['', Validators.required],
  }, { validators: passwordMatch });

  get f() { return this.form.controls; }
  get passwordMismatch() {
    return this.form.hasError('passwordMismatch') && this.form.get('confirmarPassword')?.touched;
  }

  togglePassword() { this.showPassword.update(v => !v); }
  toggleConfirm()  { this.showConfirm.update(v => !v); }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');

    const v = this.form.value;
    const result = await this.auth.register({
      full_name: v.full_name!,
      email:     v.email!,
      phone:     v.phone ?? undefined,
      password:  v.password!,
      role:      'INSTRUCTOR',  // registro como instructor por defecto
    });

    this.loading.set(false);
    if (result.success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.error.set(result.error ?? 'Error al registrar.');
    }
  }
}
