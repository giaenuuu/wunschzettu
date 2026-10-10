using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Auth;

public record MeDto(string Id, string Email, string DisplayName, bool EmailConfirmed, string Language, bool HasPassword)
{
    public static MeDto From(AppUser u) => new(u.Id, u.Email!, u.DisplayName, u.EmailConfirmed, u.Language, u.PasswordHash is not null);
}

public enum IdentifyStatus { SignedIn, CodeSent }

public record IdentifyRequest(
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, StringLength(100, MinimumLength = 1)] string DisplayName,
    string? Language,
    [property: StringLength(500)] string? ReturnUrl);

public record IdentifyResponse(IdentifyStatus Status, MeDto? User);

public record RequestCodeRequest(
    [property: Required, EmailAddress, StringLength(254)] string Email,
    string? Language,
    [property: StringLength(500)] string? ReturnUrl);

public record VerifyCodeRequest(
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, RegularExpression(@"^\s*\d{6}\s*$")] string Code);

public record PasswordLoginRequest(
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, StringLength(128)] string Password);

public record SetPasswordRequest([property: Required, StringLength(128, MinimumLength = 8)] string Password);

public record ConfirmRequest([property: Required, StringLength(100)] string Token);

public record UpdateMeRequest(
    [property: Required, StringLength(100, MinimumLength = 1)] string DisplayName,
    [property: Required, AllowedValues("de-CH", "en")] string Language);

public static class AuthEndpoints
{
    public const string RateLimitPolicy = "auth";

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");
        var limited = group.MapGroup("").RequireRateLimiting(RateLimitPolicy);

        group.MapGet("/me", async Task<Results<Ok<MeDto>, NoContent>> (HttpContext ctx, UserManager<AppUser> users) =>
        {
            var user = await users.GetUserAsync(ctx.User);
            return user is null ? TypedResults.NoContent() : TypedResults.Ok(MeDto.From(user));
        });

        group.MapPut("/me", async Task<Results<Ok<MeDto>, UnauthorizedHttpResult>> (UpdateMeRequest req, HttpContext ctx, UserManager<AppUser> users) =>
        {
            var user = await users.GetUserAsync(ctx.User);
            if (user is null) return TypedResults.Unauthorized();
            user.DisplayName = req.DisplayName.Trim();
            user.Language = req.Language;
            await users.UpdateAsync(user);
            return TypedResults.Ok(MeDto.From(user));
        }).RequireAuthorization(Policies.ConfirmedUser); // unconfirmed sessions may belong to whoever typed the email

        // The optional password (§5.9): set, replace or remove it. Changing it renews this session and ends all others.
        group.MapPut("/password", async Task<Results<NoContent, UnauthorizedHttpResult, ProblemHttpResult>> (SetPasswordRequest req,
            HttpContext ctx, UserManager<AppUser> users, AuthService auth) =>
        {
            var user = await users.GetUserAsync(ctx.User);
            if (user is null) return TypedResults.Unauthorized();
            var result = await auth.SetPasswordAsync(user, req.Password);
            if (!result.Succeeded)
                return TypedResults.Problem(string.Join(" ", result.Errors.Select(e => e.Description)), statusCode: 400, type: "weak-password");
            await auth.SignInAsync(user, ctx.User.DeviceId());
            await auth.NotifyPasswordChangedAsync(user, removed: false);
            return TypedResults.NoContent();
        }).RequireAuthorization(Policies.ConfirmedUser);

        group.MapDelete("/password", async Task<Results<NoContent, UnauthorizedHttpResult>> (HttpContext ctx, UserManager<AppUser> users,
            AuthService auth) =>
        {
            var user = await users.GetUserAsync(ctx.User);
            if (user is null) return TypedResults.Unauthorized();
            if (user.PasswordHash is not null)
            {
                await users.RemovePasswordAsync(user);
                await auth.SignInAsync(user, ctx.User.DeviceId());
                await auth.NotifyPasswordChangedAsync(user, removed: true);
            }
            return TypedResults.NoContent();
        }).RequireAuthorization(Policies.ConfirmedUser);

