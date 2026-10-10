using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Features.Jobs;
using Wunschzettu.Api.Features.Members;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Features.Scraping;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;
using Wunschzettu.Api.Infrastructure;
using Wunschzettu.Api.Infrastructure.Mail;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Build-time OpenAPI generation runs this file too; it must not touch the disk or the database.
var isDocGeneration = System.Reflection.Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";

var appOptions = config.GetSection("App").Get<AppOptions>() ?? new AppOptions();
var dataDir = Path.GetFullPath(appOptions.DataDir);
if (!isDocGeneration) Directory.CreateDirectory(dataDir);

builder.Services.Configure<AppOptions>(config.GetSection("App"));
builder.Services.Configure<SmtpOptions>(config.GetSection("Smtp"));
builder.Services.AddSingleton(TimeProvider.System);

// Data
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(config.GetConnectionString("Default") ?? $"Data Source={Path.Combine(dataDir, "wunschzettu.db")}"));
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDir, "keys")))
    .SetApplicationName("Wunschzettu");

// Identity: email codes and links; a password is optional (§5)
builder.Services
    .AddIdentityCore<AppUser>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.User.AllowedUserNameCharacters = ""; // user names are the email addresses, validated as such
        o.SignIn.RequireConfirmedEmail = false;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        // Length over composition rules (NIST 800-63B); the upper bound is in SetPasswordRequest.
        o.Password.RequiredLength = 8;
        o.Password.RequireDigit = false;
        o.Password.RequireLowercase = false;
        o.Password.RequireUppercase = false;
        o.Password.RequireNonAlphanumeric = false;
        o.Password.RequiredUniqueChars = 1;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddClaimsPrincipalFactory<AppClaimsFactory>();

builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();
builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "wz_session";
    o.Cookie.HttpOnly = true;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.ExpireTimeSpan = TimeSpan.FromDays(90);
    o.SlidingExpiration = true;
    // An API answers with status codes, it doesn't redirect to a login page.
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});
builder.Services.Configure<SecurityStampValidatorOptions>(o =>
{
    // Picks up a confirmation done on another device (email_confirmed claim) within minutes.
    o.ValidationInterval = TimeSpan.FromMinutes(5);
    o.OnRefreshingPrincipal = ctx =>
    {
        if (ctx.CurrentPrincipal?.FindFirst(ClaimsExtensions.Device) is { } device)
            ctx.NewPrincipal?.Identities.First().AddClaim(new(device.Type, device.Value));
        return Task.CompletedTask;
    };
});
builder.Services.AddAuthorizationBuilder().AddAppPolicies();

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(AuthEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = appOptions.AuthRequestsPerMinute, Window = TimeSpan.FromMinutes(1) }));
    o.AddScrapeRateLimit();
});

// Features
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GiftService>();
builder.Services.AddScoped<Mailer>();
builder.Services.AddScoped<Jobs>();
builder.Services.AddSingleton<ImageStore>();
builder.Services.AddScoped<LinkPreviews>();
builder.Services.AddMemoryCache();
// Fetches pages users link to; SafeHttp blocks internal addresses (§9).
builder.Services.AddHttpClient<PageScraper>(PageScraper.Configure).ConfigurePrimaryHttpMessageHandler(SafeHttp.CreateHandler);
builder.Services.AddSingleton<OutboxSignal>();
if (string.IsNullOrEmpty(config["Smtp:Host"]))
    builder.Services.AddSingleton<IMailSender, LogMailSender>();
else
    builder.Services.AddSingleton<IMailSender, SmtpMailSender>();
if (appOptions.RunBackgroundServices && !isDocGeneration)
{
    builder.Services.AddHostedService<OutboxSender>();
    builder.Services.AddHostedService<JobRunner>();
}
builder.Services.AddOptions<OutboxOptions>();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    // Numbers are numbers: keeps the OpenAPI schema (and the generated TS types) free of "number | string".
    o.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.AddValidation();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

var app = builder.Build();

if (!isDocGeneration)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // Some migrations rebuild tables outside a transaction; a copy beforehand makes a failed update recoverable.
    if ((await db.Database.GetPendingMigrationsAsync()).Any() && (await db.Database.GetAppliedMigrationsAsync()).Any())
        await db.Database.ExecuteSqlRawAsync("VACUUM INTO {0}",
            Path.Combine(dataDir, $"wunschzettu-before-update-{DateTime.UtcNow:yyyyMMdd-HHmmss}.db"));
    await db.Database.MigrateAsync();
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
}

app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = ex => ex switch
    {
        BadHttpRequestException bad => bad.StatusCode,
        // Two writers on the same wish, or two requests creating the same row: one wins, the other gets 409 (§6.8).
        _ when AppDbContext.IsWriteConflict(ex) => StatusCodes.Status409Conflict,
        _ => StatusCodes.Status500InternalServerError,
    },
    // Expected races aren't errors worth a stack trace in the log.
    SuppressDiagnosticsCallback = ctx => AppDbContext.IsWriteConflict(ctx.Exception),
});
app.UseStatusCodePages();
app.UseSecurityHeaders();
app.UseCsrfHeader();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseImageFiles();

app.MapOpenApi();
app.MapHealthChecks("/healthz");
app.MapAuthEndpoints();
app.MapWishlistEndpoints();
app.MapWishEndpoints();
app.MapSharedEndpoints();
app.MapGiftEndpoints();
app.MapMemberEndpoints();
app.MapImageEndpoints();
app.MapScrapeEndpoints();
app.MapSharePreview();

// The Angular build lives in wwwroot (see Dockerfile). Unknown /api routes stay 404s, everything else is the SPA.
app.MapStaticAssets();
app.Map("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
