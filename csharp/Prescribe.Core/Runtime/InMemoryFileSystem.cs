using System.Collections.Concurrent;

namespace Prescribe.Core.Runtime;

public sealed class InMemoryFileSystem : IFileSystem
{
    private readonly ConcurrentDictionary<string, byte[]> _files = new(StringComparer.Ordinal);

    public bool Exists(string path) => _files.ContainsKey(path);

    public string ReadAllText(string path)
    {
        if (!_files.TryGetValue(path, out var bytes)) return "";
        return System.Text.Encoding.UTF8.GetString(bytes);
    }

    public void WriteAllText(string path, string content)
    {
        _files[path] = System.Text.Encoding.UTF8.GetBytes(content);
    }

    public void AppendAllText(string path, string content)
    {
        var appendBytes = System.Text.Encoding.UTF8.GetBytes(content);
        _files.AddOrUpdate(
            path,
            appendBytes,
            (_, existing) =>
            {
                var merged = new byte[existing.Length + appendBytes.Length];
                Buffer.BlockCopy(existing, 0, merged, 0, existing.Length);
                Buffer.BlockCopy(appendBytes, 0, merged, existing.Length, appendBytes.Length);
                return merged;
            });
    }

    public byte[] ReadAllBytes(string path)
    {
        if (!_files.TryGetValue(path, out var bytes)) return Array.Empty<byte>();
        return bytes;
    }

    public void WriteAllBytes(string path, byte[] bytes)
    {
        _files[path] = bytes.ToArray();
    }
}
