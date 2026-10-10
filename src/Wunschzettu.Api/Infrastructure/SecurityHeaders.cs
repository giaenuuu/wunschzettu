namespace Wunschzettu.Api.Infrastructure;

/// Browser hardening for every response. A reverse proxy may add HSTS on top; these don't depend on it.
public static class SecurityHeaders
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) => app.Use((ctx, next) =>
    {
        var headers = ctx.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        // Share links carry the list's token; other sites never see our URLs.
        headers["Referrer-Policy"] = "same-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        return next(ctx);
    });
}
