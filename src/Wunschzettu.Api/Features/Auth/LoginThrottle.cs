using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;

namespace Wunschzettu.Api.Features.Auth;

/// Wrong passwords slow down guessing without letting a stranger lock the owner out (§5.5):
/// 5 failures per account and IP block only that IP; 30 per account from anywhere block password login
/// for everyone, which only a distributed attack reaches. Codes and links keep working either way.
public class LoginThrottle(IMemoryCache cache, TimeProvider clock)
{
    /// Identity's default normalizer, created here: the registered one is scoped, and this class is a singleton
    /// (a scoped service in a singleton fails the start in Development, where scopes are validated).
    static readonly ILookupNormalizer Normalizer = new UpperInvariantLookupNormalizer();

    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    const int PerIp = 5;
    const int PerAccount = 30;

    record Failures(int Count, DateTimeOffset Since);

    public bool IsBlocked(string email, string? ip) =>
        Count(IpKey(email, ip)) >= PerIp || Count(AccountKey(email)) >= PerAccount;

    public void Failed(string email, string? ip)
    {
        Add(IpKey(email, ip));
        Add(AccountKey(email));
    }

    public void Succeeded(string email, string? ip) => cache.Remove(IpKey(email, ip));

    int Count(string key) =>
        cache.TryGetValue(key, out Failures? f) && clock.GetUtcNow() - f!.Since < Window ? f.Count : 0;

    void Add(string key)
    {
        var now = clock.GetUtcNow();
        var current = cache.TryGetValue(key, out Failures? f) && now - f!.Since < Window ? f : new Failures(0, now);
        cache.Set(key, current with { Count = current.Count + 1 }, Window * 2);
    }

    string IpKey(string email, string? ip) => $"login-fail:{Normalize(email)}:{ip}";
    string AccountKey(string email) => $"login-fail:{Normalize(email)}";
    /// The same normalization Identity uses to find the account, so look-alike spellings
    /// (e.g. the Kelvin sign for "k") share one bucket.
    string Normalize(string email) => Normalizer.NormalizeEmail(email.Trim()) ?? "";
}
