using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Wunschzettu.Api.Infrastructure.Mail;

public record MailMessage(string To, string Subject, string HtmlBody, string TextBody);

public interface IMailSender
{
    Task SendAsync(MailMessage mail, CancellationToken ct);
}

/// The "Smtp" configuration section. Without a Host, mails are only logged.
public class SmtpOptions
{
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string From { get; set; } = "Wunschzettu <noreply@localhost>";
    /// Auto: implicit TLS on port 465, otherwise STARTTLS is required. None only for local test servers like Mailpit.
    public SmtpSecurity Security { get; set; } = SmtpSecurity.Auto;
}

public enum SmtpSecurity { Auto, StartTls, SslOnConnect, None }

public class SmtpMailSender(IOptions<SmtpOptions> options) : IMailSender
{
    public async Task SendAsync(MailMessage mail, CancellationToken ct)
    {
        var o = options.Value;
        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(o.From));
        message.To.Add(MailboxAddress.Parse(mail.To));
        message.Subject = mail.Subject;
        message.Body = new BodyBuilder { HtmlBody = mail.HtmlBody, TextBody = mail.TextBody }.ToMessageBody();

        using var client = new SmtpClient();
        // Never silently plain text: someone on the way could strip STARTTLS and read the password and login codes.
        var security = o.Security switch
        {
            SmtpSecurity.None => SecureSocketOptions.None,
            SmtpSecurity.SslOnConnect => SecureSocketOptions.SslOnConnect,
            SmtpSecurity.StartTls => SecureSocketOptions.StartTls,
            _ => o.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls,
        };
        await client.ConnectAsync(o.Host ?? throw new InvalidOperationException("Smtp:Host is not set."), o.Port, security, ct);
        if (!string.IsNullOrEmpty(o.User))
            await client.AuthenticateAsync(o.User, o.Password ?? "", ct);
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(quit: true, ct);
    }
}

public class LogMailSender(ILogger<LogMailSender> logger) : IMailSender
{
    public Task SendAsync(MailMessage mail, CancellationToken ct)
    {
        logger.LogWarning("No SMTP host configured. Mail to {To}: {Subject}\n{Body}", mail.To, mail.Subject, mail.TextBody);
        return Task.CompletedTask;
    }
}
