using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Infrastructure.Mail;

namespace Wunschzettu.Api.Features.Notifications;

/// Wakes the sender right after mails were committed, so login codes arrive within seconds.
public class OutboxSignal
{
    readonly SemaphoreSlim _signal = new(0);

    public void Notify()
    {
        if (_signal.CurrentCount == 0) _signal.Release();
    }

    public Task WaitAsync(TimeSpan timeout, CancellationToken ct) => _signal.WaitAsync(timeout, ct);
}

public class OutboxOptions
{
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(30);
    public int MaxAttempts { get; set; } = 10;
}

/// Sends outbox mails with retries and backoff. A broken SMTP server never breaks an action (§7).
public class OutboxSender(IServiceScopeFactory scopes, OutboxSignal signal, IMailSender sender, TimeProvider clock,
    IOptions<OutboxOptions> options, ILogger<OutboxSender> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await SendDueAsync(ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogError(e, "Outbox run failed");
            }
            try
            {
                await signal.WaitAsync(options.Value.PollInterval, ct);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    public async Task SendDueAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var max = options.Value.MaxAttempts;

        while (true)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            var batch = await db.Outbox
                .Where(m => m.SentAt == null && m.NextAttemptAt <= now && m.Attempts < max)
                .OrderBy(m => m.NextAttemptAt)
                .Take(20)
                .ToListAsync(ct);
            if (batch.Count == 0) return;

            foreach (var m in batch)
            {
                try
                {
                    await sender.SendAsync(new MailMessage(m.ToEmail, m.Subject, m.HtmlBody, m.TextBody), ct);
                    m.SentAt = clock.GetUtcNow().UtcDateTime;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    m.Attempts++;
                    m.LastError = e.Message.Length > 500 ? e.Message[..500] : e.Message;
                    m.NextAttemptAt = now + TimeSpan.FromMinutes(Math.Min(Math.Pow(2, m.Attempts), 360));
                    logger.LogWarning(e, "Sending mail {Id} ({Type}) failed, attempt {Attempt}", m.Id, m.Type, m.Attempts);
                }
            }
            await db.SaveChangesAsync(ct);
        }
    }
}
