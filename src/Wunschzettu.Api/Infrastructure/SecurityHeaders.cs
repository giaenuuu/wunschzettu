namespace Wunschzettu.Api.Infrastructure;

/// Browser hardening for every response. A reverse proxy may add HSTS on top; these don't depend on it.
public static class SecurityHeaders
{
    /// Everything comes from this server. Inline styles: Angular's component styles and icon masks.
    /// Images from https: the wish dialog previews pictures straight from the shop before importing them.
    const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
        "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; " +
        "base-uri 'self'; form-action 'self'; object-src 'none'";

    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) => app.Use((ctx, next) =>
    {
        var headers = ctx.Response.Headers;
        headers.ContentSecurityPolicy = ContentSecurityPolicy;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        // Share links carry the list's token; other sites never see our URLs.
        headers["Referrer-Policy"] = "same-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        // Only the landing page and the legal pages belong in search engines; lists never do.
        if (!IsPublicPage(ctx.Request.Path)) headers["X-Robots-Tag"] = "noindex, nofollow";
        return next(ctx);
    });

    static bool IsPublicPage(PathString path) =>
        path == "/" || path == "/app" || path == "/impressum" || path == "/datenschutz" || path == "/nutzungsbedingungen"
        || path == "/robots.txt" || path == "/favicon.svg";
}
