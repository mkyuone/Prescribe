using Prescribe.Core.Runner;
using Prescribe.Core.Runtime;

namespace Prescribe.Cli;

public static class Program
{
    public static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: prescribe <file.prsd>");
            return 1;
        }
        var filePath = args[0];
        if (Path.GetExtension(filePath).ToLowerInvariant() != ".prsd")
        {
            Console.Error.WriteLine("Only .prsd files are supported.");
            return 1;
        }

        var text = File.ReadAllText(filePath);
        var input = Console.In.ReadToEnd();

        var runnerResult = PrescribeRunner.Run(
            text,
            input,
            new LocalFileSystem()
        );

        if (!string.IsNullOrWhiteSpace(runnerResult.Output))
        {
            Console.Out.Write(runnerResult.Output);
        }
        if (!runnerResult.Success)
        {
            Console.Error.WriteLine(runnerResult.Error);
            return 1;
        }
        return 0;
    }
}
