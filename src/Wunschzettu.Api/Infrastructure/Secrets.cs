using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Wunschzettu.Api.Infrastructure;

public static class Secrets
{
    /// URL-safe random token with 128 bits of entropy.
    public static string Token() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(16));

    /// 6-digit code for typing in. Brute force is stopped by attempt limits, not by the code length.
    public static string Code() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
