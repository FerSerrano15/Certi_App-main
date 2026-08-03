import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Servicio centralizado para comunicarse con el backend NestJS.
 * Todos los servicios deben inyectar ApiService en lugar de HttpClient directamente.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  // ─── Helpers de cabeceras ─────────────────────────────────────────────────

  private headers(token?: string | null): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  // ─── GET ──────────────────────────────────────────────────────────────────

  get<T>(path: string, token?: string | null): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      headers: this.headers(token),
      withCredentials: true,
    });
  }

  // ─── POST ─────────────────────────────────────────────────────────────────

  post<T>(path: string, body: unknown, token?: string | null): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, {
      headers: this.headers(token),
      withCredentials: true,
    });
  }

  // ─── PATCH ────────────────────────────────────────────────────────────────

  patch<T>(path: string, body: unknown, token?: string | null): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, {
      headers: this.headers(token),
      withCredentials: true,
    });
  }

  // ─── PUT ──────────────────────────────────────────────────────────────────

  put<T>(path: string, body: unknown, token?: string | null): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, {
      headers: this.headers(token),
      withCredentials: true,
    });
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  delete<T>(path: string, token?: string | null): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, {
      headers: this.headers(token),
      withCredentials: true,
    });
  }

  // ─── POST (multipart/form-data) ───────────────────────────────────────────
  // No fijamos Content-Type a propósito: el navegador debe generar el
  // boundary del multipart automáticamente al enviar un FormData.

  postFormData<T>(path: string, formData: FormData, token?: string | null): Observable<T> {
    let headers = new HttpHeaders();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return this.http.post<T>(`${this.baseUrl}${path}`, formData, {
      headers,
      withCredentials: true,
    });
  }
}
