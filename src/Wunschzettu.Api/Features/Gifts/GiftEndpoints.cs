using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Wunschzettu.Api.Data;

namespace Wunschzettu.Api.Features.Gifts;

/// The caller's own participation in a gift: change, withdraw, mark as bought.
public static class GiftEndpoints
{
    public static void MapGiftEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/gifts/{giftId:guid}").WithTags("Gifts").RequireAuthorization();

        group.MapPut("/participants/me", (Guid giftId, ParticipateRequest req, ClaimsPrincipal user, UserManager<AppUser> users,
            GiftService gifts, CancellationToken ct) => Run(user, users, actor => gifts.UpdateMineAsync(giftId, actor, req, ct)));
        group.MapDelete("/participants/me", (Guid giftId, ClaimsPrincipal user, UserManager<AppUser> users,
            GiftService gifts, CancellationToken ct) => Run(user, users, actor => gifts.LeaveAsync(giftId, actor, ct)));
        group.MapPost("/bought", (Guid giftId, ClaimsPrincipal user, UserManager<AppUser> users,
            GiftService gifts, CancellationToken ct) => Run(user, users, actor => gifts.SetBoughtAsync(giftId, actor, true, ct)));
        group.MapDelete("/bought", (Guid giftId, ClaimsPrincipal user, UserManager<AppUser> users,
            GiftService gifts, CancellationToken ct) => Run(user, users, actor => gifts.SetBoughtAsync(giftId, actor, false, ct)));
    }

    static async Task<Results<NoContent, ProblemHttpResult>> Run(ClaimsPrincipal user, UserManager<AppUser> users,
        Func<Actor, Task<GiftError?>> action)
    {
        var actor = await SharedEndpoints.ActorAsync(user, users);
        var error = actor is null ? GiftError.NotFound : await action(actor);
        return error is null ? TypedResults.NoContent() : SharedEndpoints.Problem(error);
    }
}
