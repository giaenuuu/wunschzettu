using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Jobs;
using Wunschzettu.Api.Features.Scraping;

namespace Wunschzettu.Api.Tests;

/// One app per test class, each with its own SQLite file and a clock the tests control.
/// Background services are off: tests read mails from the outbox table and run jobs explicitly.
public sealed partial class AppFactory : WebApplicationFactory<Program>
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    readonly string _dataDir = Path.Combine(Path.GetTempPath(), "wunschzettu-tests", Guid.NewGuid().ToString("N"));

    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("App:DataDir", _dataDir);
        builder.UseSetting("App:RunBackgroundServices", "false");
        builder.UseSetting("App:AuthRequestsPerMinute", "100000");
        builder.UseSetting("App:BaseUrl", "https://wunsch.test");
        builder.ConfigureTestServices(s =>
        {
            s.AddSingleton<TimeProvider>(Clock);
            // Tests never reach the internet: the scraper talks to FakeWeb.
            s.AddHttpClient<PageScraper>().ConfigurePrimaryHttpMessageHandler(() => new FakeWebHandler(Web));
        });
    }

    public FakeWeb Web { get; } = new();

    public string ImagesDir => Path.Combine(_dataDir, "images");

    public HttpClient Anonymous()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Requested-With", "XMLHttpRequest");
        return client;
    }

    /// A confirmed, signed-in user, logged in through the real email code flow.
    public async Task<HttpClient> UserAsync(string email, string? name = null, string language = "de-CH")
    {
        var client = Anonymous();
        (await client.PostAsJsonAsync("/api/auth/request-code", new { email, language })).EnsureSuccessStatusCode();
        var code = await LatestCodeAsync(email);
        (await client.PostAsJsonAsync("/api/auth/verify-code", new { email, code })).EnsureSuccessStatusCode();
        if (name is not null)
            (await client.PutAsJsonAsync("/api/auth/me", new { displayName = name, language })).EnsureSuccessStatusCode();
        return client;
    }

    /// A guest who typed name and email but never confirmed (§5).
    public async Task<HttpClient> GuestAsync(string email, string name)
    {
        var client = Anonymous();
        var res = await client.PostAsJsonAsync("/api/auth/identify", new { email, displayName = name });
        res.EnsureSuccessStatusCode();
        Assert.Contains("SignedIn", await res.Content.ReadAsStringAsync());
        return client;
    }

    public async Task<T> WithDb<T>(Func<AppDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task<List<OutboxMessage>> MailsToAsync(string email) =>
        WithDb(db => db.Outbox.Where(m => m.ToEmail == email).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).ToListAsync());

    public async Task<string> LatestCodeAsync(string email)
    {
        var mail = (await MailsToAsync(email)).Last(m => CodePattern().IsMatch(m.TextBody));
        return CodePattern().Match(mail.TextBody).Value;
    }

    public async Task<string> LatestLinkTokenAsync(string email)
    {
        var mail = (await MailsToAsync(email)).Last(m => m.TextBody.Contains("token="));
        return Uri.UnescapeDataString(TokenPattern().Match(mail.TextBody).Groups[1].Value);
    }

    public async Task RunJobsAsync()
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<Jobs>().RunAsync(CancellationToken.None);
    }

    [GeneratedRegex(@"(?m)^\d{6}$")]
    private static partial Regex CodePattern();

    [GeneratedRegex(@"token=([^&\s]+)")]
    private static partial Regex TokenPattern();

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        try { Directory.Delete(_dataDir, recursive: true); } catch (IOException) { }
    }
}

public static class HttpExtensions
{
    public static async Task<T> Read<T>(this Task<HttpResponseMessage> request)
    {
        var res = await request;
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {res.RequestMessage?.Method} {res.RequestMessage?.RequestUri}: {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<T>(AppFactory.Json))!;
    }

    public static async Task<HttpResponseMessage> Ok(this Task<HttpResponseMessage> request)
    {
        var res = await request;
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode} {res.RequestMessage?.Method} {res.RequestMessage?.RequestUri}: {await res.Content.ReadAsStringAsync()}");
        return res;
    }

    /// Asserts a problem response with the given status and (optionally) type.
    public static async Task Fails(this Task<HttpResponseMessage> request, int status, string? type = null)
    {
        var res = await request;
        var body = await res.Content.ReadAsStringAsync();
        Assert.True((int)res.StatusCode == status, $"Expected {status}, got {(int)res.StatusCode}: {body}");
        if (type is not null) Assert.Contains($"\"type\":\"{type}\"", body);
    }

    public static Task<HttpResponseMessage> Post(this HttpClient c, string url, object? body = null) =>
        c.PostAsJsonAsync(url, body ?? new { }, AppFactory.Json);

    public static Task<HttpResponseMessage> Put(this HttpClient c, string url, object body) =>
        c.PutAsJsonAsync(url, body, AppFactory.Json);
}
