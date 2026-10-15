using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Auth;

/// Email-only identity (§5): users, one-time codes and links, confirmation, sign-in.
public class AuthService(AppDbContext db, UserManager<AppUser> users, SignInManager<AppUser> signIn, Mailer mailer, TimeProvider clock,
    IOptions<AppOptions> options, LoginThrottle throttle)
{
    public static readonly TimeSpan LoginCodeValidity = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan InviteValidity = TimeSpan.FromDays(7);
    public static readonly TimeSpan GuestSessionValidity = TimeSpan.FromDays(7);
    const int MaxCodesPerHour = 5;
    const int MaxCodesPerDay = 12;
    /// Wrong guesses a code survives. Links keep working; only typing the code is blocked.
    const int MaxCodeFailures = 5;

    DateTime Now => clock.GetUtcNow().UtcDateTime;

    public static string NormalizeLanguage(string? language) => Languages.Normalize(language);

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
    /// Gift confirmations don't count here; they have their own limit (GiftService).
    /// The global cap keeps someone cycling through addresses from getting the SMTP account blocked.
    public async Task<bool> MayIssueCodeAsync(AppUser user)
    {
        var hour = Now.AddHours(-1);
        var day = Now.AddDays(-1);
        var sent = db.LoginCodes.Where(c => c.Purpose != LoginCodePurpose.Confirm && c.CreatedAt > day);
        var recent = await sent.Where(c => c.UserId == user.Id).Select(c => c.CreatedAt).ToListAsync();
        return recent.Count(t => t > hour) < MaxCodesPerHour && recent.Count < MaxCodesPerDay
            && await sent.CountAsync() < options.Value.MaxLoginMailsPerDay;
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

    /// Checks a typed-in code. No account lockout (anyone could trigger it): each code survives 5 wrong guesses
    /// and only 12 codes a day are sent, so guessing stays hopeless. The link in the mail always works.
    public async Task<AppUser?> VerifyCodeAsync(string email, string code, bool forDeletion = false)
    {
        var user = await users.FindByEmailAsync(email.Trim());
        if (user is null) return null;

        var now = Now;
        var hash = HashCode(user, code.Trim());
        var match = await db.LoginCodes.FirstOrDefaultAsync(c =>
            c.UserId == user.Id && c.CodeHash == hash && c.UsedAt == null && c.ExpiresAt > now && c.FailedAttempts < MaxCodeFailures
            && (c.Purpose == LoginCodePurpose.DeleteAccount) == forDeletion);
        if (match is null)
        {
            // Every wrong guess counts against all live codes, so each code can be guessed at most 5 times.
            await db.LoginCodes.Where(c => c.UserId == user.Id && c.UsedAt == null && c.ExpiresAt > now)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.FailedAttempts, c => c.FailedAttempts + 1));
            return null;
        }

        match.UsedAt = now;
        await db.SaveChangesAsync();
        return user;
    }

    /// A code that only deletes the account (§5.10). Its mail has no button: a link must never delete anything.
    public async Task<bool> SendDeletionCodeAsync(AppUser user)
    {
        if (!await MayIssueCodeAsync(user)) return false;
        var (code, _) = IssueCode(user, LoginCodePurpose.DeleteAccount, Now + LoginCodeValidity);
        mailer.Enqueue(user, Mails.DeletionCode(user, code, (int)LoginCodeValidity.TotalMinutes));
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<AppUser?> RedeemTokenAsync(string token)
    {
        var now = Now;
        var hash = Secrets.Hash(token);
        var match = await db.LoginCodes.Include(c => c.User)
            .FirstOrDefaultAsync(c => c.TokenHash == hash && c.UsedAt == null && c.ExpiresAt > now && c.Purpose != LoginCodePurpose.DeleteAccount);
        if (match is null) return null;

        match.UsedAt = now;
        await db.SaveChangesAsync();
        return match.User;
    }

    /// Proven access to the mailbox: confirm the address and keep everything done unconfirmed (§5.1).
    /// Anyone could have typed the email before, so the first confirmation ends all other sessions:
    /// only the device that proved the mailbox becomes confirmed. The caller signs it in again.
    public async Task ConfirmAsync(AppUser user)
    {
        if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await users.UpdateSecurityStampAsync(user); // also saves
        }
        await db.GiftParticipants.Where(p => p.UserId == user.Id && p.ExpiresAt != null)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ExpiresAt, (DateTime?)null));
    }

    /// A new device id per sign-in, unless an existing session is renewed (e.g. after a password change bumped the security stamp).
    /// Unconfirmed guests only get temporary access: 7 days without use (the time their reservations wait
    /// for confirmation). A confirmed session lasts 90 days, sliding.
    public Task SignInAsync(AppUser user, string? deviceId = null)
    {
        var properties = new AuthenticationProperties { IsPersistent = true };
        if (!user.EmailConfirmed)
        {
            properties.ExpiresUtc = Now + GuestSessionValidity;
        }
        return signIn.SignInWithClaimsAsync(user, properties, [new Claim(ClaimsExtensions.Device, deviceId ?? Secrets.Token())]);
    }

    /// The optional password (§5.9), throttled per account and IP (LoginThrottle).
    /// Unknown accounts take as long as known ones, so the timing doesn't tell which emails have a password.
    public async Task<AppUser?> CheckPasswordAsync(string email, string password, string? ip)
    {
        if (throttle.IsBlocked(email, ip)) return null;
        var user = await users.FindByEmailAsync(email.Trim());
        bool valid;
        if (user is { EmailConfirmed: true, PasswordHash: not null })
            valid = await users.CheckPasswordAsync(user, password);
        else
        {
            users.PasswordHasher.VerifyHashedPassword(new AppUser(), DummyHash.Value, password);
            valid = false;
        }
        if (!valid)
        {
            throttle.Failed(email, ip);
            return null;
        }
        throttle.Succeeded(email, ip);
        return user;
    }

    static readonly Lazy<string> DummyHash = new(() => new PasswordHasher<AppUser>().HashPassword(new AppUser(), Secrets.Token()));

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

    /// Tells the owner, so a password set from a stolen session doesn't go unnoticed.
    public async Task NotifyPasswordChangedAsync(AppUser user, bool removed)
    {
        mailer.Enqueue(user, Mails.PasswordChanged(user, removed, mailer.Url("/profile")));
        await db.SaveChangesAsync();
    }

    public Task SignOutAsync() => signIn.SignOutAsync();

    static string HashCode(AppUser user, string code) => Secrets.Hash($"{user.Id}:{code}");
}