        group.MapPost("/logout", async (AuthService auth) =>
        {
            await auth.SignOutAsync();
            return TypedResults.NoContent();
        });

        // A guest acts on a list (§5). Unknown or unconfirmed emails are signed in right away;
        // a confirmed email must prove itself with a code, or anyone could act as that person.
        limited.MapPost("/identify", async Task<Ok<IdentifyResponse>> (IdentifyRequest req, HttpContext ctx, AuthService auth) =>
        {
            if (ctx.User.Identity?.IsAuthenticated == true) await auth.SignOutAsync();

            var user = await auth.FindOrCreateAsync(req.Email, req.DisplayName, req.Language);
            if (!await auth.MaySignInWithoutCodeAsync(user))
            {
                await auth.SendLoginCodeAsync(user, SafeReturnUrl(req.ReturnUrl));
                return TypedResults.Ok(new IdentifyResponse(IdentifyStatus.CodeSent, null));
            }

            await auth.SignInAsync(user);
            return TypedResults.Ok(new IdentifyResponse(IdentifyStatus.SignedIn, MeDto.From(user)));
        });

        // Same answer whether or not the email is known (§5.5).
        limited.MapPost("/request-code", async (RequestCodeRequest req, AuthService auth) =>
        {
            var user = await auth.FindOrCreateAsync(req.Email, null, req.Language);
            await auth.SendLoginCodeAsync(user, SafeReturnUrl(req.ReturnUrl));
            return TypedResults.Accepted((string?)null);
        });

        // One answer for every failure (unknown email, no password, wrong, locked out), so it reveals nothing about accounts.
        limited.MapPost("/login-password", async Task<Results<Ok<MeDto>, ProblemHttpResult>> (PasswordLoginRequest req, HttpContext ctx, AuthService auth) =>
        {
            var user = await auth.CheckPasswordAsync(req.Email, req.Password);
            if (user is null)
                return TypedResults.Problem("Email or password is wrong.", statusCode: StatusCodes.Status400BadRequest, type: "invalid-login");
            if (ctx.User.Identity?.IsAuthenticated == true) await auth.SignOutAsync();
            await auth.SignInAsync(user);
            return TypedResults.Ok(MeDto.From(user));
        });

        limited.MapPost("/verify-code", async Task<Results<Ok<MeDto>, ProblemHttpResult>> (VerifyCodeRequest req, AuthService auth) =>
        {
            var user = await auth.VerifyCodeAsync(req.Email, req.Code);
            if (user is null)
                return TypedResults.Problem("The code is wrong or expired.", statusCode: StatusCodes.Status400BadRequest, type: "invalid-code");
            await auth.ConfirmAsync(user);
            await auth.SignInAsync(user);
            return TypedResults.Ok(MeDto.From(user));
        });

        // The SPA's /confirm page posts the token from a mail link. A plain GET would be "clicked" by mail scanners.
        limited.MapPost("/confirm", async Task<Results<Ok<MeDto>, ProblemHttpResult>> (ConfirmRequest req, AuthService auth) =>
        {
            var user = await auth.RedeemTokenAsync(req.Token);
            if (user is null)
                return TypedResults.Problem("The link is invalid, expired or already used.", statusCode: StatusCodes.Status400BadRequest, type: "invalid-token");
            await auth.ConfirmAsync(user);
            await auth.SignInAsync(user);
            return TypedResults.Ok(MeDto.From(user));
        });
    }

    /// Only local paths, so a crafted link can't send people elsewhere after signing in.
    public static string SafeReturnUrl(string? url) =>
        url is { Length: > 0 } && url[0] == '/' && !url.StartsWith("//") && !url.StartsWith("/\\") ? url : "/";
}
