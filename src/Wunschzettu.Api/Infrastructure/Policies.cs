using Microsoft.AspNetCore.Authorization;

namespace Wunschzettu.Api.Infrastructure;

public static class Policies
{
    public const string ConfirmedUser = nameof(ConfirmedUser);

    public static AuthorizationBuilder AddAppPolicies(this AuthorizationBuilder auth) => auth
        .AddPolicy(ConfirmedUser, p => p.RequireAuthenticatedUser().RequireClaim(ClaimsExtensions.EmailConfirmed, "true"));
}
