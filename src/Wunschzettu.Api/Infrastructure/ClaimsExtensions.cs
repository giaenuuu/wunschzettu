using System.Security.Claims;

namespace Wunschzettu.Api.Infrastructure;

public static class ClaimsExtensions
{
    public const string EmailConfirmed = "email_confirmed";
    /// Random id per sign-in. Unconfirmed users may only change what they created on this device (§5.4).
    public const string Device = "device";

    public static string? UserId(this ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier);

    public static string RequiredUserId(this ClaimsPrincipal user) =>
        user.UserId() ?? throw new InvalidOperationException("Endpoint requires an authenticated user.");

    public static string? DeviceId(this ClaimsPrincipal user) => user.FindFirstValue(Device);

    public static bool IsConfirmed(this ClaimsPrincipal user) => user.HasClaim(EmailConfirmed, "true");
}
