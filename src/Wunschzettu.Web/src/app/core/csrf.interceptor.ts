import { HttpInterceptorFn } from '@angular/common/http';

/** The API rejects mutating requests without this header (see Csrf.cs). */
export const csrfInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.method === 'GET' ? req : req.clone({ setHeaders: { 'X-Requested-With': 'XMLHttpRequest' } }));
