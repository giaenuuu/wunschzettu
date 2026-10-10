using System.Net;
using System.Net.Sockets;

namespace Wunschzettu.Api.Features.Scraping;

/// The server fetches URLs that users type in (§9 SSRF). Only public addresses on ports 80/443 are reachable:
/// DNS is resolved here and the connection goes to the vetted address, so a name can't re-resolve to something internal.
public static class SafeHttp
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(8);

    public static SocketsHttpHandler CreateHandler() => new()
    {
        AllowAutoRedirect = true,
        MaxAutomaticRedirections = 5,
        AutomaticDecompression = DecompressionMethods.All,
        ConnectTimeout = TimeSpan.FromSeconds(5),
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        UseCookies = false,
        UseProxy = false,
        ConnectCallback = ConnectAsync,
    };

    /// Absolute http(s) URL on a default port whose host isn't a blocked IP literal. DNS names are checked when connecting.
    public static bool IsAllowedUrl(string? url, out Uri uri)
    {
        uri = null!;
        if (!Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var parsed)) return false;
        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps) return false;
        if (parsed.Port is not (80 or 443) || !string.IsNullOrEmpty(parsed.UserInfo)) return false;
        if (parsed.HostNameType is UriHostNameType.IPv4 or UriHostNameType.IPv6
            && IPAddress.TryParse(parsed.DnsSafeHost, out var ip) && IsBlocked(ip)) return false;
        if (parsed.DnsSafeHost.Equals("localhost", StringComparison.OrdinalIgnoreCase)) return false;
        uri = parsed;
        return true;
    }

    static async ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var endpoint = context.DnsEndPoint;
        if (endpoint.Port is not (80 or 443)) throw new BlockedAddressException();

        var addresses = IPAddress.TryParse(endpoint.Host, out var literal)
            ? [literal]
            : await Dns.GetHostAddressesAsync(endpoint.Host, ct);
        // All of them must be public: otherwise a name with one public and one internal address could still get through.
        if (addresses.Length == 0 || addresses.Any(IsBlocked)) throw new BlockedAddressException();

        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(addresses, endpoint.Port, ct);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    public static bool IsBlocked(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            return b[0] switch
            {
                0 or 10 or 127 => true,                          // "this" network, private, loopback
                100 => b[1] is >= 64 and <= 127,                 // carrier-grade NAT
                169 => b[1] == 254,                              // link-local, cloud metadata
                172 => b[1] is >= 16 and <= 31,                  // private
                192 => (b[1] == 168) || (b[1] == 0 && b[2] is 0 or 2), // private, IETF, TEST-NET-1
                198 => b[1] is 18 or 19,                         // benchmarking
                >= 224 => true,                                  // multicast, reserved, broadcast
                _ => false,
            };
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.Equals(IPAddress.IPv6None) || ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;
            var b = ip.GetAddressBytes();
            if ((b[0] & 0xfe) == 0xfc) return true;              // unique local fc00::/7
            if (ip.IsIPv4MappedToIPv6) return IsBlocked(ip.MapToIPv4());
            // NAT64 / 6to4 can tunnel to internal IPv4 addresses.
            if (b[0] == 0x20 && b[1] == 0x02) return IsBlocked(new IPAddress(b[2..6]));
            if (b[..12].SequenceEqual(new byte[] { 0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0 })) return IsBlocked(new IPAddress(b[12..16]));
            return false;
        }

        return true;
    }
}

public class BlockedAddressException() : Exception("The address is not publicly reachable.");
