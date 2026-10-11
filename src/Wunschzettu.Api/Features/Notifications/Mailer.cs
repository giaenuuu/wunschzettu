using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Notifications;

/// Content of one mail, independent of HTML or text rendering.
public record MailContent(
    string Type,
    string Subject,
    string Heading,
    IReadOnlyList<string> Paragraphs,
    string? Code = null,
    MailButton? Button = null,
    string? Footer = null);

public record MailButton(string Label, string Url);

/// Adds mails to the outbox. They are sent once the caller's SaveChanges commits (§7).
public class Mailer(AppDbContext db, TimeProvider clock, IOptions<AppOptions> options)
{
    public string Url(string path) => options.Value.Url(path);

    public void Enqueue(AppUser to, MailContent mail)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        db.Outbox.Add(new OutboxMessage
        {
            ToEmail = to.Email!,
            ToUserId = to.Id,
            Type = mail.Type,
            Subject = mail.Subject,
            HtmlBody = RenderHtml(mail, Url("/datenschutz")),
            TextBody = RenderText(mail, Url("/datenschutz")),
            CreatedAt = now,
            NextAttemptAt = now,
        });
    }

    static string E(string s) => WebUtility.HtmlEncode(s);

    static string RenderText(MailContent m, string privacyUrl)
    {
        var sb = new StringBuilder();
        sb.AppendLine(m.Heading).AppendLine();
        foreach (var p in m.Paragraphs) sb.AppendLine(p).AppendLine();
        if (m.Code is not null) sb.AppendLine(m.Code).AppendLine();
        if (m.Button is not null) sb.AppendLine($"{m.Button.Label}: {m.Button.Url}").AppendLine();
        sb.AppendLine("--");
        if (m.Footer is not null) sb.AppendLine(m.Footer);
        sb.AppendLine($"Wunschzettu · {privacyUrl}");
        return sb.ToString();
    }

    static string RenderHtml(MailContent m, string privacyUrl)
    {
        var paragraphs = string.Concat(m.Paragraphs.Select(p =>
            $"""<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1d1b20">{E(p)}</p>"""));
        var code = m.Code is null ? "" : $"""
            <p style="margin:8px 0 24px;text-align:center">
              <span style="display:inline-block;padding:12px 20px;border-radius:12px;background:#fbeef2;font:600 28px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px;color:#1d1b20">{E(m.Code)}</span>
            </p>
            """;
        var button = m.Button is null ? "" : $"""
            <p style="margin:8px 0 24px;text-align:center">
              <a href="{E(m.Button.Url)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#b4235a;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none">{E(m.Button.Label)}</a>
            </p>
            """;
        var footer = m.Footer is null ? "" : $"""<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b6876">{E(m.Footer)}</p>""";

        return $"""
            <!doctype html>
            <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(m.Subject)}</title></head>
            <body style="margin:0;padding:24px 12px;background:#f8f2f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:20px;padding:32px 28px">
                  <tr><td>
                    <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#b4235a">🎁 Wunschzettu</p>
                    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1d1b20">{E(m.Heading)}</h1>
                    {paragraphs}{code}{button}{footer}
                  </td></tr>
                </table>
                <p style="margin:16px 0 0;font-size:12px;color:#6b6876"><a href="{E(privacyUrl)}" style="color:#6b6876">Datenschutz · Privacy</a></p>
              </td></tr></table>
            </body></html>
            """;
    }
}
