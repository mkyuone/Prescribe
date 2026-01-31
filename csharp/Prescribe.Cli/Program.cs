using Prescribe.Core.Diagnostics;
using Prescribe.Core.Frontend;
using Prescribe.Core.Semantics;
using Prescribe.Core.Runtime;
using Prescribe.Core.Source;

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
        var blocks = Prsd.ExtractPrescribeBlocks(text).Select(b => b.Code).ToList();
        var input = Console.In.ReadToEnd();

        try
        {
            foreach (var code in blocks)
            {
                var lexer = new Lexer(code);
                var parser = new Parser(lexer);
                var program = parser.ParseProgram();
                var checker = new TypeChecker();
                var sema = checker.Check(program);
                var interpreter = new Interpreter(program, sema, input, new LocalFileSystem());
                var output = interpreter.Run();
                Console.Out.Write(output);
            }
            return 0;
        }
        catch (PrescribeError err)
        {
            Console.Error.WriteLine(ErrorReporter.Format(err));
            return 1;
        }
    }
}
