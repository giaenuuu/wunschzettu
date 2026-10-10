import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IdentifyResponse, Me } from './api';
import { chosenLanguage } from './language';

/** Email identity (ARCHITECTURE §5): codes and links, plus an optional password. */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly #http = inject(HttpClient);
  readonly #user = signal<Me | null>(null);

  readonly user = this.#user.asReadonly();
  readonly loggedIn = computed(() => this.#user() !== null);
  readonly confirmed = computed(() => this.#user()?.emailConfirmed === true);

  /** Runs once at startup (see app.config.ts), so guards can decide synchronously. */
  async load(): Promise<void> {
    try {
      this.#user.set(await firstValueFrom(this.#http.get<Me | null>('/api/auth/me')));
    } catch {
      this.#user.set(null);
    }
  }

  requestCode(email: string, returnUrl: string): Promise<unknown> {
    return firstValueFrom(this.#http.post('/api/auth/request-code', { email, returnUrl, language: chosenLanguage() }));
  }

  async verifyCode(email: string, code: string): Promise<Me> {
    return this.#set(await firstValueFrom(this.#http.post<Me>('/api/auth/verify-code', { email, code })));
  }

  async loginWithPassword(email: string, password: string): Promise<Me> {
    return this.#set(await firstValueFrom(this.#http.post<Me>('/api/auth/login-password', { email, password })));
  }

  async setPassword(password: string): Promise<void> {
    await firstValueFrom(this.#http.put('/api/auth/password', { password }));
    this.#user.update((u) => u && { ...u, hasPassword: true });
  }

  async removePassword(): Promise<void> {
    await firstValueFrom(this.#http.delete('/api/auth/password'));
    this.#user.update((u) => u && { ...u, hasPassword: false });
  }

  async confirm(token: string): Promise<Me> {
    return this.#set(await firstValueFrom(this.#http.post<Me>('/api/auth/confirm', { token })));
  }

  /** A guest acting on a list: signs in right away, unless the email is already confirmed (then a code is sent). */
  async identify(email: string, displayName: string, returnUrl: string): Promise<IdentifyResponse> {
    const res = await firstValueFrom(
      this.#http.post<IdentifyResponse>('/api/auth/identify', { email, displayName, returnUrl, language: chosenLanguage() }),
    );
    this.#user.set(res.user ?? null);
    return res;
  }

  async updateProfile(displayName: string, language: string): Promise<Me> {
    return this.#set(await firstValueFrom(this.#http.put<Me>('/api/auth/me', { displayName, language })));
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.#http.post('/api/auth/logout', null));
    this.#user.set(null);
  }

  #set(me: Me): Me {
    this.#user.set(me);
    return me;
  }
}

export const requireLogin: CanActivateFn = (_route, state) =>
  inject(Auth).loggedIn() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

export const loggedIn: CanMatchFn = () => inject(Auth).loggedIn();
