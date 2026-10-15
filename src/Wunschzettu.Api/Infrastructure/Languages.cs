namespace Wunschzettu.Api.Infrastructure;

/// The languages of the interface and of mails (§10). German is written in Swiss spelling; de-DE and de-AT only adapt
/// the spelling (ß) and a few words, pt-PT only the vocabulary of pt-BR. The frontend has the same list (core/language.ts).
public static class Languages
{
    public const string Default = "de-CH";

    public static readonly string[] All = ["de-CH", "de-DE", "de-AT", "en", "fr", "es", "pt-BR", "pt-PT"];

    /// Anything else (an old value, a browser tag like "de" or "en-GB") becomes the closest language we have.
    public static string Normalize(string? language)
    {
        if (string.IsNullOrWhiteSpace(language)) return Default;
        var exact = All.FirstOrDefault(l => l.Equals(language.Trim(), StringComparison.OrdinalIgnoreCase));
        if (exact is not null) return exact;
        var tag = language.Trim().ToLowerInvariant();
        return tag switch
        {
            _ when tag.StartsWith("en") => "en",
            _ when tag.StartsWith("fr") => "fr",
            _ when tag.StartsWith("es") => "es",
            _ when tag.StartsWith("pt") => "pt-BR",
            _ => Default,
        };
    }

    /// "de", "en", "fr", "es" or "pt": the language without its region.
    public static string Family(string language) => Normalize(language)[..2];
}
