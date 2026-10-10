using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Auth;

/// Email-only identity (§5): users, one-time codes and links, confirmation, sign-in.
public class AuthService(AppDbContext db, UserManager<AppUser> users, SignInManager<AppUser> signIn, Mailer mailer, TimeProvider clock)
{
    public static readonly TimeSpan LoginCodeValidity = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan InviteValidity = TimeSpan.FromDays(7);
    const int MaxCodesPerHour = 5;
    const int MaxCodesPerDay = 12;
    /// Wrong guesses a code survives. Links keep working; only typing the code is blocked.
    const int MaxCodeFailures = 5;

    DateTime Now => clock.GetUtcNow().UtcDateTime;

    public static string NormalizeLanguage(string? language) => language == "en" ? "en" : "de-CH";

    public async Task<AppUser> FindOrCreateAsync(string email, string? displayName, string? language)
    {
        email = email.Trim();
        var user = await users.FindByEmailAsync(email);
        if (user is not null)
        {
            // Only fill in a missing name; anyone can type an email, so they must not rename someone else.
            if (string.IsNullOrWhiteSpace(user.DisplayName) && !string.IsNullOrWhiteSpace(displayName))
            {
                user.DisplayName = displayName.Trim();
                await users.UpdateAsync(user);
            }
            return user;
        }

        user = new AppUser
        {
            UserName = email,
            Email = email,
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? "" : displayName.Trim(),
            Language = NormalizeLanguage(language),
            CreatedAt = Now,
        };
        var result = await users.CreateAsync(user);
        if (!result.Succeeded)
            throw new InvalidOperationException("Creating user failed: " + string.Join("; ", result.Errors.Select(e => e.Description)));
        return user;
    }

    /// Limits mails per address, so nobody can flood someone's inbox through us (§5.5).
    /// The daily cap also bounds how many codes an attacker can guess against.
    public async Task<bool> MayIssueCodeAsync(AppUser user)
    {
        var hour = Now.AddHours(-1);
        var day = Now.AddDays(-1);
        var recent = await db.LoginCodes.Where(c => c.UserId == user.Id && c.CreatedAt > day).Select(c => c.CreatedAt).ToListAsync();
        return recent.Count(t => t > hour) < MaxCodesPerHour && recent.Count < MaxCodesPerDay;
    }

    /// Signing in by just typing an email is only for people whose account holds nothing but their own gifts.
    /// Anyone invited (manager, recipient, invite-only guest) must prove the mailbox, even before confirming once.
    public async Task<bool> MaySignInWithoutCodeAsync(AppUser user) =>
        !user.EmailConfirmed && !await db.ListMembers.AnyAsync(m => m.UserId == user.Id && (m.IsManager || m.IsRecipient || m.Invited));

    /// Creates a code + link token. Not saved until the caller saves.
    public (string Code, string Token) IssueCode(AppUser user, LoginCodePurpose purpose, DateTime expiresAt)
    {
        var code = Secrets.Code();
        var token = Secrets.Token();
        db.LoginCodes.Add(new LoginCode
        {
            UserId = user.Id,
            CodeHash = HashCode(user, code),
            TokenHash = Secrets.Hash(token),
            Purpose = purpose,
            CreatedAt = Now,
            ExpiresAt = expiresAt,
        });
        return (code, token);
    }

    public string ConfirmLink(string token, string returnUrl) =>
        mailer.Url($"/confirm?token={Uri.EscapeDataString(token)}&returnUrl={Uri.EscapeDataString(returnUrl)}");

    public async Task SendLoginCodeAsync(AppUser user, string returnUrl)
    {
        if (!await MayIssueCodeAsync(user)) return;
        var (code, token) = IssueCode(user, LoginCodePurpose.Login, Now + LoginCodeValidity);
        mailer.Enqueue(user, Mails.LoginCode(user, code, ConfirmLink(token, returnUrl), (int)LoginCodeValidity.TotalMinutes));
        await db.SaveChangesAsync();
    }

    /// Checks a typed-in code. Wrong codes count towards Identity's lockout (5 attempts).
    public async Task<AppUser?> VerifyCodeAsync(string email, string code)
    {
        var user = await users.FindByEmailAsync(email.Trim());
        if (user is null || await users.IsLockedOutAsync(user)) return null;

        var now = Now;
        var hash = HashCode(user, code.Trim());
        var match = await db.LoginCodes.FirstOrDefaultAsync(c =>
            c.UserId == user.Id && c.CodeHash == hash && c.UsedAt == null && c.ExpiresAt > now && c.FailedAttempts < MaxCodeFailures);
        if (match is null)
        {
            // Every wrong guess counts against all live codes, so each code can be guessed at most 5 times.
            await db.LoginCodes.Where(c => c.UserId == user.Id && c.UsedAt == null && c.ExpiresAt > now)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.FailedAttempts, c => c.FailedAttempts + 1));
            await users.AccessFailedAsync(user);
            return null;
        }

        match.UsedAt = now;
        await db.SaveChangesAsync();
        await users.ResetAccessFailedCountAsync(user);
        return user;
    }

    public async Task<AppUser?> RedeemTokenAsync(string token)
    {
        var now = Now;
        var hash = Secrets.Hash(token);
        var match = await db.LoginCodes.Include(c => c.User)
            .FirstOrDefaultAsync(c => c.TokenHash == hash && c.UsedAt == null && c.ExpiresAt > now);
        if (match is null) return null;

        match.UsedAt = now;
        await db.SaveChangesAsync();
        return match.User;
    }

    /// Proven access to the mailbox: confirm the address and keep everything done unconfirmed (§5.1).
    public async Task ConfirmAsync(AppUser user)
    {
        if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await users.UpdateAsync(user);
        }
        await db.GiftParticipants.Where(p => p.UserId == user.Id && p.ExpiresAt != null)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ExpiresAt, (DateTime?)null));
    }

    /// A new device id per sign-in, unless an existing session is renewed (e.g. after a password change bumped the security stamp).
    public Task SignInAsync(AppUser user, string? deviceId = null) =>
        signIn.SignInWithClaimsAsync(user, isPersistent: true, [new Claim(ClaimsExtensions.Device, deviceId ?? Secrets.Token())]);

    /// The optional password (§5.9). Wrong passwords count towards the same lockout as wrong codes.
    public async Task<AppUser?> CheckPasswordAsync(string email, string password)
    {
        var user = await users.FindByEmailAsync(email.Trim());
        if (user is null || !user.EmailConfirmed || user.PasswordHash is null) return null;
        var result = await signIn.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        return result.Succeeded ? user : null;
    }

    /// Sets or replaces the password; validated first, so a rejected password leaves the old one in place.
    public async Task<IdentityResult> SetPasswordAsync(AppUser user, string password)
    {
        foreach (var validator in users.PasswordValidators)
        {
            var check = await validator.ValidateAsync(users, user, password);
            if (!check.Succeeded) return check;
        }
        if (user.PasswordHash is not null)
        {
            var removed = await users.RemovePasswordAsync(user);
            if (!removed.Succeeded) return removed;
        }
        return await users.AddPasswordAsync(user, password);
    }

    public Task SignOutAsync() => signIn.SignOutAsync();

    static string HashCode(AppUser user, string code) => Secrets.Hash($"{user.Id}:{code}");
}
