using Microsoft.AspNetCore.Identity;

namespace Wunschzettu.Api.Data;

public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
    public string Language { get; set; } = "de-CH";
    public DateTime CreatedAt { get; set; }
}
