using Prescribe.Core.Runtime;

namespace Prescribe.Cli;

public sealed class LocalFileSystem : IFileSystem
{
    public bool Exists(string path) => File.Exists(path);

    public string ReadAllText(string path) => File.ReadAllText(path);

    public void WriteAllText(string path, string content) => File.WriteAllText(path, content);

    public void AppendAllText(string path, string content) => File.AppendAllText(path, content);

    public byte[] ReadAllBytes(string path) => File.ReadAllBytes(path);

    public void WriteAllBytes(string path, byte[] bytes) => File.WriteAllBytes(path, bytes);
}
