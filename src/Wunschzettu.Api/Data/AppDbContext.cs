using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Features.Notifications;

namespace Wunschzettu.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options, OutboxSignal? outboxSignal = null)
    : IdentityDbContext<AppUser>(options)
{
    public DbSet<Wishlist> Wishlists => Set<Wishlist>();
    public DbSet<ListMember> ListMembers => Set<ListMember>();
    public DbSet<Wish> Wishes => Set<Wish>();
    public DbSet<WishImage> WishImages => Set<WishImage>();
    public DbSet<Gift> Gifts => Set<Gift>();
    public DbSet<GiftParticipant> GiftParticipants => Set<GiftParticipant>();
    public DbSet<LoginCode> LoginCodes => Set<LoginCode>();
    public DbSet<ListInvite> ListInvites => Set<ListInvite>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<AppUser>(e =>
        {
            e.Property(x => x.DisplayName).HasMaxLength(100);
            e.Property(x => x.Language).HasMaxLength(10);
        });

        b.Entity<Wishlist>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.RecipientName).HasMaxLength(100);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.Property(x => x.ShareToken).HasMaxLength(64);
            e.HasIndex(x => x.ShareToken).IsUnique();
            e.Property(x => x.Access).HasConversion<string>();
            e.ComplexProperty(x => x.Theme, t =>
            {
                t.ToJson();
                t.Property(x => x.Palette).HasConversion<string>();
                t.Property(x => x.Layout).HasConversion<string>();
            });
        });

        b.Entity<ListInvite>(e =>
        {
            e.Property(x => x.Role).HasConversion<string>();
            e.Property(x => x.TokenHash).HasMaxLength(64);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.WishlistId);
            e.HasOne(x => x.Wishlist).WithMany().HasForeignKey(x => x.WishlistId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ListMember>(e =>
        {
            e.HasKey(x => new { x.WishlistId, x.UserId });
            e.HasIndex(x => x.UserId);
            e.Ignore(x => x.IsGuest);
        });

        b.Entity<Wish>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Gtin).HasMaxLength(14);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.State).HasConversion<string>();
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => new { x.WishlistId, x.SortOrder });
            e.HasMany(x => x.Links).WithOne().HasForeignKey(x => x.WishId);
            e.HasMany(x => x.Images).WithOne().HasForeignKey(x => x.WishId);
        });

        b.Entity<WishLink>(e =>
        {
            e.Property(x => x.Kind).HasConversion<string>();
            e.Property(x => x.Label).HasMaxLength(100);
            e.Property(x => x.Url).HasMaxLength(2000);
            e.Property(x => x.Note).HasMaxLength(500);
            e.Property(x => x.PreviewTitle).HasMaxLength(300);
            e.Property(x => x.PreviewSiteName).HasMaxLength(100);
            e.Property(x => x.PreviewImageKey).HasMaxLength(40);
            e.Property(x => x.PreviewLogoKey).HasMaxLength(40);
        });

        b.Entity<WishImage>(e =>
        {
            e.Property(x => x.FileKey).HasMaxLength(64);
            e.HasIndex(x => x.UploadedByUserId);
        });

        b.Entity<Gift>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>();
            e.HasOne(x => x.Wish).WithMany(x => x.Gifts).HasForeignKey(x => x.WishId);
        });

        b.Entity<GiftParticipant>(e =>
        {
            e.HasKey(x => new { x.GiftId, x.UserId });
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.ExpiresAt);
            e.Property(x => x.Message).HasMaxLength(500);
            e.Property(x => x.DeviceId).HasMaxLength(64);
            e.HasOne(x => x.Gift).WithMany(x => x.Participants).HasForeignKey(x => x.GiftId);
        });

        b.Entity<LoginCode>(e =>
        {
            e.Property(x => x.CodeHash).HasMaxLength(64);
            e.Property(x => x.TokenHash).HasMaxLength(64);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
            e.Property(x => x.Purpose).HasConversion<string>();
        });

        b.Entity<OutboxMessage>(e =>
        {
            e.HasIndex(x => new { x.SentAt, x.NextAttemptAt });
            e.HasIndex(x => new { x.ToUserId, x.CreatedAt });
            e.Property(x => x.Type).HasMaxLength(50);
        });
    }

    /// Another request changed the same wish (Version) or created the same row (unique key) first: retryable, not a bug.
    public static bool IsWriteConflict(Exception e) =>
        e is DbUpdateConcurrencyException or DbUpdateException { InnerException: Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 19 } };

    /// Makes the next save bump <see cref="Wish.Version"/> and fail if someone else changed the wish meanwhile.
    public void Touch(Wish wish) => Entry(wish).Property(x => x.Version).IsModified = true;

    /// For edits by managers and recipients: never blocked by a gift operation that ran meanwhile (§6 no-leak).
    /// On a Version conflict, take the database's Version and save again; the edit wins.
    public async Task<int> SaveChangesEditWinsAsync(CancellationToken ct = default)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException e) when (attempt < 3)
            {
                foreach (var entry in e.Entries)
                {
                    var current = await entry.GetDatabaseValuesAsync(ct);
                    if (current is null) throw; // deleted meanwhile
                    var version = entry.Metadata.FindProperty(nameof(Wish.Version));
                    if (version is null) throw;
                    entry.Property(nameof(Wish.Version)).OriginalValue = current[version];
                    entry.Property(nameof(Wish.Version)).CurrentValue = current[version];
                }
            }
        }
    }

    public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<Wish>())
            if (entry.State == EntityState.Modified)
                entry.Entity.Version++;
        var hasMail = ChangeTracker.Entries<OutboxMessage>().Any(e => e.State == EntityState.Added);

        var result = await base.SaveChangesAsync(ct);
        if (hasMail) outboxSignal?.Notify();
        return result;
    }
}
