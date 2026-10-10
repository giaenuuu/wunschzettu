namespace Wunschzettu.Api.Infrastructure;

/// §5: SameSite=Lax cookies plus a required custom header on mutating API calls.
/// A cross-site form can't set custom headers, and a cross-site fetch with one needs CORS, which we never allow.
public static class Csrf
{
    public const string HeaderName = "X-Requested-With";

    public static IApplicationBuilder UseCsrfHeader(this IApplicationBuilder app) => app.Use(async (ctx, next) =>
    {
        var req = ctx.Request;
        if (req.Path.StartsWithSegments("/api")
            && !HttpMethods.IsGet(req.Method) && !HttpMethods.IsHead(req.Method) && !HttpMethods.IsOptions(req.Method)
            && !req.Headers.ContainsKey(HeaderName))
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsync($"Missing {HeaderName} header.");
            return;
        }
        await next();
    });
}
