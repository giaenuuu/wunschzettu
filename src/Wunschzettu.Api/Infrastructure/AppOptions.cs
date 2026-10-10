namespace Wunschzettu.Api.Infrastructure;

/// The "App" configuration section.
public class AppOptions
{
    /// Public URL used in mails, e.g. https://wunsch.example.home
    public string BaseUrl { get; set; } = "http://localhost:4200";
    public string DataDir { get; set; } = ".data";
    public int MaxListsPerUser { get; set; } = 20;
    public int StorageQuotaMb { get; set; } = 200;
    /// Requests per minute and IP for the login endpoints.
    public int AuthRequestsPerMinute { get; set; } = 10;
    /// Sign-in and invitation mails per day, all addresses together.
    public int MaxLoginMailsPerDay { get; set; } = 500;
    /// Mail sending and scheduled jobs. Integration tests switch them off and run them by hand.
    public bool RunBackgroundServices { get; set; } = true;

    public string ImagesDir => Path.Combine(Path.GetFullPath(DataDir), "images");

    public string Url(string path) => BaseUrl.TrimEnd('/') + path;
}
