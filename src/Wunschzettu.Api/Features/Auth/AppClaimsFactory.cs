using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Auth;

/// Adds the email_confirmed claim the ConfirmedUser policy checks (§5).
public class AppClaimsFactory(UserManager<AppUser> users, IOptions<IdentityOptions> options)
    : UserClaimsPrincipalFactory<AppUser>(users, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(AppUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        identity.AddClaim(new Claim(ClaimsExtensions.EmailConfirmed, user.EmailConfirmed ? "true" : "false"));
        return identity;
    }
}
